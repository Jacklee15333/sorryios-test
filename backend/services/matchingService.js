/**
 * 匹配算法服务 v4.5.2 (修复版)
 * 文件位置: backend/services/matchingService.js
 * 
 * 📦 v4.5.2 更新（修复版）：
 * - 修复：语法匹配增加 keywords 字段检查（精确+模糊）
 * - 修复：短语/句型匹配增加归一化处理，忽略可选括号
 * - 优化：提高匹配准确率，减少误报到AI生成模块
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
        console.log('[MatchingService] v4.3.0: 替换库服务已加载（已合并排除库）');
        
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
        this.verboseLog = true;
        
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
            '动词形态', '动词过去式', '过去分词', '不规则动词',
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
        
        this.refreshCache();
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
        normalized = normalized.replace(/\.+$/, '');
        
        return normalized;
    }
    
    /**
     * v4.5.2: 检查语法的keywords数组是否包含目标文本
     * @param {Array} keywords - 关键词数组
     * @param {string} targetText - 目标文本（已小写）
     * @returns {boolean} 是否匹配
     */
    _matchInKeywords(keywords, targetText) {
        if (!keywords || !Array.isArray(keywords)) return false;
        
        const normalized = targetText.toLowerCase().trim();
        
        for (const keyword of keywords) {
            if (!keyword) continue;
            
            const keywordLower = keyword.toLowerCase().trim();
            
            // 精确匹配
            if (keywordLower === normalized) {
                return true;
            }
            
            // 包含匹配（关键词包含在目标文本中，或目标文本包含在关键词中）
            if (keywordLower.includes(normalized) || normalized.includes(keywordLower)) {
                return true;
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
            
            console.log(`[MatchingService] 缓存已刷新: ${this.cache.words.length} 单词, ${this.cache.phrases.length} 短语, ${this.cache.patterns.length} 句型, ${this.cache.grammar.length} 语法`);
            if (filteredWords > 0 || filteredPhrases > 0) {
                console.log(`[MatchingService] 已过滤黑名单: ${filteredWords} 单词, ${filteredPhrases} 短语`);
            }
        } catch (e) {
            console.error('[MatchingService] 刷新缓存失败:', e.message);
        }
    }

    /**
     * 检查缓存是否需要刷新（10分钟）
     */
    checkCache() {
        if (!this.cache.lastUpdate || Date.now() - this.cache.lastUpdate > 10 * 60 * 1000) {
            this.refreshCache();
        }
    }

    /**
     * 调试日志输出
     */
    log(message) {
        if (this.debug) {
            console.log(`[MatchingService] ${message}`);
        }
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
            
            // v4.3.0 优化：核心术语匹配成功，给一个更高的基础分
            // 基础分 = 0.78 + (共同术语长度占比) * 0.18
            // 这样 5 字术语通常能达到 85%+
            const termRatio = longestCommon.length / Math.max(s1.length, s2.length);
            let baseScore = 0.78 + termRatio * 0.18;
            
            // 如果核心术语本身较长（>=4字），额外加分
            if (longestCommon.length >= 4) {
                baseScore += 0.03;
            }
            if (longestCommon.length >= 6) {
                baseScore += 0.02;
            }
            
            // v4.3.0: 短术语（2-3字）如果是独立的语法概念，也给一定加分
            // 因为短术语占总长度的比例较低，需要补偿
            if (longestCommon.length >= 2 && longestCommon.length <= 3) {
                // 短术语加分：确保能达到85%左右
                baseScore += 0.06;
            }
            
            // 如果有多个共同术语，额外加分
            if (commonTerms.length > 1) {
                baseScore += 0.03 * (commonTerms.length - 1);
            }
            
            baseScore = Math.min(baseScore, 0.96);
            
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
        const s1 = input.toLowerCase().trim();
        const s2 = target.toLowerCase().trim();
        
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
    findBestMatch(input, dataSet, textField, options = {}) {
        let bestMatch = null;
        let bestScore = 0;

        const normalizedInput = input.toLowerCase().trim();
        const inputVariants = options.isWordMatch ? this.lemmatize(input) : [normalizedInput];
        
        for (const item of dataSet) {
            const target = item[textField];
            if (!target) continue;
            
            const normalizedTarget = target.toLowerCase().trim();
            
            if (normalizedInput === normalizedTarget) {
                console.log(`[findBestMatch] 精确匹配: "${input}" === "${target}" → 100%`);
                return { match: item, score: 1.0 };
            }

            for (const variant of inputVariants) {
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
        
        if (bestMatch && bestScore >= 0.85) {
            const targetText = bestMatch[textField];
            console.log(`[findBestMatch] 模糊匹配: "${input}" ≈ "${targetText}" → ${(bestScore * 100).toFixed(1)}%`);
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
        this.checkCache();
        
        const normalizedWord = word.toLowerCase().trim();
        const wordVariants = this.lemmatize(word);
        
        const exactRule = this.matchingDictService.findRule(word, 'word');
        if (exactRule) {
            if (!exactRule.target_text || exactRule.target_text.trim() === '') {
                return { excluded: true, reason: exactRule.notes || '已标记为排除' };
            }
            return this._processAndApplyReplaceRule(exactRule, word, 'word', false);
        }
        
        for (const item of this.cache.words) {
            if (!item.word) continue;
            const normalizedTarget = item.word.toLowerCase().trim();
            
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
     * v4.5.2: 增加短语归一化处理
     */
    matchPhrase(phrase) {
        this.checkCache();
        
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
        for (const item of this.cache.phrases) {
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
    _findReplaceRuleFuzzyOnly(text, type) {
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
     */
    _containsTemplatePlaceholder(text) {
        if (!text) return false;
        
        const lowerText = text.toLowerCase();
        
        const placeholders = [
            'doing sth', 'do sth', 'done sth',
            'sb.', 'sth.',
            "one's", 'oneself',
            'adj.', 'adv.',
            '...'
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
     * v4.5.2: 增加句型归一化处理
     */
    matchPattern(pattern) {
        this.checkCache();
        
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
        for (const item of this.cache.patterns) {
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
     * v4.5.2: 增加keywords字段检查
     */
    matchGrammar(grammarText) {
        this.checkCache();
        
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
        for (const item of this.cache.grammar) {
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
     * v4.5.2: 增加keywords字段的模糊匹配
     */
    _matchGrammarInternal(grammarText) {
        let bestMatch = null;
        let bestScore = 0;
        let bestReason = '';
        let bestSource = '';
        const candidates = [];
        
        const normalizedInput = grammarText.toLowerCase().trim();
        
        this.verboseOutput(`  正在与 ${this.cache.grammar.length} 条语法规则比较...`, 'debug');
        
        for (const item of this.cache.grammar) {
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
            
            // ===== 检查keywords数组（新增）=====
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