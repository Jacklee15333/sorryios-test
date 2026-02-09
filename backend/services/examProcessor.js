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
const { ExamDB, WrongQuestionDB, ExamImageDB } = require('./wrongQuestionService');

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
// 错题识别 Prompt
// ============================================

const EXAM_PROMPT = `请仔细分析这张英语试卷照片。这是一份已批改的试卷，请找出所有被标记为错误的题目（有红色×号、圈、划线等批改痕迹的题目）。

请以严格的 JSON 格式返回结果，不要包含任何其他文字说明，只返回 JSON：

{
  "subject": "English",
  "examTitle": "试卷标题（如果能识别的话）",
  "totalQuestions": 识别到的总题数,
  "wrongQuestions": [
    {
      "questionNumber": "题号，如 '21' 或 'A-1'",
      "section": "大题类型，如 '完形填空'、'阅读理解'、'选词填空'",
      "questionType": "choice/fill_blank/short_answer/dialogue",
      "questionContent": "完整的题目内容（尽可能完整抄写）",
      "userAnswer": "学生写的错误答案",
      "correctAnswer": "正确答案（如果试卷上有标注）",
      "knowledgePoints": ["涉及的知识点1", "知识点2"],
      "errorAnalysis": "错误原因分析（为什么这个答案是错的，正确的思路是什么）"
    }
  ]
}

注意事项：
1. 只提取被标记为错误的题目，正确的题目不需要
2. 如果看不清某个内容，在对应字段填写 "unclear"
3. questionContent 要尽量完整，包括题干和选项
4. 如果有多道错题，按题号从小到大排序`;

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
            throw new Error('无法从AI响应中解析JSON');
        }

        console.log('[ExamProcessor] ✅ JSON解析成功');
        console.log(`[ExamProcessor] 📊 试卷标题: ${parsed.examTitle || '(无)'}`);
        console.log(`[ExamProcessor] 📊 总题数: ${parsed.totalQuestions || 0}`);
        console.log(`[ExamProcessor] 📊 错题数: ${(parsed.wrongQuestions || []).length}`);

        // 验证 JSON 结构
        const wrongQuestions = parsed.wrongQuestions || [];
        if (!Array.isArray(wrongQuestions)) {
            throw new Error('wrongQuestions 不是数组');
        }

        broadcastProgress(examId, 85, 'processing', `✅ 解析成功，发现 ${wrongQuestions.length} 道错题`);

        // ========== Stage 6: 存入数据库 ==========
        console.log('\n[ExamProcessor] ─── Stage 6: 存入数据库 ───');
        broadcastProgress(examId, 90, 'processing', '💾 Stage 6: 保存错题到数据库...');

        // 批量构建错题数据
        const items = wrongQuestions.map((q, index) => {
            console.log(`[ExamProcessor] 📝 错题${index + 1}: 题号=${q.questionNumber}, 类型=${q.section}`);
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
                section: q.section || ''
            };
        });

        if (items.length > 0) {
            const result = WrongQuestionDB.addBatch(items);
            console.log(`[ExamProcessor] ✅ 批量插入成功, 共 ${result.count} 条`);
        } else {
            console.log('[ExamProcessor] ⚠️ 没有错题需要插入');
        }

        // 更新试卷统计
        ExamDB.updateStats(examId, parsed.totalQuestions || 0, wrongQuestions.length);

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

        broadcastProgress(examId, 95, 'processing', `✅ ${wrongQuestions.length} 道错题已保存`);

        // ========== Stage 7: 完成 ==========
        console.log('\n[ExamProcessor] ─── Stage 7: 完成 ───');

        ExamDB.updateStatus(examId, 'done');

        console.log('═'.repeat(60));
        console.log(`[ExamProcessor] 🎉 试卷处理完成！`);
        console.log(`[ExamProcessor]   试卷ID: ${examId}`);
        console.log(`[ExamProcessor]   总题数: ${parsed.totalQuestions || 0}`);
        console.log(`[ExamProcessor]   错题数: ${wrongQuestions.length}`);
        console.log('═'.repeat(60) + '\n');

        broadcastProgress(examId, 100, 'done', `🎉 识别完成！发现 ${wrongQuestions.length} 道错题`);

        return {
            examId,
            totalQuestions: parsed.totalQuestions || 0,
            wrongCount: wrongQuestions.length,
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
