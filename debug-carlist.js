/**
 * 调试脚本 - 检查sorryios.ai页面结构
 * 运行后浏览器会打开，你可以手动查看页面元素
 */

const { chromium } = require('playwright');

const CONFIG = {
    username: 'zzj382037951',
    password: '你的密码',  // 请填入实际密码
    loginUrl: 'https://sorryios.ai/pastel/#/login',
    carlistUrl: 'https://sorryios.ai/pastel/#/carlist',
};

async function debug() {
    console.log('启动浏览器（可视化模式）...');
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // 访问carlist页面
    console.log('访问 carlist 页面...');
    await page.goto(CONFIG.carlistUrl, { waitUntil: 'networkidle' });
    
    // 等待2秒让页面加载
    await page.waitForTimeout(2000);

    // 检查是否需要登录
    if (page.url().includes('login')) {
        console.log('需要登录，开始登录...');
        
        // 填写登录信息
        await page.fill('input[type="text"]', CONFIG.username);
        await page.fill('input[type="password"]', CONFIG.password);
        
        // 点击登录
        await page.click('button[type="submit"], button:has-text("登录")');
        
        // 等待跳转
        await page.waitForURL('**/carlist**', { timeout: 30000 });
        console.log('登录成功！');
    }

    // 等待页面完全加载
    await page.waitForTimeout(3000);

    // 打印页面上所有包含"空闲"的元素
    console.log('\n========== 查找包含"空闲"的元素 ==========');
    const idleElements = await page.evaluate(() => {
        const elements = [];
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.includes('空闲')) {
                const parent = node.parentElement;
                elements.push({
                    text: node.textContent.trim(),
                    tagName: parent.tagName,
                    className: parent.className,
                    id: parent.id,
                    parentTag: parent.parentElement?.tagName,
                    parentClass: parent.parentElement?.className,
                });
            }
        }
        return elements;
    });

    console.log('找到 ' + idleElements.length + ' 个包含"空闲"的元素：');
    idleElements.forEach((el, i) => {
        console.log(`\n[${i + 1}] 文本: "${el.text}"`);
        console.log(`    标签: <${el.tagName.toLowerCase()}>`);
        console.log(`    class: "${el.className}"`);
        console.log(`    id: "${el.id}"`);
        console.log(`    父元素: <${el.parentTag?.toLowerCase()}> class="${el.parentClass}"`);
    });

    // 打印表格结构（如果有）
    console.log('\n========== 查找表格结构 ==========');
    const tables = await page.evaluate(() => {
        const tables = document.querySelectorAll('table');
        return Array.from(tables).map(t => ({
            rows: t.rows.length,
            className: t.className,
            firstRowCells: t.rows[0] ? Array.from(t.rows[0].cells).map(c => c.textContent.trim()) : [],
        }));
    });

    if (tables.length > 0) {
        tables.forEach((t, i) => {
            console.log(`表格 ${i + 1}: ${t.rows} 行, class="${t.className}"`);
            console.log(`  表头: ${t.firstRowCells.join(' | ')}`);
        });
    } else {
        console.log('没有找到 <table> 元素');
    }

    // 打印可点击的按钮
    console.log('\n========== 查找可能的"进入"按钮 ==========');
    const buttons = await page.evaluate(() => {
        const btns = document.querySelectorAll('button, a, [role="button"], .btn');
        return Array.from(btns).slice(0, 20).map(b => ({
            text: b.textContent.trim().substring(0, 30),
            tagName: b.tagName,
            className: b.className,
        }));
    });

    buttons.forEach((b, i) => {
        console.log(`[${i + 1}] <${b.tagName.toLowerCase()}> "${b.text}" class="${b.className}"`);
    });

    console.log('\n========== 调试完成 ==========');
    console.log('浏览器保持打开状态，你可以：');
    console.log('1. 按 F12 打开开发者工具检查元素');
    console.log('2. 手动点击页面测试');
    console.log('3. 按 Ctrl+C 关闭脚本');
    
    // 保持浏览器打开
    await page.waitForTimeout(300000); // 等待5分钟
    await browser.close();
}

debug().catch(console.error);
