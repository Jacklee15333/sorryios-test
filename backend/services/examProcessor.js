/**
 * examProcessor.js - 错题识别引擎 v1.0
 * 
 * 核心流水线：
 *   Stage 1: 初始化（读取试卷和图片信息）
 *   Stage 2: 启动浏览器 + 登录 + 选 Thinking 模型
 *   Stage 3: 上传图片 + 发送 Prompt
 *   Stage 4: 等待 AI 响应
 *   Stage 5: 解析 JSON 结果
 *   Stage 6: 存入数据库
 *   Stage 7: 完成/清理
 * 
 * 关键设计决策：
 *   - 不复用 taskQueue（只支持一个 processor）
 *   - 独立管理任务状态（通过 exams 表）
 *   - 直接调用 global.broadcastTaskProgress() 推送进度
 *   - 复用 aiProcessor.js 的 JsonExtractor 做 JSON 解析
 * 
 * ⚠️ 注意：global.broadcastTaskProgress 签名是 (taskId, progress, status, message)
 *    不是传对象！这是 server.js 第279行定义的。
 * 
 * @version 1.0
 * @date 2026-02-09
 */

const path = require('path');
const fs = require('fs');
const { SorryiosAutomation } = require('../lib/sorryios-automation');
const { ExamDB, WrongQuestionDB, ExamSectionDB, ExamImageDB } = require('./wrongQuestionService');

// 复用 aiProcessor.js 的 JsonExtractor
let JsonExtractor = null;
try {
    const aiProcessor = require('./aiProcessor');
    JsonExtractor = aiProcessor.JsonExtractor;
    console.log('[ExamProcessor] ✅ JsonExtractor 已从 aiProcessor 加载');
} catch (e) {
    console.warn('[ExamProcessor] ⚠️ 无法加载 aiProcessor 的 JsonExtractor，使用内置版本');
}

// ============================================
// 内置 JsonExtractor（备用，如果 aiProcessor 加载失败）
// ============================================

if (!JsonExtractor) {
    JsonExtractor = {
        extract(response) {
            if (!response || typeof response !== 'string') return null;
            const text = response.trim();

            // 策略1: 直接解析
            try { return JSON.parse(text); } catch (e) {}

            // 策略2: 提取最外层 {}
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) { try { return JSON.parse(jsonMatch[0]); } catch (e) {} }

            // 策略3: 代码块提取
            const codeBlockMatch = text.match(/```json?\s*([\s\S]*?)```/);
            if (codeBlockMatch) { try { return JSON.parse(codeBlockMatch[1].trim()); } catch (e) {} }

            // 策略4: 基础修复
            try {
                let fixed = text.replace(/^[^{]*/, '').replace(/[^}]*$/, '')
                    .replace(/'/g, '"').replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
                return JSON.parse(fixed);
            } catch (e) {}

            // 策略5: 截断JSON修复
            try {
                let truncated = text.replace(/^[^{]*/, '');
                if (truncated.includes('{')) {
                    truncated = truncated.replace(/,\s*"[^"]*"?\s*:\s*"?[^"{}[\]]*$/, '');
                    truncated = truncated.replace(/,\s*"[^"]*$/, '');
                    let openBraces = 0, openBrackets = 0;
                    let inString = false, escaped = false;
                    for (const ch of truncated) {
                        if (escaped) { escaped = false; continue; }
                        if (ch === '\\') { escaped = true; continue; }
                        if (ch === '"') { inString = !inString; continue; }
                        if (inString) continue;
                        if (ch === '{') openBraces++;
                        else if (ch === '}') openBraces--;
                        else if (ch === '[') openBrackets++;
                        else if (ch === ']') openBrackets--;
                    }
                    if (openBraces > 0 || openBrackets > 0) {
                        let repair = truncated;
                        for (let i = 0; i < openBrackets; i++) repair += ']';
                        for (let i = 0; i < openBraces; i++) repair += '}';
                        const parsed = JSON.parse(repair);
                        console.warn(`[ExamProcessor] ⚠️ 截断JSON已修复 (补全 ${openBrackets}个] ${openBraces}个})`);
                        return parsed;
                    }
                }
            } catch (e) {}

            console.error('[ExamProcessor] ❌ JSON解析全部失败');
            console.error('[ExamProcessor] 📋 响应长度:', text.length);
            console.error('[ExamProcessor] 📋 前200字符:', text.substring(0, 200));
            console.error('[ExamProcessor] 📋 后200字符:', text.substring(Math.max(0, text.length - 200)));
            return null;
        }
    };
    console.log('[ExamProcessor] ✅ 使用内置 JsonExtractor');
}

// ============================================
// 错题识别 Prompt v1.1（分段结构化 + 完整原题 + 排除听力/未作答）
// ============================================

const EXAM_PROMPT = `请仔细分析这份已批改的英语试卷照片，完成以下任务：

【任务1】按大题（section）还原试卷的完整内容，包括文章原文和所有题目。
【任务2】找出被标记为错误的题目（有红色×号、圈、划线等批改痕迹）。
【任务3】对错题进行分析，给出正确答案和错误原因。

请以严格的 JSON 格式返回结果，不要包含任何其他文字说明，只返回 JSON：

{
  "examTitle": "试卷标题（如能识别）",
  "totalQuestions": 识别到的总题数,
  "sections": [
    {
      "sectionName": "大题名称，如 '一、听力理解'、'二、完形填空'、'三、阅读理解A篇'",
      "sectionType": "listening / cloze / reading / grammar / writing / vocabulary / dialogue / other",
      "isListening": true或false,
      "sectionContent": "该大题的完整原文内容，包括：\\n1. 如果有文章/段落，完整抄写整篇文章\\n2. 完形填空等嵌入式题号：在文章中题号位置用下划线标注，格式为 ____题号____，例如：'celebrated ____17____ each year'，让用户一眼能看出哪里是填空\\n3. 列出该大题下的所有题目（包括正确的和错误的），每题一行，带选项\\n4. 用 ✗ 标记用户做错的题目\\n5. 格式示例（阅读理解）：\\n   Read the passage and answer questions 26-30.\\n   \\n   Tom went to the park yesterday...（完整文章）\\n   \\n   26. What did Tom do? \\n   A. went to school  B. went to park  C. stayed home  D. went shopping\\n   \\n   ✗ 27. Where did he meet Lucy?\\n   A. park  B. school  C. home  D. store\\n   用户答案: C  正确答案: A\\n6. 格式示例（完形填空）：\\n   Have you ever heard about World Braille Day? It is celebrated ____17____ January 4th each year...\\n   Braille became blind ____18____ he was a child.\\n   \\n   17. A. at  B. in  C. on\\n   ✗ 18. A. when  B. unless  C. because\\n   用户答案: B  正确答案: A",
      "wrongQuestions": [
        {
          "questionNumber": "题号",
          "questionType": "choice / fill_blank / short_answer / dialogue",
          "questionContent": "这道题的完整题目（含选项）",
          "isUnanswered": false,
          "userAnswer": "学生写的错误答案",
          "correctAnswer": "正确答案（如果试卷上有标注或可以推断）",
          "knowledgePoints": ["涉及的知识点"],
          "errorAnalysis": "错误原因详细分析：为什么学生的答案是错的，正确答案的推理过程是什么"
        }
      ]
    }
  ]
}

【重要规则】
1. sectionContent 要尽量完整还原原题内容，包括文章、题干、选项，让用户看到完整的试卷原貌
2. 完形填空/语法填空等题型：文章中嵌入的题号位置必须用 ____题号____ 格式标注（如 ____17____），让填空位置一目了然
3. 在 sectionContent 中，对做错的题目行前加 ✗ 标记
4. 听力题（isListening: true）：只还原题目内容，wrongQuestions 留空数组 []，因为没有音频无法分析
5. 未作答的题目（空白、没写答案的）：设置 isUnanswered: true，不要放入 wrongQuestions
6. 只有确实做了但做错的题目才放入 wrongQuestions
7. wrongQuestions 按题号从小到大排序
8. 如果看不清某个内容，在对应字段填写 "unclear"
9. 每个大题作为一个 section，如果阅读理解有A/B/C多篇，每篇算一个 section`;

// ============================================
// 进度广播辅助函数
// ============================================

function broadcastProgress(examId, progress, status, message) {
    const taskId = `exam_${examId}`;
    console.log(`[ExamProcessor] 📤 广播进度: taskId=${taskId}, progress=${progress}%, status=${status}, message=${message}`);

    if (typeof global.broadcastTaskProgress === 'function') {
        // ⚠️ 关键：server.js 的 broadcastTaskProgress 签名是 (taskId, progress, status, message)
        // 不是传对象！
        global.broadcastTaskProgress(taskId, progress, status, message);
    } else {
        console.warn('[ExamProcessor] ⚠️ global.broadcastTaskProgress 未定义，无法推送进度');
    }
}

// ============================================
// 核心：processExam 流水线
// ============================================

async function processExam(examId, userId) {
    console.log('\n' + '═'.repeat(60));
    console.log(`[ExamProcessor] 🚀 开始处理试卷 examId: ${examId}, userId: ${userId}`);
    console.log('═'.repeat(60));

    let automation = null;

    try {
        // ========== Stage 1: 初始化 ==========
        console.log('\n[ExamProcessor] ─── Stage 1: 初始化 ───');
        broadcastProgress(examId, 5, 'processing', '📌 Stage 1: 初始化...');

        // 更新状态为 processing
        ExamDB.updateStatus(examId, 'processing');

        // 获取试卷信息
        const exam = ExamDB.getById(examId);
        if (!exam) {
            throw new Error(`试卷不存在, examId: ${examId}`);
        }
        console.log(`[ExamProcessor] 📝 试卷: "${exam.title}" (${exam.image_count}张图片)`);

        // 获取图片路径
        const images = ExamImageDB.getByExamId(examId);
        if (images.length === 0) {
            throw new Error('试卷没有图片');
        }

        const imagePaths = images.map(img => img.image_path);
        console.log(`[ExamProcessor] 📷 图片路径:`);
        imagePaths.forEach((p, i) => {
            const exists = fs.existsSync(p);
            console.log(`[ExamProcessor]   ${i + 1}. ${p} (${exists ? '✅ 存在' : '❌ 不存在'})`);
            if (!exists) {
                throw new Error(`图片文件不存在: ${p}`);
            }
        });

        broadcastProgress(examId, 10, 'processing', `✅ 初始化完成，${imagePaths.length}张图片待处理`);

        // ========== Stage 2: 启动浏览器 + 登录 ==========
        console.log('\n[ExamProcessor] ─── Stage 2: 启动浏览器 ───');
        broadcastProgress(examId, 15, 'processing', '🌐 Stage 2: 启动浏览器...');

        automation = new SorryiosAutomation();
        await automation.init();
        console.log('[ExamProcessor] ✅ 浏览器已启动');
        broadcastProgress(examId, 18, 'processing', '🌐 浏览器已启动，正在登录...');

        await automation.login();
        console.log('[ExamProcessor] ✅ 登录成功');
        broadcastProgress(examId, 22, 'processing', '🔑 登录成功，正在选择账号...');

        await automation.selectIdleAccount();
        console.log('[ExamProcessor] ✅ 账号已选择');

        // 选择 Thinking 模型（新方法）
        broadcastProgress(examId, 25, 'processing', '🧠 正在切换到 Thinking 模型...');
        if (typeof automation.selectThinkingModel === 'function') {
            await automation.selectThinkingModel();
            console.log('[ExamProcessor] ✅ Thinking 模型已选择');
        } else {
            console.warn('[ExamProcessor] ⚠️ selectThinkingModel 方法不存在，使用默认模型');
        }

        broadcastProgress(examId, 30, 'processing', '✅ 浏览器就绪，准备上传图片...');

        // ========== Stage 3: 上传图片 + 发送 Prompt ==========
        console.log('\n[ExamProcessor] ─── Stage 3: 上传图片 + 发送 Prompt ───');
        broadcastProgress(examId, 35, 'processing', `📤 Stage 3: 上传${imagePaths.length}张图片...`);

        let response;
        if (typeof automation.sendMessageWithImages === 'function') {
            // 使用新方法：图片+文字一起发送
            console.log('[ExamProcessor] 📤 调用 sendMessageWithImages...');
            console.log(`[ExamProcessor] 📤 图片数量: ${imagePaths.length}`);
            console.log(`[ExamProcessor] 📤 Prompt长度: ${EXAM_PROMPT.length}字符`);

            broadcastProgress(examId, 40, 'processing', '📤 正在上传图片到AI...');

            response = await automation.sendMessageWithImages(EXAM_PROMPT, imagePaths);
            console.log('[ExamProcessor] ✅ 图片和Prompt已发送');
        } else {
            // 降级方案：sendMessageWithImages 不可用
            console.warn('[ExamProcessor] ⚠️ sendMessageWithImages 不可用，尝试降级方案...');
            broadcastProgress(examId, 40, 'processing', '⚠️ 降级模式：使用文本发送...');

            // 只发送 prompt 文本（不含图片，AI可能无法识别）
            response = await automation.sendMessage(
                `[注意：图片无法自动上传，请人工协助]\n\n${EXAM_PROMPT}`
            );
        }

        broadcastProgress(examId, 60, 'processing', '⏳ Stage 4: 等待AI响应...');

        // ========== Stage 4: 获取 AI 响应 ==========
        console.log('\n[ExamProcessor] ─── Stage 4: 获取AI响应 ───');

        // sendMessageWithImages 内部已经调用了 waitForResponse
        // response 格式: { text: '...', html: '...' }
        const responseText = typeof response === 'object' ? response.text : response;

        if (!responseText || responseText.length < 10) {
            throw new Error('AI响应为空或过短');
        }

        console.log(`[ExamProcessor] ✅ AI响应长度: ${responseText.length}字符`);
        console.log(`[ExamProcessor] 📋 响应前200字符: ${responseText.substring(0, 200)}`);

        broadcastProgress(examId, 80, 'processing', '📋 Stage 5: 解析AI返回的JSON...');

        // ========== Stage 5: 解析 JSON ==========
        console.log('\n[ExamProcessor] ─── Stage 5: 解析JSON ───');

        const parsed = JsonExtractor.extract(responseText);

        if (!parsed) {
            console.error('[ExamProcessor] ❌ JSON 解析全部失败');
            console.error('[ExamProcessor] 📋 响应前500字符:', responseText.substring(0, 500));
            throw new Error('无法从AI响应中解析JSON');
        }

        console.log('[ExamProcessor] ✅ JSON解析成功');
        console.log(`[ExamProcessor] 📊 试卷标题: ${parsed.examTitle || '(无)'}`);
        console.log(`[ExamProcessor] 📊 总题数: ${parsed.totalQuestions || 0}`);

        // === v1.1: 支持新的 sections 结构，同时兼容旧的 wrongQuestions 扁平结构 ===
        const sections = parsed.sections || [];
        const isNewFormat = sections.length > 0;

        console.log(`[ExamProcessor] 📊 返回格式: ${isNewFormat ? 'v1.1 sections结构' : 'v1.0 扁平结构(兼容)'}`);
        console.log(`[ExamProcessor] 📊 sections 数量: ${sections.length}`);

        broadcastProgress(examId, 85, 'processing', `✅ 解析成功，发现 ${sections.length} 个大题段落`);

        // ========== Stage 6: 存入数据库 ==========
        console.log('\n[ExamProcessor] ─── Stage 6: 存入数据库 ───');
        broadcastProgress(examId, 90, 'processing', '💾 Stage 6: 保存到数据库...');

        let totalWrongCount = 0;
        let totalSkippedListening = 0;
        let totalSkippedUnanswered = 0;

        if (isNewFormat) {
            // ═══ v1.1: 按 section 分段存储 ═══
            console.log('[ExamProcessor] ═══ v1.1 分段存储模式 ═══');

            for (let sIdx = 0; sIdx < sections.length; sIdx++) {
                const sec = sections[sIdx];
                const secName = sec.sectionName || `Section ${sIdx + 1}`;
                const isListening = sec.isListening === true;

                const secType = (sec.sectionType || '').toLowerCase();

                console.log(`\n[ExamProcessor] ── section[${sIdx}]: "${secName}" (type: ${secType || 'unknown'}, listening: ${isListening}) ──`);
                console.log(`[ExamProcessor]   sectionContent 长度: ${(sec.sectionContent || '').length} 字符`);
                console.log(`[ExamProcessor]   wrongQuestions 数量: ${(sec.wrongQuestions || []).length}`);

                // ═══ v1.1 后处理：对文章中嵌入式裸题号添加下划线 ═══
                // 除了纯阅读理解和写作，其他有嵌入式题号的类型都处理
                let processedContent = sec.sectionContent || '';
                const skipTypes = ['listening', 'reading', 'writing'];
                const needsUnderline = !skipTypes.includes(secType) || 
                    secName.includes('完形') || secName.includes('填空') || secName.includes('语法') || secName.includes('选词');

                if (processedContent && needsUnderline) {
                    console.log(`[ExamProcessor]   📝 后处理：类型="${secType}"，开始处理嵌入式题号下划线`);

                    // 1. 收集该 section 下的所有题号（v1.2 增强版）
                    const allQuestionNumbers = new Set();

                    // 来源A: 错题列表中的题号
                    (sec.wrongQuestions || []).forEach(q => {
                        if (q.questionNumber) allQuestionNumbers.add(String(q.questionNumber).trim());
                    });
                    console.log(`[ExamProcessor]   📝 题号收集-来源A(错题): [${[...allQuestionNumbers].join(', ')}] (${allQuestionNumbers.size}个)`);

                    // 来源B: 从选项行/答案行中提取题号（v1.2 放宽正则，支持多种AI输出格式）
                    // 支持格式: "17. A. at" / "25.（学生" / "25: B" / "25. B" / "✗ 27." / "27) A"
                    const optionLineRegex = /^[✗×]?\s*(\d{1,3})\s*[.):：]\s*(?:[A-E][\s.,)]|（|用户|正确|学生)/gm;
                    let optMatch;
                    while ((optMatch = optionLineRegex.exec(processedContent)) !== null) {
                        allQuestionNumbers.add(optMatch[1]);
                    }
                    console.log(`[ExamProcessor]   📝 题号收集-来源B(选项行正则): [${[...allQuestionNumbers].join(', ')}] (${allQuestionNumbers.size}个)`);

                    // 来源C: 扫描正文中的裸题号（v1.2 新增）
                    // 在文章正文中查找 "单词/标点 + 数字 + 单词/标点" 模式的裸数字
                    // 然后判断这些数字是否构成连续或接近连续的题号序列
                    const bareNumRegex = /(?:^|[\s,;.!?，。；！？"'(（])(\d{1,3})(?=[\s,;.!?，。；！？"'）)"]|$)/gm;
                    const candidateNums = new Set();
                    const contentLines = processedContent.split('\n');
                    for (const cLine of contentLines) {
                        const cTrimmed = cLine.trim();
                        // 跳过选项行和答案行，只扫描正文
                        if (/^[✗×]?\s*\d{1,3}\s*[.):：]\s*(?:[A-E][\s.,)]|（|用户|正确|学生)/.test(cTrimmed)) continue;
                        if (/用户答案|正确答案|userAnswer|correctAnswer|Word\s*box/i.test(cTrimmed)) continue;
                        let bm;
                        while ((bm = bareNumRegex.exec(cLine)) !== null) {
                            const n = parseInt(bm[1]);
                            // 排除明显不是题号的数字（年份、大数、0等）
                            if (n >= 1 && n <= 200 && n !== 12 && !/\b\d{4}\b/.test(cLine.substring(Math.max(0, bm.index - 5), bm.index + bm[0].length + 5))) {
                                candidateNums.add(String(n));
                            }
                        }
                        bareNumRegex.lastIndex = 0; // 重置正则状态
                    }
                    console.log(`[ExamProcessor]   📝 题号收集-来源C(正文裸数字候选): [${[...candidateNums].join(', ')}]`);

                    // 来源C 验证：如果候选数字与已知题号有交集或构成连续序列，则加入
                    if (candidateNums.size > 0) {
                        const knownNums = [...allQuestionNumbers].map(Number).filter(n => !isNaN(n));
                        const candidates = [...candidateNums].map(Number).filter(n => !isNaN(n));

                        if (knownNums.length > 0) {
                            // 有已知题号：候选数字与已知题号范围差值<=3的，视为同一组题号
                            const minKnown = Math.min(...knownNums);
                            const maxKnown = Math.max(...knownNums);
                            for (const c of candidates) {
                                if (c >= minKnown - 3 && c <= maxKnown + 3) {
                                    allQuestionNumbers.add(String(c));
                                }
                            }
                        } else {
                            // 无已知题号：检查候选数字是否构成连续序列（至少3个，间隔<=2）
                            const sorted = candidates.sort((a, b) => a - b);
                            if (sorted.length >= 3) {
                                const maxGap = Math.max(...sorted.slice(1).map((v, i) => v - sorted[i]));
                                if (maxGap <= 2) {
                                    console.log(`[ExamProcessor]   📝 来源C验证：${sorted.length}个候选构成连续序列(最大间隔${maxGap})，全部加入`);
                                    sorted.forEach(n => allQuestionNumbers.add(String(n)));
                                }
                            } else if (sorted.length >= 2) {
                                // 2个候选且连续，也加入
                                if (sorted[1] - sorted[0] <= 2) {
                                    sorted.forEach(n => allQuestionNumbers.add(String(n)));
                                }
                            }
                        }
                    }

                    console.log(`[ExamProcessor]   📝 题号收集-最终结果: [${[...allQuestionNumbers].sort((a,b) => parseInt(a) - parseInt(b)).join(', ')}] (共${allQuestionNumbers.size}个)`);

                    if (allQuestionNumbers.size > 0) {
                        // 从大到小处理，避免 "1" 误匹配 "17" 的问题
                        const sortedNums = [...allQuestionNumbers].sort((a, b) => parseInt(b) - parseInt(a));
                        const lines = processedContent.split('\n');

                        const processedLines = lines.map((line, lineIdx) => {
                            const trimmed = line.trim();
                            // 跳过选项行（v1.2 放宽：支持 "17. A." / "25:B" / "25. B" / "25)A" / "✗ 27.（" 等）
                            if (/^[✗×]?\s*\d{1,3}\s*[.):：]\s*(?:[A-E][\s.,)]|（|用户|正确|学生)/.test(trimmed)) {
                                console.log(`[ExamProcessor]     行${lineIdx + 1}: [跳过-选项行] "${trimmed.substring(0, 50)}"`);
                                return line;
                            }
                            // 跳过 "用户答案:" 行 和 Word box 行
                            if (/用户答案|正确答案|userAnswer|correctAnswer|Word\s*box/i.test(trimmed)) {
                                console.log(`[ExamProcessor]     行${lineIdx + 1}: [跳过-答案/WordBox行] "${trimmed.substring(0, 50)}"`);
                                return line;
                            }

                            let result = line;
                            let lineChanged = false;
                            for (const num of sortedNums) {
                                // 跳过已经有下划线包裹的
                                if (result.includes(`____${num}____`)) continue;
                                const before = result;
                                // 模式1: 空格+数字+空格 "celebrated 17 January"
                                result = result.replace(
                                    new RegExp(`(\\s)${num}(\\s)`, 'g'),
                                    `$1____${num}____$2`
                                );
                                // 模式2: 空格+数字+标点 "true 25." 或 "you 28." 或 "idea 19,"
                                // 注意：不能匹配 "17. A."（选项行已被跳过，这里是正文行）
                                result = result.replace(
                                    new RegExp(`(\\s)${num}([.,;!?，。；！？])`, 'g'),
                                    `$1____${num}____$2`
                                );
                                // 模式3: 空格+数字+行尾 "how you 28"（行尾无标点）
                                result = result.replace(
                                    new RegExp(`(\\s)${num}$`, 'g'),
                                    `$1____${num}____`
                                );
                                // 模式4: 行首裸题号 "17 January"
                                result = result.replace(
                                    new RegExp(`^${num}(\\s)`, ''),
                                    `____${num}____$1`
                                );
                                if (result !== before) {
                                    lineChanged = true;
                                    console.log(`[ExamProcessor]     行${lineIdx + 1}: [替换题号${num}] "${before.trim().substring(0, 60)}" → "${result.trim().substring(0, 60)}"`);
                                }
                            }
                            if (!lineChanged && trimmed.length > 0) {
                                // 仅对含数字的正文行输出"未替换"日志（减少噪音）
                                if (/\d/.test(trimmed) && trimmed.length > 5) {
                                    console.log(`[ExamProcessor]     行${lineIdx + 1}: [未替换] "${trimmed.substring(0, 60)}"`);
                                }
                            }
                            return result;
                        });
                        processedContent = processedLines.join('\n');
                    }

                    if (processedContent !== (sec.sectionContent || '')) {
                        console.log(`[ExamProcessor]   ✅ 后处理完成：添加了下划线标记`);
                        console.log(`[ExamProcessor]   📋 后处理后前300字符: ${processedContent.substring(0, 300).replace(/\n/g, '\\n')}`);
                    } else {
                        console.log(`[ExamProcessor]   ℹ️ 后处理：内容未变化（AI可能已按要求加了下划线，或正文中无裸题号）`);
                    }
                } else if (processedContent) {
                    console.log(`[ExamProcessor]   ℹ️ 跳过后处理：类型="${secType}" 不需要嵌入式题号下划线`);
                }

                // Step 1: 存 exam_sections（使用后处理后的 processedContent）
                let sectionId = null;
                try {
                    const secResult = ExamSectionDB.add({
                        exam_id: examId,
                        section_name: secName,
                        section_type: sec.sectionType || '',
                        section_content: processedContent,
                        section_order: sIdx,
                        is_listening: isListening
                    });
                    sectionId = secResult.id;
                    console.log(`[ExamProcessor]   ✅ section 已存入 DB, section_id: ${sectionId}`);
                } catch (secErr) {
                    console.error(`[ExamProcessor]   ❌ section 存储失败:`, secErr.message);
                    console.error(`[ExamProcessor]   ❌ 堆栈:`, secErr.stack);
                    // section 存储失败不阻断流程，继续处理错题（section_id 为 null）
                }

                // Step 2: 处理该 section 下的错题
                if (isListening) {
                    const skipCount = (sec.wrongQuestions || []).length;
                    totalSkippedListening += skipCount;
                    console.log(`[ExamProcessor]   ⏭️ 听力题，跳过 ${skipCount} 道错题分析`);
                    continue;
                }

                const wrongQs = sec.wrongQuestions || [];
                if (wrongQs.length === 0) {
                    console.log(`[ExamProcessor]   ℹ️ 该 section 没有错题`);
                    continue;
                }

                // 过滤掉未作答的题
                const validWrongQs = wrongQs.filter((q, i) => {
                    if (q.isUnanswered === true) {
                        totalSkippedUnanswered++;
                        console.log(`[ExamProcessor]   ⏭️ 跳过未作答题: 第${q.questionNumber || '?'}题`);
                        return false;
                    }
                    return true;
                });

                console.log(`[ExamProcessor]   📝 有效错题: ${validWrongQs.length} 道 (过滤掉 ${wrongQs.length - validWrongQs.length} 道未作答)`);

                // Step 3: 批量存入 wrong_questions
                if (validWrongQs.length > 0) {
                    const items = validWrongQs.map((q, index) => {
                        console.log(`[ExamProcessor]     错题${index + 1}: 题号=${q.questionNumber}, 类型=${q.questionType}, 用户答案="${q.userAnswer}", 正确答案="${q.correctAnswer}"`);
                        return {
                            exam_id: examId,
                            user_id: userId,
                            question_number: q.questionNumber || '',
                            question_type: q.questionType || '',
                            question_content: q.questionContent || '',
                            user_answer: q.userAnswer || '',
                            correct_answer: q.correctAnswer || '',
                            knowledge_points: q.knowledgePoints || [],
                            error_analysis: q.errorAnalysis || '',
                            section: secName,
                            section_id: sectionId
                        };
                    });

                    try {
                        const result = WrongQuestionDB.addBatch(items);
                        totalWrongCount += result.count;
                        console.log(`[ExamProcessor]   ✅ 该 section 存入 ${result.count} 道错题`);
                    } catch (batchErr) {
                        console.error(`[ExamProcessor]   ❌ 批量存入错题失败:`, batchErr.message);
                        console.error(`[ExamProcessor]   ❌ 堆栈:`, batchErr.stack);
                    }
                }
            }

        } else {
            // ═══ v1.0 兼容模式: 旧的扁平 wrongQuestions 结构 ═══
            console.log('[ExamProcessor] ═══ v1.0 兼容模式（扁平结构） ═══');

            const wrongQuestions = parsed.wrongQuestions || [];
            if (!Array.isArray(wrongQuestions)) {
                throw new Error('wrongQuestions 不是数组');
            }

            console.log(`[ExamProcessor] 📊 错题数: ${wrongQuestions.length}`);

            const items = wrongQuestions.map((q, index) => {
                console.log(`[ExamProcessor] 📝 错题${index + 1}: 题号=${q.questionNumber}, section=${q.section}`);
                return {
                    exam_id: examId,
                    user_id: userId,
                    question_number: q.questionNumber || '',
                    question_type: q.questionType || '',
                    question_content: q.questionContent || '',
                    user_answer: q.userAnswer || '',
                    correct_answer: q.correctAnswer || '',
                    knowledge_points: q.knowledgePoints || [],
                    error_analysis: q.errorAnalysis || '',
                    section: q.section || '',
                    section_id: null
                };
            });

            if (items.length > 0) {
                const result = WrongQuestionDB.addBatch(items);
                totalWrongCount = result.count;
                console.log(`[ExamProcessor] ✅ 批量插入成功, 共 ${result.count} 条`);
            }
        }

        // 汇总日志
        console.log(`\n[ExamProcessor] ═══ Stage 6 汇总 ═══`);
        console.log(`[ExamProcessor]   sections 总数: ${sections.length}`);
        console.log(`[ExamProcessor]   有效错题入库: ${totalWrongCount}`);
        console.log(`[ExamProcessor]   跳过(听力): ${totalSkippedListening}`);
        console.log(`[ExamProcessor]   跳过(未作答): ${totalSkippedUnanswered}`);

        // 更新试卷统计
        ExamDB.updateStats(examId, parsed.totalQuestions || 0, totalWrongCount);

        // 更新试卷标题（如果AI识别出来了且原来为空）
        if (parsed.examTitle && !exam.title) {
            try {
                const { db } = require('./database');
                db.prepare('UPDATE exams SET title = ? WHERE id = ?').run(parsed.examTitle, examId);
                console.log(`[ExamProcessor] 📝 更新试卷标题: "${parsed.examTitle}"`);
            } catch (e) {
                console.warn('[ExamProcessor] ⚠️ 更新标题失败:', e.message);
            }
        }

        broadcastProgress(examId, 95, 'processing', `✅ ${totalWrongCount} 道错题已保存 (跳过听力${totalSkippedListening}道, 未作答${totalSkippedUnanswered}道)`);

        // ========== Stage 7: 完成 ==========
        console.log('\n[ExamProcessor] ─── Stage 7: 完成 ───');

        ExamDB.updateStatus(examId, 'done');

        console.log('═'.repeat(60));
        console.log(`[ExamProcessor] 🎉 试卷处理完成！`);
        console.log(`[ExamProcessor]   试卷ID: ${examId}`);
        console.log(`[ExamProcessor]   总题数: ${parsed.totalQuestions || 0}`);
        console.log(`[ExamProcessor]   sections: ${sections.length}`);
        console.log(`[ExamProcessor]   有效错题: ${totalWrongCount}`);
        console.log(`[ExamProcessor]   跳过(听力): ${totalSkippedListening}`);
        console.log(`[ExamProcessor]   跳过(未作答): ${totalSkippedUnanswered}`);
        console.log('═'.repeat(60) + '\n');

        broadcastProgress(examId, 100, 'done', `🎉 识别完成！发现 ${totalWrongCount} 道错题`);

        return {
            examId,
            totalQuestions: parsed.totalQuestions || 0,
            wrongCount: totalWrongCount,
            sectionCount: sections.length,
            examTitle: parsed.examTitle || ''
        };

    } catch (error) {
        // ========== 异常处理 ==========
        console.error('\n' + '═'.repeat(60));
        console.error(`[ExamProcessor] ❌ 试卷处理失败！`);
        console.error(`[ExamProcessor] ❌ examId: ${examId}`);
        console.error(`[ExamProcessor] ❌ 错误: ${error.message}`);
        console.error(`[ExamProcessor] ❌ 堆栈: ${error.stack}`);
        console.error('═'.repeat(60) + '\n');

        // 更新状态为 failed
        try {
            ExamDB.updateStatus(examId, 'failed', error.message);
        } catch (e) {
            console.error('[ExamProcessor] ❌ 更新失败状态也失败了:', e.message);
        }

        broadcastProgress(examId, 0, 'failed', `❌ 识别失败: ${error.message}`);

        throw error;

    } finally {
        // ========== 确保浏览器关闭 ==========
        if (automation) {
            try {
                console.log('[ExamProcessor] 🔒 关闭浏览器...');
                await automation.close();
                console.log('[ExamProcessor] ✅ 浏览器已关闭');
            } catch (e) {
                console.error('[ExamProcessor] ⚠️ 关闭浏览器失败:', e.message);
            }
        }
    }
}

// ============================================
// 导出
// ============================================

module.exports = {
    processExam,
    EXAM_PROMPT
};