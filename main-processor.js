/**
 * Sorryios AI 完整处理流程
 * 整合：文件检测 → Whisper转写 → 文本切分 → AI分析 → 结果汇总
 * 
 * 使用方法：
 *   node main-processor.js --input "文件路径" --output "输出目录"
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { TextSplitter } = require('./text-splitter');
const { SorryiosAutomation } = require('./sorryios-automation');

// ============== 配置 ==============
const CONFIG = {
    // Whisper配置
    whisper: {
        model: 'large-v3',
        language: 'zh',
        outputFormat: 'txt',
    },
    
    // 支持的文件类型
    supportedAudio: ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm'],
    supportedText: ['.txt', '.md', '.doc', '.docx'],
    
    // 文本切分配置
    splitter: {
        maxSegmentLength: 6000,
        minSegmentLength: 200,
    },
    
    // AI分析的系统提示
    systemPrompt: `请分析以下内容，提取关键信息并进行总结。
要求：
1. 识别主要观点和论点
2. 提取重要的事实和数据
3. 总结核心结论
4. 如果有待办事项或行动点，请列出`,
    
    // 输出目录
    outputDir: './output',
};

// ============== 工具函数 ==============

function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString().substring(11, 19);
    const prefix = {
        'INFO': '📋',
        'SUCCESS': '✅',
        'ERROR': '❌',
        'WARN': '⚠️',
        'STEP': '🔄',
    }[type] || '📋';
    console.log(`[${timestamp}] ${prefix} ${message}`);
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function getFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (CONFIG.supportedAudio.includes(ext)) return 'audio';
    if (CONFIG.supportedText.includes(ext)) return 'text';
    return 'unknown';
}

// ============== 处理步骤 ==============

/**
 * 步骤1：Whisper音频转写
 */
async function transcribeAudio(audioPath, outputDir) {
    log(`开始转写音频: ${path.basename(audioPath)}`, 'STEP');
    
    const outputPath = path.join(outputDir, path.basename(audioPath, path.extname(audioPath)) + '.txt');
    
    try {
        // 调用Whisper
        const command = `whisper "${audioPath}" --model ${CONFIG.whisper.model} --language ${CONFIG.whisper.language} --output_format ${CONFIG.whisper.outputFormat} --output_dir "${outputDir}"`;
        
        log(`执行命令: ${command}`);
        execSync(command, { 
            stdio: 'inherit',
            timeout: 30 * 60 * 1000, // 30分钟超时
        });
        
        // 查找生成的文件
        const possibleOutputs = [
            outputPath,
            path.join(outputDir, path.basename(audioPath) + '.txt'),
        ];
        
        for (const p of possibleOutputs) {
            if (fs.existsSync(p)) {
                log(`转写完成: ${p}`, 'SUCCESS');
                return p;
            }
        }
        
        throw new Error('找不到转写输出文件');
        
    } catch (error) {
        log(`转写失败: ${error.message}`, 'ERROR');
        throw error;
    }
}

/**
 * 步骤2：文本切分
 */
async function splitText(textPath, outputDir) {
    log(`开始切分文本: ${path.basename(textPath)}`, 'STEP');
    
    const text = fs.readFileSync(textPath, 'utf-8');
    log(`文本长度: ${text.length} 字符`);
    
    const splitter = new TextSplitter(CONFIG.splitter);
    const segments = splitter.split(text);
    
    log(`切分完成: ${segments.length} 个片段`, 'SUCCESS');
    
    // 保存切分结果
    const segmentsPath = path.join(outputDir, 'segments.json');
    fs.writeFileSync(segmentsPath, JSON.stringify({
        sourceFile: textPath,
        segmentCount: segments.length,
        segments: segments.map(s => s.content),
    }, null, 2));
    
    return segments.map(s => s.content);
}

/**
 * 步骤3：AI分析
 */
async function analyzeWithAI(segments, outputDir) {
    log(`开始AI分析: ${segments.length} 个片段`, 'STEP');
    
    const automation = new SorryiosAutomation();
    
    try {
        await automation.init();
        await automation.login();
        await automation.selectIdleAccount();
        
        const results = await automation.processSegments(segments, CONFIG.systemPrompt);
        
        // 保存分析结果
        const resultsPath = path.join(outputDir, 'ai-results.json');
        fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
        
        const successCount = results.filter(r => r.success).length;
        log(`AI分析完成: ${successCount}/${segments.length} 成功`, 'SUCCESS');
        
        return results;
        
    } finally {
        await automation.close();
    }
}

/**
 * 步骤4：结果汇总
 */
async function summarizeResults(results, outputDir, sourceFileName) {
    log('生成汇总报告...', 'STEP');
    
    const successResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);
    
    // 生成Markdown报告
    let report = `# AI分析报告

## 📊 概览

- **源文件**: ${sourceFileName}
- **处理时间**: ${new Date().toLocaleString('zh-CN')}
- **总片段数**: ${results.length}
- **成功处理**: ${successResults.length}
- **处理失败**: ${failedResults.length}

---

## 📝 分析结果

`;
    
    for (const result of successResults) {
        report += `### 片段 ${result.index + 1}

**输入内容摘要**: ${result.input.substring(0, 100)}...

**AI分析**:

${result.output}

---

`;
    }
    
    if (failedResults.length > 0) {
        report += `## ⚠️ 处理失败的片段

`;
        for (const result of failedResults) {
            report += `- 片段 ${result.index + 1}: ${result.error}\n`;
        }
    }
    
    // 保存报告
    const reportPath = path.join(outputDir, 'report.md');
    fs.writeFileSync(reportPath, report, 'utf-8');
    log(`报告已保存: ${reportPath}`, 'SUCCESS');
    
    // 生成JSON格式结果
    const jsonOutput = {
        sourceFile: sourceFileName,
        processedAt: new Date().toISOString(),
        statistics: {
            totalSegments: results.length,
            successCount: successResults.length,
            failCount: failedResults.length,
        },
        results: results,
    };
    
    const jsonPath = path.join(outputDir, 'result.json');
    fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
    
    // 生成HTML报告
    const htmlReport = generateHTMLReport(jsonOutput);
    const htmlPath = path.join(outputDir, 'report.html');
    fs.writeFileSync(htmlPath, htmlReport);
    
    return {
        markdown: reportPath,
        json: jsonPath,
        html: htmlPath,
    };
}

/**
 * 生成HTML报告
 */
function generateHTMLReport(data) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI分析报告 - ${data.sourceFile}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
            padding: 20px;
        }
        .container { max-width: 900px; margin: 0 auto; }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 20px;
        }
        .header h1 { font-size: 24px; margin-bottom: 10px; }
        .stats {
            display: flex;
            gap: 20px;
            margin-top: 15px;
        }
        .stat-item {
            background: rgba(255,255,255,0.2);
            padding: 10px 20px;
            border-radius: 5px;
        }
        .stat-value { font-size: 24px; font-weight: bold; }
        .stat-label { font-size: 12px; opacity: 0.8; }
        .segment {
            background: white;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 15px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .segment-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid #eee;
        }
        .segment-title { font-weight: 600; color: #667eea; }
        .segment-status {
            padding: 3px 10px;
            border-radius: 20px;
            font-size: 12px;
        }
        .status-success { background: #d4edda; color: #155724; }
        .status-failed { background: #f8d7da; color: #721c24; }
        .input-preview {
            background: #f8f9fa;
            padding: 10px;
            border-radius: 5px;
            font-size: 14px;
            color: #666;
            margin-bottom: 15px;
        }
        .ai-output {
            white-space: pre-wrap;
            line-height: 1.8;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 AI分析报告</h1>
            <p>源文件: ${data.sourceFile}</p>
            <p>处理时间: ${new Date(data.processedAt).toLocaleString('zh-CN')}</p>
            <div class="stats">
                <div class="stat-item">
                    <div class="stat-value">${data.statistics.totalSegments}</div>
                    <div class="stat-label">总片段数</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${data.statistics.successCount}</div>
                    <div class="stat-label">成功处理</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${data.statistics.failCount}</div>
                    <div class="stat-label">处理失败</div>
                </div>
            </div>
        </div>
        
        ${data.results.map((result, index) => `
        <div class="segment">
            <div class="segment-header">
                <span class="segment-title">📄 片段 ${index + 1}</span>
                <span class="segment-status ${result.success ? 'status-success' : 'status-failed'}">
                    ${result.success ? '✓ 成功' : '✗ 失败'}
                </span>
            </div>
            <div class="input-preview">
                <strong>输入:</strong> ${escapeHtml(result.input.substring(0, 150))}${result.input.length > 150 ? '...' : ''}
            </div>
            <div class="ai-output">
                ${result.success ? escapeHtml(result.output) : `<em style="color: #721c24">错误: ${escapeHtml(result.error || '未知错误')}</em>`}
            </div>
        </div>
        `).join('')}
    </div>
</body>
</html>`;
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============== 主处理流程 ==============

async function processFile(inputPath, outputDir) {
    const startTime = Date.now();
    const fileName = path.basename(inputPath);
    
    log(`
╔════════════════════════════════════════════════════════════╗
║              Sorryios AI 自动化处理系统                      ║
╚════════════════════════════════════════════════════════════╝
    `);
    
    log(`开始处理文件: ${fileName}`);
    
    // 创建输出目录
    const fileOutputDir = path.join(outputDir, path.basename(inputPath, path.extname(inputPath)) + '_' + Date.now());
    ensureDir(fileOutputDir);
    log(`输出目录: ${fileOutputDir}`);
    
    try {
        // 检测文件类型
        const fileType = getFileType(inputPath);
        log(`文件类型: ${fileType}`);
        
        let textPath = inputPath;
        
        // 如果是音频，先转写
        if (fileType === 'audio') {
            textPath = await transcribeAudio(inputPath, fileOutputDir);
        } else if (fileType === 'unknown') {
            throw new Error(`不支持的文件类型: ${path.extname(inputPath)}`);
        }
        
        // 切分文本
        const segments = await splitText(textPath, fileOutputDir);
        
        // AI分析
        const results = await analyzeWithAI(segments, fileOutputDir);
        
        // 生成报告
        const reports = await summarizeResults(results, fileOutputDir, fileName);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        log(`
╔════════════════════════════════════════════════════════════╗
║                      处理完成！                              ║
╠════════════════════════════════════════════════════════════╣
║  耗时: ${duration}秒
║  输出目录: ${fileOutputDir}
║  
║  生成的文件:
║    - report.md    (Markdown报告)
║    - report.html  (HTML报告)
║    - result.json  (JSON数据)
╚════════════════════════════════════════════════════════════╝
        `, 'SUCCESS');
        
        return {
            success: true,
            outputDir: fileOutputDir,
            reports: reports,
            duration: duration,
        };
        
    } catch (error) {
        log(`处理失败: ${error.message}`, 'ERROR');
        return {
            success: false,
            error: error.message,
        };
    }
}

// ============== 命令行入口 ==============

async function main() {
    const args = process.argv.slice(2);
    let inputPath = null;
    let outputDir = CONFIG.outputDir;
    
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--input':
            case '-i':
                inputPath = args[++i];
                break;
            case '--output':
            case '-o':
                outputDir = args[++i];
                break;
            case '--help':
            case '-h':
                console.log(`
Sorryios AI 自动化处理系统

用法:
  node main-processor.js --input <文件路径> [--output <输出目录>]

参数:
  --input, -i    输入文件路径（音频或文本）
  --output, -o   输出目录（默认: ./output）
  --help, -h     显示帮助信息

支持的文件类型:
  音频: ${CONFIG.supportedAudio.join(', ')}
  文本: ${CONFIG.supportedText.join(', ')}

示例:
  node main-processor.js -i "课堂录音.mp3" -o "./results"
  node main-processor.js -i "笔记.txt"
                `);
                process.exit(0);
        }
    }
    
    if (!inputPath) {
        console.error('错误: 请指定输入文件');
        console.error('使用 --help 查看帮助');
        process.exit(1);
    }
    
    if (!fs.existsSync(inputPath)) {
        console.error(`错误: 文件不存在: ${inputPath}`);
        process.exit(1);
    }
    
    const result = await processFile(inputPath, outputDir);
    process.exit(result.success ? 0 : 1);
}

if (require.main === module) {
    main().catch(error => {
        console.error('致命错误:', error);
        process.exit(1);
    });
}

module.exports = { processFile };