/**
 * 智能文本分块模块 v2.0
 * 
 * 功能：
 * 1. 按配置的字数智能分块
 * 2. 保证语义完整（不切断单词、句子）
 * 3. 保存分块文件供测试
 * 4. 支持可配置的分块大小
 * 
 * @author Sorryios AI Team
 * @version 2.0.0
 * @date 2026-01-12
 */

const fs = require('fs');
const path = require('path');

// 默认配置
const DEFAULT_CONFIG = {
  chunkSize: 6000,        // 目标分块大小（字符数）
  minChunkSize: 2000,     // 最小分块大小
  maxChunkSize: 10000,    // 最大分块大小
  overlapSize: 200,       // 重叠大小（可选，用于上下文连贯）
  searchRange: 500,       // 向前搜索切分点的范围
  saveChunks: true,       // 是否保存分块文件
  chunksDir: './chunks',  // 分块文件保存目录
};

/**
 * 分块优先级规则
 * 按优先级从高到低尝试找切分点
 */
const SPLIT_PATTERNS = [
  { name: 'paragraph',    regex: /\n\n+/g,           desc: '段落分隔' },
  { name: 'newline',      regex: /\n/g,              desc: '单换行' },
  { name: 'sentence_zh',  regex: /[。！？]+/g,       desc: '中文句号' },
  { name: 'sentence_en',  regex: /[.!?]+\s*/g,       desc: '英文句号' },
  { name: 'comma_zh',     regex: /[，；：]+/g,       desc: '中文逗号' },
  { name: 'comma_en',     regex: /[,;:]+\s*/g,       desc: '英文逗号' },
  { name: 'space',        regex: /\s+/g,             desc: '空格（兜底）' },
];

/**
 * 智能文本分块类
 */
class SmartTextSplitter {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = {
      totalChunks: 0,
      totalCharacters: 0,
      avgChunkSize: 0,
      splitPoints: [],
    };
  }

  /**
   * 更新配置
   * @param {Object} newConfig - 新配置
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log(`[SmartSplitter] 配置已更新: chunkSize=${this.config.chunkSize}`);
  }

  /**
   * 在指定范围内查找最佳切分点
   * @param {string} text - 文本
   * @param {number} targetPos - 目标位置
   * @param {number} searchRange - 搜索范围
   * @returns {Object} - { position, pattern, char }
   */
  findBestSplitPoint(text, targetPos, searchRange) {
    const startSearch = Math.max(0, targetPos - searchRange);
    const endSearch = Math.min(text.length, targetPos);
    const searchText = text.slice(startSearch, endSearch);

    // 按优先级尝试每种切分模式
    for (const pattern of SPLIT_PATTERNS) {
      const matches = [...searchText.matchAll(pattern.regex)];
      
      if (matches.length > 0) {
        // 取最后一个匹配（最接近目标位置）
        const lastMatch = matches[matches.length - 1];
        const absolutePos = startSearch + lastMatch.index + lastMatch[0].length;
        
        return {
          position: absolutePos,
          pattern: pattern.name,
          char: lastMatch[0].replace(/\n/g, '\\n').slice(0, 10),
        };
      }
    }

    // 兜底：在目标位置强制切分
    console.warn(`[SmartSplitter] 警告: 在位置 ${targetPos} 未找到合适切分点，强制切分`);
    return {
      position: targetPos,
      pattern: 'force',
      char: text[targetPos] || '',
    };
  }

  /**
   * 智能分块主函数
   * @param {string} text - 原始文本
   * @param {Object} options - 可选配置覆盖
   * @returns {Array} - 分块数组
   */
  split(text, options = {}) {
    const config = { ...this.config, ...options };
    const { chunkSize, searchRange, minChunkSize } = config;

    // 重置统计
    this.stats = {
      totalChunks: 0,
      totalCharacters: text.length,
      avgChunkSize: 0,
      splitPoints: [],
    };

    // 如果文本短于目标大小，直接返回
    if (text.length <= chunkSize) {
      console.log(`[SmartSplitter] 文本长度 ${text.length} <= ${chunkSize}，无需分块`);
      this.stats.totalChunks = 1;
      this.stats.avgChunkSize = text.length;
      return [{
        index: 0,
        content: text,
        startPos: 0,
        endPos: text.length,
        charCount: text.length,
        splitPattern: 'none',
      }];
    }

    const chunks = [];
    let currentPos = 0;
    let chunkIndex = 0;

    console.log(`[SmartSplitter] 开始分块: 总长度=${text.length}, 目标块大小=${chunkSize}`);

    while (currentPos < text.length) {
      // 计算本块的目标结束位置
      let targetEndPos = currentPos + chunkSize;

      // 如果剩余文本不足最小块大小，合并到当前块
      if (text.length - targetEndPos < minChunkSize) {
        targetEndPos = text.length;
      }

      // 如果已经到达末尾
      if (targetEndPos >= text.length) {
        const chunk = {
          index: chunkIndex,
          content: text.slice(currentPos),
          startPos: currentPos,
          endPos: text.length,
          charCount: text.length - currentPos,
          splitPattern: 'end',
        };
        chunks.push(chunk);
        this.stats.splitPoints.push({
          position: text.length,
          pattern: 'end',
        });
        break;
      }

      // 查找最佳切分点
      const splitPoint = this.findBestSplitPoint(text, targetEndPos, searchRange);

      // 创建分块
      const chunk = {
        index: chunkIndex,
        content: text.slice(currentPos, splitPoint.position),
        startPos: currentPos,
        endPos: splitPoint.position,
        charCount: splitPoint.position - currentPos,
        splitPattern: splitPoint.pattern,
      };

      chunks.push(chunk);
      this.stats.splitPoints.push(splitPoint);

      console.log(`[SmartSplitter] 块 ${chunkIndex}: ${chunk.charCount} 字符, 切分模式: ${splitPoint.pattern}`);

      currentPos = splitPoint.position;
      chunkIndex++;
    }

    // 更新统计
    this.stats.totalChunks = chunks.length;
    this.stats.avgChunkSize = Math.round(text.length / chunks.length);

    console.log(`[SmartSplitter] 分块完成: ${chunks.length} 块, 平均 ${this.stats.avgChunkSize} 字符/块`);

    return chunks;
  }

  /**
   * 分块并保存到文件
   * @param {string} text - 原始文本
   * @param {string} originalFilename - 原始文件名
   * @param {Object} options - 配置选项
   * @returns {Object} - { chunks, savedFiles, metadata }
   */
  splitAndSave(text, originalFilename = 'text', options = {}) {
    const config = { ...this.config, ...options };
    const chunks = this.split(text, config);

    if (!config.saveChunks) {
      return { chunks, savedFiles: [], metadata: null };
    }

    // 确保目录存在
    const chunksDir = config.chunksDir;
    if (!fs.existsSync(chunksDir)) {
      fs.mkdirSync(chunksDir, { recursive: true });
      console.log(`[SmartSplitter] 创建目录: ${chunksDir}`);
    }

    // 生成时间戳
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseName = path.basename(originalFilename, path.extname(originalFilename));

    // 保存每个分块
    const savedFiles = [];
    for (const chunk of chunks) {
      const filename = `${baseName}_${timestamp}_chunk_${String(chunk.index).padStart(2, '0')}.txt`;
      const filepath = path.join(chunksDir, filename);
      
      fs.writeFileSync(filepath, chunk.content, 'utf-8');
      savedFiles.push({
        index: chunk.index,
        filename,
        filepath,
        charCount: chunk.charCount,
      });
      
      console.log(`[SmartSplitter] 保存分块: ${filename} (${chunk.charCount} 字符)`);
    }

    // 保存元数据
    const metadata = {
      originalFilename,
      timestamp,
      totalCharacters: text.length,
      chunkSize: config.chunkSize,
      totalChunks: chunks.length,
      avgChunkSize: this.stats.avgChunkSize,
      chunks: chunks.map(c => ({
        index: c.index,
        charCount: c.charCount,
        startPos: c.startPos,
        endPos: c.endPos,
        splitPattern: c.splitPattern,
      })),
      splitPoints: this.stats.splitPoints,
    };

    const metadataFilename = `${baseName}_${timestamp}_metadata.json`;
    const metadataPath = path.join(chunksDir, metadataFilename);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    console.log(`[SmartSplitter] 保存元数据: ${metadataFilename}`);

    return { chunks, savedFiles, metadata, metadataPath };
  }

  /**
   * 获取统计信息
   * @returns {Object} - 统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 预览分块（不实际切分，只返回切分点信息）
   * @param {string} text - 文本
   * @param {Object} options - 配置
   * @returns {Object} - 预览信息
   */
  preview(text, options = {}) {
    const config = { ...this.config, ...options };
    const { chunkSize, searchRange, minChunkSize } = config;

    const splitPoints = [];
    let currentPos = 0;

    while (currentPos < text.length) {
      let targetEndPos = currentPos + chunkSize;

      if (text.length - targetEndPos < minChunkSize) {
        targetEndPos = text.length;
      }

      if (targetEndPos >= text.length) {
        splitPoints.push({
          position: text.length,
          pattern: 'end',
          preview: '【文本结束】',
        });
        break;
      }

      const splitPoint = this.findBestSplitPoint(text, targetEndPos, searchRange);
      
      // 获取切分点附近的文本预览
      const previewStart = Math.max(0, splitPoint.position - 30);
      const previewEnd = Math.min(text.length, splitPoint.position + 30);
      const previewText = text.slice(previewStart, previewEnd)
        .replace(/\n/g, '↵')
        .replace(/\s+/g, ' ');

      splitPoints.push({
        position: splitPoint.position,
        pattern: splitPoint.pattern,
        preview: `...${previewText}...`,
        chunkSize: splitPoint.position - currentPos,
      });

      currentPos = splitPoint.position;
    }

    return {
      totalLength: text.length,
      chunkSize: config.chunkSize,
      estimatedChunks: splitPoints.length,
      splitPoints,
    };
  }
}

/**
 * 便捷函数：快速分块
 * @param {string} text - 文本
 * @param {number} chunkSize - 块大小
 * @returns {Array} - 分块内容数组
 */
function quickSplit(text, chunkSize = 6000) {
  const splitter = new SmartTextSplitter({ chunkSize });
  return splitter.split(text).map(chunk => chunk.content);
}

/**
 * 便捷函数：分块并保存
 * @param {string} text - 文本
 * @param {string} filename - 文件名
 * @param {number} chunkSize - 块大小
 * @param {string} outputDir - 输出目录
 * @returns {Object} - 结果
 */
function splitAndSaveToFiles(text, filename, chunkSize = 6000, outputDir = './chunks') {
  const splitter = new SmartTextSplitter({ 
    chunkSize, 
    chunksDir: outputDir,
    saveChunks: true,
  });
  return splitter.splitAndSave(text, filename);
}

// 导出
module.exports = {
  SmartTextSplitter,
  quickSplit,
  splitAndSaveToFiles,
  SPLIT_PATTERNS,
  DEFAULT_CONFIG,
};

// 如果直接运行此文件，执行测试
if (require.main === module) {
  console.log('='.repeat(60));
  console.log('智能文本分块模块 - 测试');
  console.log('='.repeat(60));

  // 测试文本
  const testText = `这是第一段内容。这是一些测试文字，用来验证分块功能是否正常工作。

这是第二段内容。我们需要确保分块时不会切断单词或句子。This is some English text mixed with Chinese. We want to make sure the splitting works correctly.

这是第三段。包含一些更长的内容来测试分块逻辑。测试测试测试测试测试测试测试测试测试测试测试测试测试测试。`.repeat(50);

  console.log(`\n测试文本长度: ${testText.length} 字符\n`);

  // 测试不同的分块大小
  const testSizes = [2000, 4000, 6000, 8000];
  
  for (const size of testSizes) {
    console.log(`\n--- 测试分块大小: ${size} ---`);
    const splitter = new SmartTextSplitter({ chunkSize: size });
    const preview = splitter.preview(testText);
    console.log(`预计分块数: ${preview.estimatedChunks}`);
    console.log(`切分点: ${preview.splitPoints.map(p => p.position).join(', ')}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('测试完成');
}
