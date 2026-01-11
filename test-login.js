/**
 * Sorryios.ai 自动化测试脚本
 * 功能：测试登录、选择AI账号、发送消息、获取回复
 * 
 * 使用方法：
 * 1. 先修改下面的账号密码
 * 2. 在PowerShell中运行: node test-login.js
 */

const { chromium } = require('playwright');

// ============ 在这里填写你的账号密码 ============
const CONFIG = {
    username: 'zzj382037951',      // 改成你的账号
    password: 'zzj12345',      // 改成你的密码
    testMessage: '你好，请介绍一下你自己',  // 测试发送的消息
};
// ===============================================

async function main() {
    console.log('🚀 启动浏览器...');
    
    // 启动浏览器（headless: false 表示显示浏览器窗口，方便你观察）
    const browser = await chromium.launch({
        headless: false,  // 设为true则隐藏浏览器窗口
        slowMo: 500,      // 每个操作间隔500毫秒，方便观察
    });
    
    // 创建新的浏览器上下文（可以保存cookie）
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
    });
    
    // 创建新页面
    const page = await context.newPage();
    
    try {
        // ========== 步骤1: 访问登录页 ==========
        console.log('📍 步骤1: 访问登录页...');
        await page.goto('https://sorryios.ai/pastel/#/login');
        await page.waitForLoadState('networkidle');
        
        // 截图保存
        await page.screenshot({ path: 'screenshot-01-login-page.png' });
        console.log('   ✅ 已截图: screenshot-01-login-page.png');
        
        // ========== 步骤2: 检查是否已登录 ==========
        console.log('📍 步骤2: 检查登录状态...');
        
        // 等待2秒看页面是否跳转
        await page.waitForTimeout(2000);
        
        const currentUrl = page.url();
        console.log('   当前URL:', currentUrl);
        
        if (currentUrl.includes('carlist')) {
            console.log('   ✅ 已经是登录状态，跳过登录步骤');
        } else {
            // ========== 步骤3: 执行登录 ==========
            console.log('📍 步骤3: 执行登录...');
            
            // 查找并填写账号（尝试多种选择器）
            const usernameInput = await page.locator('input[type="text"], input[placeholder*="账号"], input[placeholder*="用户"], input[name="username"]').first();
            await usernameInput.fill(CONFIG.username);
            console.log('   ✅ 已填写账号');
            
            // 查找并填写密码
            const passwordInput = await page.locator('input[type="password"]').first();
            await passwordInput.fill(CONFIG.password);
            console.log('   ✅ 已填写密码');
            
            // 截图
            await page.screenshot({ path: 'screenshot-02-filled-form.png' });
            
            // 查找并点击登录按钮
            const loginButton = await page.locator('button:has-text("登录"), button:has-text("Login"), button[type="submit"]').first();
            await loginButton.click();
            console.log('   ✅ 已点击登录按钮');
            
            // 等待页面跳转
            await page.waitForTimeout(3000);
            await page.waitForLoadState('networkidle');
            
            // 截图
            await page.screenshot({ path: 'screenshot-03-after-login.png' });
            console.log('   ✅ 已截图: screenshot-03-after-login.png');
        }
        
        // ========== 步骤4: 进入carlist页面 ==========
        console.log('📍 步骤4: 进入账号列表页...');
        
        // 如果不在carlist页面，手动导航
        if (!page.url().includes('carlist')) {
            await page.goto('https://sorryios.ai/pastel/#/carlist');
            await page.waitForLoadState('networkidle');
        }
        
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'screenshot-04-carlist.png' });
        console.log('   ✅ 已截图: screenshot-04-carlist.png');
        
        // ========== 步骤5: 查找空闲的卡片并点击 ==========
        console.log('📍 步骤5: 查找空闲账号...');
        
        // 查找包含"空闲"文字的卡片
        const freeCards = await page.locator('text=空闲').all();
        console.log(`   找到 ${freeCards.length} 个空闲账号`);
        
        if (freeCards.length > 0) {
            // 点击第一个空闲账号的父元素（卡片）
            const firstFreeCard = freeCards[0];
            // 获取卡片的父元素（整个可点击区域）
            const cardElement = await firstFreeCard.locator('xpath=ancestor::div[contains(@class,"card") or contains(@class,"item") or @role="button"]').first();
            
            // 如果找不到父元素，直接点击空闲文字
            try {
                await cardElement.click();
            } catch (e) {
                // 尝试点击空闲文字旁边的区域
                await firstFreeCard.click();
            }
            
            console.log('   ✅ 已点击第一个空闲账号');
        } else {
            // 如果找不到"空闲"文字，尝试点击第一个卡片
            console.log('   ⚠️ 未找到空闲标记，尝试点击第一个卡片...');
            const allCards = await page.locator('[class*="card"], [class*="item"]').all();
            if (allCards.length > 0) {
                await allCards[0].click();
            }
        }
        
        // 等待页面跳转到AI界面
        await page.waitForTimeout(3000);
        await page.waitForLoadState('networkidle');
        
        await page.screenshot({ path: 'screenshot-05-ai-interface.png' });
        console.log('   ✅ 已截图: screenshot-05-ai-interface.png');
        
        // ========== 步骤6: 发送测试消息 ==========
        console.log('📍 步骤6: 发送测试消息...');
        console.log(`   消息内容: "${CONFIG.testMessage}"`);
        
        // 查找输入框（多种可能的选择器）
        const inputSelectors = [
            'textarea',
            'input[type="text"]',
            '[contenteditable="true"]',
            '[placeholder*="问"]',
            '[placeholder*="输入"]',
            '[placeholder*="message"]',
        ];
        
        let inputBox = null;
        for (const selector of inputSelectors) {
            const element = await page.locator(selector).last();
            if (await element.isVisible()) {
                inputBox = element;
                console.log(`   ✅ 找到输入框: ${selector}`);
                break;
            }
        }
        
        if (inputBox) {
            await inputBox.fill(CONFIG.testMessage);
            await page.screenshot({ path: 'screenshot-06-message-filled.png' });
            
            // 查找发送按钮
            const sendButton = await page.locator('button:has-text("发送"), button:has-text("Send"), button[type="submit"], button:has(svg)').last();
            
            // 或者直接按Enter发送
            await inputBox.press('Enter');
            console.log('   ✅ 已发送消息（按Enter）');
            
            // ========== 步骤7: 等待AI响应 ==========
            console.log('📍 步骤7: 等待AI响应...');
            
            // 等待响应（最多等60秒）
            await page.waitForTimeout(10000);  // 先等10秒
            
            await page.screenshot({ path: 'screenshot-07-ai-response.png' });
            console.log('   ✅ 已截图: screenshot-07-ai-response.png');
            
            // ========== 步骤8: 抓取响应内容 ==========
            console.log('📍 步骤8: 抓取AI响应...');
            
            // 获取页面所有文本（简单粗暴的方式）
            const pageContent = await page.content();
            
            // 尝试找到回复区域
            const responseSelectors = [
                '[class*="message"]',
                '[class*="response"]',
                '[class*="answer"]',
                '[class*="content"]',
            ];
            
            let responseText = '';
            for (const selector of responseSelectors) {
                const elements = await page.locator(selector).all();
                for (const el of elements) {
                    const text = await el.textContent();
                    if (text && text.length > 50) {  // 过滤掉太短的
                        responseText = text;
                        break;
                    }
                }
                if (responseText) break;
            }
            
            console.log('   AI响应内容预览:');
            console.log('   ' + (responseText || '未能抓取到响应').substring(0, 200) + '...');
        } else {
            console.log('   ❌ 未找到输入框');
        }
        
        // ========== 完成 ==========
        console.log('\n✅ 测试完成！');
        console.log('📁 请查看桌面 sorryios-test 文件夹中的截图文件');
        console.log('\n按 Ctrl+C 关闭浏览器，或等待30秒自动关闭...');
        
        // 保持浏览器打开30秒，让你观察
        await page.waitForTimeout(30000);
        
    } catch (error) {
        console.error('\n❌ 发生错误:', error.message);
        await page.screenshot({ path: 'screenshot-error.png' });
        console.log('   已保存错误截图: screenshot-error.png');
    } finally {
        await browser.close();
        console.log('🔒 浏览器已关闭');
    }
}

// 运行主函数
main().catch(console.error);
