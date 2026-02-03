/**
 * 🧪 匹配服务测试脚本 - 50个测试案例
 * 
 * 文件位置: D:\sorryios-test\backend\tests\test_matching_scores.js
 * 
 * 运行方法:
 * cd D:\sorryios-test\backend
 * node tests/test_matching_scores.js
 * 
 * 测试目标: 验证修复后的匹配分数是否正确
 */

const { getMatchingService } = require('../services/matchingService');

// 颜色输出
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

// 测试结果统计
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// 测试案例定义
const testCases = [
    // ========================================
    // 分类1: 精确匹配 (应该100%) - 10个案例
    // ========================================
    {
        category: '精确匹配',
        type: 'word',
        input: 'important',
        expectedMatch: 'important',
        expectedScore: 1.0,
        tolerance: 0
    },
    {
        category: '精确匹配',
        type: 'word',
        input: 'environment',
        expectedMatch: 'environment',
        expectedScore: 1.0,
        tolerance: 0
    },
    {
        category: '精确匹配',
        type: 'word',
        input: 'protect',
        expectedMatch: 'protect',
        expectedScore: 1.0,
        tolerance: 0
    },
    {
        category: '精确匹配',
        type: 'word',
        input: 'become',
        expectedMatch: 'become',
        expectedScore: 1.0,
        tolerance: 0
    },
    {
        category: '精确匹配',
        type: 'word',
        input: 'energy',
        expectedMatch: 'energy',
        expectedScore: 1.0,
        tolerance: 0
    },
    {
        category: '精确匹配',
        type: 'phrase',
        input: 'be good at',
        expectedMatch: 'be good at',
        expectedScore: 1.0,
        tolerance: 0
    },
    {
        category: '精确匹配',
        type: 'phrase',
        input: 'look forward to',
        expectedMatch: 'look forward to',
        expectedScore: 1.0,
        tolerance: 0
    },
    {
        category: '精确匹配',
        type: 'pattern',
        input: 'too adj. to do sth.',
        expectedMatch: 'too adj. to do sth.',
        expectedScore: 1.0,
        tolerance: 0
    },
    {
        category: '精确匹配',
        type: 'word',
        input: 'finally',
        expectedMatch: 'finally',
        expectedScore: 1.0,
        tolerance: 0
    },
    {
        category: '精确匹配',
        type: 'word',
        input: 'exercise',
        expectedMatch: 'exercise',
        expectedScore: 1.0,
        tolerance: 0
    },

    // ========================================
    // 分类2: 词形还原 (应该98%) - 12个案例
    // ========================================
    {
        category: '词形还原',
        type: 'word',
        input: 'worse',
        expectedMatch: 'bad',
        expectedScore: 0.98,
        tolerance: 0.02
    },
    {
        category: '词形还原',
        type: 'word',
        input: 'better',
        expectedMatch: 'good',
        expectedScore: 0.98,
        tolerance: 0.02
    },
    {
        category: '词形还原',
        type: 'word',
        input: 'worker',
        expectedMatch: 'work',
        expectedScore: 0.98,
        tolerance: 0.02
    },
    {
        category: '词形还原',
        type: 'word',
        input: 'grew',
        expectedMatch: 'grow',
        expectedScore: 0.98,
        tolerance: 0.02
    },
    {
        category: '词形还原',
        type: 'word',
        input: 'grown',
        expectedMatch: 'grow',
        expectedScore: 0.98,
        tolerance: 0.02
    },
    {
        category: '词形还原',
        type: 'word',
        input: 'reading',
        expectedMatch: 'read',
        expectedScore: 0.98,
        tolerance: 0.02
    },
    {
        category: '词形还原',
        type: 'word',
        input: 'speaker',
        expectedMatch: 'speak',
        expectedScore: 0.98,
        tolerance: 0.02
    },
    {
        category: '词形还原',
        type: 'word',
        input: 'manager',
        expectedMatch: 'manage',
        expectedScore: 0.98,
        tolerance: 0.02
    },
    {
        category: '词形还原',
        type: 'word',
        input: 'foreigner',
        expectedMatch: 'foreign',
        expectedScore: 0.98,
        tolerance: 0.02
    },
    {
        category: '词形还原',
        type: 'word',
        input: 'teacher',
        expectedMatch: 'teach',
        expectedScore: 0.98,
        tolerance: 0.02
    },
    {
        category: '词形还原',
        type: 'word',
        input: 'others',
        expectedMatch: 'other',
        expectedScore: 0.98,
        tolerance: 0.02
    },
    {
        category: '词形还原',
        type: 'word',
        input: 'best',
        expectedMatch: 'good',
        expectedScore: 0.98,
        tolerance: 0.02
    },

    // ========================================
    // 分类3: 规范化匹配 (应该95-99%) - 12个案例
    // ========================================
    {
        category: '规范化匹配',
        type: 'word',
        input: 'mrs.',
        expectedMatch: 'Mrs',
        expectedScoreMin: 0.95,
        expectedScoreMax: 0.99,
        tolerance: 0.05
    },
    {
        category: '规范化匹配',
        type: 'word',
        input: 'mr.',
        expectedMatch: 'Mr',
        expectedScoreMin: 0.95,
        expectedScoreMax: 0.99,
        tolerance: 0.05
    },
    {
        category: '规范化匹配',
        type: 'phrase',
        input: 'talk to',
        expectedMatch: 'talk to sb.',
        expectedScoreMin: 0.90,
        expectedScoreMax: 0.99,
        tolerance: 0.05
    },
    {
        category: '规范化匹配',
        type: 'phrase',
        input: 'spend time doing sth.',
        expectedMatch: 'spend time (in) doing sth.',
        expectedScoreMin: 0.95,
        expectedScoreMax: 0.99,
        tolerance: 0.05
    },
    {
        category: '规范化匹配',
        type: 'pattern',
        input: 'more and more adj.',
        expectedMatch: 'more and more + adj.',
        expectedScoreMin: 0.95,
        expectedScoreMax: 0.99,
        tolerance: 0.05
    },
    {
        category: '规范化匹配',
        type: 'pattern',
        input: 'make sb. adj.',
        expectedMatch: 'make sb/sth. adj.',
        expectedScoreMin: 0.90,
        expectedScoreMax: 0.99,
        tolerance: 0.05
    },
    {
        category: '规范化匹配',
        type: 'phrase',
        input: 'for the rich',
        expectedMatch: 'the rich',
        expectedScoreMin: 0.85,
        expectedScoreMax: 0.99,
        tolerance: 0.05
    },
    {
        category: '规范化匹配',
        type: 'word',
        input: 'U.S.A.',
        expectedMatch: 'USA',
        expectedScoreMin: 0.95,
        expectedScoreMax: 0.99,
        tolerance: 0.05
    },
    {
        category: '规范化匹配',
        type: 'phrase',
        input: 'be interested in',
        expectedMatch: 'be interested in sth.',
        expectedScoreMin: 0.90,
        expectedScoreMax: 0.99,
        tolerance: 0.05
    },
    {
        category: '规范化匹配',
        type: 'phrase',
        input: 'ask sb to do',
        expectedMatch: 'ask sb. to do sth.',
        expectedScoreMin: 0.85,
        expectedScoreMax: 0.99,
        tolerance: 0.05
    },
    {
        category: '规范化匹配',
        type: 'pattern',
        input: 'it is adj to do',
        expectedMatch: 'it is adj. to do sth.',
        expectedScoreMin: 0.85,
        expectedScoreMax: 0.99,
        tolerance: 0.05
    },
    {
        category: '规范化匹配',
        type: 'phrase',
        input: 'help sb do sth',
        expectedMatch: 'help sb. do sth.',
        expectedScoreMin: 0.90,
        expectedScoreMax: 0.99,
        tolerance: 0.05
    },

    // ========================================
    // 分类4: 中度相似 (应该85-94%) - 8个案例
    // ========================================
    {
        category: '中度相似',
        type: 'phrase',
        input: 'how to do',
        expectedMatch: 'how to do sth.',
        expectedScoreMin: 0.85,
        expectedScoreMax: 0.94,
        tolerance: 0.05
    },
    {
        category: '中度相似',
        type: 'phrase',
        input: 'want to do',
        expectedMatch: 'want to do sth.',
        expectedScoreMin: 0.85,
        expectedScoreMax: 0.94,
        tolerance: 0.05
    },
    {
        category: '中度相似',
        type: 'phrase',
        input: 'begin to',
        expectedMatch: 'begin to do sth.',
        expectedScoreMin: 0.85,
        expectedScoreMax: 0.94,
        tolerance: 0.05
    },
    {
        category: '中度相似',
        type: 'phrase',
        input: 'try to',
        expectedMatch: 'try to do sth.',
        expectedScoreMin: 0.85,
        expectedScoreMax: 0.94,
        tolerance: 0.05
    },
    {
        category: '中度相似',
        type: 'phrase',
        input: 'decide to',
        expectedMatch: 'decide to do sth.',
        expectedScoreMin: 0.85,
        expectedScoreMax: 0.94,
        tolerance: 0.05
    },
    {
        category: '中度相似',
        type: 'pattern',
        input: 'too adj to do',
        expectedMatch: 'too adj. to do sth.',
        expectedScoreMin: 0.85,
        expectedScoreMax: 0.94,
        tolerance: 0.05
    },
    {
        category: '中度相似',
        type: 'pattern',
        input: 'so adj that',
        expectedMatch: 'so adj. that...',
        expectedScoreMin: 0.85,
        expectedScoreMax: 0.94,
        tolerance: 0.05
    },
    {
        category: '中度相似',
        type: 'phrase',
        input: 'keep doing',
        expectedMatch: 'keep doing sth.',
        expectedScoreMin: 0.85,
        expectedScoreMax: 0.94,
        tolerance: 0.05
    },

    // ========================================
    // 分类5: 低相似/不匹配 (应该<85%) - 8个案例
    // ========================================
    {
        category: '低相似/不匹配',
        type: 'word',
        input: 'firstly',
        expectedMatch: null,
        expectedScoreMax: 0.84,
        tolerance: 0.1
    },
    {
        category: '低相似/不匹配',
        type: 'word',
        input: 'circuit',
        expectedMatch: null,
        expectedScoreMax: 0.84,
        tolerance: 0.1
    },
    {
        category: '低相似/不匹配',
        type: 'word',
        input: 'xyzabc',
        expectedMatch: null,
        expectedScoreMax: 0.84,
        tolerance: 0.1
    },
    {
        category: '低相似/不匹配',
        type: 'phrase',
        input: 'completely unknown phrase',
        expectedMatch: null,
        expectedScoreMax: 0.84,
        tolerance: 0.1
    },
    {
        category: '低相似/不匹配',
        type: 'word',
        input: 'randomword123',
        expectedMatch: null,
        expectedScoreMax: 0.84,
        tolerance: 0.1
    },
    {
        category: '低相似/不匹配',
        type: 'phrase',
        input: 'never seen before phrase',
        expectedMatch: null,
        expectedScoreMax: 0.84,
        tolerance: 0.1
    },
    {
        category: '低相似/不匹配',
        type: 'word',
        input: 'uniqueword999',
        expectedMatch: null,
        expectedScoreMax: 0.84,
        tolerance: 0.1
    },
    {
        category: '低相似/不匹配',
        type: 'word',
        input: 'brandnewword',
        expectedMatch: null,
        expectedScoreMax: 0.84,
        tolerance: 0.1
    }
];

/**
 * 运行单个测试
 */
function runTest(testCase, index) {
    totalTests++;
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`${colors.cyan}测试 #${index + 1}/${testCases.length} - ${testCase.category}${colors.reset}`);
    console.log(`输入: "${testCase.input}" (${testCase.type})`);
    
    const matchingService = getMatchingService();
    let result;
    
    // 根据类型调用不同的匹配方法
    try {
        switch (testCase.type) {
            case 'word':
                result = matchingService.matchWord(testCase.input);
                break;
            case 'phrase':
                result = matchingService.matchPhrase(testCase.input);
                break;
            case 'pattern':
                result = matchingService.matchPattern(testCase.input);
                break;
            case 'grammar':
                result = matchingService.matchGrammar(testCase.input);
                break;
            default:
                throw new Error(`未知类型: ${testCase.type}`);
        }
    } catch (error) {
        console.log(`${colors.red}❌ 测试失败: ${error.message}${colors.reset}`);
        failedTests++;
        return;
    }
    
    // 验证结果
    const actualScore = result.score || 0;
    const actualMatch = result.matched_text || null;
    
    console.log(`结果: ${result.matched ? '匹配' : '未匹配'}`);
    console.log(`  匹配文本: ${actualMatch || 'null'}`);
    console.log(`  实际分数: ${(actualScore * 100).toFixed(2)}%`);
    
    // 判断是否通过
    let passed = false;
    
    if (testCase.expectedMatch === null) {
        // 期望不匹配
        if (testCase.expectedScoreMax !== undefined) {
            passed = actualScore <= testCase.expectedScoreMax;
            console.log(`  期望分数: <=${(testCase.expectedScoreMax * 100).toFixed(0)}%`);
        } else {
            passed = !result.matched;
            console.log(`  期望: 不匹配`);
        }
    } else if (testCase.expectedScore !== undefined) {
        // 期望精确分数
        const diff = Math.abs(actualScore - testCase.expectedScore);
        passed = diff <= testCase.tolerance && actualMatch === testCase.expectedMatch;
        console.log(`  期望分数: ${(testCase.expectedScore * 100).toFixed(0)}% (容差: ±${(testCase.tolerance * 100).toFixed(0)}%)`);
        console.log(`  期望匹配: ${testCase.expectedMatch}`);
    } else if (testCase.expectedScoreMin !== undefined && testCase.expectedScoreMax !== undefined) {
        // 期望分数范围
        passed = actualScore >= testCase.expectedScoreMin && 
                 actualScore <= testCase.expectedScoreMax &&
                 (actualMatch === testCase.expectedMatch || testCase.expectedMatch === null);
        console.log(`  期望分数: ${(testCase.expectedScoreMin * 100).toFixed(0)}%-${(testCase.expectedScoreMax * 100).toFixed(0)}%`);
        if (testCase.expectedMatch) {
            console.log(`  期望匹配: ${testCase.expectedMatch}`);
        }
    }
    
    if (passed) {
        console.log(`${colors.green}✅ 测试通过${colors.reset}`);
        passedTests++;
    } else {
        console.log(`${colors.red}❌ 测试失败${colors.reset}`);
        failedTests++;
    }
}

/**
 * 主测试函数
 */
function main() {
    console.log(`${'='.repeat(80)}`);
    console.log(`${colors.blue}🧪 匹配服务测试开始${colors.reset}`);
    console.log(`总测试案例: ${testCases.length}`);
    console.log(`${'='.repeat(80)}`);
    
    // 按分类分组测试
    const categories = [...new Set(testCases.map(t => t.category))];
    
    categories.forEach(category => {
        console.log(`\n\n${'█'.repeat(80)}`);
        console.log(`${colors.yellow}📂 分类: ${category}${colors.reset}`);
        console.log(`${'█'.repeat(80)}`);
        
        const categoryTests = testCases.filter(t => t.category === category);
        categoryTests.forEach((testCase, index) => {
            const globalIndex = testCases.indexOf(testCase);
            runTest(testCase, globalIndex);
        });
    });
    
    // 输出总结
    console.log(`\n\n${'='.repeat(80)}`);
    console.log(`${colors.blue}📊 测试结果总结${colors.reset}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`总测试数: ${totalTests}`);
    console.log(`${colors.green}通过: ${passedTests}${colors.reset}`);
    console.log(`${colors.red}失败: ${failedTests}${colors.reset}`);
    console.log(`通过率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    console.log(`${'='.repeat(80)}`);
    
    // 返回退出码
    process.exit(failedTests > 0 ? 1 : 0);
}

// 运行测试
main();
