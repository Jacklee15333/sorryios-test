/**
 * 句型验证器测试脚本
 * 文件位置: backend/test_pattern_validator.js
 * 
 * 用法:
 *   cd D:\sorryios-test\backend
 *   node test_pattern_validator.js
 * 
 * @version 1.0
 * @date 2026-02-02
 */

const { getPatternValidator } = require('../services/patternValidator');

// ============================================
// 测试用例
// ============================================

const TEST_CASES = {
    // 第1组: 应该被排除的简单疑问句（20个）
    SHOULD_BE_EXCLUDED: [
        // 特殊疑问句 - what
        "what is sth.",
        "what is your name",
        "what are you doing",
        "what do you think",
        "what did you see",
        
        // 特殊疑问句 - who
        "who is sb.",
        "who is that",
        "who are they",
        
        // 特殊疑问句 - where/when/why
        "where is it",
        "where do you live",
        "when is the meeting",
        "why is this important",
        
        // 特殊疑问句 - how
        "how is the weather",
        "how old are you",
        "how long is it",
        "how many books",
        
        // 一般疑问句
        "do you like it",
        "does he know",
        "is this your book",
        "can you help me",
    ],
    
    // 第2组: 应该被保留的特殊句型（20个）
    SHOULD_BE_KEPT: [
        // there be句型（包括疑问形式）
        "there be sth.",
        "there is a book",
        "Is there a book?",
        
        // it形式主语
        "it is adj. to do sth.",
        "it is adj. for sb. to do sth.",
        "it takes sb. time to do sth.",
        
        // 特殊固定搭配
        "so adj. that...",
        "too adj. to do",
        "not only...but also...",
        "either...or...",
        
        // 使役动词
        "make sb. do sth.",
        "let sb. do sth.",
        "have sb. do sth.",
        
        // 感官动词
        "see sb. do sth.",
        "hear sb. doing sth.",
        
        // 特殊功能疑问句
        "Why not do sth.?",
        "How about doing sth.?",
        
        // 感叹句
        "What a adj. n.!",
        "How adj. ...!",
        
        // spend句型
        "spend time doing sth.",
    ]
};

// ============================================
// 测试函数
// ============================================

function runTests() {
    console.log('\n' + '═'.repeat(80));
    console.log('                     句型验证器测试');
    console.log('═'.repeat(80));
    console.log(`测试时间: ${new Date().toLocaleString('zh-CN')}`);
    console.log('═'.repeat(80) + '\n');
    
    const validator = getPatternValidator();
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    
    const failedCases = [];
    
    // ===== 测试第1组：应该被排除的 =====
    console.log('─'.repeat(80));
    console.log('第1组: 应该被排除的简单疑问句（20个）');
    console.log('─'.repeat(80) + '\n');
    
    TEST_CASES.SHOULD_BE_EXCLUDED.forEach((pattern, index) => {
        totalTests++;
        const result = validator.validate(pattern);
        const testNumber = `[${index + 1}/20]`;
        
        console.log(`${testNumber} 测试: "${pattern}"`);
        console.log(`    结果: ${result.valid ? '✅ 通过' : '❌ 被排除'}`);
        console.log(`    原因: ${result.reason}`);
        
        // 期望：应该被排除（valid = false）
        if (!result.valid) {
            console.log(`    ✅ 测试通过 - 正确识别为普通疑问句\n`);
            passedTests++;
        } else {
            console.log(`    ❌ 测试失败 - 应该被排除但没有被排除\n`);
            failedTests++;
            failedCases.push({
                group: '第1组',
                pattern: pattern,
                expected: '应该被排除',
                actual: '未被排除',
                reason: result.reason
            });
        }
    });
    
    // ===== 测试第2组：应该被保留的 =====
    console.log('\n' + '─'.repeat(80));
    console.log('第2组: 应该被保留的特殊句型（20个）');
    console.log('─'.repeat(80) + '\n');
    
    TEST_CASES.SHOULD_BE_KEPT.forEach((pattern, index) => {
        totalTests++;
        const result = validator.validate(pattern);
        const testNumber = `[${index + 1}/20]`;
        
        console.log(`${testNumber} 测试: "${pattern}"`);
        console.log(`    结果: ${result.valid ? '✅ 通过' : '❌ 被排除'}`);
        console.log(`    原因: ${result.reason}`);
        
        // 期望：应该被保留（valid = true）
        if (result.valid) {
            console.log(`    ✅ 测试通过 - 正确识别为特殊句型\n`);
            passedTests++;
        } else {
            console.log(`    ❌ 测试失败 - 应该被保留但被排除了\n`);
            failedTests++;
            failedCases.push({
                group: '第2组',
                pattern: pattern,
                expected: '应该被保留',
                actual: '被排除',
                reason: result.reason
            });
        }
    });
    
    // ===== 测试总结 =====
    console.log('\n' + '═'.repeat(80));
    console.log('                     测试总结');
    console.log('═'.repeat(80));
    console.log(`总测试数: ${totalTests}`);
    console.log(`✅ 通过: ${passedTests} (${(passedTests/totalTests*100).toFixed(1)}%)`);
    console.log(`❌ 失败: ${failedTests} (${(failedTests/totalTests*100).toFixed(1)}%)`);
    console.log('═'.repeat(80));
    
    if (failedTests > 0) {
        console.log('\n❌ 失败的测试用例详情:\n');
        failedCases.forEach((testCase, index) => {
            console.log(`[${index + 1}] ${testCase.group} - "${testCase.pattern}"`);
            console.log(`    期望: ${testCase.expected}`);
            console.log(`    实际: ${testCase.actual}`);
            console.log(`    原因: ${testCase.reason}\n`);
        });
    } else {
        console.log('\n🎉 恭喜！所有测试用例都通过了！\n');
    }
    
    // ===== 返回测试结果 =====
    return {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        passRate: (passedTests/totalTests*100).toFixed(1) + '%',
        success: failedTests === 0
    };
}

// ============================================
// 执行测试
// ============================================

if (require.main === module) {
    try {
        const result = runTests();
        
        // 退出代码：0表示成功，1表示失败
        process.exit(result.success ? 0 : 1);
    } catch (error) {
        console.error('\n❌ 测试执行失败:');
        console.error(error);
        process.exit(1);
    }
}

module.exports = { runTests, TEST_CASES };
