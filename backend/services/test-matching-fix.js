/**
 * 匹配服务修复验证脚本
 * 用于测试 v4.5.3 修复是否生效
 * 
 * 使用方法：
 * 1. 将此文件放到 D:\sorryios-test\backend\services\
 * 2. 运行: node test-matching-fix.js
 */

const { getMatchingService } = require('./matchingService');
const { getGrammarService } = require('./grammarService');

console.log('\n' + '='.repeat(80));
console.log('🔧 匹配服务修复验证测试 v4.5.3');
console.log('='.repeat(80) + '\n');

// 初始化服务
const matchingService = getMatchingService();
const grammarService = getGrammarService();

// 测试用例
const testCases = [
    {
        type: 'pattern',
        text: 'tell sb. to do sth.',
        expectedSource: 'grammar',
        expectedTitle: 'say/tell/speak/talk辨析',
        description: '测试1：tell sb. to do sth. 应该匹配到语法库'
    },
    {
        type: 'pattern',
        text: 'it is adj. to do sth.',
        expectedSource: 'grammar',
        expectedTitle: 'it的用法',
        description: '测试2：it is adj. to do sth. 应该匹配到语法库'
    },
    {
        type: 'pattern',
        text: 'it is adj. for sb. to do sth.',
        expectedSource: 'grammar',
        expectedTitle: 'it的用法',
        description: '测试3：it is adj. for sb. to do sth. 应该匹配到语法库'
    },
    {
        type: 'pattern',
        text: 'it is better for sb. to do sth.',
        expectedSource: 'grammar',
        expectedTitle: 'it的用法',
        description: '测试4：it is better for sb. to do sth. 应该匹配到语法库'
    },
    {
        type: 'pattern',
        text: 'tell sb sth',
        expectedSource: 'grammar',
        expectedTitle: 'say/tell/speak/talk辨析',
        description: '测试5：不同格式 (无点号) 也应该匹配'
    }
];

// 运行测试
let passCount = 0;
let failCount = 0;

console.log('开始测试...\n');

for (let i = 0; i < testCases.length; i++) {
    const test = testCases[i];
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`${test.description}`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`输入: "${test.text}"`);
    console.log(`类型: ${test.type}`);
    
    try {
        // 执行匹配
        const result = test.type === 'pattern' 
            ? matchingService.matchPattern(test.text)
            : matchingService.matchGrammar(test.text);
        
        // 检查结果
        if (result.matched) {
            const isCorrectSource = result.source_db === test.expectedSource;
            const isCorrectTitle = result.matched_data?.title === test.expectedTitle;
            
            if (isCorrectSource && isCorrectTitle) {
                console.log(`✅ 测试通过`);
                console.log(`   匹配到: ${result.matched_data.title}`);
                console.log(`   来源: ${result.source_db}.${result.source_table}`);
                console.log(`   分数: ${(result.score * 100).toFixed(1)}%`);
                if (result.matchedStructure) {
                    console.log(`   匹配字段: structure ("${result.matchedStructure}")`);
                }
                if (result.matchedUsage) {
                    console.log(`   匹配字段: usage ("${result.matchedUsage}")`);
                }
                passCount++;
            } else {
                console.log(`❌ 测试失败`);
                console.log(`   期望: ${test.expectedSource} - ${test.expectedTitle}`);
                console.log(`   实际: ${result.source_db} - ${result.matched_data?.title || '未知'}`);
                failCount++;
            }
        } else {
            console.log(`❌ 测试失败 - 未匹配到任何结果`);
            console.log(`   最佳分数: ${(result.score * 100).toFixed(1)}%`);
            failCount++;
        }
    } catch (error) {
        console.log(`❌ 测试失败 - 发生错误`);
        console.log(`   错误信息: ${error.message}`);
        failCount++;
    }
}

// 输出总结
console.log('\n' + '='.repeat(80));
console.log('测试结果总结');
console.log('='.repeat(80));
console.log(`✅ 通过: ${passCount}/${testCases.length}`);
console.log(`❌ 失败: ${failCount}/${testCases.length}`);

if (failCount === 0) {
    console.log('\n🎉 所有测试通过！修复生效！');
} else {
    console.log('\n⚠️  部分测试失败，请检查修复是否正确部署');
}

console.log('='.repeat(80) + '\n');

// 额外检查：验证 normalizePattern 方法是否存在
console.log('\n' + '─'.repeat(80));
console.log('额外检查：normalizePattern 方法');
console.log('─'.repeat(80));

if (typeof matchingService.normalizePattern === 'function') {
    console.log('✅ normalizePattern 方法存在');
    
    // 测试归一化效果
    const testTexts = [
        'tell sb. to do sth.',
        'tell sb to do sth',
        'tell somebody to do something',
        'it is adj. to do sth.',
        'it is adj to do sth',
        'it is adjective to do sth',
        'it is better for sb. to do sth.',
        'it is better for sb to do sth',
        'It + be + adj. + for sb. + to do'
    ];
    
    console.log('\n归一化测试：');
    testTexts.forEach(text => {
        const normalized = matchingService.normalizePattern(text);
        console.log(`  "${text}" → "${normalized}"`);
    });
    
    // 检查第一组是否归一化为相同的结果
    const group1 = testTexts.slice(0, 3).map(t => matchingService.normalizePattern(t));
    const group2 = testTexts.slice(3, 6).map(t => matchingService.normalizePattern(t));
    const group3 = testTexts.slice(6, 9).map(t => matchingService.normalizePattern(t));
    
    const group1Same = group1.every(v => v === group1[0]);
    const group2Same = group2.every(v => v === group2[0]);
    const group3Same = group3.every(v => v === group3[0]);
    
    console.log('\n归一化结果检查：');
    console.log(`  Group 1 (tell...): ${group1Same ? '✅ 一致' : '❌ 不一致'}`);
    console.log(`  Group 2 (it is adj to do): ${group2Same ? '✅ 一致' : '❌ 不一致'}`);
    console.log(`  Group 3 (it is better for sb to do): ${group3Same ? '✅ 一致' : '❌ 不一致'}`);
    
    if (group1Same && group2Same && group3Same) {
        console.log('\n✅ 归一化功能正常');
    } else {
        console.log('\n⚠️  归一化可能有问题');
    }
} else {
    console.log('❌ normalizePattern 方法不存在');
    console.log('   修复可能未正确部署');
}

console.log('─'.repeat(80) + '\n');