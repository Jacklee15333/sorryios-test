/**
 * 快速验证脚本 - 验证修复是否生效
 * 
 * 运行方法：
 * cd D:\sorryios-test\backend\services
 * node verify-fix.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 引入修复后的 matchingService
const { getMatchingService } = require('./matchingService');

// 颜色输出
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// 测试用例
const TEST_CASES = [
    {
        name: '测试1: tell sb. to do sth.',
        input: 'tell sb. to do sth.',
        type: 'pattern',
        shouldMatch: true,
        expectedTitle: 'say/tell/speak/talk辨析'
    },
    {
        name: '测试2: it is adj. to do sth.',
        input: 'it is adj. to do sth.',
        type: 'pattern',
        shouldMatch: true,
        expectedTitle: 'it的用法'
    },
    {
        name: '测试3: it is adj. for sb. to do sth.',
        input: 'it is adj. for sb. to do sth.',
        type: 'pattern',
        shouldMatch: true,
        expectedTitle: 'it的用法'
    },
    {
        name: '测试4: it is better for sb. to do sth.',
        input: 'it is better for sb. to do sth.',
        type: 'pattern',
        shouldMatch: true,
        expectedTitle: 'it的用法'
    },
    {
        name: '测试5: tell sb sth',
        input: 'tell sb sth',
        type: 'pattern',
        shouldMatch: true,
        expectedTitle: 'say/tell/speak/talk辨析'
    }
];

async function runTests() {
    log('====================================================================================================', 'cyan');
    log('快速验证脚本 - v4.5.3.5 修复验证', 'cyan');
    log('====================================================================================================', 'cyan');
    
    const matchingService = getMatchingService();
    
    let passCount = 0;
    let failCount = 0;
    const results = [];
    
    for (const testCase of TEST_CASES) {
        log(`\n${testCase.name}`, 'cyan');
        log('─'.repeat(100));
        
        try {
            const result = matchingService.matchPattern(testCase.input);
            
            const matched = result && result.matched;
            const passed = matched === testCase.shouldMatch;
            
            if (passed && matched) {
                const title = result.matched_data?.title || '';
                log(`✅ 通过 - 匹配到: "${title}" (${(result.score * 100).toFixed(1)}%)`, 'green');
                passCount++;
                results.push({ test: testCase.name, status: 'PASS', title });
            } else if (passed && !matched) {
                log(`✅ 通过 - 正确未匹配`, 'green');
                passCount++;
                results.push({ test: testCase.name, status: 'PASS', title: 'N/A' });
            } else {
                log(`❌ 失败 - 预期匹配但未匹配`, 'red');
                failCount++;
                results.push({ test: testCase.name, status: 'FAIL', title: 'N/A' });
            }
        } catch (err) {
            log(`❌ 错误: ${err.message}`, 'red');
            failCount++;
            results.push({ test: testCase.name, status: 'ERROR', title: 'N/A' });
        }
    }
    
    // 总结
    log('\n====================================================================================================', 'cyan');
    log('测试结果总结', 'cyan');
    log('====================================================================================================', 'cyan');
    
    results.forEach((r, i) => {
        const status = r.status === 'PASS' ? '✅' : '❌';
        const color = r.status === 'PASS' ? 'green' : 'red';
        log(`  ${status} ${TEST_CASES[i].name}`, color);
        if (r.title !== 'N/A') {
            log(`     匹配到: ${r.title}`, 'yellow');
        }
    });
    
    log('');
    log(`通过: ${passCount}/${TEST_CASES.length}`, passCount === TEST_CASES.length ? 'green' : 'yellow');
    log(`失败: ${failCount}/${TEST_CASES.length}`, failCount === 0 ? 'green' : 'red');
    
    if (passCount === TEST_CASES.length) {
        log('\n🎉 所有测试通过！修复生效！', 'green');
        log('====================================================================================================', 'green');
        return true;
    } else {
        log('\n⚠️  部分测试失败，修复可能未完全生效', 'yellow');
        log('====================================================================================================', 'yellow');
        return false;
    }
}

// 执行测试
runTests().then(success => {
    process.exit(success ? 0 : 1);
}).catch(err => {
    log(`\n❌ 致命错误: ${err.message}`, 'red');
    console.error(err);
    process.exit(1);
});
