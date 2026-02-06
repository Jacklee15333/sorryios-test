/**
 * 文本清洗服务 v2.1 - 修复版
 * 功能：
 * 1. 去除所有加号（+）及其周围的空格
 * 2. 统一使用通用模板符号 (sb., sth.)
 * 3. 去除括号内的示例
 * 4. 规范化空格
 * 
 * v2.1 修复：
 * - 修复导出方式，添加 getTextCleaner 函数
 * - 修复方法名：cleanVocabulary, cleanGrammarList
 */

class TextCleaner {
  constructor() {
    console.log('[TextCleaner] ✓ 文本清洗服务已初始化 v2.1');
  }

  /**
   * 清洗单个文本
   * @param {string} text - 原始文本
   * @returns {string} - 清洗后的文本
   */
  cleanText(text) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    let cleaned = text;

    // 步骤1: 去除所有加号及其周围的空格
    // 匹配模式: "空格+加号+空格" → "空格"
    cleaned = cleaned.replace(/\s*\+\s*/g, ' ');
    
    // 再次确保没有遗漏的加号
    cleaned = cleaned.replace(/\+/g, ' ');

    // 步骤2: 替换通用占位符为标准格式
    // someone/somebody → sb.
    cleaned = cleaned.replace(/\bsomeone\b/gi, 'sb.');
    cleaned = cleaned.replace(/\bsomebody\b/gi, 'sb.');
    cleaned = cleaned.replace(/\bpeople\b/gi, 'sb.');
    cleaned = cleaned.replace(/\ba person\b/gi, 'sb.');
    
    // something → sth.
    cleaned = cleaned.replace(/\bsomething\b/gi, 'sth.');
    cleaned = cleaned.replace(/\bsome thing\b/gi, 'sth.');
    
    // doing something → doing sth.
    cleaned = cleaned.replace(/\bdoing something\b/gi, 'doing sth.');
    cleaned = cleaned.replace(/\bto do something\b/gi, 'to do sth.');
    
    // verb → do sth.
    cleaned = cleaned.replace(/\bverb\b/gi, 'do sth.');
    cleaned = cleaned.replace(/\bto verb\b/gi, 'to do sth.');
    cleaned = cleaned.replace(/\bhow to verb\b/gi, 'how to do sth.');
    
    // noun → sth.
    cleaned = cleaned.replace(/\bnoun\b/gi, 'sth.');
    cleaned = cleaned.replace(/\ba noun\b/gi, 'sth.');
    cleaned = cleaned.replace(/\ban noun\b/gi, 'sth.');
    
    // adjective → adj.
    cleaned = cleaned.replace(/\badjective\b/gi, 'adj.');
    
    // adverb → adv.
    cleaned = cleaned.replace(/\badverb\b/gi, 'adv.');

    // 步骤3: 去除括号及其内容
    // 匹配 (e.g., ...), (such as ...), (like ...) 等
    cleaned = cleaned.replace(/\s*\([^)]*\)/g, '');
    
    // 去除方括号及其内容
    cleaned = cleaned.replace(/\s*\[[^\]]*\]/g, '');

    // 步骤4: 清理多余空格
    cleaned = cleaned.replace(/\s{2,}/g, ' ');  // 多个空格 → 单个空格
    cleaned = cleaned.trim();                    // 去除首尾空格

    // 步骤5: 规范化标点
    cleaned = cleaned.replace(/\s+([.,;:!?])/g, '$1');  // 标点前的空格
    cleaned = cleaned.replace(/([.,;:!?])(\S)/g, '$1 $2');  // 标点后加空格

    return cleaned;
  }

  /**
   * 批量清洗词汇数据（单词、短语、句型）
   * @param {Object} vocabulary - 包含 words, phrases, patterns 的对象
   * @returns {Object} - 清洗后的词汇对象
   */
  cleanVocabulary(vocabulary) {
    if (!vocabulary || typeof vocabulary !== 'object') {
      return vocabulary;
    }

    const result = { ...vocabulary };
    let stats = {
      words: 0,
      phrases: 0,
      patterns: 0
    };

    // 清洗单词
    if (Array.isArray(result.words)) {
      result.words = result.words.map(word => {
        stats.words++;
        return {
          ...word,
          content: this.cleanText(word.content),
          meaning: this.cleanText(word.meaning),
          example: this.cleanText(word.example),
          usage: this.cleanText(word.usage)
        };
      });
    }

    // 清洗短语
    if (Array.isArray(result.phrases)) {
      result.phrases = result.phrases.map(phrase => {
        stats.phrases++;
        return {
          ...phrase,
          content: this.cleanText(phrase.content),
          meaning: this.cleanText(phrase.meaning),
          example: this.cleanText(phrase.example),
          usage: this.cleanText(phrase.usage)
        };
      });
    }

    // 清洗句型
    if (Array.isArray(result.patterns)) {
      result.patterns = result.patterns.map(pattern => {
        stats.patterns++;
        return {
          ...pattern,
          content: this.cleanText(pattern.content),
          meaning: this.cleanText(pattern.meaning),
          example: this.cleanText(pattern.example),
          usage: this.cleanText(pattern.usage),
          structure: this.cleanText(pattern.structure)
        };
      });
    }

    console.log('[TextCleaner] ✅ 词汇清洗完成:');
    console.log(`[TextCleaner]   - 单词: ${stats.words} 项`);
    console.log(`[TextCleaner]   - 短语: ${stats.phrases} 项`);
    console.log(`[TextCleaner]   - 句型: ${stats.patterns} 项`);

    return result;
  }

  /**
   * 批量清洗语法数据
   * @param {Array} grammarList - 语法数组
   * @returns {Array} - 清洗后的语法数组
   */
  cleanGrammarList(grammarList) {
    if (!Array.isArray(grammarList)) {
      return grammarList;
    }

    const result = grammarList.map(grammar => ({
      ...grammar,
      title: this.cleanText(grammar.title),
      description: this.cleanText(grammar.description),
      example: this.cleanText(grammar.example),
      explanation: this.cleanText(grammar.explanation)
    }));

    console.log(`[TextCleaner] ✅ 清洗语法: ${result.length} 项`);
    return result;
  }

  /**
   * 清洗完整的提取结果
   * @param {Object} extractedData - AI提取的完整数据
   * @returns {Object} - 清洗后的完整数据
   */
  cleanExtractedData(extractedData) {
    if (!extractedData || typeof extractedData !== 'object') {
      return extractedData;
    }

    console.log('[TextCleaner] 🧹 开始清洗数据...');

    const result = {
      ...extractedData,
      vocabulary: this.cleanVocabulary(extractedData.vocabulary),
      grammar: this.cleanGrammarList(extractedData.grammar)
    };

    console.log('[TextCleaner] ✓ 数据清洗完成');
    return result;
  }

  /**
   * 验证清洗效果
   * @param {string} text - 文本
   * @returns {Object} - 验证结果
   */
  validateCleaning(text) {
    const issues = [];

    if (text.includes('+')) {
      issues.push('仍包含加号 (+)');
    }
    if (/\bsomeone\b/i.test(text)) {
      issues.push('仍包含 "someone"');
    }
    if (/\bsomething\b/i.test(text)) {
      issues.push('仍包含 "something"');
    }
    if (/\bverb\b/i.test(text)) {
      issues.push('仍包含 "verb"');
    }
    if (/\bnoun\b/i.test(text)) {
      issues.push('仍包含 "noun"');
    }
    if (/\([^)]*\)/.test(text)) {
      issues.push('仍包含括号');
    }

    return {
      isClean: issues.length === 0,
      issues: issues
    };
  }

  // ========== v2.0 兼容方法（旧方法名） ==========
  cleanVocabularyData(data) {
    return this.cleanVocabulary(data);
  }

  cleanGrammarData(grammarList) {
    return this.cleanGrammarList(grammarList);
  }
}

// ============================================
// 导出方式 - 修复版
// ============================================

// 创建单例
const textCleanerInstance = new TextCleaner();

// 导出 getTextCleaner 函数（aiProcessor.js 需要）
function getTextCleaner() {
  return textCleanerInstance;
}

// 同时导出实例和函数
module.exports = {
  getTextCleaner,
  textCleaner: textCleanerInstance,
  // 为了向后兼容，也导出类本身
  TextCleaner
};