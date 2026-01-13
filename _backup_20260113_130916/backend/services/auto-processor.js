/**
 * Sorryios AI 自动化处理模块 v2.0
 * 
 * 功能：
 * 1. 自动读取提示词模板
 * 2. 自动填充文本内容
 * 3. 自动分块处理
 * 4. 自动发送到AI并获取结果
 * 5. 自动合并和过滤结果
 * 
 * 用户只需上传文件，后端全自动处理！
 * 
 * @author Sorryios AI Team
 * @version 2.0.0
 * @date 2026-01-12
 */

const fs = require('fs');
const path = require('path');
const { SmartTextSplitter } = require('./smart-text-splitter');

// ============================================
// 配置
// ============================================

const CONFIG = {
  // 提示词模板文件路径
  promptTemplatePath: path.join(__dirname, '../config/prompt_templates.json'),
  
  // 默认使用的模板
  defaultTemplate: 'classroom',
  
  // 分块配置
  defaultChunkSize: 6000,
  minChunkSize: 2000,
  
  // AI调用配置
  aiTimeout: 120000,      // 2分钟超时
  maxRetries: 3,          // 最大重试次数
  retryDelay: 5000,       // 重试间隔（毫秒）
  
  // 文件路径
  irregularVerbsPath: path.join(__dirname, '../data/irregular_verbs.json'),
  elementaryWordsPath: path.join(__dirname, '../data/elementary_words.json'),
  chunksDir: path.join(__dirname, '../data/chunks'),
  resultsDir: path.join(__dirname, '../data/results'),
  
  // 过滤配置
  enableFiltering: true,
};

// ============================================
// 提示词管理器
// ============================================

class PromptManager {
  constructor() {
    this.templates = {};
    this.placeholder = '{{TEXT_CONTENT}}';
    this.loaded = false;
  }

  /**
   * 加载提示词模板
   */
  load() {
    if (this.loaded) return;

    try {
      if (fs.existsSync(CONFIG.promptTemplatePath)) {
        const data = JSON.parse(fs.readFileSync(CONFIG.promptTemplatePath, 'utf-8'));
        this.templates = data.templates || {};
        this.placeholder = data.placeholder || '{{TEXT_CONTENT}}';
        console.log(`[PromptManager] 加载了 ${Object.keys(this.templates).length} 个提示词模板`);
      } else {
        console.log('[PromptManager] 提示词配置文件不存在，使用内置模板');
        this.templates = { classroom: { prompt: this.getBuiltInPrompt() } };
      }
      this.loaded = true;
    } catch (err) {
      console.error('[PromptManager] 加载模板失败:', err.message);
      this.templates = { classroom: { prompt: this.getBuiltInPrompt() } };
      this.loaded = true;
    }
  }

  /**
   * 获取内置的提示词（备用）
   */
  getBuiltInPrompt() {
    return `⚠️ 重要：只输出JSON，开头是 { 结尾是 }，不要任何解释文字！

你是一位专业的英语教学助手。请**完整分析**以下课堂录音转写内容，提取**所有**有价值的英语学习内容。

【重要提醒】
- 这是一段课堂录音，可能很长，请**从头到尾完整阅读**后再提取
- 不要只提取开头部分，**整个文本的所有知识点都要分析**
- 特别注意老师**反复强调**的内容和**详细讲解**的语法点
- 注意老师**指出学生错误**的地方，这些是重点
- 这是语音转写文本，可能有转写错误，请智能纠正

【分析任务】
1. **拼写纠错**：识别真正的拼写错误
2. **单词提取**：提取所有值得学习的单词，标注词性、中文释义
3. **词汇辨析**（重点！）：老师讲解的近义词/易混词区别
4. **动词变形表**：按AAA/ABB/ABC分类不规则动词
5. **短语搭配**：固定短语和动词搭配
6. **句型结构**：重要句型
7. **语法点**：老师讲解的语法知识
8. **学生常见错误**（重点！）：老师指出学生犯的错误
9. **老师重点强调**：老师反复强调的内容
10. **中文问答**：如果有"XX用英文怎么说"

【输出格式】必须严格按JSON格式输出：
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

⚠️ 直接输出JSON，不要有任何其他文字！

【待分析内容】
---
{{TEXT_CONTENT}}
---`;
  }

  /**
   * 获取指定模板
   * @param {string} templateName - 模板名称
   * @returns {string} - 提示词模板
   */
  getTemplate(templateName = 'classroom') {
    this.load();
    const template = this.templates[templateName] || this.templates['classroom'];
    return template ? template.prompt : this.getBuiltInPrompt();
  }

  /**
   * 构建完整的提示词（自动填充文本）
   * @param {string} text - 待分析的文本
   * @param {string} templateName - 模板名称
   * @returns {string} - 填充后的完整提示词
   */
  buildPrompt(text, templateName = 'classroom') {
    const template = this.getTemplate(templateName);
    return template.replace(this.placeholder, text);
  }

  /**
   * 获取可用的模板列表
   */
  getTemplateList() {
    this.load();
    return Object.keys(this.templates).map(key => ({
      key,
      name: this.templates[key].name || key,
      description: this.templates[key].description || ''
    }));
  }
}

// ============================================
// JSON 提取器
// ============================================

class JsonExtractor {
  /**
   * 从AI响应中提取JSON
   */
  static extract(response) {
    if (!response || typeof response !== 'string') {
      console.error('[JsonExtractor] 响应为空或非字符串');
      return null;
    }

    const text = response.trim();

    // 方法1：直接解析
    try {
      return JSON.parse(text);
    } catch (e) {}

    // 方法2：提取 {...}
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {}
    }

    // 方法3：提取代码块
    const codeBlockMatch = text.match(/```json?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch (e) {}
    }

    // 方法4：尝试修复
    try {
      let fixed = text;
      fixed = fixed.replace(/^[^{]*/, '');
      fixed = fixed.replace(/[^}]*$/, '');
      fixed = fixed.replace(/'/g, '"');
      fixed = fixed.replace(/,\s*}/g, '}');
      fixed = fixed.replace(/,\s*]/g, ']');
      return JSON.parse(fixed);
    } catch (e) {}

    console.error('[JsonExtractor] 所有解析方法都失败');
    return null;
  }

  /**
   * 验证JSON结构
   */
  static validate(json) {
    const requiredFields = ['words', 'phrases', 'summary'];
    const missing = requiredFields.filter(field => !(field in json));
    return { valid: missing.length === 0, missing };
  }
}

// ============================================
// 结果合并器
// ============================================

class ResultMerger {
  /**
   * 合并多个分块的AI结果
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

      // 合并各个字段
      if (result.spelling_corrections) {
        merged.spelling_corrections.push(...result.spelling_corrections);
      }
      if (result.words) {
        merged.words.push(...result.words);
      }
      if (result.word_comparisons) {
        merged.word_comparisons.push(...result.word_comparisons);
      }
      if (result.irregular_verbs) {
        ['AAA', 'ABB', 'ABC'].forEach(type => {
          if (result.irregular_verbs[type]) {
            merged.irregular_verbs[type].push(...result.irregular_verbs[type]);
          }
        });
      }
      if (result.phrases) {
        merged.phrases.push(...result.phrases);
      }
      if (result.patterns) {
        merged.patterns.push(...result.patterns);
      }
      if (result.grammar_points) {
        merged.grammar_points.push(...result.grammar_points);
      }
      if (result.student_errors) {
        merged.student_errors.push(...result.student_errors);
      }
      if (result.teacher_emphasis) {
        merged.teacher_emphasis.push(...result.teacher_emphasis);
      }
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

    return merged;
  }

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
    this.loaded = false;
  }

  load() {
    if (this.loaded) return;

    try {
      if (fs.existsSync(CONFIG.elementaryWordsPath)) {
        const data = JSON.parse(fs.readFileSync(CONFIG.elementaryWordsPath, 'utf-8'));
        this.elementaryWords = new Set(data.words.map(w => w.toLowerCase()));
        console.log(`[WordFilter] 加载小学词汇: ${this.elementaryWords.size} 个`);
      }
      this.loaded = true;
    } catch (err) {
      console.error('[WordFilter] 加载数据失败:', err.message);
      this.loaded = true;
    }
  }

  filter(result, userMasteredWords = new Set()) {
    this.load();

    if (!result || !result.words) return result;

    const originalCount = result.words.length;
    let filtered = [...result.words];

    // 第1层：过滤小学词汇
    filtered = filtered.filter(word => {
      const w = (word.base_form || word.word || '').toLowerCase();
      return !this.elementaryWords.has(w);
    });

    // 第2层：过滤全局黑名单
    filtered = filtered.filter(word => {
      const w = (word.base_form || word.word || '').toLowerCase();
      return !this.globalBlacklist.has(w);
    });

    // 第3层：过滤用户已掌握词汇
    if (userMasteredWords.size > 0) {
      filtered = filtered.filter(word => {
        const w = (word.base_form || word.word || '').toLowerCase();
        return !userMasteredWords.has(w);
      });
    }

    // 第4层：显示优化
    filtered = this.optimizeDisplay(filtered);

    result.words = filtered;
    result.summary.total_words = filtered.length;
    result.summary.words_filtered = originalCount - filtered.length;

    console.log(`[WordFilter] 过滤: ${originalCount} → ${filtered.length}`);

    return result;
  }

  optimizeDisplay(words) {
    const seen = new Set();
    const unique = words.filter(word => {
      const base = (word.base_form || word.word || '').toLowerCase();
      if (seen.has(base)) return false;
      seen.add(base);
      return true;
    });

    unique.sort((a, b) => {
      const wa = (a.base_form || a.word || '').toLowerCase();
      const wb = (b.base_form || b.word || '').toLowerCase();
      return wa.localeCompare(wb);
    });

    return unique;
  }
}

// ============================================
// AI 调用器（核心 - 需要根据实际情况配置）
// ============================================

class AIClient {
  constructor() {
    this.promptManager = new PromptManager();
  }

  /**
   * 发送文本到AI并获取响应
   * @param {string} text - 待分析的文本（已填充提示词）
   * @returns {Promise<string>} - AI的原始响应
   */
  async sendToAI(text) {
    // ============================================
    // 🔧 这里需要根据实际的AI调用方式来实现
    // ============================================
    //
    // 选项1：如果有API
    // -----------------
    // const response = await fetch('https://api.sorryios.ai/chat', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${API_KEY}`
    //   },
    //   body: JSON.stringify({ message: text })
    // });
    // const data = await response.json();
    // return data.response;
    //
    // 选项2：使用OpenAI API
    // -----------------
    // const response = await openai.chat.completions.create({
    //   model: 'gpt-4',
    //   messages: [{ role: 'user', content: text }]
    // });
    // return response.choices[0].message.content;
    //
    // 选项3：使用其他AI服务（如Claude API、文心一言等）
    // -----------------
    // ...
    //
    // 选项4：本地大模型（如Ollama）
    // -----------------
    // const response = await fetch('http://localhost:11434/api/generate', {
    //   method: 'POST',
    //   body: JSON.stringify({ model: 'llama2', prompt: text })
    // });
    // ...
    // ============================================

    // 暂时抛出错误，提示需要配置
    throw new Error('AI调用未配置，请在 AIClient.sendToAI() 中配置实际的AI调用方式');
  }

  /**
   * 发送请求（带重试）
   */
  async sendWithRetry(text, maxRetries = CONFIG.maxRetries) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[AIClient] 尝试 ${attempt}/${maxRetries}...`);
        const response = await this.sendToAI(text);
        return response;
      } catch (err) {
        lastError = err;
        console.error(`[AIClient] 尝试 ${attempt} 失败:`, err.message);
        
        if (attempt < maxRetries) {
          console.log(`[AIClient] ${CONFIG.retryDelay / 1000}秒后重试...`);
          await this.sleep(CONFIG.retryDelay);
        }
      }
    }

    throw lastError;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================
// 主处理器（全自动）
// ============================================

class AutoProcessor {
  constructor() {
    this.splitter = new SmartTextSplitter({
      chunkSize: CONFIG.defaultChunkSize,
      minChunkSize: CONFIG.minChunkSize,
      saveChunks: true,
      chunksDir: CONFIG.chunksDir
    });
    this.promptManager = new PromptManager();
    this.aiClient = new AIClient();
    this.filter = new WordFilter();
    this.processing = false;
  }

  /**
   * 自动处理文本（全流程）
   * 
   * @param {string} text - 原始文本（转写结果或文档内容）
   * @param {Object} options - 选项
   * @returns {Object} - 处理结果
   */
  async process(text, options = {}) {
    const {
      taskId = `task_${Date.now()}`,
      templateName = 'classroom',       // 使用的提示词模板
      chunkSize = CONFIG.defaultChunkSize,
      userId = null,
      userMasteredWords = new Set(),
      saveChunks = true,
      onProgress = () => {},
    } = options;

    console.log('\n' + '='.repeat(60));
    console.log(`[AutoProcessor] 开始自动处理任务: ${taskId}`);
    console.log(`[AutoProcessor] 文本长度: ${text.length} 字符`);
    console.log(`[AutoProcessor] 分块大小: ${chunkSize} 字符`);
    console.log(`[AutoProcessor] 使用模板: ${templateName}`);
    console.log('='.repeat(60) + '\n');

    try {
      this.processing = true;

      // ========== 步骤1：分块 ==========
      onProgress({ step: 1, status: 'chunking', message: '正在分块...' });
      
      this.splitter.updateConfig({ chunkSize, saveChunks });
      const chunkResult = this.splitter.splitAndSave(text, taskId);
      const chunks = chunkResult.chunks;

      console.log(`[AutoProcessor] 分成 ${chunks.length} 块`);
      onProgress({ 
        step: 1, 
        status: 'chunked', 
        message: `分成 ${chunks.length} 块`,
        totalChunks: chunks.length 
      });

      // ========== 步骤2：逐块处理 ==========
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

        console.log(`[AutoProcessor] 处理块 ${i + 1}/${chunks.length} (${chunk.charCount} 字符)`);

        try {
          // 🔑 关键：自动构建完整提示词
          const fullPrompt = this.promptManager.buildPrompt(chunk.content, templateName);
          
          console.log(`[AutoProcessor] 提示词长度: ${fullPrompt.length} 字符`);

          // 发送到AI
          const aiResponse = await this.aiClient.sendWithRetry(fullPrompt);
          
          // 解析JSON
          const parsed = JsonExtractor.extract(aiResponse);
          
          if (parsed) {
            aiResults.push(parsed);
            console.log(`[AutoProcessor] 块 ${i + 1} 处理成功`);
            
            // 保存单块结果
            if (saveChunks) {
              const chunkResultPath = path.join(
                CONFIG.resultsDir,
                `${taskId}_result_${String(i).padStart(2, '0')}.json`
              );
              this.ensureDir(CONFIG.resultsDir);
              fs.writeFileSync(chunkResultPath, JSON.stringify(parsed, null, 2), 'utf-8');
            }
          } else {
            console.error(`[AutoProcessor] 块 ${i + 1} JSON解析失败`);
          }
        } catch (err) {
          console.error(`[AutoProcessor] 块 ${i + 1} 处理失败:`, err.message);
        }
      }

      // ========== 步骤3：合并结果 ==========
      onProgress({ step: 3, status: 'merging', message: '正在合并结果...' });
      
      let merged = ResultMerger.merge(aiResults);
      console.log(`[AutoProcessor] 合并完成: ${merged.summary.total_words} 单词`);

      // ========== 步骤4：四层过滤 ==========
      onProgress({ step: 4, status: 'filtering', message: '正在过滤...' });
      
      if (CONFIG.enableFiltering) {
        merged = this.filter.filter(merged, userMasteredWords);
        console.log(`[AutoProcessor] 过滤完成: ${merged.summary.total_words} 单词`);
      }

      // ========== 步骤5：完成 ==========
      onProgress({ step: 5, status: 'completed', message: '处理完成' });

      // 添加元数据
      merged.metadata = {
        taskId,
        templateName,
        processedAt: new Date().toISOString(),
        originalLength: text.length,
        chunksProcessed: chunks.length,
        chunkSize,
        userId
      };

      // 保存最终结果
      const finalResultPath = path.join(CONFIG.resultsDir, `${taskId}_final.json`);
      this.ensureDir(CONFIG.resultsDir);
      fs.writeFileSync(finalResultPath, JSON.stringify(merged, null, 2), 'utf-8');

      console.log('\n' + '='.repeat(60));
      console.log(`[AutoProcessor] 任务完成: ${taskId}`);
      console.log(`[AutoProcessor] 提取: ${merged.summary.total_words} 单词, ${merged.summary.total_phrases} 短语`);
      console.log('='.repeat(60) + '\n');

      return {
        success: true,
        data: merged,
        resultPath: finalResultPath
      };

    } catch (err) {
      console.error(`[AutoProcessor] 处理失败:`, err);
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
   * 确保目录存在
   */
  ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 获取处理状态
   */
  isProcessing() {
    return this.processing;
  }

  /**
   * 获取可用的模板列表
   */
  getTemplates() {
    return this.promptManager.getTemplateList();
  }
}

// ============================================
// 导出
// ============================================

// 单例
const autoProcessor = new AutoProcessor();
const promptManager = new PromptManager();

module.exports = {
  AutoProcessor,
  PromptManager,
  JsonExtractor,
  ResultMerger,
  WordFilter,
  AIClient,
  autoProcessor,
  promptManager,
  CONFIG
};

// 如果直接运行此文件
if (require.main === module) {
  console.log('='.repeat(60));
  console.log('Sorryios AI 自动化处理模块 v2.0');
  console.log('='.repeat(60));
  console.log('\n可用的提示词模板:');
  promptManager.getTemplateList().forEach(t => {
    console.log(`  - ${t.key}: ${t.name}`);
  });
  console.log('\n使用方法:');
  console.log('  const { autoProcessor } = require("./auto-processor");');
  console.log('  const result = await autoProcessor.process(text, { templateName: "classroom" });');
  console.log('\n⚠️ 注意: 请在 AIClient.sendToAI() 中配置实际的AI调用方式');
}
