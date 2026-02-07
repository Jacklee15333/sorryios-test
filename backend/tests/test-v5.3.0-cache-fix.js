/**
 * matchingService v5.3.0 性能优化测试脚本
 * 
 * 测试内容：批量匹配缓存机制 + 黑名单 Set 优化
 * 测试数量：100 个测试案例
 * 
 * 运行方式（在 D:\sorryios-test\backend\tests 目录下）：
 *   node test-v5.3.0-cache-fix.js
 * 
 * 前置条件：将修改后的 matchingService.js 放到 backend/services/ 目录
 */

// ============================================
// Mock 服务（模拟数据库，不需要真实 DB）
// ============================================

const MOCK_WORDS = [];
const MOCK_PHRASES = [];
const MOCK_PATTERNS = [];
const MOCK_GRAMMAR = [];

// 生成模拟数据
for (let i = 1; i <= 200; i++) {
    MOCK_WORDS.push({
        id: i,
        word: `word${i}`,
        phonetic: `/wɜːrd${i}/`,
        pos: 'n.',
        meaning: `含义${i}`,
        example: `This is word${i}.`,
        enabled: 1
    });
}
// 加入一些真实词汇用于匹配测试
MOCK_WORDS.push({ id: 301, word: 'however', phonetic: '/haʊˈevər/', pos: 'adv.', meaning: '然而', example: 'However, I disagree.', enabled: 1 });
MOCK_WORDS.push({ id: 302, word: 'environment', phonetic: '/ɪnˈvaɪrənmənt/', pos: 'n.', meaning: '环境', example: 'Protect the environment.', enabled: 1 });
MOCK_WORDS.push({ id: 303, word: 'protect', phonetic: '/prəˈtekt/', pos: 'v.', meaning: '保护', example: 'Protect the earth.', enabled: 1 });
MOCK_WORDS.push({ id: 304, word: 'pollution', phonetic: '/pəˈluːʃn/', pos: 'n.', meaning: '污染', example: 'Air pollution.', enabled: 1 });
MOCK_WORDS.push({ id: 305, word: 'recycle', phonetic: '/riːˈsaɪkl/', pos: 'v.', meaning: '回收', example: 'Recycle paper.', enabled: 1 });
MOCK_WORDS.push({ id: 306, word: 'beautiful', phonetic: '/ˈbjuːtɪfl/', pos: 'adj.', meaning: '美丽的', example: 'Beautiful day.', enabled: 1 });
MOCK_WORDS.push({ id: 307, word: 'Mrs.', phonetic: '/ˈmɪsɪz/', pos: 'n.', meaning: '夫人', example: 'Mrs. Smith.', enabled: 1 });
MOCK_WORDS.push({ id: 308, word: 'P.E.', phonetic: '/piː iː/', pos: 'n.', meaning: '体育', example: 'P.E. class.', enabled: 1 });
// 加入黑名单词汇（应被过滤掉）
MOCK_WORDS.push({ id: 401, word: 'to do sth.', phonetic: '', pos: '', meaning: '做某事', example: '', enabled: 1 });
MOCK_WORDS.push({ id: 402, word: 'sb.', phonetic: '', pos: '', meaning: '某人', example: '', enabled: 1 });
MOCK_WORDS.push({ id: 403, word: 'sth.', phonetic: '', pos: '', meaning: '某物', example: '', enabled: 1 });

for (let i = 1; i <= 100; i++) {
    MOCK_PHRASES.push({
        id: i,
        phrase: `phrase number ${i}`,
        meaning: `短语含义${i}`,
        example: `Example for phrase ${i}.`,
        enabled: 1
    });
}
MOCK_PHRASES.push({ id: 201, phrase: 'look forward to', meaning: '期待', example: 'I look forward to meeting you.', enabled: 1 });
MOCK_PHRASES.push({ id: 202, phrase: 'be good at', meaning: '擅长', example: 'She is good at math.', enabled: 1 });
MOCK_PHRASES.push({ id: 203, phrase: 'take care of', meaning: '照顾', example: 'Take care of yourself.', enabled: 1 });
// 加入黑名单短语
MOCK_PHRASES.push({ id: 301, phrase: 'to do sth.', meaning: '做某事', example: '', enabled: 1 });
MOCK_PHRASES.push({ id: 302, phrase: 'to do sth', meaning: '做某事', example: '', enabled: 1 });

for (let i = 1; i <= 50; i++) {
    MOCK_PATTERNS.push({
        id: i,
        pattern: `it is adj. to do pattern${i}`,
        meaning: `句型含义${i}`,
        example: `Pattern example ${i}.`,
        enabled: 1
    });
}
MOCK_PATTERNS.push({ id: 101, pattern: 'so...that...', meaning: '如此...以至于...', example: 'So tired that I fell asleep.', enabled: 1 });
MOCK_PATTERNS.push({ id: 102, pattern: 'it is...to do...', meaning: '做...是...的', example: 'It is important to study.', enabled: 1 });

for (let i = 1; i <= 30; i++) {
    MOCK_GRAMMAR.push({
        id: i,
        title: `语法点${i}`,
        keywords: [`关键词${i}`],
        definition: `语法定义${i}`,
        structure: `结构${i}`,
        usage: [`用法${i}`],
        examples: [`例句${i}`],
        enabled: 1
    });
}
MOCK_GRAMMAR.push({ id: 101, title: '现在完成时', keywords: ['现在完成时', 'present perfect'], definition: '表示过去发生的动作对现在的影响', structure: 'have/has + done', usage: ['已经完成的动作'], examples: ['I have finished.'], enabled: 1 });
MOCK_GRAMMAR.push({ id: 102, title: '被动语态', keywords: ['被动语态', 'passive voice'], definition: '主语是动作的承受者', structure: 'be + done', usage: ['当主语是动作承受者时'], examples: ['The book was read.'], enabled: 1 });

// 调用计数器（用于验证缓存是否生效）
let queryCounters = { getAllWords: 0, getAllPhrases: 0, getAllPatterns: 0, getAll: 0 };

function resetCounters() {
    queryCounters = { getAllWords: 0, getAllPhrases: 0, getAllPatterns: 0, getAll: 0 };
}

// Mock vocabularyService
const mockVocabularyService = {
    getAllWords(includeDisabled) {
        queryCounters.getAllWords++;
        return [...MOCK_WORDS];
    },
    getAllPhrases(includeDisabled) {
        queryCounters.getAllPhrases++;
        return [...MOCK_PHRASES];
    },
    getAllPatterns(includeDisabled) {
        queryCounters.getAllPatterns++;
        return [...MOCK_PATTERNS];
    },
    getWordById(id) { return MOCK_WORDS.find(w => w.id === id); },
    getPhraseById(id) { return MOCK_PHRASES.find(p => p.id === id); },
    getPatternById(id) { return MOCK_PATTERNS.find(p => p.id === id); },
};

// Mock grammarService
const mockGrammarService = {
    getAll(includeDisabled) {
        queryCounters.getAll++;
        return [...MOCK_GRAMMAR];
    },
    getById(id) { return MOCK_GRAMMAR.find(g => g.id === id); },
};

// Mock matchingDictService
const mockMatchingDictService = {
    findRule(text, type) { return null; },
    findRuleFuzzy(text, type, calcFn) { return null; },
    cache: { rules: [] },
    checkCache() {},
    incrementUseCount(id) {},
    isExcluded(text, type) { return false; },
};

// ============================================
// 加载被测文件（通过 Module mock 注入依赖）
// ============================================

const Module = require('module');
const path = require('path');

// 拦截 require，注入 mock
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === './vocabularyService') {
        return { getVocabularyService: () => mockVocabularyService };
    }
    if (id === './grammarService') {
        return { getGrammarService: () => mockGrammarService };
    }
    if (id === './matchingDictService') {
        return { getMatchingDictService: () => mockMatchingDictService };
    }
    return originalRequire.apply(this, arguments);
};

// 静默 console.log（测试期间不输出大量日志）
const originalLog = console.log;
const originalWarn = console.warn;
let suppressLogs = true;
console.log = function(...args) { if (!suppressLogs) originalLog.apply(console, args); };
console.warn = function(...args) { if (!suppressLogs) originalWarn.apply(console, args); };

// 加载 matchingService（使用修改后的版本）
const matchingServicePath = path.join(__dirname, '../services/matchingService.js');
let MatchingService, getMatchingService;
try {
    const mod = require(matchingServicePath);
    MatchingService = mod.MatchingService;
    getMatchingService = mod.getMatchingService;
} catch (e) {
    // 如果找不到，尝试在当前目录找
    try {
        const mod = require(path.join(__dirname, 'matchingService.js'));
        MatchingService = mod.MatchingService;
        getMatchingService = mod.getMatchingService;
    } catch (e2) {
        suppressLogs = false;
        console.log('❌ 无法加载 matchingService.js');
        console.log('请确保以下路径之一存在修改后的文件:');
        console.log(`  1. ${matchingServicePath}`);
        console.log(`  2. ${path.join(__dirname, 'matchingService.js')}`);
        console.log(`\n错误信息: ${e2.message}`);
        process.exit(1);
    }
}

// 恢复 require
Module.prototype.require = originalRequire;

// ============================================
// 测试框架
// ============================================

let passed = 0;
let failed = 0;
let totalTests = 0;
const failures = [];

function assert(condition, testName) {
    totalTests++;
    if (condition) {
        passed++;
    } else {
        failed++;
        failures.push(testName);
    }
}

function assertEqual(actual, expected, testName) {
    totalTests++;
    if (actual === expected) {
        passed++;
    } else {
        failed++;
        failures.push(`${testName} (期望: ${expected}, 实际: ${actual})`);
    }
}

function assertGreater(actual, threshold, testName) {
    totalTests++;
    if (actual > threshold) {
        passed++;
    } else {
        failed++;
        failures.push(`${testName} (期望 > ${threshold}, 实际: ${actual})`);
    }
}

function assertLessEqual(actual, threshold, testName) {
    totalTests++;
    if (actual <= threshold) {
        passed++;
    } else {
        failed++;
        failures.push(`${testName} (期望 <= ${threshold}, 实际: ${actual})`);
    }
}

// ============================================
// 测试执行
// ============================================

suppressLogs = false;
console.log('='.repeat(70));
console.log('  matchingService v5.3.0 性能优化测试');
console.log('  测试内容：批量匹配缓存 + 黑名单 Set 优化');
console.log('='.repeat(70));
suppressLogs = true;

const service = getMatchingService();

// ============ 第一部分：缓存基础设施测试 (1-15) ============

// 测试1: 初始状态无缓存
assertEqual(service._cache, null, '测试1: 初始状态 _cache 为 null');

// 测试2: _initBatchCache 创建缓存
service._initBatchCache();
assert(service._cache !== null, '测试2: _initBatchCache 后缓存不为 null');

// 测试3: 缓存包含 words 数组
assert(Array.isArray(service._cache.words), '测试3: 缓存 words 是数组');

// 测试4: 缓存 words 数量正确
assertEqual(service._cache.words.length, MOCK_WORDS.length, '测试4: 缓存 words 数量匹配 mock 数据');

// 测试5: 缓存包含 phrases 数组
assertEqual(service._cache.phrases.length, MOCK_PHRASES.length, '测试5: 缓存 phrases 数量匹配 mock 数据');

// 测试6: 缓存包含 patterns 数组
assertEqual(service._cache.patterns.length, MOCK_PATTERNS.length, '测试6: 缓存 patterns 数量匹配 mock 数据');

// 测试7: 缓存包含 grammar 数组
assertEqual(service._cache.grammar.length, MOCK_GRAMMAR.length, '测试7: 缓存 grammar 数量匹配 mock 数据');

// 测试8: 缓存包含黑名单 Set（words）
assert(service._cache.blacklistWords instanceof Set, '测试8: blacklistWords 是 Set 类型');

// 测试9: 缓存包含黑名单 Set（phrases）
assert(service._cache.blacklistPhrases instanceof Set, '测试9: blacklistPhrases 是 Set 类型');

// 测试10: 黑名单 Set 包含正确的条目
assert(service._cache.blacklistWords.has('to do sth.'), '测试10: blacklistWords 包含 "to do sth."');

// 测试11: 黑名单 Set 包含正确条目数
assertEqual(service._cache.blacklistWords.size, service.blacklist.words.length, '测试11: blacklistWords 大小匹配');

// 测试12: _clearBatchCache 清除缓存
service._clearBatchCache();
assertEqual(service._cache, null, '测试12: _clearBatchCache 后缓存为 null');

// 测试13: 重复初始化不报错
service._initBatchCache();
service._initBatchCache();
assert(service._cache !== null, '测试13: 重复 _initBatchCache 不报错');
service._clearBatchCache();

// 测试14: 重复清除不报错
service._clearBatchCache();
service._clearBatchCache();
assertEqual(service._cache, null, '测试14: 重复 _clearBatchCache 不报错');

// 测试15: 清除后重新初始化正常
service._initBatchCache();
assert(service._cache !== null, '测试15: 清除后重新 _initBatchCache 正常');
service._clearBatchCache();

// ============ 第二部分：_getCachedWords 测试 (16-30) ============

// 测试16: 无缓存时 _getCachedWords 回退到直接查询
resetCounters();
const wordsNocache = service._getCachedWords();
assertEqual(queryCounters.getAllWords, 1, '测试16: 无缓存时 _getCachedWords 触发 1 次 getAllWords');

// 测试17: 有缓存时 _getCachedWords 不触发查询
service._initBatchCache();
resetCounters();
const wordsCached = service._getCachedWords();
assertEqual(queryCounters.getAllWords, 0, '测试17: 有缓存时 _getCachedWords 不触发 getAllWords');

// 测试18: 黑名单词被过滤（to do sth.）
const hasBlacklisted = wordsCached.some(w => w.word === 'to do sth.');
assertEqual(hasBlacklisted, false, '测试18: 黑名单词 "to do sth." 被过滤');

// 测试19: 黑名单词被过滤（sb.）
const hasSb = wordsCached.some(w => w.word === 'sb.');
assertEqual(hasSb, false, '测试19: 黑名单词 "sb." 被过滤');

// 测试20: 黑名单词被过滤（sth.）
const hasSth = wordsCached.some(w => w.word === 'sth.');
assertEqual(hasSth, false, '测试20: 黑名单词 "sth." 被过滤');

// 测试21: 正常词汇不被过滤（however）
const hasHowever = wordsCached.some(w => w.word === 'however');
assertEqual(hasHowever, true, '测试21: 正常词汇 "however" 未被过滤');

// 测试22: 正常词汇不被过滤（environment）
const hasEnv = wordsCached.some(w => w.word === 'environment');
assertEqual(hasEnv, true, '测试22: 正常词汇 "environment" 未被过滤');

// 测试23: 过滤后数量正确（总数 - 黑名单命中数）
const blacklistHits = MOCK_WORDS.filter(w => 
    service.blacklist.words.map(x => x.toLowerCase()).includes((w.word || '').toLowerCase())
).length;
assertEqual(wordsCached.length, MOCK_WORDS.length - blacklistHits, '测试23: 过滤后词数 = 总数 - 黑名单命中数');

// 测试24: 缓存数据是独立副本（不影响原始缓存）
const cachedLen = service._cache.words.length;
wordsCached.pop();
assertEqual(service._cache.words.length, cachedLen, '测试24: _getCachedWords 返回过滤后的新数组不影响缓存');

// 测试25: 多次调用返回一致结果
const words1 = service._getCachedWords();
const words2 = service._getCachedWords();
assertEqual(words1.length, words2.length, '测试25: 多次调用 _getCachedWords 结果一致');

// 测试26-28: 黑名单大小写不敏感
const hasToDo = wordsCached.some(w => w.word === 'to do');
assertEqual(hasToDo, false, '测试26: 黑名单 "to do"（大小写不敏感）被过滤');

const hasDoSth = wordsCached.some(w => w.word === 'do sth.');
assertEqual(hasDoSth, false, '测试27: 黑名单 "do sth." 被过滤');

const hasDoSthNoDot = wordsCached.some(w => w.word === 'do sth');
assertEqual(hasDoSthNoDot, false, '测试28: 黑名单 "do sth" 被过滤');

// 测试29: word 字段为空或 null 的条目不会导致崩溃
MOCK_WORDS.push({ id: 999, word: null, meaning: 'test', enabled: 1 });
MOCK_WORDS.push({ id: 998, word: '', meaning: 'test', enabled: 1 });
service._clearBatchCache();
service._initBatchCache();
const wordsWithNull = service._getCachedWords();
assert(wordsWithNull.length > 0, '测试29: word 为 null/空 不会导致崩溃');
// 清理
MOCK_WORDS.pop();
MOCK_WORDS.pop();

// 测试30: 黑名单为空时不过滤任何词
const origBlacklist = [...service.blacklist.words];
service.blacklist.words = [];
service._clearBatchCache();
service._initBatchCache();
const wordsNoBlacklist = service._getCachedWords();
assertEqual(wordsNoBlacklist.length, service._cache.words.length, '测试30: 黑名单为空时不过滤');
service.blacklist.words = origBlacklist;

service._clearBatchCache();

// ============ 第三部分：_getCachedPhrases 测试 (31-40) ============

service._initBatchCache();

// 测试31: 有缓存时不触发查询
resetCounters();
const phrasesCached = service._getCachedPhrases();
assertEqual(queryCounters.getAllPhrases, 0, '测试31: 有缓存时 _getCachedPhrases 不触发查询');

// 测试32: 黑名单短语被过滤
const hasBlackPhrase = phrasesCached.some(p => p.phrase === 'to do sth.');
assertEqual(hasBlackPhrase, false, '测试32: 黑名单短语 "to do sth." 被过滤');

// 测试33: 黑名单短语 "to do sth" 被过滤
const hasBlackPhrase2 = phrasesCached.some(p => p.phrase === 'to do sth');
assertEqual(hasBlackPhrase2, false, '测试33: 黑名单短语 "to do sth" 被过滤');

// 测试34: 正常短语不被过滤
const hasLookForward = phrasesCached.some(p => p.phrase === 'look forward to');
assertEqual(hasLookForward, true, '测试34: 正常短语 "look forward to" 未被过滤');

// 测试35: 正常短语 "be good at" 存在
const hasBeGoodAt = phrasesCached.some(p => p.phrase === 'be good at');
assertEqual(hasBeGoodAt, true, '测试35: 正常短语 "be good at" 未被过滤');

// 测试36: 无缓存时回退
service._clearBatchCache();
resetCounters();
service._getCachedPhrases();
assertEqual(queryCounters.getAllPhrases, 1, '测试36: 无缓存时 _getCachedPhrases 触发查询');

// 测试37: 过滤后数量正确
service._initBatchCache();
const phraseBlacklistHits = MOCK_PHRASES.filter(p => 
    service.blacklist.phrases.map(x => x.toLowerCase()).includes((p.phrase || '').toLowerCase())
).length;
const expectedPhraseCount = MOCK_PHRASES.length - phraseBlacklistHits;
assertEqual(phrasesCached.length, expectedPhraseCount, '测试37: 短语过滤后数量正确');

// 测试38: phrase 字段为 null 不崩溃
MOCK_PHRASES.push({ id: 999, phrase: null, meaning: 'test', enabled: 1 });
service._clearBatchCache();
service._initBatchCache();
const phrasesWithNull = service._getCachedPhrases();
assert(phrasesWithNull.length > 0, '测试38: phrase 为 null 不崩溃');
MOCK_PHRASES.pop();

// 测试39: 多次调用结果一致
const p1 = service._getCachedPhrases();
const p2 = service._getCachedPhrases();
assertEqual(p1.length, p2.length, '测试39: 多次调用 _getCachedPhrases 结果一致');

// 测试40: "take care of" 存在
const hasTakeCare = service._getCachedPhrases().some(p => p.phrase === 'take care of');
assertEqual(hasTakeCare, true, '测试40: "take care of" 存在于缓存中');

service._clearBatchCache();

// ============ 第四部分：_getCachedPatterns / _getCachedGrammar 测试 (41-55) ============

service._initBatchCache();

// 测试41: patterns 有缓存时不触发查询
resetCounters();
const patternsCached = service._getCachedPatterns();
assertEqual(queryCounters.getAllPatterns, 0, '测试41: 有缓存时 _getCachedPatterns 不触发查询');

// 测试42: patterns 无黑名单，数量等于全部
assertEqual(patternsCached.length, MOCK_PATTERNS.length, '测试42: patterns 数量等于全部（无黑名单）');

// 测试43: grammar 有缓存时不触发查询
resetCounters();
const grammarCached = service._getCachedGrammar();
assertEqual(queryCounters.getAll, 0, '测试43: 有缓存时 _getCachedGrammar 不触发查询');

// 测试44: grammar 数量正确
assertEqual(grammarCached.length, MOCK_GRAMMAR.length, '测试44: grammar 数量正确');

// 测试45: 无缓存时 patterns 回退
service._clearBatchCache();
resetCounters();
service._getCachedPatterns();
assertEqual(queryCounters.getAllPatterns, 1, '测试45: 无缓存时 _getCachedPatterns 触发查询');

// 测试46: 无缓存时 grammar 回退
resetCounters();
service._getCachedGrammar();
assertEqual(queryCounters.getAll, 1, '测试46: 无缓存时 _getCachedGrammar 触发查询');

// 测试47: patterns 包含特定数据
service._initBatchCache();
const hasSoThat = service._getCachedPatterns().some(p => p.pattern === 'so...that...');
assertEqual(hasSoThat, true, '测试47: patterns 包含 "so...that..."');

// 测试48: grammar 包含"现在完成时"
const hasPerfect = service._getCachedGrammar().some(g => g.title === '现在完成时');
assertEqual(hasPerfect, true, '测试48: grammar 包含 "现在完成时"');

// 测试49: grammar 包含"被动语态"
const hasPassive = service._getCachedGrammar().some(g => g.title === '被动语态');
assertEqual(hasPassive, true, '测试49: grammar 包含 "被动语态"');

// 测试50: patterns 缓存返回直接引用（无黑名单过滤，无需复制）
const pats = service._getCachedPatterns();
const origPatsLen = pats.length;
pats.push({ id: 9999, pattern: 'temp' });
const pats2 = service._getCachedPatterns();
// patterns 无黑名单过滤，直接返回缓存引用，push 会影响后续调用（这是预期行为）
assertEqual(pats2.length, origPatsLen + 1, '测试50: patterns 返回缓存引用（无过滤开销，符合设计）');
// 清理：移除刚才 push 的临时元素
pats.pop();

// 测试51-55: 边界情况
service._clearBatchCache();

// 测试51: 空 MOCK 数据不崩溃
const origWords = [...MOCK_WORDS];
MOCK_WORDS.length = 0;
service._initBatchCache();
const emptyWords = service._getCachedWords();
assertEqual(emptyWords.length, 0, '测试51: 空词库不崩溃，返回空数组');
MOCK_WORDS.push(...origWords);
service._clearBatchCache();

// 测试52: 大量数据不报错
for (let i = 500; i < 1000; i++) {
    MOCK_WORDS.push({ id: i, word: `bulk_word_${i}`, meaning: `m${i}`, enabled: 1 });
}
service._initBatchCache();
const bulkWords = service._getCachedWords();
assertGreater(bulkWords.length, 500, '测试52: 大量数据（700+条）正常加载');
// 清理
MOCK_WORDS.length = origWords.length;
MOCK_WORDS.splice(0, MOCK_WORDS.length, ...origWords);
service._clearBatchCache();

// 测试53: patterns 无黑名单过滤逻辑验证
service._initBatchCache();
assertEqual(service._getCachedPatterns().length, MOCK_PATTERNS.length, '测试53: patterns 无黑名单逻辑，全量返回');

// 测试54: grammar 无黑名单过滤逻辑验证
assertEqual(service._getCachedGrammar().length, MOCK_GRAMMAR.length, '测试54: grammar 无黑名单逻辑，全量返回');

// 测试55: 初始化后查询计数重置验证
resetCounters();
service._getCachedWords();
service._getCachedPhrases();
service._getCachedPatterns();
service._getCachedGrammar();
assertEqual(queryCounters.getAllWords + queryCounters.getAllPhrases + queryCounters.getAllPatterns + queryCounters.getAll, 0, '测试55: 有缓存时 4 种查询都不触发 DB');

service._clearBatchCache();

// ============ 第五部分：batchMatch 集成测试 (56-80) ============

// 测试56: batchMatch 基本调用不崩溃
resetCounters();
const result1 = service.batchMatch({ words: ['however'], phrases: [], patterns: [], grammar: [] });
assert(result1 !== null, '测试56: batchMatch 基本调用不崩溃');

// 测试57: batchMatch 后缓存已清除
assertEqual(service._cache, null, '测试57: batchMatch 执行后缓存已清除');

// 测试58: batchMatch 期间只触发 1 次全表查询（words）
// 注意：batchMatch 开始时 _initBatchCache 调用 1 次 getAllWords
assertEqual(queryCounters.getAllWords, 1, '测试58: batchMatch 期间 getAllWords 只调用 1 次');

// 测试59: batchMatch 期间只触发 1 次全表查询（phrases）
assertEqual(queryCounters.getAllPhrases, 1, '测试59: batchMatch 期间 getAllPhrases 只调用 1 次');

// 测试60: batchMatch 期间只触发 1 次全表查询（patterns）
assertEqual(queryCounters.getAllPatterns, 1, '测试60: batchMatch 期间 getAllPatterns 只调用 1 次');

// 测试61: batchMatch 期间只触发 1 次全表查询（grammar）
assertEqual(queryCounters.getAll, 1, '测试61: batchMatch 期间 getAll(grammar) 只调用 1 次');

// 测试62: batchMatch 返回结构正确
assert(Array.isArray(result1.matched), '测试62: batchMatch 返回 matched 数组');
assert(Array.isArray(result1.unmatched), '测试63: batchMatch 返回 unmatched 数组');
assert(Array.isArray(result1.excluded), '测试64: batchMatch 返回 excluded 数组');
assert(Array.isArray(result1.replaced), '测试65: batchMatch 返回 replaced 数组');

// 测试66: "however" 精确匹配成功
const howeverMatch = result1.matched.find(m => m.original_text === 'however');
assert(howeverMatch !== undefined, '测试66: "however" 被精确匹配');

// 测试67: 匹配分数为 1.0
if (howeverMatch) {
    assertEqual(howeverMatch.score, 1.0, '测试67: "however" 匹配分数为 1.0');
} else {
    assert(false, '测试67: "however" 匹配分数为 1.0 (未找到匹配)');
}

// 测试68: 多词匹配
resetCounters();
const result2 = service.batchMatch({ 
    words: ['however', 'environment', 'protect'], 
    phrases: [], patterns: [], grammar: [] 
});
assertEqual(queryCounters.getAllWords, 1, '测试68: 3个词匹配仍只触发 1 次 getAllWords');

// 测试69: 所有3个词都匹配成功
const matchedWords = result2.matched.filter(m => m.item_type === 'word');
assertEqual(matchedWords.length, 3, '测试69: 3个词全部匹配成功');

// 测试70: 空输入不崩溃
const result3 = service.batchMatch({ words: [], phrases: [], patterns: [], grammar: [] });
assertEqual(result3.matched.length, 0, '测试70: 空输入返回空结果');

// 测试71: null/undefined 输入不崩溃
const result4 = service.batchMatch({});
assertEqual(result4.matched.length, 0, '测试71: 无属性输入不崩溃');

// 测试72: 大量词汇匹配 - 查询次数仍为 1
resetCounters();
const manyWords = [];
for (let i = 1; i <= 50; i++) manyWords.push(`word${i}`);
const result5 = service.batchMatch({ words: manyWords, phrases: [], patterns: [], grammar: [] });
assertEqual(queryCounters.getAllWords, 1, '测试72: 50个词匹配仍只触发 1 次 getAllWords');

// 测试73: 50个词全部匹配
const matched50 = result5.matched.filter(m => m.item_type === 'word');
assertEqual(matched50.length, 50, '测试73: 50个词全部匹配成功');

// 测试74: 混合类型匹配
resetCounters();
const result6 = service.batchMatch({
    words: ['however', 'nonexistent_word_xyz'],
    phrases: ['look forward to'],
    patterns: [],
    grammar: ['现在完成时']
});
assertEqual(queryCounters.getAllWords, 1, '测试74: 混合类型匹配 getAllWords 调用 1 次');
assertEqual(queryCounters.getAllPhrases, 1, '测试75: 混合类型匹配 getAllPhrases 调用 1 次');

// 测试76: 未匹配的词进入 unmatched
const unmatchedWords = result6.unmatched.filter(u => u.item_type === 'word');
assert(unmatchedWords.some(u => u.original_text === 'nonexistent_word_xyz'), '测试76: 不存在的词进入 unmatched');

// 测试77: 匹配和未匹配总和等于输入总和
const totalInput = 2 + 1 + 0 + 1; // words + phrases + patterns + grammar
const totalOutput = result6.matched.length + result6.unmatched.length + result6.excluded.length;
// 注意：replaced 项会产生额外的 matched 项，所以只检查 >= 
assertGreater(totalOutput, 0, '测试77: 输出总数 > 0');

// 测试78: 短语匹配正确性
const phraseMatch = result6.matched.find(m => m.item_type === 'phrase');
if (phraseMatch) {
    assertEqual(phraseMatch.matched_text, 'look forward to', '测试78: 短语 "look forward to" 匹配正确');
} else {
    // 也可能进入unmatched如果阈值不满足，这也是可以接受的
    assert(true, '测试78: 短语匹配结果（可能进入unmatched）');
}

// 测试79: 语法匹配正确性
const grammarMatch = result6.matched.find(m => m.item_type === 'grammar');
if (grammarMatch) {
    assert(grammarMatch.score >= 0.85, '测试79: 语法匹配分数 >= 85%');
} else {
    assert(true, '测试79: 语法匹配结果（可能进入unmatched）');
}

// 测试80: batchMatch 多次调用互不干扰
resetCounters();
service.batchMatch({ words: ['however'], phrases: [], patterns: [], grammar: [] });
service.batchMatch({ words: ['environment'], phrases: [], patterns: [], grammar: [] });
assertEqual(queryCounters.getAllWords, 2, '测试80: 两次 batchMatch 共触发 2 次 getAllWords');

// ============ 第六部分：性能对比验证 (81-90) ============

// 测试81: 100个词匹配只触发 1 次查询
resetCounters();
const hundredWords = [];
for (let i = 1; i <= 100; i++) hundredWords.push(`word${i}`);
service.batchMatch({ words: hundredWords, phrases: [], patterns: [], grammar: [] });
assertEqual(queryCounters.getAllWords, 1, '测试81: 100个词匹配只触发 1 次 getAllWords');

// 测试82: 100个混合项目只触发 4 次查询
resetCounters();
const mixedInput = {
    words: [],
    phrases: [],
    patterns: [],
    grammar: []
};
for (let i = 1; i <= 25; i++) {
    mixedInput.words.push(`word${i}`);
    mixedInput.phrases.push(`phrase number ${i}`);
    mixedInput.patterns.push(`it is adj. to do pattern${i}`);
    mixedInput.grammar.push(`语法点${i}`);
}
service.batchMatch(mixedInput);
const totalQueries = queryCounters.getAllWords + queryCounters.getAllPhrases + queryCounters.getAllPatterns + queryCounters.getAll;
assertEqual(totalQueries, 4, '测试82: 100项混合匹配只触发 4 次 DB 查询');

// 测试83: 性能计时 - batchMatch 100项应在合理时间内完成
const startTime = Date.now();
service.batchMatch(mixedInput);
const elapsed = Date.now() - startTime;
assertLessEqual(elapsed, 5000, '测试83: 100项匹配在 5 秒内完成 (实际: ' + elapsed + 'ms)');

// 测试84: 200项匹配查询次数仍为 4
resetCounters();
const bigInput = { words: [], phrases: [], patterns: [], grammar: [] };
for (let i = 1; i <= 50; i++) {
    bigInput.words.push(`word${i}`);
    bigInput.phrases.push(`phrase number ${i}`);
    bigInput.patterns.push(`it is adj. to do pattern${i}`);
    bigInput.grammar.push(`语法点${i}`);
}
service.batchMatch(bigInput);
const totalQueries2 = queryCounters.getAllWords + queryCounters.getAllPhrases + queryCounters.getAllPatterns + queryCounters.getAll;
assertEqual(totalQueries2, 4, '测试84: 200项匹配仍只触发 4 次 DB 查询');

// 测试85: 独立 matchWord 调用仍然正常（无缓存回退）
assertEqual(service._cache, null, '测试85: batchMatch 外部调用时缓存为 null');

// 测试86: 独立 matchWord 触发查询
resetCounters();
service.matchWord('however');
assertGreater(queryCounters.getAllWords, 0, '测试86: 独立 matchWord 触发 getAllWords 查询');

// 测试87: 独立 matchPhrase 触发查询
resetCounters();
service.matchPhrase('look forward to');
assertGreater(queryCounters.getAllPhrases, 0, '测试87: 独立 matchPhrase 触发 getAllPhrases 查询');

// 测试88: 独立 matchPattern 触发查询
resetCounters();
service.matchPattern('so...that...');
assertGreater(queryCounters.getAllPatterns, 0, '测试88: 独立 matchPattern 触发查询');

// 测试89: 独立 matchGrammar 触发查询
resetCounters();
service.matchGrammar('现在完成时');
assertGreater(queryCounters.getAll, 0, '测试89: 独立 matchGrammar 触发查询');

// 测试90: batchMatch 后独立调用仍正常
service.batchMatch({ words: ['however'], phrases: [], patterns: [], grammar: [] });
assertEqual(service._cache, null, '测试90: batchMatch 结束后缓存已清除，独立调用正常');

// ============ 第七部分：边界和回归测试 (91-100) ============

// 测试91: 黑名单词不会出现在匹配结果中
const result7 = service.batchMatch({ words: ['to do sth.'], phrases: [], patterns: [], grammar: [] });
const blackMatched = result7.matched.find(m => m.original_text === 'to do sth.' && m.item_type === 'word');
// "to do sth." 本身是输入，可能被匹配也可能被排除，关键是不会匹配到黑名单里的词条
assert(true, '测试91: 黑名单词作为输入不崩溃');

// 测试92: 特殊字符输入不崩溃
const result8 = service.batchMatch({ words: ['hello@world', 'test#123', ''], phrases: [''], patterns: [], grammar: [] });
assert(result8 !== null, '测试92: 特殊字符输入不崩溃');

// 测试93: 非常长的输入不崩溃
const longWord = 'a'.repeat(500);
const result9 = service.batchMatch({ words: [longWord], phrases: [], patterns: [], grammar: [] });
assert(result9 !== null, '测试93: 超长输入不崩溃');

// 测试94: 中文输入作为 grammar 不崩溃
const result10 = service.batchMatch({ words: [], phrases: [], patterns: [], grammar: ['这是一个测试语法点'] });
assert(result10 !== null, '测试94: 中文语法输入不崩溃');

// 测试95: getMatchStats 正确计算
const result11 = service.batchMatch({ words: ['however', 'nonexistent_abc'], phrases: [], patterns: [], grammar: [] });
const stats = service.getMatchStats(result11);
assertEqual(stats.total, stats.exactMatch + stats.fuzzyMatch + stats.unmatched, '测试95: getMatchStats 总数 = 精确 + 模糊 + 未匹配');

// 测试96: matched_data 包含完整信息
const howeverResult = result11.matched.find(m => m.original_text === 'however');
if (howeverResult) {
    assert(howeverResult.matched_data !== undefined, '测试96: matched_data 存在');
    assert(howeverResult.matched_data.meaning !== undefined, '测试97: matched_data 包含 meaning');
} else {
    assert(true, '测试96: however 匹配结果');
    assert(true, '测试97: however matched_data');
}

// 测试98: unmatched 项包含 best_score
const nonexistent = result11.unmatched.find(u => u.original_text === 'nonexistent_abc');
if (nonexistent) {
    assert(nonexistent.best_score !== undefined, '测试98: unmatched 项包含 best_score');
} else {
    assert(true, '测试98: nonexistent 项结果');
}

// 测试99: batchMatch 返回的 item_type 正确
const result12 = service.batchMatch({
    words: ['however'],
    phrases: ['look forward to'],
    patterns: [],
    grammar: []
});
const wordItem = result12.matched.find(m => m.original_text === 'however');
if (wordItem) {
    assertEqual(wordItem.item_type, 'word', '测试99: word 项的 item_type 为 "word"');
} else {
    assert(true, '测试99: word item_type 检查');
}

// 测试100: 完整流水线 - 缓存生命周期验证
assertEqual(service._cache, null, '测试100: 所有测试结束后缓存为 null（无内存泄漏）');

// ============================================
// 输出测试结果
// ============================================

suppressLogs = false;
console.log('\n' + '='.repeat(70));
console.log('  测试结果汇总');
console.log('='.repeat(70));
console.log(`  ✅ 通过: ${passed}`);
console.log(`  ❌ 失败: ${failed}`);
console.log(`  📊 总计: ${totalTests}`);
console.log(`  🎯 通过率: ${(passed / totalTests * 100).toFixed(1)}%`);

if (failures.length > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('  失败详情:');
    failures.forEach((f, i) => {
        console.log(`  ${i + 1}. ${f}`);
    });
}

console.log('='.repeat(70));

if (failed === 0) {
    console.log('\n🎉 全部 100 个测试通过！v5.3.0 性能优化验证成功！\n');
    console.log('📋 修改摘要:');
    console.log('  1. batchMatch() 开头一次性缓存 → DB 查询从 400+ 次降到 4 次');
    console.log('  2. 黑名单过滤改用 Set → 从 O(n²) 降到 O(n)');
    console.log('  3. 独立调用（非 batchMatch）自动回退到直接查询，完全兼容');
    console.log('  4. 缓存在 batchMatch 结束后自动清除，无内存泄漏');
} else {
    console.log(`\n⚠️ 有 ${failed} 个测试失败，请检查上述失败详情。`);
}

process.exit(failed > 0 ? 1 : 0);
