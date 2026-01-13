/**
 * Sorryios AI 处理模块
 * 
 * 功能：
 * 1. 调用 Sorryios.ai 网站进行文本分析
 * 2. 智能提取 JSON 响应
 * 3. 多块结果合并去重
 * 4. 四层过滤系统
 * 
 * @author Sorryios AI Team
 * @version 1.0.0
 * @date 2026-01-12
 */

const fs = require('fs');
const path = require('path');
const { SmartTextSplitter } = require('./smart-text-splitter');

// ============================================
// 配置
// ============================================

const CONFIG = {
  // Sorryios.ai 配置
  sorryiosUrl: 'https://sorryios.ai/api/chat',  // 需要替换为实际的API地址
  timeout: 120000,  // 2分钟超时
  maxRetries: 3,
  retryDelay: 5000,
  
  // 分块配置
  defaultChunkSize: 6000,
  
  // 文件路径
  promptTemplatePath: path.join(__dirname, '../config/prompt_template_v2.md'),
  irregularVerbsPath: path.join(__dirname, '../data/irregular_verbs.json'),
  elementaryWordsPath: path.join(__dirname, '../data/elementary_words.json'),
  
  // 过滤配置
  enableFiltering: true,
};

// ============================================
// 提示词模板
// ============================================

const PROMPT_TEMPLATE = `⚠️ 重要：只输出JSON，开头是 { 结尾是 }，不要任何解释文字！

你是一位专业的英语教学助手。请**完整分析**以下课堂录音转写内容，提取**所有**有价值的英语学习内容。

【重要提醒】
- 这是一段课堂录音，可能很长，请**从头到尾完整阅读**后再提取
- 不要只提取开头部分，**整个文本的所有知识点都要分析**
- 特别注意老师**反复强调**的内容和**详细讲解**的语法点
- 注意老师**指出学生错误**的地方，这些是重点
- 这是语音转写文本，可能有转写错误，请智能纠正

【分析任务】
1. 拼写纠错：识别真正的拼写错误
2. 单词提取：提取所有值得学习的单词，标注词性、中文释义
3. 词汇辨析：老师讲解的近义词/易混词区别
4. 动词变形表：按AAA/ABB/ABC分类不规则动词
5. 短语搭配：固定短语和动词搭配
6. 句型结构：重要句型
7. 语法点：老师讲解的语法知识
8. 学生常见错误：老师指出学生犯的错误
9. 老师重点强调：老师反复强调的内容
10. 中文问答：如果有"XX用英文怎么说"

【输出格式】必须严格按JSON格式输出，结构如下：
{
  "spelling_corrections": [{"wrong": "", "correct": "", "meaning": ""}],
  "words": [{"word": "", "base_form": "", "pos": "", "meaning": "", "is_irregular": false}],
  "word_comparisons": [{"title": "", "words": [], "key_difference": ""}],
  "irregular_verbs": {"AAA": [], "ABB": [], "ABC": []},
  "phrases": [{"phrase": "", "meaning": "", "usage": "", "example": ""}],
  "patterns": [{"pattern": "", "meaning": "", "examples": []}],
  "grammar_points": [{"name": "", "structure": "", "explanation": "", "examples": []}],
  "student_errors": [{"error_type": "", "wrong": "", "correct": "", "explanation": ""}],
  "teacher_emphasis": [{"topic": "", "content": "", "importance": ""}],
  "chinese_triggers": [{"chinese_question": "", "english_answer": ""}],
  "summary": {"total_words": 0, "total_phrases": 0, "total_patterns": 0, "total_grammar": 0, "total_errors": 0}
}

⚠️ 再次提醒：直接输出JSON，不要有任何其他文字！

【待分析内容】
---
{TEXT_CONTENT}
---`;

// ============================================
// JSON 提取器
// ============================================

class JsonExtractor {
  /**
   * 从AI响应中提取JSON
   * @param {string} response - AI原始响应
   * @returns {Object|null} - 解析后的JSON对象
   */
  static extract(response) {
    if (!response || typeof response !== 'string') {
      console.error('[JsonExtractor] 响应为空或非字符串');
      return null;
    }

    const text = response.trim();

    // 方法1：直接解析（最理想情况）
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
      // 去除开头的非JSON字符
      fixed = fixed.replace(/^[^{]*/, '');
      // 去除结尾的非JSON字符
      fixed = fixed.replace(/[^}]*$/, '');
      // 修复单引号
      fixed = fixed.replace(/'/g, '"');
      // 修复末尾多余逗号
      fixed = fixed.replace(/,\s*}/g, '}');
      fixed = fixed.replace(/,\s*]/g, ']');
      
      return JSON.parse(fixed);
    } catch (e) {
      console.log('[JsonExtractor] 修复后仍然解析失败');
    }

    console.error('[JsonExtractor] 所有方法都失败了');
    return null;
  }

  /**
   * 验证JSON结构是否符合预期
   * @param {Object} json - JSON对象
   * @returns {Object} - { valid: boolean, missing: string[] }
   */
  static validate(json) {
    const requiredFields = [
      'spelling_corrections',
      'words',
      'phrases',
      'patterns',
      'grammar_points',
      'summary'
    ];

    const missing = requiredFields.filter(field => !(field in json));
    
    return {
      valid: missing.length === 0,
      missing
    };
  }
}

// ============================================
// 结果合并器
// ============================================

class ResultMerger {
  /**
   * 合并多个分块的AI结果
   * @param {Array} results - AI结果数组
   * @returns {Object} - 合并后的结果
   */
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

      // 合并拼写纠错
      if (result.spelling_corrections) {
        merged.spelling_corrections.push(...result.spelling_corrections);
      }

      // 合并单词
      if (result.words) {
        merged.words.push(...result.words);
      }

      // 合并词汇辨析
      if (result.word_comparisons) {
        merged.word_comparisons.push(...result.word_comparisons);
      }

      // 合并不规则动词
      if (result.irregular_verbs) {
        if (result.irregular_verbs.AAA) {
          merged.irregular_verbs.AAA.push(...result.irregular_verbs.AAA);
        }
        if (result.irregular_verbs.ABB) {
          merged.irregular_verbs.ABB.push(...result.irregular_verbs.ABB);
        }
        if (result.irregular_verbs.ABC) {
          merged.irregular_verbs.ABC.push(...result.irregular_verbs.ABC);
        }
      }

      // 合并短语
      if (result.phrases) {
        merged.phrases.push(...result.phrases);
      }

      // 合并句型
      if (result.patterns) {
        merged.patterns.push(...result.patterns);
      }

      // 合并语法点
      if (result.grammar_points) {
        merged.grammar_points.push(...result.grammar_points);
      }

      // 合并学生错误
      if (result.student_errors) {
        merged.student_errors.push(...result.student_errors);
      }

      // 合并老师重点
      if (result.teacher_emphasis) {
        merged.teacher_emphasis.push(...result.teacher_emphasis);
      }

      // 合并中文触发
      if (result.chinese_triggers) {
        merged.chinese_triggers.push(...result.chinese_triggers);
      }
    }

    // 去重
    merged.spelling_corrections = this.dedupeByKey(merged.spelling_corrections, 'wrong');
    merged.words = this.dedupeByKey(merged.words, 'word');
    merged.word_comparisons = this.dedupeByKey(merged.word_comparisons, 'title');
    merged.irregular_verbs.AAA = this.dedupeByKey(merged.irregular_verbs.AAA, 'base');
    merged.irregular_verbs.ABB = this.dedupeByKey(merged.irregular_verbs.ABB, 'base');
    merged.irregular_verbs.ABC = this.dedupeByKey(merged.irregular_verbs.ABC, 'base');
    merged.phrases = this.dedupeByKey(merged.phrases, 'phrase');
    merged.patterns = this.dedupeByKey(merged.patterns, 'pattern');
    merged.grammar_points = this.dedupeByKey(merged.grammar_points, 'name');
    merged.student_errors = this.dedupeByKey(merged.student_errors, 'wrong');
    merged.teacher_emphasis = this.dedupeByKey(merged.teacher_emphasis, 'topic');
    merged.chinese_triggers = this.dedupeByKey(merged.chinese_triggers, 'chinese_question');

    // 更新统计
    merged.summary = {
      total_words: merged.words.length,
      total_comparisons: merged.word_comparisons.length,
      total_irregular_verbs: merged.irregular_verbs.AAA.length + 
                            merged.irregular_verbs.ABB.length + 
                            merged.irregular_verbs.ABC.length,
      total_phrases: merged.phrases.length,
      total_patterns: merged.patterns.length,
      total_grammar: merged.grammar_points.length,
      total_errors: merged.student_errors.length,
      spelling_errors_fixed: merged.spelling_corrections.length,
      chunks_merged: results.length
    };

    console.log(`[ResultMerger] 合并完成: ${merged.summary.total_words} 单词, ${merged.summary.total_phrases} 短语`);

    return merged;
  }

  /**
   * 按key去重
   */
  static dedupeByKey(arr, key) {
    if (!arr || !Array.isArray(arr)) return [];
    
    const seen = new Set();
    return arr.filter(item => {
      if (!item || !item[key]) return false;
      const k = String(item[key]).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /**
   * 创建空结果
   */
  static createEmptyResult() {
    return {
      spelling_corrections: [],
      words: [],
      word_comparisons: [],
      irregular_verbs: { AAA: [], ABB: [], ABC: [] },
      phrases: [],
      patterns: [],
      grammar_points: [],
      student_errors: [],
      teacher_emphasis: [],
      chinese_triggers: [],
      summary: {
        total_words: 0,
        total_comparisons: 0,
        total_irregular_verbs: 0,
        total_phrases: 0,
        total_patterns: 0,
        total_grammar: 0,
        total_errors: 0,
        spelling_errors_fixed: 0
      }
    };
  }
}

// ============================================
// 四层过滤器
// ============================================

class WordFilter {
  constructor() {
    this.elementaryWords = new Set();
    this.globalBlacklist = new Set();
    this.irregularVerbsLookup = {};
    this.loaded = false;
  }

  /**
   * 加载过滤数据
   */
  load() {
    if (this.loaded) return;

    try {
      // 加载小学词汇
      if (fs.existsSync(CONFIG.elementaryWordsPath)) {
        const data = JSON.parse(fs.readFileSync(CONFIG.elementaryWordsPath, 'utf-8'));
        this.elementaryWords = new Set(data.words.map(w => w.toLowerCase()));
        console.log(`[WordFilter] 加载小学词汇: ${this.elementaryWords.size} 个`);
      }

      // 加载不规则动词
      if (fs.existsSync(CONFIG.irregularVerbsPath)) {
        const data = JSON.parse(fs.readFileSync(CONFIG.irregularVerbsPath, 'utf-8'));
        this.irregularVerbsLookup = data.lookup_index || {};
        console.log(`[WordFilter] 加载不规则动词查找表`);
      }

      this.loaded = true;
    } catch (err) {
      console.error('[WordFilter] 加载数据失败:', err.message);
    }
  }

  /**
   * 执行四层过滤
   * @param {Object} result - AI分析结果
   * @param {Set} userMasteredWords - 用户已掌握的词汇
   * @returns {Object} - 过滤后的结果
   */
  filter(result, userMasteredWords = new Set()) {
    this.load();

    if (!result || !result.words) {
      return result;
    }

    const originalCount = result.words.length;
    let filtered = [...result.words];

    // 第1层：过滤小学词汇
    filtered = filtered.filter(word => {
      const w = (word.base_form || word.word || '').toLowerCase();
      return !this.elementaryWords.has(w);
    });
    console.log(`[WordFilter] 第1层（小学词汇）: ${originalCount} → ${filtered.length}`);

    // 第2层：过滤全局黑名单
    filtered = filtered.filter(word => {
      const w = (word.base_form || word.word || '').toLowerCase();
      return !this.globalBlacklist.has(w);
    });
    console.log(`[WordFilter] 第2层（黑名单）: 保留 ${filtered.length}`);

    // 第3层：过滤用户已掌握词汇
    if (userMasteredWords.size > 0) {
      filtered = filtered.filter(word => {
        const w = (word.base_form || word.word || '').toLowerCase();
        return !userMasteredWords.has(w);
      });
      console.log(`[WordFilter] 第3层（已掌握）: 保留 ${filtered.length}`);
    }

    // 第4层：显示优化（去重、排序）
    filtered = this.optimizeDisplay(filtered);
    console.log(`[WordFilter] 第4层（优化）: 最终 ${filtered.length}`);

    // 更新结果
    result.words = filtered;
    result.summary.total_words = filtered.length;
    result.summary.words_filtered = originalCount - filtered.length;

    return result;
  }

  /**
   * 显示优化
   */
  optimizeDisplay(words) {
    // 按原形去重
    const seen = new Set();
    const unique = words.filter(word => {
      const base = (word.base_form || word.word || '').toLowerCase();
      if (seen.has(base)) return false;
      seen.add(base);
      return true;
    });

    // 按字母排序
    unique.sort((a, b) => {
      const wa = (a.base_form || a.word || '').toLowerCase();
      const wb = (b.base_form || b.word || '').toLowerCase();
      return wa.localeCompare(wb);
    });

    return unique;
  }

  /**
   * 添加到全局黑名单
   */
  addToBlacklist(word) {
    this.globalBlacklist.add(word.toLowerCase());
  }

  /**
   * 从全局黑名单移除
   */
  removeFromBlacklist(word) {
    this.globalBlacklist.delete(word.toLowerCase());
  }
}

// ============================================
// 主处理器
// ============================================

class SorryiosAIProcessor {
  constructor() {
    this.splitter = new SmartTextSplitter({
      chunkSize: CONFIG.defaultChunkSize,
      saveChunks: true,
      chunksDir: path.join(__dirname, '../data/chunks')
    });
    this.filter = new WordFilter();
    this.processing = false;
  }

  /**
   * 处理文本
   * @param {string} text - 原始文本
   * @param {Object} options - 选项
   * @returns {Object} - 处理结果
   */
  async process(text, options = {}) {
    const {
      taskId = `task_${Date.now()}`,
      chunkSize = CONFIG.defaultChunkSize,
      userId = null,
      userMasteredWords = new Set(),
      onProgress = () => {},
      saveChunks = true,
    } = options;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[SorryiosAI] 开始处理任务: ${taskId}`);
    console.log(`[SorryiosAI] 文本长度: ${text.length} 字符`);
    console.log(`[SorryiosAI] 分块大小: ${chunkSize} 字符`);
    console.log(`${'='.repeat(60)}\n`);

    try {
      this.processing = true;

      // 步骤1：分块
      onProgress({ step: 1, status: 'chunking', message: '正在分块...' });
      
      this.splitter.updateConfig({ chunkSize, saveChunks });
      const chunkResult = this.splitter.splitAndSave(text, taskId);
      const chunks = chunkResult.chunks;

      console.log(`[SorryiosAI] 分成 ${chunks.length} 块`);
      onProgress({ 
        step: 1, 
        status: 'chunked', 
        message: `分成 ${chunks.length} 块`,
        totalChunks: chunks.length 
      });

      // 步骤2：逐块调用AI
      const aiResults = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const progress = Math.round(((i + 1) / chunks.length) * 100);
        
        onProgress({ 
          step: 2, 
          status: 'processing', 
          message: `处理块 ${i + 1}/${chunks.length}`,
          currentChunk: i + 1,
          totalChunks: chunks.length,
          progress
        });

        console.log(`[SorryiosAI] 处理块 ${i + 1}/${chunks.length} (${chunk.charCount} 字符)`);

        // 调用AI（带重试）
        const result = await this.callAIWithRetry(chunk.content, i);
        
        if (result) {
          aiResults.push(result);
          console.log(`[SorryiosAI] 块 ${i + 1} 处理成功`);
        } else {
          console.error(`[SorryiosAI] 块 ${i + 1} 处理失败`);
        }

        // 保存单块结果
        if (saveChunks) {
          const chunkResultPath = path.join(
            __dirname, 
            '../data/chunks',
            `${taskId}_result_${String(i).padStart(2, '0')}.json`
          );
          fs.writeFileSync(chunkResultPath, JSON.stringify(result, null, 2), 'utf-8');
        }
      }

      // 步骤3：合并结果
      onProgress({ step: 3, status: 'merging', message: '正在合并结果...' });
      
      let merged = ResultMerger.merge(aiResults);
      console.log(`[SorryiosAI] 合并完成: ${merged.summary.total_words} 单词`);

      // 步骤4：四层过滤
      onProgress({ step: 4, status: 'filtering', message: '正在过滤...' });
      
      if (CONFIG.enableFiltering) {
        merged = this.filter.filter(merged, userMasteredWords);
        console.log(`[SorryiosAI] 过滤完成: ${merged.summary.total_words} 单词`);
      }

      // 步骤5：完成
      onProgress({ step: 5, status: 'completed', message: '处理完成' });

      // 添加元数据
      merged.metadata = {
        taskId,
        processedAt: new Date().toISOString(),
        originalLength: text.length,
        chunksProcessed: chunks.length,
        chunkSize,
        userId
      };

      console.log(`\n${'='.repeat(60)}`);
      console.log(`[SorryiosAI] 任务完成: ${taskId}`);
      console.log(`[SorryiosAI] 提取: ${merged.summary.total_words} 单词, ${merged.summary.total_phrases} 短语`);
      console.log(`${'='.repeat(60)}\n`);

      return {
        success: true,
        data: merged
      };

    } catch (err) {
      console.error(`[SorryiosAI] 处理失败:`, err);
      onProgress({ step: 0, status: 'error', message: err.message });
      
      return {
        success: false,
        error: err.message
      };
    } finally {
      this.processing = false;
    }
  }

  /**
   * 调用AI（带重试）
   */
  async callAIWithRetry(text, chunkIndex) {
    let lastError = null;

    for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
      try {
        console.log(`[SorryiosAI] 尝试 ${attempt}/${CONFIG.maxRetries}...`);
        
        const result = await this.callAI(text);
        
        if (result) {
          return result;
        }
      } catch (err) {
        lastError = err;
        console.error(`[SorryiosAI] 尝试 ${attempt} 失败:`, err.message);
        
        if (attempt < CONFIG.maxRetries) {
          console.log(`[SorryiosAI] ${CONFIG.retryDelay / 1000}秒后重试...`);
          await this.sleep(CONFIG.retryDelay);
        }
      }
    }

    console.error(`[SorryiosAI] 块 ${chunkIndex} 所有重试都失败`);
    return null;
  }

  /**
   * 调用AI
   * @param {string} text - 文本内容
   * @returns {Object|null} - 解析后的结果
   */
  async callAI(text) {
    // 构建提示词
    const prompt = PROMPT_TEMPLATE.replace('{TEXT_CONTENT}', text);

    // TODO: 这里需要实现实际的Sorryios.ai调用
    // 目前返回模拟数据用于测试
    
    console.log(`[SorryiosAI] 发送请求... (${text.length} 字符)`);
    
    // 模拟API调用延迟
    await this.sleep(1000);
    
    // ============================================
    // 🔧 在这里实现实际的API调用
    // ============================================
    // 
    // 方式1：如果Sorryios.ai有API
    // const response = await fetch(CONFIG.sorryiosUrl, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ prompt }),
    //   timeout: CONFIG.timeout
    // });
    // const data = await response.json();
    // const aiResponse = data.response || data.content || data.text;
    //
    // 方式2：如果需要模拟浏览器操作
    // 可以使用 Puppeteer 或 Playwright
    //
    // 方式3：手动模式
    // 将prompt保存到文件，用户手动复制到网站，然后粘贴结果
    // ============================================

    // 暂时返回模拟结果
    const mockResponse = this.getMockResponse();
    
    // 解析响应
    const parsed = JsonExtractor.extract(JSON.stringify(mockResponse));
    
    if (!parsed) {
      throw new Error('JSON解析失败');
    }

    const validation = JsonExtractor.validate(parsed);
    if (!validation.valid) {
      console.warn(`[SorryiosAI] JSON缺少字段: ${validation.missing.join(', ')}`);
    }

    return parsed;
  }

  /**
   * 获取模拟响应（测试用）
   */
  getMockResponse() {
    return {
      spelling_corrections: [],
      words: [
        { word: "example", base_form: "example", pos: "n", meaning: "例子", is_irregular: false },
        { word: "processing", base_form: "process", pos: "v", meaning: "处理", is_irregular: false }
      ],
      word_comparisons: [],
      irregular_verbs: { AAA: [], ABB: [], ABC: [] },
      phrases: [
        { phrase: "for example", meaning: "例如", usage: "举例时使用", example: "For example, this is a test." }
      ],
      patterns: [],
      grammar_points: [],
      student_errors: [],
      teacher_emphasis: [],
      chinese_triggers: [],
      summary: {
        total_words: 2,
        total_phrases: 1,
        total_patterns: 0,
        total_grammar: 0,
        total_errors: 0,
        spelling_errors_fixed: 0
      }
    };
  }

  /**
   * 睡眠
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取处理状态
   */
  isProcessing() {
    return this.processing;
  }
}

// ============================================
// 导出
// ============================================

// 单例
const processor = new SorryiosAIProcessor();

module.exports = {
  SorryiosAIProcessor,
  JsonExtractor,
  ResultMerger,
  WordFilter,
  processor,
  PROMPT_TEMPLATE,
  CONFIG
};

// 如果直接运行此文件
if (require.main === module) {
  console.log('Sorryios AI 处理模块');
  console.log('请通过 API 或其他模块调用');
}
