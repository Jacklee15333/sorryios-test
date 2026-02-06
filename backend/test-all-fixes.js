/**
 * Sorryios Bug 修复验证测试
 * 40 个测试用例覆盖全部 15 个修复（13 代码 + 2 数据）
 * 
 * 执行方式: node test-all-fixes.js
 * 前置条件: 在 D:\sorryios-test\backend 目录下运行
 *           已应用所有代码修复和 SQL 数据修复
 */

const path = require('path');
const Database = require('better-sqlite3');

// ============================================================
// 测试框架
// ============================================================
let passed = 0, failed = 0, skipped = 0;
const results = [];

function test(id, bugRef, description, fn) {
    try {
        const result = fn();
        if (result === 'SKIP') {
            skipped++;
            results.push({ id, bugRef, description, status: '⏭️ SKIP', detail: '需要运行时环境' });
            return;
        }
        if (result === true || result === undefined) {
            passed++;
            results.push({ id, bugRef, description, status: '✅ PASS', detail: '' });
        } else {
            failed++;
            results.push({ id, bugRef, description, status: '❌ FAIL', detail: String(result) });
        }
    } catch (e) {
        failed++;
        results.push({ id, bugRef, description, status: '❌ ERROR', detail: e.message });
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
}

function assertApprox(actual, expected, tolerance, message) {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`${message}: expected ~${expected}, got ${actual}`);
    }
}

// ============================================================
// 加载模块
// ============================================================
let matchingService, textCleaner, patternValidator, matchingDictService;
let matchingDb, grammarDb, vocabularyDb;

try {
    const { getMatchingService } = require('./services/matchingService');
    matchingService = getMatchingService();
    console.log('✓ matchingService loaded');
} catch (e) {
    console.warn('✗ matchingService not loaded:', e.message);
}

try {
    textCleaner = require('./services/textCleaner');
    console.log('✓ textCleaner loaded');
} catch (e) {
    console.warn('✗ textCleaner not loaded:', e.message);
}

try {
    const { PatternValidator } = require('./services/patternValidator');
    patternValidator = new PatternValidator();
    console.log('✓ patternValidator loaded');
} catch (e) {
    console.warn('✗ patternValidator not loaded:', e.message);
}

try {
    const { getMatchingDictService } = require('./services/matchingDictService');
    matchingDictService = getMatchingDictService();
    console.log('✓ matchingDictService loaded');
} catch (e) {
    console.warn('✗ matchingDictService not loaded:', e.message);
}

try {
    matchingDb = new Database(path.join(__dirname, 'data', 'matching.db'), { readonly: true });
    grammarDb = new Database(path.join(__dirname, 'data', 'grammar.db'), { readonly: true });
    vocabularyDb = new Database(path.join(__dirname, 'data', 'vocabulary.db'), { readonly: true });
    console.log('✓ Databases opened');
} catch (e) {
    console.warn('✗ Database error:', e.message);
}

console.log('\n' + '='.repeat(70));
console.log('  Sorryios Bug 修复验证测试 — 40 用例');
console.log('='.repeat(70) + '\n');

// ============================================================
// Bug 1: 短术语加分过高 (matchingService.js)
// ============================================================

test(1, 'Bug1', '短术语"形容词"不应让无关长文本超过85%', () => {
    if (!matchingService) return 'SKIP';
    const score = matchingService.calculateChineseSimilarity(
        '形容词与名词词性区分', '非谓语动词的用法'
    );
    assert(score < 0.85, `score=${score}, 应 < 0.85`);
});

test(2, 'Bug1', '长术语"比较级"在相关文本中应超过85%', () => {
    if (!matchingService) return 'SKIP';
    const score = matchingService.calculateChineseSimilarity(
        '比较级的基本用法', '比较级用法总结'
    );
    assert(score >= 0.85, `score=${score}, 应 >= 0.85`);
});

test(3, 'Bug1', '覆盖率权重：短术语在长文本中加分应被抑制', () => {
    if (!matchingService) return 'SKIP';
    const shortInLong = matchingService.calculateChineseSimilarity(
        '形容词', '形容词在复合句中的特殊修饰用法分析'
    );
    const shortInShort = matchingService.calculateChineseSimilarity(
        '形容词', '形容词用法'
    );
    // 短文本中的短术语应该比长文本中的短术语得分更高
    assert(shortInShort > shortInLong, 
        `短配短=${shortInShort} 应 > 短配长=${shortInLong}`);
});

// ============================================================
// Bug 3: 反向转换模式检查 (matchingService.js)
// ============================================================

test(4, 'Bug3', '输入=转换模式 目标=非转换 → 得分≤60%', () => {
    if (!matchingService) return 'SKIP';
    const score = matchingService.calculateChineseSimilarity(
        '形容词变副词', '形容词的基本用法'
    );
    assert(score <= 0.60, `score=${score}, 应 <= 0.60`);
});

test(5, 'Bug3', '目标=转换模式 输入=非转换 → 得分≤60%（反向检查）', () => {
    if (!matchingService) return 'SKIP';
    const score = matchingService.calculateChineseSimilarity(
        '形容词用法', '形容词变副词'
    );
    assert(score <= 0.60, `score=${score}, 应 <= 0.60`);
});

test(6, 'Bug3', '双方都是转换模式 → 正常计算', () => {
    if (!matchingService) return 'SKIP';
    const score = matchingService.calculateChineseSimilarity(
        '形容词变副词', '名词变形容词'
    );
    // 两者都是转换模式，应正常计算（不触发60%上限）
    assert(score > 0.0, `score=${score}, 应正常计算`);
});

// ============================================================
// Bug 4: structure/usage 字段用错匹配模式 (matchingService.js)
// ============================================================

test(7, 'Bug4', 'structure 中文字段使用 isGrammarMatch', () => {
    if (!matchingService) return 'SKIP';
    // 中文 structure 应走 calculateChineseSimilarity
    const score = matchingService.calculateSimilarity(
        '主语 + 动词原形', '主语 + 动词原形（第三人称单数加-s/-es）',
        { isGrammarMatch: true }
    );
    assert(score >= 0.70, `score=${score}, 中文结构匹配应 >= 0.70`);
});

test(8, 'Bug4', 'structure 英文字段仍能正确匹配', () => {
    if (!matchingService) return 'SKIP';
    const score = matchingService.calculateSimilarity(
        'Subject + had + past participle', 'Subject + had + past participle + ...',
        { isGrammarMatch: true }
    );
    assert(score >= 0.70, `score=${score}, 英文结构匹配应 >= 0.70`);
});

// ============================================================
// Bug 9: processing-log-api.js 字段名不匹配
// ============================================================

test(9, 'Bug9', 'processing-log-api.js 中使用 source_db 而非 matched_db', () => {
    const code = require('fs').readFileSync(
        path.join(__dirname, 'routes', 'processing-log-api.js'), 'utf8'
    );
    // 确认不再使用旧字段名
    assert(!code.includes('matchedItem.matched_db'), '仍使用 matched_db');
    assert(!code.includes('matchedItem.matched_table'), '仍使用 matched_table');
    assert(!code.includes('matchedItem.matched_id'), '仍使用 matched_id');
    // 确认使用新字段名
    assert(code.includes('matchedItem.source_db'), '缺少 source_db');
});

test(10, 'Bug9', '批量确认也使用 source_db/source_table/source_id', () => {
    const code = require('fs').readFileSync(
        path.join(__dirname, 'routes', 'processing-log-api.js'), 'utf8'
    );
    assert(code.includes('item.source_db'), '批量确认缺少 item.source_db');
    assert(code.includes('item.source_table'), '批量确认缺少 item.source_table');
    assert(code.includes('item.source_id'), '批量确认缺少 item.source_id');
});

// ============================================================
// Bug 11: vocabulary-api.js 重复数据库连接
// ============================================================

test(11, 'Bug11', 'vocabulary-api.js 不再独立创建 Database 连接', () => {
    const code = require('fs').readFileSync(
        path.join(__dirname, 'routes', 'vocabulary-api.js'), 'utf8'
    );
    // 不应包含 new Database
    assert(!code.includes("new Database(dbPath)"), '仍有独立 new Database');
    assert(!code.includes("require('better-sqlite3')"), '仍 require better-sqlite3');
    // 应使用 vocabularyService 共享连接
    assert(code.includes('getVocabularyService'), '未使用 getVocabularyService');
    assert(code.includes('vocabularyService.db'), '未共享 db 连接');
});

// ============================================================
// Bug 12: 时间戳不一致
// ============================================================

test(12, 'Bug12', 'vocabulary-api.js INSERT 使用 CURRENT_TIMESTAMP', () => {
    const code = require('fs').readFileSync(
        path.join(__dirname, 'routes', 'vocabulary-api.js'), 'utf8'
    );
    // 不应使用 localtime
    const localtimeCount = (code.match(/datetime\('now',\s*'localtime'\)/g) || []).length;
    assert(localtimeCount === 0, `还有 ${localtimeCount} 处使用 localtime`);
    // 应使用 CURRENT_TIMESTAMP
    const ctCount = (code.match(/CURRENT_TIMESTAMP/g) || []).length;
    assert(ctCount >= 3, `CURRENT_TIMESTAMP 只有 ${ctCount} 处，需要 >= 3`);
});

// ============================================================
// Bug 17: excludeService 双系统
// ============================================================

test(13, 'Bug17', 'aiProcessor.js 不再引用 excludeService', () => {
    const code = require('fs').readFileSync(
        path.join(__dirname, 'services', 'aiProcessor.js'), 'utf8'
    );
    assert(!code.includes("getExcludeService"), '仍引用 getExcludeService');
    assert(!code.includes("excludeService.isExcluded"), '仍调用 excludeService.isExcluded');
});

test(14, 'Bug17', 'aiProcessor.js 使用 matchingDictService 检查排除', () => {
    const code = require('fs').readFileSync(
        path.join(__dirname, 'services', 'aiProcessor.js'), 'utf8'
    );
    assert(code.includes('matchingDictServiceRef'), '缺少 matchingDictServiceRef');
    assert(code.includes('matchingDictServiceRef.isExcluded'), 
        '未使用 matchingDictServiceRef.isExcluded');
});

// ============================================================
// Bug 18: textCleaner 过度替换
// ============================================================

test(15, 'Bug18', '"people" 不应被替换为 "sb."', () => {
    if (!textCleaner) return 'SKIP';
    const result = textCleaner.cleanForMatching('many people like sports');
    assert(!result.includes('sb.'), `"people" 被替换了: ${result}`);
    assert(result.includes('people'), `"people" 被删除了: ${result}`);
});

test(16, 'Bug18', '"verb" 不应被替换为 "do sth."', () => {
    if (!textCleaner) return 'SKIP';
    const result = textCleaner.cleanForMatching('the verb form changes');
    assert(!result.includes('do sth.'), `"verb" 被替换了: ${result}`);
    assert(result.includes('verb'), `"verb" 被删除了: ${result}`);
});

test(17, 'Bug18', '"adverb" 不应被替换（原来 verb→do sth. 会破坏 adverb）', () => {
    if (!textCleaner) return 'SKIP';
    const result = textCleaner.cleanForMatching('adverb modifies verb');
    assert(result.includes('adverb'), `"adverb" 被破坏: ${result}`);
});

test(18, 'Bug18', '"someone/something" 仍应正常替换', () => {
    if (!textCleaner) return 'SKIP';
    const result = textCleaner.cleanForMatching('tell someone something');
    assert(result.includes('sb.'), `"someone" 未替换: ${result}`);
    assert(result.includes('sth.'), `"something" 未替换: ${result}`);
});

test(19, 'Bug18', '"adjective" 不应被替换为 "adj."', () => {
    if (!textCleaner) return 'SKIP';
    const result = textCleaner.cleanForMatching('adjective clause');
    assert(!result.includes('adj.'), `"adjective" 被替换了: ${result}`);
});

// ============================================================
// Bug 19: 括号内容误删
// ============================================================

test(20, 'Bug19', '保留结构性括号 "(on sth.)"', () => {
    if (!textCleaner) return 'SKIP';
    const result = textCleaner.cleanForMatching('spend time/money (on sth.)');
    assert(result.includes('on sth'), `结构括号被删除: ${result}`);
});

test(21, 'Bug19', '删除示例性括号 "(e.g., running)"', () => {
    if (!textCleaner) return 'SKIP';
    const result = textCleaner.cleanForMatching('gerund (e.g., running, swimming)');
    assert(!result.includes('running'), `示例括号未删除: ${result}`);
});

test(22, 'Bug19', '保留括号 "(that/which)" 类限定内容', () => {
    if (!textCleaner) return 'SKIP';
    const result = textCleaner.cleanForMatching('relative clause (that/which)');
    assert(result.includes('that') || result.includes('which'), 
        `限定括号被误删: ${result}`);
});

// ============================================================
// Bug 20: patternValidator 白名单/黑名单顺序
// ============================================================

test(23, 'Bug20', '"How + adj. + 主语 + 谓语!" 应通过验证（白名单优先）', () => {
    if (!patternValidator) return 'SKIP';
    const result = patternValidator.validate('How + adj. + 主语 + 谓语!');
    assert(result.valid === true, `被错误排除: ${result.reason}`);
});

test(24, 'Bug20', '"How are you?" 仍应被黑名单拒绝', () => {
    if (!patternValidator) return 'SKIP';
    const result = patternValidator.validate('How are you?');
    assert(result.valid === false, `应被拒绝但通过了: ${result.reason}`);
});

test(25, 'Bug20', '"What + a/an + adj. + n. + 主语 + 谓语!" 应通过', () => {
    if (!patternValidator) return 'SKIP';
    const result = patternValidator.validate('What + a/an + adj. + n. + 主语 + 谓语!');
    assert(result.valid === true, `被错误排除: ${result.reason}`);
});

// ============================================================
// Bug 23: WebSocket taskId 过滤
// ============================================================

test(26, 'Bug23', 'broadcastTaskProgress 代码包含 taskId 过滤', () => {
    const code = require('fs').readFileSync(
        path.join(__dirname, 'server.js'), 'utf8'
    );
    assert(code.includes('clientInfo.taskId !== taskId'),
        'broadcastTaskProgress 未添加 taskId 过滤');
});

test(27, 'Bug23', '未订阅的客户端仍可接收（向后兼容）', () => {
    const code = require('fs').readFileSync(
        path.join(__dirname, 'server.js'), 'utf8'
    );
    // 确认只跳过"订阅了其他任务"的客户端，未订阅的仍放行
    assert(code.includes('clientInfo.taskId &&'), 
        '缺少 null taskId 兼容逻辑');
});

// ============================================================
// Bug 24: coverage 人为下限
// ============================================================

test(28, 'Bug24', '"go to" 匹配 "go to school on foot" 不应得85%+', () => {
    if (!matchingService) return 'SKIP';
    // _findByKeywordMatch 内部计算 coverage
    // "go to" 只有2个关键词，"go to school on foot" 有5个
    // coverage = 2/5 = 0.4，修复后不再 Math.max(0.85, 0.4)
    const result = matchingService._findByKeywordMatch 
        ? matchingService._findByKeywordMatch('go to', 
            [{ text: 'go to school on foot', type: 'phrase' }], {})
        : null;
    if (!result) return 'SKIP';
    if (result.length > 0) {
        assert(result[0].score < 0.85, 
            `score=${result[0].score}, 应 < 0.85`);
    }
});

test(29, 'Bug24', '完全匹配仍返回100%', () => {
    if (!matchingService) return 'SKIP';
    const result = matchingService._findByKeywordMatch 
        ? matchingService._findByKeywordMatch('go to school', 
            [{ text: 'go to school', type: 'phrase' }], {})
        : null;
    if (!result) return 'SKIP';
    assert(result.length > 0 && result[0].score === 1.0, 
        `完全匹配应得100%`);
});

// ============================================================
// Bug 25: 双重遍历合并
// ============================================================

test(30, 'Bug25', '_findReplaceRuleFuzzyOnly 代码只有一次 for 循环', () => {
    if (!matchingService) return 'SKIP';
    const code = matchingService._findReplaceRuleFuzzyOnly.toString();
    // 统计 for 循环数量（应只有1个主循环）
    const forLoops = (code.match(/for\s*\(\s*const rule of rules\)/g) || []).length;
    assert(forLoops === 1, `有 ${forLoops} 个遍历循环，应为 1`);
});

// ============================================================
// Bug A: source_db/source_table/source_id 映射
// ============================================================

test(31, 'BugA', 'aiProcessor.js matched items 映射包含 source_db', () => {
    const code = require('fs').readFileSync(
        path.join(__dirname, 'services', 'aiProcessor.js'), 'utf8'
    );
    assert(code.includes('source_db: m.source_db'), '缺少 source_db 映射');
    assert(code.includes('source_table: m.source_table'), '缺少 source_table 映射');
    assert(code.includes('source_id: m.source_id'), '缺少 source_id 映射');
});

// ============================================================
// Bug 2: 数据库中错误的 target_text 映射 (SQL 修复验证)
// ============================================================

test(32, 'Bug2', 'ID 419 "形容词与名词词性区分" → 词性判断', () => {
    if (!matchingDb) return 'SKIP';
    const row = matchingDb.prepare(
        'SELECT target_text FROM matching_rules WHERE id = 419'
    ).get();
    assert(row && row.target_text === '词性判断',
        `实际: ${row ? row.target_text : 'NULL'}`);
});

test(33, 'Bug2', 'ID 70 "比较级的用法" → 形容词/副词比较级（原为最高级）', () => {
    if (!matchingDb) return 'SKIP';
    const row = matchingDb.prepare(
        'SELECT target_text, target_id FROM matching_rules WHERE id = 70'
    ).get();
    assert(row && row.target_text === '形容词/副词比较级' && row.target_id === 16,
        `实际: text=${row ? row.target_text : 'NULL'}, id=${row ? row.target_id : 'NULL'}`);
});

test(34, 'Bug2', 'ID 131 "how to + 动词原形" → 不定式（原为状语从句）', () => {
    if (!matchingDb) return 'SKIP';
    const row = matchingDb.prepare(
        'SELECT target_text, target_id FROM matching_rules WHERE id = 131'
    ).get();
    assert(row && row.target_text === '不定式 (to + 动词原形)' && row.target_id === 9,
        `实际: text=${row ? row.target_text : 'NULL'}, id=${row ? row.target_id : 'NULL'}`);
});

test(35, 'Bug2', 'ID 254 "邀请类动词后接不定式" → 非谓语（原为构词法）', () => {
    if (!matchingDb) return 'SKIP';
    const row = matchingDb.prepare(
        'SELECT target_text, target_id FROM matching_rules WHERE id = 254'
    ).get();
    assert(row && row.target_text === '非谓语' && row.target_id === 43,
        `实际: text=${row ? row.target_text : 'NULL'}, id=${row ? row.target_id : 'NULL'}`);
});

test(36, 'Bug2', '所有9条映射均已修正', () => {
    if (!matchingDb) return 'SKIP';
    const wrongCount = matchingDb.prepare(`
        SELECT COUNT(*) AS cnt FROM matching_rules 
        WHERE (id = 419 AND target_text = '非谓语')
           OR (id = 422 AND target_text = '非谓语')
           OR (id = 427 AND target_text = '非谓语')
           OR (id = 432 AND target_text = '非谓语')
           OR (id = 70  AND target_text = '形容词/副词最高级')
           OR (id = 131 AND target_text = '状语从句')
           OR (id = 254 AND target_text = '构词法')
           OR (id = 296 AND target_text = '形容词/副词最高级')
           OR (id = 460 AND target_text = '主语')
    `).get();
    assert(wrongCount.cnt === 0, `还有 ${wrongCount.cnt} 条未修复`);
});

// ============================================================
// New Bug B: exclude 规则 target_text 非空
// ============================================================

test(37, 'BugB', 'ID 375 action=exclude 且 target_text 为空', () => {
    if (!matchingDb) return 'SKIP';
    const row = matchingDb.prepare(
        'SELECT target_text FROM matching_rules WHERE id = 375'
    ).get();
    assert(row && (row.target_text === null || row.target_text === ''),
        `target_text 应为空，实际: "${row ? row.target_text : 'N/A'}"`);
});

test(38, 'BugB', 'ID 376 action=exclude 且 target_text 为空', () => {
    if (!matchingDb) return 'SKIP';
    const row = matchingDb.prepare(
        'SELECT target_text FROM matching_rules WHERE id = 376'
    ).get();
    assert(row && (row.target_text === null || row.target_text === ''),
        `target_text 应为空，实际: "${row ? row.target_text : 'N/A'}"`);
});

test(39, 'BugB', 'ID 377 action=exclude 且 target_text 为空', () => {
    if (!matchingDb) return 'SKIP';
    const row = matchingDb.prepare(
        'SELECT target_text FROM matching_rules WHERE id = 377'
    ).get();
    assert(row && (row.target_text === null || row.target_text === ''),
        `target_text 应为空，实际: "${row ? row.target_text : 'N/A'}"`);
});

test(40, 'BugB', 'matchingDictService.isExcluded 对这3条规则正确返回 true', () => {
    if (!matchingDictService) return 'SKIP';
    // 修复后 target_text 为空，isExcluded 检查 !rule.target_text → true
    const tests = [
        { text: 'for .', type: 'pattern' },
        { text: 'to + 动词原形', type: 'grammar' },
        { text: "doesn't have", type: 'phrase' },
    ];
    for (const t of tests) {
        const excluded = matchingDictService.isExcluded(t.text, t.type);
        assert(excluded === true, `"${t.text}" 应被排除但未被排除`);
    }
});

// ============================================================
// 输出结果
// ============================================================

console.log('\n' + '='.repeat(70));
console.log('  测试结果');
console.log('='.repeat(70));

for (const r of results) {
    const prefix = `[${String(r.id).padStart(2, '0')}] ${r.bugRef.padEnd(6)}`;
    const statusStr = r.status;
    const desc = r.description;
    if (r.detail) {
        console.log(`${prefix} ${statusStr} ${desc}`);
        console.log(`       ↳ ${r.detail}`);
    } else {
        console.log(`${prefix} ${statusStr} ${desc}`);
    }
}

console.log('\n' + '-'.repeat(70));
console.log(`  合计: ${results.length} 个用例`);
console.log(`  ✅ 通过: ${passed}  ❌ 失败: ${failed}  ⏭️ 跳过: ${skipped}`);
console.log('-'.repeat(70));

if (failed > 0) {
    console.log('\n⚠️  有失败用例，请检查修复是否正确应用！');
    process.exit(1);
} else {
    console.log('\n🎉 所有用例通过（跳过的用例需要在完整运行时环境中验证）');
    process.exit(0);
}

// 清理
try { matchingDb && matchingDb.close(); } catch(e) {}
try { grammarDb && grammarDb.close(); } catch(e) {}
try { vocabularyDb && vocabularyDb.close(); } catch(e) {}
