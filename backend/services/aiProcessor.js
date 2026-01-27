/**
 * AI 处理器服务 - 英语课堂专用版 v5.0
 * 
 * 【v5.0 更新】 (2026-01-26)
 * - 新增：文本自动清洗功能（去除加号、统一符号）
 * - 新增：textCleaner 服务集成
 * - 优化：短语和句型统一使用 sb., sth. 等通用符号
 * - 优化：自动删除括号内的示例
 * 
 * 【v4.3.8 更新】
 * - 优化：添加正确性检查（Ms→Ms.等）
 * - 优化：转换规则归类到语法（some→any等）
 * 
 * 【v4.3.7 更新】
 * - 优化：进一步加强短语判断规则，排除更多伪短语
 * 
 * 【v4.3.6 更新】
 * - 优化：短语判断规则 - 只提取真正的固定搭配，避免伪短语
 * 
 * 【v4.3.5 更新】
 * - 修复：排除库过滤 - 排除库中的项不再出现在"待完善入库"
 * 
 * 【v4.3.4 更新】
 * - 修复：AI生成内容保存到数据库（待完善入库能看到AI内容）
 * 
 * 【v4.3.3 更新】
 * - 修复：阶段6匹配结果保存到数据库
 * - 新增：matched_items / unmatched_items 记录
 * - 新增：任务统计字段更新
 * 
 * 【v4.3.2 更新】
 * - 添加详细进度日志推送到前端
 * - 每个阶段都推送详细执行信息
 * 
 * @author Sorryios AI Team
 * @version 5.0
 * @date 2026-01-26
 */

const fs = require('fs');
const path = require('path');

const { TextSplitter } = require('../lib/text-splitter');
const { SorryiosAutomation } = require('../lib/sorryios-automation');
const EnglishReportGenerator = require('./english-report-generator');

const taskQueue = require('./taskQueue');

// 处理日志服务
let matchingService = null;
let processingLogService = null;
let excludeService = null;
try {
    const { getMatchingService } = require('./matchingService');
    const { getProcessingLogService } = require('./processingLogService');
    const { getExcludeService } = require('./excludeService');
    matchingService = getMatchingService();
    processingLogService = getProcessingLogService();
    excludeService = getExcludeService();
    console.log('[AIProcessor] ✓ 处理日志服务已加载');
    console.log('[AIProcessor] ✓ 排除库服务已加载');
} catch (e) {
    console.warn('[AIProcessor] ✗ 处理日志服务未加载:', e.message);
}

// ============================================
// 文本清洗服务 v5.0
// ============================================
let textCleaner = null;
try {
    const { getTextCleaner } = require('./textCleaner');
    textCleaner = getTextCleaner();
    console.log('[AIProcessor] ✓ 文本清洗服务已加载');
} catch (e) {
    console.warn('[AIProcessor] ✗ 文本清洗服务未加载:', e.message);
}

// ============================================
// 配置
// ============================================

const CONFIG = {
    maxSegmentLength: 6000,
    requestInterval: 15000,
    outputDir: path.join(__dirname, '../outputs'),
    progressDir: path.join(__dirname, '../data/progress'),
    maxRetries: 2,
    browserRestartDelay: 5000,
    maxBrowserRestarts: 5,
    
    extractionPrompt: `直接输出JSON，第一个字符是{，最后一个字符是}
禁止：开头语、结尾语、\`\`\`代码块、任何解释说明

你是英语教学助手，从课堂录音内容中找出【学生不懂、需要记住的】词汇。

⚠️ 重要：这是老师上课的录音转文字，你要先理解内容，判断哪些是教学重点！

【✅ 需要提取的情况】
- 老师专门讲解、解释含义的词汇（如："environment，环境，记一下"）
- 老师强调重点的词汇（如："这个词很重要"、"考试会考"）
- 老师给出中文翻译的词汇（如："protect，保护"）
- 老师纠正发音/拼写的词汇
- 学生问"什么意思"、"怎么读"的词汇
- 老师反复强调的词汇

【❌ 不要提取的情况】
- 只是例句中随便出现的简单词（如例句 "The apple is red" 中的 apple, red）
- 老师随口带过、没有解释的词
- 小学基础词汇（is, are, have, the, a, this, that, it, they...）
- 作为背景出现、不是教学重点的词
- 中文讲解中偶尔蹦出的英文

【分类规则】
1. words: 重点单词（英文原形，小写）
2. phrases: 固定短语搭配
3. patterns: 句型模板（如 so...that...）
4. grammar: 语法知识点名称（必须用中文）

⚠️【介词特别注意】
- 单独出现的介词（on, off, up, down, in, out, to, for...）要检查前后文！
- 很可能是动词短语的一部分被语音识别分开了
- 例如：turn off, go out, look for, put on 等
- 如果是短语的一部分，提取完整短语，不要单独提取介词

⚠️⚠️⚠️【短语判断规则 - 非常重要】⚠️⚠️⚠️

只有以下情况才算【真正的短语】，才放入 phrases：

✅ 动词 + 固定介词/副词（介词/副词是固定搭配，换了就错）
   look at, look after, look for, look up
   give up, give in, give out
   put on, put off, put up, turn on, turn off
   get up, get on, get off, take off
   speak up, stand up, wake up

✅ 固定搭配（整体意义 ≠ 单词意义相加）
   look forward to, be good at, be interested in
   take care of, pay attention to, make sure
   a lot of, a kind of, instead of

✅ 特殊句型框架（有固定语法结构）
   it takes sb. + 时间 + to do sth.
   there be...
   so...that..., such...that...
   not only...but also...
   either...or..., neither...nor...

✅ 特殊词性用法（搭配不寻常）
   look + adj.（看起来...，系动词用法）
   the + adj.（表示一类人）
   find it + adj. + to do

❌❌❌ 以下【不是短语】，不要放入 phrases ❌❌❌

❌ 及物动词 + sth./sb.（这只是动词的基本用法，不是短语！）
   protect sth. ❌ → 只提取单词 protect
   clean sth. ❌ → 只提取单词 clean
   speak sth. ❌ → 只提取单词 speak
   
❌ 动词 + 普通名词宾语（宾语可以随便换）
   plant trees ❌ → 只提取单词 plant
   build houses ❌ → 只提取单词 build
   share ideas ❌ → 只提取单词 share
   read books ❌ → 只提取单词 read

❌ 动词 + 宾语 + 介词短语（整个太长，不是固定搭配）
   share ideas on a website ❌ → 只提取 share（动词）
   build houses for people ❌ → 只提取 build（动词）

❌ 介词 + 名词短语（不以动词开头的不是动词短语！）
   for a successful experiment ❌ → 只提取 successful, experiment
   from the article ❌ → 只提取 article
   in science class ❌ → 不提取
   in the morning ❌ → 不提取

❌ 动词 + 介词 + 普通名词（介词后面可以换任何名词）
   go to school ❌ → go to 不是固定短语
   live in Beijing ❌ → live in 不是固定短语

❌ 完整句子（句子不是短语！）
   is this your book ❌ → 不提取
   what do you think ❌ → 不提取

❌ 不完整/不规范的片段（不是通用模板）
   not rich families ❌ → 不是短语
   the whole summer ❌ → 不是短语
   very important ❌ → 只提取 important

❌ 转换规则（应该放到 grammar）
   some → any ❌ → 放grammar，不是短语
   do → does ❌ → 放grammar，不是短语

✅ 例外：介词考点（老师特别强调的介词用法）
   on a website ✅ → 如果老师强调 on 的用法，可以提取
   at night ✅ → 如果老师强调 at 的用法，可以提取

【短语判断口诀】
1. 必须以动词或be开头（for/from/in开头的不是动词短语）
2. 介词/副词是固定的吗？能换吗？不能换→短语，能换→只是单词
3. 整体意义 ≠ 各部分意义相加 → 才是短语
4. 不是通用模板的不算短语（如 build houses, not rich families）

⚠️【语法分类规则 - 非常重要】
以下情况必须放入 grammar，不是短语！

1. 含语法术语的（中文或英文）：
   主语、谓语、宾语、动词、名词、形容词、副词、时态、语态、从句、不定式、动名词、分词、被动语态

2. 转换规则/变化规则（A→B格式）：
   some → any ✅ 放grammar（肯定句变否定句/疑问句的变化）
   a/an → the ✅ 放grammar（冠词用法）
   do → does ✅ 放grammar（第三人称单数变化）
   
3. 语法现象描述：
   "肯定句中用some，否定句/疑问句中用any" → 放grammar
   "可数名词复数加s/es" → 放grammar

⚠️【正确性检查】
提取的单词必须是正确完整的形式：
   Ms ❌ → Ms. ✅（称呼要带点）
   Mr ❌ → Mr. ✅
   Dr ❌ → Dr. ✅
   etc ❌ → etc. ✅

【输出格式】：
{"words":["environment"],"phrases":["look forward to doing sth."],"patterns":["so...that..."],"grammar":["现在完成时","some和any的用法"]}

【待分析内容】
---`,

    detailPrompt: `直接输出JSON，第一个字符是{，最后一个字符是}
禁止：开头语、结尾语、\`\`\`代码块

请为以下词汇/语法生成详细信息。

【输出格式】
{"vocabulary":{"words":[{"word":"","phonetic":"","pos":"","meaning":"","example":""}],"phrases":[{"phrase":"","meaning":"","example":""}],"patterns":[{"pattern":"","meaning":"","example":""}]},"grammar":[{"title":"","definition":"","structure":"","usage":[],"examples":[]}]}

【需要生成详情的内容】
---`,

    get systemPrompt() {
        return this.extractionPrompt;
    }
};

// ============================================
// JSON 提取器
// ============================================

class JsonExtractor {
    static extract(response) {
        if (!response || typeof response !== 'string') return null;
        const text = response.trim();
        try { return JSON.parse(text); } catch (e) {}
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) { try { return JSON.parse(jsonMatch[0]); } catch (e) {} }
        const codeBlockMatch = text.match(/```json?\s*([\s\S]*?)```/);
        if (codeBlockMatch) { try { return JSON.parse(codeBlockMatch[1].trim()); } catch (e) {} }
        try {
            let fixed = text.replace(/^[^{]*/, '').replace(/[^}]*$/, '').replace(/'/g, '"').replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
            return JSON.parse(fixed);
        } catch (e) {}
        console.error('[JsonExtractor] ✗ JSON解析失败');
        return null;
    }
}

// ============================================
// 关键词标准化器 v4.3.1
// ============================================

class KeywordNormalizer {
    constructor() {
        this.grammarMapping = {
            'present perfect': '现在完成时', 'present perfect tense': '现在完成时',
            'simple past': '一般过去时', 'past tense': '一般过去时', 'past': '一般过去时',
            'simple present': '一般现在时', 'present tense': '一般现在时',
            'past continuous': '过去进行时', 'present continuous': '现在进行时',
            'future tense': '一般将来时', 'past perfect': '过去完成时',
            'passive voice': '被动语态', 'passive': '被动语态', 'active voice': '主动语态',
            'infinitive': '不定式', 'to do': '不定式', 'to do sth': '不定式', 'to do sth.': '不定式',
            'gerund': '动名词', 'v-ing': '动名词', 'v-ing as subject': '动名词作主语',
            'participle': '分词', 'present participle': '现在分词', 'past participle': '过去分词',
            'clause': '从句', 'attributive clause': '定语从句', 'relative clause': '定语从句',
            'object clause': '宾语从句', 'adverbial clause': '状语从句',
            'subject': '主语', 'predicate': '谓语', 'object': '宾语',
            'complement': '补语', 'attributive': '定语', 'adverbial': '状语',
            'verb': '动词', 'noun': '名词', 'adjective': '形容词', 'adverb': '副词',
            'third person singular': '第三人称单数',
            'modal verb': '情态动词', 'auxiliary verb': '助动词', 'auxiliary': '助动词',
            'negative sentence': '否定句', 'negative': '否定句',
            'comparative': '比较级', 'superlative': '最高级',
        };
        
        this.grammarKeywords = {
            chinese: ['主语', '谓语', '宾语', '补语', '定语', '状语', '同位语',
                '动词', '名词', '形容词', '副词', '代词', '介词', '连词',
                '时态', '语态', '现在时', '过去时', '将来时', '完成时', '进行时',
                '一般现在时', '一般过去时', '一般将来时', '现在进行时', '过去进行时',
                '现在完成时', '过去完成时', '被动语态', '主动语态',
                '从句', '定语从句', '宾语从句', '状语从句', '主语从句',
                '不定式', '动名词', '分词', '现在分词', '过去分词',
                '第三人称', '单数', '复数', '原形',
                '否定句', '疑问句', '感叹句', '祈使句',
                '比较级', '最高级', '情态动词', '助动词', '系动词',
                '目的状语', '结果状语', '表语', '宾补'],
            english: ['subject', 'predicate', 'object', 'complement', 'attributive', 'adverbial',
                'verb', 'noun', 'adjective', 'adverb', 'tense', 'voice',
                'passive', 'active', 'clause', 'infinitive', 'gerund', 'participle',
                'singular', 'plural', 'negative', 'comparative', 'superlative', 'modal', 'auxiliary']
        };
        
        // 语法模式：这些词/短语本身就是语法内容（加强版）
        this.grammarPatterns = [
            /^to do\b/i,                    // to do 开头
            /^to do sth\.?$/i,              // to do sth.
            /to do sth/i,                   // 任何位置的 to do sth（关键！）
            /^v-?ing/i,                     // v-ing 或 ving 开头
            /\bv-?s\b/i,                    // v-s 或 vs
            /doing sth\.?/i,                // doing sth（任何位置）
            /做.*语/,                        // 做...语
            /作.*语/,                        // 作...语
            /sb\.\s*do/i,                   // sb. do
            /sth\.\s*to\s*do/i,             // sth. to do
        ];
        
        this.properNouns = new Set([
            'english', 'chinese', 'french', 'german', 'spanish', 'japanese', 'korean',
            'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
            'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
            'china', 'america', 'usa', 'uk', 'england', 'france', 'germany', 'japan', 'korea', 'russia', 'italy', 'spain', 'canada', 'australia',
            'beijing', 'shanghai', 'london', 'paris', 'tokyo', 'new york',
            'christmas', 'easter', 'halloween', 'thanksgiving', 'internet', 'wifi', 'tv'
        ]);
    }

    normalize(keywords) {
        console.log('\n[KeywordNormalizer] ═══════════════════════════════════════');
        console.log('[KeywordNormalizer] 阶段5.1: 标准化处理');
        console.log('[KeywordNormalizer] ═══════════════════════════════════════');
        
        const original = {
            words: keywords.words?.length || 0,
            phrases: keywords.phrases?.length || 0,
            patterns: keywords.patterns?.length || 0,
            grammar: keywords.grammar?.length || 0
        };
        console.log(`[KeywordNormalizer] 输入: 单词${original.words}, 短语${original.phrases}, 句型${original.patterns}, 语法${original.grammar}`);
        
        let result = this.correctClassification(keywords);
        result = this.normalizeCase(result);
        result = this.normalizeAbbreviations(result);
        result.grammar = this.convertGrammarToChinese(result.grammar);
        result = this.deduplicate(result);
        result = this.filterInvalid(result);
        
        console.log(`[KeywordNormalizer] 输出: 单词${result.words.length}, 短语${result.phrases.length}, 句型${result.patterns.length}, 语法${result.grammar.length}`);
        console.log('[KeywordNormalizer] ═══════════════════════════════════════\n');
        
        return result;
    }

    /**
     * 阶段8.1: 最终标准化
     */
    finalNormalize(mergedData) {
        console.log('\n[FinalNormalizer] ═══════════════════════════════════════');
        console.log('[FinalNormalizer] 阶段8.1: 最终标准化');
        console.log('[FinalNormalizer] ═══════════════════════════════════════');
        
        const original = {
            words: mergedData.vocabulary.words?.length || 0,
            phrases: mergedData.vocabulary.phrases?.length || 0,
            patterns: mergedData.vocabulary.patterns?.length || 0,
            grammar: mergedData.grammar?.length || 0
        };
        console.log(`[FinalNormalizer] 输入: 单词${original.words}, 短语${original.phrases}, 句型${original.patterns}, 语法${original.grammar}`);
        
        const result = JSON.parse(JSON.stringify(mergedData));
        
        // 步骤1: 检查名称是否为语法
        console.log('[FinalNormalizer] → 步骤1: 检查名称是否为语法内容');
        const movedFromName = [];
        
        result.vocabulary.words = result.vocabulary.words.filter(item => {
            if (this.isGrammarPattern(item.word)) {
                console.log(`[FinalNormalizer]   单词→语法: "${item.word}"`);
                movedFromName.push({ title: this.convertToGrammarTitle(item.word), definition: item.meaning || '', _source: item._source });
                return false;
            }
            return true;
        });
        
        result.vocabulary.phrases = result.vocabulary.phrases.filter(item => {
            if (this.isGrammarPattern(item.phrase)) {
                console.log(`[FinalNormalizer]   短语→语法: "${item.phrase}"`);
                movedFromName.push({ title: this.convertToGrammarTitle(item.phrase), definition: item.meaning || '', _source: item._source });
                return false;
            }
            return true;
        });
        
        result.vocabulary.patterns = result.vocabulary.patterns.filter(item => {
            if (this.isGrammarPattern(item.pattern)) {
                console.log(`[FinalNormalizer]   句型→语法: "${item.pattern}"`);
                movedFromName.push({ title: this.convertToGrammarTitle(item.pattern), definition: item.meaning || '', _source: item._source });
                return false;
            }
            return true;
        });
        
        console.log(`[FinalNormalizer]   因名称移动: ${movedFromName.length} 项`);
        
        // 步骤2: 检查含义中的语法词
        console.log('[FinalNormalizer] → 步骤2: 检查含义中的语法词');
        const movedFromMeaning = [];
        
        result.vocabulary.words = result.vocabulary.words.filter(item => {
            if (this.containsGrammarKeyword(item.meaning || '')) {
                console.log(`[FinalNormalizer]   单词→语法(含义): "${item.word}"`);
                movedFromMeaning.push({ title: this.extractGrammarTitle(item.word, item.meaning), definition: item.meaning, _source: item._source });
                return false;
            }
            return true;
        });
        
        result.vocabulary.phrases = result.vocabulary.phrases.filter(item => {
            if (this.containsGrammarKeyword(item.meaning || '')) {
                console.log(`[FinalNormalizer]   短语→语法(含义): "${item.phrase}"`);
                movedFromMeaning.push({ title: this.extractGrammarTitle(item.phrase, item.meaning), definition: item.meaning, _source: item._source });
                return false;
            }
            return true;
        });
        
        result.vocabulary.patterns = result.vocabulary.patterns.filter(item => {
            if (this.containsGrammarKeyword(item.meaning || '')) {
                console.log(`[FinalNormalizer]   句型→语法(含义): "${item.pattern}"`);
                movedFromMeaning.push({ title: this.extractGrammarTitle(item.pattern, item.meaning), definition: item.meaning, _source: item._source });
                return false;
            }
            return true;
        });
        
        console.log(`[FinalNormalizer]   因含义移动: ${movedFromMeaning.length} 项`);
        result.grammar.push(...movedFromName, ...movedFromMeaning);
        
        // 步骤3: 标准化大小写
        console.log('[FinalNormalizer] → 步骤3: 标准化大小写');
        
        result.vocabulary.words = result.vocabulary.words.map(item => {
            if (item.word) {
                const oldWord = item.word;
                item.word = this.normalizeItemCase(item.word);
                if (oldWord !== item.word) console.log(`[FinalNormalizer]   "${oldWord}" → "${item.word}"`);
            }
            return item;
        });
        
        result.vocabulary.phrases = result.vocabulary.phrases.map(item => {
            if (item.phrase) {
                const oldPhrase = item.phrase;
                item.phrase = this.normalizeItemCase(item.phrase);
                if (oldPhrase !== item.phrase) console.log(`[FinalNormalizer]   "${oldPhrase}" → "${item.phrase}"`);
            }
            return item;
        });
        
        result.vocabulary.patterns = result.vocabulary.patterns.map(item => {
            if (item.pattern) {
                const oldPattern = item.pattern;
                item.pattern = this.normalizeItemCase(item.pattern);
                if (oldPattern !== item.pattern) console.log(`[FinalNormalizer]   "${oldPattern}" → "${item.pattern}"`);
            }
            return item;
        });
        
        // 步骤4: 去重
        console.log('[FinalNormalizer] → 步骤4: 去重');
        const beforeDedupe = {
            words: result.vocabulary.words.length,
            phrases: result.vocabulary.phrases.length,
            patterns: result.vocabulary.patterns.length,
            grammar: result.grammar.length
        };
        
        result.vocabulary.words = this.dedupeObjects(result.vocabulary.words, 'word');
        result.vocabulary.phrases = this.dedupeObjects(result.vocabulary.phrases, 'phrase');
        result.vocabulary.patterns = this.dedupeObjects(result.vocabulary.patterns, 'pattern');
        result.grammar = this.dedupeObjects(result.grammar, 'title');
        
        console.log(`[FinalNormalizer]   单词: ${beforeDedupe.words} → ${result.vocabulary.words.length}`);
        console.log(`[FinalNormalizer]   短语: ${beforeDedupe.phrases} → ${result.vocabulary.phrases.length}`);
        console.log(`[FinalNormalizer]   句型: ${beforeDedupe.patterns} → ${result.vocabulary.patterns.length}`);
        console.log(`[FinalNormalizer]   语法: ${beforeDedupe.grammar} → ${result.grammar.length}`);
        
        // 更新统计
        result.summary = {
            total_words: result.vocabulary.words.length,
            total_phrases: result.vocabulary.phrases.length,
            total_patterns: result.vocabulary.patterns.length,
            total_grammar: result.grammar.length
        };
        
        console.log('[FinalNormalizer] ───────────────────────────────────────');
        console.log(`[FinalNormalizer] 最终: 单词${result.vocabulary.words.length}, 短语${result.vocabulary.phrases.length}, 句型${result.vocabulary.patterns.length}, 语法${result.grammar.length}`);
        console.log('[FinalNormalizer] ═══════════════════════════════════════\n');
        
        // ========== v5.0: 文本清洗 ==========
        // 去除加号、替换通用符号（sb., sth.）、删除括号示例
        if (textCleaner) {
            console.log('[TextCleaner] ═══════════════════════════════════════');
            console.log('[TextCleaner] 开始清洗文本（去除+号、统一符号）');
            console.log('[TextCleaner] ═══════════════════════════════════════');
            
            const beforeClean = {
                words: result.vocabulary.words.length,
                phrases: result.vocabulary.phrases.length,
                patterns: result.vocabulary.patterns.length,
                grammar: result.grammar.length
            };
            
            try {
                // 清洗词汇数据
                result.vocabulary = textCleaner.cleanVocabulary(result.vocabulary);
                
                // 清洗语法数据
                result.grammar = textCleaner.cleanGrammarList(result.grammar);
                
                console.log(`[TextCleaner] ✅ 清洗完成:`);
                console.log(`[TextCleaner]   - 单词: ${beforeClean.words} 项`);
                console.log(`[TextCleaner]   - 短语: ${beforeClean.phrases} 项`);
                console.log(`[TextCleaner]   - 句型: ${beforeClean.patterns} 项`);
                console.log(`[TextCleaner]   - 语法: ${beforeClean.grammar} 项`);
                console.log('[TextCleaner] ═══════════════════════════════════════\n');
            } catch (cleanError) {
                console.error('[TextCleaner] ❌ 清洗失败:', cleanError.message);
                console.warn('[TextCleaner] ⚠️  将使用未清洗的数据');
            }
        } else {
            console.warn('[TextCleaner] ⚠️  文本清洗服务未启用，跳过清洗');
        }
        
        return result;
    }

    isGrammarPattern(text) {
        if (!text) return false;
        for (const pattern of this.grammarPatterns) {
            if (pattern.test(text)) return true;
        }
        const lowerText = text.toLowerCase().trim();
        if (this.grammarMapping[lowerText]) return true;
        return false;
    }

    convertToGrammarTitle(text) {
        const lowerText = text.toLowerCase().trim();
        if (this.grammarMapping[lowerText]) return this.grammarMapping[lowerText];
        if (/^to do\b/i.test(text)) return '不定式';
        if (/^v-?ing/i.test(text)) return '动名词';
        return text;
    }

    containsGrammarKeyword(text) {
        if (!text) return false;
        for (const keyword of this.grammarKeywords.chinese) {
            if (text.includes(keyword)) return true;
        }
        return false;
    }

    extractGrammarTitle(word, meaning) {
        for (const keyword of this.grammarKeywords.chinese) {
            if (meaning.includes(keyword)) {
                const match = meaning.match(new RegExp(`[（(]([^）)]*${keyword}[^）)]*)[）)]`));
                if (match) return match[1].trim();
                return keyword;
            }
        }
        return `${word}（${meaning}）`;
    }

    /**
     * 🆕 v4.3.1 修复：标准化大小写（正确处理 sth. sb. 等缩写）
     */
    normalizeItemCase(text) {
        if (!text || typeof text !== 'string') return '';
        
        // 1. 保护 ... 和缩写（sth. sb. sw.）- 使用不会被 toLowerCase 影响的标记
        let result = text;
        result = result.replace(/\.\.\./g, '\x00ELLIPSIS\x00');
        result = result.replace(/\b(sth|sb|sw)\./gi, (match) => match.toLowerCase().replace('.', '\x00DOT\x00'));
        
        // 2. 按空格分割
        const words = result.split(/(\s+)/);
        
        // 3. 处理每个单词
        const normalized = words.map(word => {
            if (/^\s+$/.test(word)) return word; // 保留空格
            
            // 跳过包含保护标记的部分
            if (word.includes('\x00')) return word;
            
            // 移除标点来检查是否是专有名词
            const cleanWord = word.replace(/[.,;:!?'"()]/g, '').toLowerCase();
            
            // 专有名词首字母大写
            if (this.properNouns.has(cleanWord)) {
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            
            return word.toLowerCase();
        });
        
        result = normalized.join('');
        
        // 4. 恢复保护的内容
        result = result.replace(/\x00ELLIPSIS\x00/g, '...');
        result = result.replace(/\x00DOT\x00/g, '.');
        
        return result.trim();
    }

    dedupeObjects(array, keyField) {
        if (!Array.isArray(array) || array.length === 0) return [];
        const seen = new Map();
        return array.filter(item => {
            if (!item || !item[keyField]) return false;
            const key = String(item[keyField]).toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.set(key, item);
            return true;
        });
    }

    correctClassification(keywords) {
        const result = { words: [], phrases: [], patterns: [], grammar: [...(keywords.grammar || [])] };
        for (const word of (keywords.words || [])) {
            if (this.isGrammarContent(word)) result.grammar.push(word);
            else result.words.push(word);
        }
        for (const phrase of (keywords.phrases || [])) {
            if (this.isGrammarContent(phrase)) result.grammar.push(phrase);
            else result.phrases.push(phrase);
        }
        for (const pattern of (keywords.patterns || [])) {
            if (this.isGrammarContent(pattern)) result.grammar.push(pattern);
            else result.patterns.push(pattern);
        }
        return result;
    }

    isGrammarContent(text) {
        if (!text) return false;
        const lowerText = text.toLowerCase();
        for (const keyword of this.grammarKeywords.chinese) { if (text.includes(keyword)) return true; }
        for (const keyword of this.grammarKeywords.english) {
            if (new RegExp(`\\b${keyword}\\b`, 'i').test(lowerText)) return true;
        }
        if (this.grammarMapping[lowerText]) return true;
        for (const pattern of this.grammarPatterns) { if (pattern.test(text)) return true; }
        return false;
    }

    normalizeCase(keywords) {
        return {
            words: (keywords.words || []).map(word => {
                const lower = word.toLowerCase().trim();
                if (this.properNouns.has(lower)) return this.capitalizeFirst(lower);
                return lower;
            }),
            phrases: (keywords.phrases || []).map(phrase => this.normalizeItemCase(phrase)),
            patterns: (keywords.patterns || []).map(pattern => this.normalizeItemCase(pattern)),
            grammar: keywords.grammar || []
        };
    }

    capitalizeFirst(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    normalizeAbbreviations(keywords) {
        const abbrs = { 'something': 'sth.', 'somebody': 'sb.', 'someone': 'sb.', 'somewhere': 'sw.', 'sth': 'sth.', 'sb': 'sb.', 'sw': 'sw.' };
        const normalize = (text) => {
            if (!text) return '';
            let result = text;
            for (const [full, abbr] of Object.entries(abbrs)) {
                result = result.replace(new RegExp(`\\b${full}\\b`, 'gi'), abbr);
            }
            return result.replace(/\.{2,}/g, '.').replace(/\s+/g, ' ').trim();
        };
        return {
            words: (keywords.words || []).map(normalize),
            phrases: (keywords.phrases || []).map(normalize),
            patterns: (keywords.patterns || []).map(normalize),
            grammar: keywords.grammar || []
        };
    }

    convertGrammarToChinese(grammarList) {
        if (!grammarList || grammarList.length === 0) return [];
        return grammarList.map(grammar => {
            if (!grammar) return null;
            if (/[\u4e00-\u9fa5]/.test(grammar)) return grammar.trim();
            const lowerGrammar = grammar.toLowerCase().trim();
            if (this.grammarMapping[lowerGrammar]) return this.grammarMapping[lowerGrammar];
            for (const [en, cn] of Object.entries(this.grammarMapping)) {
                if (lowerGrammar.includes(en)) return cn;
            }
            return grammar.trim();
        }).filter(Boolean);
    }

    deduplicate(keywords) {
        const dedupeArray = (arr) => {
            if (!arr || arr.length === 0) return [];
            const seen = new Set();
            return arr.filter(item => {
                if (!item) return false;
                const key = item.toLowerCase().trim();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        };
        return {
            words: dedupeArray(keywords.words),
            phrases: dedupeArray(keywords.phrases),
            patterns: dedupeArray(keywords.patterns),
            grammar: dedupeArray(keywords.grammar)
        };
    }

    filterInvalid(keywords) {
        return {
            words: (keywords.words || []).filter(w => w && w.length >= 2 && !/\s/.test(w) && !/[\u4e00-\u9fa5]/.test(w) && /[a-zA-Z]/.test(w)),
            phrases: (keywords.phrases || []).filter(p => p && p.length >= 3 && !/[\u4e00-\u9fa5]/.test(p) && p.split(/\s+/).filter(w => w.length > 0).length >= 2),
            patterns: (keywords.patterns || []).filter(p => p && p.length >= 3 && !/[\u4e00-\u9fa5]/.test(p)),
            grammar: (keywords.grammar || []).filter(g => g && g.trim().length > 0)
        };
    }
}

const keywordNormalizer = new KeywordNormalizer();

// ============================================
// 结果合并器
// ============================================

class ResultMerger {
    static createEmptyResult() {
        return { vocabulary: { words: [], phrases: [], patterns: [] }, grammar: [], summary: { total_words: 0, total_phrases: 0, total_patterns: 0, total_grammar: 0 } };
    }

    static mergeKeywords(results) {
        const merged = { words: [], phrases: [], patterns: [], grammar: [] };
        for (const result of results) {
            if (!result) continue;
            if (Array.isArray(result.words)) merged.words.push(...result.words);
            else if (result.vocabulary?.words) merged.words.push(...result.vocabulary.words.map(w => w.word || w).filter(Boolean));
            if (Array.isArray(result.phrases)) merged.phrases.push(...result.phrases);
            else if (result.vocabulary?.phrases) merged.phrases.push(...result.vocabulary.phrases.map(p => p.phrase || p).filter(Boolean));
            if (Array.isArray(result.patterns)) merged.patterns.push(...result.patterns);
            else if (result.vocabulary?.patterns) merged.patterns.push(...result.vocabulary.patterns.map(p => p.pattern || p).filter(Boolean));
            if (Array.isArray(result.grammar)) merged.grammar.push(...result.grammar.map(g => typeof g === 'string' ? g : g?.title).filter(Boolean));
        }
        console.log(`[ResultMerger] 合并: 单词${merged.words.length}, 短语${merged.phrases.length}, 句型${merged.patterns.length}, 语法${merged.grammar.length}`);
        return merged;
    }
}

// ============================================
// 单词过滤器
// ============================================

class WordFilter {
    constructor() {
        this.elementaryWords = new Set();
        this.blacklistWords = new Set();
        const elementaryPath = path.join(__dirname, '../data/elementary_words.json');
        const blacklistPath = path.join(__dirname, '../data/blacklist_words.json');
        try { if (fs.existsSync(elementaryPath)) { this.elementaryWords = new Set(JSON.parse(fs.readFileSync(elementaryPath, 'utf-8')).words.map(w => w.toLowerCase())); console.log(`[WordFilter] 加载小学词汇: ${this.elementaryWords.size} 个`); } } catch (e) {}
        try { if (fs.existsSync(blacklistPath)) { this.blacklistWords = new Set(JSON.parse(fs.readFileSync(blacklistPath, 'utf-8')).words.map(w => w.toLowerCase())); console.log(`[WordFilter] 加载黑名单: ${this.blacklistWords.size} 个`); } } catch (e) {}
    }

    filter(data) {
        console.log('\n[WordFilter] ═══════════════════════════════════════');
        console.log('[WordFilter] 阶段8: 过滤基础词汇');
        console.log('[WordFilter] ═══════════════════════════════════════');
        if (!data?.vocabulary) return data;
        let filtered = JSON.parse(JSON.stringify(data));
        const originalCount = filtered.vocabulary.words?.length || 0;
        if (filtered.vocabulary.words) {
            filtered.vocabulary.words = filtered.vocabulary.words.filter(item => {
                const word = (item.word || '').toLowerCase();
                return !this.elementaryWords.has(word) && !this.blacklistWords.has(word) && word.length >= 2;
            });
        }
        const finalCount = filtered.vocabulary.words?.length || 0;
        console.log(`[WordFilter] 单词: ${originalCount} → ${finalCount} (移除 ${originalCount - finalCount} 个)`);
        filtered.summary = { total_words: finalCount, total_phrases: filtered.vocabulary.phrases?.length || 0, total_patterns: filtered.vocabulary.patterns?.length || 0, total_grammar: filtered.grammar?.length || 0 };
        console.log('[WordFilter] ═══════════════════════════════════════\n');
        return filtered;
    }
}

// ============================================
// 辅助函数
// ============================================

function generateDefaultTitle() { const now = new Date(); return `${now.getMonth() + 1}月${now.getDate()}日英语课堂笔记`; }
function isGarbled(str) { if (!str) return true; if (/[\u00c0-\u00ff]{2,}|Ã|â|ã/.test(str)) return true; return str.length > 5 && !(str.match(/[\u4e00-\u9fa5]/g) || []).length; }
function getFinalTitle(task) {
    if (task.customTitle?.trim()) return task.customTitle.trim();
    const baseName = path.basename(task.file.originalName, path.extname(task.file.originalName));
    if (!isGarbled(baseName)) return baseName;
    return generateDefaultTitle();
}
function getProgressFilePath(taskId) { return path.join(CONFIG.progressDir, `${taskId}.json`); }
function saveProgress(taskId, progressData) { if (!fs.existsSync(CONFIG.progressDir)) fs.mkdirSync(CONFIG.progressDir, { recursive: true }); fs.writeFileSync(getProgressFilePath(taskId), JSON.stringify(progressData, null, 2), 'utf-8'); console.log(`💾 进度已保存: ${progressData.completedCount}/${progressData.totalSegments}`); }
function loadProgress(taskId) { const filePath = getProgressFilePath(taskId); if (fs.existsSync(filePath)) { try { const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')); console.log(`📂 加载进度: ${data.completedCount}/${data.totalSegments}`); return data; } catch (e) {} } return null; }
function clearProgress(taskId) { const filePath = getProgressFilePath(taskId); if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); console.log(`🗑️ 进度已清理`); } }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function withTimeout(promise, ms, errorMsg = '超时') { let timeoutId; const timeoutPromise = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error(errorMsg)), ms); }); return Promise.race([promise.finally(() => clearTimeout(timeoutId)), timeoutPromise]); }

// ============================================
// 浏览器管理
// ============================================

async function initBrowser() { console.log('🌐 初始化浏览器...'); const automation = new SorryiosAutomation(); await withTimeout(automation.init(), 60000, '浏览器启动超时'); await withTimeout(automation.login(), 60000, '登录超时'); await withTimeout(automation.selectIdleAccount(), 30000, '选择账号超时'); console.log('✅ AI账号已就绪'); return automation; }
async function closeBrowser(automation) { if (automation) { try { await automation.close(); console.log('🔒 浏览器已关闭'); } catch (e) { try { require('child_process').exec('taskkill /F /IM chromium.exe /T', () => {}); } catch (e2) {} } } await sleep(2000); }
async function processSegmentWithRetry(automation, message, index, total, onProgress = null) {
    for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
        try {
            const logMsg = `📤 发送片段 ${index + 1}/${total} (尝试 ${attempt}/${CONFIG.maxRetries})`;
            console.log(logMsg);
            if (onProgress) onProgress({ currentStep: logMsg });
            
            const response = await withTimeout(automation.sendMessage(message), 300000, `片段 ${index + 1} 超时`);
            const parsed = JsonExtractor.extract(typeof response === 'object' ? response.text : response);
            if (parsed) { 
                const successMsg = `✅ 片段 ${index + 1}/${total} 处理成功`;
                console.log(successMsg); 
                if (onProgress) onProgress({ currentStep: successMsg });
                return { index, success: true, output: parsed, attempt }; 
            }
            throw new Error('JSON解析失败');
        } catch (error) { 
            const errorMsg = `❌ 片段 ${index + 1} 尝试 ${attempt} 失败: ${error.message}`;
            console.error(errorMsg); 
            if (onProgress) onProgress({ currentStep: errorMsg });
            if (attempt < CONFIG.maxRetries) await sleep(CONFIG.browserRestartDelay); 
        }
    }
    return { index, success: false, error: `所有尝试都失败` };
}

// ============================================
// 主处理函数
// ============================================

async function processTask(task, onProgress) {
    const { id: taskId, file } = task;
    console.log('\n' + '='.repeat(60)); 
    console.log('🎓 英语课堂智能分析系统 v4.3.2'); 
    console.log('='.repeat(60)); 
    console.log(`📁 任务ID: ${taskId}`); 
    console.log(`📄 文件: ${file.originalName}`); 
    console.log('='.repeat(60) + '\n');

    let automation = null; 
    let results = []; 
    let segmentTexts = []; 
    let totalSegments = 0; 
    let startIndex = 0; 
    let needNewConversation = false; 
    let browserRestartCount = 0;
    const wordFilter = new WordFilter();

    try {
        // ========== 阶段1-3: 准备工作 ==========
        onProgress({ currentStep: '📌 阶段1-3: 准备工作', progress: 2 });
        
        onProgress({ currentStep: '📄 读取文件...', progress: 5 });
        const content = fs.readFileSync(file.savedPath, 'utf-8'); 
        const fileInfo = `📄 文件读取完成: ${content.length} 字符`;
        console.log(fileInfo);
        onProgress({ currentStep: fileInfo, progress: 8 });
        
        onProgress({ currentStep: '✂️ 智能分段中...', progress: 10 });
        const splitter = new TextSplitter({ maxSegmentLength: CONFIG.maxSegmentLength, minSegmentLength: 200 });
        segmentTexts = splitter.split(content).map(s => typeof s === 'object' ? s.content : s); 
        totalSegments = segmentTexts.length; 
        const segmentInfo = `📝 分段完成: ${totalSegments} 段`;
        console.log(segmentInfo);
        onProgress({ currentStep: segmentInfo, progress: 12 });
        
        const savedProgress = loadProgress(taskId);
        if (savedProgress?.results?.length > 0 && savedProgress.completedCount > 0) { 
            results = savedProgress.results; 
            startIndex = savedProgress.completedCount; 
            needNewConversation = true;
            onProgress({ currentStep: `📂 恢复进度: 已完成 ${startIndex}/${totalSegments} 段`, progress: 15 });
        } else { 
            results = new Array(totalSegments).fill(null); 
        }

        // ========== 阶段4: AI提取关键词 ==========
        console.log('\n' + '─'.repeat(60)); 
        console.log('📌 阶段4: AI提取关键词'); 
        console.log('─'.repeat(60));
        onProgress({ currentStep: '📌 阶段4: AI提取关键词', progress: 18 });
        
        let currentIndex = startIndex;
        while (currentIndex < totalSegments) {
            if (!automation) {
                if (browserRestartCount >= CONFIG.maxBrowserRestarts) throw new Error(`浏览器重启次数过多`);
                const browserMsg = browserRestartCount > 0 ? `🔄 重启浏览器 (${browserRestartCount + 1}次)...` : '🌐 启动浏览器...';
                onProgress({ currentStep: browserMsg, progress: 18 });
                try { 
                    automation = await initBrowser(); 
                    browserRestartCount++; 
                    needNewConversation = true;
                    onProgress({ currentStep: '✅ AI账号已就绪', progress: 19 });
                } catch (e) { 
                    onProgress({ currentStep: `⚠️ 浏览器启动失败: ${e.message}`, progress: 18 });
                    await sleep(CONFIG.browserRestartDelay); 
                    continue; 
                }
            }
            
            const progressPercent = Math.round(20 + (currentIndex / totalSegments) * 40);
            onProgress({ currentStep: `🔄 处理片段 ${currentIndex + 1}/${totalSegments}...`, progress: progressPercent });
            
            const message = needNewConversation ? `${CONFIG.extractionPrompt}\n${segmentTexts[currentIndex]}\n---` : `继续提取，JSON格式：\n\n${segmentTexts[currentIndex]}`;
            needNewConversation = false;
            
            try {
                const result = await processSegmentWithRetry(automation, message, currentIndex, totalSegments, onProgress);
                result.input = segmentTexts[currentIndex]; 
                results[currentIndex] = result;
                
                saveProgress(taskId, { taskId, totalSegments, completedCount: currentIndex + 1, successCount: results.filter(r => r?.success).length, results, lastUpdated: new Date().toISOString() });
                onProgress({ currentStep: `💾 进度已保存: ${currentIndex + 1}/${totalSegments}`, progress: progressPercent });
                
                currentIndex++; 
                if (currentIndex < totalSegments) { 
                    const waitMsg = `⏳ 等待 ${CONFIG.requestInterval / 1000} 秒...`;
                    console.log(waitMsg);
                    onProgress({ currentStep: waitMsg, progress: progressPercent });
                    await sleep(CONFIG.requestInterval); 
                }
            } catch (e) { 
                onProgress({ currentStep: `⚠️ 处理异常，准备重启浏览器...`, progress: progressPercent });
                await closeBrowser(automation); 
                automation = null; 
                needNewConversation = true; 
                await sleep(CONFIG.browserRestartDelay); 
            }
        }

        // ========== 阶段5: 合并关键词 ==========
        console.log('\n' + '─'.repeat(60)); 
        console.log('📌 阶段5: 合并关键词'); 
        console.log('─'.repeat(60));
        onProgress({ currentStep: '📌 阶段5: 合并关键词', progress: 62 });
        
        const successResults = results.filter(r => r?.success && r.output).map(r => r.output);
        const successInfo = `✅ 成功片段: ${successResults.length}/${totalSegments}`;
        console.log(successInfo);
        onProgress({ currentStep: successInfo, progress: 62 });
        
        const rawKeywords = ResultMerger.mergeKeywords(successResults);
        const mergeInfo = `🔀 合并结果: 单词${rawKeywords.words.length}, 短语${rawKeywords.phrases.length}, 句型${rawKeywords.patterns.length}, 语法${rawKeywords.grammar.length}`;
        console.log(mergeInfo);
        onProgress({ currentStep: mergeInfo, progress: 63 });
        
        onProgress({ currentStep: '🔧 标准化处理...', progress: 64 });
        const extractedKeywords = keywordNormalizer.normalize(rawKeywords);

        // ========== 阶段6: 匹配数据库 ==========
        console.log('\n' + '─'.repeat(60)); 
        console.log('📌 阶段6: 匹配数据库'); 
        console.log('─'.repeat(60));
        onProgress({ currentStep: '📌 阶段6: 匹配数据库', progress: 65 });
        
        let mergedData = ResultMerger.createEmptyResult(); 
        let unmatchedKeywords = { words: [], phrases: [], patterns: [], grammar: [] };
        
        if (matchingService) {
            try {
                onProgress({ currentStep: '🔍 正在匹配数据库...', progress: 66 });
                const matchResult = matchingService.batchMatch(extractedKeywords);
                const stats = matchingService.getMatchStats(matchResult);
                
                const matchInfo = `🔍 匹配结果: 精确${stats.exactMatch}, 模糊${stats.fuzzyMatch}, 未匹配${stats.unmatched}`;
                console.log(`[阶段6] ${matchInfo}`);
                onProgress({ currentStep: matchInfo, progress: 67 });
                
                for (const match of matchResult.matched) {
                    if (match.matched_data) {
                        const item = { ...match.matched_data, _source: 'database', _matchScore: match.score };
                        if (match.item_type === 'word') mergedData.vocabulary.words.push(item);
                        else if (match.item_type === 'phrase') mergedData.vocabulary.phrases.push(item);
                        else if (match.item_type === 'pattern') mergedData.vocabulary.patterns.push(item);
                        else if (match.item_type === 'grammar') mergedData.grammar.push(item);
                    }
                }
                for (const unmatched of matchResult.unmatched) {
                    // v4.3.5: 检查是否在排除库中，如果在则跳过
                    if (excludeService && excludeService.isExcluded(unmatched.original_text, unmatched.item_type)) {
                        console.log(`[阶段6] 🚫 跳过排除项: ${unmatched.original_text} (${unmatched.item_type})`);
                        continue;
                    }
                    if (unmatched.item_type === 'word') unmatchedKeywords.words.push(unmatched.original_text);
                    else if (unmatched.item_type === 'phrase') unmatchedKeywords.phrases.push(unmatched.original_text);
                    else if (unmatched.item_type === 'pattern') unmatchedKeywords.patterns.push(unmatched.original_text);
                    else if (unmatched.item_type === 'grammar') unmatchedKeywords.grammar.push(unmatched.original_text);
                }
                
                const dbInfo = `✅ 从数据库获取: ${matchResult.matched.length} 项`;
                console.log(`[阶段6] ${dbInfo}`);
                onProgress({ currentStep: dbInfo, progress: 68 });
                
                if (matchResult.unmatched.length > 0) {
                    const needAiInfo = `⏳ 需要AI生成: ${matchResult.unmatched.length} 项`;
                    console.log(`[阶段6] ${needAiInfo}`);
                    onProgress({ currentStep: needAiInfo, progress: 69 });
                }

                // ========== v5.0: 保存匹配记录到数据库 ==========
                if (processingLogService) {
                    try {
                        // 保存匹配记录
                        const matchedItems = matchResult.matched.map(m => ({
                            task_id: taskId,
                            original_text: m.original_text,
                            matched_text: m.matched_text,
                            item_type: m.item_type,
                            match_score: m.score,
                            matched_data: m.matched_data,
                            status: m.score >= 1.0 ? 'confirmed' : 'pending'
                        }));
                        
                        if (matchedItems.length > 0) {
                            processingLogService.addMatchedItems(matchedItems);
                            console.log(`[阶段6] 💾 保存匹配记录: ${matchedItems.length} 条`);
                            onProgress({ currentStep: `💾 保存匹配记录: ${matchedItems.length} 条`, progress: 69 });
                        }
                        
                        // 保存未匹配记录（v4.3.5: 先过滤排除库）
                        let unmatchedToSave = matchResult.unmatched;
                        if (excludeService) {
                            unmatchedToSave = matchResult.unmatched.filter(u => 
                                !excludeService.isExcluded(u.original_text, u.item_type)
                            );
                            const excludedCount = matchResult.unmatched.length - unmatchedToSave.length;
                            if (excludedCount > 0) {
                                console.log(`[阶段6] 🚫 排除库过滤: ${excludedCount} 项`);
                            }
                        }
                        
                        const unmatchedItemsToSave = unmatchedToSave.map(u => ({
                            task_id: taskId,
                            original_text: u.original_text,
                            item_type: u.item_type,
                            ai_generated: null,
                            status: 'pending'
                        }));
                        
                        if (unmatchedItemsToSave.length > 0) {
                            processingLogService.addUnmatchedItems(unmatchedItemsToSave);
                            console.log(`[阶段6] 💾 保存未匹配记录: ${unmatchedItemsToSave.length} 条`);
                            onProgress({ currentStep: `💾 保存未匹配记录: ${unmatchedItemsToSave.length} 条`, progress: 69 });
                        }
                        
                        // 更新任务统计（使用过滤后的数量）
                        processingLogService.updateTaskStats(taskId, {
                            total_items: matchResult.matched.length + unmatchedToSave.length,
                            exact_match_count: matchResult.matched.filter(m => m.score >= 1.0).length,
                            fuzzy_match_count: matchResult.matched.filter(m => m.score < 1.0).length,
                            unmatched_count: unmatchedToSave.length
                        });
                        console.log(`[阶段6] 💾 更新任务统计完成`);
                        
                    } catch (logError) {
                        console.warn('[阶段6] 保存日志失败:', logError.message);
                    }
                }
            } catch (e) { 
                console.warn('[阶段6] 匹配失败:', e.message); 
                onProgress({ currentStep: `⚠️ 数据库匹配失败: ${e.message}`, progress: 68 });
                unmatchedKeywords = extractedKeywords; 
            }
        } else { 
            onProgress({ currentStep: '⚠️ 数据库服务未启用，全部由AI生成', progress: 68 });
            unmatchedKeywords = extractedKeywords; 
        }

        // ========== 阶段7: AI生成详情 ==========
        const totalUnmatched = unmatchedKeywords.words.length + unmatchedKeywords.phrases.length + unmatchedKeywords.patterns.length + unmatchedKeywords.grammar.length;
        if (totalUnmatched > 0) {
            console.log('\n' + '─'.repeat(60)); 
            console.log(`📌 阶段7: AI生成详情 (${totalUnmatched}项)`); 
            console.log('─'.repeat(60));
            onProgress({ currentStep: `📌 阶段7: AI生成详情 (${totalUnmatched}项)`, progress: 70 });
            
            const detailContent = [];
            if (unmatchedKeywords.words.length > 0) {
                detailContent.push(`【单词】${unmatchedKeywords.words.join(', ')}`);
                onProgress({ currentStep: `📝 待生成单词: ${unmatchedKeywords.words.length} 个`, progress: 71 });
            }
            if (unmatchedKeywords.phrases.length > 0) {
                detailContent.push(`【短语】${unmatchedKeywords.phrases.join(', ')}`);
                onProgress({ currentStep: `📝 待生成短语: ${unmatchedKeywords.phrases.length} 个`, progress: 72 });
            }
            if (unmatchedKeywords.patterns.length > 0) {
                detailContent.push(`【句型】${unmatchedKeywords.patterns.join(', ')}`);
                onProgress({ currentStep: `📝 待生成句型: ${unmatchedKeywords.patterns.length} 个`, progress: 73 });
            }
            if (unmatchedKeywords.grammar.length > 0) {
                detailContent.push(`【语法】${unmatchedKeywords.grammar.join(', ')}`);
                onProgress({ currentStep: `📝 待生成语法: ${unmatchedKeywords.grammar.length} 个`, progress: 74 });
            }
            
            try {
                if (!automation) { 
                    onProgress({ currentStep: '🌐 启动浏览器...', progress: 75 });
                    automation = await initBrowser(); 
                    browserRestartCount++;
                    onProgress({ currentStep: '✅ AI账号已就绪', progress: 76 });
                }
                
                onProgress({ currentStep: '📤 发送详情生成请求...', progress: 77 });
                const detailResult = await processSegmentWithRetry(automation, `${CONFIG.detailPrompt}\n${detailContent.join('\n')}\n---`, 0, 1, onProgress);
                
                if (detailResult.success && detailResult.output) {
                    const aiData = detailResult.output;
                    if (aiData.vocabulary?.words) { 
                        mergedData.vocabulary.words.push(...aiData.vocabulary.words.map(w => ({ ...w, _source: 'ai' }))); 
                        const msg = `✅ AI生成单词: ${aiData.vocabulary.words.length} 个`;
                        console.log(`[阶段7] ${msg}`);
                        onProgress({ currentStep: msg, progress: 80 });
                    }
                    if (aiData.vocabulary?.phrases) { 
                        mergedData.vocabulary.phrases.push(...aiData.vocabulary.phrases.map(p => ({ ...p, _source: 'ai' }))); 
                        const msg = `✅ AI生成短语: ${aiData.vocabulary.phrases.length} 个`;
                        console.log(`[阶段7] ${msg}`);
                        onProgress({ currentStep: msg, progress: 82 });
                    }
                    if (aiData.vocabulary?.patterns) { 
                        mergedData.vocabulary.patterns.push(...aiData.vocabulary.patterns.map(p => ({ ...p, _source: 'ai' }))); 
                        const msg = `✅ AI生成句型: ${aiData.vocabulary.patterns.length} 个`;
                        console.log(`[阶段7] ${msg}`);
                        onProgress({ currentStep: msg, progress: 84 });
                    }
                    if (aiData.grammar?.length) { 
                        mergedData.grammar.push(...aiData.grammar.map(g => ({ ...g, _source: 'ai' }))); 
                        const msg = `✅ AI生成语法: ${aiData.grammar.length} 个`;
                        console.log(`[阶段7] ${msg}`);
                        onProgress({ currentStep: msg, progress: 86 });
                    }
                    console.log(`[阶段7] ✅ AI生成完成`);
                    onProgress({ currentStep: '✅ AI详情生成完成', progress: 88 });
                    
                    // ========== v4.3.4: 更新数据库中的未匹配记录 ==========
                    if (processingLogService) {
                        try {
                            // 更新单词
                            if (aiData.vocabulary?.words) {
                                for (const word of aiData.vocabulary.words) {
                                    processingLogService.updateUnmatchedAiContent(
                                        taskId, 
                                        word.word, 
                                        'word', 
                                        word
                                    );
                                }
                            }
                            // 更新短语
                            if (aiData.vocabulary?.phrases) {
                                for (const phrase of aiData.vocabulary.phrases) {
                                    processingLogService.updateUnmatchedAiContent(
                                        taskId, 
                                        phrase.phrase, 
                                        'phrase', 
                                        phrase
                                    );
                                }
                            }
                            // 更新句型
                            if (aiData.vocabulary?.patterns) {
                                for (const pattern of aiData.vocabulary.patterns) {
                                    processingLogService.updateUnmatchedAiContent(
                                        taskId, 
                                        pattern.pattern, 
                                        'pattern', 
                                        pattern
                                    );
                                }
                            }
                            // 更新语法
                            if (aiData.grammar) {
                                for (const grammar of aiData.grammar) {
                                    processingLogService.updateUnmatchedAiContent(
                                        taskId, 
                                        grammar.title, 
                                        'grammar', 
                                        grammar
                                    );
                                }
                            }
                            console.log(`[阶段7] 💾 AI生成内容已更新到数据库`);
                            onProgress({ currentStep: '💾 AI生成内容已保存到数据库', progress: 88 });
                        } catch (updateErr) {
                            console.warn('[阶段7] 更新AI内容失败:', updateErr.message);
                        }
                    }
                }
            } catch (e) { 
                console.error('[阶段7] ❌', e.message);
                onProgress({ currentStep: `❌ AI生成失败: ${e.message}`, progress: 88 });
            }
        } else { 
            console.log('\n📌 阶段7: 跳过（全部从数据库获取）');
            onProgress({ currentStep: '⏭️ 阶段7: 跳过（全部从数据库获取）', progress: 88 });
        }

        // ========== 阶段8: 过滤基础词汇 ==========
        onProgress({ currentStep: '📌 阶段8: 过滤基础词汇', progress: 89 });
        const beforeFilter = mergedData.vocabulary.words?.length || 0;
        mergedData = wordFilter.filter(mergedData);
        const afterFilter = mergedData.vocabulary.words?.length || 0;
        const filterInfo = `🔧 过滤结果: ${beforeFilter} → ${afterFilter} (移除 ${beforeFilter - afterFilter} 个基础词)`;
        onProgress({ currentStep: filterInfo, progress: 90 });
        
        onProgress({ currentStep: '🔧 最终标准化处理...', progress: 91 });
        mergedData = keywordNormalizer.finalNormalize(mergedData);

        // ========== 阶段9: 生成报告 ==========
        console.log('\n' + '─'.repeat(60)); 
        console.log('📌 阶段9: 生成报告'); 
        console.log('─'.repeat(60));
        onProgress({ currentStep: '📌 阶段9: 生成报告', progress: 92 });
        
        const timestamp = Date.now(); 
        const finalTitle = getFinalTitle(task);
        const outputSubDir = `task_${taskId.slice(0, 8)}_${timestamp}`; 
        const outputPath = path.join(CONFIG.outputDir, outputSubDir);
        
        if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true });
        onProgress({ currentStep: `📁 创建输出目录: ${outputSubDir}`, progress: 93 });
        
        const reportGenerator = new EnglishReportGenerator({ outputDir: outputPath });
        mergedData.metadata = { taskId, originalFile: file.originalName, processedAt: new Date().toISOString(), totalSegments, successCount: successResults.length, failCount: totalSegments - successResults.length, browserRestarts: browserRestartCount };
        
        onProgress({ currentStep: '📝 生成 HTML 报告...', progress: 94 });
        onProgress({ currentStep: '📝 生成 Markdown 报告...', progress: 95 });
        onProgress({ currentStep: '📝 生成 JSON 数据...', progress: 96 });
        reportGenerator.saveAll(mergedData, 'report', finalTitle);

        // ========== 完成 ==========
        console.log('\n' + '═'.repeat(60)); 
        console.log('📊 报告生成完成！'); 
        console.log('═'.repeat(60));
        console.log(`   📁 路径: ${outputPath}`); 
        console.log(`   📝 标题: ${finalTitle}`);
        console.log('   ────────────────────────────');
        console.log(`   📚 单词: ${mergedData.summary.total_words}`); 
        console.log(`   📖 短语: ${mergedData.summary.total_phrases}`);
        console.log(`   📋 句型: ${mergedData.summary.total_patterns}`); 
        console.log(`   📑 语法: ${mergedData.summary.total_grammar}`);
        console.log('   ────────────────────────────');
        const totalItems = mergedData.summary.total_words + mergedData.summary.total_phrases + mergedData.summary.total_patterns + mergedData.summary.total_grammar;
        console.log(`   📊 总计: ${totalItems} 项`);
        console.log('═'.repeat(60) + '\n');

        onProgress({ currentStep: '═══════════════════════════════', progress: 97 });
        onProgress({ currentStep: `📊 报告生成完成！`, progress: 98 });
        onProgress({ currentStep: `📚 单词: ${mergedData.summary.total_words} | 📖 短语: ${mergedData.summary.total_phrases}`, progress: 98 });
        onProgress({ currentStep: `📋 句型: ${mergedData.summary.total_patterns} | 📑 语法: ${mergedData.summary.total_grammar}`, progress: 99 });
        onProgress({ currentStep: `🎉 总计: ${totalItems} 项`, progress: 99 });
        onProgress({ currentStep: '═══════════════════════════════', progress: 99 });

        clearProgress(taskId); 
        onProgress({ currentStep: '✅ 处理完成！', progress: 100 });
        
        return { 
            outputDir: outputSubDir, 
            title: finalTitle, 
            files: { html: `${outputSubDir}/report.html`, markdown: `${outputSubDir}/report.md`, json: `${outputSubDir}/report.json` }, 
            stats: { totalSegments, successCount: successResults.length, failCount: totalSegments - successResults.length, totalCharacters: content.length, browserRestarts: browserRestartCount, vocabulary: mergedData.summary } 
        };
    } catch (error) {
        const completedCount = results.filter(r => r).length;
        if (completedCount > 0) saveProgress(taskId, { taskId, totalSegments, completedCount, successCount: results.filter(r => r?.success).length, results, lastUpdated: new Date().toISOString(), error: error.message });
        onProgress({ currentStep: `❌ 处理失败: ${error.message}`, progress: 0 });
        throw error;
    } finally { 
        await closeBrowser(automation); 
    }
}

// ============================================
// 初始化
// ============================================

function init() {
    if (!fs.existsSync(CONFIG.outputDir)) fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    if (!fs.existsSync(CONFIG.progressDir)) fs.mkdirSync(CONFIG.progressDir, { recursive: true });
    taskQueue.setProcessor(processTask);
    try { if (fs.existsSync(CONFIG.progressDir)) { const files = fs.readdirSync(CONFIG.progressDir).filter(f => f.endsWith('.json')); if (files.length > 0) console.log(`\n📋 发现 ${files.length} 个未完成任务`); } } catch (e) {}
    console.log('\n' + '='.repeat(60)); console.log('  🎓 英语课堂智能分析系统 v4.3.4 已就绪'); console.log('  🆕 v4.3.4: AI生成内容保存到数据库'); console.log('='.repeat(60) + '\n');
}

module.exports = { init, processTask, CONFIG, loadProgress, clearProgress, getFinalTitle, generateDefaultTitle, JsonExtractor, ResultMerger, WordFilter, KeywordNormalizer, keywordNormalizer };