/**
 * matchingService v4.5.4 测试脚本
 * 
 * 测试目标：验证跨表查找功能是否正常工作
 * 测试用例：10个具有代表性的测试数据
 * 
 * 使用方法：
 * cd D:\sorryios-test\backend
 * node test-matching-v4.5.4.js
 */

const { getMatchingService } = require('./services/matchingService');

console.log('='.repeat(100));
console.log('matchingService v4.5.4 功能测试');
console.log('测试目标：验证跨表查找功能');
console.log('='.repeat(100));

// 测试用例定义
const testCases = [
    {
        id: 1,
        name: '原问题：spend time doing sth. (AI识别为pattern)',
        input: 'spend time doing sth.',
        type: 'pattern',
        expected: {
            matched: true,
            source_table: 'phrases',  // 期望从phrases表匹配
            matched_text_contains: 'spend time/money',  // 期望包含这个文本
            score_min: 0.85  // 期望分数 >= 85%
        },
        description: '测试AI分类错误时的跨表查找功能'
    },
    {
        id: 2,
        name: 'spend time doing sth. (正确识别为phrase)',
        input: 'spend time doing sth.',
        type: 'phrase',
        expected: {
            matched: true,
            source_table: 'phrases',
            matched_text_contains: 'spend',
            score_min: 0.85
        },
        description: '测试正确分类时的匹配'
    },
    {
        id: 3,
        name: 'be good at (短语)',
        input: 'be good at',
        type: 'phrase',
        expected: {
            matched: true,
            source_table: 'phrases',
            score_min: 0.85
        },
        description: '测试常见短语的匹配'
    },
    {
        id: 4,
        name: 'be good at (错误识别为pattern)',
        input: 'be good at',
        type: 'pattern',
        expected: {
            matched: true,
            source_table: 'phrases',  // 应该从phrases表找到
            score_min: 0.85
        },
        description: '测试短语被错误识别为句型时的跨表查找'
    },
    {
        id: 5,
        name: 'It is + adj. + for sb. to do sth. (句型)',
        input: 'It is + adj. + for sb. to do sth.',
        type: 'pattern',
        expected: {
            matched: true,
            score_min: 0.85
        },
        description: '测试句型的正常匹配（可能在grammar库）'
    },
    {
        id: 6,
        name: 'make sb. do sth. (句型)',
        input: 'make sb. do sth.',
        type: 'pattern',
        expected: {
            matched: true,
            score_min: 0.85
        },
        description: '测试常见句型的匹配'
    },
    {
        id: 7,
        name: 'look forward to doing sth. (短语)',
        input: 'look forward to doing sth.',
        type: 'phrase',
        expected: {
            matched: true,
            source_table: 'phrases',
            score_min: 0.85
        },
        description: '测试包含doing的短语'
    },
    {
        id: 8,
        name: 'used to do sth. (短语)',
        input: 'used to do sth.',
        type: 'phrase',
        expected: {
            matched: true,
            score_min: 0.85
        },
        description: '测试常见短语'
    },
    {
        id: 9,
        name: 'help sb. (with) sth. (短语被识别为pattern)',
        input: 'help sb. (with) sth.',
        type: 'pattern',
        expected: {
            matched: true,
            score_min: 0.70  // 可能相似度稍低
        },
        description: '测试复杂短语的跨表查找'
    },
    {
        id: 10,
        name: 'as soon as (短语)',
        input: 'as soon as',
        type: 'phrase',
        expected: {
            matched: true,
            source_table: 'phrases',
            score_min: 0.85
        },
        description: '测试简单连接短语'
    }
];

// 初始化服务
let matchingService;
try {
    matchingService = getMatchingService();
    console.log('\n✅ matchingService 加载成功');
} catch (e) {
    console.error('\n❌ matchingService 加载失败:', e.message);
    console.error('请确保在 backend 目录下运行此脚本：');
    console.error('  cd D:\\sorryios-test\\backend');
    console.error('  node test-matching-v4.5.4.js');
    process.exit(1);
}

// 开始测试
console.log('\n' + '='.repeat(100));
console.log('开始测试（共 ' + testCases.length + ' 个用例）');
console.log('='.repeat(100));

let passedCount = 0;
let failedCount = 0;
const results = [];

for (const testCase of testCases) {
    console.log('\n' + '-'.repeat(100));
    console.log(`测试用例 ${testCase.id}/${testCases.length}: ${testCase.name}`);
    console.log('-'.repeat(100));
    console.log(`输入: "${testCase.input}"`);
    console.log(`类型: ${testCase.type}`);
    console.log(`说明: ${testCase.description}`);
    
    let result;
    let passed = false;
    let failReason = '';
    
    try {
        // 根据类型调用不同的匹配方法
        if (testCase.type === 'word') {
            result = matchingService.matchWord(testCase.input);
        } else if (testCase.type === 'phrase') {
            result = matchingService.matchPhrase(testCase.input);
        } else if (testCase.type === 'pattern') {
            result = matchingService.matchPattern(testCase.input);
        } else if (testCase.type === 'grammar') {
            result = matchingService.matchGrammar(testCase.input);
        }
        
        console.log('\n匹配结果:');
        console.log(`  Matched: ${result.matched}`);
        console.log(`  Score: ${result.score ? (result.score * 100).toFixed(1) + '%' : 'N/A'}`);
        
        if (result.matched) {
            console.log(`  Source: ${result.source_db}.${result.source_table}`);
            console.log(`  ID: ${result.source_id}`);
            console.log(`  Matched Text: ${result.matched_text}`);
            
            if (result.fromReplaceDict) {
                console.log(`  ✅ 来自替换规则`);
            }
        }
        
        // 验证结果
        const checks = [];
        
        // 检查1：是否匹配到
        if (testCase.expected.matched !== undefined) {
            if (result.matched === testCase.expected.matched) {
                checks.push({ name: '匹配状态', passed: true });
            } else {
                checks.push({ name: '匹配状态', passed: false, expected: testCase.expected.matched, actual: result.matched });
                failReason += `期望matched=${testCase.expected.matched}，实际=${result.matched}; `;
            }
        }
        
        // 检查2：来源表
        if (testCase.expected.source_table && result.matched) {
            if (result.source_table === testCase.expected.source_table) {
                checks.push({ name: '来源表', passed: true });
            } else {
                checks.push({ name: '来源表', passed: false, expected: testCase.expected.source_table, actual: result.source_table });
                failReason += `期望source_table=${testCase.expected.source_table}，实际=${result.source_table}; `;
            }
        }
        
        // 检查3：匹配文本包含
        if (testCase.expected.matched_text_contains && result.matched) {
            if (result.matched_text && result.matched_text.toLowerCase().includes(testCase.expected.matched_text_contains.toLowerCase())) {
                checks.push({ name: '匹配文本', passed: true });
            } else {
                checks.push({ name: '匹配文本', passed: false, expected: `包含"${testCase.expected.matched_text_contains}"`, actual: result.matched_text });
                failReason += `期望包含"${testCase.expected.matched_text_contains}"，实际="${result.matched_text}"; `;
            }
        }
        
        // 检查4：分数
        if (testCase.expected.score_min !== undefined && result.matched) {
            if (result.score >= testCase.expected.score_min) {
                checks.push({ name: '匹配分数', passed: true });
            } else {
                checks.push({ name: '匹配分数', passed: false, expected: `>= ${testCase.expected.score_min * 100}%`, actual: `${(result.score * 100).toFixed(1)}%` });
                failReason += `期望分数>=${testCase.expected.score_min * 100}%，实际=${(result.score * 100).toFixed(1)}%; `;
            }
        }
        
        // 判断是否通过
        passed = checks.every(check => check.passed);
        
        console.log('\n验证结果:');
        checks.forEach(check => {
            if (check.passed) {
                console.log(`  ✅ ${check.name}: 通过`);
            } else {
                console.log(`  ❌ ${check.name}: 失败`);
                console.log(`     期望: ${check.expected}`);
                console.log(`     实际: ${check.actual}`);
            }
        });
        
    } catch (error) {
        console.error(`\n❌ 执行出错: ${error.message}`);
        failReason = `执行异常: ${error.message}`;
    }
    
    if (passed) {
        console.log(`\n🎉 测试用例 ${testCase.id}: 通过`);
        passedCount++;
    } else {
        console.log(`\n❌ 测试用例 ${testCase.id}: 失败`);
        if (failReason) {
            console.log(`   失败原因: ${failReason}`);
        }
        failedCount++;
    }
    
    results.push({
        id: testCase.id,
        name: testCase.name,
        passed,
        failReason,
        result
    });
}

// 输出测试总结
console.log('\n' + '='.repeat(100));
console.log('测试总结');
console.log('='.repeat(100));

console.log(`\n总测试数: ${testCases.length}`);
console.log(`✅ 通过: ${passedCount} (${(passedCount/testCases.length*100).toFixed(1)}%)`);
console.log(`❌ 失败: ${failedCount} (${(failedCount/testCases.length*100).toFixed(1)}%)`);

if (failedCount > 0) {
    console.log('\n失败的测试用例:');
    results.filter(r => !r.passed).forEach(r => {
        console.log(`  [${r.id}] ${r.name}`);
        console.log(`      ${r.failReason}`);
    });
}

console.log('\n' + '='.repeat(100));

if (passedCount === testCases.length) {
    console.log('🎉🎉🎉 所有测试通过！v4.5.4 修改成功！');
    console.log('='.repeat(100));
    process.exit(0);
} else if (passedCount >= testCases.length * 0.8) {
    console.log('⚠️ 大部分测试通过，但仍有失败项需要检查');
    console.log('='.repeat(100));
    process.exit(1);
} else {
    console.log('❌ 测试失败，请检查修改是否正确');
    console.log('='.repeat(100));
    process.exit(1);
}
