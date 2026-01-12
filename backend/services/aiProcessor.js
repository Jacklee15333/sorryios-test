/**
 * AI 处理器服务 - 增强版 v2.1
 * 
 * 【v2.1 更新】
 * 1. 修复中文文件名乱码问题
 * 2. 支持用户自定义标题
 * 3. 默认标题格式：X月X日课堂笔记
 * 
 * 原有功能：
 * 1. 超时检测 - 单个片段处理超时自动重试
 * 2. 自动重启 - 浏览器卡死时自动重启继续
 * 3. 断点续传 - 保存已完成片段，重启后继续处理
 * 4. 进度持久化 - 任务进度保存到文件
 */

const fs = require('fs');
const path = require('path');

const { TextSplitter } = require('../lib/text-splitter');
const { SorryiosAutomation } = require('../lib/sorryios-automation');
const ReportGenerator = require('../lib/report-generator');

const taskQueue = require('./taskQueue');

// 配置
const CONFIG = {
    maxSegmentLength: 6000,
    requestInterval: 15000,      // 片段间等待时间 15秒
    outputDir: path.join(__dirname, '../outputs'),
    progressDir: path.join(__dirname, '../data/progress'),
    
    // 重试配置
    maxRetries: 2,               // 单个片段最大重试次数（减少，因为会自动重启）
    browserRestartDelay: 5000,   // 浏览器重启等待：5秒
    maxBrowserRestarts: 5,       // 最大浏览器重启次数
    
    systemPrompt: `请分析以下内容，提取关键信息并进行总结。
要求：
1. 识别主要观点和论点
2. 提取重要的事实和数据
3. 总结核心结论
4. 如果有待办事项或行动点，请列出`
};

// ============================================
// 标题处理函数（修复乱码 + 自定义标题）
// ============================================

/**
 * 生成默认标题
 * 格式: X月X日课堂笔记
 */
function generateDefaultTitle() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    return `${month}月${day}日课堂笔记`;
}

/**
 * 检测字符串是否包含乱码
 */
function isGarbled(str) {
    if (!str) return true;
    
    // 常见乱码特征字符（Latin-1 错误解码 UTF-8 产生的字符）
    const garbledPattern = /[\u00c0-\u00ff]{2,}|Ã|â|ã|å|æ|ç|è|é|ê|ë|ì|í|î|ï/;
    
    if (garbledPattern.test(str)) {
        return true;
    }
    
    // 检查中文字符比例
    const chineseChars = (str.match(/[\u4e00-\u9fa5]/g) || []).length;
    const totalChars = str.length;
    
    // 如果文件名长度足够但没有中文，可能是乱码
    if (totalChars > 5 && chineseChars === 0) {
        return true;
    }
    
    return false;
}

/**
 * 尝试修复乱码文件名
 */
function tryFixGarbledName(garbledStr) {
    try {
        // 尝试将字符串当作 Latin-1 编码，转换回 UTF-8
        const buffer = Buffer.from(garbledStr, 'latin1');
        const fixed = buffer.toString('utf8');
        
        if (/[\u4e00-\u9fa5]/.test(fixed)) {
            console.log(`✅ 文件名修复成功: "${garbledStr}" -> "${fixed}"`);
            return fixed;
        }
    } catch (e) {}
    
    try {
        // 尝试 URI 解码
        const decoded = decodeURIComponent(garbledStr);
        if (/[\u4e00-\u9fa5]/.test(decoded)) {
            console.log(`✅ 文件名URI解码成功: "${garbledStr}" -> "${decoded}"`);
            return decoded;
        }
    } catch (e) {}
    
    return null;
}

/**
 * 获取最终报告标题
 * 优先级：
 * 1. 用户自定义标题（如果有）
 * 2. 原始文件名（如果正常）
 * 3. 修复后的文件名（如果乱码可修复）
 * 4. 默认格式 X月X日课堂笔记
 */
function getFinalTitle(task) {
    const { file, customTitle } = task;
    
    // 1. 优先使用用户自定义标题
    if (customTitle && customTitle.trim()) {
        console.log(`📝 使用自定义标题: "${customTitle}"`);
        return customTitle.trim();
    }
    
    // 2. 检查原始文件名
    const baseName = path.basename(file.originalName, path.extname(file.originalName));
    
    if (!isGarbled(baseName)) {
        console.log(`📄 使用文件名作为标题: "${baseName}"`);
        return baseName;
    }
    
    console.log(`⚠️ 检测到文件名可能是乱码: "${baseName}"`);
    
    // 3. 尝试修复乱码
    const fixedName = tryFixGarbledName(baseName);
    if (fixedName) {
        return path.basename(fixedName, path.extname(fixedName));
    }
    
    // 4. 使用默认格式
    const defaultTitle = generateDefaultTitle();
    console.log(`📝 使用默认标题: "${defaultTitle}"`);
    return defaultTitle;
}

// ============================================
// 原有功能代码
// ============================================

/**
 * 获取任务进度文件路径
 */
function getProgressFilePath(taskId) {
    return path.join(CONFIG.progressDir, `${taskId}.json`);
}

/**
 * 保存任务进度
 */
function saveProgress(taskId, progressData) {
    if (!fs.existsSync(CONFIG.progressDir)) {
        fs.mkdirSync(CONFIG.progressDir, { recursive: true });
    }
    const filePath = getProgressFilePath(taskId);
    fs.writeFileSync(filePath, JSON.stringify(progressData, null, 2), 'utf-8');
    console.log(`💾 进度已保存: ${progressData.completedCount}/${progressData.totalSegments} 片段`);
}

/**
 * 加载任务进度
 */
function loadProgress(taskId) {
    const filePath = getProgressFilePath(taskId);
    if (fs.existsSync(filePath)) {
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            console.log(`📂 加载已保存进度: 已完成 ${data.completedCount}/${data.totalSegments} 片段`);
            return data;
        } catch (e) {
            console.error('加载进度失败:', e.message);
        }
    }
    return null;
}

/**
 * 删除任务进度文件
 */
function clearProgress(taskId) {
    const filePath = getProgressFilePath(taskId);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ 进度文件已清理`);
    }
}

/**
 * 辅助函数：延迟
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带超时的 Promise 包装
 */
function withTimeout(promise, ms, errorMsg = '操作超时') {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(errorMsg)), ms);
    });
    
    return Promise.race([
        promise.finally(() => clearTimeout(timeoutId)),
        timeoutPromise
    ]);
}

/**
 * 初始化浏览器并登录
 */
async function initBrowser() {
    console.log('🌐 初始化浏览器...');
    const automation = new SorryiosAutomation();
    
    await withTimeout(
        automation.init(),
        60000,
        '浏览器启动超时 (60秒)'
    );
    console.log('🌐 浏览器已启动');
    
    await withTimeout(
        automation.login(),
        60000,
        '登录超时 (60秒)'
    );
    console.log('🔐 登录成功');
    
    await withTimeout(
        automation.selectIdleAccount(),
        30000,
        '选择账号超时 (30秒)'
    );
    console.log('✅ AI账号已就绪');
    
    return automation;
}

/**
 * 安全关闭浏览器
 */
async function closeBrowser(automation) {
    if (automation) {
        try {
            await automation.close();
            console.log('🔒 浏览器已关闭');
        } catch (e) {
            console.error('关闭浏览器失败:', e.message);
            try {
                const { exec } = require('child_process');
                exec('taskkill /F /IM chromium.exe /T', () => {});
                exec('taskkill /F /IM chrome.exe /T', () => {});
            } catch (e2) {}
        }
    }
    await sleep(2000);
}

/**
 * 处理单个片段（带重试）
 */
async function processSegmentWithRetry(automation, message, segmentIndex, totalSegments, maxRetries = CONFIG.maxRetries) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[片段 ${segmentIndex + 1}/${totalSegments}] 尝试 ${attempt}/${maxRetries}`);
            
            const response = await automation.sendMessage(message);
            
            console.log(`✅ 片段 ${segmentIndex + 1} 处理成功`);
            
            return {
                index: segmentIndex,
                input: message,
                output: typeof response === 'object' ? response.text : response,
                outputHtml: typeof response === 'object' ? (response.html || '') : '',
                success: true,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            lastError = error;
            console.error(`❌ 片段 ${segmentIndex + 1} 尝试 ${attempt} 失败:`, error.message);
            
            const needsBrowserRestart = 
                error.message.includes('卡死') ||
                error.message.includes('超时') ||
                error.message.includes('timeout') ||
                error.message.includes('无活动') ||
                error.message.includes('Target closed') ||
                error.message.includes('Session closed') ||
                error.message.includes('Protocol error') ||
                error.message.includes('Navigation') ||
                error.message.includes('browser') ||
                error.message.includes('Execution context') ||
                error.message.includes('找不到');
            
            if (needsBrowserRestart) {
                throw error;
            }
            
            if (attempt < maxRetries) {
                console.log(`⏳ 等待 ${CONFIG.requestInterval / 1000} 秒后重试...`);
                await sleep(CONFIG.requestInterval);
            }
        }
    }
    
    return {
        index: segmentIndex,
        input: message,
        output: `处理失败: ${lastError?.message || '未知错误'}`,
        outputHtml: '',
        success: false,
        timestamp: new Date().toISOString()
    };
}

/**
 * 处理单个任务（增强版）
 */
async function processTask(task, onProgress) {
    const { file } = task;
    const taskId = task.id;
    let automation = null;
    let results = [];
    let segmentTexts = [];
    let totalSegments = 0;
    let startIndex = 0;
    let browserRestartCount = 0;
    let needNewConversation = true;

    try {
        // ========== 阶段1: 读取文件 ==========
        onProgress({ currentStep: '读取文件...', progress: 5 });

        const content = fs.readFileSync(file.savedPath, 'utf-8');
        console.log(`📄 文件读取完成: ${content.length} 字符`);

        // ========== 阶段2: 文本分段 ==========
        onProgress({ currentStep: '智能分段中...', progress: 10 });

        const splitter = new TextSplitter({
            maxSegmentLength: CONFIG.maxSegmentLength,
            minSegmentLength: 200
        });
        const segments = splitter.split(content);
        segmentTexts = segments.map(s => typeof s === 'object' ? s.content : s);
        totalSegments = segmentTexts.length;

        console.log(`📝 分段完成: ${totalSegments} 段`);

        // ========== 阶段3: 检查是否有已保存的进度 ==========
        const savedProgress = loadProgress(taskId);
        if (savedProgress && savedProgress.results && savedProgress.completedCount > 0) {
            results = savedProgress.results;
            startIndex = savedProgress.completedCount;
            needNewConversation = true;
            
            console.log(`📂 从片段 ${startIndex + 1} 继续处理`);
            
            onProgress({
                currentStep: `恢复进度: 从片段 ${startIndex + 1} 继续...`,
                progress: 15 + Math.round((startIndex / totalSegments) * 60),
                totalSegments: totalSegments,
                processedSegments: startIndex
            });
        } else {
            results = new Array(totalSegments).fill(null);
            
            onProgress({
                currentStep: `已分割为 ${totalSegments} 段`,
                progress: 15,
                totalSegments: totalSegments,
                processedSegments: 0
            });
        }

        // ========== 阶段4: 逐个处理片段 ==========
        const progressPerSegment = 60 / totalSegments;
        let currentIndex = startIndex;
        
        while (currentIndex < totalSegments) {
            if (!automation) {
                if (browserRestartCount >= CONFIG.maxBrowserRestarts) {
                    throw new Error(`浏览器重启次数过多 (${CONFIG.maxBrowserRestarts}次)，任务终止`);
                }
                
                const stepMsg = browserRestartCount > 0 
                    ? `重启浏览器 (第${browserRestartCount + 1}次)...` 
                    : '启动浏览器...';
                    
                onProgress({ currentStep: stepMsg, progress: 18 });
                
                try {
                    automation = await initBrowser();
                    browserRestartCount++;
                    needNewConversation = true;
                } catch (browserError) {
                    console.error('❌ 浏览器初始化失败:', browserError.message);
                    await sleep(CONFIG.browserRestartDelay);
                    continue;
                }
            }
            
            onProgress({
                currentStep: `处理第 ${currentIndex + 1}/${totalSegments} 段...`,
                progress: Math.round(25 + (currentIndex * progressPerSegment)),
                processedSegments: currentIndex
            });
            
            let message;
            if (needNewConversation) {
                message = `${CONFIG.systemPrompt}\n\n---\n\n${segmentTexts[currentIndex]}`;
                needNewConversation = false;
            } else {
                message = segmentTexts[currentIndex];
            }
            
            try {
                const result = await processSegmentWithRetry(
                    automation,
                    message,
                    currentIndex,
                    totalSegments
                );
                
                result.input = segmentTexts[currentIndex];
                results[currentIndex] = result;
                
                const completedCount = results.filter(r => r && r.success).length;
                
                saveProgress(taskId, {
                    taskId: taskId,
                    totalSegments: totalSegments,
                    completedCount: currentIndex + 1,
                    successCount: completedCount,
                    results: results,
                    lastUpdated: new Date().toISOString()
                });
                
                currentIndex++;
                
                if (currentIndex < totalSegments) {
                    console.log(`⏳ 等待 ${CONFIG.requestInterval / 1000} 秒后处理下一片段...`);
                    await sleep(CONFIG.requestInterval);
                }
                
            } catch (segmentError) {
                console.error(`❌ 片段处理出错:`, segmentError.message);
                
                console.log('🔄 检测到异常，准备重启浏览器...');
                await closeBrowser(automation);
                automation = null;
                needNewConversation = true;
                await sleep(CONFIG.browserRestartDelay);
            }
        }

        // ========== 阶段5: 生成报告 ==========
        onProgress({ currentStep: '生成报告...', progress: 88 });

        const timestamp = Date.now();
        
        // 【核心修改】获取最终标题
        const finalTitle = getFinalTitle(task);
        
        const taskShortId = taskId.slice(0, 8);
        const outputSubDir = `task_${taskShortId}_${timestamp}`;
        const outputPath = path.join(CONFIG.outputDir, outputSubDir);
        
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, { recursive: true });
        }

        const reportSegments = results.map((r, i) => ({
            segmentIndex: r?.index ?? i,
            segmentText: r?.input ?? segmentTexts[i] ?? '',
            originalLength: (r?.input ?? segmentTexts[i] ?? '').length,
            response: r?.success ? { text: r.output, html: r.outputHtml } : (r?.output || '处理失败'),
            error: !r?.success
        }));

        const reportGenerator = new ReportGenerator({ outputDir: outputPath });

        const successCount = results.filter(r => r?.success).length;
        const failCount = results.filter(r => r && !r.success).length;
        
        const reportData = {
            title: finalTitle,  // 使用最终标题
            segments: reportSegments,
            metadata: {
                originalFile: file.originalName,
                totalCharacters: content.length,
                totalSegments: totalSegments,
                successCount: successCount,
                failCount: failCount,
                browserRestarts: browserRestartCount,
                processedAt: new Date().toISOString()
            }
        };

        const { html: htmlPath, markdown: mdPath } = reportGenerator.saveAll(reportData, 'report');

        const jsonPath = path.join(outputPath, 'result.json');
        fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2), 'utf-8');

        console.log(`📊 报告已生成: ${outputPath}`);
        console.log(`   标题: ${finalTitle}`);
        console.log(`   成功: ${successCount}/${totalSegments}, 失败: ${failCount}, 浏览器重启: ${browserRestartCount}次`);

        clearProgress(taskId);

        onProgress({ currentStep: '处理完成！', progress: 100 });

        return {
            outputDir: outputSubDir,
            title: finalTitle,
            files: {
                html: `${outputSubDir}/report.html`,
                markdown: `${outputSubDir}/report.md`,
                json: `${outputSubDir}/result.json`
            },
            stats: {
                totalSegments: totalSegments,
                successCount: successCount,
                failCount: failCount,
                totalCharacters: content.length,
                browserRestarts: browserRestartCount
            }
        };

    } catch (error) {
        const completedCount = results.filter(r => r).length;
        if (completedCount > 0) {
            saveProgress(taskId, {
                taskId: taskId,
                totalSegments: totalSegments,
                completedCount: completedCount,
                successCount: results.filter(r => r?.success).length,
                results: results,
                lastUpdated: new Date().toISOString(),
                error: error.message
            });
            console.log(`💾 错误发生，进度已保存 (${completedCount}/${totalSegments})，可重新上传文件继续`);
        }
        throw error;
        
    } finally {
        await closeBrowser(automation);
    }
}

/**
 * 初始化处理器
 */
function init() {
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }
    
    if (!fs.existsSync(CONFIG.progressDir)) {
        fs.mkdirSync(CONFIG.progressDir, { recursive: true });
    }

    taskQueue.setProcessor(processTask);
    
    checkUnfinishedTasks();
    
    console.log('✅ AI处理器已初始化 (v2.1 - 支持自定义标题)');
}

/**
 * 检查未完成的任务
 */
function checkUnfinishedTasks() {
    try {
        if (!fs.existsSync(CONFIG.progressDir)) return;
        
        const files = fs.readdirSync(CONFIG.progressDir);
        const progressFiles = files.filter(f => f.endsWith('.json'));
        
        if (progressFiles.length > 0) {
            console.log(`\n📋 发现 ${progressFiles.length} 个未完成的任务:`);
            progressFiles.forEach(f => {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(CONFIG.progressDir, f), 'utf-8'));
                    const taskShortId = f.replace('.json', '').slice(0, 8);
                    console.log(`   - 任务 ${taskShortId}...: ${data.completedCount || 0}/${data.totalSegments} 片段已完成`);
                } catch (e) {}
            });
            console.log(`   💡 重新上传相同任务的文件可继续处理\n`);
        }
    } catch (e) {}
}

module.exports = {
    init,
    processTask,
    CONFIG,
    loadProgress,
    clearProgress,
    getFinalTitle,
    generateDefaultTitle
};