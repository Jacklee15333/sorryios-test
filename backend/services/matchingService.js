/**
 * 匹配算法服务 v5.3.0 (性能优化版)
 * 文件位置: backend/services/matchingService.js
 * 
 * 📦 v5.3.0 更新（性能优化 - 批量匹配缓存）：
 * - 🔥 修复：batchMatch 中每匹配一个词就 SELECT * 全表查询 → 改为开头一次性缓存
 * - 🔥 修复：黑名单过滤在 .filter() 回调中重复 .map().includes() → 改为 Set O(1) 查找
 * - 📊 效果：数据库查询从 400+ 次降到 4 次，黑名单过滤从 O(n²) 降到 O(n)
 * - ✅ 兼容：独立调用 matchWord/matchPhrase 等方法时自动回退到直接查询，不受影响
 * 
 * 📦 v5.1.0 更新（2026-02-03 修复匹配分数BUG）：
 * - 🔥 修复：findBestMatch方法区分精确匹配(1.0)和模糊匹配(0.98)
 * - 🔥 修复：规范化后相同但原文不同 → 返回0.98而不是1.0
 * - 🔥 修复：词形变体匹配 → 使用calculateSimilarity计算实际分数(0.98)
 * - 🔥 修复：解决"所有匹配都是100%"的问题，现在有85%-99%的分数
 * - 📊 效果：matched_items表现在会有pending状态的记录（85%-99%）
 * - ✅ 结果：待审核列表正常显示模糊匹配项
 * 
 * 📦 v5.0.0 更新（2025-02-03 性能与稳定性优化）：
 * - 🔥 删除：移除10分钟缓存机制，改为实时查询（解决不稳定问题）
 * - 🔥 新增：_normalizeForMatching() 统一文本规范化方法
 * - 🔥 修复：标点符号处理（末尾点号、多点号、撇号等）
 * - 🔥 优化：短词匹配策略（≤4字符自动去除标点）
 * - 🔥 增强：多策略匹配（原始、去末尾点、去所有点）
 * - 🔥 日志：详细的匹配调试信息（输入、规范化、候选、结果）
 * - 📊 性能：数据库已有索引，5600条数据查询<60ms，无需缓存
 * - ✅ 结果：100%稳定，不受AI提取格式影响（mrs/mrs./Mrs均可匹配）
 * 
 * 📦 v4.5.4 更新（2025-02-01 跨表查找修复）：
 * - 修复：_matchPatternInternal 增加跨表查找功能
 * - 解决：当patterns表为空时，自动在phrases表中查找
 * - 解决：AI分类错误（pattern vs phrase）导致的匹配失败问题
 * - 优化：提高grammar库fallback的阈值到95%，避免误匹配
 * - 效果：即使AI将短语错误识别为句型，也能正确匹配
 * 
 * 📦 v4.5.3.4 更新（2025-01-31 结构词阈值调整）：
 * - 修复：_hasEnoughStructureWords 阈值从2降低到1
 * - 解决："tell sb sth" 被误判为"通用模板"的问题
 * - 原因：只有1个结构词（tell）不满足之前的 >= 2 要求
 * 
 * 📦 v4.5.3.3 更新（2025-01-30 模板检测修复版）：
 * - 修复：模板检测在归一化之前执行，导致无点号占位符无法识别
 * - 修复："tell sb sth" 被误判为"无占位符"，无法触发智能匹配
 * - 解决：在检测占位符前先归一化，统一为 "sb." "sth." 格式
 * 
 * 📦 v4.5.3.2 更新（2025-01-30 智能匹配版）：
 * - 新增：_smartPatternMatch 智能占位符匹配方法
 * - 修复：允许具体词（better）匹配占位符（adj.）
 * - 修复：允许具体动词（is）匹配占位符（be）
 * - 解决："it is better for sb. to do sth." 匹配 "It + be + adj. + for sb." 的问题
 * 
 * 📦 v4.5.3.1 更新：
 * - 修复：方法名错误 (calculatePatternSimilarity → calculateSimilarity)
 * - 修复：归一化逻辑，确保结果一致
 * - 修复：优化 usage 字段的句型提取逻辑
 * 
 * 📦 v4.5.3 更新（2025-01-30 修复版）：
 * - 修复：语法匹配增加 structure 和 usage 字段检查
 * - 修复：句型匹配失败时，自动在语法库中查找
 * - 优化：新增 normalizePattern 方法，统一各种占位符格式
 * - 解决：tell sb. to do sth. 等句型存在于语法库却匹配不到的问题
 * 
 * 📦 v4.5.1 更新：
 * - 改进：替换库双向模糊匹配（同时匹配 original_text 和 target_text）
 * - 优化：精确匹配优先 + 类型过滤 + 提前终止（98%）
 * - 调整：阈值降为 80%（替换库是已确认的规则，容错性更高）
 * 
 * 📦 v4.3.1 更新：
 * - 修复：核心词不匹配时返回高相似度的问题（how vs hope）
 * - 修复："X + Y" 结构模式不完整匹配的问题（without + 动名词）
 * 
 * 📦 v4.3.0 更新：
 * - 优化：中文相似度计算，增加关键词匹配和分词匹配
 * - 新增：详细的匹配日志输出，便于调试
 * - 修复：语法匹配相似度过低的问题
 * 
 * 📦 v4.2.2 更新：
 * - 删除：去掉语法关键词匹配功能（匹配太粗糙）
 * - 修复：语法阈值统一为 85%，<85% 全部 AI 生成
 * 
 * 📦 v4.2.1 更新：
 * - 修复：通用模板（含 sb./sth./doing sth. 等）跳过替换库模糊匹配
 * 
 * 📦 v4.2 更新：
 * - 修复：调整匹配顺序，词库精确匹配优先于替换库模糊匹配
 * - 顺序：替换库精确 → 词库精确 → 替换库模糊 → 词库模糊
 * 
 * 📦 v4.1 更新：
 * - 新增：替换库模糊匹配（≥85%），支持词形变化自动匹配
 * 
 * 📦 v4.0 更新：
 * - 新增：支持多词条替换（target_text 为 JSON 数组）
 */

const { getVocabularyService } = require('./vocabularyService');
const { getGrammarService } = require('./grammarService');
const { getMatchingDictService } = require('./matchingDictService');

class MatchingService {
    constructor() {
        this.vocabularyService = getVocabularyService();
        this.grammarService = getGrammarService();
        
        // v3.8: 替换库服务（已合并排除库）
        this.matchingDictService = getMatchingDictService();
        console.log('[MatchingService] v5.3.0: 批量匹配缓存优化 + 语法匹配核心术语检查');
        
        // v2.2: 提高匹配阈值，更严格
        this.thresholds = {
            word: 0.90,      // 单词：90%（从85%提高）
            phrase: 0.85,    // 短语：85%（从80%提高）
            pattern: 0.85,   // 句型：85%
            grammar: 0.85    // 语法：85%（统一阈值）
        };
        
        this.minMatchScore = 0.85;
        this.debug = false;
        
        // v4.3.0: 详细日志开关
        // 🔧 B7修复：默认关闭，可通过环境变量 MATCHING_VERBOSE=true 开启
        this.verboseLog = process.env.MATCHING_VERBOSE === 'true';
        

        
        // v2.2: 词库黑名单 - 这些词条会导致大量误匹配，跳过它们
        // 如果词库里有这些内容，匹配时会被忽略
        this.blacklist = {
            words: [
                'to do sth.', 'to do sth', 'to do', 'do sth.', 'do sth',
                'be to do', 'sth.', 'sb.', 'sth', 'sb'
            ],
            phrases: [
                'to do sth.', 'to do sth', 'be to do', 'to do'
            ],
            patterns: [],
            grammar: []
        };
        
        // v4.0: 语法关键词列表 - 用于关键词匹配
        this.grammarKeywords = [
            // 时态
            '现在进行时', '过去进行时', '将来进行时',
            '一般现在时', '一般过去时', '一般将来时',
            '现在完成时', '过去完成时', '将来完成时',
            '现在完成进行时', '过去完成进行时',
            // 语态
            '被动语态', '主动语态',
            // 非谓语动词
            '动名词', '不定式', '分词', '现在分词', '过去分词',
            '动词原形', '动词形态',
            // 从句
            '定语从句', '状语从句', '宾语从句', '主语从句', '同位语从句', '表语从句',
            // 句型
            '祈使句', '疑问句', '否定句', '感叹句', '倒装句', '强调句',
            '一般疑问句', '特殊疑问句', '反意疑问句',
            // 词法
            '情态动词', '助动词', '系动词', '及物动词', '不及物动词',
            '可数名词', '不可数名词', '复数', '单数',
            '比较级', '最高级', '原级',
            '冠词', '定冠词', '不定冠词',
            '介词', '介宾短语', '介词短语',
            '连词', '并列连词', '从属连词',
            '代词', '人称代词', '物主代词', '反身代词', '指示代词',
            '形容词', '副词',
            // 其他
            '第三人称单数', '主谓一致', '时态一致',
            '虚拟语气', '条件句', 'if从句',
            '宾补', '宾语补足语', '状语', '定语', '表语', '主语', '谓语',
            'there be', 'it作形式主语', 'it作形式宾语'
        ];
        
        // v4.3.0: 语法核心概念词（用于中文相似度匹配）
        this.grammarCoreTerms = [
            // 时态相关
            '现在进行时', '过去进行时', '将来进行时',
            '一般现在时', '一般过去时', '一般将来时',
            '现在完成时', '过去完成时', '将来完成时',
            // 语态
            '被动语态', '主动语态',
            // 句型
            '祈使句', '疑问句', '否定句', '感叹句', '倒装句', '强调句',
            '一般疑问句', '特殊疑问句', '反意疑问句', '选择疑问句',
            // 从句
            '定语从句', '状语从句', '宾语从句', '主语从句', '同位语从句', '表语从句',
            '名词性从句',
            // 非谓语
            '动名词', '不定式', '现在分词', '过去分词', '非谓语',
            // 词类
            '情态动词', '助动词', '系动词', '连词', '介词', '冠词',
            '形容词', '副词', '代词', '人称代词', '物主代词',
            '可数名词', '不可数名词',
            // 语法概念
            '第三人称单数', '主谓一致', '比较级', '最高级',
            '双宾语', '宾语补足语', '后置定语',
            '句子结构', '主语', '谓语', '宾语', '定语', '状语', '表语',
            // 动词相关
            // [Bug 27 修复] 移除重复的 '过去分词'（已在第180行非谓语区域定义）
            // 重复会导致 extractCoreTerms 返回重复项，虚增 commonTerms.length 影响多术语加分
            '动词形态', '动词过去式', '不规则动词',
            // 其他
            '词性', '构词法', '称呼', '称谓',
            // v4.3.0 新增：常见英文动词和短语（用于混合文本匹配）
            'spend', 'take', 'cost', 'pay', 'make', 'let', 'have', 'get',
            'see', 'hear', 'watch', 'feel', 'notice',
            'tell', 'ask', 'want', 'wish', 'hope', 'expect',
            'there be', 'it is', 'be going to', 'used to', 'had better',
            // 常见语法短语
            'to do', 'doing', 'done', 'be done'
        ];
        
        // v4.3.0: 近义词映射（用于处理同义词）
        this.synonymMap = {
            '称谓': '称呼',
            '称呼': '称谓'
        };
        
        // 模板占位符正则
        this.templatePattern = /\b(sb\.|sth\.|doing|to do|one's|oneself|\.\.\.)\b/i;
        
        // 不规则动词表
        this.irregularVerbs = {
            'was': 'be', 'were': 'be', 'been': 'be', 'am': 'be', 'is': 'be', 'are': 'be',
            'had': 'have', 'has': 'have',
            'did': 'do', 'does': 'do', 'done': 'do',
            'said': 'say',
            'went': 'go', 'gone': 'go',
            'got': 'get', 'gotten': 'get',
            'made': 'make',
            'knew': 'know', 'known': 'know',
            'thought': 'think',
            'took': 'take', 'taken': 'take',
            'saw': 'see', 'seen': 'see',
            'came': 'come',
            'gave': 'give', 'given': 'give',
            'found': 'find',
            'told': 'tell',
            'felt': 'feel',
            'became': 'become',
            'left': 'leave',
            'put': 'put',
            'meant': 'mean',
            'kept': 'keep',
            'let': 'let',
            'began': 'begin', 'begun': 'begin',
            'showed': 'show', 'shown': 'show',
            'heard': 'hear',
            'ran': 'run',
            'brought': 'bring',
            'wrote': 'write', 'written': 'write',
            'sat': 'sit',
            'stood': 'stand',
            'lost': 'lose',
            'paid': 'pay',
            'met': 'meet',
            'set': 'set',
            'learnt': 'learn', 'learned': 'learn',
            'led': 'lead',
            'understood': 'understand',
            'spoke': 'speak', 'spoken': 'speak',
            'read': 'read',
            'spent': 'spend',
            'grew': 'grow', 'grown': 'grow',
            'won': 'win',
            'taught': 'teach',
            'bought': 'buy',
            'sent': 'send',
            'built': 'build',
            'fell': 'fall', 'fallen': 'fall',
            'cut': 'cut',
            'sold': 'sell',
            'broke': 'break', 'broken': 'break',
            'hit': 'hit',
            'ate': 'eat', 'eaten': 'eat',
            'caught': 'catch',
            'drew': 'draw', 'drawn': 'draw',
            'chose': 'choose', 'chosen': 'choose',
            'wore': 'wear', 'worn': 'wear',
            'fought': 'fight',
            'threw': 'throw', 'thrown': 'throw',
            'flew': 'fly', 'flown': 'fly',
            'drove': 'drive', 'driven': 'drive',
            'swam': 'swim', 'swum': 'swim',
            'sang': 'sing', 'sung': 'sing',
            'rang': 'ring', 'rung': 'ring',
            'drank': 'drink', 'drunk': 'drink',
            'forgot': 'forget', 'forgotten': 'forget',
            'hid': 'hide', 'hidden': 'hide',
            'woke': 'wake', 'woken': 'wake',
            'rode': 'ride', 'ridden': 'ride',
            'rose': 'rise', 'risen': 'rise',
            'shone': 'shine',
            'stole': 'steal', 'stolen': 'steal',
            'blew': 'blow', 'blown': 'blow',
            'beat': 'beat', 'beaten': 'beat',
            'hung': 'hang',
            'bit': 'bite', 'bitten': 'bite',
            'shook': 'shake', 'shaken': 'shake',
            'spread': 'spread',
            'shut': 'shut',
            'cost': 'cost',
            'hurt': 'hurt',
        };
        
        // 形容词变形表
        this.adjectiveVariants = {
            'better': 'good', 'best': 'good',
            'worse': 'bad', 'worst': 'bad',
            'more': 'much', 'most': 'much',
            'less': 'little', 'least': 'little',
            'farther': 'far', 'farthest': 'far', 'further': 'far', 'furthest': 'far',
            'older': 'old', 'oldest': 'old', 'elder': 'old', 'eldest': 'old',
        };
        
        
        // ============================================
        // v5.0 新增：完整句型白名单
        // ============================================
        
        this.completeSentencePatterns = [
            'it is adj. to do sth.', 'it is adj. for sb. to do sth.', 'it is adj. of sb. to do sth.',
            'it is adj. that', 'it is n. to do sth.', 'it takes time to do sth.', 'it takes sb. time to do sth.',
            'it is time to do sth.', 'it is time for sb. to do sth.', 'find it adj. to do sth.',
            'think it adj. to do sth.', 'make it adj. to do sth.', 'feel it adj. to do sth.',
            'consider it adj. to do sth.', 'make sb. adj.', 'make sth. adj.', 'make sb. do sth.',
            'make sb. sth.', 'have sb. do sth.', 'let sb. do sth.', 'get sb. to do sth.',
            'help sb. do sth.', 'help sb. to do sth.', 'see sb. do sth.', 'see sb. doing sth.',
            'hear sb. do sth.', 'hear sb. doing sth.', 'watch sb. do sth.', 'watch sb. doing sth.',
            'notice sb. do sth.', 'notice sb. doing sth.', 'feel sb. do sth.', 'feel sb. doing sth.',
            'observe sb. do sth.', 'observe sb. doing sth.', 'spend time doing sth.', 'spend time on sth.',
            'spend money on sth.', 'spend money doing sth.', 'sth. cost sb. money', 'sth. take time',
            'pay money for sth.', 'pay sb. money', 'stop sb. from doing sth.', 'prevent sb. from doing sth.',
            'keep sb. from doing sth.', 'protect sb. from sth.', 'save sb. from sth.', 'ask sb. to do sth.',
            'tell sb. to do sth.', 'want sb. to do sth.', 'wish sb. to do sth.', 'would like sb. to do sth.',
            'expect sb. to do sth.', 'advise sb. to do sth.', 'allow sb. to do sth.', 'encourage sb. to do sth.',
            'invite sb. to do sth.', 'order sb. to do sth.', 'warn sb. to do sth.', 'remind sb. to do sth.',
            'teach sb. to do sth.', 'show sb. how to do sth.', 'be busy doing sth.', 'be busy with sth.',
            'be worth doing sth.', 'be worth sth.', 'too adj. to do sth.', 'too adv. to do sth.',
            'adj. enough to do sth.', 'adv. enough to do sth.', 'enough n. to do sth.',
            'prefer to do sth. rather than do sth.', 'prefer doing sth. to doing sth.',
            'would rather do sth. than do sth.', 'had better do sth.', 'used to do sth.',
            'be used to doing sth.', 'be used to do sth.', 'look forward to doing sth.',
            'pay attention to doing sth.', 'the way to do sth.', 'have trouble doing sth.',
            'have difficulty doing sth.', 'have a hard time doing sth.', 'there be sb. doing sth.',
            'with sb. doing sth.', 'without doing sth.'
        ];
        console.log(`[MatchingService] v5.0 已加载 ${this.completeSentencePatterns.length} 个完整句型白名单`);

        // v5.3.0: 批量匹配缓存（在 batchMatch 期间临时持有，方法结束自动清除）
        this._cache = null;
    }

    // ============================================
    // v5.3.0: 性能优化 - 批量匹配缓存
    // ============================================
    
    /**
     * v5.3.0: 初始化批量匹配缓存
     * 在 batchMatch() 开始时调用，一次性加载所有数据，避免重复全表查询
     */
    _initBatchCache() {
        const startTime = Date.now();
        console.log('[MatchingService] 🚀 v5.3.0 初始化批量匹配缓存...');
        
        this._cache = {
            words: this.vocabularyService.getAllWords(true),
            phrases: this.vocabularyService.getAllPhrases(true),
            patterns: this.vocabularyService.getAllPatterns(true),
            grammar: this.grammarService.getAll(true),
            // 预计算黑名单 Set（避免在 filter 回调中重复 .map().includes()）
            blacklistWords: new Set(this.blacklist.words.map(x => x.toLowerCase())),
            blacklistPhrases: new Set(this.blacklist.phrases.map(x => x.toLowerCase())),
        };
        
        const elapsed = Date.now() - startTime;
        console.log(`[MatchingService] ✅ 缓存加载完成 (${elapsed}ms): 单词${this._cache.words.length}, 短语${this._cache.phrases.length}, 句型${this._cache.patterns.length}, 语法${this._cache.grammar.length}`);
    }
    
    /**
     * v5.3.0: 清除批量匹配缓存
     */
    _clearBatchCache() {
        this._cache = null;
        console.log('[MatchingService] 🧹 批量匹配缓存已清除');
    }
    
    /**
     * v5.3.0: 获取单词数据（优先使用缓存，无缓存时回退到直接查询）
     * 已内置黑名单过滤，使用 Set 进行 O(1) 查找
     */
    _getCachedWords() {
        const all = this._cache ? this._cache.words : this.vocabularyService.getAllWords(true);
        const blacklistSet = this._cache ? this._cache.blacklistWords : new Set(this.blacklist.words.map(x => x.toLowerCase()));
        return all.filter(w => !blacklistSet.has((w.word || '').toLowerCase()));
    }
    
    /**
     * v5.3.0: 获取短语数据（优先使用缓存）
     */
    _getCachedPhrases() {
        const all = this._cache ? this._cache.phrases : this.vocabularyService.getAllPhrases(true);
        const blacklistSet = this._cache ? this._cache.blacklistPhrases : new Set(this.blacklist.phrases.map(x => x.toLowerCase()));
        return all.filter(p => !blacklistSet.has((p.phrase || '').toLowerCase()));
    }
    
    /**
     * v5.3.0: 获取句型数据（优先使用缓存）
     */
    _getCachedPatterns() {
        return this._cache ? this._cache.patterns : this.vocabularyService.getAllPatterns(true);
    }
    
    /**
     * v5.3.0: 获取语法数据（优先使用缓存）
     */
    _getCachedGrammar() {
        return this._cache ? this._cache.grammar : this.grammarService.getAll(true);
    }

    // ============================================
    // v4.5.2: 新增辅助方法
    // ============================================
    
    /**
     * v4.5.2: 归一化短语/句型文本
     * 去除括号中的可选内容、多余空格等
     */
    _normalizePhrase(text) {
        if (!text) return '';
        
        let normalized = text.toLowerCase().trim();
        
        // 去除括号及其内容：spend time (in) doing → spend time doing
        normalized = normalized.replace(/\([^)]*\)/g, '');
        
        // 去除多余空格
        normalized = normalized.replace(/\s+/g, ' ').trim();
        
        // 去除末尾的点号
        normalized = normalized.replace(/\./g, ''); 
        
        return normalized;
    }
    
    /**
     * v4.5.3: 统一的句型归一化方法
     * 用于统一各种占位符格式，提高匹配成功率
     */
    normalizePattern(text) {
        if (!text) return '';
        
        let normalized = text.toLowerCase().trim();
        
        // 1. 去除括号及其内容
        normalized = normalized.replace(/\([^)]*\)/g, ' ');
        
        // 2. 统一占位符格式（先去掉所有点，再统一加上）
        // sb/somebody/someone → sb.
        normalized = normalized.replace(/\b(sb|somebody|someone)\.?\b/gi, 'sb.');
        // sth/something → sth.
        normalized = normalized.replace(/\b(sth|something)\.?\b/gi, 'sth.');
        // adj/adjective → adj.
        normalized = normalized.replace(/\b(adj|adjective)\.?\b/gi, 'adj.');
        // adv/adverb → adv.
        normalized = normalized.replace(/\b(adv|adverb)\.?\b/gi, 'adv.');
        // v-ing/v.ing/doing → doing
        normalized = normalized.replace(/\b(v-ing|v\.ing|v\. ing)\b/gi, 'doing');
        // to v/to do → to do
        normalized = normalized.replace(/\bto\s+v\.?\b/gi, 'to do');
        // one's/ones → one's
        normalized = normalized.replace(/\b(ones|one's)\b/gi, "one's");
        
        // 3. 去除加号、斜杠等连接符
        normalized = normalized.replace(/\s*\+\s*/g, ' ');  // a + b → a b
        normalized = normalized.replace(/\s*\/\s*/g, ' ');  // a / b → a b（都变空格）
        normalized = normalized.replace(/\s*\|\s*/g, ' ');  // a | b → a b
        
        // 4. 去除多余的点号（.{2,}  → 空，但保留单个点）
        normalized = normalized.replace(/\.{2,}/g, '.');  // 多个点 → 单个点
        
        // 5. 去除其他多余的标点
        normalized = normalized.replace(/[,，;；]/g, ' ');  // 逗号、分号 → 空格
        
        // 6. 统一空格
        normalized = normalized.replace(/\s+/g, ' ').trim();
        
        return normalized;
    }
    
    /**
     * v4.5.3.2: 智能占位符匹配
     * 允许具体词（better）匹配占位符（adj.）
     * @param {string} userText - 用户输入的文本
     * @param {string} templateText - 模板文本（可能包含占位符）
     * @returns {boolean} 是否匹配
     */
    _smartPatternMatch(userText, templateText) {
        const userNormalized = this.normalizePattern(userText);
        const templateNormalized = this.normalizePattern(templateText);
        
        // 1. 完全相等，直接返回true
        if (userNormalized === templateNormalized) {
            return true;
        }
        
        // 2. 将模板转换为正则表达式
        // 注意：先替换占位符，再转义特殊字符
        let pattern = templateNormalized
            // 先替换占位符为特殊标记
            .replace(/\badj\./g, '__ADJ__')
            .replace(/\badv\./g, '__ADV__')
            .replace(/\bbe\b/g, '__BE__')
            .replace(/\bdoing\b/g, '__DOING__')
            .replace(/\bsb\./g, '__SB__')
            .replace(/\bsth\./g, '__STH__')
            .replace(/\bto\s+do\b/g, '__TODO__');
        
        // 然后转义所有正则特殊字符
        pattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
        
        // 最后将标记替换为正则模式
        pattern = pattern
            .replace(/__ADJ__/g, '\\w+\\.?')  // adj. 匹配任何形容词（带或不带点号）
            .replace(/__ADV__/g, '\\w+\\.?')  // adv. 匹配任何副词（带或不带点号）
            .replace(/__BE__/g, '(?:is|am|are|was|were|be)')  // be 匹配各种形式
            .replace(/__DOING__/g, '\\w+ing')  // doing 匹配 v-ing
            .replace(/__SB__/g, 'sb\\.?')  // sb. 匹配 sb 或 sb.
            .replace(/__STH__/g, 'sth\\.?')  // sth. 匹配 sth 或 sth.
            .replace(/__TODO__/g, 'to\\s+\\w+');  // to do 匹配 to + 动词
        
        // 3. 添加开始锚点，不添加结束锚点（允许额外内容）
        pattern = '^' + pattern;
        
        // 4. 测试匹配
        try {
            const regex = new RegExp(pattern, 'i');
            const result = regex.test(userNormalized);
            if (this.verboseLog && result) {
                this.verboseOutput(`  [智能匹配] 成功: "${userNormalized}" 匹配 /${pattern}/i`, 'debug');
            }
            return result;
        } catch (e) {
            if (this.verboseLog) {
                this.verboseOutput(`  [智能匹配] 正则错误: ${e.message}`, 'warn');
            }
            return false;
        }
    }
    
    /**
     * v4.5.2: 检查语法的keywords数组是否包含目标文本
     * @param {Array} keywords - 关键词数组
     * @param {string} targetText - 目标文本（已小写）
     * @returns {boolean} 是否匹配
     */
    // 🔧 语法keywords匹配修复 v2
    // 
    // v1修复：英文短keyword（a/of/in）不再子串匹配 → 解决 "enable" → 冠词 的问题
    // v2修复：中文短keyword（名词/动词/介词，2字）不再子串匹配 → 解决 "形容词与名词的词性辨析" → 名词 的问题
    //
    // 规则：
    //   精确匹配：任何keyword都允许
    //   中文keyword ≥ 4字：允许子串匹配（"现在完成时" 匹配 "现在完成时的用法" ✅）
    //   中文keyword 3字：允许子串匹配，但keyword必须出现在目标文本开头（"比较级" 匹配 "比较级的用法" ✅，但不匹配 "xxx比较级xxx"）
    //   中文keyword ≤ 2字：不允许子串匹配（"名词"太泛，会误匹配所有提到名词的话题）
    //   英文keyword ≥ 4字：完整单词匹配（词边界）
    //   英文keyword < 4字：不允许子串匹配
    _matchInKeywords(keywords, targetText) {
        if (!keywords || !Array.isArray(keywords)) return false;
        
        const normalized = targetText.toLowerCase().trim();
        
        for (const keyword of keywords) {
            if (!keyword) continue;
            
            const keywordLower = keyword.toLowerCase().trim();
            
            // 1. 精确匹配（始终允许）
            if (keywordLower === normalized) {
                return true;
            }
            
            // 2. 判断keyword是否包含中文字符
            const hasChinese = /[\u4e00-\u9fff]/.test(keywordLower);
            
            if (hasChinese) {
                // 统计中文字符数量（更准确地判断keyword的"实质长度"）
                const chineseCharCount = (keywordLower.match(/[\u4e00-\u9fff]/g) || []).length;
                
                if (chineseCharCount >= 4) {
                    // 长中文keyword（≥4中文字符，如"现在完成时"、"定语从句"、"被动语态"）
                    // 这些足够具体，允许在目标文本任意位置子串匹配
                    if (normalized.includes(keywordLower)) {
                        console.log(`[_matchInKeywords] 中文子串匹配: "${keywordLower}" 在 "${normalized}" 中`);
                        return true;
                    }
                } else if (chineseCharCount === 3) {
                    // 中等中文keyword（3中文字符，如"比较级"、"所有格"、"感叹句"）
                    // 有一定特异性，但需要出现在开头才安全
                    if (normalized.startsWith(keywordLower) || normalized.startsWith(keywordLower.replace(/\s+/g, ''))) {
                        console.log(`[_matchInKeywords] 中文前缀匹配: "${keywordLower}" 在 "${normalized}" 开头`);
                        return true;
                    }
                }
                // chineseCharCount ≤ 2（如"名词"、"动词"、"介词"、"连词"）：
                // 太泛，不做子串匹配。只保留精确匹配（第1步已处理）
                // 这些输入会流转到 _matchGrammarInternal 进行模糊匹配或由AI生成
            } else {
                // 英文keyword：必须作为完整单词出现（词边界匹配），且长度≥4
                if (keywordLower.length >= 4) {
                    try {
                        const wordBoundaryRegex = new RegExp(`\\b${keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                        if (wordBoundaryRegex.test(normalized)) {
                            console.log(`[_matchInKeywords] 英文完整单词匹配: "${keywordLower}" 在 "${normalized}" 中`);
                            return true;
                        }
                    } catch (e) {
                        // 正则构建失败，跳过
                    }
                }
            }
        }
        
        return false;
    }

    // ============================================
    // v4.3.0: 详细日志输出
    // ============================================
    
    /**
     * v4.3.0: 详细日志输出
     * @param {string} message - 日志消息
     * @param {string} level - 日志级别 (info/debug/warn/error)
     */
    verboseOutput(message, level = 'info') {
        if (!this.verboseLog) return;
        
        const timestamp = new Date().toLocaleTimeString('zh-CN');
        const prefix = {
            info: '📋',
            debug: '🔍',
            warn: '⚠️',
            error: '❌',
            success: '✅',
            match: '🎯'
        }[level] || '📋';
        
        console.log(`${prefix} [${timestamp}] ${message}`);
    }
    
    /**
     * v4.3.0: 输出匹配报告
     */
    printMatchReport(input, candidates, bestMatch, bestScore, threshold) {
        if (!this.verboseLog) return;
        
        console.log('\n' + '='.repeat(80));
        console.log(`🔍 语法匹配报告`);
        console.log('='.repeat(80));
        console.log(`📝 输入文本: "${input}"`);
        console.log(`📊 匹配阈值: ${(threshold * 100).toFixed(0)}%`);
        console.log('-'.repeat(80));
        
        if (candidates.length > 0) {
            console.log(`📋 候选匹配 (Top ${Math.min(5, candidates.length)}):`);
            candidates.slice(0, 5).forEach((c, i) => {
                const icon = c.score >= threshold ? '✅' : '❌';
                console.log(`   ${i + 1}. ${icon} "${c.text}" - ${(c.score * 100).toFixed(1)}% ${c.reason || ''}`);
            });
        }
        
        console.log('-'.repeat(80));
        if (bestMatch && bestScore >= threshold) {
            console.log(`✅ 匹配成功: "${bestMatch}" (${(bestScore * 100).toFixed(1)}%)`);
        } else if (bestMatch) {
            console.log(`❌ 匹配失败: 最佳候选 "${bestMatch}" 只有 ${(bestScore * 100).toFixed(1)}%，低于阈值 ${(threshold * 100).toFixed(0)}%`);
        } else {
            console.log(`❌ 匹配失败: 没有找到任何候选`);
        }
        console.log('='.repeat(80) + '\n');
    }

    /**
     * 刷新缓存（v2.2: 过滤黑名单）
     */


    /**
     * 调试日志输出
     */
    log(message) {
        if (this.debug) {
            console.log(`[MatchingService] ${message}`);
        }
    }


    /**
     * v5.0.0: 统一文本规范化方法
     * 用于匹配前的文本预处理，解决标点符号导致的匹配失败问题
     * 
     * @param {string} text - 原始文本
     * @param {object} options - 规范化选项
     * @param {boolean} options.removeTrailingDot - 是否去除末尾点号（默认true）
     * @param {boolean} options.removeAllDots - 是否去除所有点号（用于P.E.等缩写）
     * @param {boolean} options.toLowerCase - 是否转小写（默认true）
     * @returns {string} 规范化后的文本
     */
    _normalizeForMatching(text, options = {}) {
        if (!text) return '';
        
        const {
            removeTrailingDot = true,
            removeAllDots = false,
            toLowerCase = true
        } = options;
        
        let normalized = text.trim();
        
        // 转小写
        if (toLowerCase) {
            normalized = normalized.toLowerCase();
        }
        
        // 去除所有点号（适用于P.E., P.M.等多点号缩写）
        if (removeAllDots) {
            normalized = normalized.replace(/\./g, '');
        }
        // 只去除末尾点号（适用于Mr., Mrs., Dr.等称呼词）
        else if (removeTrailingDot) {
            normalized = normalized.replace(/\.+$/, '');
        }
        
        // 规范化空格
        normalized = normalized.replace(/\s+/g, ' ').trim();
        
        return normalized;
    }

    /**
     * v5.2.0 新增：提取关键词（严格模式 - 保留重要介词）
     * @param {string} text - 输入文本
     * @returns {Array<string>} 关键词数组
     */
    /**
     * v5.2.1 修复：提取关键词（只移除末尾占位符）
     * 
     * Bug修复：之前 "doing sth." 会被整体移除，导致 "keep doing sth." → [keep]
     * 现在只移除末尾的占位符：
     * - "keep doing sth." → "keep doing" → [keep, doing] ✅
     * - "want to do sth." → "want to do" → [want, to, do] ✅
     */
    _extractKeywords(text) {
        if (!text || typeof text !== 'string') {
            return [];
        }
        
        // 第1步：只移除末尾的占位符（保留中间有意义的词）
        let cleaned = text
            .replace(/\s*\bsb\.?\s*$/gi, '')           // 移除末尾的 sb.
            .replace(/\s*\bsth\.?\s*$/gi, '')          // 移除末尾的 sth.
            .replace(/\s*\bone's\s*$/gi, '')           // 移除末尾的 one's
            .replace(/\s*\boneself\s*$/gi, '');        // 移除末尾的 oneself
        
        // 第2步：提取所有单词
        const words = cleaned.toLowerCase().match(/\b[a-z]+\b/g) || [];
        
        // 第3步：只过滤真正无意义的虚词
        const stopWords = new Set([
            // 冠词（无实际意义）
            'a', 'an', 'the',
            // 系动词（纯连接作用）
            'is', 'are', 'was', 'were', 'be', 'been', 'being',
            // 少数连词和介词
            'and', 'or', 'but', 'of', 'as',
            // 防御性添加（万一没被移除）
            'sb', 'sth'
        ]);
        
        // 保留的重要介词（对短语结构很重要）：
        // in, on, at, to, for, with, by, from, about, into, onto, 
        // up, down, out, off, over, under, through, after, before
        
        return words.filter(w => !stopWords.has(w) && w.length > 1);
    }
    /**
     * v5.2.3 新增：提取中文语法核心术语
     * 用于过滤语义不相关的语法匹配（如"形容词和副词的区别"vs"非谓语"）
     */
    _extractChineseKeyTerms(text) {
        if (!text || typeof text !== 'string') {
            return new Set();
        }
        
        // 中文语法核心术语库
        const keyTerms = [
            // 动词相关
            '动词', '谓语', '非谓语', '不定式', '动名词', '分词', '现在分词', '过去分词',
            
            // 时态
            '时态', '过去式', '现在', '将来', '完成', '进行', '一般', '过去',
            
            // 形容词/副词
            '形容词', '副词', '比较级', '最高级',
            
            // 句型
            '句型', '句式', '陈述句', '疑问句', '感叹句', '祈使句', '倒装', '强调',
            
            // 名词/代词
            '名词', '代词', '单数', '复数', '主格', '宾格', '所有格',
            '可数', '不可数',
            
            // 其他
            '介词', '连词', '冠词', '数词', '助动词', '情态动词',
            '被动语态', '主动语态', '直接引语', '间接引语',
            '定语', '状语', '宾语', '主语', '表语', '补语',
            '从句', '主句', '宾语从句', '定语从句', '状语从句', '同位语从句', '主语从句',
            '虚拟语气', '条件句', '让步', '原因', '结果', '目的', '方式',
            
            // 词性变化
            '原级', '词性', '转换', '变化', '构词法', '派生', '合成',
            
            // 特殊用法
            '倒装句', '省略', '强调句', '并列', '复合', '简单句', '复杂句',
            
            // 比较和区别
            '区别', '差异', '比较', '对比', '辨析', '和', '与', '或'
        ];
        
        const foundTerms = new Set();
        
        // 提取文本中出现的核心术语
        for (const term of keyTerms) {
            if (text.includes(term)) {
                foundTerms.add(term);
            }
        }
        
        return foundTerms;
    }


    /**
     * v5.2.0 新增：关键词全包含匹配（严格模式）
     * @param {string} input - 输入文本
     * @param {string} type - 类型 (word/phrase/pattern/grammar)
     * @param {Array} candidates - 候选列表
     * @returns {Object|null} { match, score, matchedVia } 或 null
     */
    _findByKeywordMatch(input, type, candidates) {
        if (!input || !candidates || candidates.length === 0) {
            return null;
        }
        
        const inputKeywords = this._extractKeywords(input);
        
        // 如果没有关键词，跳过
        if (inputKeywords.length === 0) {
            if (this.verboseLog) {
                console.log(`    [关键词匹配] "${input}" 无有效关键词，跳过`);
            }
            return null;
        }
        
        // 🔧 Fix: 单个短关键词不足以支撑可靠的关键词匹配
        // 修复前: "if条件句" 提取出 ["if"] → 100%匹配 "as if" ❌
        //         "see...as...结构的用法" 提取出 ["see"] → 100%匹配语法项 "see" ❌
        // 修复后: 只有1个关键词且长度≤4字符时，信号太弱，跳过关键词匹配
        //         让它们流转到模糊匹配获得更合理的分数
        if (inputKeywords.length === 1 && inputKeywords[0].length <= 4) {
            if (this.verboseLog) {
                console.log(`    [关键词匹配] "${input}" 仅1个短关键词 "${inputKeywords[0]}"，信号不足，跳过`);
            }
            return null;
        }
        
        if (this.verboseLog) {
            console.log(`    [关键词匹配] 开始匹配 "${input}"`);
            console.log(`      原文关键词: [${inputKeywords.join(', ')}]`);
        }
        
        let bestMatch = null;
        let bestScore = 0;
        let bestTargetText = '';
        let bestTargetKeywords = [];
        
        for (const candidate of candidates) {
            const targetText = candidate.phrase || candidate.pattern || candidate.word || candidate.title;
            if (!targetText) continue;
            
            const targetKeywords = this._extractKeywords(targetText);
            
            // 检查1：首词必须相同（防止词序错误）
            if (inputKeywords[0] !== targetKeywords[0]) {
                continue;
            }
            
            // 检查2：原文关键词必须全部在目标中
            const allIncluded = inputKeywords.every(word => 
                targetKeywords.includes(word)
            );
            
            if (!allIncluded) {
                continue;
            }
            
            // 计算匹配度（原文关键词数 / 目标关键词数）
            const coverage = inputKeywords.length / targetKeywords.length;
            
            // [Bug 24 修复] 移除 Math.max(0.85, coverage) 的人为下限
            // 原来: coverage=0.4 也返回0.85，导致 "go to" 匹配 "go to school on foot" 得85%
            // 修复: 完全相同=100%，子集=按实际覆盖率计算，不设人为下限
            // 最终是否匹配由调用方的 threshold 判断
            const score = coverage === 1.0 ? 1.0 : coverage;
            
            if (score > bestScore) {
                bestScore = score;
                bestMatch = candidate;
                bestTargetText = targetText;
                bestTargetKeywords = targetKeywords;
            }
            
            // 如果找到100%匹配，直接返回
            if (score === 1.0) {
                break;
            }
        }
        
        if (bestMatch) {
            console.log(`      ✓ 关键词匹配成功: "${bestTargetText}"`);
            console.log(`        目标关键词: [${bestTargetKeywords.join(', ')}]`);
            console.log(`        首词检查: ${inputKeywords[0]} = ${bestTargetKeywords[0]} ✓`);
            console.log(`        全包含检查: ✓`);
            console.log(`        匹配得分: ${(bestScore * 100).toFixed(0)}%`);
            
            return {
                match: bestMatch,
                score: bestScore,
                matchedVia: 'keyword'
            };
        }
        
        if (this.verboseLog) {
            console.log(`      ✗ 关键词未找到匹配`);
        }
        return null;
    }

    /**
     * v5.0.0: 生成多种规范化变体
     * 用于增强匹配成功率
     */
    _getTextVariants(text) {
        const variants = new Set();
        
        // 原始文本（只trim和小写）
        variants.add(text.toLowerCase().trim());
        
        // 去除末尾点号
        variants.add(this._normalizeForMatching(text, { removeTrailingDot: true }));
        
        // 去除所有点号（用于P.E.等缩写）
        if (text.includes('.')) {
            variants.add(this._normalizeForMatching(text, { removeAllDots: true }));
        }
        
        return Array.from(variants).filter(v => v.length > 0);
    }

    /**
     * 词形还原
     */
    lemmatize(word) {
        const w = word.toLowerCase().trim();
        const results = [w];
        
        // 检查不规则变形
        if (this.irregularVerbs[w]) {
            results.push(this.irregularVerbs[w]);
        }
        if (this.adjectiveVariants[w]) {
            results.push(this.adjectiveVariants[w]);
        }
        
        // -ing 结尾
        if (w.endsWith('ing') && w.length > 4) {
            results.push(w.slice(0, -3));
            results.push(w.slice(0, -3) + 'e');
            if (w.length > 5 && w[w.length - 4] === w[w.length - 5]) {
                results.push(w.slice(0, -4));
            }
        }
        
        // -ed 结尾
        if (w.endsWith('ed') && w.length > 3) {
            results.push(w.slice(0, -2));
            results.push(w.slice(0, -1));
            results.push(w.slice(0, -2) + 'y');
            if (w.length > 4 && w[w.length - 3] === w[w.length - 4]) {
                results.push(w.slice(0, -3));
            }
        }
        
        // -ies/-ied 结尾
        if (w.endsWith('ies') && w.length > 4) {
            results.push(w.slice(0, -3) + 'y');
        }
        if (w.endsWith('ied') && w.length > 4) {
            results.push(w.slice(0, -3) + 'y');
        }
        
        // -es/-s 结尾
        if (w.endsWith('es') && w.length > 3) {
            results.push(w.slice(0, -2));
            results.push(w.slice(0, -1));
        } else if (w.endsWith('s') && w.length > 2 && !w.endsWith('ss')) {
            results.push(w.slice(0, -1));
        }
        
        // -er/-est 结尾
        if (w.endsWith('er') && w.length > 3) {
            results.push(w.slice(0, -2));
            results.push(w.slice(0, -1));
        }
        if (w.endsWith('est') && w.length > 4) {
            results.push(w.slice(0, -3));
            results.push(w.slice(0, -2));
        }
        
        return [...new Set(results)];
    }

    /**
     * 检查是否是模板文本
     */
    isTemplateText(text) {
        return this.templatePattern.test(text);
    }

    /**
     * 清理模板文本（v3.7 改进）
     * v3.7: 把动名词（reading/writing等）也转换为 doing，以便匹配模板
     */
    cleanTemplateText(text) {
        let cleaned = text.toLowerCase()
            .replace(/\bsb\.\s*/gi, '')
            .replace(/\bsth\.\s*/gi, '')
            .replace(/\bsb\s+/gi, '')
            .replace(/\bsth\s+/gi, '')
            .replace(/\bto do\b/gi, '')
            .replace(/\bone's\b/gi, '')
            .replace(/\boneself\b/gi, '')
            .replace(/\.\.\./g, '')
            .replace(/\s+/g, ' ')
            .trim();
        
        // v3.7: 把所有动名词（-ing结尾）统一转换为 "doing"
        const nonVerbIng = ['thing', 'something', 'nothing', 'anything', 'everything', 
                           'morning', 'evening', 'spring', 'string', 'ring', 'king', 
                           'sing', 'bring', 'wing', 'ceiling', 'feeling', 'meeting',
                           'building', 'meaning', 'beginning', 'ending'];
        
        cleaned = cleaned.replace(/\b(\w{4,})ing\b/gi, (match, stem) => {
            const word = match.toLowerCase();
            if (nonVerbIng.includes(word)) {
                return match;
            }
            if (word === 'doing') {
                return 'doing';
            }
            return 'doing';
        });
        
        cleaned = cleaned.replace(/\bdoing\b/gi, 'do');
        cleaned = cleaned.replace(/[.,;:!?]+$/, '').trim();
        
        return cleaned;
    }

    /**
     * 计算编辑距离
     */
    levenshteinDistance(s1, s2) {
        const m = s1.length, n = s2.length;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
        
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (s1[i - 1] === s2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = Math.min(
                        dp[i - 1][j] + 1,
                        dp[i][j - 1] + 1,
                        dp[i - 1][j - 1] + 1
                    );
                }
            }
        }
        return dp[m][n];
    }

    /**
     * 检查单词边界匹配
     */
    isWordBoundaryMatch(text, pattern) {
        const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(^|\\s|[^a-zA-Z])${escapedPattern}($|\\s|[^a-zA-Z])`, 'i');
        return regex.test(text);
    }

    /**
     * v2.2 新增：核心词匹配检查
     * v3.2 修复：添加前缀检查，防止 plant vs plan 这类误匹配
     */
    coreWordMatches(input, target) {
        const inputWords = input.toLowerCase().split(/\s+/).filter(w => w.length > 0);
        const targetWords = target.toLowerCase().split(/\s+/).filter(w => w.length > 0);
        
        if (inputWords.length === 0 || targetWords.length === 0) return true;
        
        const templateWords = ['sb.', 'sth.', 'sb', 'sth', 'to', 'do', 'doing', "one's", 'oneself'];
        
        let inputCore = null;
        for (const w of inputWords) {
            if (!templateWords.includes(w.replace(/[.,]/g, ''))) {
                inputCore = w.replace(/[.,]/g, '');
                break;
            }
        }
        
        let targetCore = null;
        for (const w of targetWords) {
            if (!templateWords.includes(w.replace(/[.,]/g, ''))) {
                targetCore = w.replace(/[.,]/g, '');
                break;
            }
        }
        
        if (!inputCore || !targetCore) return true;
        
        if (inputCore === targetCore) return true;
        
        if (inputCore.startsWith(targetCore) || targetCore.startsWith(inputCore)) {
            this.log(`[v3.2] 核心词前缀冲突，拒绝匹配: "${inputCore}" vs "${targetCore}"`);
            return false;
        }
        
        const distance = this.levenshteinDistance(inputCore, targetCore);
        const maxLen = Math.max(inputCore.length, targetCore.length);
        
        if (maxLen <= 4) {
            return distance === 0;
        }
        
        return distance <= 1;
    }

    /**
     * v3.3 新增：模板参数兼容性检查
     */
    templateParamsCompatible(input, target) {
        const inputLower = input.toLowerCase();
        const targetLower = target.toLowerCase();
        
        const inputHasSb = /\bsb\.?\b/.test(inputLower);
        const targetHasSb = /\bsb\.?\b/.test(targetLower);
        const inputHasOneself = /\boneself\b/.test(inputLower);
        const targetHasOneself = /\boneself\b/.test(targetLower);
        
        if ((inputHasSb && targetHasOneself) || (inputHasOneself && targetHasSb)) {
            this.log(`[v3.3] 模板参数不兼容: sb. vs oneself - "${input}" vs "${target}"`);
            return false;
        }
        
        return true;
    }

    /**
     * v2.2 新增：检测是否是中文文本
     */
    isChinese(text) {
        return /[\u4e00-\u9fa5]/.test(text);
    }

    // ============================================
    // v4.3.0: 重写中文相似度计算
    // ============================================

    /**
     * v4.3.0: 提取中文文本中的核心术语
     * @param {string} text - 输入文本
     * @returns {Array} 找到的核心术语列表
     */
    extractCoreTerms(text) {
        if (!text) return [];
        
        const found = [];
        const lowerText = text.toLowerCase();
        
        for (const term of this.grammarCoreTerms) {
            // 中文术语用原始文本匹配，英文术语用小写匹配
            if (this.isChinese(term)) {
                if (text.includes(term)) {
                    found.push(term);
                }
            } else {
                // 英文术语：用单词边界匹配
                const regex = new RegExp(`\\b${term}\\b`, 'i');
                if (regex.test(lowerText)) {
                    found.push(term.toLowerCase());
                }
            }
        }
        
        // v4.3.0: 处理近义词
        for (const term of found) {
            if (this.synonymMap && this.synonymMap[term]) {
                const synonym = this.synonymMap[term];
                if (!found.includes(synonym)) {
                    found.push(synonym);
                }
            }
        }
        
        // 按长度降序排列（优先匹配长的术语）
        found.sort((a, b) => b.length - a.length);
        
        return found;
    }
    
    /**
     * v4.3.0: 中文分词（简单实现）
     * 基于核心术语 + 字符切分
     * @param {string} text - 输入文本
     * @returns {Array} 分词结果
     */
    segmentChinese(text) {
        if (!text) return [];
        
        let remaining = text;
        const segments = [];
        
        // 先提取核心术语
        const coreTerms = this.extractCoreTerms(text);
        for (const term of coreTerms) {
            if (remaining.includes(term)) {
                segments.push(term);
                // 标记已处理（但不从 remaining 中删除，因为可能有重叠）
            }
        }
        
        // 提取英文单词
        const englishWords = text.match(/[a-zA-Z]+/g) || [];
        segments.push(...englishWords.map(w => w.toLowerCase()));
        
        // 提取剩余的中文字符（2-4字组合）
        const chineseOnly = text.replace(/[a-zA-Z0-9\s\.\(\)（）\/\-\+\:：、，。！？""'']+/g, '');
        
        // 添加2字、3字、4字组合
        for (let len = 4; len >= 2; len--) {
            for (let i = 0; i <= chineseOnly.length - len; i++) {
                const segment = chineseOnly.substring(i, i + len);
                if (!segments.includes(segment)) {
                    segments.push(segment);
                }
            }
        }
        
        return [...new Set(segments)];
    }
    
    /**
     * v4.3.0: 计算词汇重叠度
     * @param {Array} segments1 - 第一个文本的分词
     * @param {Array} segments2 - 第二个文本的分词
     * @returns {number} 重叠度 (0-1)
     */
    calculateOverlap(segments1, segments2) {
        if (segments1.length === 0 || segments2.length === 0) return 0;
        
        let matchCount = 0;
        let totalWeight = 0;
        
        for (const seg of segments1) {
            // 核心术语权重更高
            const weight = this.grammarCoreTerms.includes(seg) ? 3 : 1;
            totalWeight += weight;
            
            if (segments2.includes(seg)) {
                matchCount += weight;
            }
        }
        
        return totalWeight > 0 ? matchCount / totalWeight : 0;
    }

    /**
     * v4.3.0: 重写中文相似度计算
     * 结合多种策略：核心术语匹配、分词重叠、编辑距离
     * @param {string} input - 输入文本
     * @param {string} target - 目标文本
     * @returns {Object} { score, reason }
     */
    calculateChineseSimilarity(input, target) {

        // v5.2.3 新增：核心术语预检查（防止语义不相关的语法错误匹配）
        const inputTerms = this._extractChineseKeyTerms(input);
        const targetTerms = this._extractChineseKeyTerms(target);
        
        // 如果两者都有核心术语，检查是否有交集
        if (inputTerms.size > 0 && targetTerms.size > 0) {
            const intersection = new Set([...inputTerms].filter(x => targetTerms.has(x)));
            
            // 没有任何共同术语，说明语义完全不相关
            if (intersection.size === 0) {
                this.verboseOutput(`  ✗ 语法核心术语不匹配：${[...inputTerms].join('/')} vs ${[...targetTerms].join('/')}`, 'debug');
                return { score: 0, reason: '语法核心术语不匹配' };
            }
            
            this.verboseOutput(`  ✓ 语法核心术语匹配：共同术语 [${[...intersection].join(', ')}]`, 'debug');
        }
        
        const s1 = input.trim();
        const s2 = target.trim();
        
        if (!s1 || !s2) return { score: 0, reason: '空文本' };
        if (s1 === s2) return { score: 1.0, reason: '完全相同' };
        
        // 标准化：去除空格和标点差异
        const normalize = (str) => str.replace(/[\s\(\)（）\/\-\+\:：、，。！？""''\.]+/g, '').toLowerCase();
        const n1 = normalize(s1);
        const n2 = normalize(s2);
        
        if (n1 === n2) {
            return { score: 0.98, reason: '标准化后相同' };
        }
        
        // ===== v4.3.1 新增：检查 "X + Y" 结构模式 =====
        // 例如 "without + 动名词" 不应匹配 "动名词 (v.-ing作名词)"
        const structurePatternRegex = /\S\s*\+\s*\S/;
        const inputIsStructure = structurePatternRegex.test(s1);
        const targetIsStructure = structurePatternRegex.test(s2);
        
        if (inputIsStructure && !targetIsStructure) {
            this.verboseOutput(`  ⚠️ 输入是结构模式 (X + Y)，目标不是`, 'debug');
            const parts = s1.split(/\s*\+\s*/);
            if (parts.length >= 2) {
                const leftPart = parts[0].trim();
                const rightPart = parts[1].trim();
                
                // 检查目标是否同时包含左右两部分
                const targetContainsLeft = s2.includes(leftPart) || 
                    this.extractCoreTerms(leftPart).some(t => s2.includes(t));
                const targetContainsRight = s2.includes(rightPart) || 
                    this.extractCoreTerms(rightPart).some(t => s2.includes(t));
                
                this.verboseOutput(`    左部分 "${leftPart}": ${targetContainsLeft ? '包含' : '不包含'}`, 'debug');
                this.verboseOutput(`    右部分 "${rightPart}": ${targetContainsRight ? '包含' : '不包含'}`, 'debug');
                
                // 如果目标只包含其中一部分，不应该高分匹配
                if (!targetContainsLeft || !targetContainsRight) {
                    const distance = this.levenshteinDistance(n1, n2);
                    const maxLen = Math.max(n1.length, n2.length);
                    const editScore = 1 - distance / maxLen;
                    return { 
                        score: Math.min(editScore, 0.60),  // 最高60%
                        reason: '结构模式不完整匹配' 
                    };
                }
            }
        }
        // ===== v4.3.1 新增结束 =====
        
        // ===== v4.3.2 新增：检测转换模式（如"X变Y"、"X转Y"）=====
        // 例如 "形容词变副词" 不应该匹配只包含"形容词"的语法点
        const transformKeywords = ['变', '转', '转换', '变化', '转变', '变为', '转为', '→', '变成'];
        const inputHasTransform = transformKeywords.some(kw => s1.includes(kw));
        const targetHasTransform = transformKeywords.some(kw => s2.includes(kw));
        
        if (inputHasTransform && !targetHasTransform) {
            this.verboseOutput(`  ⚠️ 输入是转换模式，目标不是转换模式`, 'debug');
            
            // 即使有共同术语（如"形容词"），也不应该高分
            // 最高给60%，确保不会超过85%阈值
            const distance = this.levenshteinDistance(n1, n2);
            const maxLen = Math.max(n1.length, n2.length);
            const editScore = 1 - distance / maxLen;
            
            return { 
                score: Math.min(editScore, 0.60),
                reason: '转换模式不匹配' 
            };
        }
        
        // [Bug 3 修复] 添加反向检查：目标是转换模式但输入不是
        // 例如: 输入="形容词用法" 目标="形容词变副词" → 不应该高分匹配
        if (!inputHasTransform && targetHasTransform) {
            this.verboseOutput(`  ⚠️ 目标是转换模式，输入不是转换模式`, 'debug');
            
            const distance = this.levenshteinDistance(n1, n2);
            const maxLen = Math.max(n1.length, n2.length);
            const editScore = 1 - distance / maxLen;
            
            return { 
                score: Math.min(editScore, 0.60),
                reason: '转换模式不匹配（反向）' 
            };
        }
        // ===== v4.3.2 新增结束 =====
        
        // 策略1: 核心术语匹配
        const terms1 = this.extractCoreTerms(s1);
        const terms2 = this.extractCoreTerms(s2);
        
        this.verboseOutput(`  输入核心术语: [${terms1.join(', ')}]`, 'debug');
        this.verboseOutput(`  目标核心术语: [${terms2.join(', ')}]`, 'debug');
        
        // 检查是否有完全匹配的核心术语
        const commonTerms = terms1.filter(t => terms2.includes(t));
        
        if (commonTerms.length > 0) {
            // 找到最长的共同术语
            const longestCommon = commonTerms.reduce((a, b) => a.length >= b.length ? a : b, '');
            
            // [Bug 1 修复] 核心术语匹配 — 原逻辑短术语加分过于激进
            // 原来: 短术语(2-3字) +0.06 + 多术语叠加 +0.03×n → 轻易超过85%阈值
            // 修复: 引入覆盖率权重，术语越短占比越低，加分越少
            const termRatio = longestCommon.length / Math.max(s1.length, s2.length);
            
            // 覆盖率权重：术语占总文本比例越高，匹配越可信
            const coverageWeight = Math.min(termRatio * 2, 1.0);  // 0~1.0
            
            let baseScore = 0.78 + termRatio * 0.18;
            
            // 长术语加分保持不变
            if (longestCommon.length >= 4) {
                baseScore += 0.03;
            }
            if (longestCommon.length >= 6) {
                baseScore += 0.02;
            }
            
            // [Bug 1 修复] 短术语（2-3字）加分乘以覆盖率权重
            // 原来无条件 +0.06，"形容词"(3字) 在长文本中也能达到 87%+
            // 修复后: "形容词"(3字) 在10字文本中 coverageWeight=0.6, 实际加 0.036
            if (longestCommon.length >= 2 && longestCommon.length <= 3) {
                baseScore += 0.06 * coverageWeight;
            }
            
            // [Bug 1 修复] 多术语加分也乘以覆盖率
            if (commonTerms.length > 1) {
                baseScore += 0.02 * (commonTerms.length - 1) * coverageWeight;
            }
            
            baseScore = Math.min(baseScore, 0.96);
            
            // [Bug 28 修复] 输入术语覆盖率惩罚
            // 问题: "形容词作表语" vs "过去分词作形容词" 只匹配1个术语"形容词"就拿到89%
            //        输入有2个关键术语 [形容词, 表语]，"表语"完全没匹配，应该大幅降分
            // 修复: 用 _extractChineseKeyTerms 的结果检查输入术语覆盖率
            if (inputTerms.size >= 2 && targetTerms.size > 0) {
                // 排除连接词（和/与/或），它们不是语义内容术语
                // 例: "形容词和副词" 的 "和" 不应算作未覆盖的内容术语
                const coverageExcludeTerms = new Set(['和', '与', '或']);
                const significantInputTerms = [...inputTerms].filter(t => !coverageExcludeTerms.has(t));
                
                if (significantInputTerms.length >= 2) {
                    // 检查目标是否是输入的核心子串（≥50%长度占比）
                    // 如果是，说明输入只是在目标基础上加了修饰语，不应惩罚
                    // 例: "非谓语动词" 包含 "非谓语"(75%)  → 跳过
                    //     "过去完成时态" 包含 "过去完成时"(83%) → 跳过
                    //     "形容词和副词的区别" 不包含 "过去分词作形容词" → 惩罚
                    const targetContainedInInput = n1.includes(n2) && n2.length >= n1.length * 0.5;
                    
                    if (!targetContainedInInput) {
                        const coveredCount = significantInputTerms.filter(t => targetTerms.has(t)).length;
                        const inputCoverage = coveredCount / significantInputTerms.length;  // 0~1.0
                        if (inputCoverage < 1.0) {
                            const oldScore = baseScore;
                            // 惩罚公式: 覆盖50% → 乘0.75, 覆盖25% → 乘0.625, 覆盖0% → 乘0.5
                            baseScore *= (0.5 + 0.5 * inputCoverage);
                            this.verboseOutput(`  [Bug 28] 输入术语覆盖率惩罚: 输入术语[${significantInputTerms.join(',')}] 目标术语[${[...targetTerms].join(',')}] 覆盖${coveredCount}/${significantInputTerms.length}=${(inputCoverage*100).toFixed(0)}% | ${(oldScore*100).toFixed(1)}% → ${(baseScore*100).toFixed(1)}%`, 'debug');
                        }
                    } else {
                        this.verboseOutput(`  [Bug 28] 跳过覆盖率惩罚: 目标"${s2}"是输入"${s1}"的核心子串(${(n2.length/n1.length*100).toFixed(0)}%)`, 'debug');
                    }
                }
            }
            
            this.verboseOutput(`  核心术语匹配: "${longestCommon}" → 基础分 ${(baseScore * 100).toFixed(1)}%`, 'debug');
            
            return { 
                score: baseScore, 
                reason: `核心术语匹配: "${longestCommon}"` 
            };
        }
        
        // 策略2: 分词重叠
        const segments1 = this.segmentChinese(s1);
        const segments2 = this.segmentChinese(s2);
        
        const overlap1 = this.calculateOverlap(segments1, segments2);
        const overlap2 = this.calculateOverlap(segments2, segments1);
        const avgOverlap = (overlap1 + overlap2) / 2;
        
        this.verboseOutput(`  分词重叠度: ${(avgOverlap * 100).toFixed(1)}%`, 'debug');
        
        // 策略3: 包含关系
        if (n2.includes(n1)) {
            const ratio = n1.length / n2.length;
            const score = Math.max(ratio * 0.95, avgOverlap);
            return { score, reason: `目标包含输入 (${(ratio * 100).toFixed(0)}%)` };
        }
        if (n1.includes(n2)) {
            const ratio = n2.length / n1.length;
            const score = Math.max(ratio * 0.95, avgOverlap);
            return { score, reason: `输入包含目标 (${(ratio * 100).toFixed(0)}%)` };
        }
        
        // 策略4: 编辑距离（作为补充）
        const distance = this.levenshteinDistance(n1, n2);
        const maxLen = Math.max(n1.length, n2.length);
        const editSimilarity = 1 - distance / maxLen;
        
        this.verboseOutput(`  编辑距离相似度: ${(editSimilarity * 100).toFixed(1)}%`, 'debug');
        
        // 综合得分：取分词重叠和编辑距离中的较高者
        const finalScore = Math.max(avgOverlap, editSimilarity);
        
        return { 
            score: finalScore, 
            reason: avgOverlap > editSimilarity ? '分词重叠' : '编辑距离'
        };
    }

    /**
     * 计算相似度分数 (0-1)
     * v4.3.0: 语法匹配使用新的中文相似度计算
     */
    calculateSimilarity(input, target, options = {}) {
        // v5.0.0: 使用统一的规范化方法
        const s1 = this._normalizeForMatching(input, { 
            removeTrailingDot: options.isWordMatch,
            removeAllDots: false 
        });
        const s2 = this._normalizeForMatching(target, { 
            removeTrailingDot: options.isWordMatch,
            removeAllDots: false 
        });
        
        if (this.verboseLog && options.isWordMatch) {
            console.log(`[规范化] 输入: "${input}" → "${s1}", 目标: "${target}" → "${s2}"`);
        }
        
        if (!s1 || !s2) return 0;

        if (s1 === s2) {
            return 1.0;
        }

        // v4.3.0: 语法匹配使用新的中文相似度计算
        if (options.isGrammarMatch && this.isChinese(input)) {
            const result = this.calculateChineseSimilarity(input, target);
            return result.score;
        }

        if (options.isWordMatch) {
            const lemmas = this.lemmatize(s1);
            for (const lemma of lemmas) {
                if (lemma === s2) {
                    this.log(`词形还原匹配: ${s1} → ${lemma} = ${s2}`);
                    return 0.98;
                }
            }
        }

        if (options.isWordMatch && this.isTemplateText(target)) {
            const distance = this.levenshteinDistance(s1, s2);
            const maxLen = Math.max(s1.length, s2.length);
            return 1 - distance / maxLen;
        }

        if (options.isWordMatch && s1.length <= 3) {
            const distance = this.levenshteinDistance(s1, s2);
            if (distance === 0) return 1.0;
            if (distance === 1 && s2.length <= 4) return 0.80;
            return 0.5;
        }

        if (options.isPhraseMatch || options.isPatternMatch) {
            if (!this.coreWordMatches(s1, s2)) {
                this.log(`核心词不匹配: "${s1}" vs "${s2}"`);
                // v4.3.1: 核心词不匹配时，强制返回低分，确保不会误匹配
                const distance = this.levenshteinDistance(s1, s2);
                const maxLen = Math.max(s1.length, s2.length);
                const rawScore = 1 - distance / maxLen;
                // 核心词不匹配，最高只给 0.70，绝对不超过阈值
                return Math.min(rawScore, 0.70);
            }
            
            if (!this.templateParamsCompatible(s1, s2)) {
                this.log(`模板参数不兼容: "${s1}" vs "${s2}"`);
                const distance = this.levenshteinDistance(s1, s2);
                const maxLen = Math.max(s1.length, s2.length);
                const rawScore = 1 - distance / maxLen;
                // v4.3.1: 模板参数不兼容，最高只给 0.70
                return Math.min(rawScore, 0.70);
            }
        }

        if (s2.includes(s1) && s1.length >= 3) {
            if (this.isWordBoundaryMatch(s2, s1)) {
                const ratio = s1.length / s2.length;
                if (ratio >= 0.5) {
                    this.log(`边界包含匹配: "${s1}" in "${s2}"`);
                    return Math.max(0.85, ratio * 0.95 + 0.05);
                }
            }
        }
        
        if (s1.includes(s2) && s2.length >= 3) {
            if (this.isWordBoundaryMatch(s1, s2)) {
                const ratio = s2.length / s1.length;
                if (ratio >= 0.5) {
                    this.log(`边界包含匹配: "${s2}" in "${s1}"`);
                    return Math.max(0.85, ratio * 0.95 + 0.05);
                }
            }
        }

        if (options.isPhraseMatch || options.isPatternMatch) {
            const cleanS1 = this.cleanTemplateText(s1);
            const cleanS2 = this.cleanTemplateText(s2);
            
            if (cleanS1 && cleanS2 && cleanS1.length >= 3 && cleanS2.length >= 3) {
                if (cleanS1 === cleanS2) {
                    return 0.95;
                }
                
                const isPrefixRelation = cleanS1.startsWith(cleanS2) || cleanS2.startsWith(cleanS1);
                
                if (!isPrefixRelation) {
                    if (cleanS2.includes(cleanS1) && cleanS1.length / cleanS2.length >= 0.7) {
                        return 0.90;
                    }
                    if (cleanS1.includes(cleanS2) && cleanS2.length / cleanS1.length >= 0.7) {
                        return 0.90;
                    }
                }
            }
        }

        const distance = this.levenshteinDistance(s1, s2);
        const maxLen = Math.max(s1.length, s2.length);
        const similarity = 1 - distance / maxLen;

        return similarity;
    }

    /**
     * 在指定数据集中查找最佳匹配
     * v4.1: 先检查精确匹配，完全相同返回 1.0
     */
    /**
     * 在指定数据集中查找最佳匹配
     * v4.1: 先检查精确匹配，完全相同返回 1.0
     * v5.1: 🔧 修复 - 区分精确匹配(1.0)、规范化匹配(0.98)和词形匹配(0.98)
     */
    findBestMatch(input, dataSet, textField, options = {}) {
        let bestMatch = null;
        let bestScore = 0;

        // v5.0.0: 使用多策略规范化
        const normalizedInput = this._normalizeForMatching(input, { 
            removeTrailingDot: options.isWordMatch 
        });
        
        // 生成输入的多种变体
        const inputVariants = options.isWordMatch ? 
            [...this.lemmatize(input), ...this._getTextVariants(input)] : 
            this._getTextVariants(input);
        
        if (this.verboseLog && options.isWordMatch && inputVariants.length > 0) {
            console.log(`[findBestMatch] 输入: "${input}", 变体: [${inputVariants.slice(0, 5).join(', ')}]`);
        }
        
        for (const item of dataSet) {
            const target = item[textField];
            if (!target) continue;
            
            // v5.0.0: 对目标也使用规范化
            const normalizedTarget = this._normalizeForMatching(target, { 
                removeTrailingDot: options.isWordMatch 
            });
            
            // ========================================
            // 🔧 修复1: 区分真正的精确匹配和规范化匹配
            // ========================================
            
            // 1. 先检查原始文本是否完全相同（忽略大小写和首尾空格）
            const inputLower = input.toLowerCase().trim();
            const targetLower = target.toLowerCase().trim();
            
            if (inputLower === targetLower) {
                console.log(`[findBestMatch] ✅ 精确匹配: "${input}" === "${target}" → 100%`);
                return { match: item, score: 1.0 };
            }
            
            // 2. 检查规范化后是否相同（但原文不同）
            if (normalizedInput === normalizedTarget) {
                console.log(`[findBestMatch] ⚡ 规范化匹配: "${input}" → "${target}" → 98%`);
                console.log(`  规范化: "${input}" → "${normalizedInput}"`);
                console.log(`  规范化: "${target}" → "${normalizedTarget}"`);
                return { match: item, score: 0.98 };
            }

            // ========================================
            // 🔥 v5.2.2 新增：核心词预检查（防止语义不同的短语被错误匹配）
            // ========================================
            
            // 对短语和句型进行核心词检查
            if (options.isPhraseMatch || options.isPatternMatch) {
                const inputKeywords = this._extractKeywords(input);
                const targetKeywords = this._extractKeywords(target);
                
                // 如果首词相同但核心词不完全包含，跳过这个候选
                if (inputKeywords.length > 0 && targetKeywords.length > 0) {
                    // 只有首词相同时才进行核心词检查（避免误判）
                    if (inputKeywords[0] === targetKeywords[0]) {
                        // 检查输入的所有核心词是否都在目标中
                        const allIncluded = inputKeywords.every(w => targetKeywords.includes(w));
                        
                        if (!allIncluded) {
                            // 核心词不匹配，跳过这个候选
                            // 输出调试信息
                            if (this.verboseLog) {
                                console.log(`  ⚠️ 核心词过滤: "${input}" ≠ "${target}"`);
                                console.log(`    输入关键词: [${inputKeywords.join(', ')}]`);
                                console.log(`    目标关键词: [${targetKeywords.join(', ')}]`);
                                console.log(`    首词匹配但核心词不完全包含 → 跳过`);
                            }
                            continue;  // 跳过这个候选项
                        }
                    }
                }
            }
            // ========================================
            // v5.2.2 核心词检查结束
            // ========================================

            // ========================================
            // 🔧 修复2: 词形变体匹配使用calculateSimilarity
            // ========================================
            
            for (const variant of inputVariants) {
                // 检查变体是否与规范化目标相同
                if (variant === normalizedTarget) {
                    // 🔧 修复点：不直接返回1.0，而是使用calculateSimilarity计算实际分数
                    const actualScore = this.calculateSimilarity(input, target, options);
                    console.log(`[findBestMatch] 🔄 词形匹配: "${input}" → "${variant}" === "${target}" → ${(actualScore * 100).toFixed(1)}%`);
                    console.log(`  变体: "${input}" → "${variant}"`);
                    console.log(`  目标: "${target}" → "${normalizedTarget}"`);
                    return { match: item, score: actualScore };
                }
                
                // 计算相似度
                const score = this.calculateSimilarity(variant, target, options);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = item;
                    
                    if (variant !== normalizedInput && score >= 0.98) {
                        this.log(`词形匹配成功: ${input} → ${variant} → ${target}`);
                    }
                }
            }
        }
        
        // 输出最终结果
        if (bestMatch && bestScore >= 0.85) {
            const targetText = bestMatch[textField];
            console.log(`[findBestMatch] 📊 模糊匹配: "${input}" ≈ "${targetText}" → ${(bestScore * 100).toFixed(1)}%`);
        } else if (bestMatch) {
            const targetText = bestMatch[textField];
            console.log(`[findBestMatch] ❌ 低分匹配: "${input}" ≈ "${targetText}" → ${(bestScore * 100).toFixed(1)}% (低于阈值)`);
        } else {
            console.log(`[findBestMatch] ❌ 未找到匹配: "${input}"`);
        }

        return { match: bestMatch, score: bestScore };
    }

    /**
     * v4.1: 查询替换库（使用 matchingDictService）
     */
    checkReplaceRule(text, type) {
        try {
            const rule = this.matchingDictService.findRule(text, type);
            
            if (rule) {
                return this._processReplaceRule(rule, text, type, false);
            }
            
            const fuzzyResult = this._findReplaceRuleFuzzy(text, type);
            
            if (fuzzyResult) {
                console.log(`[MatchingService] 替换库模糊匹配: "${text}" ≈ "${fuzzyResult.rule.original_text}" (${(fuzzyResult.score * 100).toFixed(1)}%)`);
                return this._processReplaceRule(fuzzyResult.rule, text, type, true, fuzzyResult.score);
            }
            
            return null;
        } catch (e) {
            console.error('[MatchingService] 查询替换库失败:', e.message);
            return null;
        }
    }
    
    /**
     * v4.5.1: 替换库模糊匹配（双向匹配：original + target）
     */
    _findReplaceRuleFuzzy(text, type) {
        try {
            // 调用 matchingDictService 的双向模糊匹配
            const result = this.matchingDictService.findRuleFuzzy(
                text, 
                type,
                // 传入相似度计算函数
                (text1, text2) => {
                    return this.calculateSimilarity(text1, text2, {
                        isWordMatch: type === 'word',
                        isPhraseMatch: type === 'phrase',
                        isPatternMatch: type === 'pattern',
                        isGrammarMatch: type === 'grammar'
                    });
                }
            );
            
            return result;  // { rule, score, matchedVia, confidence }
        } catch (e) {
            console.error('[MatchingService] 替换库模糊匹配失败:', e.message);
            return null;
        }
    }
    
    /**
     * v4.1: 处理替换规则
     */
    _processReplaceRule(rule, originalText, type, isFuzzy = false, fuzzyScore = 1.0) {
        if (!rule.target_text || rule.target_text.trim() === '') {
            this.log(`[替换库命中-排除] "${originalText}" → 跳过`);
            console.log(`[MatchingService] 替换库命中-排除: "${originalText}" (${type}) → 跳过不展示`);
            
            return {
                action: 'exclude',
                rule_id: rule.id,
                reason: rule.notes || '已标记为排除',
                isFuzzyMatch: isFuzzy
            };
        }
        
        const targetText = rule.target_text.trim();
        if (targetText.startsWith('[') && targetText.endsWith(']')) {
            try {
                const items = JSON.parse(targetText);
                if (Array.isArray(items) && items.length > 0) {
                    const matchType = isFuzzy ? '模糊' : '精确';
                    this.log(`[替换库${matchType}匹配-多词条] "${originalText}" → ${items.length} 个词条`);
                    console.log(`[MatchingService] 替换库${matchType}匹配-多词条: "${originalText}" → ${items.map(i => i.text).join(', ')}`);
                    
                    return {
                        action: 'replace_multi',
                        items: items,
                        rule_id: rule.id,
                        matched_original: rule.original_text,
                        isFuzzyMatch: isFuzzy,
                        fuzzyScore: isFuzzy ? fuzzyScore : 1.0
                    };
                }
            } catch (e) {
                console.warn(`[MatchingService] JSON 解析失败，当作普通文本: ${e.message}`);
            }
        }
        
        const matchType = isFuzzy ? '模糊' : '精确';
        this.log(`[替换库${matchType}匹配-替换] "${originalText}" → "${rule.target_text}"`);
        console.log(`[MatchingService] 替换库${matchType}匹配-替换: "${originalText}" → "${rule.target_text}"`);
        
        return {
            action: 'replace',
            replace_text: rule.target_text,
            rule_id: rule.id,
            matched_original: rule.original_text,
            isFuzzyMatch: isFuzzy,
            fuzzyScore: isFuzzy ? fuzzyScore : 1.0
        };
    }

    /**
     * 匹配单词
     */
    matchWord(word) {
        console.log(`\n[matchWord] ==================== 开始匹配单词 ====================`);
        console.log(`[matchWord] 原始输入: "${word}"`);
        
        const normalizedWord = this._normalizeForMatching(word);
        console.log(`[matchWord] 规范化后: "${normalizedWord}"`);
        const wordVariants = this.lemmatize(word);
        
        const exactRule = this.matchingDictService.findRule(word, 'word');
        if (exactRule) {
            if (!exactRule.target_text || exactRule.target_text.trim() === '') {
                return { excluded: true, reason: exactRule.notes || '已标记为排除' };
            }
            return this._processAndApplyReplaceRule(exactRule, word, 'word', false);
        }
        
        // v5.3.0: 使用缓存代替全表查询（内置黑名单过滤）
        // 🔧 Fix: 按变体长度降序排列，优先匹配更长的词形
        // 修复前: 外层遍历词库、内层遍历variants → "us"(在词库中排在"use"前面)先命中
        // 修复后: 外层遍历variants(长→短)、内层遍历词库 → "use"(3字符)优先于"us"(2字符)
        const sortedVariants = [...new Set(wordVariants)].sort((a, b) => b.length - a.length);
        
        for (const variant of sortedVariants) {
            for (const item of this._getCachedWords()) {
                if (!item.word) continue;
                const normalizedTarget = item.word.toLowerCase().trim();
                
                if (variant === normalizedTarget) {
                    console.log(`[matchWord] 词库精确匹配: "${word}" → "${variant}" === "${item.word}" → 100%`);
                    return {
                        matched: true,
                        score: 1.0,
                        source_db: 'vocabulary',
                        source_table: 'words',
                        source_id: item.id,
                        matched_text: item.word,
                        matched_data: item
                    };
                }
            }
        }
        
        const fuzzyRule = this._findReplaceRuleFuzzyOnly(word, 'word');
        if (fuzzyRule) {
            return this._processAndApplyReplaceRule(fuzzyRule.rule, word, 'word', true, fuzzyRule.score);
        }
        
        return this._matchWordInternal(word);
    }
    
    /**
     * 内部单词匹配
     */
    _matchWordInternal(word) {
        // v5.3.0: 使用缓存代替全表查询（内置黑名单过滤）
        const wordsData = this._getCachedWords();
        console.log(`[_matchWordInternal] 候选词数量: ${wordsData.length}`);
        
        // v5.2.0 新增：先尝试关键词匹配（仅对复合词有效）
        if (word.includes(' ') || word.includes('-')) {
            const keywordMatch = this._findByKeywordMatch(word, 'word', wordsData);
            if (keywordMatch && keywordMatch.score >= this.thresholds.word) {
                console.log(`[_matchWordInternal] ✅ 关键词匹配: "${keywordMatch.match.word}" (${(keywordMatch.score * 100).toFixed(1)}%)`);
                return {
                    matched: true,
                    score: keywordMatch.score,
                    source_db: 'vocabulary',
                    source_table: 'words',
                    source_id: keywordMatch.match.id,
                    matched_text: keywordMatch.match.word,
                    matched_data: keywordMatch.match,
                    matchedVia: 'keyword'
                };
            }
        }
        
        // 原有的模糊匹配逻辑
        const { match, score } = this.findBestMatch(
            word, 
            wordsData, 
            'word',
            { isWordMatch: true }
        );
        
        if (match) {
            console.log(`[_matchWordInternal] 最佳匹配: "${match.word}" (分数: ${(score * 100).toFixed(1)}%)`);
        } else {
            console.log(`[_matchWordInternal] 未找到匹配 (最高分: ${(score * 100).toFixed(1)}%)`);
        }
        
        const threshold = this.thresholds.word;
        
        if (score >= threshold && match) {
            return {
                matched: true,
                score,
                source_db: 'vocabulary',
                source_table: 'words',
                source_id: match.id,
                matched_text: match.word,
                matched_data: match
            };
        }
        return { matched: false, score };
    }

    /**
     * 匹配短语
     * v4.5.2: 增加短语归一化处理
     */
    matchPhrase(phrase) {
        
        const normalizedPhrase = phrase.toLowerCase().trim();
        // v4.5.2: 归一化处理（去除括号等）
        const simplifiedPhrase = this._normalizePhrase(phrase);
        
        // 替换库精确匹配
        const exactRule = this.matchingDictService.findRule(phrase, 'phrase');
        if (exactRule) {
            if (!exactRule.target_text || exactRule.target_text.trim() === '') {
                return { excluded: true, reason: exactRule.notes || '已标记为排除' };
            }
            return this._processAndApplyReplaceRule(exactRule, phrase, 'phrase', false);
        }
        
        // 词库精确匹配（增强版）
        // v5.3.0: 使用缓存代替全表查询（内置黑名单过滤）
        for (const item of this._getCachedPhrases()) {
            if (!item.phrase) continue;
            
            const itemNormalized = item.phrase.toLowerCase().trim();
            const itemSimplified = this._normalizePhrase(item.phrase);
            
            // 精确匹配（原始或归一化后）
            if (itemNormalized === normalizedPhrase || itemSimplified === simplifiedPhrase) {
                console.log(`[matchPhrase] 词库精确匹配: "${phrase}" === "${item.phrase}" → 100%`);
                return {
                    matched: true,
                    score: 1.0,
                    source_db: 'vocabulary',
                    source_table: 'phrases',
                    source_id: item.id,
                    matched_text: item.phrase,
                    matched_data: item
                };
            }
        }
        
        // 替换库模糊匹配
        const fuzzyRule = this._findReplaceRuleFuzzyOnly(phrase, 'phrase');
        if (fuzzyRule) {
            return this._processAndApplyReplaceRule(fuzzyRule.rule, phrase, 'phrase', true, fuzzyRule.score);
        }
        
        // 词库模糊匹配
        return this._matchPhraseInternal(phrase);
    }
    
    /**
     * v4.2.1: 只检查模糊匹配（跳过精确匹配）
     */

    /**
     * v5.0: 归一化句型文本
     */
    _normalizePatternText(text) {
        if (!text) return '';
        return text.toLowerCase().replace(/\s+/g, ' ').replace(/\+\s*/g, ' ').replace(/\s*\+/g, ' ')
            .replace(/\s*\/\s*/g, '/').replace(/\(\s*/g, '(').replace(/\s*\)/g, ')').replace(/\s+/g, ' ').trim();
    }

    /**
     * v5.0: 检查是否是完整句型
     */
    _isCompleteSentencePattern(text) {
        if (!text) return false;
        const normalized = this._normalizePatternText(text);
        for (const pattern of this.completeSentencePatterns) {
            if (normalized === this._normalizePatternText(pattern)) {
                console.log(`[白名单匹配] "${text}" 是完整句型`);
                return true;
            }
        }
        return false;
    }

    /**
     * v5.0: 检查是否包含足够的结构词
     */
    _hasEnoughStructureWords(text) {
        if (!text) return false;
        const lowerText = text.toLowerCase();
        const indicators = ['it is', 'it was', 'to do', 'doing', 'for sb', 'of sb', 'make', 'let', 
            'have', 'get', 'see', 'hear', 'watch', 'spend', 'take', 'stop', 'prevent', 'ask', 'tell'];
        let count = 0;
        for (const ind of indicators) if (lowerText.includes(ind)) count++;
        return count >= 1;  // v4.5.3.4: 降低阈值，1个结构词即可（原为2）
    }

    /**
     * v5.0: 检查是否是纯占位符
     */
    _isPurePlaceholder(text) {
        if (!text) return true;
        const normalized = this._normalizePatternText(text);
        const pure = ['sb', 'sb.', 'sth', 'sth.', 'adj', 'adj.', 'adv', 'adv.', 'do sth', 'do sth.',
            'doing sth', 'doing sth.', 'to do sth', 'to do sth.', 'to do', 'doing', "one's", 'oneself', '...'];
        for (const p of pure) if (normalized === p.toLowerCase()) return true;
        return false;
    }
    
    /**
     * v5.0: 查找替换规则（模糊匹配）- 优化版
     * [Bug 25 修复] 合并原来的两次遍历为单次遍历
     * 原来对同类型规则计算两次相似度（第一轮找≥90%，第二轮找≥85%），浪费性能
     */
    _findReplaceRuleFuzzyOnly(text, type) {
        console.log(`\n${'='.repeat(80)}\n[替换库模糊匹配] 输入: "${text}" (${type})`);
        
        this.matchingDictService.checkCache();
        const rules = this.matchingDictService.cache.rules || [];
        const normalizedType = type.toLowerCase().trim();
        const normalizedText = text.toLowerCase().trim();
        const calcOptions = {
            isWordMatch: type === 'word', isPhraseMatch: type === 'phrase',
            isPatternMatch: type === 'pattern', isGrammarMatch: type === 'grammar'
        };
        
        // [Bug 25 修复] 单次遍历，同时找最高分和次高分
        let bestScore = 0, bestRule = null;
        for (const rule of rules) {
            if (rule.original_type.toLowerCase().trim() !== normalizedType) continue;
            if (!rule.target_text || rule.target_text.trim() === '') continue;
            // 跳过精确匹配（findRule已处理）
            if (rule.original_text.toLowerCase().trim() === normalizedText) continue;
            
            const score = this.calculateSimilarity(text, rule.original_text, calcOptions);
            if (score > bestScore) {
                bestScore = score;
                bestRule = rule;
            }
            // 提前终止：≥0.95 已经足够好
            if (score >= 0.95) break;
        }
        
        // 高置信度 ≥90%：直接返回
        if (bestScore >= 0.90 && bestRule) {
            console.log(`[替换库模糊匹配] ✅ 高相似度规则 (${(bestScore*100).toFixed(1)}%)\n${'='.repeat(80)}`);
            this.matchingDictService.incrementUseCount(bestRule.id);
            return { rule: bestRule, score: bestScore };
        }
        
        // 模板检测：<90% 时检查是否是通用模板
        if (this._containsTemplatePlaceholder(text)) {
            console.log(`[替换库模糊匹配] ⚠️ 跳过: 通用模板\n${'='.repeat(80)}`);
            return null;
        }
        
        // 普通匹配 ≥85%：模板检测通过后返回
        if (bestScore >= 0.85 && bestRule) {
            this.matchingDictService.incrementUseCount(bestRule.id);
            console.log(`[替换库模糊匹配] ✅ 匹配成功 (${(bestScore*100).toFixed(1)}%)\n${'='.repeat(80)}`);
            return { rule: bestRule, score: bestScore };
        }
        
        console.log(`[替换库模糊匹配] ❌ 未找到\n${'='.repeat(80)}`);
        return null;
    }
    
    /**
     * v5.0: 检查文本是否包含模板占位符 - 智能版
     * v4.5.3.3: 修复无点号占位符检测问题
     */
    _containsTemplatePlaceholder(text) {
        if (!text) return false;
        console.log(`\n[模板检测] "${text}"`);
        
        if (this._isCompleteSentencePattern(text)) {
            console.log('[模板检测] ✅ 完整句型');
            return false;
        }
        if (this._isPurePlaceholder(text)) {
            console.log('[模板检测] ❌ 纯占位符');
            return true;
        }
        
        // v4.5.3.3: 先归一化，统一占位符格式（sb → sb., sth → sth.）
        const normalizedText = this.normalizePattern(text);
        const lowerText = normalizedText.toLowerCase();
        
        // 检测标准化后的占位符（都带点号）
        const placeholders = ['doing sth.', 'do sth.', 'done sth.', 'to do sth.', 'sb.', 'sth.', 
            "one's", 'oneself', 'adj.', 'adv.', 'n.', 'v.', '...'];
        
        let hasPlaceholder = false;
        for (const p of placeholders) {
            if (lowerText.includes(p)) { 
                hasPlaceholder = true; 
                break; 
            }
        }
        
        if (!hasPlaceholder) {
            console.log('[模板检测] ✅ 无占位符');
            return false;
        }
        
        if (this._hasEnoughStructureWords(text)) {
            console.log('[模板检测] ✅ 结构完整');
            return false;
        }
        
        console.log('[模板检测] ❌ 通用模板');
        return true;
    }
    
    /**
     * v4.2: 处理并应用替换规则
     */
    _processAndApplyReplaceRule(rule, originalText, type, isFuzzy, fuzzyScore = 1.0) {
        const targetText = rule.target_text.trim();
        
        if (targetText.startsWith('[') && targetText.endsWith(']')) {
            try {
                const items = JSON.parse(targetText);
                if (Array.isArray(items) && items.length > 0) {
                    const matchType = isFuzzy ? '模糊' : '精确';
                    console.log(`[MatchingService] 替换库${matchType}匹配-多词条: "${originalText}" → ${items.map(i => i.text).join(', ')}`);
                    return {
                        replaced_multi: true,
                        original_text: originalText,
                        items: items,
                        rule_id: rule.id,
                        isFuzzyMatch: isFuzzy,
                        fuzzyScore: isFuzzy ? fuzzyScore : 1.0
                    };
                }
            } catch (e) {
                // JSON 解析失败，当作普通文本
            }
        }
        
        const matchType = isFuzzy ? '模糊' : '精确';
        console.log(`[MatchingService] 替换库${matchType}匹配-替换: "${originalText}" → "${rule.target_text}"`);
        
        let newResult;
        if (type === 'word') {
            newResult = this._matchWordInternal(rule.target_text);
        } else if (type === 'phrase') {
            newResult = this._matchPhraseInternal(rule.target_text);
        } else if (type === 'pattern') {
            newResult = this._matchPatternInternal(rule.target_text);
        } else if (type === 'grammar') {
            newResult = this._matchGrammarInternal(rule.target_text);
        }
        
        newResult.replaced = true;
        newResult.original_text = originalText;
        newResult.replace_text = rule.target_text;
        newResult.fromReplaceDict = true;
        
        if (isFuzzy) {
            newResult.score = fuzzyScore;
            newResult.replaceDictFuzzy = true;
            newResult.matched_original = rule.original_text;
        } else {
            newResult.score = 1.0;
        }
        
        return newResult;
    }
    
    /**
     * 内部短语匹配
     */
    _matchPhraseInternal(phrase) {
        // v5.3.0: 使用缓存代替全表查询（内置黑名单过滤）
        const allPhrases = this._getCachedPhrases();
        
        // v5.2.0 新增：先尝试关键词匹配
        const keywordMatch = this._findByKeywordMatch(phrase, 'phrase', allPhrases);
        if (keywordMatch && keywordMatch.score >= this.thresholds.phrase) {
            return {
                matched: true,
                score: keywordMatch.score,
                source_db: 'vocabulary',
                source_table: 'phrases',
                source_id: keywordMatch.match.id,
                matched_text: keywordMatch.match.phrase,
                matched_data: keywordMatch.match,
                matchedVia: 'keyword'
            };
        }
        
        // 原有的模糊匹配逻辑
        const { match, score } = this.findBestMatch(
            phrase, 
            allPhrases, 
            'phrase',
            { isPhraseMatch: true }
        );
        
        const threshold = this.thresholds.phrase;
        
        if (score >= threshold && match) {
            return {
                matched: true,
                score,
                source_db: 'vocabulary',
                source_table: 'phrases',
                source_id: match.id,
                matched_text: match.phrase,
                matched_data: match
            };
        }
        return { matched: false, score };
    }

    /**
     * 匹配句型
     * v4.5.2: 增加句型归一化处理
     */
    matchPattern(pattern) {
        
        const normalizedPattern = pattern.toLowerCase().trim();
        // v4.5.2: 归一化处理（去除括号等）
        const simplifiedPattern = this._normalizePhrase(pattern);
        
        // 替换库精确匹配
        const exactRule = this.matchingDictService.findRule(pattern, 'pattern');
        if (exactRule) {
            if (!exactRule.target_text || exactRule.target_text.trim() === '') {
                return { excluded: true, reason: exactRule.notes || '已标记为排除' };
            }
            return this._processAndApplyReplaceRule(exactRule, pattern, 'pattern', false);
        }
        
        // 词库精确匹配（增强版）
        // v5.3.0: 使用缓存代替全表查询
        for (const item of this._getCachedPatterns()) {
            if (!item.pattern) continue;
            
            const itemNormalized = item.pattern.toLowerCase().trim();
            const itemSimplified = this._normalizePhrase(item.pattern);
            
            // 精确匹配（原始或归一化后）
            if (itemNormalized === normalizedPattern || itemSimplified === simplifiedPattern) {
                console.log(`[matchPattern] 词库精确匹配: "${pattern}" === "${item.pattern}" → 100%`);
                return {
                    matched: true,
                    score: 1.0,
                    source_db: 'vocabulary',
                    source_table: 'patterns',
                    source_id: item.id,
                    matched_text: item.pattern,
                    matched_data: item
                };
            }
        }
        
        // 替换库模糊匹配
        const fuzzyRule = this._findReplaceRuleFuzzyOnly(pattern, 'pattern');
        if (fuzzyRule) {
            return this._processAndApplyReplaceRule(fuzzyRule.rule, pattern, 'pattern', true, fuzzyRule.score);
        }
        
        // 词库模糊匹配
        return this._matchPatternInternal(pattern);
    }
    
    /**
     * 内部句型匹配
     * v4.5.4: 增加跨表查找，patterns表找不到时也在phrases表查找
     * 解决AI分类错误导致的匹配失败问题
     */
    _matchPatternInternal(pattern) {
        // v5.3.0: 使用缓存代替全表查询
        const allPatterns = this._getCachedPatterns();
        
        // v5.2.0 新增：先尝试关键词匹配（patterns表）
        const keywordMatchPatterns = this._findByKeywordMatch(pattern, 'pattern', allPatterns);
        if (keywordMatchPatterns && keywordMatchPatterns.score >= this.thresholds.pattern) {
            console.log(`[_matchPatternInternal] ✅ patterns表关键词匹配: ${(keywordMatchPatterns.score*100).toFixed(1)}%`);
            return {
                matched: true,
                score: keywordMatchPatterns.score,
                source_db: 'vocabulary',
                source_table: 'patterns',
                source_id: keywordMatchPatterns.match.id,
                matched_text: keywordMatchPatterns.match.pattern,
                matched_data: keywordMatchPatterns.match,
                matchedVia: 'keyword'
            };
        }
        
        // 第1步：在 patterns 表中查找（原有模糊匹配）
        const { match: patternMatch, score: patternScore } = this.findBestMatch(
            pattern, 
            allPatterns, 
            'pattern',
            { isPatternMatch: true }
        );
        
        const threshold = this.thresholds.pattern;  // 85%
        
        // 如果在 patterns 表中找到且分数足够高，直接返回
        if (patternScore >= threshold && patternMatch) {
            console.log(`[_matchPatternInternal] patterns表匹配成功: ${(patternScore*100).toFixed(1)}%`);
            return {
                matched: true,
                score: patternScore,
                source_db: 'vocabulary',
                source_table: 'patterns',
                source_id: patternMatch.id,
                matched_text: patternMatch.pattern,
                matched_data: patternMatch
            };
        }
        
        // 第2步：如果 patterns 表找不到，尝试在 phrases 表中查找
        // 这样可以容错AI分类错误的情况
        console.log(`[_matchPatternInternal] patterns表未找到(${(patternScore*100).toFixed(1)}%)，尝试在phrases表查找...`);
        
        // v5.3.0: 使用缓存代替全表查询（内置黑名单过滤）
        const allPhrases = this._getCachedPhrases();
        
        // v5.2.0 新增：先尝试关键词匹配（phrases表）
        const keywordMatchPhrases = this._findByKeywordMatch(pattern, 'phrase', allPhrases);
        if (keywordMatchPhrases && keywordMatchPhrases.score >= threshold) {
            console.log(`[_matchPatternInternal] ✅ phrases表关键词匹配: ${(keywordMatchPhrases.score*100).toFixed(1)}%`);
            // 🔧 Fix: 跨表匹配时添加 .pattern 别名，防止调用方读取 .pattern 字段时得到 undefined
            const phraseData = keywordMatchPhrases.match;
            return {
                matched: true,
                score: keywordMatchPhrases.score,
                source_db: 'vocabulary',
                source_table: 'phrases',
                source_id: phraseData.id,
                matched_text: phraseData.phrase,
                matched_data: { ...phraseData, pattern: phraseData.phrase },
                matchedVia: 'keyword'
            };
        }
        
        // 原有的模糊匹配
        const { match: phraseMatch, score: phraseScore } = this.findBestMatch(
            pattern, 
            allPhrases, 
            'phrase',
            { isPhraseMatch: true }
        );
        
        // 如果在 phrases 表中找到且分数足够高，返回
        if (phraseScore >= threshold && phraseMatch) {
            console.log(`[_matchPatternInternal] ✅ phrases表匹配成功: ${(phraseScore*100).toFixed(1)}%`);
            // 🔧 Fix: 跨表匹配时添加 .pattern 别名
            return {
                matched: true,
                score: phraseScore,
                source_db: 'vocabulary',
                source_table: 'phrases',
                source_id: phraseMatch.id,
                matched_text: phraseMatch.phrase,
                matched_data: { ...phraseMatch, pattern: phraseMatch.phrase }
            };
        }
        
        // 第3步：两个表都找不到，尝试在 grammar 库中查找
        // v4.5.3: 因为有些句型可能存储在 grammar.structure 或 grammar.usage 中
        this.verboseOutput(`  → patterns和phrases表都未找到，尝试在grammar库查找...`, 'debug');
        const grammarMatch = this._matchGrammarInternal(pattern);
        
        if (grammarMatch && grammarMatch.matched && grammarMatch.score >= 0.85) {
            // v4.5.4: 提高grammar库的匹配阈值到95%，避免误匹配
            if (grammarMatch.score >= 0.95) {
                this.verboseOutput(`  → ✅ 在grammar库找到高置信度匹配: "${pattern}" → "${grammarMatch.matched_text}" (${(grammarMatch.score * 100).toFixed(1)}%)`, 'success');
                return grammarMatch;
            } else {
                this.verboseOutput(`  → ⚠️ grammar匹配分数偏低(${(grammarMatch.score*100).toFixed(1)}%)，不采用`, 'warn');
                console.log(`[_matchPatternInternal] grammar库匹配分数偏低: ${(grammarMatch.score*100).toFixed(1)}%，阈值要求95%`);
            }
        }
        
        // 第4步：完全找不到，返回最佳分数
        const bestScore = Math.max(patternScore, phraseScore, grammarMatch?.score || 0);
        console.log(`[_matchPatternInternal] 未找到匹配，最佳分数: ${(bestScore*100).toFixed(1)}%`);
        
        return { matched: false, score: bestScore };
    }

    /**
     * 匹配语法
     * v4.5.2: 增加keywords字段检查
     */
    matchGrammar(grammarText) {
        
        const normalizedGrammar = grammarText.toLowerCase().trim();
        
        this.verboseOutput(`\n${'─'.repeat(60)}`, 'info');
        this.verboseOutput(`开始匹配语法: "${grammarText}"`, 'info');
        this.verboseOutput(`${'─'.repeat(60)}`, 'info');
        
        // ===== 第1步：替换库精确匹配 =====
        this.verboseOutput(`[步骤1] 检查替换库精确匹配...`, 'debug');
        const exactRule = this.matchingDictService.findRule(grammarText, 'grammar');
        if (exactRule) {
            if (!exactRule.target_text || exactRule.target_text.trim() === '') {
                this.verboseOutput(`  → 命中排除规则: "${grammarText}"`, 'warn');
                return { excluded: true, reason: exactRule.notes || '已标记为排除' };
            }
            this.verboseOutput(`  → 命中替换规则: "${grammarText}" → "${exactRule.target_text}"`, 'success');
            return this._processAndApplyReplaceRule(exactRule, grammarText, 'grammar', false);
        }
        this.verboseOutput(`  → 未找到精确匹配`, 'debug');
        
        // ===== 第2步：语法库精确匹配（增强版）=====
        this.verboseOutput(`[步骤2] 检查语法库精确匹配（title + keywords）...`, 'debug');
        // v5.3.0: 使用缓存代替全表查询
        for (const item of this._getCachedGrammar()) {
            // 2.1 检查title字段
            if (item.title && item.title.toLowerCase().trim() === normalizedGrammar) {
                this.verboseOutput(`  → 语法库title精确匹配: "${grammarText}" === "${item.title}"`, 'success');
                return {
                    matched: true,
                    score: 1.0,
                    source_db: 'grammar',
                    source_table: 'grammar',
                    source_id: item.id,
                    matched_text: item.title,
                    matched_data: item
                };
            }
            
            // 2.2 检查keywords数组（新增）
            if (this._matchInKeywords(item.keywords, grammarText)) {
                this.verboseOutput(`  → 语法库keywords精确匹配: "${grammarText}" 在 "${item.title}" 的keywords中`, 'success');
                return {
                    matched: true,
                    score: 1.0,
                    source_db: 'grammar',
                    source_table: 'grammar',
                    source_id: item.id,
                    matched_text: item.title,
                    matched_data: item
                };
            }
        }
        this.verboseOutput(`  → 未找到精确匹配`, 'debug');
        
        // ===== 第3步：替换库模糊匹配 =====
        this.verboseOutput(`[步骤3] 检查替换库模糊匹配 (≥85%)...`, 'debug');
        const fuzzyRule = this._findReplaceRuleFuzzyOnly(grammarText, 'grammar');
        if (fuzzyRule) {
            this.verboseOutput(`  → 替换库模糊匹配: "${grammarText}" ≈ "${fuzzyRule.rule.original_text}" (${(fuzzyRule.score * 100).toFixed(1)}%)`, 'success');
            return this._processAndApplyReplaceRule(fuzzyRule.rule, grammarText, 'grammar', true, fuzzyRule.score);
        }
        this.verboseOutput(`  → 未找到模糊匹配`, 'debug');
        
        // ===== 第4步：语法库模糊匹配（增强版）=====
        this.verboseOutput(`[步骤4] 检查语法库模糊匹配 (≥85%, title + keywords)...`, 'debug');
        return this._matchGrammarInternal(grammarText);
    }
    
    /**
     * 内部语法匹配
     * v4.5.3: 增加 structure 和 usage 字段的匹配（修复句型匹配问题）
     */
    _matchGrammarInternal(grammarText) {
        let bestMatch = null;
        let bestScore = 0;
        let bestReason = '';
        let bestSource = '';
        const candidates = [];
        
        const normalizedInput = grammarText.toLowerCase().trim();
        // v5.3.0: 使用缓存代替全表查询
        const allGrammar = this._getCachedGrammar();
        
        this.verboseOutput(`  正在与 ${allGrammar.length} 条语法规则比较...`, 'debug');
        
        // v5.2.0 新增：先尝试关键词匹配（针对英文语法术语）
        // 语法匹配主要针对中文知识点，但也可能有英文术语如 "without + doing"
        const keywordMatch = this._findByKeywordMatch(grammarText, 'grammar', allGrammar);
        if (keywordMatch && keywordMatch.score >= this.thresholds.grammar) {
            console.log(`[_matchGrammarInternal] ✅ 关键词匹配: "${keywordMatch.match.title}" (${(keywordMatch.score * 100).toFixed(1)}%)`);
            return {
                matched: true,
                score: keywordMatch.score,
                source_db: 'grammar',
                source_table: 'grammar',
                source_id: keywordMatch.match.id,
                matched_text: keywordMatch.match.title,
                matched_data: keywordMatch.match,
                matchedVia: 'keyword'
            };
        }
        
        for (const item of allGrammar) {
            // ===== 检查title字段 =====
            if (item.title) {
                const normalizedTarget = item.title.toLowerCase().trim();
                
                // 先检查精确匹配
                if (normalizedInput === normalizedTarget) {
                    this.verboseOutput(`  → 发现title精确匹配: "${item.title}"`, 'success');
                    return {
                        matched: true,
                        score: 1.0,
                        source_db: 'grammar',
                        source_table: 'grammar',
                        source_id: item.id,
                        matched_text: item.title,
                        matched_data: item
                    };
                }
                
                // title的模糊匹配
                const titleResult = this.calculateChineseSimilarity(grammarText, item.title);
                const titleScore = titleResult.score;
                
                // 收集候选（用于报告）
                if (titleScore >= 0.5) {
                    candidates.push({
                        text: item.title,
                        score: titleScore,
                        reason: titleResult.reason,
                        source: 'title',
                        id: item.id
                    });
                }
                
                if (titleScore > bestScore) {
                    bestScore = titleScore;
                    bestMatch = item;
                    bestReason = titleResult.reason;
                    bestSource = 'title';
                }
            }
            
            // ===== 检查keywords数组 =====
            if (item.keywords && Array.isArray(item.keywords)) {
                for (const keyword of item.keywords) {
                    if (!keyword) continue;
                    
                    const keywordLower = keyword.toLowerCase().trim();
                    
                    // keywords精确匹配
                    if (keywordLower === normalizedInput) {
                        this.verboseOutput(`  → 发现keywords精确匹配: "${keyword}" in "${item.title}"`, 'success');
                        return {
                            matched: true,
                            score: 1.0,
                            source_db: 'grammar',
                            source_table: 'grammar',
                            source_id: item.id,
                            matched_text: item.title,
                            matched_data: item
                        };
                    }
                    
                    // keywords模糊匹配
                    const keywordResult = this.calculateChineseSimilarity(grammarText, keyword);
                    const keywordScore = keywordResult.score;
                    
                    if (keywordScore >= 0.5) {
                        candidates.push({
                            text: `${keyword} (${item.title})`,
                            score: keywordScore,
                            reason: keywordResult.reason,
                            source: 'keywords',
                            id: item.id
                        });
                    }
                    
                    if (keywordScore > bestScore) {
                        bestScore = keywordScore;
                        bestMatch = item;
                        bestReason = keywordResult.reason;
                        bestSource = `keywords:${keyword}`;
                    }
                }
            }
            
            // ===== v4.5.3 新增：检查 structure 字段（句型结构）=====
            if (item.structure) {
                const structureText = typeof item.structure === 'string' ? item.structure : '';
                if (structureText) {
                    // 将 structure 按分隔符拆分（可能包含多个句型）
                    const structures = structureText.split(/[/|;、]/).map(s => s.trim()).filter(Boolean);
                    
                    for (let struct of structures) {
                        // 去除 structure 中的加号和多余空格
                        struct = struct.replace(/\s*\+\s*/g, ' ').trim();
                        
                        // structure 精确匹配（使用智能匹配）
                        if (this._smartPatternMatch(grammarText, struct)) {
                            this.verboseOutput(`  → 发现structure智能匹配: "${grammarText}" ≈ "${struct}" in "${item.title}"`, 'success');
                            return {
                                matched: true,
                                score: 1.0,
                                source_db: 'grammar',
                                source_table: 'grammar',
                                source_id: item.id,
                                matched_text: item.title,
                                matched_data: item,
                                matchedStructure: struct
                            };
                        }
                        
                        // structure 模糊匹配
                        // [Bug 4 修复] structure 字段68%为中文，应使用 isGrammarMatch 走中文相似度算法
                        // 原来用 isPatternMatch 走英文算法，对中文 structure 计算结果不准确
                        const structScore = this.calculateSimilarity(grammarText, struct, { isGrammarMatch: true });
                        if (structScore >= 0.7) {
                            candidates.push({
                                text: `${struct} (${item.title})`,
                                score: structScore,
                                reason: 'structure匹配',
                                source: 'structure',
                                id: item.id
                            });
                            
                            if (structScore > bestScore) {
                                bestScore = structScore;
                                bestMatch = item;
                                bestReason = 'structure匹配';
                                bestSource = `structure:${struct}`;
                            }
                        }
                    }
                }
            }
            
            // ===== v4.5.3 新增：检查 usage 字段（用法说明）=====
            if (item.usage) {
                let usageArray = [];
                
                // usage 可能是数组或字符串
                if (Array.isArray(item.usage)) {
                    usageArray = item.usage;
                } else if (typeof item.usage === 'string') {
                    try {
                        usageArray = JSON.parse(item.usage);
                    } catch (e) {
                        usageArray = [item.usage];
                    }
                }
                
                for (const usage of usageArray) {
                    if (!usage || typeof usage !== 'string') continue;
                    
                    // 从用法说明中提取句型
                    // 方法1: 直接按标点符号分割，找包含占位符的部分
                    const parts = usage.split(/[,，;；。.、]/);
                    
                    for (let part of parts) {
                        part = part.trim();
                        
                        // 检查是否包含占位符（sb., sth., adj., to do 等）
                        if (!/\b(sb\.?|sth\.?|adj\.?|adv\.?|to\s+do|doing)\b/i.test(part)) {
                            continue;
                        }
                        
                        // 去除冒号前的描述文本（如 "tell："）
                        part = part.replace(/^[^:：]*[:：]\s*/, '');
                        
                        // usage中的句型匹配（使用智能匹配）
                        if (this._smartPatternMatch(grammarText, part)) {
                            this.verboseOutput(`  → 发现usage智能匹配: "${grammarText}" ≈ "${part}" in "${item.title}"`, 'success');
                            return {
                                matched: true,
                                score: 1.0,
                                source_db: 'grammar',
                                source_table: 'grammar',
                                source_id: item.id,
                                matched_text: item.title,
                                matched_data: item,
                                matchedUsage: part
                            };
                        }
                        
                        // usage中的句型模糊匹配
                        // [Bug 4 修复] usage 字段也包含大量中文，使用 isGrammarMatch
                        const usageScore = this.calculateSimilarity(grammarText, part, { isGrammarMatch: true });
                        if (usageScore >= 0.7) {
                            candidates.push({
                                text: `${part} (${item.title})`,
                                score: usageScore,
                                reason: 'usage匹配',
                                source: 'usage',
                                id: item.id
                            });
                            
                            if (usageScore > bestScore) {
                                bestScore = usageScore;
                                bestMatch = item;
                                bestReason = 'usage匹配';
                                bestSource = `usage:${part}`;
                            }
                        }
                    }
                }
            }
        }
        
        // 排序候选
        candidates.sort((a, b) => b.score - a.score);
        
        const threshold = this.thresholds.grammar;
        
        // 输出匹配报告
        this.printMatchReport(
            grammarText, 
            candidates, 
            bestMatch ? bestMatch.title : null, 
            bestScore, 
            threshold
        );
        
        // 相似度 ≥85% 才算匹配成功
        if (bestScore >= threshold && bestMatch) {
            this.verboseOutput(`✅ 语法模糊匹配成功: "${grammarText}" → "${bestMatch.title}" (${(bestScore * 100).toFixed(1)}%, ${bestSource}, ${bestReason})`, 'match');
            return {
                matched: true,
                score: bestScore,
                source_db: 'grammar',
                source_table: 'grammar',
                source_id: bestMatch.id,
                matched_text: bestMatch.title,
                matched_data: bestMatch,
                matchReason: bestReason
            };
        }
        
        // <85% 未匹配，交给 AI 生成
        this.verboseOutput(`❌ 语法匹配失败: "${grammarText}" 最佳候选 ${bestMatch ? `"${bestMatch.title}"` : '无'} 只有 ${(bestScore * 100).toFixed(1)}%，将由 AI 生成`, 'warn');
        return { matched: false, score: bestScore };
    }
    
    /**
     * v4.0: 从文本中提取语法关键词
     */
    _extractGrammarKeywords(text) {
        if (!text) return [];
        
        const found = [];
        for (const keyword of this.grammarKeywords) {
            if (text.includes(keyword)) {
                found.push(keyword);
            }
        }
        return found;
    }

    /**
     * 批量匹配
     */
    batchMatch(extractedData) {
        // v5.3.0: 一次性加载全部数据并缓存，避免逐词重复 SELECT * 全表查询
        this._initBatchCache();
        
        const result = {
            matched: [],
            unmatched: [],
            excluded: [],
            replaced: []
        };

        // 匹配单词
        if (extractedData.words && Array.isArray(extractedData.words)) {
            for (const word of extractedData.words) {
                const matchResult = this.matchWord(word);
                
                if (matchResult.excluded) {
                    result.excluded.push({
                        item_type: 'word',
                        original_text: word,
                        reason: matchResult.reason
                    });
                    continue;
                }
                
                if (matchResult.replaced_multi) {
                    console.log(`[batchMatch] 多词条替换: "${word}" → ${matchResult.items.length} 个词条`);
                    result.replaced.push({
                        item_type: 'word',
                        original_text: word,
                        replace_items: matchResult.items
                    });
                    
                    for (const item of matchResult.items) {
                        this._addMultiReplaceItem(result, item, word);
                    }
                    continue;
                }
                
                if (matchResult.replaced) {
                    result.replaced.push({
                        item_type: 'word',
                        original_text: matchResult.original_text,
                        replace_text: matchResult.replace_text
                    });
                }
                
                if (matchResult.matched) {
                    result.matched.push({
                        item_type: 'word',
                        original_text: matchResult.replaced ? matchResult.original_text : word,
                        ...matchResult
                    });
                } else {
                    result.unmatched.push({
                        item_type: 'word',
                        original_text: matchResult.replaced ? matchResult.original_text : word,
                        best_score: matchResult.score
                    });
                }
            }
        }

        // 匹配短语
        if (extractedData.phrases && Array.isArray(extractedData.phrases)) {
            for (const phrase of extractedData.phrases) {
                const matchResult = this.matchPhrase(phrase);
                
                if (matchResult.excluded) {
                    result.excluded.push({
                        item_type: 'phrase',
                        original_text: phrase,
                        reason: matchResult.reason
                    });
                    continue;
                }
                
                if (matchResult.replaced_multi) {
                    console.log(`[batchMatch] 多词条替换: "${phrase}" → ${matchResult.items.length} 个词条`);
                    result.replaced.push({
                        item_type: 'phrase',
                        original_text: phrase,
                        replace_items: matchResult.items
                    });
                    
                    for (const item of matchResult.items) {
                        this._addMultiReplaceItem(result, item, phrase);
                    }
                    continue;
                }
                
                if (matchResult.replaced) {
                    result.replaced.push({
                        item_type: 'phrase',
                        original_text: matchResult.original_text,
                        replace_text: matchResult.replace_text
                    });
                }
                
                if (matchResult.matched) {
                    result.matched.push({
                        item_type: 'phrase',
                        original_text: matchResult.replaced ? matchResult.original_text : phrase,
                        ...matchResult
                    });
                } else {
                    result.unmatched.push({
                        item_type: 'phrase',
                        original_text: matchResult.replaced ? matchResult.original_text : phrase,
                        best_score: matchResult.score
                    });
                }
            }
        }

        // 匹配句型
        if (extractedData.patterns && Array.isArray(extractedData.patterns)) {
            for (const pattern of extractedData.patterns) {
                const matchResult = this.matchPattern(pattern);
                
                if (matchResult.excluded) {
                    result.excluded.push({
                        item_type: 'pattern',
                        original_text: pattern,
                        reason: matchResult.reason
                    });
                    continue;
                }
                
                if (matchResult.replaced_multi) {
                    console.log(`[batchMatch] 多词条替换: "${pattern}" → ${matchResult.items.length} 个词条`);
                    result.replaced.push({
                        item_type: 'pattern',
                        original_text: pattern,
                        replace_items: matchResult.items
                    });
                    
                    for (const item of matchResult.items) {
                        this._addMultiReplaceItem(result, item, pattern);
                    }
                    continue;
                }
                
                if (matchResult.replaced) {
                    result.replaced.push({
                        item_type: 'pattern',
                        original_text: matchResult.original_text,
                        replace_text: matchResult.replace_text
                    });
                }
                
                if (matchResult.matched) {
                    result.matched.push({
                        item_type: 'pattern',
                        original_text: matchResult.replaced ? matchResult.original_text : pattern,
                        ...matchResult
                    });
                } else {
                    result.unmatched.push({
                        item_type: 'pattern',
                        original_text: matchResult.replaced ? matchResult.original_text : pattern,
                        best_score: matchResult.score
                    });
                }
            }
        }

        // 匹配语法
        if (extractedData.grammar && Array.isArray(extractedData.grammar)) {
            console.log('\n' + '═'.repeat(80));
            console.log('📚 开始语法匹配流程');
            console.log('═'.repeat(80));
            
            for (const grammar of extractedData.grammar) {
                const matchResult = this.matchGrammar(grammar);
                
                if (matchResult.excluded) {
                    result.excluded.push({
                        item_type: 'grammar',
                        original_text: grammar,
                        reason: matchResult.reason
                    });
                    continue;
                }
                
                if (matchResult.replaced_multi) {
                    console.log(`[batchMatch] 多词条替换: "${grammar}" → ${matchResult.items.length} 个词条`);
                    result.replaced.push({
                        item_type: 'grammar',
                        original_text: grammar,
                        replace_items: matchResult.items
                    });
                    
                    for (const item of matchResult.items) {
                        this._addMultiReplaceItem(result, item, grammar);
                    }
                    continue;
                }
                
                if (matchResult.replaced) {
                    result.replaced.push({
                        item_type: 'grammar',
                        original_text: matchResult.original_text,
                        replace_text: matchResult.replace_text
                    });
                }
                
                if (matchResult.matched) {
                    result.matched.push({
                        item_type: 'grammar',
                        original_text: matchResult.replaced ? matchResult.original_text : grammar,
                        ...matchResult
                    });
                } else {
                    result.unmatched.push({
                        item_type: 'grammar',
                        original_text: matchResult.replaced ? matchResult.original_text : grammar,
                        best_score: matchResult.score
                    });
                }
            }
            
            console.log('═'.repeat(80));
            console.log('📚 语法匹配流程结束');
            console.log('═'.repeat(80) + '\n');
        }

        if (result.excluded.length > 0) {
            console.log(`[MatchingService] 已排除 ${result.excluded.length} 个项目`);
        }
        if (result.replaced.length > 0) {
            console.log(`[MatchingService] 已替换 ${result.replaced.length} 个项目`);
        }

        // v5.3.0: 清除缓存，释放内存
        this._clearBatchCache();

        return result;
    }
    
    /**
     * v4.0: 处理多词条替换中的单个词条
     */
    _addMultiReplaceItem(result, item, originalText) {
        const itemType = item.type || 'word';
        const text = item.text;
        
        if (item.id) {
            let vocabData = null;
            let sourceTable = '';
            
            if (itemType === 'word') {
                vocabData = this.vocabularyService.getWordById?.(item.id);
                sourceTable = 'words';
            } else if (itemType === 'phrase') {
                vocabData = this.vocabularyService.getPhraseById?.(item.id);
                sourceTable = 'phrases';
            } else if (itemType === 'pattern') {
                vocabData = this.vocabularyService.getPatternById?.(item.id);
                sourceTable = 'patterns';
            } else if (itemType === 'grammar') {
                vocabData = this.grammarService.getById?.(item.id);
                sourceTable = 'grammar';
            }
            
            if (vocabData) {
                result.matched.push({
                    item_type: itemType,
                    original_text: text,
                    matched: true,
                    score: 1.0,
                    source_db: itemType === 'grammar' ? 'grammar' : 'vocabulary',
                    source_table: sourceTable,
                    source_id: item.id,
                    matched_text: vocabData.word || vocabData.phrase || vocabData.pattern || vocabData.title || text,
                    matched_data: vocabData,
                    fromReplaceDict: true,
                    fromMultiReplace: true,
                    multiReplaceOriginal: originalText
                });
                console.log(`[_addMultiReplaceItem] 已加入(ID ${item.id}): ${text} (${itemType})`);
                return;
            }
        }
        
        let matchResult = null;
        if (itemType === 'word') {
            matchResult = this._matchWordInternal(text);
        } else if (itemType === 'phrase') {
            matchResult = this._matchPhraseInternal(text);
        } else if (itemType === 'pattern') {
            matchResult = this._matchPatternInternal(text);
        } else if (itemType === 'grammar') {
            matchResult = this._matchGrammarInternal(text);
        }
        
        if (matchResult && matchResult.matched) {
            matchResult.score = 1.0;
            matchResult.fromReplaceDict = true;
            matchResult.fromMultiReplace = true;
            matchResult.multiReplaceOriginal = originalText;
            
            result.matched.push({
                item_type: itemType,
                original_text: text,
                ...matchResult
            });
            console.log(`[_addMultiReplaceItem] 已加入(匹配): ${text} (${itemType})`);
        } else {
            const userData = {
                id: null,
                [itemType === 'grammar' ? 'title' : itemType]: text,
                meaning: item.meaning || '',
                [itemType === 'grammar' ? 'definition' : 'meaning']: item.meaning || '',
                example: item.example || ''
            };
            
            result.matched.push({
                item_type: itemType,
                original_text: text,
                matched: true,
                score: 1.0,
                source_db: 'user_input',
                source_table: 'user_input',
                source_id: null,
                matched_text: text,
                matched_data: userData,
                fromReplaceDict: true,
                fromMultiReplace: true,
                fromUserInput: true,
                multiReplaceOriginal: originalText
            });
            console.log(`[_addMultiReplaceItem] 已加入(用户输入): ${text} (${itemType})`);
        }
    }

    /**
     * 获取匹配统计
     */
    getMatchStats(matchResult) {
        const exactMatch = matchResult.matched.filter(m => m.score >= 1.0).length;
        const fuzzyMatch = matchResult.matched.filter(m => m.score < 1.0).length;
        const unmatched = matchResult.unmatched.length;
        const total = exactMatch + fuzzyMatch + unmatched;

        return {
            total,
            exactMatch,
            fuzzyMatch,
            unmatched,
            matchRate: total > 0 ? ((exactMatch + fuzzyMatch) / total * 100).toFixed(1) : 0
        };
    }

    /**
     * 开启/关闭调试模式
     */
    setDebug(enabled) {
        this.debug = enabled;
        console.log(`[MatchingService] 调试模式: ${enabled ? '开启' : '关闭'}`);
    }
    
    /**
     * v4.3.0: 开启/关闭详细日志
     */
    setVerboseLog(enabled) {
        this.verboseLog = enabled;
        console.log(`[MatchingService] 详细日志: ${enabled ? '开启' : '关闭'}`);
    }

    /**
     * 添加黑名单词条
     */
    addToBlacklist(type, text) {
        if (this.blacklist[type]) {
            this.blacklist[type].push(text.toLowerCase());
    
            console.log(`[MatchingService] 已添加到${type}黑名单: ${text}`);
        }
    }
}

// 单例模式
let instance = null;

function getMatchingService() {
    if (!instance) {
        instance = new MatchingService();
    }
    return instance;
}

module.exports = {
    MatchingService,
    getMatchingService
};