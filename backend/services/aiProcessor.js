/**
 * AI 处理器服务
 * 
 * 封装核心处理流程：
 * 1. 读取文件
 * 2. 文本分段 (text-splitter)
 * 3. 逐段发送AI处理 (sorryios-automation)
 * 4. 生成报告 (report-generator)
 * 
 * 注意：需要将现有的核心库复制到 lib 目录
 */

const fs = require('fs');
const path = require('path');

// 核心库（用户需要将现有代码复制到 lib 目录）
// 导入方式需要匹配用户代码的导出格式
const { TextSplitter } = require('../lib/text-splitter');
const { SorryiosAutomation } = require('../lib/sorryios-automation');
const ReportGenerator = require('../lib/report-generator');

const taskQueue = require('./taskQueue');

// 配置
const CONFIG = {
    maxSegmentLength: 6000,      // 每段最大字符数
    requestInterval: 15000,      // 段间等待时间(ms) - 与现有代码保持一致
    responseTimeout: 180000,     // AI响应超时(3分钟)
    outputDir: path.join(__dirname, '../outputs'),
    
    // AI分析的系统提示（可自定义）
    systemPrompt: `请分析以下内容，提取关键信息并进行总结。
要求：
1. 识别主要观点和论点
2. 提取重要的事实和数据
3. 总结核心结论
4. 如果有待办事项或行动点，请列出`
};

/**
 * 处理单个任务
 * @param {Object} task - 任务对象
 * @param {Function} onProgress - 进度回调
 * @returns {Object} 处理结果（报告路径等）
 */
async function processTask(task, onProgress) {
    const { file } = task;
    let automation = null;

    try {
        // ========== 阶段1: 读取文件 ==========
        onProgress({
            currentStep: '读取文件...',
            progress: 5
        });

        const content = fs.readFileSync(file.savedPath, 'utf-8');
        console.log(`📄 文件读取完成: ${content.length} 字符`);

        // ========== 阶段2: 文本分段 ==========
        onProgress({
            currentStep: '智能分段中...',
            progress: 10
        });

        const splitter = new TextSplitter({
            maxSegmentLength: CONFIG.maxSegmentLength,
            minSegmentLength: 200
        });
        const segments = splitter.split(content);
        
        // segments 可能是对象数组 [{content: "..."}] 或字符串数组
        const segmentTexts = segments.map(s => typeof s === 'object' ? s.content : s);
        const totalSegments = segmentTexts.length;

        console.log(`📝 分段完成: ${totalSegments} 段`);

        onProgress({
            currentStep: `已分割为 ${totalSegments} 段`,
            progress: 15,
            totalSegments: totalSegments,
            processedSegments: 0
        });

        // ========== 阶段3: 初始化浏览器自动化 ==========
        onProgress({
            currentStep: '启动浏览器...',
            progress: 18
        });

        automation = new SorryiosAutomation();
        await automation.init();
        console.log('🌐 浏览器已启动');

        // ========== 阶段4: 登录并选择账号 ==========
        onProgress({
            currentStep: '登录中...',
            progress: 20
        });

        await automation.login();
        console.log('🔐 登录成功');

        onProgress({
            currentStep: '选择AI账号...',
            progress: 22
        });

        await automation.selectIdleAccount();
        console.log('✅ AI账号已就绪');

        // ========== 阶段5: 批量处理片段 ==========
        // 使用自定义的进度回调来更新WebSocket
        const progressPerSegment = 60 / totalSegments;
        let currentSegment = 0;

        // 创建一个包装的处理函数来监控进度
        const originalProcessSegments = automation.processSegments.bind(automation);
        
        // 重写log函数来捕获进度
        const originalLog = console.log;
        console.log = (...args) => {
            originalLog.apply(console, args);
            const message = args.join(' ');
            
            // 检测片段处理进度
            const match = message.match(/处理片段 (\d+)\/(\d+)/);
            if (match) {
                currentSegment = parseInt(match[1]);
                onProgress({
                    currentStep: `处理第 ${currentSegment}/${totalSegments} 段...`,
                    progress: Math.round(25 + ((currentSegment - 1) * progressPerSegment)),
                    processedSegments: currentSegment - 1
                });
            }
            
            // 检测片段完成
            if (message.includes('处理成功')) {
                onProgress({
                    processedSegments: currentSegment
                });
            }
        };

        const results = await automation.processSegments(segmentTexts, CONFIG.systemPrompt);
        
        // 恢复原始log
        console.log = originalLog;

        console.log(`🎉 所有片段处理完成: ${results.filter(r => r.success).length}/${totalSegments} 成功`);

        // ========== 阶段6: 生成报告 ==========
        onProgress({
            currentStep: '生成报告...',
            progress: 88
        });

        // 创建输出目录
        const timestamp = Date.now();
        const baseName = path.basename(file.originalName, path.extname(file.originalName));
        const outputSubDir = `${baseName}_${timestamp}`;
        const outputPath = path.join(CONFIG.outputDir, outputSubDir);
        
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, { recursive: true });
        }

        // 转换结果格式以适配报告生成器
        const reportSegments = results.map((r, i) => ({
            segmentIndex: r.index,
            segmentText: r.input,
            originalLength: r.input?.length || 0,
            response: r.success ? { text: r.output, html: r.outputHtml } : r.output,
            error: !r.success
        }));

        const reportGenerator = new ReportGenerator({
            outputDir: outputPath
        });

        const reportData = {
            title: baseName,
            segments: reportSegments,
            metadata: {
                originalFile: file.originalName,
                totalCharacters: content.length,
                totalSegments: totalSegments,
                processedAt: new Date().toISOString()
            }
        };

        // 生成HTML和Markdown报告
        const { html: htmlPath, markdown: mdPath } = reportGenerator.saveAll(reportData, 'report');

        // 保存JSON数据
        const jsonPath = path.join(outputPath, 'result.json');
        fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2), 'utf-8');

        console.log(`📊 报告已生成: ${outputPath}`);

        onProgress({
            currentStep: '处理完成！',
            progress: 100
        });

        return {
            outputDir: outputSubDir,
            files: {
                html: `${outputSubDir}/report.html`,
                markdown: `${outputSubDir}/report.md`,
                json: `${outputSubDir}/result.json`
            },
            stats: {
                totalSegments: totalSegments,
                successCount: results.filter(r => r.success).length,
                failCount: results.filter(r => !r.success).length,
                totalCharacters: content.length
            }
        };

    } finally {
        // 清理：关闭浏览器
        if (automation) {
            try {
                await automation.close();
                console.log('🔒 浏览器已关闭');
            } catch (e) {
                console.error('关闭浏览器失败:', e.message);
            }
        }
    }
}

/**
 * 初始化处理器
 */
function init() {
    // 确保输出目录存在
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }

    // 注册处理器到任务队列
    taskQueue.setProcessor(processTask);
    console.log('✅ AI处理器已初始化');
}

/**
 * 辅助函数：延迟
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    init,
    processTask,
    CONFIG
};
