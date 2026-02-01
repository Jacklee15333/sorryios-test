/**
 * 版本检查脚本 v2.0
 * 用于确认当前部署的 matchingService.js 版本
 * 智能区分代码和注释
 */

const fs = require('fs');
const path = require('path');

console.log('\n' + '='.repeat(80));
console.log('🔍 matchingService.js 版本检查 v2.0');
console.log('='.repeat(80) + '\n');

const filePath = path.join(__dirname, 'matchingService.js');

try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // 检查版本号
    const versionMatch = content.match(/v4\.5\.3\.\d+/);
    const version = versionMatch ? versionMatch[0] : '未知';
    
    console.log(`文件路径: ${filePath}`);
    console.log(`当前版本: ${version}\n`);
    
    // 检查关键方法是否存在
    const checks = [
        { name: 'normalizePattern', pattern: /normalizePattern\s*\(/ },
        { name: '_smartPatternMatch', pattern: /_smartPatternMatch\s*\(/ },
        { name: 'calculateSimilarity方法定义', pattern: /calculateSimilarity\s*\([^)]*\)\s*{/ }
    ];
    
    console.log('关键方法检查：');
    checks.forEach(check => {
        const exists = check.pattern.test(content);
        console.log(`  ${exists ? '✅' : '❌'} ${check.name}`);
    });
    
    // 检查代码中的实际调用（排除注释）
    console.log('\n代码调用检查（排除注释）：');
    
    // 去除所有注释
    let codeOnly = content
        .replace(/\/\*[\s\S]*?\*\//g, '')  // 去除 /* */ 注释
        .replace(/\/\/.*/g, '');            // 去除 // 注释
    
    const hasOldMethodCall = /this\.calculatePatternSimilarity\s*\(/.test(codeOnly);
    console.log(`  ${hasOldMethodCall ? '❌' : '✅'} calculatePatternSimilarity 调用 ${hasOldMethodCall ? '(存在bug！)' : '(无调用)'}`);
    
    const hasNewMethodCall = /this\.calculateSimilarity\s*\(/.test(codeOnly);
    console.log(`  ${hasNewMethodCall ? '✅' : '❌'} calculateSimilarity 调用 ${hasNewMethodCall ? '(正常)' : '(缺失)'}`);
    
    const hasSmartMatchCall = /this\._smartPatternMatch\s*\(/.test(codeOnly);
    console.log(`  ${hasSmartMatchCall ? '✅' : '❌'} _smartPatternMatch 调用 ${hasSmartMatchCall ? '(正常)' : '(缺失)'}`);
    
    // 归一化检查
    console.log('\n归一化逻辑检查：');
    const hasOldNormalizeBug = /replace\(\/\\\.{2,}\/g,\s*''\)/.test(codeOnly);
    console.log(`  ${hasOldNormalizeBug ? '❌' : '✅'} 点号处理 ${hasOldNormalizeBug ? '(旧版 - 删除多点)' : '(新版 - 保留单点)'}`);
    
    // 统计调用次数
    const oldCallCount = (codeOnly.match(/this\.calculatePatternSimilarity\s*\(/g) || []).length;
    const newCallCount = (codeOnly.match(/this\.calculateSimilarity\s*\(/g) || []).length;
    
    console.log(`\n调用统计：`);
    console.log(`  calculatePatternSimilarity: ${oldCallCount} 次 ${oldCallCount > 0 ? '❌ (需要修复)' : '✅'}`);
    console.log(`  calculateSimilarity: ${newCallCount} 次 ${newCallCount > 0 ? '✅' : '❌'}`);
    
    // 总结
    console.log('\n' + '='.repeat(80));
    
    const isCorrectVersion = version === 'v4.5.3.2' || version === 'v4.5.3.3';
    const noBugs = !hasOldMethodCall && !hasOldNormalizeBug;
    const hasFeatures = hasNewMethodCall && hasSmartMatchCall;
    
    if (isCorrectVersion && noBugs && hasFeatures) {
        console.log('✅ 完美！v4.5.3.2+ 正确部署');
        console.log('现在可以运行测试: node test-matching-fix.js');
    } else if (hasOldMethodCall) {
        console.log('❌ 严重问题：代码中仍在调用 calculatePatternSimilarity');
        console.log('这会导致运行时错误！');
        console.log('\n解决方案：');
        console.log('1. 重新下载 matchingService.js');
        console.log('2. 确保浏览器没有缓存旧文件（Ctrl+F5 刷新下载页面）');
        console.log('3. 完全替换旧文件');
        console.log('4. 重启服务后再次检查');
    } else if (!isCorrectVersion) {
        console.log(`⚠️  版本不匹配：${version}`);
        console.log('建议部署 v4.5.3.2 或更新版本');
    } else {
        console.log('⚠️  部分功能可能缺失');
        console.log('建议重新下载并部署 v4.5.3.2');
    }
    console.log('='.repeat(80) + '\n');
    
} catch (error) {
    console.error('❌ 错误:', error.message);
    console.log('\n请确保在 backend/services 目录下运行此脚本');
}