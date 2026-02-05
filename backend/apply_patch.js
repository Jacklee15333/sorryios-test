/**
 * 自动化补丁脚本 - matchingService.js v5.2.0
 * 文件：apply_patch.js
 * 运行方式：node apply_patch.js
 * 
 * 功能：自动在 matchingService.js 中添加关键词匹配功能
 */

const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
    originalFile: path.join(__dirname, 'services/matchingService.js'),
    backupFile: path.join(__dirname, 'services/matchingService.js.backup_v5.1.0'),
    outputFile: path.join(__dirname, 'services/matchingService.js')
};

console.log('═'.repeat(80));
console.log('🔧 matchingService.js 自动化补丁工具 v5.2.0');
console.log('═'.repeat(80));

// 第1步：备份原文件
console.log('\n[1/6] 备份原文件...');
try {
    fs.copyFileSync(CONFIG.originalFile, CONFIG.backupFile);
    console.log(`✅ 备份成功: ${CONFIG.backupFile}`);
} catch (err) {
    console.error(`❌ 备份失败:`, err.message);
    process.exit(1);
}

// 第2步：读取原文件
console.log('\n[2/6] 读取原文件...');
let content;
try {
    content = fs.readFileSync(CONFIG.originalFile, 'utf8');
    const lines = content.split('\n').length;
    console.log(`✅ 读取成功: ${lines} 行`);
} catch (err) {
    console.error(`❌ 读取失败:`, err.message);
    process.exit(1);
}

// 第3步：修改版本号
console.log('\n[3/6] 修改版本号...');
const oldVersion = "console.log('[MatchingService] v5.1.0: 修复匹配分数BUG + 区分精确/模糊匹配 + 详细调试日志');";
const newVersion = "console.log('[MatchingService] v5.2.0: 关键词匹配优化 + 严格模式 + 过滤错误匹配');";

if (content.includes(oldVersion)) {
    content = content.replace(oldVersion, newVersion);
    console.log('✅ 版本号已更新: v5.1.0 → v5.2.0');
} else {
    console.log('⚠️  未找到版本号标记，跳过');
}

// 第4步：添加新方法 _extractKeywords
console.log('\n[4/6] 添加新方法 _extractKeywords...');
const extractKeywordsMethod = `
    /**
     * v5.2.0 新增：提取关键词（严格模式 - 保留重要介词）
     * @param {string} text - 输入文本
     * @returns {Array<string>} 关键词数组
     */
    _extractKeywords(text) {
        if (!text || typeof text !== 'string') {
            return [];
        }
        
        // 第1步：移除占位符（但保留结构）
        let cleaned = text.replace(/\\b(sb\\.?|sth\\.?|doing sth\\.?|to do sth\\.?|one's|oneself)\\b/gi, '');
        
        // 第2步：提取所有单词
        const words = cleaned.toLowerCase().match(/\\b[a-z]+\\b/g) || [];
        
        // 第3步：只过滤真正无意义的虚词
        const stopWords = new Set([
            // 冠词（无实际意义）
            'a', 'an', 'the',
            // 系动词（纯连接作用）
            'is', 'are', 'was', 'were', 'be', 'been', 'being',
            // 少数连词和介词
            'and', 'or', 'but', 'of', 'as'
        ]);
        
        // 保留的重要介词（对短语结构很重要）：
        // in, on, at, to, for, with, by, from, about, into, onto, 
        // up, down, out, off, over, under, through, after, before
        
        return words.filter(w => !stopWords.has(w) && w.length > 2);
    }
`;

// 查找插入位置（在 _normalizeForMatching 方法之后）
const insertMarker = '_normalizeForMatching(text) {';
const insertPos = content.indexOf(insertMarker);

if (insertPos !== -1) {
    // 找到方法结束位置（下一个方法开始或类结束）
    const afterMethod = content.indexOf('\n    /**', insertPos + 100);
    if (afterMethod !== -1) {
        content = content.slice(0, afterMethod) + extractKeywordsMethod + content.slice(afterMethod);
        console.log('✅ _extractKeywords 方法已添加');
    } else {
        console.log('⚠️  未找到插入位置，跳过');
    }
} else {
    console.log('⚠️  未找到 _normalizeForMatching 方法，跳过');
}

// 第5步：添加新方法 _findByKeywordMatch
console.log('\n[5/6] 添加新方法 _findByKeywordMatch...');
const findByKeywordMatchMethod = `
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
                console.log(\`    [关键词匹配] "\${input}" 无有效关键词，跳过\`);
            }
            return null;
        }
        
        if (this.verboseLog) {
            console.log(\`    [关键词匹配] 开始匹配 "\${input}"\`);
            console.log(\`      原文关键词: [\${inputKeywords.join(', ')}]\`);
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
            
            // 完全相同 = 100%，子集 = 按比例计算（最低85%）
            const score = coverage === 1.0 ? 1.0 : Math.max(0.85, coverage);
            
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
            console.log(\`      ✓ 关键词匹配成功: "\${bestTargetText}"\`);
            console.log(\`        目标关键词: [\${bestTargetKeywords.join(', ')}]\`);
            console.log(\`        首词检查: \${inputKeywords[0]} = \${bestTargetKeywords[0]} ✓\`);
            console.log(\`        全包含检查: ✓\`);
            console.log(\`        匹配得分: \${(bestScore * 100).toFixed(0)}%\`);
            
            return {
                match: bestMatch,
                score: bestScore,
                matchedVia: 'keyword'
            };
        }
        
        if (this.verboseLog) {
            console.log(\`      ✗ 关键词未找到匹配\`);
        }
        return null;
    }
`;

// 在 _extractKeywords 之后添加
const extractMarker = '// 保留的重要介词';
const extractPos = content.indexOf(extractMarker);

if (extractPos !== -1) {
    const afterExtract = content.indexOf('\n    /**', extractPos + 100);
    if (afterExtract !== -1) {
        content = content.slice(0, afterExtract) + findByKeywordMatchMethod + content.slice(afterExtract);
        console.log('✅ _findByKeywordMatch 方法已添加');
    } else {
        console.log('⚠️  未找到插入位置，跳过');
    }
} else {
    console.log('⚠️  未找到 _extractKeywords 方法，跳过');
}

// 第6步：修改现有方法
console.log('\n[6/6] 修改现有方法...');

// 6.1 修改 _matchWordInternal
const wordMarker1 = '        // 模糊匹配（原有逻辑）\n        const result = this.findBestMatch(word, allWords,';
const wordInsert = `        // v5.2.0 新增：关键词匹配（仅对复合词有效）
        if (word.includes(' ') || word.includes('-')) {
            const keywordMatch = this._findByKeywordMatch(word, 'word', allWords);
            if (keywordMatch && keywordMatch.score >= this.thresholds.word) {
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

        `;

if (content.includes(wordMarker1)) {
    content = content.replace(wordMarker1, wordInsert + wordMarker1);
    console.log('✅ _matchWordInternal 已修改');
} else {
    console.log('⚠️  _matchWordInternal 未找到标记，跳过');
}

// 6.2 修改 _matchPhraseInternal
const phraseMarker1 = '        // 模糊匹配（原有逻辑）\n        const result = this.findBestMatch(phrase, allPhrases,';
const phraseInsert = `        // v5.2.0 新增：关键词匹配（优先于模糊匹配）
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

        `;

if (content.includes(phraseMarker1)) {
    content = content.replace(phraseMarker1, phraseInsert + phraseMarker1);
    console.log('✅ _matchPhraseInternal 已修改');
} else {
    console.log('⚠️  _matchPhraseInternal 未找到标记，跳过');
}

// 6.3 修改 _matchPatternInternal (2处)
const patternMarker1 = '        // 如果patterns表为空，尝试在phrases表中查找';
const patternInsert1 = `        // v5.2.0 新增：关键词匹配（优先于模糊匹配）
        const keywordMatch = this._findByKeywordMatch(pattern, 'pattern', allPatterns);
        if (keywordMatch && keywordMatch.score >= this.thresholds.pattern) {
            return {
                matched: true,
                score: keywordMatch.score,
                source_db: 'vocabulary',
                source_table: 'patterns',
                source_id: keywordMatch.match.id,
                matched_text: keywordMatch.match.pattern,
                matched_data: keywordMatch.match,
                matchedVia: 'keyword'
            };
        }

        `;

if (content.includes(patternMarker1)) {
    content = content.replace(patternMarker1, patternInsert1 + patternMarker1);
    console.log('✅ _matchPatternInternal 已修改（第1处）');
} else {
    console.log('⚠️  _matchPatternInternal 第1处未找到标记，跳过');
}

// 第2处
const patternMarker2 = '            console.log(`[matchPattern] patterns表为空，尝试在phrases表中查找`);\n            const allPhrases = this.vocabularyService.getAllPhrases?.() || [];\n\n            const result = this.findBestMatch(pattern, allPhrases,';
const patternInsert2 = `            console.log(\`[matchPattern] patterns表为空，尝试在phrases表中查找\`);
            const allPhrases = this.vocabularyService.getAllPhrases?.() || [];

            // v5.2.0 新增：先尝试关键词匹配
            const phraseKeywordMatch = this._findByKeywordMatch(pattern, 'phrase', allPhrases);
            if (phraseKeywordMatch && phraseKeywordMatch.score >= this.thresholds.pattern) {
                return {
                    matched: true,
                    score: phraseKeywordMatch.score,
                    source_db: 'vocabulary',
                    source_table: 'phrases',
                    source_id: phraseKeywordMatch.match.id,
                    matched_text: phraseKeywordMatch.match.phrase,
                    matched_data: phraseKeywordMatch.match,
                    matchedVia: 'keyword'
                };
            }

            const result = this.findBestMatch(pattern, allPhrases,`;

if (content.includes(patternMarker2)) {
    content = content.replace(patternMarker2, patternInsert2);
    console.log('✅ _matchPatternInternal 已修改（第2处）');
} else {
    console.log('⚠️  _matchPatternInternal 第2处未找到标记，跳过');
}

// 写入文件
console.log('\n[完成] 写入修改后的文件...');
try {
    fs.writeFileSync(CONFIG.outputFile, content, 'utf8');
    console.log(`✅ 文件已更新: ${CONFIG.outputFile}`);
} catch (err) {
    console.error(`❌ 写入失败:`, err.message);
    process.exit(1);
}

console.log('\n' + '═'.repeat(80));
console.log('🎉 补丁应用成功！');
console.log('═'.repeat(80));
console.log('\n📋 下一步：');
console.log('1. 重启服务: docker-compose restart backend');
console.log('2. 运行测试: node tests/test_keyword_matching_100.js');
console.log('3. 如有问题，恢复备份: cp matchingService.js.backup_v5.1.0 matchingService.js');
console.log('\n');
