/**
 * 匹配问题诊断脚本
 * 用于深入分析为什么 structure 字段匹配失败
 * 
 * 运行方法：
 * cd D:\sorryios-test\backend\services
 * node diagnose-matching-issue.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 颜色输出
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// 数据库路径
const DB_PATH = path.join(__dirname, '..', 'data', 'grammar.db');

// ============================================
// 测试用例
// ============================================
const TEST_CASES = [
    {
        name: '测试1: tell sb. to do sth.',
        input: 'tell sb. to do sth.',
        expectedGrammarId: 32,
        expectedTitle: 'say/tell/speak/talk辨析'
    },
    {
        name: '测试2: it is adj. to do sth.',
        input: 'it is adj. to do sth.',
        expectedGrammarId: 29,
        expectedTitle: 'it的用法'
    },
    {
        name: '测试3: it is adj. for sb. to do sth.',
        input: 'it is adj. for sb. to do sth.',
        expectedGrammarId: 29,
        expectedTitle: 'it的用法'
    }
];

// ============================================
// 归一化函数（从 matchingService.js 复制）
// ============================================
function normalizePattern(text) {
    if (!text) return '';
    
    let normalized = text.toLowerCase().trim();
    
    // 1. 去除括号及其内容
    normalized = normalized.replace(/\([^)]*\)/g, ' ');
    
    // 2. 统一占位符格式
    normalized = normalized.replace(/\b(sb|somebody|someone)\.?\b/gi, 'sb.');
    normalized = normalized.replace(/\b(sth|something)\.?\b/gi, 'sth.');
    normalized = normalized.replace(/\b(adj|adjective)\.?\b/gi, 'adj.');
    normalized = normalized.replace(/\b(adv|adverb)\.?\b/gi, 'adv.');
    normalized = normalized.replace(/\b(v-ing|v\.ing|v\. ing)\b/gi, 'doing');
    normalized = normalized.replace(/\bto\s+v\.?\b/gi, 'to do');
    normalized = normalized.replace(/\b(ones|one's)\b/gi, "one's");
    
    // 3. 去除加号、斜杠等连接符
    normalized = normalized.replace(/\s*\+\s*/g, ' ');
    normalized = normalized.replace(/\s*\/\s*/g, ' ');
    normalized = normalized.replace(/\s*\|\s*/g, ' ');
    
    // 4. 去除多余的点号
    normalized = normalized.replace(/\.{2,}/g, '.');
    
    // 5. 去除其他多余的标点
    normalized = normalized.replace(/[,，;；]/g, ' ');
    
    // 6. 统一空格
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    return normalized;
}

// ============================================
// 智能匹配函数（从 matchingService.js 复制并增强）
// ============================================
function smartPatternMatch(userText, templateText, verbose = true) {
    const userNormalized = normalizePattern(userText);
    const templateNormalized = normalizePattern(templateText);
    
    if (verbose) {
        log(`\n${'─'.repeat(80)}`, 'cyan');
        log(`[智能匹配测试]`, 'cyan');
        log(`  原始用户输入: "${userText}"`, 'blue');
        log(`  归一化后:     "${userNormalized}"`, 'blue');
        log(`  原始模板:     "${templateText}"`, 'magenta');
        log(`  归一化后:     "${templateNormalized}"`, 'magenta');
    }
    
    // 1. 完全相等
    if (userNormalized === templateNormalized) {
        if (verbose) log(`  ✅ 结果: 完全相等`, 'green');
        return { matched: true, reason: '完全相等' };
    }
    
    // 2. 将模板转换为正则表达式
    let pattern = templateNormalized
        // 先替换占位符为特殊标记
        .replace(/\badj\./g, '__ADJ__')
        .replace(/\badv\./g, '__ADV__')
        .replace(/\bbe\b/g, '__BE__')
        .replace(/\bdoing\b/g, '__DOING__')
        .replace(/\bsb\./g, '__SB__')
        .replace(/\bsth\./g, '__STH__')
        .replace(/\bto\s+do\b/g, '__TODO__');
    
    if (verbose) log(`  步骤1: 替换占位符 → "${pattern}"`, 'yellow');
    
    // 然后转义所有正则特殊字符
    pattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    
    if (verbose) log(`  步骤2: 转义特殊字符 → "${pattern}"`, 'yellow');
    
    // 最后将标记替换为正则模式
    pattern = pattern
        .replace(/__ADJ__/g, '\\w+')  // 【问题点】这里可能有bug
        .replace(/__ADV__/g, '\\w+')
        .replace(/__BE__/g, '(?:is|am|are|was|were|be)')
        .replace(/__DOING__/g, '\\w+ing')
        .replace(/__SB__/g, 'sb\\.?')
        .replace(/__STH__/g, 'sth\\.?')
        .replace(/__TODO__/g, 'to\\s+\\w+');
    
    if (verbose) log(`  步骤3: 生成正则模式 → "${pattern}"`, 'yellow');
    
    // 3. 添加开始锚点
    pattern = '^' + pattern;
    
    // 4. 测试匹配
    try {
        const regex = new RegExp(pattern, 'i');
        if (verbose) log(`  最终正则表达式: /${pattern}/i`, 'yellow');
        
        const result = regex.test(userNormalized);
        
        if (verbose) {
            if (result) {
                log(`  ✅ 结果: 正则匹配成功`, 'green');
            } else {
                log(`  ❌ 结果: 正则匹配失败`, 'red');
                log(`  原因分析:`, 'red');
                
                // 详细分析为什么失败
                if (userNormalized.includes('adj.')) {
                    log(`    - 用户输入包含 "adj." (带点号)`, 'red');
                    log(`    - 正则模式 "\\\\w+" 不匹配点号!`, 'red');
                    log(`    - 这是一个BUG!`, 'red');
                }
            }
        }
        
        return { matched: result, reason: result ? '正则匹配' : '正则不匹配', pattern };
    } catch (e) {
        if (verbose) log(`  ❌ 正则错误: ${e.message}`, 'red');
        return { matched: false, reason: `正则错误: ${e.message}` };
    }
}

// ============================================
// 数据库查询
// ============================================
async function queryGrammar(grammarId) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                reject(err);
                return;
            }
            
            db.get(
                'SELECT id, title, structure, usage, keywords FROM grammar WHERE id = ?',
                [grammarId],
                (err, row) => {
                    db.close();
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    });
}

// ============================================
// 诊断函数
// ============================================
async function diagnoseCase(testCase) {
    log(`\n${'='.repeat(100)}`, 'blue');
    log(`${testCase.name}`, 'blue');
    log(`${'='.repeat(100)}`, 'blue');
    
    log(`\n[步骤1] 查询数据库记录 #${testCase.expectedGrammarId}`, 'cyan');
    
    try {
        const record = await queryGrammar(testCase.expectedGrammarId);
        
        if (!record) {
            log(`❌ 错误: 数据库中找不到记录 #${testCase.expectedGrammarId}`, 'red');
            return;
        }
        
        log(`✅ 记录存在`, 'green');
        log(`  ID: ${record.id}`, 'white');
        log(`  Title: ${record.title}`, 'white');
        log(`  Structure: ${record.structure}`, 'white');
        
        // 解析 keywords
        let keywords = [];
        try {
            if (typeof record.keywords === 'string') {
                keywords = JSON.parse(record.keywords);
            } else if (Array.isArray(record.keywords)) {
                keywords = record.keywords;
            }
        } catch (e) {
            // keywords 可能不是 JSON
        }
        log(`  Keywords: ${keywords.join(', ')}`, 'white');
        
        // ============================================
        // [步骤2] 测试归一化
        // ============================================
        log(`\n[步骤2] 测试归一化`, 'cyan');
        const userNormalized = normalizePattern(testCase.input);
        log(`  输入: "${testCase.input}"`, 'blue');
        log(`  归一化结果: "${userNormalized}"`, 'green');
        
        // ============================================
        // [步骤3] 检查 structure 字段
        // ============================================
        log(`\n[步骤3] 检查 structure 字段`, 'cyan');
        
        if (!record.structure) {
            log(`❌ 警告: structure 字段为空`, 'red');
            return;
        }
        
        // 分割 structure
        const structures = record.structure.split(/[/|;、]/).map(s => s.trim()).filter(Boolean);
        log(`  Structure 包含 ${structures.length} 个模式:`, 'white');
        structures.forEach((s, i) => {
            log(`    [${i}] ${s}`, 'white');
        });
        
        // ============================================
        // [步骤4] 逐个测试智能匹配
        // ============================================
        log(`\n[步骤4] 逐个测试智能匹配`, 'cyan');
        
        let matchFound = false;
        
        for (let i = 0; i < structures.length; i++) {
            const struct = structures[i];
            const cleanedStruct = struct.replace(/\s*\+\s*/g, ' ').trim();
            
            log(`\n  [测试 ${i + 1}/${structures.length}] "${cleanedStruct}"`, 'magenta');
            
            const result = smartPatternMatch(testCase.input, cleanedStruct, true);
            
            if (result.matched) {
                matchFound = true;
                log(`\n  🎉 找到匹配！`, 'green');
                break;
            }
        }
        
        if (!matchFound) {
            log(`\n  ❌ 所有 structure 模式都不匹配`, 'red');
        }
        
        // ============================================
        // [步骤5] 检查 usage 字段（如果有）
        // ============================================
        if (record.usage) {
            log(`\n[步骤5] 检查 usage 字段`, 'cyan');
            
            let usageArray = [];
            if (Array.isArray(record.usage)) {
                usageArray = record.usage;
            } else if (typeof record.usage === 'string') {
                try {
                    usageArray = JSON.parse(record.usage);
                } catch (e) {
                    usageArray = [record.usage];
                }
            }
            
            log(`  Usage 包含 ${usageArray.length} 条`, 'white');
            
            for (let i = 0; i < usageArray.length; i++) {
                const usage = usageArray[i];
                if (typeof usage !== 'string') continue;
                
                log(`    [${i}] ${usage.substring(0, 100)}${usage.length > 100 ? '...' : ''}`, 'white');
                
                // 从 usage 中提取句型
                const parts = usage.split(/[,，;；。.、]/);
                
                for (let part of parts) {
                    part = part.trim();
                    
                    // 检查是否包含占位符
                    if (!/\b(sb\.?|sth\.?|adj\.?|adv\.?|to\s+do|doing)\b/i.test(part)) {
                        continue;
                    }
                    
                    // 去除冒号前的描述
                    part = part.replace(/^[^:：]*[:：]\s*/, '');
                    
                    if (part.length > 5) {
                        log(`      提取句型: "${part}"`, 'yellow');
                        const result = smartPatternMatch(testCase.input, part, false);
                        if (result.matched) {
                            log(`      ✅ 匹配成功！`, 'green');
                            matchFound = true;
                        }
                    }
                }
            }
        }
        
        // ============================================
        // [总结]
        // ============================================
        log(`\n${'─'.repeat(100)}`, 'cyan');
        if (matchFound) {
            log(`✅ 诊断结果: 找到匹配`, 'green');
        } else {
            log(`❌ 诊断结果: 未找到匹配`, 'red');
            log(`\n可能的原因:`, 'yellow');
            log(`  1. 智能匹配的正则表达式有bug（不支持点号）`, 'yellow');
            log(`  2. structure 字段的分隔符不正确`, 'yellow');
            log(`  3. 归一化逻辑有问题`, 'yellow');
        }
        log(`${'─'.repeat(100)}`, 'cyan');
        
    } catch (err) {
        log(`❌ 错误: ${err.message}`, 'red');
        console.error(err);
    }
}

// ============================================
// 主函数
// ============================================
async function main() {
    log(`${'='.repeat(100)}`, 'blue');
    log(`匹配问题诊断脚本`, 'blue');
    log(`${'='.repeat(100)}`, 'blue');
    log(`\n数据库路径: ${DB_PATH}`, 'white');
    
    // 依次测试每个用例
    for (const testCase of TEST_CASES) {
        await diagnoseCase(testCase);
        await new Promise(resolve => setTimeout(resolve, 100)); // 短暂延迟，便于阅读
    }
    
    log(`\n${'='.repeat(100)}`, 'blue');
    log(`诊断完成`, 'blue');
    log(`${'='.repeat(100)}`, 'blue');
    
    log(`\n📋 诊断报告总结:`, 'cyan');
    log(`1. 检查数据库内容是否正确`, 'white');
    log(`2. 测试归一化函数是否工作`, 'white');
    log(`3. 测试智能匹配的正则表达式`, 'white');
    log(`4. 分析匹配失败的具体原因`, 'white');
    log(`\n如果发现bug，将在下一步提供修复方案。`, 'yellow');
}

// 执行
main().catch(err => {
    log(`\n❌ 致命错误: ${err.message}`, 'red');
    console.error(err);
    process.exit(1);
});
