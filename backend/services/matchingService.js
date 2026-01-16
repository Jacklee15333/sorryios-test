/**
 * 匹配算法服务 v3.1
 * 文件位置: backend/services/matchingService.js
 * 
 * 📦 v3.1 更新：
 * - 新增：替换规则检查（replace.db）
 * - 流程：先查替换规则 → 再查词典 → 最后模糊匹配
 * 
 * 📦 v3.0 匹配词典更新：
 * - 新增：匹配词典查询（matching.db）
 * - 流程：先查词典 → 再模糊匹配
 * - 支持：match（确认匹配）和 exclude（排除）规则
 * 
 * 📦 v2.2 终极版更新：
 * - 修复：语法全部匹配到"不定式"的问题
 * - 修复：plant sth. 匹配到 plan to do 的问题
 * - 新增：核心词匹配检查（短语的第一个词必须匹配）
 * - 新增：中文语法专用匹配逻辑
 * - 新增：词库黑名单（排除会导致误匹配的条目）
 * - 提高：匹配阈值（更严格）
 * - 优化：模板清理逻辑
 */

const { getVocabularyService } = require('./vocabularyService');
const { getGrammarService } = require('./grammarService');
const { getMatchingDictService } = require('./matchingDictService');

// v3.1: 引入替换规则服务
let replaceService = null;
try {
    const { getReplaceService } = require('./replaceService');
    replaceService = getReplaceService();
    console.log('[MatchingService] v3.1: 替换规则服务已加载');
} catch (e) {
    console.warn('[MatchingService] 替换规则服务未找到，跳过替换功能');
}

class MatchingService {
    constructor() {
        this.vocabularyService = getVocabularyService();
        this.grammarService = getGrammarService();
        
        // v3.0: 添加匹配词典服务
        this.matchingDictService = getMatchingDictService();
        
        // v3.1: 添加替换规则服务
        this.replaceService = replaceService;
        
        // v2.2: 提高匹配阈值，更严格
        this.thresholds = {
            word: 0.90,      // 单词：90%（从85%提高）
            phrase: 0.85,    // 短语：85%（从80%提高）
            pattern: 0.85,   // 句型：85%（从80%提高）
            grammar: 0.80    // 语法：80%（从75%提高）
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
            
            console.log(`[MatchingService] v3.1 缓存已刷新`);
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
     * 清理模板文本（v2.2 改进）
     */
    cleanTemplateText(text) {
        let cleaned = text.toLowerCase()
            .replace(/\bsb\.\s*/gi, '')
            .replace(/\bsth\.\s*/gi, '')
            .replace(/\bsb\s+/gi, '')
            .replace(/\bsth\s+/gi, '')
            .replace(/\bdoing\b/gi, 'do')
            .replace(/\bto do\b/gi, '')
            .replace(/\bone's\b/gi, '')
            .replace(/\boneself\b/gi, '')
            .replace(/\.\.\./g, '')
            .replace(/\s+/g, ' ')
            .trim();
        
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
        
        if (inputCore === targetCore) return true;
        
        const distance = this.levenshteinDistance(inputCore, targetCore);
        const maxLen = Math.max(inputCore.length, targetCore.length);
        
        if (maxLen <= 4) {
            return distance === 0;
        }
        
        return distance <= 1;
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

        if (options.isPhraseMatch || options.isPatternMatch) {
            if (!this.coreWordMatches(s1, s2)) {
                this.log(`核心词不匹配: "${s1}" vs "${s2}"`);
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
                if (cleanS2.includes(cleanS1) && cleanS1.length / cleanS2.length >= 0.7) {
                    return 0.90;
                }
                if (cleanS1.includes(cleanS2) && cleanS2.length / cleanS1.length >= 0.7) {
                    return 0.90;
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
     */
    findBestMatch(input, dataSet, textField, options = {}) {
        let bestMatch = null;
        let bestScore = 0;

        const inputVariants = options.isWordMatch ? this.lemmatize(input) : [input.toLowerCase().trim()];
        
        for (const item of dataSet) {
            const target = item[textField];
            if (!target) continue;

            for (const variant of inputVariants) {
                const score = this.calculateSimilarity(variant, target, options);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = item;
                    
                    if (variant !== input.toLowerCase().trim() && score >= 0.98) {
                        this.log(`词形匹配成功: ${input} → ${variant} → ${target}`);
                    }
                }
            }
        }

        return { match: bestMatch, score: bestScore };
    }

    /**
     * v3.1 新增：查询替换规则
     * @param {string} text - 原始文本
     * @param {string} type - 类型 (word/phrase/pattern/grammar)
     * @returns {Object|null} { action: 'replace', replace_text } 或 null
     */
    checkReplaceRule(text, type) {
        if (!this.replaceService) {
            return null;
        }
        
        try {
            const rule = this.replaceService.findRule(text, type);
            
            if (!rule) {
                return null;
            }
            
            this.log(`[替换规则命中] "${text}" → "${rule.replace_text}"`);
            console.log(`[MatchingService] 替换规则命中: "${text}" → "${rule.replace_text}"`);
            
            return {
                action: 'replace',
                replace_text: rule.replace_text,
                rule_id: rule.id
            };
        } catch (e) {
            console.error('[MatchingService] 查询替换规则失败:', e.message);
            return null;
        }
    }

    /**
     * v3.0: 查询匹配词典
     * @param {string} text - 原始文本
     * @param {string} type - 类型 (word/phrase/pattern/grammar)
     * @returns {Object|null} { action, result } 或 null
     */
    checkMatchingDict(text, type) {
        try {
            const rule = this.matchingDictService.findRule(text, type);
            
            if (!rule) {
                return null;
            }
            
            this.log(`[词典命中] ${text} (${type}) → ${rule.action}`);
            
            if (rule.action === 'exclude') {
                return {
                    action: 'exclude',
                    result: {
                        matched: false,
                        excluded: true,
                        score: 0,
                        reason: rule.notes || '已被排除'
                    }
                };
            }
            
            if (rule.action === 'match') {
                return {
                    action: 'match',
                    result: {
                        matched: true,
                        score: 1.0,
                        source_db: rule.target_db ? rule.target_db.replace('.db', '') : 'vocabulary',
                        source_table: rule.target_table,
                        source_id: rule.target_id,
                        matched_text: rule.target_text,
                        fromDict: true
                    }
                };
            }
            
            return null;
        } catch (e) {
            console.error('[MatchingService] 查询词典失败:', e.message);
            return null;
        }
    }

    /**
     * 匹配单词
     * v3.1: 先查替换规则 → 再查词典 → 最后模糊匹配
     */
    matchWord(word) {
        this.checkCache();
        
        // v3.1: 先查替换规则
        const replaceResult = this.checkReplaceRule(word, 'word');
        if (replaceResult && replaceResult.action === 'replace') {
            // 用替换后的文本重新匹配（递归，但替换后的文本不会再触发替换）
            const newResult = this._matchWordInternal(replaceResult.replace_text);
            newResult.replaced = true;
            newResult.original_text = word;
            newResult.replace_text = replaceResult.replace_text;
            return newResult;
        }
        
        return this._matchWordInternal(word);
    }
    
    /**
     * 内部单词匹配（不检查替换规则）
     */
    _matchWordInternal(word) {
        // v3.0: 查匹配词典
        const dictResult = this.checkMatchingDict(word, 'word');
        if (dictResult) {
            if (dictResult.action === 'exclude') {
                return dictResult.result;
            }
            if (dictResult.action === 'match') {
                return dictResult.result;
            }
        }
        
        // 词典没有命中，进行模糊匹配
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
     * v3.1: 先查替换规则 → 再查词典 → 最后模糊匹配
     */
    matchPhrase(phrase) {
        this.checkCache();
        
        // v3.1: 先查替换规则
        const replaceResult = this.checkReplaceRule(phrase, 'phrase');
        if (replaceResult && replaceResult.action === 'replace') {
            const newResult = this._matchPhraseInternal(replaceResult.replace_text);
            newResult.replaced = true;
            newResult.original_text = phrase;
            newResult.replace_text = replaceResult.replace_text;
            return newResult;
        }
        
        return this._matchPhraseInternal(phrase);
    }
    
    /**
     * 内部短语匹配（不检查替换规则）
     */
    _matchPhraseInternal(phrase) {
        // v3.0: 先查匹配词典
        const dictResult = this.checkMatchingDict(phrase, 'phrase');
        if (dictResult) {
            if (dictResult.action === 'exclude') {
                return dictResult.result;
            }
            if (dictResult.action === 'match') {
                return dictResult.result;
            }
        }
        
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
     * v3.1: 先查替换规则 → 再查词典 → 最后模糊匹配
     */
    matchPattern(pattern) {
        this.checkCache();
        
        // v3.1: 先查替换规则
        const replaceResult = this.checkReplaceRule(pattern, 'pattern');
        if (replaceResult && replaceResult.action === 'replace') {
            const newResult = this._matchPatternInternal(replaceResult.replace_text);
            newResult.replaced = true;
            newResult.original_text = pattern;
            newResult.replace_text = replaceResult.replace_text;
            return newResult;
        }
        
        return this._matchPatternInternal(pattern);
    }
    
    /**
     * 内部句型匹配（不检查替换规则）
     */
    _matchPatternInternal(pattern) {
        // v3.0: 先查匹配词典
        const dictResult = this.checkMatchingDict(pattern, 'pattern');
        if (dictResult) {
            if (dictResult.action === 'exclude') {
                return dictResult.result;
            }
            if (dictResult.action === 'match') {
                return dictResult.result;
            }
        }
        
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
     * v3.1: 先查替换规则 → 再查词典 → 最后模糊匹配
     */
    matchGrammar(grammarName) {
        this.checkCache();
        
        // v3.1: 先查替换规则
        const replaceResult = this.checkReplaceRule(grammarName, 'grammar');
        if (replaceResult && replaceResult.action === 'replace') {
            const newResult = this._matchGrammarInternal(replaceResult.replace_text);
            newResult.replaced = true;
            newResult.original_text = grammarName;
            newResult.replace_text = replaceResult.replace_text;
            return newResult;
        }
        
        return this._matchGrammarInternal(grammarName);
    }
    
    /**
     * 内部语法匹配（不检查替换规则）
     */
    _matchGrammarInternal(grammarName) {
        // v3.0: 先查匹配词典
        const dictResult = this.checkMatchingDict(grammarName, 'grammar');
        if (dictResult) {
            if (dictResult.action === 'exclude') {
                return dictResult.result;
            }
            if (dictResult.action === 'match') {
                return dictResult.result;
            }
        }
        
        let bestMatch = null;
        let bestScore = 0;

        for (const item of this.cache.grammar) {
            let score = this.calculateSimilarity(
                grammarName, 
                item.title, 
                { isGrammarMatch: true }
            );
            
            if (item.keywords && Array.isArray(item.keywords)) {
                for (const keyword of item.keywords) {
                    const keywordScore = this.calculateSimilarity(
                        grammarName, 
                        keyword, 
                        { isGrammarMatch: true }
                    );
                    if (keywordScore > score) {
                        score = keywordScore;
                    }
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = item;
            }
        }

        const threshold = this.thresholds.grammar;

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
        return { matched: false, score: bestScore };
    }

    /**
     * 批量匹配
     * v3.1: 支持替换项（replaced 的记录会标记）
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
                
                // v3.1: 记录替换
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
