/**
 * 后处理器 (PostProcessor)
 * 
 * 整合处理流程：
 * 1. 接收 AI 简化提取的结果
 * 2. 在词库/语法库中进行 85% 匹配
 * 3. 未匹配的发给 AI 补充生成
 * 4. 合并生成最终报告
 * 5. 记录日志到 processing_logs.db
 */

const { getMatchingService } = require('./matchingService');
const { getProcessingLogService } = require('./processingLogService');

class PostProcessor {
    constructor() {
        this.matchingService = getMatchingService();
        this.logService = getProcessingLogService();
    }

    /**
     * 第一阶段：AI 简化提取的 prompt
     * 只提取关键词，不生成详细内容
     */
    getExtractionPrompt() {
        return `直接输出JSON，第一个字符是{，最后一个字符是}
禁止：开头语、结尾语、\`\`\`代码块、任何解释

你是英语教学助手，从课堂内容中提取关键词汇和语法点。
只需要提取名称/关键词，不需要生成含义、例句等详细内容。

【提取规则】
1. words: 提取出现的重点单词（单个词）
2. phrases: 提取固定短语搭配（多个词组成的习惯用法）
3. patterns: 提取句型结构（带省略号或占位符的句子模板）
4. grammar: 提取语法点名称（时态、语态、从句等）

【输出格式】
{
  "words": ["单词1", "单词2", ...],
  "phrases": ["短语1", "短语2", ...],
  "patterns": ["句型1", "句型2", ...],
  "grammar": ["语法点1", "语法点2", ...]
}

【示例输出】
{
  "words": ["environment", "protect", "pollution", "recycle"],
  "phrases": ["look forward to", "be good at", "take care of"],
  "patterns": ["so...that...", "it is...to do..."],
  "grammar": ["现在完成时", "被动语态", "宾语从句"]
}`;
    }

    /**
     * 第三阶段：AI 补充生成的 prompt
     * 为未匹配的项生成详细内容
     */
    getSupplementPrompt(unmatchedItems) {
        const itemsByType = {
            words: unmatchedItems.filter(i => i.item_type === 'word').map(i => i.original_text),
            phrases: unmatchedItems.filter(i => i.item_type === 'phrase').map(i => i.original_text),
            patterns: unmatchedItems.filter(i => i.item_type === 'pattern').map(i => i.original_text),
            grammar: unmatchedItems.filter(i => i.item_type === 'grammar').map(i => i.original_text)
        };

        return `直接输出JSON，第一个字符是{，最后一个字符是}
禁止：开头语、结尾语、\`\`\`代码块

请为以下词汇/语法生成详细内容：

【需要补充的内容】
单词: ${JSON.stringify(itemsByType.words)}
短语: ${JSON.stringify(itemsByType.phrases)}
句型: ${JSON.stringify(itemsByType.patterns)}
语法: ${JSON.stringify(itemsByType.grammar)}

【输出格式】
{
  "words": {
    "单词名": {
      "phonetic": "音标",
      "pos": "词性",
      "meaning": "含义",
      "example": "例句"
    }
  },
  "phrases": {
    "短语名": {
      "meaning": "含义",
      "example": "例句",
      "usage": "用法说明"
    }
  },
  "patterns": {
    "句型名": {
      "meaning": "含义",
      "example": "例句",
      "structure": "结构说明"
    }
  },
  "grammar": {
    "语法名": {
      "definition": "定义",
      "structure": "结构",
      "usage": ["用法1", "用法2"],
      "examples": ["例句1", "例句2"],
      "mistakes": ["易错点1"]
    }
  }
}`;
    }

    /**
     * 处理 AI 提取结果
     * @param {Object} extractedData - AI 第一阶段提取的数据
     * @param {Object} taskInfo - 任务信息 { task_id, user_id, username, file_name }
     * @returns {Object} - 处理结果
     */
    async process(extractedData, taskInfo) {
        const taskId = taskInfo.task_id;

        // 1. 创建任务记录
        this.logService.createTask({
            task_id: taskId,
            user_id: taskInfo.user_id,
            username: taskInfo.username,
            file_name: taskInfo.file_name
        });

        // 2. 批量匹配
        const matchResult = this.matchingService.batchMatch(extractedData);
        const stats = this.matchingService.getMatchStats(matchResult);

        console.log(`[PostProcessor] 任务 ${taskId} 匹配结果:`, stats);

        // 3. 记录匹配项到日志
        if (matchResult.matched.length > 0) {
            const matchedItems = matchResult.matched.map(m => ({
                task_id: taskId,
                item_type: m.item_type,
                original_text: m.original_text,
                matched_text: m.matched_text,
                match_score: m.score,
                source_db: m.source_db,
                source_table: m.source_table,
                source_id: m.source_id,
                matched_data: m.matched_data
            }));
            this.logService.addMatchedItems(matchedItems);
        }

        // 4. 返回处理结果（用于后续 AI 补充）
        return {
            taskId,
            matched: matchResult.matched,
            unmatched: matchResult.unmatched,
            stats,
            needsSupplement: matchResult.unmatched.length > 0
        };
    }

    /**
     * 处理 AI 补充生成的结果
     * @param {string} taskId - 任务ID
     * @param {Array} unmatchedItems - 未匹配项列表
     * @param {Object} aiSupplementData - AI 补充生成的数据
     */
    processSupplementData(taskId, unmatchedItems, aiSupplementData) {
        const unmatchedRecords = [];

        // 🔧 B4修复：构建小写key映射，解决AI返回大小写与original_text不一致的问题
        const buildLowerKeyMap = (obj) => {
            if (!obj || typeof obj !== 'object') return {};
            const map = {};
            for (const key of Object.keys(obj)) {
                map[key.toLowerCase().trim()] = obj[key];
            }
            return map;
        };

        const aiWordsLower = buildLowerKeyMap(aiSupplementData.words);
        const aiPhrasesLower = buildLowerKeyMap(aiSupplementData.phrases);
        const aiPatternsLower = buildLowerKeyMap(aiSupplementData.patterns);
        const aiGrammarLower = buildLowerKeyMap(aiSupplementData.grammar);

        for (const item of unmatchedItems) {
            let aiGenerated = null;
            const lookupKey = (item.original_text || '').toLowerCase().trim();

            // 🔧 B4修复：使用小写key查找
            if (item.item_type === 'word') {
                aiGenerated = aiWordsLower[lookupKey] || null;
            } else if (item.item_type === 'phrase') {
                aiGenerated = aiPhrasesLower[lookupKey] || null;
            } else if (item.item_type === 'pattern') {
                aiGenerated = aiPatternsLower[lookupKey] || null;
            } else if (item.item_type === 'grammar') {
                aiGenerated = aiGrammarLower[lookupKey] || null;
            }

            if (!aiGenerated) {
                console.log(`[PostProcessor] ⚠️ B4: AI补充未命中 "${item.original_text}" (type=${item.item_type})`);
            }

            unmatchedRecords.push({
                task_id: taskId,
                item_type: item.item_type,
                original_text: item.original_text,
                ai_generated: aiGenerated || { error: '未生成' }
            });
        }

        // 记录到日志
        if (unmatchedRecords.length > 0) {
            this.logService.addUnmatchedItems(unmatchedRecords);
        }

        return unmatchedRecords;
    }

    /**
     * 更新任务统计并标记完成
     */
    finalizeTask(taskId, stats) {
        this.logService.updateTaskStats(taskId, {
            total: stats.total,
            exactMatch: stats.exactMatch,
            fuzzyMatch: stats.fuzzyMatch,
            unmatched: stats.unmatched,
            status: 'completed'
        });
    }

    /**
     * 生成最终报告数据
     * 合并匹配到的数据和 AI 生成的数据
     * 🔧 B5修复：添加防御性去重
     */
    generateFinalReport(matched, unmatchedWithAI) {
        const report = {
            vocabulary: {
                words: [],
                phrases: [],
                patterns: []
            },
            grammar: []
        };

        // 🔧 B5修复：Set去重
        const seen = { words: new Set(), phrases: new Set(), patterns: new Set(), grammar: new Set() };
        let dupCount = 0;

        const isDup = (type, text) => {
            if (!text) return true;
            const key = String(text).toLowerCase().trim();
            if (seen[type].has(key)) { dupCount++; return true; }
            seen[type].add(key);
            return false;
        };

        // 添加匹配到的数据
        for (const item of matched) {
            const data = item.matched_data;
            
            if (item.item_type === 'word') {
                if (!isDup('words', data.word)) {
                    report.vocabulary.words.push({
                        word: data.word,
                        phonetic: data.phonetic || '',
                        pos: data.pos || '',
                        meaning: data.meaning,
                        example: data.example || '',
                        _source: 'database',
                        _match_score: item.score
                    });
                }
            } else if (item.item_type === 'phrase') {
                if (!isDup('phrases', data.phrase)) {
                    report.vocabulary.phrases.push({
                        phrase: data.phrase,
                        meaning: data.meaning,
                        example: data.example || '',
                        _source: 'database',
                        _match_score: item.score
                    });
                }
            } else if (item.item_type === 'pattern') {
                if (!isDup('patterns', data.pattern)) {
                    report.vocabulary.patterns.push({
                        pattern: data.pattern,
                        meaning: data.meaning,
                        example: data.example || '',
                        _source: 'database',
                        _match_score: item.score
                    });
                }
            } else if (item.item_type === 'grammar') {
                if (!isDup('grammar', data.title)) {
                    report.grammar.push({
                        title: data.title,
                        definition: data.definition,
                        structure: data.structure,
                        usage: data.usage || [],
                        examples: data.examples || [],
                        mistakes: data.mistakes || [],
                        _source: 'database',
                        _match_score: item.score
                    });
                }
            }
        }

        // 添加 AI 生成的数据
        for (const item of unmatchedWithAI) {
            const aiData = item.ai_generated;
            if (!aiData || aiData.error) continue;

            if (item.item_type === 'word') {
                if (!isDup('words', item.original_text)) {
                    report.vocabulary.words.push({
                        word: item.original_text,
                        phonetic: aiData.phonetic || '',
                        pos: aiData.pos || '',
                        meaning: aiData.meaning || '',
                        example: aiData.example || '',
                        _source: 'ai_generated'
                    });
                }
            } else if (item.item_type === 'phrase') {
                if (!isDup('phrases', item.original_text)) {
                    report.vocabulary.phrases.push({
                        phrase: item.original_text,
                        meaning: aiData.meaning || '',
                        example: aiData.example || '',
                        usage: aiData.usage || '',
                        _source: 'ai_generated'
                    });
                }
            } else if (item.item_type === 'pattern') {
                if (!isDup('patterns', item.original_text)) {
                    report.vocabulary.patterns.push({
                        pattern: item.original_text,
                        meaning: aiData.meaning || '',
                        example: aiData.example || '',
                        structure: aiData.structure || '',
                        _source: 'ai_generated'
                    });
                }
            } else if (item.item_type === 'grammar') {
                if (!isDup('grammar', item.original_text)) {
                    report.grammar.push({
                        title: item.original_text,
                        definition: aiData.definition || '',
                        structure: aiData.structure || '',
                        usage: aiData.usage || [],
                        examples: aiData.examples || [],
                        mistakes: aiData.mistakes || [],
                        _source: 'ai_generated'
                    });
                }
            }
        }

        if (dupCount > 0) {
            console.log(`[PostProcessor] B5去重: 过滤 ${dupCount} 个重复项`);
        }

        return report;
    }
}

// 单例模式
let instance = null;

function getPostProcessor() {
    if (!instance) {
        instance = new PostProcessor();
    }
    return instance;
}

module.exports = {
    PostProcessor,
    getPostProcessor
};
