/**
 * Chrome 显示/隐藏 补丁脚本
 * 
 * 使用方法：在 backend 目录下运行
 *   node patch-chrome.js
 * 
 * 作用：修改 sorryios-automation.js，让 Chrome 浏览器支持 显示/隐藏 切换
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'lib', 'sorryios-automation.js');

console.log('====================================');
console.log('  Chrome 显示/隐藏 补丁');
console.log('====================================');

if (!fs.existsSync(filePath)) {
    console.log('❌ 找不到文件: ' + filePath);
    console.log('   请确保在 backend 目录下运行此脚本');
    process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

// 查找需要修改的代码
const oldCode = "args: CONFIG.desktopMode ? [";
const newCode = "args: CONFIG.desktopMode && !fs.existsSync(path.join(__dirname, '..', 'data', 'show-chrome.flag')) ? [";

if (content.includes(newCode)) {
    console.log('✅ 补丁已经应用过了，无需重复操作');
    process.exit(0);
}

if (!content.includes(oldCode)) {
    console.log('❌ 找不到需要修改的代码');
    console.log('   文件可能已被修改过，请手动检查');
    process.exit(1);
}

// 备份原文件
const backupPath = filePath + '.bak';
fs.writeFileSync(backupPath, content);
console.log('📋 已备份原文件: ' + backupPath);

// 应用补丁
content = content.replace(oldCode, newCode);
fs.writeFileSync(filePath, content);

console.log('✅ 补丁应用成功！');
console.log('');
console.log('效果说明:');
console.log('  - 在软件界面右键，可以看到「显示 Chrome」选项');
console.log('  - 点击后 Chrome 浏览器会出现在屏幕上');
console.log('  - 再次右键，会变成「隐藏 Chrome」选项');
console.log('  - 点击后 Chrome 浏览器隐藏到屏幕外');
console.log('');
console.log('====================================');
