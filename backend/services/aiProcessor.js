/**
 * AI 处理器服务 - 英语课堂专用版 v3.1
 * 
 * 【v3.1 更新】
 * 1. 使用英语课堂专用提示词（2大类：词汇基础 + 语法知识）
 * 2. 使用专用报告生成器（漂亮的HTML样式）
 * 3. 支持单词变形、短语模板、语法卡片
 * 4. 保留断点续传、自动重启等功能
 * 
 * @author Sorryios AI Team
 * @version 3.1.0
 * @date 2026-01-13
 */

const fs = require('fs');
const path = require('path');

const { TextSplitter } = require('../lib/text-splitter');
const { SorryiosAutomation } = require('../lib/sorryios-automation');
const EnglishReportGenerator = require('./english-report-generator');

const taskQueue = require('./taskQueue');

// ============================================
// 配置
// ============================================

const CONFIG = {
    maxSegmentLength: 6000,
    requestInterval: 15000,      // 片段间等待时间 15秒
    outputDir: path.join(__dirname, '../outputs'),
    progressDir: path.join(__dirname, '../data/progress'),
    
    // 重试配置
    maxRetries: 2,               // 单个片段最大重试次数
    browserRestartDelay: 5000,   // 浏览器重启等待：5秒
    maxBrowserRestarts: 5,       // 最大浏览器重启次数
    
    // ============================================
    // 🆕 v3.2 英语课堂专用提示词（精简版）
    // ============================================
    systemPrompt: `直接输出JSON，第一个字符是{，最后一个字符是}
禁止：开头语（好的/以下是/根据）、结尾语、\`\`\`代码块

⚠️⚠️⚠️【最重要规则：含语法术语必须放grammar，不能放phrases/patterns】⚠️⚠️⚠️
以下词语是语法术语，只要出现在内容或含义中，必须归入grammar：
中文：主语、谓语、宾语、补语、定语、状语、动词、名词、形容词、副词、第三人称单数、单数、复数、时态、语态、否定句、疑问句、一般疑问句、特殊疑问句、感叹句、祈使句、从句、宾语从句、定语从句、不定式、动名词、分词、现在分词、过去分词、被动语态、现在完成时、一般过去时、一般现在时、动词原形
英文：subject, predicate, object, verb, noun, adjective, adverb, third person singular, tense, clause, infinitive, gerund, participle, passive voice

❌ 这些必须放grammar（绝对不能放phrases/patterns）：
- "to do sth. 不定式" → 含"不定式"，必须放grammar！
- "do/does/did + 主语 + 动词原形" → 含"主语、动词原形"，放grammar
- "第三人称单数 + v.-s" → 含"第三人称单数"，放grammar  
- "doing sth. + v.-s 动名词短语作主语" → 含"动名词、主语"，放grammar
- "some → any（否定句/疑问句）" → 含"否定句、疑问句"，放grammar
- "doesn't have sth. 一般现在时否定" → 含"一般现在时"，放grammar
- "v.-ing 现在分词" → 含"现在分词"，放grammar
- "have/has + done 现在完成时" → 含"现在完成时"，放grammar

✅ 这些可以放phrases/patterns（不含任何语法术语）：
- "look forward to doing sth. 期待做某事" → 放phrases
- "so...that... 如此...以至于..." → 放patterns
- "help sb. (to) do sth. 帮助某人做某事" → 放phrases

你是英语教学助手，提取课堂内容分为【词汇基础】和【语法知识】两类。

【分类规则】
1. 词汇基础（需要"记住"）：
   - 单词：提供音标、词性、含义、例句；不规则动词列出变形
   - 短语：固定搭配模板，不含语法术语（如 look forward to doing sth.）
   - 句型：句子模板，不含语法术语（如 so...that...）

2. 语法知识（需要"理解"）：
   - 时态、语态、从句、句子成分等语法规则
   - 词汇辨析（如 tell/say/speak 的区别）
   - ⚠️ 任何含语法术语的内容
   
⚠️【语法卡片要求】
- definition：详细解释这个语法点是什么，不要太简略
- structure：给出清晰的结构公式
- usage：列出2-4个常见用法场景，结合你的语法知识补充完整
- mistakes：列出1-2个学生常见错误，格式必须是 {"wrong":"错误写法","correct":"正确写法","explanation":"解释"}，如果没有易错点就写空数组 []
- examples：给出2-3个典型例句

【其他规则】
规则A：短语/句型必须泛化为通用模板
⚠️ AI必须主动判断，把具体内容泛化为通用形式！
- 具体名词 → sb./sth./sw.
- 具体动词 → do/doing
- 具体形容词 → adj.
- 具体时间/金额 → time/money

❌ 错误（太具体）→ ✅ 正确（通用模板）：
- "help sb. make progress" → "help sb. (to) do sth." （make progress 是具体动作）
- "spend the whole summer" → "spend time/money (in) doing sth." （the whole summer 是具体时间）
- "low-cost house" → "low-cost" 或不收录（house 是具体名词，low-cost 本身就是形容词）
- "protect the environment" → "protect sth."
- "turn off the light" → "turn off sth."
- "build houses for families" → "build sth. for sb."
- "share ideas on a website" → "share sth. on sth."

规则B：使用标准缩写
sb.=某人  sth.=某事  sw.=某地  doing=动名词  to do=不定式  adj.=形容词

规则C：短语和句型必须有例句！

【输出格式】直接输出（无代码块）：
{"vocabulary":{"words":[{"word":"","phonetic":"","pos":"","meaning":"","forms":{},"example":"","note":""}],"phrases":[{"phrase":"","meaning":"","example":""}],"patterns":[{"pattern":"","meaning":"","example":""}]},"grammar":[{"title":"第三人称单数","definition":"当主语是第三人称单数（he/she/it/单个人或物）时，一般现在时的谓语动词要加-s或-es","structure":"第三人称单数主语 + 动词-s/es","usage":["描述习惯性动作：He works every day.","描述客观事实：The sun rises in the east.","描述现在状态：She likes music."],"mistakes":[{"wrong":"He work hard.","correct":"He works hard.","explanation":"第三人称单数主语后动词要加s"}],"examples":["She plays piano well.","It looks beautiful.","Tom goes to school by bus."]}],"summary":{"total_words":0,"total_phrases":0,"total_patterns":0,"total_grammar":0}}

【待分析内容】
---`
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
            // 静默失败，尝试其他方法
        }

        // 方法2：提取 {...} 部分
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const result = JSON.parse(jsonMatch[0]);
                console.log('[JsonExtractor] ✓ JSON提取成功');
                return result;
            } catch (e) {
                // 继续尝试
            }
        }

        // 方法3：提取 ```json ... ``` 代码块
        const codeBlockMatch = text.match(/```json?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            try {
                const result = JSON.parse(codeBlockMatch[1].trim());
                console.log('[JsonExtractor] ✓ JSON提取成功（代码块）');
                return result;
            } catch (e) {
                // 继续尝试
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
            
            const result = JSON.parse(fixed);
            console.log('[JsonExtractor] ✓ JSON修复成功');
            return result;
        } catch (e) {
            // 最后失败
        }

        console.error('[JsonExtractor] ✗ JSON解析失败');
        return null;
    }
}

// ============================================
// 结果合并器
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

        // 去重
        merged.vocabulary.words = this.dedupeByKey(merged.vocabulary.words, 'word');
        merged.vocabulary.phrases = this.dedupeByKey(merged.vocabulary.phrases, 'phrase');
        merged.vocabulary.patterns = this.dedupeByKey(merged.vocabulary.patterns, 'pattern');
        merged.grammar = this.dedupeByKey(merged.grammar, 'title');

        // 更新统计
        merged.summary = {
            total_words: merged.vocabulary.words.length,
            total_phrases: merged.vocabulary.phrases.length,
            total_patterns: merged.vocabulary.patterns.length,
            total_grammar: merged.grammar.length
        };

        return merged;
    }
}

// ============================================
// 单词过滤器（过滤小学词汇和黑名单）
// ============================================

class WordFilter {
    constructor() {
        this.elementaryWords = new Set();
        this.blacklistWords = new Set();
        this.loadWordLists();
    }

    loadWordLists() {
        const elementaryPath = path.join(__dirname, '../data/elementary_words.json');
        const blacklistPath = path.join(__dirname, '../data/blacklist_words.json');

        try {
            if (fs.existsSync(elementaryPath)) {
                const data = JSON.parse(fs.readFileSync(elementaryPath, 'utf-8'));
                this.elementaryWords = new Set(data.words.map(w => w.toLowerCase()));
                console.log(`[WordFilter] 加载小学词汇: ${this.elementaryWords.size} 个`);
            }
        } catch (e) {
            console.warn('[WordFilter] 加载小学词汇失败:', e.message);
        }

        try {
            if (fs.existsSync(blacklistPath)) {
                const data = JSON.parse(fs.readFileSync(blacklistPath, 'utf-8'));
                this.blacklistWords = new Set(data.words.map(w => w.toLowerCase()));
                console.log(`[WordFilter] 加载黑名单词汇: ${this.blacklistWords.size} 个`);
            }
        } catch (e) {
            console.warn('[WordFilter] 加载黑名单词汇失败:', e.message);
        }
    }

    filter(data) {
        if (!data || !data.vocabulary) return data;

        let filtered = JSON.parse(JSON.stringify(data));
        const originalCount = filtered.vocabulary.words ? filtered.vocabulary.words.length : 0;

        if (filtered.vocabulary.words) {
            filtered.vocabulary.words = filtered.vocabulary.words.filter(item => {
                const word = (item.word || '').toLowerCase();
                if (this.elementaryWords.has(word)) return false;
                if (this.blacklistWords.has(word)) return false;
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
// 标题处理函数
// ============================================

function generateDefaultTitle() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    return `${month}月${day}日英语课堂笔记`;
}

function isGarbled(str) {
    if (!str) return true;
    const garbledPattern = /[\u00c0-\u00ff]{2,}|Ã|â|ã|å|æ|ç|è|é|ê|ë|ì|í|î|ï/;
    if (garbledPattern.test(str)) return true;
    const chineseChars = (str.match(/[\u4e00-\u9fa5]/g) || []).length;
    const totalChars = str.length;
    if (totalChars > 5 && chineseChars === 0) return true;
    return false;
}

function tryFixGarbledName(garbledStr) {
    try {
        const buffer = Buffer.from(garbledStr, 'latin1');
        const fixed = buffer.toString('utf8');
        if (/[\u4e00-\u9fa5]/.test(fixed)) {
            console.log(`✅ 文件名修复成功: "${garbledStr}" -> "${fixed}"`);
            return fixed;
        }
    } catch (e) {}
    try {
        const decoded = decodeURIComponent(garbledStr);
        if (/[\u4e00-\u9fa5]/.test(decoded)) {
            console.log(`✅ 文件名URI解码成功: "${garbledStr}" -> "${decoded}"`);
            return decoded;
        }
    } catch (e) {}
    return null;
}

function getFinalTitle(task) {
    const { file, customTitle } = task;
    
    if (customTitle && customTitle.trim()) {
        console.log(`📝 使用自定义标题: "${customTitle}"`);
        return customTitle.trim();
    }
    
    const baseName = path.basename(file.originalName, path.extname(file.originalName));
    
    if (!isGarbled(baseName)) {
        console.log(`📄 使用文件名作为标题: "${baseName}"`);
        return baseName;
    }
    
    console.log(`⚠️ 检测到文件名可能是乱码: "${baseName}"`);
    
    const fixedName = tryFixGarbledName(baseName);
    if (fixedName) {
        return path.basename(fixedName, path.extname(fixedName));
    }
    
    const defaultTitle = generateDefaultTitle();
    console.log(`📝 使用默认标题: "${defaultTitle}"`);
    return defaultTitle;
}

// ============================================
// 进度管理
// ============================================

function getProgressFilePath(taskId) {
    return path.join(CONFIG.progressDir, `${taskId}.json`);
}

function saveProgress(taskId, progressData) {
    if (!fs.existsSync(CONFIG.progressDir)) {
        fs.mkdirSync(CONFIG.progressDir, { recursive: true });
    }
    const filePath = getProgressFilePath(taskId);
    fs.writeFileSync(filePath, JSON.stringify(progressData, null, 2), 'utf-8');
    console.log(`💾 进度已保存: ${progressData.completedCount}/${progressData.totalSegments} 片段`);
}

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

function clearProgress(taskId) {
    const filePath = getProgressFilePath(taskId);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ 进度文件已清理`);
    }
}

// ============================================
// 辅助函数
// ============================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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

// ============================================
// 浏览器管理
// ============================================

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

// ============================================
// 片段处理
// ============================================

async function processSegmentWithRetry(automation, message, index, total) {
    const maxRetries = CONFIG.maxRetries;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`📤 发送片段 ${index + 1}/${total} (尝试 ${attempt}/${maxRetries})`);
            
            const responsePromise = automation.sendMessage(message);
            const response = await withTimeout(
                responsePromise,
                300000,  // 5分钟超时
                `片段 ${index + 1} 响应超时`
            );
            
            const responseText = typeof response === 'object' ? response.text : response;
            
            // 解析JSON
            const parsed = JsonExtractor.extract(responseText);
            
            if (parsed) {
                console.log(`✅ 片段 ${index + 1} 处理成功`);
                return {
                    index: index,
                    success: true,
                    output: parsed,
                    outputRaw: responseText,
                    attempt: attempt
                };
            } else {
                throw new Error('JSON解析失败');
            }
            
        } catch (error) {
            console.error(`❌ 片段 ${index + 1} 尝试 ${attempt} 失败:`, error.message);
            
            if (attempt < maxRetries) {
                console.log(`⏳ 等待 ${CONFIG.browserRestartDelay / 1000} 秒后重试...`);
                await sleep(CONFIG.browserRestartDelay);
            }
        }
    }
    
    return {
        index: index,
        success: false,
        error: `所有 ${maxRetries} 次尝试都失败`
    };
}

// ============================================
// 主处理函数
// ============================================

async function processTask(task, onProgress) {
    const { id: taskId, file } = task;
    
    console.log('\n' + '='.repeat(60));
    console.log('🎓 英语课堂智能分析系统 v3.1');
    console.log('='.repeat(60));
    console.log(`📁 任务ID: ${taskId}`);
    console.log(`📄 文件: ${file.originalName}`);
    console.log('='.repeat(60) + '\n');

    let automation = null;
    let results = [];
    let segmentTexts = [];
    let totalSegments = 0;
    let startIndex = 0;
    let needNewConversation = false;
    let browserRestartCount = 0;
    
    // 初始化过滤器
    const wordFilter = new WordFilter();

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

        // ========== 阶段3: 检查已保存进度 ==========
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
            
            // 构建消息（首次包含系统提示词）
            let message;
            if (needNewConversation) {
                message = `${CONFIG.systemPrompt}\n${segmentTexts[currentIndex]}\n---`;
                needNewConversation = false;
            } else {
                // 后续片段也需要提示词，确保输出JSON
                message = `继续分析以下内容，按相同的JSON格式输出：\n\n${segmentTexts[currentIndex]}`;
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

        // ========== 阶段5: 合并结果 ==========
        onProgress({ currentStep: '合并分析结果...', progress: 85 });
        
        const successResults = results
            .filter(r => r && r.success && r.output)
            .map(r => r.output);
        
        let mergedData = ResultMerger.merge(successResults);

        // ========== 阶段6: 过滤词汇 ==========
        onProgress({ currentStep: '过滤基础词汇...', progress: 88 });
        
        mergedData = wordFilter.filter(mergedData);

        // ========== 阶段7: 生成报告 ==========
        onProgress({ currentStep: '生成精美报告...', progress: 92 });

        const timestamp = Date.now();
        const finalTitle = getFinalTitle(task);
        
        const taskShortId = taskId.slice(0, 8);
        const outputSubDir = `task_${taskShortId}_${timestamp}`;
        const outputPath = path.join(CONFIG.outputDir, outputSubDir);
        
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, { recursive: true });
        }

        // 使用英语专用报告生成器
        const reportGenerator = new EnglishReportGenerator({ outputDir: outputPath });
        
        // 添加元数据
        mergedData.metadata = {
            taskId: taskId,
            originalFile: file.originalName,
            processedAt: new Date().toISOString(),
            totalSegments: totalSegments,
            successCount: successResults.length,
            failCount: totalSegments - successResults.length,
            browserRestarts: browserRestartCount
        };

        // 生成所有格式的报告
        const reports = reportGenerator.saveAll(mergedData, 'report', finalTitle);

        console.log(`\n📊 报告已生成: ${outputPath}`);
        console.log(`   标题: ${finalTitle}`);
        console.log(`   单词: ${mergedData.summary.total_words}`);
        console.log(`   短语: ${mergedData.summary.total_phrases}`);
        console.log(`   句型: ${mergedData.summary.total_patterns}`);
        console.log(`   语法: ${mergedData.summary.total_grammar}`);

        clearProgress(taskId);

        onProgress({ currentStep: '处理完成！', progress: 100 });

        return {
            outputDir: outputSubDir,
            title: finalTitle,
            files: {
                html: `${outputSubDir}/report.html`,
                markdown: `${outputSubDir}/report.md`,
                json: `${outputSubDir}/report.json`
            },
            stats: {
                totalSegments: totalSegments,
                successCount: successResults.length,
                failCount: totalSegments - successResults.length,
                totalCharacters: content.length,
                browserRestarts: browserRestartCount,
                vocabulary: {
                    words: mergedData.summary.total_words,
                    phrases: mergedData.summary.total_phrases,
                    patterns: mergedData.summary.total_patterns,
                    grammar: mergedData.summary.total_grammar
                }
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

// ============================================
// 初始化
// ============================================

function init() {
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }
    
    if (!fs.existsSync(CONFIG.progressDir)) {
        fs.mkdirSync(CONFIG.progressDir, { recursive: true });
    }

    taskQueue.setProcessor(processTask);
    
    checkUnfinishedTasks();
    
    console.log('');
    console.log('='.repeat(60));
    console.log('  🎓 英语课堂智能分析系统 v3.1 已就绪');
    console.log('  📚 输出结构：词汇基础(单词/短语/句型) + 语法知识(卡片)');
    console.log('='.repeat(60));
    console.log('');
}

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

// ============================================
// 导出
// ============================================

module.exports = {
    init,
    processTask,
    CONFIG,
    loadProgress,
    clearProgress,
    getFinalTitle,
    generateDefaultTitle,
    JsonExtractor,
    ResultMerger,
    WordFilter
};