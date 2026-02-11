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
    
    // 浏览器设置 - Docker环境无头模式，本地显示浏览器
    // 通过检测 /.dockerenv 文件判断是否在 Docker 中
    headless: require('fs').existsSync('/.dockerenv'),
    
    // 登录状态保存路径
    storageStatePath: './sorryios-auth.json',
};

// 导出配置供外部修改
module.exports.CONFIG = CONFIG;

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
        
        // 🆕 Bug修复：进入账号后立即强制新建对话
        // 原因：点击账号后可能自动恢复上次的旧对话
        // 必须在模型切换之前就确保在新对话中
        await this.startNewChat();
        
        // 🆕 选择 Instant 模型（即刻回答，速度更快）
        await this.selectInstantModel();
        
        log('AI界面已就绪');
    }
    
    /**
     * 🆕 选择 Instant（即刻回答）模型
     * 避免使用 Thinking 模型导致等待时间过长
     */
    async selectInstantModel() {
        log('========== 开始选择 Instant 模型 ==========');
        try {
            // 等待页面稳定
            await sleep(1500);
            
            // 第一步：扫描页面上所有按钮，找到模型选择按钮
            log('[步骤1] 扫描页面按钮...');
            const allButtons = await this.page.$$eval('button', (buttons) => {
                return buttons.map((btn, index) => {
                    const rect = btn.getBoundingClientRect();
                    const text = btn.innerText || btn.textContent || '';
                    const isVisible = rect.width > 0 && rect.height > 0;
                    return {
                        index,
                        text: text.trim().substring(0, 50),
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                        isVisible,
                        className: btn.className.substring(0, 50),
                    };
                }).filter(b => b.isVisible && b.y < 100); // 只看顶部100px内的按钮
            });
            
            log(`[调试] 顶部区域找到 ${allButtons.length} 个可见按钮:`);
            allButtons.forEach(btn => {
                log(`  - 按钮[${btn.index}]: "${btn.text}" 位置(${btn.x},${btn.y}) 大小(${btn.width}x${btn.height})`);
            });
            
            // 查找包含 ChatGPT / GPT / Thinking / Instant / Auto 的按钮
            const modelButton = allButtons.find(btn => 
                btn.text.includes('ChatGPT') || 
                btn.text.includes('GPT') ||
                btn.text.includes('Thinking') || 
                btn.text.includes('Instant') ||
                btn.text.includes('Auto')
            );
            
            if (!modelButton) {
                log('[步骤1] ❌ 未在顶部找到模型选择按钮', 'WARN');
                log('[调试] 尝试扩大搜索范围...');
                
                // 扩大搜索：查找所有包含相关文字的元素
                const modelElements = await this.page.$$eval('*', (elements) => {
                    const keywords = ['ChatGPT', 'GPT-', 'Thinking', 'Instant', 'Auto'];
                    return elements.filter(el => {
                        const text = el.innerText || '';
                        const rect = el.getBoundingClientRect();
                        return rect.y < 80 && rect.width > 0 && keywords.some(k => text.includes(k));
                    }).slice(0, 10).map(el => ({
                        tag: el.tagName,
                        text: (el.innerText || '').substring(0, 60),
                        x: Math.round(el.getBoundingClientRect().x),
                        y: Math.round(el.getBoundingClientRect().y),
                    }));
                });
                
                log(`[调试] 扩大搜索找到 ${modelElements.length} 个相关元素:`);
                modelElements.forEach(el => {
                    log(`  - <${el.tag}> "${el.text}" 位置(${el.x},${el.y})`);
                });
                
                log('[步骤1] 使用默认模型继续', 'WARN');
                return;
            }
            
            log(`[步骤1] ✅ 找到模型按钮: "${modelButton.text}" 位置(${modelButton.x},${modelButton.y})`);
            
            // 检查是否已经是 Instant
            if (modelButton.text.includes('Instant')) {
                log('[步骤1] 当前已是 Instant 模型，无需切换 ✅');
                return;
            }
            
            // 第二步：点击模型按钮打开下拉菜单
            log('[步骤2] 点击模型按钮打开下拉菜单...');
            await this.page.mouse.click(modelButton.x + modelButton.width / 2, modelButton.y + modelButton.height / 2);
            await sleep(1000);
            
            // 第三步：查找下拉菜单中的 Instant 选项
            log('[步骤3] 查找 Instant 选项...');
            
            // 先等待下拉菜单完全展开
            await sleep(500);
            
            // 下拉菜单应该在模型按钮正下方，根据按钮位置计算搜索范围
            const menuMinX = modelButton.x - 50;  // 按钮左侧稍微扩展
            const menuMaxX = modelButton.x + modelButton.width + 100; // 按钮右侧扩展
            const menuMinY = modelButton.y + modelButton.height; // 按钮下方开始
            const menuMaxY = 450; // 下拉菜单不会太长
            
            log(`[调试] 搜索下拉菜单范围: x(${menuMinX}-${menuMaxX}), y(${menuMinY}-${menuMaxY})`);
            
            // 扫描下拉菜单区域
            log('[调试] 扫描下拉菜单区域的所有元素...');
            const allMenuElements = await this.page.$$eval('*', (elements, range) => {
                return elements.filter(el => {
                    const rect = el.getBoundingClientRect();
                    const text = (el.innerText || '').trim();
                    // 严格限定在下拉菜单区域
                    return rect.x >= range.minX && rect.x <= range.maxX &&
                           rect.y >= range.minY && rect.y <= range.maxY &&
                           rect.width > 30 && rect.width < 300 &&
                           rect.height > 15 && rect.height < 80 &&
                           text.length > 0 && text.length < 60;
                }).slice(0, 25).map(el => ({
                    tag: el.tagName,
                    text: (el.innerText || '').trim().substring(0, 50),
                    x: Math.round(el.getBoundingClientRect().x),
                    y: Math.round(el.getBoundingClientRect().y),
                    width: Math.round(el.getBoundingClientRect().width),
                    height: Math.round(el.getBoundingClientRect().height),
                }));
            }, { minX: menuMinX, maxX: menuMaxX, minY: menuMinY, maxY: menuMaxY });
            
            log(`[调试] 下拉菜单区域找到 ${allMenuElements.length} 个元素:`);
            allMenuElements.forEach(item => {
                log(`  - <${item.tag}> "${item.text}" 位置(${item.x},${item.y}) 大小(${item.width}x${item.height})`);
            });
            
            // 查找包含 Instant 的元素
            const menuItems = allMenuElements.filter(item => 
                item.text.includes('Instant') || item.text.includes('即刻')
            );
            
            log(`[调试] 其中包含 Instant 的有 ${menuItems.length} 个`);
            
            // 找到最合适的 Instant 选项（优先找小的、明确的元素）
            const instantItem = menuItems.find(item => 
                item.height > 20 && item.height < 80 && 
                (item.text.startsWith('Instant') || item.text.includes('即刻回答'))
            ) || menuItems[0];
            
            if (!instantItem) {
                log('[步骤3] ❌ 未找到 Instant 选项', 'WARN');
                await this.page.keyboard.press('Escape');
                return;
            }
            
            log(`[步骤3] ✅ 找到 Instant 选项: "${instantItem.text}" 位置(${instantItem.x},${instantItem.y})`);
            
            // 第四步：点击 Instant 选项
            log('[步骤4] 点击 Instant 选项...');
            await this.page.mouse.click(instantItem.x + instantItem.width / 2, instantItem.y + instantItem.height / 2);
            await sleep(800);
            
            // 验证是否切换成功
            const newButtonText = await this.page.$$eval('button', (buttons) => {
                const btn = buttons.find(b => {
                    const rect = b.getBoundingClientRect();
                    const text = b.innerText || '';
                    return rect.y < 80 && (text.includes('ChatGPT') || text.includes('GPT') || text.includes('Instant'));
                });
                return btn ? btn.innerText : '';
            });
            
            if (newButtonText.includes('Instant')) {
                log(`[步骤4] ✅ 成功切换到 Instant 模型！当前: "${newButtonText.substring(0, 30)}"`);
            } else {
                log(`[步骤4] ⚠️ 切换可能未成功，当前按钮文字: "${newButtonText.substring(0, 30)}"`, 'WARN');
            }
            
            // 🐛 Bug修复：模型切换后SPA可能自动跳转到旧对话
            await sleep(1500);
            const postSwitchUrl = this.page.url();
            if (postSwitchUrl.includes('/c/')) {
                log('[Instant] ⚠️ 模型切换后跳转到旧对话，强制回到新对话...');
                const urlObj = new URL(postSwitchUrl);
                const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
                await this.page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
                await sleep(2000);
                await this.waitForInputBox(15000);
                log(`[Instant] ✅ 已回到新对话 - URL: ${this.page.url()}`);
            }
            
            log('========== 模型选择完成 ==========');
            
        } catch (error) {
            log(`[错误] 模型选择过程出错: ${error.message}`, 'ERROR');
            log(`[错误] 错误堆栈: ${error.stack}`, 'ERROR');
            try {
                await this.page.keyboard.press('Escape');
            } catch (e) {}
        }
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
        
        // 🆕 v1.2 修复：添加详细日志，修复输入问题
        log('正在输入消息...');
        log(`[输入调试] 消息长度: ${message.length} 字符`);
        
        let inputSuccess = false;
        
        // 方式1：使用 Playwright 原生 fill（最可靠）
        try {
            log('[输入调试] 方式1: 尝试 Playwright fill...');
            
            // 重新获取输入框（确保元素引用有效）
            const freshInput = await this.page.$('#prompt-textarea') || 
                               await this.page.$('textarea[placeholder]') ||
                               await this.page.$('textarea');
            
            if (freshInput) {
                log('[输入调试] 找到输入框，准备清空...');
                await freshInput.click();
                await sleep(200);
                
                // 使用键盘全选+删除来清空（比fill('')更可靠）
                await this.page.keyboard.press('Control+A');
                await this.page.keyboard.press('Backspace');
                await sleep(200);
                
                log('[输入调试] 开始fill输入...');
                await freshInput.fill(message);
                await sleep(500);
                
                // 验证
                const verifyResult = await this.page.evaluate(() => {
                    const input = document.querySelector('#prompt-textarea') || 
                                  document.querySelector('textarea[placeholder]') ||
                                  document.querySelector('textarea');
                    if (!input) return { found: false, length: 0, preview: '' };
                    const val = input.value || input.textContent || '';
                    return { 
                        found: true, 
                        length: val.length, 
                        preview: val.substring(0, 50) 
                    };
                });
                
                log(`[输入调试] fill后验证: found=${verifyResult.found}, length=${verifyResult.length}, preview="${verifyResult.preview}"`);
                
                if (verifyResult.length > 10) {
                    inputSuccess = true;
                    log('[输入调试] ✅ 方式1成功');
                }
            } else {
                log('[输入调试] ❌ 找不到输入框元素');
            }
        } catch (e) {
            log(`[输入调试] ❌ 方式1出错: ${e.message}`);
        }
        
        // 方式2：如果fill失败，尝试 evaluate 直接设置
        if (!inputSuccess) {
            try {
                log('[输入调试] 方式2: 尝试 evaluate 直接设置...');
                
                const evalResult = await this.page.evaluate((msg) => {
                    const input = document.querySelector('#prompt-textarea') || 
                                  document.querySelector('textarea[placeholder]') ||
                                  document.querySelector('textarea');
                    if (!input) return { success: false, error: '找不到输入框' };
                    
                    try {
                        // 聚焦
                        input.focus();
                        
                        // 尝试使用 nativeInputValueSetter（绕过React受控组件）
                        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                            window.HTMLTextAreaElement.prototype, 'value'
                        ).set;
                        nativeInputValueSetter.call(input, msg);
                        
                        // 触发事件
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        
                        return { 
                            success: true, 
                            length: input.value.length,
                            preview: input.value.substring(0, 50)
                        };
                    } catch (e) {
                        return { success: false, error: e.message };
                    }
                }, message);
                
                log(`[输入调试] evaluate结果: ${JSON.stringify(evalResult)}`);
                
                if (evalResult.success && evalResult.length > 10) {
                    inputSuccess = true;
                    log('[输入调试] ✅ 方式2成功');
                }
            } catch (e) {
                log(`[输入调试] ❌ 方式2出错: ${e.message}`);
            }
        }
        
        // 方式3：最后备选 - type 逐字输入
        if (!inputSuccess) {
            try {
                log('[输入调试] 方式3: 尝试 type 逐字输入...');
                
                const freshInput = await this.page.$('#prompt-textarea') || 
                                   await this.page.$('textarea[placeholder]') ||
                                   await this.page.$('textarea');
                
                if (freshInput) {
                    await freshInput.click();
                    await this.page.keyboard.press('Control+A');
                    await this.page.keyboard.press('Backspace');
                    await sleep(200);
                    
                    // 使用较快的 delay
                    log(`[输入调试] 开始type输入 (delay=5ms)，预计耗时: ${Math.round(message.length * 5 / 1000)}秒`);
                    await freshInput.type(message, { delay: 5 });
                    await sleep(300);
                    
                    inputSuccess = await this.verifyInputContent(message);
                    log(`[输入调试] type后验证: ${inputSuccess ? '✅成功' : '❌失败'}`);
                }
            } catch (e) {
                log(`[输入调试] ❌ 方式3出错: ${e.message}`);
            }
        }
        
        log(`[输入调试] 最终结果: ${inputSuccess ? '✅ 输入成功' : '❌ 输入失败'}`);
        
        if (inputSuccess) {
            log('消息已输入到输入框');
        } else {
            log('输入验证失败，但继续尝试发送...', 'WARN');
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
                            .substring(0, 100000);  // v1.1: 扩大限制，错题分析JSON可能较长
                    };
                    
                    // 🆕 方法0：优先从代码块中提取JSON（最可靠）
                    const assistantMessages = document.querySelectorAll('[data-message-author-role="assistant"]');
                    if (assistantMessages.length > 0) {
                        const lastAssistant = assistantMessages[assistantMessages.length - 1];
                        // 查找代码块 - <pre><code> 结构
                        const codeBlocks = lastAssistant.querySelectorAll('pre code, pre');
                        for (const codeBlock of codeBlocks) {
                            const codeText = codeBlock.innerText || codeBlock.textContent || '';
                            // 检查是否是JSON（以 { 开头或包含JSON特征）
                            if (codeText.trim().startsWith('{') && codeText.includes('"vocabulary"')) {
                                console.log('[提取] 从代码块中提取JSON成功');
                                return {
                                    text: codeText.trim(),
                                    html: codeBlock.innerHTML || '',
                                    fromCodeBlock: true
                                };
                            }
                        }
                        
                        // 方法1：没有代码块，从 markdown 区域提取
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

    // ============================================
    // 🆕 选择 Thinking 模型（错题识别专用）
    // 镜像 selectInstantModel() 逻辑，关键字改为 Thinking
    // ============================================
    
    async selectThinkingModel() {
        log('========== 开始选择 Thinking 模型 ==========');
        try {
            await sleep(1500);
            
            // 第一步：扫描顶部按钮，找模型选择按钮
            log('[步骤1] 扫描页面按钮...');
            const allButtons = await this.page.$$eval('button', (buttons) => {
                return buttons.map((btn, index) => {
                    const rect = btn.getBoundingClientRect();
                    const text = btn.innerText || btn.textContent || '';
                    const isVisible = rect.width > 0 && rect.height > 0;
                    return {
                        index,
                        text: text.trim().substring(0, 50),
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                        isVisible,
                        className: btn.className.substring(0, 50),
                    };
                }).filter(b => b.isVisible && b.y < 100);
            });
            
            log(`[调试] 顶部区域找到 ${allButtons.length} 个可见按钮:`);
            allButtons.forEach(btn => {
                log(`  - 按钮[${btn.index}]: "${btn.text}" 位置(${btn.x},${btn.y}) 大小(${btn.width}x${btn.height})`);
            });
            
            const modelButton = allButtons.find(btn => 
                btn.text.includes('ChatGPT') || 
                btn.text.includes('GPT') ||
                btn.text.includes('Thinking') || 
                btn.text.includes('Instant') ||
                btn.text.includes('Auto')
            );
            
            if (!modelButton) {
                log('[步骤1] ❌ 未在顶部找到模型选择按钮', 'WARN');
                const modelElements = await this.page.$$eval('*', (elements) => {
                    const keywords = ['ChatGPT', 'GPT-', 'Thinking', 'Instant', 'Auto'];
                    return elements.filter(el => {
                        const text = el.innerText || '';
                        const rect = el.getBoundingClientRect();
                        return rect.y < 80 && rect.width > 0 && keywords.some(k => text.includes(k));
                    }).slice(0, 10).map(el => ({
                        tag: el.tagName,
                        text: (el.innerText || '').substring(0, 60),
                        x: Math.round(el.getBoundingClientRect().x),
                        y: Math.round(el.getBoundingClientRect().y),
                    }));
                });
                log(`[调试] 扩大搜索找到 ${modelElements.length} 个相关元素:`);
                modelElements.forEach(el => log(`  - <${el.tag}> "${el.text}" 位置(${el.x},${el.y})`));
                log('[步骤1] 使用默认模型继续', 'WARN');
                return;
            }
            
            log(`[步骤1] ✅ 找到模型按钮: "${modelButton.text}" 位置(${modelButton.x},${modelButton.y})`);
            
            // 已经是 Thinking 则跳过
            if (modelButton.text.includes('Thinking')) {
                log('[步骤1] 当前已是 Thinking 模型，无需切换 ✅');
                return;
            }
            
            // 第二步：点击模型按钮打开下拉菜单
            log('[步骤2] 点击模型按钮打开下拉菜单...');
            await this.page.mouse.click(modelButton.x + modelButton.width / 2, modelButton.y + modelButton.height / 2);
            await sleep(1000);
            
            // 第三步：查找菜单中的 Thinking 选项
            log('[步骤3] 查找 Thinking 选项...');
            await sleep(500);
            
            const menuMinX = modelButton.x - 50;
            const menuMaxX = modelButton.x + modelButton.width + 100;
            const menuMinY = modelButton.y + modelButton.height;
            const menuMaxY = 450;
            
            log(`[调试] 搜索下拉菜单范围: x(${menuMinX}-${menuMaxX}), y(${menuMinY}-${menuMaxY})`);
            
            const allMenuElements = await this.page.$$eval('*', (elements, range) => {
                return elements.filter(el => {
                    const rect = el.getBoundingClientRect();
                    const text = (el.innerText || '').trim();
                    return rect.x >= range.minX && rect.x <= range.maxX &&
                           rect.y >= range.minY && rect.y <= range.maxY &&
                           rect.width > 30 && rect.width < 300 &&
                           rect.height > 15 && rect.height < 80 &&
                           text.length > 0 && text.length < 60;
                }).slice(0, 25).map(el => ({
                    tag: el.tagName,
                    text: (el.innerText || '').trim().substring(0, 50),
                    x: Math.round(el.getBoundingClientRect().x),
                    y: Math.round(el.getBoundingClientRect().y),
                    width: Math.round(el.getBoundingClientRect().width),
                    height: Math.round(el.getBoundingClientRect().height),
                }));
            }, { minX: menuMinX, maxX: menuMaxX, minY: menuMinY, maxY: menuMaxY });
            
            log(`[调试] 下拉菜单区域找到 ${allMenuElements.length} 个元素:`);
            allMenuElements.forEach(item => {
                log(`  - <${item.tag}> "${item.text}" 位置(${item.x},${item.y}) 大小(${item.width}x${item.height})`);
            });
            
            // 🐛 修复：'思考' 会误匹配 "Auto\n自动决定思考时长"
            // 正确做法：要求包含英文 'Thinking' 或中文 '思考更充分'（Thinking选项独有的描述）
            const menuItems = allMenuElements.filter(item => {
                const t = item.text;
                // 排除包含 Auto / Instant / Pro 的选项
                if (t.includes('Auto') || t.includes('Instant') || t.includes('即刻') || t.startsWith('Pro')) return false;
                // 必须包含 Thinking 英文关键词
                return t.includes('Thinking');
            });
            log(`[调试] 其中属于 Thinking 的有 ${menuItems.length} 个`);
            
            // 优先选择以 "Thinking" 开头的、高度合适的元素（即菜单行本身，而非子SPAN）
            const thinkingItem = menuItems.find(item => 
                item.height > 30 && item.height < 80 && item.text.startsWith('Thinking')
            ) || menuItems.find(item =>
                item.height > 30 && item.text.includes('Thinking')
            ) || menuItems[0];
            
            if (!thinkingItem) {
                log('[步骤3] ❌ 未找到 Thinking 选项', 'WARN');
                await this.page.keyboard.press('Escape');
                return;
            }
            
            log(`[步骤3] ✅ 找到 Thinking 选项: "${thinkingItem.text}" 位置(${thinkingItem.x},${thinkingItem.y})`);
            
            // 第四步：点击
            log('[步骤4] 点击 Thinking 选项...');
            await this.page.mouse.click(thinkingItem.x + thinkingItem.width / 2, thinkingItem.y + thinkingItem.height / 2);
            await sleep(800);
            
            // 验证
            const newButtonText = await this.page.$$eval('button', (buttons) => {
                const btn = buttons.find(b => {
                    const rect = b.getBoundingClientRect();
                    const text = b.innerText || '';
                    return rect.y < 80 && (text.includes('ChatGPT') || text.includes('GPT') || text.includes('Thinking'));
                });
                return btn ? btn.innerText : '';
            });
            
            if (newButtonText.includes('Thinking')) {
                log(`[步骤4] ✅ 成功切换到 Thinking 模型！当前: "${newButtonText.substring(0, 30)}"`);
            } else {
                log(`[步骤4] ⚠️ 切换可能未成功，当前按钮文字: "${newButtonText.substring(0, 30)}"`, 'WARN');
            }
            
            // 🐛 Bug修复：切换Thinking模型后，SPA可能自动恢复上次Thinking的旧对话
            // 需要等待一下让SPA完成跳转，然后检查URL
            await sleep(2000);
            const postSwitchUrl = this.page.url();
            log(`[步骤5] 📊 模型切换后URL: ${postSwitchUrl}`);
            
            if (postSwitchUrl.includes('/c/')) {
                log('[步骤5] ⚠️ 检测到模型切换后跳转到旧对话！强制回到新对话...');
                const urlObj = new URL(postSwitchUrl);
                const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
                log(`[步骤5] 🔄 导航到: ${baseUrl}`);
                await this.page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
                await sleep(2000);
                await this.waitForInputBox(15000);
                const finalUrl = this.page.url();
                log(`[步骤5] ✅ 已回到新对话 - URL: ${finalUrl}`);
            } else {
                log('[步骤5] ✅ 模型切换后仍在新对话页面');
            }
            
            log('========== 模型选择完成 ==========');
            
        } catch (error) {
            log(`[错误] Thinking 模型选择过程出错: ${error.message}`, 'ERROR');
            log(`[错误] 错误堆栈: ${error.stack}`, 'ERROR');
            try { await this.page.keyboard.press('Escape'); } catch (e) {}
        }
    }

    // ============================================
    // 🆕 开始新对话（点击"新聊天"按钮）
    // 避免在旧对话中发送消息
    // ============================================
    
    async startNewChat() {
        log('========== 强制开始新对话 ==========');
        try {
            // 📊 调试：打印当前页面状态
            const currentUrl = this.page.url();
            const pageTitle = await this.page.title().catch(() => '(获取失败)');
            log(`[新对话] 📊 调试 - 当前URL: ${currentUrl}`);
            log(`[新对话] 📊 调试 - 页面标题: ${pageTitle}`);
            
            // 📊 调试：检查页面内容长度（判断是否有旧对话）
            const pageState = await this.page.evaluate(() => {
                const bodyLen = (document.body?.innerText || '').length;
                const messagesExist = document.querySelectorAll('[data-message-author-role], [class*="message"], article').length;
                const hasInputBox = !!document.querySelector('#prompt-textarea, textarea[placeholder]');
                const hasConvoUrl = window.location.href.includes('/c/');
                return { bodyLen, messagesExist, hasInputBox, hasConvoUrl, href: window.location.href };
            }).catch(() => ({ bodyLen: -1, messagesExist: -1, hasInputBox: false, hasConvoUrl: false, href: 'error' }));
            
            log(`[新对话] 📊 调试 - 页面状态: body长度=${pageState.bodyLen}, 消息元素=${pageState.messagesExist}, 输入框=${pageState.hasInputBox}, URL含/c/=${pageState.hasConvoUrl}`);
            log(`[新对话] 📊 调试 - evaluate中的href: ${pageState.href}`);
            
            // ★ 核心策略：无条件强制导航到根路径（不做任何判断）
            // 原因：sorryios.ai 是 SPA，URL检测和DOM检测都不可靠
            // 最可靠的方式就是直接导航到根路径
            
            // 提取根路径 baseUrl
            let baseUrl;
            if (currentUrl.includes('/c/')) {
                baseUrl = currentUrl.split('/c/')[0];
            } else if (currentUrl.includes('sorryios.ai')) {
                // URL 可能是 https://sorryios.ai 或 https://sorryios.ai/ 或 https://sorryios.ai/?xxx
                const urlObj = new URL(currentUrl);
                baseUrl = `${urlObj.protocol}//${urlObj.host}`;
            } else {
                baseUrl = 'https://sorryios.ai';
            }
            
            log(`[新对话] 🔄 强制导航到: ${baseUrl}`);
            await this.page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await sleep(2000);
            
            // 📊 调试：导航后的页面状态
            const newUrl = this.page.url();
            const newTitle = await this.page.title().catch(() => '(获取失败)');
            log(`[新对话] 📊 导航后 - URL: ${newUrl}`);
            log(`[新对话] 📊 导航后 - 标题: ${newTitle}`);
            
            // 检查导航后是否还在旧对话中（URL仍然含 /c/）
            if (newUrl.includes('/c/')) {
                log(`[新对话] ⚠️ 导航后URL仍含/c/，尝试用JS清理...`);
                // 尝试用JS方式导航
                await this.page.evaluate((url) => {
                    window.location.href = url;
                }, baseUrl);
                await sleep(3000);
                const finalUrl = this.page.url();
                log(`[新对话] 📊 JS导航后 - URL: ${finalUrl}`);
            }
            
            // 等待新对话的输入框出现
            await this.waitForInputBox(15000);
            
            // 📊 最终验证
            const finalState = await this.page.evaluate(() => {
                const bodyLen = (document.body?.innerText || '').length;
                return { bodyLen, href: window.location.href };
            }).catch(() => ({ bodyLen: -1, href: 'error' }));
            log(`[新对话] ✅ 新对话就绪 - URL: ${finalState.href}, body长度: ${finalState.bodyLen}`);
            
        } catch (error) {
            log(`[新对话] ❌ 创建新对话失败: ${error.message}`, 'ERROR');
            log(`[新对话] ❌ 堆栈: ${error.stack}`, 'ERROR');
            // 不抛出错误，降级在当前页面继续
        }
    }

    // ============================================
    // 🛡️ 关闭 layui 弹窗（防止遮挡交互元素）
    // sorryios.ai 可能随时弹出 layui-layer 弹窗（如"常见问题"），
    // 这些弹窗会 intercept pointer events 导致 Playwright 超时
    // ============================================

    async closeLayuiPopups() {
        try {
            const result = await this.page.evaluate(() => {
                const closed = [];
                
                // 方式1: 找到所有 layui-layer 弹窗并关闭
                const layers = document.querySelectorAll('.layui-layer');
                for (const layer of layers) {
                    const rect = layer.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        // 尝试点击弹窗的关闭按钮
                        const closeBtn = layer.querySelector('.layui-layer-close, .layui-layer-close1, .layui-layer-close2');
                        if (closeBtn) {
                            closeBtn.click();
                            closed.push(`关闭按钮(${layer.id || 'unknown'})`);
                        } else {
                            // 没有关闭按钮，直接移除
                            layer.style.display = 'none';
                            closed.push(`隐藏(${layer.id || 'unknown'})`);
                        }
                    }
                }
                
                // 方式2: 移除 layui 遮罩层
                const shades = document.querySelectorAll('.layui-layer-shade');
                for (const shade of shades) {
                    shade.style.display = 'none';
                    closed.push('遮罩层');
                }
                
                // 方式3: 检查是否有 iframe 遮挡（如截图中的 layui-layer-iframe）
                const iframeOverlays = document.querySelectorAll('[id^="layui-layer"]');
                for (const overlay of iframeOverlays) {
                    const rect = overlay.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 && !closed.some(c => c.includes(overlay.id))) {
                        overlay.style.display = 'none';
                        closed.push(`iframe弹窗(${overlay.id})`);
                    }
                }
                
                return { count: closed.length, details: closed };
            });
            
            if (result.count > 0) {
                log(`[弹窗处理] ✅ 关闭了 ${result.count} 个弹窗: ${result.details.join(', ')}`);
                await sleep(500);
            }
            
            return result.count;
        } catch (e) {
            log(`[弹窗处理] ⚠️ 弹窗检测异常（可忽略）: ${e.message}`, 'WARN');
            return 0;
        }
    }

    // ============================================
    // 🆕 发送带图片的消息（错题识别专用）v1.2
    // 流程：关闭弹窗 → 直接 setInputFiles 上传图片 → 输入文字 → 发送 → 等待响应
    // ============================================

    async sendMessageWithImages(message, imagePaths) {
        log(`========== sendMessageWithImages v1.2 开始 ==========`);
        log(`消息长度: ${message.length} 字符`);
        log(`图片数量: ${imagePaths.length}`);
        imagePaths.forEach((p, i) => log(`  图片${i + 1}: ${p}`));

        // ℹ️ 注意：不在此处调用 startNewChat()
        // startNewChat 已在 selectIdleAccount() 中调用（模型切换之前）
        // 如果在此处再次调用，会导航到根路径，把已选的 Thinking 模型重置掉
        const preCheckUrl = this.page.url();
        log(`[sendMessageWithImages] 📊 当前URL: ${preCheckUrl}`);

        // 🛡️ 预防性关闭弹窗（防止 layui 弹窗遮挡后续操作）
        await this.closeLayuiPopups();

        // 确保输入框已出现
        await this.waitForInputBox(15000);
        await sleep(500);

        // ─── 步骤1: 上传图片（v1.2 优化：setInputFiles 优先） ───
        log('[图片上传] 步骤1: 上传图片...');
        
        // 🛡️ 再次检查弹窗（等待输入框期间可能弹出）
        await this.closeLayuiPopups();
        
        let fileUploaded = false;
        
        // 方案1（首选）: 直接 setInputFiles —— 最快最稳定
        try {
            log('[图片上传] 方案1: 直接 setInputFiles（首选）...');
            const fileInput = await this.page.$('input[type="file"]');
            if (fileInput) {
                await fileInput.setInputFiles(imagePaths);
                log(`[图片上传] ✅ 方案1成功: ${imagePaths.length} 个文件已通过 input[type=file] 设置`);
                fileUploaded = true;
            } else {
                log('[图片上传] ⚠️ 方案1: 未找到 input[type=file]，尝试方案2...', 'WARN');
            }
        } catch (inputError) {
            log(`[图片上传] ⚠️ 方案1异常: ${inputError.message}，尝试方案2...`, 'WARN');
        }
        
        // 方案2（备选）: 点击"+"按钮 → filechooser
        if (!fileUploaded) {
            try {
                log('[图片上传] 方案2: 点击+按钮 → filechooser...');
                
                // 扫描页面下半部分的所有按钮
                const bottomButtons = await this.page.$$eval('button', (buttons) => {
                    return buttons.map(btn => {
                        const rect = btn.getBoundingClientRect();
                        const text = (btn.innerText || '').trim();
                        const ariaLabel = btn.getAttribute('aria-label') || '';
                        return {
                            text: text.substring(0, 30),
                            ariaLabel: ariaLabel.substring(0, 80),
                            x: Math.round(rect.x),
                            y: Math.round(rect.y),
                            width: Math.round(rect.width),
                            height: Math.round(rect.height),
                            isVisible: rect.width > 0 && rect.height > 0,
                            hasSvg: !!btn.querySelector('svg'),
                        };
                    }).filter(b => b.isVisible && b.y > 400);
                });
                
                log(`[图片上传] 页面下半部分找到 ${bottomButtons.length} 个按钮`);
                
                // 查找 + 按钮（附件按钮）
                const plusBtnInfo = bottomButtons.find(b => 
                    b.ariaLabel.toLowerCase().includes('attach') || 
                    b.ariaLabel.includes('附件') || 
                    b.ariaLabel.includes('添加')
                ) || bottomButtons.find(b => 
                    b.text === '+' || b.text === ''
                ) || bottomButtons.find(b => 
                    b.width < 50 && b.height < 50 && b.x < 200
                );
                
                if (plusBtnInfo) {
                    log(`[图片上传] ✅ 找到+按钮: 位置(${plusBtnInfo.x},${plusBtnInfo.y})`);
                    
                    const fileChooserPromise = this.page.waitForEvent('filechooser', { timeout: 8000 });
                    
                    // 点击 + 按钮
                    await this.page.mouse.click(plusBtnInfo.x + plusBtnInfo.width / 2, plusBtnInfo.y + plusBtnInfo.height / 2);
                    await sleep(800);
                    
                    // 查找并点击「添加照片和文件」菜单项
                    log('[图片上传] 查找"添加照片和文件"菜单项...');
                    const addPhotoClicked = await this.page.evaluate(() => {
                        const keywords = ['添加照片', '添加文件', '照片和文件', 'Upload file', 'Attach file', 'Upload from computer'];
                        const allElements = document.querySelectorAll('div, span, button, li, a, [role="menuitem"]');
                        for (const el of allElements) {
                            const text = (el.innerText || el.textContent || '').trim();
                            const rect = el.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0 && keywords.some(k => text.includes(k))) {
                                el.click();
                                return { clicked: true, text: text.substring(0, 40) };
                            }
                        }
                        return { clicked: false };
                    });
                    
                    if (addPhotoClicked.clicked) {
                        log(`[图片上传] ✅ 点击了菜单项: "${addPhotoClicked.text}"`);
                    } else {
                        log('[图片上传] ⚠️ 未找到"添加照片和文件"菜单项', 'WARN');
                    }
                    
                    const fileChooser = await fileChooserPromise;
                    log('[图片上传] ✅ 捕获到 filechooser 事件');
                    
                    await fileChooser.setFiles(imagePaths);
                    log(`[图片上传] ✅ 方案2成功: 已设置 ${imagePaths.length} 个文件`);
                    fileUploaded = true;
                } else {
                    log('[图片上传] ❌ 方案2: 未找到+按钮', 'WARN');
                }
            } catch (fcError) {
                log(`[图片上传] ⚠️ 方案2失败: ${fcError.message}`, 'WARN');
                // 关闭可能打开的菜单
                try {
                    await this.page.keyboard.press('Escape');
                    await sleep(300);
                } catch (e) { /* 忽略 */ }
            }
        }
        
        // 方案3（最终兜底）: 用 JS 模拟拖放文件到输入框
        if (!fileUploaded) {
            try {
                log('[图片上传] 方案3: JS 模拟文件拖放...');
                const fs = require('fs');
                
                // 读取所有图片为 base64
                const fileBuffers = imagePaths.map(p => ({
                    name: require('path').basename(p),
                    buffer: fs.readFileSync(p).toString('base64'),
                    type: p.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
                }));
                
                await this.page.evaluate((files) => {
                    // 找到拖放目标（输入框区域）
                    const target = document.querySelector('#prompt-textarea') || 
                                   document.querySelector('textarea') ||
                                   document.querySelector('[contenteditable="true"]') ||
                                   document.body;
                    
                    // 构造 DataTransfer 对象
                    const dataTransfer = new DataTransfer();
                    for (const f of files) {
                        const byteChars = atob(f.buffer);
                        const byteArray = new Uint8Array(byteChars.length);
                        for (let i = 0; i < byteChars.length; i++) {
                            byteArray[i] = byteChars.charCodeAt(i);
                        }
                        const file = new File([byteArray], f.name, { type: f.type });
                        dataTransfer.items.add(file);
                    }
                    
                    // 依次触发拖放事件
                    const events = ['dragenter', 'dragover', 'drop'];
                    for (const eventName of events) {
                        const event = new DragEvent(eventName, {
                            bubbles: true,
                            cancelable: true,
                            dataTransfer: dataTransfer,
                        });
                        target.dispatchEvent(event);
                    }
                    
                    return { success: true };
                }, fileBuffers);
                
                log('[图片上传] ✅ 方案3: 拖放事件已触发');
                fileUploaded = true;
                
            } catch (dropError) {
                log(`[图片上传] ❌ 方案3失败: ${dropError.message}`, 'ERROR');
            }
        }
        
        if (!fileUploaded) {
            throw new Error('所有图片上传方案均失败（setInputFiles / filechooser / 拖放）');
        }
        
        // ─── 步骤2: 等待图片上传完成 ───
        log('[图片上传] 步骤2: 等待图片上传完成...');
        await sleep(3000);
        
        let uploadCheckCount = 0;
        const maxUploadWait = 30;
        while (uploadCheckCount < maxUploadWait) {
            const stillUploading = await this.page.evaluate(() => {
                const spinners = document.querySelectorAll('[class*="spinner"], [class*="loading"], [class*="progress"], [class*="uploading"]');
                for (const s of spinners) {
                    const rect = s.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) return true;
                }
                return false;
            });
            
            if (!stillUploading) {
                log(`[图片上传] ✅ 上传完成（等待了 ${3 + uploadCheckCount}秒）`);
                break;
            }
            
            uploadCheckCount++;
            if (uploadCheckCount % 5 === 0) {
                log(`[图片上传] ⏳ 仍在上传中... (${3 + uploadCheckCount}秒)`);
            }
            await sleep(1000);
        }
        
        await sleep(2000);

        // ─── 步骤3: 输入 prompt 文字 ───
        log('[文字输入] 步骤3: 输入 prompt 文字...');
        
        // 🛡️ 输入前再次关闭弹窗（这是最常出问题的地方！）
        await this.closeLayuiPopups();
        
        const inputSelectors = [
            '#prompt-textarea',
            'textarea[placeholder*="询问"]',
            'textarea[placeholder*="问题"]',
            'textarea[placeholder*="message"]',
            '[contenteditable="true"]',
            'textarea',
        ];
        
        let inputElement = null;
        for (const selector of inputSelectors) {
            try {
                inputElement = await this.page.$(selector);
                if (inputElement) {
                    const isVisible = await inputElement.isVisible();
                    if (isVisible) {
                        log(`[文字输入] 找到输入框: ${selector}`);
                        break;
                    }
                    inputElement = null;
                }
            } catch (e) { continue; }
        }
        
        if (!inputElement) {
            throw new Error('找不到消息输入框（图片上传后）');
        }
        
        // 🛡️ 使用 JS click 代替 Playwright click，避免被弹窗拦截
        // Playwright 的 click() 会检测元素是否被遮挡，如果有弹窗就会一直重试直到超时
        // 而 JS 的 click() / focus() 可以穿透遮挡层直接操作
        try {
            await inputElement.click({ timeout: 5000 });
        } catch (clickErr) {
            log(`[文字输入] ⚠️ 普通click失败(${clickErr.message.substring(0, 50)})，尝试JS focus...`, 'WARN');
            // 再次关闭弹窗
            await this.closeLayuiPopups();
            await sleep(300);
            // 使用 JS focus 绕过遮挡检测
            await this.page.evaluate(() => {
                const input = document.querySelector('#prompt-textarea') || 
                              document.querySelector('textarea[placeholder]') ||
                              document.querySelector('textarea') ||
                              document.querySelector('[contenteditable="true"]');
                if (input) {
                    input.focus();
                    input.click();
                }
            });
        }
        await sleep(500);
        
        let inputSuccess = false;
        
        // 方式1: fill
        try {
            log('[文字输入] 方式1: Playwright fill...');
            const freshInput = await this.page.$('#prompt-textarea') || 
                               await this.page.$('textarea[placeholder]') ||
                               await this.page.$('textarea');
            if (freshInput) {
                // 使用 JS focus 代替 click，避免弹窗拦截
                await this.page.evaluate(() => {
                    const input = document.querySelector('#prompt-textarea') || 
                                  document.querySelector('textarea[placeholder]') ||
                                  document.querySelector('textarea');
                    if (input) input.focus();
                });
                await sleep(200);
                await this.page.keyboard.press('Control+A');
                await this.page.keyboard.press('Backspace');
                await sleep(200);
                await freshInput.fill(message);
                await sleep(500);
                
                const verifyResult = await this.page.evaluate(() => {
                    const input = document.querySelector('#prompt-textarea') || 
                                  document.querySelector('textarea[placeholder]') ||
                                  document.querySelector('textarea');
                    if (!input) return { length: 0 };
                    const val = input.value || input.textContent || '';
                    return { length: val.length };
                });
                
                if (verifyResult.length > 10) {
                    inputSuccess = true;
                    log('[文字输入] ✅ 方式1成功');
                }
            }
        } catch (e) {
            log(`[文字输入] ❌ 方式1失败: ${e.message}`);
        }
        
        // 方式2: evaluate
        if (!inputSuccess) {
            try {
                log('[文字输入] 方式2: evaluate 直接设置...');
                const evalResult = await this.page.evaluate((msg) => {
                    const input = document.querySelector('#prompt-textarea') || 
                                  document.querySelector('textarea[placeholder]') ||
                                  document.querySelector('textarea');
                    if (!input) return { success: false };
                    input.focus();
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLTextAreaElement.prototype, 'value'
                    ).set;
                    nativeInputValueSetter.call(input, msg);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    return { success: true, length: input.value.length };
                }, message);
                
                if (evalResult.success && evalResult.length > 10) {
                    inputSuccess = true;
                    log('[文字输入] ✅ 方式2成功');
                }
            } catch (e) {
                log(`[文字输入] ❌ 方式2失败: ${e.message}`);
            }
        }
        
        // 方式3: type
        if (!inputSuccess) {
            try {
                log('[文字输入] 方式3: type 逐字输入...');
                const freshInput = await this.page.$('#prompt-textarea') || 
                                   await this.page.$('textarea[placeholder]') ||
                                   await this.page.$('textarea');
                if (freshInput) {
                    await this.page.evaluate(() => {
                        const input = document.querySelector('#prompt-textarea') || 
                                      document.querySelector('textarea[placeholder]') ||
                                      document.querySelector('textarea');
                        if (input) input.focus();
                    });
                    await this.page.keyboard.press('Control+A');
                    await this.page.keyboard.press('Backspace');
                    await sleep(200);
                    await freshInput.type(message, { delay: 5 });
                    await sleep(300);
                    inputSuccess = true;
                    log('[文字输入] ✅ 方式3完成');
                }
            } catch (e) {
                log(`[文字输入] ❌ 方式3失败: ${e.message}`);
            }
        }
        
        log(`[文字输入] 最终结果: ${inputSuccess ? '✅ 成功' : '❌ 失败'}`);
        
        if (!inputSuccess) {
            log('[文字输入] 输入验证失败，但继续尝试发送...', 'WARN');
        }

        // ─── 步骤4: 发送消息 ───
        log('[发送] 步骤4: 发送消息...');
        
        // 🛡️ 发送前再次关闭弹窗
        await this.closeLayuiPopups();
        
        let sendClicked = await this.clickSendButton();
        if (!sendClicked) {
            log('[发送] 未找到发送按钮，尝试按Enter...');
            await this.page.keyboard.press('Enter');
        }
        
        await sleep(2000);
        
        const sendSuccess = await this.checkMessageSent(message);
        if (!sendSuccess) {
            log('[发送] 发送可能未成功，重试...', 'WARN');
            await this.page.keyboard.press('Enter');
            await sleep(2000);
        }
        
        log('[发送] ✅ 消息已发送，等待AI响应...');

        // ─── 步骤5: 等待 AI 响应 ───
        log('[响应] 步骤5: 等待AI响应（Thinking模型可能需要较长时间）...');
        const response = await this.waitForResponse();
        
        log('========== sendMessageWithImages v1.2 完成 ==========');
        return response;
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