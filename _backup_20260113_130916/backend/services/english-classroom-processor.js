/**
 * 英语课堂智能分析处理器 v3.1
 * 
 * 更新：简化输出为2大类（词汇基础 + 语法知识）
 * 
 * @author Sorryios AI Team
 * @version 3.1.0
 * @date 2026-01-13
 */

const fs = require('fs');
const path = require('path');

// 导入依赖模块
const { SorryiosAutomation } = require('../lib/sorryios-automation');
const { SmartTextSplitter } = require('./smart-text-splitter');

// ============================================
// 配置
// ============================================

const CONFIG = {
  defaultChunkSize: 6000,
  minChunkSize: 2000,
  maxRetries: 3,
  retryDelay: 5000,
  chunkInterval: 15000,
  
  dataDir: path.join(__dirname, '../data'),
  chunksDir: path.join(__dirname, '../data/chunks'),
  resultsDir: path.join(__dirname, '../data/results'),
  elementaryWordsPath: path.join(__dirname, '../data/elementary_words.json'),
  blacklistWordsPath: path.join(__dirname, '../data/blacklist_words.json'),
  
  // ============================================
  // 🆕 新提示词模板（2大类输出）
  // ============================================
  promptTemplate: `⚠️ 重要：只输出JSON，开头是 { 结尾是 }，不要任何解释文字！

你是一位专业的英语教学助手。请分析以下课堂录音内容，提取英语学习内容，分为【词汇基础】和【语法知识】两大类。

【分类规则】
1. 词汇基础：需要"记住"的内容
   - 单词：单个词汇，必须提供音标、词性、含义、例句
   - 如果是不规则动词，要列出：原形、过去式、过去分词
   - 如果是形容词有比较级/最高级，要列出变形
   - 短语：2个及以上单词的固定搭配，用模板形式（如 look forward to，不是 look forward to seeing you）
   - 句型：2个及以上单词的句子模板（如 so...that...，不是完整句子）

2. 语法知识：需要"理解"的内容（用卡片形式详细讲解）
   - 时态（现在完成时、一般过去时等）
   - 语态（被动语态等）
   - 句子成分（主谓宾等）
   - 从句（定语从句、宾语从句等）
   - 词性变化规则（不规则动词变化规律等）
   - 词汇辨析（如 tell/say/speak/talk 的区别）→ 这个很重要，归入语法！
   - 任何语法术语、语法规则的讲解

【注意事项】
- 语法类术语（如"主谓宾"、"现在完成时"）不要放在单词里，要放在语法里
- 短语和句型必须是模板形式，不能是完整句子
- 短语和句型必须是2个及以上单词
- 词汇辨析（多个相似词对比）归入语法，不是单词
- 学生错误：如果是单词拼写错误，放单词备注；如果是语法错误，放语法的易错点

【输出格式】严格按以下JSON格式：
{
  "vocabulary": {
    "words": [
      {
        "word": "go",
        "phonetic": "/ɡəʊ/",
        "pos": "v.",
        "meaning": "去",
        "forms": {
          "past": "went",
          "past_participle": "gone",
          "third_person": "",
          "present_participle": "",
          "comparative": "",
          "superlative": ""
        },
        "example": "I go to school every day.",
        "note": ""
      }
    ],
    "phrases": [
      {
        "phrase": "look forward to",
        "meaning": "期待",
        "example": "I look forward to seeing you."
      }
    ],
    "patterns": [
      {
        "pattern": "so...that...",
        "meaning": "如此...以至于...",
        "example": "I am so tired that I can't walk."
      }
    ]
  },
  "grammar": [
    {
      "title": "不规则动词的变化规律",
      "definition": "不按 -ed 规则变化的动词，需要单独记忆过去式和过去分词",
      "structure": "原形 - 过去式 - 过去分词；分为AAA型、ABB型、ABC型",
      "usage": [
        "AAA型：三者相同，如 cut-cut-cut",
        "ABB型：后两者相同，如 tell-told-told",
        "ABC型：三者不同，如 go-went-gone"
      ],
      "mistakes": [
        {"wrong": "goed", "correct": "went", "explanation": "go是不规则动词"},
        {"wrong": "cutted", "correct": "cut", "explanation": "cut是AAA型，三者相同"}
      ],
      "examples": [
        "He went to school yesterday.",
        "I have gone there before."
      ]
    }
  ],
  "summary": {
    "total_words": 0,
    "total_phrases": 0,
    "total_patterns": 0,
    "total_grammar": 0
  }
}

⚠️ 再次提醒：
1. 直接输出JSON，不要其他文字
2. 词汇辨析归入grammar，不是words
3. 短语/句型用模板形式，不是完整句子
4. 单词要有音标

【待分析内容】
---
{{TEXT_CONTENT}}
---`,
};

// ============================================
// JSON 提取器
// ============================================

class JsonExtractor {
  static extract(response) {
    if (!response || typeof response !== 'string') {
      console.error('[JsonExtractor] 响应为空或非字符串');
      return null;
    }

    const text = response.trim();

    // 方法1：直接解析
    try {
      return JSON.parse(text);
    } catch (e) {
      console.log('[JsonExtractor] 直接解析失败，尝试其他方法');
    }

    // 方法2：提取 {...} 部分
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.log('[JsonExtractor] 正则提取后解析失败');
      }
    }

    // 方法3：提取 ```json ... ``` 代码块
    const codeBlockMatch = text.match(/```json?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch (e) {
        console.log('[JsonExtractor] 代码块提取后解析失败');
      }
    }

    // 方法4：尝试修复常见问题
    try {
      let fixed = text;
      fixed = fixed.replace(/^[^{]*/, '');
      fixed = fixed.replace(/[^}]*$/, '');
      fixed = fixed.replace(/'/g, '"');
      fixed = fixed.replace(/,\s*}/g, '}');
      fixed = fixed.replace(/,\s*]/g, ']');
      
      return JSON.parse(fixed);
    } catch (e) {
      console.log('[JsonExtractor] 修复后仍然解析失败');
    }

    console.error('[JsonExtractor] 所有方法都失败了');
    return null;
  }

  static validate(json) {
    const hasVocabulary = json.vocabulary && 
                         (json.vocabulary.words || json.vocabulary.phrases || json.vocabulary.patterns);
    const hasGrammar = json.grammar && Array.isArray(json.grammar);
    
    return { valid: hasVocabulary || hasGrammar, missing: [] };
  }
}

// ============================================
// 结果合并器（适配新结构）
// ============================================

class ResultMerger {
  static createEmptyResult() {
    return {
      vocabulary: {
        words: [],
        phrases: [],
        patterns: []
      },
      grammar: [],
      summary: {
        total_words: 0,
        total_phrases: 0,
        total_patterns: 0,
        total_grammar: 0
      }
    };
  }

  static dedupeByKey(array, key) {
    if (!Array.isArray(array)) return [];
    const seen = new Set();
    return array.filter(item => {
      if (!item || !item[key]) return false;
      const value = String(item[key]).toLowerCase();
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }

  static merge(results) {
    if (!results || results.length === 0) {
      return this.createEmptyResult();
    }

    if (results.length === 1) {
      return results[0];
    }

    console.log(`[ResultMerger] 合并 ${results.length} 个结果`);

    const merged = this.createEmptyResult();

    for (const result of results) {
      if (!result) continue;

      if (result.vocabulary) {
        if (result.vocabulary.words) {
          merged.vocabulary.words.push(...result.vocabulary.words);
        }
        if (result.vocabulary.phrases) {
          merged.vocabulary.phrases.push(...result.vocabulary.phrases);
        }
        if (result.vocabulary.patterns) {
          merged.vocabulary.patterns.push(...result.vocabulary.patterns);
        }
      }

      if (result.grammar && Array.isArray(result.grammar)) {
        merged.grammar.push(...result.grammar);
      }
    }

    merged.vocabulary.words = this.dedupeByKey(merged.vocabulary.words, 'word');
    merged.vocabulary.phrases = this.dedupeByKey(merged.vocabulary.phrases, 'phrase');
    merged.vocabulary.patterns = this.dedupeByKey(merged.vocabulary.patterns, 'pattern');
    merged.grammar = this.dedupeByKey(merged.grammar, 'title');

    merged.summary = {
      total_words: merged.vocabulary.words.length,
      total_phrases: merged.vocabulary.phrases.length,
      total_patterns: merged.vocabulary.patterns.length,
      total_grammar: merged.grammar.length,
      chunks_merged: results.length
    };

    console.log(`[ResultMerger] 合并完成: ${merged.summary.total_words} 单词, ${merged.summary.total_phrases} 短语, ${merged.summary.total_grammar} 语法点`);

    return merged;
  }
}

// ============================================
// 四层过滤器（适配新结构）
// ============================================

class WordFilter {
  constructor() {
    this.elementaryWords = new Set();
    this.blacklistWords = new Set();
    this.loadWordLists();
  }

  loadWordLists() {
    try {
      if (fs.existsSync(CONFIG.elementaryWordsPath)) {
        const data = JSON.parse(fs.readFileSync(CONFIG.elementaryWordsPath, 'utf-8'));
        this.elementaryWords = new Set(data.words.map(w => w.toLowerCase()));
        console.log(`[WordFilter] 加载小学词汇: ${this.elementaryWords.size} 个`);
      }
    } catch (e) {
      console.warn('[WordFilter] 加载小学词汇失败:', e.message);
    }

    try {
      if (fs.existsSync(CONFIG.blacklistWordsPath)) {
        const data = JSON.parse(fs.readFileSync(CONFIG.blacklistWordsPath, 'utf-8'));
        this.blacklistWords = new Set(data.words.map(w => w.toLowerCase()));
        console.log(`[WordFilter] 加载黑名单词汇: ${this.blacklistWords.size} 个`);
      }
    } catch (e) {
      console.warn('[WordFilter] 加载黑名单词汇失败:', e.message);
    }
  }

  filter(data, userMasteredWords = new Set()) {
    if (!data || !data.vocabulary) return data;

    let filtered = JSON.parse(JSON.stringify(data));
    const originalCount = filtered.vocabulary.words ? filtered.vocabulary.words.length : 0;

    if (filtered.vocabulary.words) {
      filtered.vocabulary.words = filtered.vocabulary.words.filter(item => {
        const word = (item.word || '').toLowerCase();
        if (this.elementaryWords.has(word)) return false;
        if (this.blacklistWords.has(word)) return false;
        if (userMasteredWords.has(word)) return false;
        if (word.length < 2) return false;
        return true;
      });
    }

    if (filtered.vocabulary.phrases) {
      filtered.vocabulary.phrases = filtered.vocabulary.phrases.filter(item => {
        const phrase = (item.phrase || '').trim();
        const wordCount = phrase.split(/\s+/).length;
        return wordCount >= 2;
      });
    }

    if (filtered.vocabulary.patterns) {
      filtered.vocabulary.patterns = filtered.vocabulary.patterns.filter(item => {
        const pattern = (item.pattern || '').trim();
        const wordCount = pattern.split(/\s+/).length;
        return wordCount >= 2;
      });
    }

    const finalCount = filtered.vocabulary.words ? filtered.vocabulary.words.length : 0;
    filtered.summary = {
      ...filtered.summary,
      total_words: finalCount,
      total_phrases: filtered.vocabulary.phrases ? filtered.vocabulary.phrases.length : 0,
      total_patterns: filtered.vocabulary.patterns ? filtered.vocabulary.patterns.length : 0,
      total_grammar: filtered.grammar ? filtered.grammar.length : 0,
      filter_stats: {
        original: originalCount,
        final: finalCount,
        removed: originalCount - finalCount
      }
    };

    console.log(`[WordFilter] 过滤完成: ${originalCount} → ${finalCount} (移除 ${originalCount - finalCount} 个)`);

    return filtered;
  }
}

// ============================================
// 主处理器类
// ============================================

class EnglishClassroomProcessor {
  constructor() {
    this.splitter = new SmartTextSplitter({
      chunkSize: CONFIG.defaultChunkSize,
      minChunkSize: CONFIG.minChunkSize,
      saveChunks: true,
      chunksDir: CONFIG.chunksDir
    });
    this.filter = new WordFilter();
    this.automation = null;
    this.processing = false;
  }

  ensureDirectories() {
    const dirs = [CONFIG.dataDir, CONFIG.chunksDir, CONFIG.resultsDir];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  buildPrompt(text) {
    return CONFIG.promptTemplate.replace('{{TEXT_CONTENT}}', text);
  }

  async initBrowser() {
    if (!this.automation) {
      console.log('[Processor] 初始化浏览器...');
      this.automation = new SorryiosAutomation();
      await this.automation.init();
      await this.automation.login();
      await this.automation.selectIdleAccount();
      console.log('[Processor] 浏览器就绪');
    }
  }

  async closeBrowser() {
    if (this.automation) {
      await this.automation.close();
      this.automation = null;
      console.log('[Processor] 浏览器已关闭');
    }
  }

  async callAI(text, chunkIndex = 0) {
    const prompt = this.buildPrompt(text);
    
    console.log(`[Processor] 发送块 ${chunkIndex + 1} 到AI (${text.length} 字符)`);

    for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
      try {
        const response = await this.automation.sendMessage(prompt);
        const responseText = typeof response === 'object' ? response.text : response;
        const parsed = JsonExtractor.extract(responseText);
        
        if (parsed) {
          JsonExtractor.validate(parsed);
          return parsed;
        } else {
          throw new Error('JSON解析失败');
        }
        
      } catch (err) {
        console.error(`[Processor] 尝试 ${attempt}/${CONFIG.maxRetries} 失败:`, err.message);
        
        if (attempt < CONFIG.maxRetries) {
          console.log(`[Processor] ${CONFIG.retryDelay / 1000}秒后重试...`);
          await this.sleep(CONFIG.retryDelay);
        }
      }
    }

    console.error(`[Processor] 块 ${chunkIndex + 1} 所有重试都失败`);
    return null;
  }

  async process(text, options = {}) {
    const {
      taskId = `task_${Date.now()}`,
      userId = null,
      userMasteredWords = new Set(),
      onProgress = () => {},
      saveResults = true,
    } = options;

    console.log('\n' + '='.repeat(60));
    console.log(`[Processor] 开始处理任务: ${taskId}`);
    console.log(`[Processor] 文本长度: ${text.length} 字符`);
    console.log('='.repeat(60) + '\n');

    this.ensureDirectories();

    try {
      this.processing = true;

      onProgress({ step: 1, status: 'chunking', message: '正在分块...' });
      const chunkResult = this.splitter.splitAndSave(text, taskId);
      const chunks = chunkResult.chunks;
      console.log(`[Processor] 分成 ${chunks.length} 块`);
      onProgress({ step: 1, status: 'chunked', message: `分成 ${chunks.length} 块`, totalChunks: chunks.length });

      onProgress({ step: 2, status: 'init_browser', message: '启动浏览器...' });
      await this.initBrowser();

      const aiResults = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const progress = Math.round(((i + 1) / chunks.length) * 100);
        
        onProgress({ 
          step: 3, 
          status: 'processing', 
          message: `处理块 ${i + 1}/${chunks.length}`,
          currentChunk: i + 1,
          totalChunks: chunks.length,
          progress
        });

        console.log(`\n[Processor] 处理块 ${i + 1}/${chunks.length} (${chunk.charCount} 字符)`);

        const result = await this.callAI(chunk.content, i);
        
        if (result) {
          aiResults.push(result);
          console.log(`[Processor] 块 ${i + 1} 处理成功`);

          if (saveResults) {
            const chunkResultPath = path.join(CONFIG.resultsDir, `${taskId}_chunk_${String(i).padStart(2, '0')}.json`);
            fs.writeFileSync(chunkResultPath, JSON.stringify(result, null, 2), 'utf-8');
          }
        }

        if (i < chunks.length - 1) {
          console.log(`[Processor] 等待 ${CONFIG.chunkInterval / 1000} 秒后处理下一块...`);
          await this.sleep(CONFIG.chunkInterval);
        }
      }

      onProgress({ step: 4, status: 'merging', message: '正在合并结果...' });
      let merged = ResultMerger.merge(aiResults);

      onProgress({ step: 5, status: 'filtering', message: '正在过滤...' });
      merged = this.filter.filter(merged, userMasteredWords);

      onProgress({ step: 6, status: 'saving', message: '保存结果...' });

      merged.metadata = {
        taskId,
        processedAt: new Date().toISOString(),
        originalLength: text.length,
        chunksProcessed: chunks.length,
        successfulChunks: aiResults.length,
        userId
      };

      if (saveResults) {
        const finalResultPath = path.join(CONFIG.resultsDir, `${taskId}_final.json`);
        fs.writeFileSync(finalResultPath, JSON.stringify(merged, null, 2), 'utf-8');
        console.log(`[Processor] 最终结果已保存: ${finalResultPath}`);
      }

      onProgress({ step: 7, status: 'completed', message: '处理完成' });

      console.log('\n' + '='.repeat(60));
      console.log(`[Processor] 任务完成: ${taskId}`);
      console.log(`[Processor] 统计: ${merged.summary.total_words} 单词, ${merged.summary.total_phrases} 短语, ${merged.summary.total_grammar} 语法点`);
      console.log('='.repeat(60) + '\n');

      return { success: true, data: merged, taskId };

    } catch (err) {
      console.error(`[Processor] 处理失败:`, err);
      onProgress({ step: 0, status: 'error', message: err.message });
      return { success: false, error: err.message, taskId };
    } finally {
      this.processing = false;
      await this.closeBrowser();
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  isProcessing() {
    return this.processing;
  }
}

module.exports = {
  EnglishClassroomProcessor,
  JsonExtractor,
  ResultMerger,
  WordFilter,
  CONFIG
};