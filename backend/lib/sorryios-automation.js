/**
 * Sorryios AI 自动化处理脚本
 * 功能：批量将文本片段发送到sorryios.ai进行AI分析
 * 
 * 使用方法：
 *   node sorryios-automation.js --input "输入文件.json" --output "输出文件.json"
 *   或者通过stdin传入JSON数据
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ============== 配置区域 ==============
const CONFIG = {
    // 登录信息
    username: 'zzj382037951',
    password: 'zzj12345',  // 请填入实际密码
    
    // URL
    loginUrl: 'https://sorryios.ai/pastel/#/login',
    carlistUrl: 'https://sorryios.ai/pastel/#/carlist',
    
    // 超时设置（毫秒）
    loginTimeout: 60000,
    responseTimeout: 120000,  // AI响应可能比较慢
    
    // 【新增】无活动超时 - 如果200秒内页面没有任何活动，判定为卡死
    inactivityTimeout: 200000,  // 200秒
    // 【新增】最大等待时间 - 即使有活动，最多等30分钟
    maxResponseWaitTime: 1800000,  // 30分钟
    
    // 重试设置
    maxRetries: 3,
    retryDelay: 5000,
    
    // 请求间隔（避免触发限制）- AI回复完成后额外等待时间
    requestInterval: 15000,  // 15秒
    
    // 浏览器设置
    headless: false,  // 生产环境设为true，调试时设为false
    
    // 登录状态保存路径
    storageStatePath: './sorryios-auth.json',
};

// ============== 工具函数 ==============

/**
 * 延时函数
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带重试的执行函数
 */
async function withRetry(fn, maxRetries = CONFIG.maxRetries, delay = CONFIG.retryDelay) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            console.log(`[重试] 第${i + 1}次失败: ${error.message}`);
            if (i < maxRetries - 1) {
                await sleep(delay);
            }
        }
    }
    throw lastError;
}

/**
 * 日志函数
 */
function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${type}] ${message}`);
}

// ============== 核心类 ==============

class SorryiosAutomation {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.isLoggedIn = false;
    }

    /**
     * 初始化浏览器
     */
    async init() {
        log('启动浏览器...');
        this.browser = await chromium.launch({
            headless: CONFIG.headless,
        });

        // 尝试加载已保存的登录状态
        let storageState = undefined;
        if (fs.existsSync(CONFIG.storageStatePath)) {
            log('发现已保存的登录状态，尝试复用...');
            storageState = CONFIG.storageStatePath;
        }

        this.context = await this.browser.newContext({
            storageState: storageState,
            viewport: { width: 1280, height: 800 },
        });
        this.page = await this.context.newPage();
    }

    /**
     * 登录sorryios.ai
     */
    async login() {
        log('检查登录状态...');
        
        // 先访问carlist页面
        await this.page.goto(CONFIG.carlistUrl, { waitUntil: 'networkidle' });
        await sleep(2000);
        
        // 检查右上角是否有"立即登录"按钮（说明未登录）
        const loginBtn = await this.page.$('button:has-text("立即登录"), a:has-text("立即登录"), :text("立即登录")');
        
        if (loginBtn) {
            log('检测到"立即登录"按钮，需要登录...');
            
            // 点击"立即登录"按钮，打开登录弹窗
            await loginBtn.click();
            await sleep(1500);
            
            // 等待登录弹窗出现
            await this.page.waitForSelector('input[placeholder*="用户名"], input[placeholder*="邮箱"]', {
                timeout: CONFIG.loginTimeout
            });
            
            // 填写账号（用户名/邮箱输入框）
            await this.page.fill('input[placeholder*="用户名"], input[placeholder*="邮箱"]', CONFIG.username);
            
            // 填写密码
            await this.page.fill('input[placeholder*="密码"]', CONFIG.password);
            
            // 点击"用户登录"按钮
            await this.page.click('button:has-text("用户登录")');
            
            // 等待登录完成
            await sleep(3000);
            
            // 刷新页面确认登录状态
            await this.page.reload({ waitUntil: 'networkidle' });
            await sleep(2000);
            
            // 验证登录成功
            const stillNeedLogin = await this.page.$('button:has-text("立即登录"), a:has-text("立即登录")');
            if (stillNeedLogin) {
                throw new Error('登录失败，请检查账号密码');
            }
            
            log('登录成功！');
            
            // 保存登录状态
            await this.context.storageState({ path: CONFIG.storageStatePath });
            log('登录状态已保存');
        } else {
            log('已处于登录状态（检测到用户头像/有效期）');
        }
        
        this.isLoggedIn = true;
    }

    /**
     * 选择一个空闲账号并进入AI界面
     */
    async selectIdleAccount() {
        log('查找空闲账号...');
        
        // 确保在carlist页面
        if (!this.page.url().includes('carlist')) {
            await this.page.goto(CONFIG.carlistUrl, { waitUntil: 'networkidle' });
        }
        
        await sleep(2000);
        
        // 查找所有账号名元素（格式：TMJ数字-数字）
        const accountNames = await this.page.$$eval('*', (elements) => {
            const names = [];
            for (const el of elements) {
                const text = (el.textContent || '').trim();
                // 精确匹配账号名（整个文本就是账号名）
                if (/^TMJ\d+-\d+$/.test(text)) {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 && rect.y > 200 && rect.y < 800) {
                        // 只取可见区域内的（y > 200 排除顶部导航）
                        names.push({
                            name: text,
                            x: rect.x + rect.width / 2,
                            y: rect.y + rect.height / 2,
                        });
                    }
                }
            }
            return names;
        });
        
        log(`找到 ${accountNames.length} 个账号名元素`);
        
        if (accountNames.length === 0) {
            throw new Error('没有找到账号名元素');
        }
        
        // 随机选择前8个中的一个（第一排）
        const targetIndex = Math.floor(Math.random() * Math.min(8, accountNames.length));
        const target = accountNames[targetIndex];
        
        log(`点击账号: ${target.name} (坐标: ${Math.round(target.x)}, ${Math.round(target.y)})`);
        
        // 通过坐标点击
        await this.page.mouse.click(target.x, target.y);
        
        // 等待进入AI界面并检测输入框
        log('等待AI界面加载...');
        await this.waitForInputBox();
        
        log('AI界面已就绪');
    }
    
    /**
     * 等待输入框出现
     */
    async waitForInputBox(maxWaitTime = 30000) {
        const startTime = Date.now();
        const checkInterval = 1000; // 每秒检查一次
        
        const inputSelectors = [
            'input[placeholder*="询问"]',
            'textarea[placeholder*="询问"]',
            'input[placeholder*="问题"]',
            'textarea[placeholder*="问题"]',
            '#prompt-textarea',
            'textarea[placeholder]',
            '[contenteditable="true"]',
        ];
        
        while (Date.now() - startTime < maxWaitTime) {
            // 检查各种可能的输入框选择器
            for (const selector of inputSelectors) {
                try {
                    const element = await this.page.$(selector);
                    if (element) {
                        const isVisible = await element.isVisible();
                        if (isVisible) {
                            log(`检测到输入框: ${selector}`);
                            // 再等待一下确保页面完全稳定
                            await sleep(1000);
                            return true;
                        }
                    }
                } catch (e) {
                    // 继续检查下一个
                }
            }
            
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            log(`等待输入框出现... (${elapsed}秒)`);
            await sleep(checkInterval);
        }
        
        throw new Error(`等待输入框超时 (${maxWaitTime / 1000}秒)`);
    }

    /**
     * 发送消息并获取AI响应
     */
    async sendMessage(message) {
        log(`发送消息: ${message.substring(0, 50)}...`);
        
        // 检查是否有对话历史（如果没有历史消息，就不需要等待）
        const hasHistory = await this.checkIfHasConversation();
        
        if (hasHistory) {
            // 有历史消息，检查AI是否还在回复上一条
            let generating = await this.checkIfAIGenerating();
            if (generating) {
                log('检测到AI仍在回复上一条消息，等待完成...');
                let waitCount = 0;
                while (generating && waitCount < 60) {
                    await sleep(2000);
                    waitCount++;
                    generating = await this.checkIfAIGenerating();
                    if (waitCount % 5 === 0) {
                        log(`等待上一条回复完成... (${waitCount * 2}秒)`);
                    }
                }
                log('上一条回复已完成');
                await sleep(2000);
            }
        } else {
            log('新对话，无需等待历史消息');
        }
        
        // 确保输入框已经出现
        await this.waitForInputBox(15000);
        
        // 等待页面稳定
        await sleep(500);
        
        // 查找输入框 - 根据截图，placeholder是"询问任何问题"
        const inputSelectors = [
            '#prompt-textarea',
            'input[placeholder*="询问"]',
            'textarea[placeholder*="询问"]',
            'input[placeholder*="问题"]',
            'textarea[placeholder*="问题"]',
            'textarea[placeholder*="message"]',
            '[contenteditable="true"]',
            'textarea',
        ];
        
        let inputElement = null;
        let usedSelector = '';
        
        for (const selector of inputSelectors) {
            try {
                inputElement = await this.page.$(selector);
                if (inputElement) {
                    const isVisible = await inputElement.isVisible();
                    if (isVisible) {
                        usedSelector = selector;
                        log(`找到输入框: ${selector}`);
                        break;
                    }
                }
            } catch (e) {
                continue;
            }
            inputElement = null;
        }
        
        if (!inputElement) {
            throw new Error('找不到消息输入框');
        }
        
        // 点击输入框激活
        await inputElement.click();
        await sleep(500);
        
        // 清空输入框
        await inputElement.fill('');
        await sleep(300);
        
        // 输入消息 - 使用多种方式确保输入成功
        log('正在输入消息...');
        
        // 方式1：使用fill
        await inputElement.fill(message);
        await sleep(500);
        
        // 验证是否输入成功
        let inputSuccess = await this.verifyInputContent(message);
        
        if (!inputSuccess) {
            log('fill方式输入失败，尝试type方式...');
            await inputElement.click();
            await inputElement.fill('');
            await sleep(300);
            // 方式2：使用type逐字输入
            await inputElement.type(message, { delay: 10 });
            await sleep(500);
            inputSuccess = await this.verifyInputContent(message);
        }
        
        if (!inputSuccess) {
            log('输入验证失败，但继续尝试发送...');
        } else {
            log('消息已输入到输入框');
        }
        
        // 尝试发送消息
        log('尝试发送消息...');
        
        // 先尝试点击发送按钮
        let sendClicked = await this.clickSendButton();
        
        if (!sendClicked) {
            // 如果没找到发送按钮，按Enter
            log('未找到发送按钮，尝试按Enter发送...');
            await inputElement.press('Enter');
        }
        
        await sleep(2000);
        
        // 检测是否发送成功
        const sendSuccess = await this.checkMessageSent(message);
        
        if (!sendSuccess) {
            // 重试一次
            log('发送可能未成功，重试...');
            await inputElement.click();
            await sleep(300);
            
            // 再次按Enter或Ctrl+Enter
            await this.page.keyboard.press('Enter');
            await sleep(2000);
            
            const retrySuccess = await this.checkMessageSent(message);
            if (!retrySuccess) {
                throw new Error('消息发送失败');
            }
        }
        
        log('消息已发送，等待AI响应...');
        
        // 等待AI响应
        const response = await this.waitForResponse();
        return response;
    }
    
    /**
     * 验证输入框中的内容
     */
    async verifyInputContent(expectedMessage) {
        try {
            const content = await this.page.evaluate(() => {
                const inputs = document.querySelectorAll('#prompt-textarea, textarea, [contenteditable="true"]');
                for (const input of inputs) {
                    const value = input.value || input.textContent || input.innerText || '';
                    if (value.trim().length > 0) {
                        return value;
                    }
                }
                return '';
            });
            
            // 检查输入的内容是否与期望的一致（至少前50个字符匹配）
            const expectedStart = expectedMessage.substring(0, 50);
            const actualStart = content.substring(0, 50);
            
            return actualStart.includes(expectedStart.substring(0, 20));
        } catch (e) {
            return false;
        }
    }
    
    /**
     * 点击发送按钮
     */
    async clickSendButton() {
        // 尝试多种发送按钮选择器
        const sendSelectors = [
            'button[data-testid="send-button"]',
            'button[data-testid="fruitjuice-send-button"]',
            'button[aria-label*="Send"]',
            'button[aria-label*="发送"]',
            'form button[type="submit"]',
            'button:has(svg[class*="send"])',
            'button:has(path[d*="M2.01"])', // 常见的发送图标路径
        ];
        
        for (const selector of sendSelectors) {
            try {
                const btn = await this.page.$(selector);
                if (btn) {
                    const isVisible = await btn.isVisible();
                    if (isVisible) {
                        await btn.click();
                        log(`点击了发送按钮: ${selector}`);
                        return true;
                    }
                }
            } catch (e) {
                continue;
            }
        }
        
        // 尝试找到输入框旁边的按钮（通常发送按钮在输入框右侧）
        try {
            const buttons = await this.page.$$('button');
            for (const btn of buttons) {
                const box = await btn.boundingBox();
                if (box && box.y > 400) { // 在页面下半部分
                    const isEnabled = await btn.isEnabled();
                    if (isEnabled) {
                        await btn.click();
                        log('点击了可能的发送按钮');
                        return true;
                    }
                }
            }
        } catch (e) {
            // 忽略
        }
        
        return false;
    }
    
    /**
     * 检测消息是否发送成功
     */
    async checkMessageSent(message) {
        try {
            // 检查方式1：输入框是否已清空
            const inputContent = await this.page.evaluate(() => {
                const inputs = document.querySelectorAll('#prompt-textarea, textarea, [contenteditable="true"]');
                for (const input of inputs) {
                    const value = input.value || input.textContent || '';
                    return value.trim();
                }
                return '';
            });
            
            // 如果输入框还有很多内容，说明没发送成功
            if (inputContent.length > 50) {
                log('检测：输入框仍有内容，长度=' + inputContent.length);
                return false;
            }
            
            // 检查方式2：是否有AI正在生成的指示器
            const isGenerating = await this.checkIfAIGenerating();
            if (isGenerating) {
                log('检测：AI正在生成响应，发送成功');
                return true;
            }
            
            // 检查方式3：检查是否有新的对话消息出现
            const hasNewMessage = await this.page.evaluate((msgSnippet) => {
                const snippet = msgSnippet.substring(0, 30);
                // 查找页面上的消息元素
                const messageElements = document.querySelectorAll('[class*="message"], [class*="user"], p, div');
                for (const el of messageElements) {
                    const text = el.textContent || '';
                    if (text.includes(snippet)) {
                        return true;
                    }
                }
                return false;
            }, message);
            
            if (hasNewMessage) {
                log('检测：页面上出现了发送的消息');
                return true;
            }
            
            // 如果输入框清空了，认为发送成功
            if (inputContent.length < 10) {
                log('检测：输入框已清空，认为发送成功');
                return true;
            }
            
            return false;
            
        } catch (e) {
            log(`检测发送状态出错: ${e.message}`);
            return false;
        }
    }

    /**
     * 等待并获取AI响应 - 【增强版：智能活动检测】
     * 
     * 超时逻辑：
     * - 如果页面有活动（AI正在生成 或 内容在变化），继续等待
     * - 如果页面无活动超过200秒，判定为卡死，抛出超时错误
     * - 最长等待30分钟（防止无限等待）
     */
    async waitForResponse() {
        const startTime = Date.now();
        let lastActivityTime = Date.now();  // 【新增】上次活动时间
        let lastResponseText = '';
        let lastResponseHtml = '';
        let lastResponseLength = 0;  // 【新增】上次响应长度
        let stableCount = 0;
        
        // 使用配置的超时时间
        const inactivityTimeout = CONFIG.inactivityTimeout || 200000;  // 200秒无活动超时
        const maxWaitTime = CONFIG.maxResponseWaitTime || 1800000;     // 30分钟最大等待
        
        log('开始等待AI响应...');
        log(`[超时设置] 无活动超时: ${inactivityTimeout/1000}秒, 最大等待: ${maxWaitTime/1000}秒`);
        
        // 先等待一下让AI开始响应
        await sleep(3000);
        
        while (Date.now() - startTime < maxWaitTime) {
            const now = Date.now();
            const elapsed = Math.round((now - startTime) / 1000);
            const inactiveTime = Math.round((now - lastActivityTime) / 1000);
            
            // 【新增】检查无活动超时
            if (inactiveTime >= inactivityTimeout / 1000) {
                log(`⚠️ 页面无活动已达 ${inactiveTime} 秒，判定为卡死！`, 'WARN');
                throw new Error(`页面卡死：${inactiveTime}秒无活动`);
            }
            
            // 检查AI是否正在回复（有加载/打字动画）
            const isGenerating = await this.checkIfAIGenerating();
            
            // 获取当前响应文本和HTML
            let responseText = '';
            let responseHtml = '';
            try {
                const result = await this.page.evaluate(() => {
                    // 辅助函数：检查文本是否是脚本代码
                    const isScriptCode = (text) => {
                        if (!text) return true;
                        // 排除JavaScript代码
                        if (text.includes('window.__oai') || 
                            text.includes('requestAnimationFrame') ||
                            text.includes('function()') ||
                            text.includes('__SSR_') ||
                            text.startsWith('window.') ||
                            text.includes('logHTML') ||
                            text.includes('logTTI')) {
                            return true;
                        }
                        return false;
                    };
                    
                    // 辅助函数：清理文本 - 【已修复】保留换行符
                    const cleanText = (text) => {
                        if (!text) return '';
                        return text.trim()
                            .replace(/[^\S\n\r]+/g, ' ')  // 【修复】只替换非换行的空白字符
                            .replace(/\n{3,}/g, '\n\n')   // 多个换行变两个
                            .substring(0, 50000);  // 限制长度
                    };
                    
                    // 方法1：ChatGPT/OpenAI风格 - 查找assistant消息
                    const assistantMessages = document.querySelectorAll('[data-message-author-role="assistant"]');
                    if (assistantMessages.length > 0) {
                        const lastAssistant = assistantMessages[assistantMessages.length - 1];
                        const markdownDiv = lastAssistant.querySelector('[class*="markdown"]');
                        if (markdownDiv) {
                            const text = markdownDiv.innerText || markdownDiv.textContent || '';
                            if (!isScriptCode(text) && text.length > 10) {
                                return {
                                    text: cleanText(text),
                                    html: markdownDiv.innerHTML || ''
                                };
                            }
                        }
                        const text = lastAssistant.innerText || lastAssistant.textContent || '';
                        if (!isScriptCode(text) && text.length > 10) {
                            return {
                                text: cleanText(text),
                                html: lastAssistant.innerHTML || ''
                            };
                        }
                    }
                    
                    // 方法2：查找markdown渲染内容（排除用户消息）
                    const allMarkdown = document.querySelectorAll('.markdown, .prose, [class*="markdown-body"]');
                    for (let i = allMarkdown.length - 1; i >= 0; i--) {
                        const el = allMarkdown[i];
                        // 排除用户消息
                        const parent = el.closest('[data-message-author-role]');
                        if (parent && parent.getAttribute('data-message-author-role') === 'user') {
                            continue;
                        }
                        const text = el.innerText || el.textContent || '';
                        if (!isScriptCode(text) && text.length > 20) {
                            return {
                                text: cleanText(text),
                                html: el.innerHTML || ''
                            };
                        }
                    }
                    
                    // 方法3：sorryios.ai特定选择器（如果有的话）
                    const responseSelectors = [
                        '.response-content',
                        '.ai-response',
                        '.chat-response',
                        '.assistant-message',
                        '[class*="response"]',
                        '[class*="answer"]',
                        '[class*="reply"]'
                    ];
                    for (const selector of responseSelectors) {
                        const elements = document.querySelectorAll(selector);
                        if (elements.length > 0) {
                            const lastEl = elements[elements.length - 1];
                            const text = lastEl.innerText || lastEl.textContent || '';
                            if (!isScriptCode(text) && text.length > 20) {
                                return {
                                    text: cleanText(text),
                                    html: lastEl.innerHTML || ''
                                };
                            }
                        }
                    }
                    
                    // 方法4：查找对话容器中的最后一个非用户消息
                    const conversationContainers = document.querySelectorAll(
                        '[class*="conversation"], [class*="chat"], [class*="messages"], [role="main"]'
                    );
                    for (const container of conversationContainers) {
                        const children = container.querySelectorAll(':scope > div, :scope > article');
                        for (let i = children.length - 1; i >= 0; i--) {
                            const child = children[i];
                            // 跳过用户消息
                            if (child.getAttribute('data-message-author-role') === 'user') continue;
                            if (child.className && child.className.includes('user')) continue;
                            
                            const text = child.innerText || child.textContent || '';
                            if (!isScriptCode(text) && text.length > 50) {
                                return {
                                    text: cleanText(text),
                                    html: child.innerHTML || ''
                                };
                            }
                        }
                    }
                    
                    // 方法5：获取页面主要内容区域的文本（最后手段）
                    const mainContent = document.querySelector('main, [role="main"], .main-content');
                    if (mainContent) {
                        const paragraphs = mainContent.querySelectorAll('p');
                        const texts = [];
                        const htmlParts = [];
                        for (const p of paragraphs) {
                            const text = p.innerText || p.textContent || '';
                            if (!isScriptCode(text) && text.length > 10) {
                                texts.push(text.trim());
                                htmlParts.push(p.outerHTML);
                            }
                        }
                        if (texts.length > 0) {
                            return {
                                text: texts.slice(-5).join('\n'),
                                html: htmlParts.slice(-5).join('\n')
                            };
                        }
                    }
                    
                    return { text: '', html: '' };
                });
                
                responseText = result.text || '';
                responseHtml = result.html || '';
            } catch (e) {
                // 页面可能还在加载
                await sleep(2000);
                continue;
            }
            
            // 【新增】检测活动：AI正在生成 或 内容长度变化
            const currentLength = responseText.length;
            const hasActivity = isGenerating || (currentLength > lastResponseLength);
            
            if (hasActivity) {
                // 有活动，重置无活动计时器
                lastActivityTime = now;
                
                if (isGenerating) {
                    log(`AI正在生成中... (${elapsed}秒, 内容长度: ${currentLength})`);
                } else if (currentLength > lastResponseLength) {
                    log(`内容增长中... (${elapsed}秒, 长度: ${lastResponseLength} → ${currentLength})`);
                }
                
                lastResponseLength = currentLength;
                stableCount = 0;
                lastResponseText = responseText;
                lastResponseHtml = responseHtml;
                await sleep(2000);
                continue;
            }
            
            // 没有活动（AI不在生成，内容也没变化）
            // 检查响应是否稳定
            if (responseText && responseText.length > 10) {
                if (responseText === lastResponseText) {
                    stableCount++;
                    log(`响应稳定检测: ${stableCount}/3 (${elapsed}秒, 无活动: ${inactiveTime}秒)`);
                    
                    // 如果响应稳定3次（约6秒），认为完成
                    if (stableCount >= 3) {
                        log('AI响应完成！');
                        
                        // 额外等待确保完全结束
                        await sleep(2000);
                        
                        // 最终验证：确保返回的不是脚本代码
                        const finalText = responseText.trim();
                        if (finalText.includes('window.__oai') || 
                            finalText.includes('requestAnimationFrame') ||
                            finalText.includes('__SSR_')) {
                            log('检测到脚本代码，尝试重新获取...', 'WARN');
                            stableCount = 0;
                            continue;
                        }
                        
                        // 返回包含text和html的对象
                        return {
                            text: finalText,
                            html: responseHtml || ''
                        };
                    }
                } else {
                    // 内容变化了（虽然长度没变），也算有活动
                    lastActivityTime = now;
                    stableCount = 0;
                    lastResponseText = responseText;
                    lastResponseHtml = responseHtml;
                    log(`响应内容变化中... (${elapsed}秒, 长度: ${responseText.length})`);
                }
            } else {
                log(`等待响应内容... (${elapsed}秒, 无活动: ${inactiveTime}秒)`);
            }
            
            await sleep(2000);
        }
        
        // 超时了但有内容就返回
        if (lastResponseText && lastResponseText.length > 10) {
            // 验证不是脚本代码
            if (lastResponseText.includes('window.__oai') || 
                lastResponseText.includes('requestAnimationFrame')) {
                log('超时且内容为脚本代码，返回错误', 'ERROR');
                // 保存调试截图
                try {
                    const debugPath = `debug-screenshot-${Date.now()}.png`;
                    await this.page.screenshot({ path: debugPath, fullPage: true });
                    log(`调试截图已保存: ${debugPath}`, 'WARN');
                    
                    // 保存页面HTML结构
                    const html = await this.page.content();
                    const fs = require('fs');
                    fs.writeFileSync(`debug-page-${Date.now()}.html`, html);
                    log(`页面HTML已保存`, 'WARN');
                } catch (e) {
                    log(`保存调试信息失败: ${e.message}`, 'WARN');
                }
                throw new Error('无法提取AI响应内容（页面结构可能已更改）');
            }
            log('最大等待时间到达，返回已获取的内容');
            return {
                text: lastResponseText.trim(),
                html: lastResponseHtml || ''
            };
        }
        
        throw new Error('等待AI响应超时（最大等待时间）');
    }
    
    /**
     * 检测是否有对话历史
     */
    async checkIfHasConversation() {
        try {
            const hasMessages = await this.page.evaluate(() => {
                // 检查是否有用户或AI的消息
                const messageSelectors = [
                    '[data-message-author-role]',
                    '[class*="user-message"]',
                    '[class*="assistant-message"]',
                    '[class*="chat-message"]',
                    '.message',
                    '[class*="conversation"] [class*="message"]',
                ];
                
                for (const selector of messageSelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        return true;
                    }
                }
                
                // 检查页面文本中是否包含"有什么可以帮忙"之类的空白页提示
                const bodyText = document.body.innerText || '';
                if (bodyText.includes('有什么可以帮忙') || bodyText.includes('How can I help')) {
                    // 这是空白对话页面
                    return false;
                }
                
                return false;
            });
            
            return hasMessages;
        } catch (e) {
            return false;
        }
    }
    
    /**
     * 检测AI是否正在生成回复
     */
    async checkIfAIGenerating() {
        try {
            const isGenerating = await this.page.evaluate(() => {
                // 首先检查是否有"停止生成"按钮 - 这是最可靠的指示器
                const stopButtons = document.querySelectorAll('button[aria-label*="Stop"], button[aria-label*="停止"]');
                for (const btn of stopButtons) {
                    const style = window.getComputedStyle(btn);
                    if (style.display !== 'none' && style.visibility !== 'hidden' && btn.offsetParent !== null) {
                        return true;
                    }
                }
                
                // 检查是否有流式输出的光标
                const streamingCursors = document.querySelectorAll('.result-streaming, [class*="streaming"]');
                for (const cursor of streamingCursors) {
                    const style = window.getComputedStyle(cursor);
                    if (style.display !== 'none' && style.visibility !== 'hidden') {
                        return true;
                    }
                }
                
                // 检查是否有正在打字的动画（特定于某些UI）
                const typingIndicators = document.querySelectorAll('[class*="typing-indicator"], [class*="loading-dots"]');
                if (typingIndicators.length > 0) {
                    return true;
                }
                
                return false;
            });
            
            return isGenerating;
        } catch (e) {
            return false;
        }
    }

    /**
     * 批量处理多个文本片段
     */
    async processSegments(segments, systemPrompt = '') {
        const results = [];
        
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            log(`处理片段 ${i + 1}/${segments.length}`);
            
            try {
                // 构建完整的提问
                let fullMessage = segment;
                if (systemPrompt && i === 0) {
                    fullMessage = `${systemPrompt}\n\n${segment}`;
                }
                
                // 发送并获取响应
                const response = await withRetry(async () => {
                    return await this.sendMessage(fullMessage);
                });
                
                // response 现在是 { text, html } 对象
                results.push({
                    index: i,
                    input: segment,
                    output: typeof response === 'object' ? response.text : response,
                    outputHtml: typeof response === 'object' ? response.html : '',
                    success: true,
                    timestamp: new Date().toISOString(),
                });
                
                log(`片段 ${i + 1} 处理成功`);
                
            } catch (error) {
                log(`片段 ${i + 1} 处理失败: ${error.message}`, 'ERROR');
                results.push({
                    index: i,
                    input: segment,
                    output: null,
                    outputHtml: null,
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString(),
                });
            }
            
            // 片段间隔 - 等待一段时间再发送下一个
            if (i < segments.length - 1) {
                const waitSeconds = CONFIG.requestInterval / 1000;
                log(`等待 ${waitSeconds} 秒后发送下一个片段...`);
                await sleep(CONFIG.requestInterval);
            }
        }
        
        return results;
    }

    /**
     * 关闭浏览器
     */
    async close() {
        if (this.browser) {
            await this.browser.close();
            log('浏览器已关闭');
        }
    }
}

// ============== 主函数 ==============

async function main() {
    // 解析命令行参数
    const args = process.argv.slice(2);
    let inputFile = null;
    let outputFile = null;
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input' || args[i] === '-i') {
            inputFile = args[i + 1];
        } else if (args[i] === '--output' || args[i] === '-o') {
            outputFile = args[i + 1];
        }
    }
    
    // 读取输入数据
    let inputData;
    if (inputFile) {
        const content = fs.readFileSync(inputFile, 'utf-8');
        inputData = JSON.parse(content);
    } else {
        // 从stdin读取
        const chunks = [];
        for await (const chunk of process.stdin) {
            chunks.push(chunk);
        }
        inputData = JSON.parse(Buffer.concat(chunks).toString());
    }
    
    // 期望的输入格式:
    // {
    //     "segments": ["片段1", "片段2", ...],
    //     "systemPrompt": "可选的系统提示"
    // }
    
    const segments = inputData.segments || inputData;
    const systemPrompt = inputData.systemPrompt || '';
    
    log(`收到 ${segments.length} 个待处理片段`);
    
    // 开始处理
    const automation = new SorryiosAutomation();
    
    try {
        await automation.init();
        await automation.login();
        await automation.selectIdleAccount();
        
        const results = await automation.processSegments(segments, systemPrompt);
        
        // 输出结果
        const output = {
            totalSegments: segments.length,
            successCount: results.filter(r => r.success).length,
            failCount: results.filter(r => !r.success).length,
            results: results,
            processedAt: new Date().toISOString(),
        };
        
        if (outputFile) {
            fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), 'utf-8');
            log(`结果已保存到: ${outputFile}`);
        } else {
            console.log(JSON.stringify(output, null, 2));
        }
        
    } catch (error) {
        log(`处理失败: ${error.message}`, 'ERROR');
        process.exit(1);
    } finally {
        await automation.close();
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch(console.error);
}

// 导出类供其他模块使用
module.exports = { SorryiosAutomation, CONFIG };