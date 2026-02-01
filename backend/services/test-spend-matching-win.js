/**
 * 匹配问题诊断测试脚本 - Windows版本
 * 
 * 使用方法：
 * 1. 在 backend 目录下运行: node test-spend-matching-win.js
 * 
 * 功能：
 * - 测试 "spend time doing sth." 的完整匹配流程
 * - 输出详细的调试信息
 * - 帮助定位问题所在
 */

const path = require('path');

// 动态加载服务（支持从不同目录运行）
let matchingService, matchingDictService;

try {
    // 尝试直接加载（从backend目录运行）
    matchingService = require('./services/matchingService').getMatchingService();
    matchingDictService = require('./services/matchingDictService').getMatchingDictService();
} catch (e) {
    try {
        // 尝试从上级目录加载（从backend/services目录运行）
        matchingService = require('../services/matchingService').getMatchingService();
        matchingDictService = require('../services/matchingDictService').getMatchingDictService();
    } catch (e2) {
        console.error('❌ 无法加载服务模块');
        console.error('请确保在 backend 目录下运行此脚本：');
        console.error('  cd D:\\sorryios-test\\backend');
        console.error('  node test-spend-matching-win.js');
        process.exit(1);
    }
}

console.log('='.repeat(100));
console.log('匹配问题诊断测试 - Windows版本');
console.log('='.repeat(100));

// 测试输入
const TEST_CASES = [
    {
        name: '测试1：作为 pattern 类型',
        text: 'spend time doing sth.',
        type: 'pattern',
        method: 'matchPattern'
    },
    {
        name: '测试2：作为 grammar 类型',
        text: 'spend time doing sth.',
        type: 'grammar',
        method: 'matchGrammar'
    }
];

// 开启详细日志
matchingService.setVerboseLog(true);

for (const testCase of TEST_CASES) {
    console.log('\n' + '='.repeat(100));
    console.log(testCase.name);
    console.log('='.repeat(100));
    console.log(`输入: "${testCase.text}"`);
    console.log(`类型: ${testCase.type}`);
    console.log(`方法: ${testCase.method}()`);
    
    // 步骤1：检查替换规则
    console.log('\n' + '-'.repeat(100));
    console.log('步骤1：检查 matching.db 中的替换规则');
    console.log('-'.repeat(100));
    
    const rule = matchingDictService.findRule(testCase.text, testCase.type);
    if (rule) {
        console.log('✅ 找到精确匹配规则:');
        console.log(`  Rule ID: ${rule.id}`);
        console.log(`  Original Text: ${rule.original_text}`);
        console.log(`  Original Type: ${rule.original_type}`);
        console.log(`  Action: ${rule.action}`);
        console.log(`  Target Text: ${rule.target_text?.substring(0, 200)}${rule.target_text?.length > 200 ? '...' : ''}`);
        console.log(`  Notes: ${rule.notes || '(无)'}`);
        
        // 尝试解析JSON
        if (rule.target_text && rule.target_text.trim().startsWith('[')) {
            try {
                const items = JSON.parse(rule.target_text);
                console.log(`\n  目标词条 (${items.length} 个):`);
                items.forEach((item, index) => {
                    console.log(`    [${index + 1}] ${item.text} (${item.type}, ID ${item.id})`);
                    console.log(`        Meaning: ${item.meaning}`);
                });
            } catch (e) {
                console.log(`  ⚠️ 无法解析 target_text: ${e.message}`);
            }
        }
        
        console.log('\n  【预期行为】');
        console.log('  → 应该返回 replaced_multi: true');
        console.log('  → 应该调用 _processAndApplyReplaceRule()');
        console.log('  → 应该在 batchMatch() 中处理多词条替换');
        console.log('  → 最终返回目标短语数据，score=1.0');
        
    } else {
        console.log('❌ 未找到精确匹配规则');
        console.log('  → 将继续执行模糊匹配流程');
    }
    
    // 步骤2：执行匹配
    console.log('\n' + '-'.repeat(100));
    console.log('步骤2：执行匹配方法');
    console.log('-'.repeat(100));
    
    let matchResult;
    try {
        if (testCase.method === 'matchPattern') {
            matchResult = matchingService.matchPattern(testCase.text);
        } else if (testCase.method === 'matchGrammar') {
            matchResult = matchingService.matchGrammar(testCase.text);
        }
        
        console.log('\n匹配结果:');
        console.log(JSON.stringify(matchResult, null, 2));
        
        // 步骤3：分析结果
        console.log('\n' + '-'.repeat(100));
        console.log('步骤3：结果分析');
        console.log('-'.repeat(100));
        
        if (matchResult.replaced_multi) {
            console.log('✅ 返回了 replaced_multi: true');
            console.log(`  包含 ${matchResult.items?.length || 0} 个目标词条`);
            
            if (matchResult.items && matchResult.items.length > 0) {
                matchResult.items.forEach((item, index) => {
                    console.log(`\n  目标词条 [${index + 1}]:`);
                    console.log(`    Text: ${item.text}`);
                    console.log(`    Type: ${item.type}`);
                    console.log(`    ID: ${item.id}`);
                });
            }
            
        } else if (matchResult.replaced) {
            console.log('⚠️ 返回了 replaced: true (单词条替换)');
            console.log(`  Original: ${matchResult.original_text}`);
            console.log(`  Replace: ${matchResult.replace_text}`);
            
        } else if (matchResult.matched) {
            console.log(`⚠️ 返回了普通匹配结果`);
            console.log(`  Score: ${(matchResult.score * 100).toFixed(1)}%`);
            console.log(`  Source: ${matchResult.source_db}.${matchResult.source_table}`);
            console.log(`  ID: ${matchResult.source_id}`);
            console.log(`  Text: ${matchResult.matched_text}`);
            
            if (matchResult.source_db === 'grammar') {
                console.log('\n  ❌ 问题：匹配到了 grammar 库');
                console.log('  → 这不是期望的结果');
                console.log('  → 应该匹配到替换规则，返回 phrase 数据');
            }
            
        } else if (matchResult.excluded) {
            console.log('⚠️ 被排除（excluded）');
            console.log(`  Reason: ${matchResult.reason}`);
            
        } else {
            console.log('❌ 未匹配（matched: false）');
            console.log(`  Score: ${matchResult.score ? (matchResult.score * 100).toFixed(1) + '%' : 'N/A'}`);
        }
    } catch (error) {
        console.error('❌ 执行匹配时出错:', error.message);
        console.error(error.stack);
    }
}

// 测试3：测试 batchMatch
console.log('\n' + '='.repeat(100));
console.log('测试3：batchMatch 完整流程');
console.log('='.repeat(100));

const extractedData = {
    patterns: ['spend time doing sth.']
};

console.log('输入数据:', JSON.stringify(extractedData, null, 2));

try {
    const batchResult = matchingService.batchMatch(extractedData);

    console.log('\n批量匹配结果:');
    console.log(`  Matched: ${batchResult.matched.length} 条`);
    console.log(`  Unmatched: ${batchResult.unmatched.length} 条`);
    console.log(`  Replaced: ${batchResult.replaced.length} 条`);
    console.log(`  Excluded: ${batchResult.excluded.length} 条`);

    // 详细输出 matched 项
    if (batchResult.matched.length > 0) {
        console.log('\n' + '-'.repeat(100));
        console.log('Matched 项详情:');
        console.log('-'.repeat(100));
        
        batchResult.matched.forEach((item, index) => {
            console.log(`\n[${index + 1}] Type: ${item.item_type}`);
            console.log(`    Original: ${item.original_text}`);
            console.log(`    Score: ${(item.score * 100).toFixed(1)}%`);
            console.log(`    Source: ${item.source_db}.${item.source_table} (ID ${item.source_id})`);
            console.log(`    Matched Text: ${item.matched_text}`);
            
            if (item.fromReplaceDict) {
                console.log(`    ✅ 来自替换规则`);
            }
            if (item.fromMultiReplace) {
                console.log(`    ✅ 来自多词条替换`);
                console.log(`    Multi Replace Original: ${item.multiReplaceOriginal}`);
            }
            
            if (item.matched_data) {
                const data = item.matched_data;
                console.log(`    Data: ${JSON.stringify({
                    id: data.id,
                    text: data.word || data.phrase || data.pattern || data.title,
                    meaning: data.meaning || data.definition
                })}`);
            }
        });
    }

    // 详细输出 replaced 项
    if (batchResult.replaced.length > 0) {
        console.log('\n' + '-'.repeat(100));
        console.log('Replaced 项详情:');
        console.log('-'.repeat(100));
        
        batchResult.replaced.forEach((item, index) => {
            console.log(`\n[${index + 1}] Type: ${item.item_type}`);
            console.log(`    Original: ${item.original_text}`);
            
            if (item.replace_items) {
                console.log(`    Replace Items: ${item.replace_items.length} 个`);
                item.replace_items.forEach((ri, i) => {
                    console.log(`      [${i + 1}] ${ri.text} (${ri.type}, ID ${ri.id})`);
                });
            } else if (item.replace_text) {
                console.log(`    Replace Text: ${item.replace_text}`);
            }
        });
    }
} catch (error) {
    console.error('❌ 执行 batchMatch 时出错:', error.message);
    console.error(error.stack);
}

// 最终诊断
console.log('\n' + '='.repeat(100));
console.log('诊断结论');
console.log('='.repeat(100));

console.log('\n根据测试结果，请检查以下几点：\n');

console.log('1. 替换规则是否被正确找到？');
console.log('   → 查看"步骤1"的输出，确认 findRule() 是否返回了规则\n');

console.log('2. 如果找到了规则，matchPattern/matchGrammar 的返回值是什么？');
console.log('   → 查看"步骤2"的输出，确认是否返回 replaced_multi: true\n');

console.log('3. batchMatch 是否正确处理了 replaced_multi？');
console.log('   → 查看"测试3"的输出，确认 replaced 和 matched 数组的内容\n');

console.log('4. 如果匹配到了 grammar 库，相似度是多少？');
console.log('   → 查看 score 值，确认是否因为阈值问题导致误匹配\n');

console.log('='.repeat(100));
console.log('测试完成');
console.log('='.repeat(100));
