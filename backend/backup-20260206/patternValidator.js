/**
 * 句型验证器服务 v1.0
 * 文件位置: backend/services/patternValidator.js
 * 
 * 📦 功能说明：
 * - 过滤普通疑问句（what is, who is, where is等）
 * - 验证句型是否具有"特殊性"（特定语法现象、固定搭配等）
 * - 提供详细的验证日志
 * 
 * 📦 v1.0 更新（2026-02-02）：
 * - 新增：黑名单规则（普通疑问句模板）
 * - 新增：白名单特征（特殊句型标识）
 * - 新增：详细调试日志
 * 
 * @author Sorryios AI Team
 * @version 1.0
 * @date 2026-02-02
 */

class PatternValidator {
    constructor() {
        console.log('[PatternValidator] v1.0: 句型验证器初始化');
        
        // ============================================
        // 黑名单：普通疑问句模板（不应识别为句型）
        // ============================================
        this.EXCLUDED_PATTERNS = [
            // ===== 特殊疑问句（纯粹提问，无特殊功能） =====
            
            // what 开头的普通疑问
            /^what\s+(is|are|was|were|am)\b/i,
            /^what\s+(do|does|did)\b/i,
            /^what\s+(can|could|will|would|shall|should|may|might|must)\b/i,
            /^what\s+(has|have|had)\b/i,
            
            // who 开头的普通疑问
            /^who\s+(is|are|was|were|am)\b/i,
            /^who\s+(do|does|did)\b/i,
            /^who\s+(can|could|will|would|shall|should|may|might|must)\b/i,
            /^who\s+(has|have|had)\b/i,
            
            // where 开头的普通疑问
            /^where\s+(is|are|was|were|am)\b/i,
            /^where\s+(do|does|did)\b/i,
            /^where\s+(can|could|will|would|shall|should|may|might|must)\b/i,
            /^where\s+(has|have|had)\b/i,
            
            // when 开头的普通疑问
            /^when\s+(is|are|was|were|am)\b/i,
            /^when\s+(do|does|did)\b/i,
            /^when\s+(can|could|will|would|shall|should|may|might|must)\b/i,
            /^when\s+(has|have|had)\b/i,
            
            // why 开头的普通疑问
            /^why\s+(is|are|was|were|am)\b/i,
            /^why\s+(do|does|did)\b/i,
            /^why\s+(can|could|will|would|shall|should|may|might|must)\b/i,
            
            // how 开头的普通疑问
            /^how\s+(is|are|was|were|am)\b/i,
            /^how\s+(do|does|did)\b/i,
            /^how\s+(can|could|will|would|shall|should|may|might|must)\b/i,
            /^how\s+(old|long|far|many|much|tall|big|small)\b/i,  // how old, how long等
            
            // which 开头的普通疑问
            /^which\s+(is|are|was|were)\b/i,
            /^which\s+(do|does|did)\b/i,
            
            // whose 开头的普通疑问
            /^whose\s+(is|are|was|were)\b/i,
            
            // ===== 一般疑问句（是/否回答） =====
            
            // be动词开头（注意：排除 there be 的疑问形式）
            /^(is|are|am|was|were)\s+(this|that|these|those|it|he|she|you|they|we|i)\b/i,
            
            // 助动词开头
            /^(do|does|did)\s+(you|he|she|it|they|we|i)\b/i,
            
            // 情态动词开头
            /^(can|could|will|would|shall|should|may|might|must)\s+(you|he|she|it|they|we|i)\b/i,
            
            // have/has/had 开头
            /^(have|has|had)\s+(you|he|she|it|they|we|i)\b/i,
            
            // ===== 简单陈述句（主谓宾结构，无特殊性） =====
            
            // 主语 + be + 表语（过于简单）
            /^(i|you|he|she|it|we|they)\s+(am|is|are|was|were)\s+(a|an|the)?\s*\w+\.?$/i,
            
            // 主语 + 动词 + 宾语（过于简单）
            /^(i|you|he|she|it|we|they)\s+(like|love|want|need|have|see)\s+/i,
        ];
        
        // ============================================
        // 白名单：特殊句型特征（应该保留）
        // ============================================
        this.VALID_FEATURES = [
            // 存在句（增加所有be动词变体，包括疑问句形式）
            { keywords: ['there', 'be'], description: 'there be句型' },
            { keywords: ['there', 'is'], description: 'there be句型' },
            { keywords: ['there', 'are'], description: 'there be句型' },
            { keywords: ['there', 'was'], description: 'there be句型' },
            { keywords: ['there', 'were'], description: 'there be句型' },
            { keywords: ['is', 'there'], description: 'there be句型（疑问）' },
            { keywords: ['are', 'there'], description: 'there be句型（疑问）' },
            { keywords: ['was', 'there'], description: 'there be句型（疑问）' },
            { keywords: ['were', 'there'], description: 'there be句型（疑问）' },
            
            // it形式主语/宾语
            { keywords: ['it', 'is', 'adj.'], description: 'it形式主语' },
            { keywords: ['it', 'is', 'adj.', 'to'], description: 'it形式主语' },
            { keywords: ['it', 'is', 'adj.', 'for'], description: 'it形式主语' },
            { keywords: ['it', 'takes'], description: 'it takes句型' },
            { keywords: ['find', 'it', 'adj.'], description: 'it形式宾语' },
            { keywords: ['make', 'it'], description: 'it形式宾语' },
            { keywords: ['think', 'it'], description: 'it形式宾语' },
            
            // 固定搭配
            { keywords: ['so', 'that'], description: 'so...that...句型' },
            { keywords: ['such', 'that'], description: 'such...that...句型' },
            { keywords: ['too', 'to'], description: 'too...to...句型' },
            { keywords: ['not', 'only', 'but', 'also'], description: 'not only...but also...句型' },
            { keywords: ['either', 'or'], description: 'either...or...句型' },
            { keywords: ['neither', 'nor'], description: 'neither...nor...句型' },
            { keywords: ['both', 'and'], description: 'both...and...句型' },
            { keywords: ['as', 'as'], description: 'as...as...句型' },
            { keywords: ['not', 'as', 'as'], description: 'not as...as...句型' },
            { keywords: ['the', 'more', 'the', 'more'], description: 'the more...the more...句型' },
            
            // 使役动词
            { keywords: ['make', 'sb.', 'do'], description: '使役动词句型' },
            { keywords: ['let', 'sb.', 'do'], description: '使役动词句型' },
            { keywords: ['have', 'sb.', 'do'], description: '使役动词句型' },
            { keywords: ['get', 'sb.', 'to'], description: '使役动词句型' },
            
            // 感官动词
            { keywords: ['see', 'sb.', 'do'], description: '感官动词句型' },
            { keywords: ['see', 'sb.', 'doing'], description: '感官动词句型' },
            { keywords: ['hear', 'sb.', 'do'], description: '感官动词句型' },
            { keywords: ['hear', 'sb.', 'doing'], description: '感官动词句型' },
            { keywords: ['watch', 'sb.', 'do'], description: '感官动词句型' },
            { keywords: ['notice', 'sb.', 'do'], description: '感官动词句型' },
            { keywords: ['feel', 'sb.', 'do'], description: '感官动词句型' },
            
            // spend/take/cost句型
            { keywords: ['spend', 'time', 'doing'], description: 'spend句型' },
            { keywords: ['spend', 'money', 'on'], description: 'spend句型' },
            { keywords: ['it', 'takes', 'sb.'], description: 'it takes句型' },
            { keywords: ['sth.', 'cost', 'sb.'], description: 'cost句型' },
            
            // 特殊功能疑问句（建议、提议）
            { keywords: ['why', 'not'], description: 'Why not...?（建议）' },
            { keywords: ['how', 'about'], description: 'How about...?（建议）' },
            { keywords: ['what', 'about'], description: 'What about...?（建议）' },
            { keywords: ['why', "don't"], description: "Why don't you...?（建议）" },
            { keywords: ['would', 'you', 'like'], description: 'Would you like...?（礼貌邀请）' },
            
            // 感叹句
            { keywords: ['what', 'a'], description: 'What a...!（感叹句）' },
            { keywords: ['what', 'an'], description: 'What an...!（感叹句）' },
            { keywords: ['how', 'adj.'], description: 'How adj...!（感叹句）' },
            
            // 祈使句特征
            { keywords: ['let', 'us'], description: "Let's...（祈使句）" },
            { keywords: ["let's"], description: "Let's...（祈使句）" },
            
            // 倒装句特征
            { keywords: ['never', 'have'], description: '否定词倒装' },
            { keywords: ['hardly', 'have'], description: '否定词倒装' },
            { keywords: ['seldom', 'do'], description: '否定词倒装' },
            { keywords: ['not', 'only', 'do'], description: '否定词倒装' },
            { keywords: ['only', 'then'], description: 'only倒装' },
            
            // prefer句型
            { keywords: ['prefer', 'to'], description: 'prefer...to...句型' },
            { keywords: ['would', 'rather', 'than'], description: 'would rather...than...句型' },
            
            // stop/prevent/keep句型
            { keywords: ['stop', 'sb.', 'from'], description: 'stop sb. from doing句型' },
            { keywords: ['prevent', 'sb.', 'from'], description: 'prevent sb. from doing句型' },
            { keywords: ['keep', 'sb.', 'from'], description: 'keep sb. from doing句型' },
            
            // 连接词句型
            { keywords: ['the', 'reason', 'why'], description: 'the reason why...句型' },
            { keywords: ['the', 'way', 'that'], description: 'the way (that)...句型' },
            { keywords: ['the', 'time', 'when'], description: 'the time when...句型' },
            { keywords: ['the', 'place', 'where'], description: 'the place where...句型' },
        ];
        
        console.log(`[PatternValidator] 黑名单规则: ${this.EXCLUDED_PATTERNS.length} 条`);
        console.log(`[PatternValidator] 白名单特征: ${this.VALID_FEATURES.length} 种`);
    }
    
    /**
     * 验证单个句型
     * @param {string} pattern - 待验证的句型
     * @returns {Object} { valid: boolean, reason: string, matchedRule?: string, feature?: object }
     */
    validate(pattern) {
        if (!pattern || typeof pattern !== 'string') {
            return {
                valid: false,
                reason: '无效输入（空值或非字符串）'
            };
        }
        
        const trimmedPattern = pattern.trim();
        const lowerPattern = trimmedPattern.toLowerCase();
        
        // ===== 第1步：检查黑名单 =====
        for (let i = 0; i < this.EXCLUDED_PATTERNS.length; i++) {
            const regex = this.EXCLUDED_PATTERNS[i];
            if (regex.test(trimmedPattern)) {
                return {
                    valid: false,
                    reason: '匹配黑名单规则 - 普通疑问句',
                    matchedRule: regex.toString(),
                    ruleIndex: i
                };
            }
        }
        
        // ===== 第2步：检查白名单特征 =====
        for (const feature of this.VALID_FEATURES) {
            if (this._hasFeature(lowerPattern, feature.keywords)) {
                return {
                    valid: true,
                    reason: `包含特殊结构 - ${feature.description}`,
                    feature: feature
                };
            }
        }
        
        // ===== 第3步：检查是否包含多个占位符（句型模板特征） =====
        const placeholderCount = this._countPlaceholders(trimmedPattern);
        if (placeholderCount >= 2) {
            return {
                valid: true,
                reason: `包含多个占位符（${placeholderCount}个），符合句型模板特征`,
                placeholderCount: placeholderCount
            };
        }
        
        // ===== 第4步：默认通过（保守策略，避免误杀） =====
        // 如果既不在黑名单，也没有明显的特殊特征，但也不是明显的错误，就通过
        return {
            valid: true,
            reason: '无明确黑名单规则，默认通过（请人工审核）',
            needsReview: true
        };
    }
    
    /**
     * 批量验证句型
     * @param {Array<string>} patterns - 待验证的句型数组
     * @returns {Object} { total, valid, excluded, validPatterns, excludedPatterns }
     */
    validateBatch(patterns) {
        if (!Array.isArray(patterns)) {
            console.error('[PatternValidator] validateBatch: 输入不是数组');
            return {
                total: 0,
                valid: [],
                excluded: [],
                validPatterns: [],
                excludedPatterns: []
            };
        }
        
        console.log('\n[PatternValidator] ═══════════════════════════════════════');
        console.log(`[PatternValidator] 开始批量验证句型（共 ${patterns.length} 个）`);
        console.log('[PatternValidator] ═══════════════════════════════════════');
        
        const validPatterns = [];
        const excludedPatterns = [];
        
        patterns.forEach((pattern, index) => {
            const result = this.validate(pattern);
            
            console.log(`\n[PatternValidator] [${index + 1}/${patterns.length}] "${pattern}"`);
            
            if (result.valid) {
                console.log(`[PatternValidator]   ✅ 通过`);
                console.log(`[PatternValidator]   原因: ${result.reason}`);
                if (result.feature) {
                    console.log(`[PatternValidator]   特征: ${result.feature.keywords.join(' ')}`);
                }
                if (result.needsReview) {
                    console.log(`[PatternValidator]   ⚠️  建议人工审核`);
                }
                
                validPatterns.push(pattern);
            } else {
                console.log(`[PatternValidator]   ❌ 不通过`);
                console.log(`[PatternValidator]   原因: ${result.reason}`);
                if (result.matchedRule) {
                    console.log(`[PatternValidator]   规则: ${result.matchedRule}`);
                }
                
                excludedPatterns.push({
                    pattern: pattern,
                    reason: result.reason,
                    matchedRule: result.matchedRule
                });
            }
        });
        
        console.log('\n[PatternValidator] ═══════════════════════════════════════');
        console.log(`[PatternValidator] 验证完成`);
        console.log(`[PatternValidator]   原始句型: ${patterns.length}`);
        console.log(`[PatternValidator]   ✅ 通过: ${validPatterns.length}`);
        console.log(`[PatternValidator]   ❌ 排除: ${excludedPatterns.length}`);
        console.log('[PatternValidator] ═══════════════════════════════════════\n');
        
        return {
            total: patterns.length,
            valid: validPatterns,
            excluded: excludedPatterns,
            validPatterns: validPatterns,      // 别名，兼容
            excludedPatterns: excludedPatterns  // 别名，兼容
        };
    }
    
    /**
     * 检查文本是否包含指定关键词序列
     * @private
     */
    _hasFeature(text, keywords) {
        // 将文本转换为小写并分词
        const lowerText = text.toLowerCase();
        const words = lowerText.split(/\s+/);
        
        // 检查所有关键词是否按顺序出现
        let lastIndex = -1;
        for (const keyword of keywords) {
            const keywordLower = keyword.toLowerCase();
            
            // 在剩余的词中查找
            let found = false;
            for (let i = lastIndex + 1; i < words.length; i++) {
                const word = words[i];
                
                // 精确匹配
                if (word === keywordLower) {
                    lastIndex = i;
                    found = true;
                    break;
                }
                
                // 处理占位符的特殊情况（带点号和不带点号）
                // 例如：adj. 匹配 adj, 或 adj 匹配 adj.
                if ((keywordLower.endsWith('.') && word === keywordLower.slice(0, -1)) ||
                    (word.endsWith('.') && word.slice(0, -1) === keywordLower)) {
                    lastIndex = i;
                    found = true;
                    break;
                }
                
                // 处理特殊情况：关键词是"sb"或"sth"等占位符，可能文本中有"sb."
                const placeholder = ['sb', 'sth', 'adj', 'adv', 'oneself', "one's"];
                if (placeholder.some(p => keywordLower.startsWith(p) || word.startsWith(p))) {
                    const keyBase = keywordLower.replace(/\.$/, '');
                    const wordBase = word.replace(/\.$/, '');
                    if (keyBase === wordBase) {
                        lastIndex = i;
                        found = true;
                        break;
                    }
                }
            }
            
            // 如果某个关键词没找到，返回false
            if (!found) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * 统计占位符数量
     * @private
     */
    _countPlaceholders(text) {
        const placeholders = [
            /\bsb\.?\b/gi,           // sb. 或 sb
            /\bsth\.?\b/gi,          // sth. 或 sth
            /\badj\.?\b/gi,          // adj. 或 adj
            /\badv\.?\b/gi,          // adv. 或 adv
            /\bn\.?\b/gi,            // n. 或 n
            /\bv\.?\b/gi,            // v. 或 v
            /\bdoing\s+sth\.?\b/gi,  // doing sth. 或 doing sth
            /\bdo\s+sth\.?\b/gi,     // do sth. 或 do sth
            /\bto\s+do\s+sth\.?\b/gi,// to do sth. 或 to do sth
            /\bone's\b/gi,           // one's
            /\boneself\b/gi,         // oneself
            /\.{3}/g,                // ...
        ];
        
        let count = 0;
        const matched = new Set();
        
        for (const regex of placeholders) {
            const matches = text.match(regex);
            if (matches) {
                // 避免重复计数（同一占位符只算一次）
                matches.forEach(m => {
                    const normalized = m.toLowerCase().trim();
                    if (!matched.has(normalized)) {
                        matched.add(normalized);
                        count++;
                    }
                });
            }
        }
        
        return count;
    }
    
    /**
     * 获取统计信息
     */
    getStats() {
        return {
            blacklistRules: this.EXCLUDED_PATTERNS.length,
            whitelistFeatures: this.VALID_FEATURES.length,
            version: '1.0'
        };
    }
}

// ============================================
// 单例模式
// ============================================

let instance = null;

function getPatternValidator() {
    if (!instance) {
        instance = new PatternValidator();
    }
    return instance;
}

module.exports = {
    PatternValidator,
    getPatternValidator
};
