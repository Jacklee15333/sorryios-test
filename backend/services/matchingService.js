/**
 * 匹配算法服务 v4.2.2
 * 文件位置: backend/services/matchingService.js
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
        console.log('[MatchingService] v3.8: 替换库服务已加载（已合并排除库）');
        
        // v2.2: 提高匹配阈值，更严格
        this.thresholds = {
            word: 0.90,      // 单词：90%（从85%提高）
            phrase: 0.85,    // 短语：85%（从80%提高）
            pattern: 0.85,   // 句型：85%
            grammar: 0.85    // 语法：85%（统一阈值）
        };
        
        this.minMatchScore = 0.85;
        this.debug = false;
        
        // 缓存词库数据
        this.cache = {
            words: null,
            phrases: null,
            patterns: null,
            grammar: null,
            lastUpdate: null
        };
        
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
        
        this.refreshCache();
    }

    /**
     * 刷新缓存（v2.2: 过滤黑名单）
     */
    refreshCache() {
        try {
            // 获取原始数据
            let words = this.vocabularyService.getAllWords(true) || [];
            let phrases = this.vocabularyService.getAllPhrases(true) || [];
            let patterns = this.vocabularyService.getAllPatterns(true) || [];
            let grammar = this.grammarService.getAll(true) || [];
            
            // v2.2: 过滤黑名单
            const wordBlacklist = this.blacklist.words.map(w => w.toLowerCase());
            const phraseBlacklist = this.blacklist.phrases.map(p => p.toLowerCase());
            
            this.cache.words = words.filter(w => 
                !wordBlacklist.includes((w.word || '').toLowerCase())
            );
            this.cache.phrases = phrases.filter(p => 
                !phraseBlacklist.includes((p.phrase || '').toLowerCase())
            );
            this.cache.patterns = patterns;
            this.cache.grammar = grammar;
            this.cache.lastUpdate = Date.now();
            
            const filteredWords = words.length - this.cache.words.length;
            const filteredPhrases = phrases.length - this.cache.phrases.length;
            
            console.log(`[MatchingService] v3.3 缓存已刷新`);
            if (filteredWords > 0 || filteredPhrases > 0) {
                console.log(`[MatchingService] 已过滤黑名单: ${filteredWords}个单词, ${filteredPhrases}个短语`);
            }
        } catch (e) {
            console.error('[MatchingService] 刷新缓存失败:', e.message);
        }
    }

    /**
     * 检查缓存是否需要刷新
     */
    checkCache() {
        if (!this.cache.lastUpdate || Date.now() - this.cache.lastUpdate > 5 * 60 * 1000) {
            this.refreshCache();
        }
    }

    /**
     * 调试日志
     */
    log(...args) {
        if (this.debug) {
            console.log('[MatchingService]', ...args);
        }
    }

    /**
     * 词形还原
     */
    lemmatize(word) {
        const w = word.toLowerCase().trim();
        const results = [w];
        
        if (this.irregularVerbs[w]) {
            results.push(this.irregularVerbs[w]);
        }
        
        if (this.adjectiveVariants[w]) {
            results.push(this.adjectiveVariants[w]);
        }
        
        // -ing 结尾
        if (w.endsWith('ing') && w.length > 4) {
            const base1 = w.slice(0, -3);
            if (base1.length >= 2 && base1[base1.length - 1] === base1[base1.length - 2]) {
                results.push(base1.slice(0, -1));
            }
            results.push(base1 + 'e');
            results.push(base1);
        }
        
        // -ed 结尾
        if (w.endsWith('ed') && w.length > 3) {
            const base1 = w.slice(0, -2);
            const base2 = w.slice(0, -1);
            results.push(base1);
            results.push(base2);
            if (base1.length >= 2 && base1[base1.length - 1] === base1[base1.length - 2]) {
                results.push(base1.slice(0, -1));
            }
        }
        
        // -s/-es 结尾
        if (w.endsWith('ies') && w.length > 4) {
            results.push(w.slice(0, -3) + 'y');
        } else if (w.endsWith('es') && w.length > 3) {
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
        // 排除常见的非动名词：thing, something, nothing, anything, morning, evening, etc.
        const nonVerbIng = ['thing', 'something', 'nothing', 'anything', 'everything', 
                           'morning', 'evening', 'spring', 'string', 'ring', 'king', 
                           'sing', 'bring', 'wing', 'ceiling', 'feeling', 'meeting',
                           'building', 'meaning', 'beginning', 'ending'];
        
        cleaned = cleaned.replace(/\b(\w{4,})ing\b/gi, (match, stem) => {
            const word = match.toLowerCase();
            // 如果是非动名词，保留原样
            if (nonVerbIng.includes(word)) {
                return match;
            }
            // 如果已经是 doing，保留
            if (word === 'doing') {
                return 'doing';
            }
            // 其他 -ing 结尾的词转换为 doing
            return 'doing';
        });
        
        // 把 doing 也统一处理
        cleaned = cleaned.replace(/\bdoing\b/gi, 'do');
        
        // 去掉尾部的标点
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
        
        // 找到核心词（第一个非模板词）
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
        
        // 完全相等
        if (inputCore === targetCore) return true;
        
        // ========== v3.2 修复：前缀检查 ==========
        // 如果一个核心词是另一个的前缀，认为不匹配
        // 防止 plant vs plan, explain vs explain 这类误匹配
        // 因为 "plan" 是 "plant" 的前缀，但它们是完全不同的词
        if (inputCore.startsWith(targetCore) || targetCore.startsWith(inputCore)) {
            this.log(`[v3.2] 核心词前缀冲突，拒绝匹配: "${inputCore}" vs "${targetCore}"`);
            return false;
        }
        // ========================================
        
        const distance = this.levenshteinDistance(inputCore, targetCore);
        const maxLen = Math.max(inputCore.length, targetCore.length);
        
        // 短词（<=4字符）必须完全匹配
        if (maxLen <= 4) {
            return distance === 0;
        }
        
        // 长词允许1个字符的差异（但已排除前缀关系）
        return distance <= 1;
    }

    /**
     * v3.3 新增：模板参数兼容性检查
     * 检查两个短语的模板参数是否兼容
     * sb. 和 oneself 是不兼容的（前者泛指某人，后者指主语自己）
     * @param {string} input - 输入文本
     * @param {string} target - 目标文本
     * @returns {boolean} 是否兼容
     */
    templateParamsCompatible(input, target) {
        const inputLower = input.toLowerCase();
        const targetLower = target.toLowerCase();
        
        // 检查 sb. 和 oneself 的冲突
        // sb./sb 表示泛指某人，oneself 表示反身代词（主语自己）
        const inputHasSb = /\bsb\.?\b/.test(inputLower);
        const targetHasSb = /\bsb\.?\b/.test(targetLower);
        const inputHasOneself = /\boneself\b/.test(inputLower);
        const targetHasOneself = /\boneself\b/.test(targetLower);
        
        // 如果一个有 sb. 另一个有 oneself，不兼容
        if ((inputHasSb && targetHasOneself) || (inputHasOneself && targetHasSb)) {
            this.log(`[v3.3] 模板参数不兼容: sb. vs oneself - "${input}" vs "${target}"`);
            return false;
        }
        
        // 检查 one's 和 sb's 的关系（这个相对兼容，暂不做严格限制）
        
        return true;
    }

    /**
     * v2.2 新增：检测是否是中文文本
     */
    isChinese(text) {
        return /[\u4e00-\u9fa5]/.test(text);
    }

    /**
     * v2.2 新增：中文相似度计算
     */
    calculateChineseSimilarity(input, target) {
        const s1 = input.trim();
        const s2 = target.trim();
        
        if (!s1 || !s2) return 0;
        if (s1 === s2) return 1.0;
        
        if (s2.includes(s1)) {
            return s1.length / s2.length * 0.95;
        }
        if (s1.includes(s2)) {
            return s2.length / s1.length * 0.95;
        }
        
        const distance = this.levenshteinDistance(s1, s2);
        const maxLen = Math.max(s1.length, s2.length);
        return 1 - distance / maxLen;
    }

    /**
     * 计算相似度分数 (0-1)
     */
    calculateSimilarity(input, target, options = {}) {
        const s1 = input.toLowerCase().trim();
        const s2 = target.toLowerCase().trim();
        
        if (!s1 || !s2) return 0;

        if (s1 === s2) {
            return 1.0;
        }

        if (options.isGrammarMatch && this.isChinese(input)) {
            return this.calculateChineseSimilarity(input, target);
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

        // v3.2: 核心词检查现在包含前缀检测
        // v3.3: 添加模板参数兼容性检查
        if (options.isPhraseMatch || options.isPatternMatch) {
            if (!this.coreWordMatches(s1, s2)) {
                this.log(`核心词不匹配: "${s1}" vs "${s2}"`);
                const distance = this.levenshteinDistance(s1, s2);
                const maxLen = Math.max(s1.length, s2.length);
                return 1 - distance / maxLen;
            }
            
            // v3.3: 检查模板参数兼容性（sb. vs oneself 等）
            if (!this.templateParamsCompatible(s1, s2)) {
                this.log(`模板参数不兼容: "${s1}" vs "${s2}"`);
                const distance = this.levenshteinDistance(s1, s2);
                const maxLen = Math.max(s1.length, s2.length);
                return 1 - distance / maxLen;
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
                
                // ========== v3.2 修复：清理后的文本也要检查前缀关系 ==========
                // 如果清理后一个是另一个的前缀/后缀，不能返回高相似度
                const isPrefixRelation = cleanS1.startsWith(cleanS2) || cleanS2.startsWith(cleanS1);
                
                if (!isPrefixRelation) {
                    if (cleanS2.includes(cleanS1) && cleanS1.length / cleanS2.length >= 0.7) {
                        return 0.90;
                    }
                    if (cleanS1.includes(cleanS2) && cleanS2.length / cleanS1.length >= 0.7) {
                        return 0.90;
                    }
                }
                // ============================================================
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
    findBestMatch(input, dataSet, textField, options = {}) {
        let bestMatch = null;
        let bestScore = 0;

        const normalizedInput = input.toLowerCase().trim();
        const inputVariants = options.isWordMatch ? this.lemmatize(input) : [normalizedInput];
        
        for (const item of dataSet) {
            const target = item[textField];
            if (!target) continue;
            
            const normalizedTarget = target.toLowerCase().trim();
            
            // v4.1: 先检查精确匹配（标准化后完全相同 = 100%）
            if (normalizedInput === normalizedTarget) {
                console.log(`[findBestMatch] 精确匹配: "${input}" === "${target}" → 100%`);
                return { match: item, score: 1.0 };
            }

            for (const variant of inputVariants) {
                // 词形变化也检查精确匹配
                if (variant === normalizedTarget) {
                    console.log(`[findBestMatch] 词形精确匹配: "${input}" → "${variant}" === "${target}" → 100%`);
                    return { match: item, score: 1.0 };
                }
                
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
        
        // 调试：如果没有精确匹配但分数很高，输出警告
        if (bestMatch && bestScore >= 0.85) {
            const targetText = bestMatch[textField];
            console.log(`[findBestMatch] 模糊匹配: "${input}" ≈ "${targetText}" → ${(bestScore * 100).toFixed(1)}%`);
        }

        return { match: bestMatch, score: bestScore };
    }

    /**
     * v4.1: 查询替换库（使用 matchingDictService）
     * 支持精确匹配和模糊匹配
     * 匹配顺序：
     * 1. 精确匹配 original_text → 100% 信任，不上报
     * 2. 模糊匹配 original_text ≥90% → 使用替换规则，上报到模糊匹配
     * 
     * @param {string} text - 原始文本
     * @param {string} type - 类型 (word/phrase/pattern/grammar)
     * @returns {Object|null} { action: 'replace'|'exclude'|'replace_multi', ... } 或 null
     */
    checkReplaceRule(text, type) {
        try {
            // ===== 第1步：精确匹配 =====
            const rule = this.matchingDictService.findRule(text, type);
            
            if (rule) {
                return this._processReplaceRule(rule, text, type, false);  // false = 精确匹配
            }
            
            // ===== 第2步：模糊匹配（≥90%）=====
            const fuzzyResult = this._findReplaceRuleFuzzy(text, type);
            
            if (fuzzyResult) {
                console.log(`[MatchingService] 替换库模糊匹配: "${text}" ≈ "${fuzzyResult.rule.original_text}" (${(fuzzyResult.score * 100).toFixed(1)}%)`);
                return this._processReplaceRule(fuzzyResult.rule, text, type, true, fuzzyResult.score);  // true = 模糊匹配
            }
            
            return null;
        } catch (e) {
            console.error('[MatchingService] 查询替换库失败:', e.message);
            return null;
        }
    }
    
    /**
     * v4.1: 替换库模糊匹配
     * 在替换库中查找相似度 ≥85% 的规则（类型必须一致）
     * @param {string} text - 原始文本
     * @param {string} type - 类型
     * @returns {Object|null} { rule, score } 或 null
     */
    _findReplaceRuleFuzzy(text, type) {
        // 确保缓存已刷新
        this.matchingDictService.checkCache();
        
        const rules = this.matchingDictService.cache.rules || [];
        const normalizedType = type.toLowerCase().trim();
        const normalizedText = text.toLowerCase().trim();
        const threshold = 0.85;  // 模糊匹配阈值 85%
        
        let bestRule = null;
        let bestScore = 0;
        
        for (const rule of rules) {
            // 类型必须一致
            if (rule.original_type.toLowerCase().trim() !== normalizedType) {
                continue;
            }
            
            // 跳过排除规则（target_text 为空）
            if (!rule.target_text || rule.target_text.trim() === '') {
                continue;
            }
            
            const normalizedOriginal = rule.original_text.toLowerCase().trim();
            
            // v4.1: 先检查精确匹配（标准化后完全相同 = 100%）
            if (normalizedText === normalizedOriginal) {
                this.matchingDictService.incrementUseCount(rule.id);
                return { rule: rule, score: 1.0 };
            }
            
            // 计算相似度
            const score = this.calculateSimilarity(text, rule.original_text, {
                isWordMatch: type === 'word',
                isPhraseMatch: type === 'phrase',
                isPatternMatch: type === 'pattern',
                isGrammarMatch: type === 'grammar'
            });
            
            if (score >= threshold && score > bestScore) {
                bestScore = score;
                bestRule = rule;
            }
        }
        
        if (bestRule) {
            // 增加使用次数
            this.matchingDictService.incrementUseCount(bestRule.id);
            return { rule: bestRule, score: bestScore };
        }
        
        return null;
    }
    
    /**
     * v4.1: 处理替换规则（精确匹配或模糊匹配）
     * @param {Object} rule - 替换规则
     * @param {string} originalText - 原始文本
     * @param {string} type - 类型
     * @param {boolean} isFuzzy - 是否为模糊匹配
     * @param {number} fuzzyScore - 模糊匹配分数
     * @returns {Object} 处理结果
     */
    _processReplaceRule(rule, originalText, type, isFuzzy = false, fuzzyScore = 1.0) {
        // 排除规则
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
        
        // 尝试解析 JSON 格式（多词条替换）
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
        
        // 单个替换
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
     * v4.2: 调整匹配顺序，词库精确匹配优先于替换库模糊匹配
     */
    matchWord(word) {
        this.checkCache();
        
        const normalizedWord = word.toLowerCase().trim();
        const wordVariants = this.lemmatize(word);  // 包含词形变化
        
        // ===== 第1步：替换库精确匹配 =====
        const exactRule = this.matchingDictService.findRule(word, 'word');
        if (exactRule) {
            if (!exactRule.target_text || exactRule.target_text.trim() === '') {
                return { excluded: true, reason: exactRule.notes || '已标记为排除' };
            }
            return this._processAndApplyReplaceRule(exactRule, word, 'word', false);
        }
        
        // ===== 第2步：词库精确匹配（包括词形变化）=====
        for (const item of this.cache.words) {
            if (!item.word) continue;
            const normalizedTarget = item.word.toLowerCase().trim();
            
            // 检查原词或词形变化
            for (const variant of wordVariants) {
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
        
        // ===== 第3步：替换库模糊匹配 =====
        const fuzzyRule = this._findReplaceRuleFuzzyOnly(word, 'word');
        if (fuzzyRule) {
            return this._processAndApplyReplaceRule(fuzzyRule.rule, word, 'word', true, fuzzyRule.score);
        }
        
        // ===== 第4步：词库模糊匹配 =====
        return this._matchWordInternal(word);
    }
    
    /**
     * 内部单词匹配
     * v3.5: 直接模糊匹配（删除了 checkMatchingDict）
     */
    _matchWordInternal(word) {
        const { match, score } = this.findBestMatch(
            word, 
            this.cache.words, 
            'word',
            { isWordMatch: true }
        );
        
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
     * v4.2: 调整匹配顺序，词库精确匹配优先于替换库模糊匹配
     * 顺序：替换库精确 → 词库精确 → 替换库模糊 → 词库模糊
     */
    matchPhrase(phrase) {
        this.checkCache();
        
        const normalizedPhrase = phrase.toLowerCase().trim();
        
        // ===== 第1步：替换库精确匹配 =====
        const exactRule = this.matchingDictService.findRule(phrase, 'phrase');
        if (exactRule) {
            // 排除规则
            if (!exactRule.target_text || exactRule.target_text.trim() === '') {
                return { excluded: true, reason: exactRule.notes || '已标记为排除' };
            }
            // 多词条或单个替换
            return this._processAndApplyReplaceRule(exactRule, phrase, 'phrase', false);
        }
        
        // ===== 第2步：词库精确匹配（优先于替换库模糊匹配）=====
        for (const item of this.cache.phrases) {
            if (!item.phrase) continue;
            if (item.phrase.toLowerCase().trim() === normalizedPhrase) {
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
        
        // ===== 第3步：替换库模糊匹配 =====
        const fuzzyRule = this._findReplaceRuleFuzzyOnly(phrase, 'phrase');
        if (fuzzyRule) {
            return this._processAndApplyReplaceRule(fuzzyRule.rule, phrase, 'phrase', true, fuzzyRule.score);
        }
        
        // ===== 第4步：词库模糊匹配 =====
        return this._matchPhraseInternal(phrase);
    }
    
    /**
     * v4.2: 只做替换库模糊匹配（不包含精确匹配）
     * v4.2.1: 如果输入包含模板占位符，跳过模糊匹配
     */
    _findReplaceRuleFuzzyOnly(text, type) {
        // v4.2.1: 检查是否包含模板占位符
        // 如果是通用模板（如 "without doing sth."），不应该模糊匹配到具体短语
        if (this._containsTemplatePlaceholder(text)) {
            console.log(`[MatchingService] 跳过替换库模糊匹配: "${text}" 是通用模板`);
            return null;
        }
        
        this.matchingDictService.checkCache();
        
        const rules = this.matchingDictService.cache.rules || [];
        const normalizedType = type.toLowerCase().trim();
        const normalizedText = text.toLowerCase().trim();
        const threshold = 0.85;
        
        let bestRule = null;
        let bestScore = 0;
        
        for (const rule of rules) {
            if (rule.original_type.toLowerCase().trim() !== normalizedType) continue;
            if (!rule.target_text || rule.target_text.trim() === '') continue;
            
            const normalizedOriginal = rule.original_text.toLowerCase().trim();
            
            // 跳过精确匹配（精确匹配已经在第1步处理过了）
            if (normalizedText === normalizedOriginal) continue;
            
            const score = this.calculateSimilarity(text, rule.original_text, {
                isWordMatch: type === 'word',
                isPhraseMatch: type === 'phrase',
                isPatternMatch: type === 'pattern',
                isGrammarMatch: type === 'grammar'
            });
            
            if (score >= threshold && score > bestScore) {
                bestScore = score;
                bestRule = rule;
            }
        }
        
        if (bestRule) {
            this.matchingDictService.incrementUseCount(bestRule.id);
            console.log(`[MatchingService] 替换库模糊匹配: "${text}" ≈ "${bestRule.original_text}" (${(bestScore * 100).toFixed(1)}%)`);
            return { rule: bestRule, score: bestScore };
        }
        
        return null;
    }
    
    /**
     * v4.2.1: 检查文本是否包含模板占位符
     * 如果包含，说明它已经是通用模板，不应该和具体短语模糊匹配
     * @param {string} text - 输入文本
     * @returns {boolean} 是否包含模板占位符
     */
    _containsTemplatePlaceholder(text) {
        if (!text) return false;
        
        const lowerText = text.toLowerCase();
        
        // 模板占位符列表
        const placeholders = [
            'doing sth', 'do sth', 'done sth',  // 动词形式
            'sb.', 'sth.',                       // 人/物
            "one's", 'oneself',                  // 反身代词
            'adj.', 'adv.',                      // 形容词/副词
            '...'                                // 省略号
        ];
        
        for (const placeholder of placeholders) {
            if (lowerText.includes(placeholder)) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * v4.2: 处理并应用替换规则
     */
    _processAndApplyReplaceRule(rule, originalText, type, isFuzzy, fuzzyScore = 1.0) {
        const targetText = rule.target_text.trim();
        
        // 多词条替换
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
        
        // 单个替换
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
     * v3.5: 直接模糊匹配（删除了 checkMatchingDict）
     */
    _matchPhraseInternal(phrase) {
        const { match, score } = this.findBestMatch(
            phrase, 
            this.cache.phrases, 
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
     * v4.2: 调整匹配顺序，词库精确匹配优先于替换库模糊匹配
     */
    matchPattern(pattern) {
        this.checkCache();
        
        const normalizedPattern = pattern.toLowerCase().trim();
        
        // ===== 第1步：替换库精确匹配 =====
        const exactRule = this.matchingDictService.findRule(pattern, 'pattern');
        if (exactRule) {
            if (!exactRule.target_text || exactRule.target_text.trim() === '') {
                return { excluded: true, reason: exactRule.notes || '已标记为排除' };
            }
            return this._processAndApplyReplaceRule(exactRule, pattern, 'pattern', false);
        }
        
        // ===== 第2步：词库精确匹配 =====
        for (const item of this.cache.patterns) {
            if (!item.pattern) continue;
            if (item.pattern.toLowerCase().trim() === normalizedPattern) {
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
        
        // ===== 第3步：替换库模糊匹配 =====
        const fuzzyRule = this._findReplaceRuleFuzzyOnly(pattern, 'pattern');
        if (fuzzyRule) {
            return this._processAndApplyReplaceRule(fuzzyRule.rule, pattern, 'pattern', true, fuzzyRule.score);
        }
        
        // ===== 第4步：词库模糊匹配 =====
        return this._matchPatternInternal(pattern);
    }
    
    /**
     * 内部句型匹配
     * v3.5: 直接模糊匹配（删除了 checkMatchingDict）
     */
    _matchPatternInternal(pattern) {
        const { match, score } = this.findBestMatch(
            pattern, 
            this.cache.patterns, 
            'pattern',
            { isPatternMatch: true }
        );
        
        const threshold = this.thresholds.pattern;
        
        if (score >= threshold && match) {
            return {
                matched: true,
                score,
                source_db: 'vocabulary',
                source_table: 'patterns',
                source_id: match.id,
                matched_text: match.pattern,
                matched_data: match
            };
        }
        return { matched: false, score };
    }

    /**
     * 匹配语法
     * v4.2: 调整匹配顺序，语法库精确匹配优先于替换库模糊匹配
     */
    matchGrammar(grammarText) {
        this.checkCache();
        
        const normalizedGrammar = grammarText.toLowerCase().trim();
        
        // ===== 第1步：替换库精确匹配 =====
        const exactRule = this.matchingDictService.findRule(grammarText, 'grammar');
        if (exactRule) {
            if (!exactRule.target_text || exactRule.target_text.trim() === '') {
                return { excluded: true, reason: exactRule.notes || '已标记为排除' };
            }
            return this._processAndApplyReplaceRule(exactRule, grammarText, 'grammar', false);
        }
        
        // ===== 第2步：语法库精确匹配 =====
        for (const item of this.cache.grammar) {
            if (!item.title) continue;
            if (item.title.toLowerCase().trim() === normalizedGrammar) {
                console.log(`[matchGrammar] 语法库精确匹配: "${grammarText}" === "${item.title}" → 100%`);
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
        
        // ===== 第3步：替换库模糊匹配 =====
        const fuzzyRule = this._findReplaceRuleFuzzyOnly(grammarText, 'grammar');
        if (fuzzyRule) {
            return this._processAndApplyReplaceRule(fuzzyRule.rule, grammarText, 'grammar', true, fuzzyRule.score);
        }
        
        // ===== 第4步：语法库模糊匹配（包括关键词匹配）=====
        return this._matchGrammarInternal(grammarText);
    }
    
    /**
     * 内部语法匹配
     * v4.2.1: 去掉关键词匹配，统一逻辑：<85% 就 AI 生成
     * 匹配优先级：
     * 1. 精确匹配（标准化后完全相同）→ 100%
     * 2. 相似度 ≥85% → 匹配成功
     * 3. <85% → 未匹配，AI 生成
     */
    _matchGrammarInternal(grammarText) {
        let bestMatch = null;
        let bestScore = 0;
        
        const normalizedInput = grammarText.toLowerCase().trim();
        
        for (const item of this.cache.grammar) {
            const target = item.title;
            if (!target) continue;
            
            const normalizedTarget = target.toLowerCase().trim();
            
            // 先检查精确匹配（标准化后完全相同 = 100%）
            if (normalizedInput === normalizedTarget) {
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
            
            // 计算相似度
            const score = this.calculateSimilarity(grammarText, target, { isGrammarMatch: true });
            
            if (score > bestScore) {
                bestScore = score;
                bestMatch = item;
            }
        }
        
        const threshold = this.thresholds.grammar;  // 0.85
        
        // 相似度 ≥85% 才算匹配成功
        if (bestScore >= threshold && bestMatch) {
            return {
                matched: true,
                score: bestScore,
                source_db: 'grammar',
                source_table: 'grammar',
                source_id: bestMatch.id,
                matched_text: bestMatch.title,
                matched_data: bestMatch
            };
        }
        
        // <85% 未匹配，交给 AI 生成
        return { matched: false, score: bestScore };
    }
    
    /**
     * v4.0: 从文本中提取语法关键词
     * @param {string} text - 输入文本
     * @returns {Array} 匹配到的关键词列表
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
     * v4.0: 支持多词条替换（replaced_multi）
     */
    batchMatch(extractedData) {
        const result = {
            matched: [],
            unmatched: [],
            excluded: [],
            replaced: []  // v3.1: 记录被替换的项
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
                
                // v4.0: 处理多词条替换
                if (matchResult.replaced_multi) {
                    console.log(`[batchMatch] 多词条替换: "${word}" → ${matchResult.items.length} 个词条`);
                    result.replaced.push({
                        item_type: 'word',
                        original_text: word,
                        replace_items: matchResult.items
                    });
                    
                    // 把每个词条加入匹配结果
                    for (const item of matchResult.items) {
                        this._addMultiReplaceItem(result, item, word);
                    }
                    continue;
                }
                
                // v3.1: 记录单个替换
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
                
                // v4.0: 处理多词条替换
                if (matchResult.replaced_multi) {
                    console.log(`[batchMatch] 多词条替换: "${phrase}" → ${matchResult.items.length} 个词条`);
                    result.replaced.push({
                        item_type: 'phrase',
                        original_text: phrase,
                        replace_items: matchResult.items
                    });
                    
                    // 把每个词条加入匹配结果
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
                
                // v4.0: 处理多词条替换
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
                
                // v4.0: 处理多词条替换
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
        }

        // v3.1: 日志输出
        if (result.excluded.length > 0) {
            console.log(`[MatchingService] 已排除 ${result.excluded.length} 个项目`);
        }
        if (result.replaced.length > 0) {
            console.log(`[MatchingService] 已替换 ${result.replaced.length} 个项目`);
        }

        return result;
    }
    
    /**
     * v4.0: 处理多词条替换中的单个词条
     * 根据词条的 id 和 type，从词库获取完整数据并加入匹配结果
     * @param {Object} result - batchMatch 的结果对象
     * @param {Object} item - 替换词条 { text, type, id, source, meaning, example }
     * @param {string} originalText - 原始文本（用于记录来源）
     */
    _addMultiReplaceItem(result, item, originalText) {
        const itemType = item.type || 'word';
        const text = item.text;
        
        // 如果有 id，从词库获取完整数据
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
                    score: 1.0,  // 用户选的，强制 100% 匹配
                    source_db: itemType === 'grammar' ? 'grammar' : 'vocabulary',
                    source_table: sourceTable,
                    source_id: item.id,
                    matched_text: vocabData.word || vocabData.phrase || vocabData.pattern || vocabData.title || text,
                    matched_data: vocabData,
                    fromReplaceDict: true,
                    fromMultiReplace: true,  // 标记来自多词条替换
                    multiReplaceOriginal: originalText
                });
                console.log(`[_addMultiReplaceItem] 已加入(ID ${item.id}): ${text} (${itemType})`);
                return;
            }
        }
        
        // 没有 id 或找不到数据，尝试用文本匹配
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
            matchResult.score = 1.0;  // 用户选的，强制 100%
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
            // 用用户提供的信息构建数据
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
     * 添加黑名单词条
     */
    addToBlacklist(type, text) {
        if (this.blacklist[type]) {
            this.blacklist[type].push(text.toLowerCase());
            this.refreshCache();
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