#!/usr/bin/env node
/**
 * 文本分块命令行工具
 * 
 * 用法:
 *   node chunk-cli.js <input-file> [options]
 * 
 * 选项:
 *   -s, --size <number>     分块大小（默认 6000）
 *   -o, --output <dir>      输出目录（默认 ./chunks）
 *   -p, --preview           仅预览，不保存文件
 *   -h, --help              显示帮助
 * 
 * 示例:
 *   node chunk-cli.js input.txt -s 6000 -o ./my-chunks
 *   node chunk-cli.js input.txt --preview
 * 
 * @author Sorryios AI Team
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// 简易参数解析
function parseArgs(args) {
  const options = {
    inputFile: null,
    chunkSize: 6000,
    outputDir: './chunks',
    preview: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '-p' || arg === '--preview') {
      options.preview = true;
    } else if (arg === '-s' || arg === '--size') {
      options.chunkSize = parseInt(args[++i]) || 6000;
    } else if (arg === '-o' || arg === '--output') {
      options.outputDir = args[++i] || './chunks';
    } else if (!arg.startsWith('-') && !options.inputFile) {
      options.inputFile = arg;
    }
  }

  return options;
}

// 显示帮助
function showHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           📄 文本分块命令行工具 v1.0                          ║
╚══════════════════════════════════════════════════════════════╝

用法:
  node chunk-cli.js <input-file> [options]

选项:
  -s, --size <number>     分块大小（默认 6000）
  -o, --output <dir>      输出目录（默认 ./chunks）
  -p, --preview           仅预览，不保存文件
  -h, --help              显示帮助

示例:
  node chunk-cli.js input.txt
  node chunk-cli.js input.txt -s 8000
  node chunk-cli.js input.txt -s 6000 -o ./my-chunks
  node chunk-cli.js input.txt --preview

分块大小建议:
  • 4000-6000: 适合大多数 AI 处理
  • 6000-8000: 适合上下文能力强的 AI
  • 2000-4000: 适合精细处理或测试
`);
}

// 分块优先级规则
const SPLIT_PATTERNS = [
  { name: 'paragraph',    regex: /\n\n+/g,           desc: '段落分隔' },
  { name: 'newline',      regex: /\n/g,              desc: '单换行' },
  { name: 'sentence_zh',  regex: /[。！？]+/g,       desc: '中文句号' },
  { name: 'sentence_en',  regex: /[.!?]+\s*/g,       desc: '英文句号' },
  { name: 'comma_zh',     regex: /[，；：]+/g,       desc: '中文逗号' },
  { name: 'comma_en',     regex: /[,;:]+\s*/g,       desc: '英文逗号' },
  { name: 'space',        regex: /\s+/g,             desc: '空格（兜底）' },
];

// 查找最佳切分点
function findBestSplitPoint(text, targetPos, searchRange = 500) {
  const startSearch = Math.max(0, targetPos - searchRange);
  const endSearch = Math.min(text.length, targetPos);
  const searchText = text.slice(startSearch, endSearch);

  for (const pattern of SPLIT_PATTERNS) {
    const matches = [...searchText.matchAll(pattern.regex)];
    
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const absolutePos = startSearch + lastMatch.index + lastMatch[0].length;
      
      return {
        position: absolutePos,
        pattern: pattern.name,
      };
    }
  }

  return {
    position: targetPos,
    pattern: 'force',
  };
}

// 智能分块
function splitText(text, chunkSize, minChunkSize = 2000) {
  if (text.length <= chunkSize) {
    return [{
      index: 0,
      content: text,
      charCount: text.length,
      splitPattern: 'none',
    }];
  }

  const chunks = [];
  let currentPos = 0;
  let chunkIndex = 0;

  while (currentPos < text.length) {
    let targetEndPos = currentPos + chunkSize;

    // 如果剩余文本不足最小块大小，合并到当前块
    if (text.length - targetEndPos < minChunkSize) {
      targetEndPos = text.length;
    }

    // 已到末尾
    if (targetEndPos >= text.length) {
      chunks.push({
        index: chunkIndex,
        content: text.slice(currentPos),
        charCount: text.length - currentPos,
        splitPattern: 'end',
      });
      break;
    }

    // 查找最佳切分点
    const splitPoint = findBestSplitPoint(text, targetEndPos);

    chunks.push({
      index: chunkIndex,
      content: text.slice(currentPos, splitPoint.position),
      charCount: splitPoint.position - currentPos,
      splitPattern: splitPoint.pattern,
    });

    currentPos = splitPoint.position;
    chunkIndex++;
  }

  return chunks;
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // 显示帮助
  if (options.help || !options.inputFile) {
    showHelp();
    process.exit(options.help ? 0 : 1);
  }

  // 检查输入文件
  if (!fs.existsSync(options.inputFile)) {
    console.error(`❌ 错误: 文件不存在 - ${options.inputFile}`);
    process.exit(1);
  }

  // 读取文件
  console.log('\n' + '═'.repeat(60));
  console.log('📄 文本分块工具');
  console.log('═'.repeat(60));

  const text = fs.readFileSync(options.inputFile, 'utf-8');
  const filename = path.basename(options.inputFile, path.extname(options.inputFile));

  console.log(`\n📂 输入文件: ${options.inputFile}`);
  console.log(`📏 文本长度: ${text.length.toLocaleString()} 字符`);
  console.log(`✂️  分块大小: ${options.chunkSize.toLocaleString()} 字符`);

  // 执行分块
  console.log('\n⏳ 正在分块...\n');
  const chunks = splitText(text, options.chunkSize);

  // 显示结果
  console.log('─'.repeat(60));
  console.log(`📦 分块结果: 共 ${chunks.length} 块`);
  console.log('─'.repeat(60));

  for (const chunk of chunks) {
    const preview = chunk.content.slice(0, 50).replace(/\n/g, '↵') + '...';
    console.log(`\n  块 ${chunk.index + 1}:`);
    console.log(`    字符数: ${chunk.charCount.toLocaleString()}`);
    console.log(`    切分模式: ${chunk.splitPattern}`);
    console.log(`    预览: ${preview}`);
  }

  // 统计
  const avgSize = Math.round(text.length / chunks.length);
  console.log('\n' + '─'.repeat(60));
  console.log('📊 统计信息');
  console.log('─'.repeat(60));
  console.log(`  总字符数: ${text.length.toLocaleString()}`);
  console.log(`  分块数量: ${chunks.length}`);
  console.log(`  平均块大小: ${avgSize.toLocaleString()}`);
  console.log(`  最小块: ${Math.min(...chunks.map(c => c.charCount)).toLocaleString()}`);
  console.log(`  最大块: ${Math.max(...chunks.map(c => c.charCount)).toLocaleString()}`);

  // 预览模式
  if (options.preview) {
    console.log('\n✅ 预览完成（未保存文件）');
    console.log('═'.repeat(60) + '\n');
    return;
  }

  // 保存文件
  console.log('\n' + '─'.repeat(60));
  console.log('💾 保存文件');
  console.log('─'.repeat(60));

  // 确保目录存在
  if (!fs.existsSync(options.outputDir)) {
    fs.mkdirSync(options.outputDir, { recursive: true });
    console.log(`  📁 创建目录: ${options.outputDir}`);
  }

  // 时间戳
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  // 保存每个分块
  const savedFiles = [];
  for (const chunk of chunks) {
    const chunkFilename = `${filename}_${timestamp}_chunk_${String(chunk.index).padStart(2, '0')}.txt`;
    const chunkPath = path.join(options.outputDir, chunkFilename);
    
    fs.writeFileSync(chunkPath, chunk.content, 'utf-8');
    savedFiles.push(chunkFilename);
    console.log(`  ✅ ${chunkFilename} (${chunk.charCount.toLocaleString()} 字符)`);
  }

  // 保存元数据
  const metadata = {
    originalFile: options.inputFile,
    timestamp,
    chunkSize: options.chunkSize,
    totalCharacters: text.length,
    totalChunks: chunks.length,
    avgChunkSize: avgSize,
    chunks: chunks.map(c => ({
      index: c.index,
      charCount: c.charCount,
      splitPattern: c.splitPattern,
      filename: savedFiles[c.index],
    })),
  };

  const metadataFilename = `${filename}_${timestamp}_metadata.json`;
  const metadataPath = path.join(options.outputDir, metadataFilename);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  console.log(`  📋 ${metadataFilename} (元数据)`);

  console.log('\n✅ 分块完成！');
  console.log(`📁 输出目录: ${path.resolve(options.outputDir)}`);
  console.log('═'.repeat(60) + '\n');
}

// 运行
main();
