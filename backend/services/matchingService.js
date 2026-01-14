/**
 * 匹配算法服务
 * 提供 85% 相似度匹配功能
 * 
 * 匹配策略：
 * 1. 精确匹配 (100%)
 * 2. 包含匹配 (85-99%)
 * 3. 编辑距离相似度 (Levenshtein)
 * 4. 关键词匹配
 */

const { getVocabularyService } = require('./vocabularyService');
const { getGrammarService } = require('./grammarService');

class MatchingService {
    constructor() {
        this.vocabularyService = getVocabularyService();
        this.grammarService = getGrammarService();
        this.minMatchScore = 0.85; // 最低匹配度阈值
        
        // 缓存词库数据
        this.cache = {
            words: null,
            phrases: null,
            patterns: null,
            grammar: null,
            lastUpdate: null
        };
        
        this.refreshCache();
    }

    /**
     * 刷新缓存
     */
    refreshCache() {
        try {
            this.cache.words = this.vocabularyService.getAllWords(true);
            this.cache.phrases = this.vocabularyService.getAllPhrases(true);
            this.cache.patterns = this.vocabularyService.getAllPatterns(true);
            this.cache.grammar = this.grammarService.getAll(true);
            this.cache.lastUpdate = Date.now();
            console.log('[MatchingService] 缓存已刷新');
        } catch (e) {
            console.error('[MatchingService] 刷新缓存失败:', e.message);
        }
    }

    /**
     * 检查缓存是否需要刷新（5分钟）
     */
    checkCache() {
        if (!this.cache.lastUpdate || Date.now() - this.cache.lastUpdate > 5 * 60 * 1000) {
            this.refreshCache();
        }
    }

    /**
     * 计算 Levenshtein 编辑距离
     */
    levenshteinDistance(str1, str2) {
        const m = str1.length;
        const n = str2.length;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (str1[i - 1].toLowerCase() === str2[j - 1].toLowerCase()) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
                }
            }
        }
        return dp[m][n];
    }

    /**
     * 计算相似度分数 (0-1)
     */
    calculateSimilarity(input, target) {
        const s1 = input.toLowerCase().trim();
        const s2 = target.toLowerCase().trim();

        // 1. 完全匹配
        if (s1 === s2) {
            return 1.0;
        }

        // 2. 包含匹配
        // 例如: "look forward to" vs "look forward to doing sth."
        if (s2.includes(s1)) {
            const ratio = s1.length / s2.length;
            // 输入是目标的子串，根据长度比例给分
            return Math.max(0.85, ratio * 0.95 + 0.05);
        }
        if (s1.includes(s2)) {
            const ratio = s2.length / s1.length;
            return Math.max(0.85, ratio * 0.95 + 0.05);
        }

        // 3. 去除模板占位符后匹配
        // 例如: "look forward to" vs "look forward to doing sth."
        const cleanS2 = s2
            .replace(/\bsb\.\s*/gi, '')
            .replace(/\bsth\.\s*/gi, '')
            .replace(/\bdoing\s*/gi, '')
            .replace(/\bto do\s*/gi, '')
            .replace(/\bone's\s*/gi, '')
            .replace(/\boneself\s*/gi, '')
            .replace(/\.\.\./g, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (s1 === cleanS2 || cleanS2.includes(s1) || s1.includes(cleanS2)) {
            return 0.92; // 模板匹配给较高分
        }

        // 4. 编辑距离相似度
        const distance = this.levenshteinDistance(s1, s2);
        const maxLen = Math.max(s1.length, s2.length);
        const similarity = 1 - distance / maxLen;

        return similarity;
    }

    /**
     * 在指定数据集中查找最佳匹配
     */
    findBestMatch(input, dataSet, textField) {
        let bestMatch = null;
        let bestScore = 0;

        for (const item of dataSet) {
            const target = item[textField];
            if (!target) continue;

            const score = this.calculateSimilarity(input, target);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = item;
            }
        }

        return { match: bestMatch, score: bestScore };
    }

    /**
     * 匹配单词
     */
    matchWord(word) {
        this.checkCache();
        const { match, score } = this.findBestMatch(word, this.cache.words, 'word');
        
        if (score >= this.minMatchScore && match) {
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
     */
    matchPhrase(phrase) {
        this.checkCache();
        const { match, score } = this.findBestMatch(phrase, this.cache.phrases, 'phrase');
        
        if (score >= this.minMatchScore && match) {
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
     */
    matchPattern(pattern) {
        this.checkCache();
        const { match, score } = this.findBestMatch(pattern, this.cache.patterns, 'pattern');
        
        if (score >= this.minMatchScore && match) {
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
     */
    matchGrammar(grammarName) {
        this.checkCache();
        
        // 语法匹配：标题或关键词
        let bestMatch = null;
        let bestScore = 0;

        for (const item of this.cache.grammar) {
            // 匹配标题
            let score = this.calculateSimilarity(grammarName, item.title);
            
            // 也尝试匹配关键词
            if (item.keywords && Array.isArray(item.keywords)) {
                for (const keyword of item.keywords) {
                    const keywordScore = this.calculateSimilarity(grammarName, keyword);
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

        if (bestScore >= this.minMatchScore && bestMatch) {
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
     * @param {Object} extractedData - AI 提取的数据 { words: [], phrases: [], patterns: [], grammar: [] }
     * @returns {Object} - { matched: [], unmatched: [] }
     */
    batchMatch(extractedData) {
        const result = {
            matched: [],
            unmatched: []
        };

        // 匹配单词
        if (extractedData.words && Array.isArray(extractedData.words)) {
            for (const word of extractedData.words) {
                const matchResult = this.matchWord(word);
                if (matchResult.matched) {
                    result.matched.push({
                        item_type: 'word',
                        original_text: word,
                        ...matchResult
                    });
                } else {
                    result.unmatched.push({
                        item_type: 'word',
                        original_text: word,
                        best_score: matchResult.score
                    });
                }
            }
        }

        // 匹配短语
        if (extractedData.phrases && Array.isArray(extractedData.phrases)) {
            for (const phrase of extractedData.phrases) {
                const matchResult = this.matchPhrase(phrase);
                if (matchResult.matched) {
                    result.matched.push({
                        item_type: 'phrase',
                        original_text: phrase,
                        ...matchResult
                    });
                } else {
                    result.unmatched.push({
                        item_type: 'phrase',
                        original_text: phrase,
                        best_score: matchResult.score
                    });
                }
            }
        }

        // 匹配句型
        if (extractedData.patterns && Array.isArray(extractedData.patterns)) {
            for (const pattern of extractedData.patterns) {
                const matchResult = this.matchPattern(pattern);
                if (matchResult.matched) {
                    result.matched.push({
                        item_type: 'pattern',
                        original_text: pattern,
                        ...matchResult
                    });
                } else {
                    result.unmatched.push({
                        item_type: 'pattern',
                        original_text: pattern,
                        best_score: matchResult.score
                    });
                }
            }
        }

        // 匹配语法
        if (extractedData.grammar && Array.isArray(extractedData.grammar)) {
            for (const grammar of extractedData.grammar) {
                const matchResult = this.matchGrammar(grammar);
                if (matchResult.matched) {
                    result.matched.push({
                        item_type: 'grammar',
                        original_text: grammar,
                        ...matchResult
                    });
                } else {
                    result.unmatched.push({
                        item_type: 'grammar',
                        original_text: grammar,
                        best_score: matchResult.score
                    });
                }
            }
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
