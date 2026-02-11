/**
 * exam-upload-api.js - 试卷图片上传 & 试卷管理 API v1.0
 * 
 * 挂载路径: /api/exam
 * 
 * 路由：
 *   POST   /api/exam/upload          上传试卷图片（FormData，多文件）
 *   POST   /api/exam/:examId/process 触发AI识别
 *   GET    /api/exam/:examId/status  查询识别状态
 *   GET    /api/exam/:examId/result  获取识别结果
 *   GET    /api/exam/list            用户的试卷列表
 *   DELETE /api/exam/:examId         删除试卷
 * 
 * 依赖：
 *   - multer: 独立配置，接受 jpg/png/jpeg/pdf
 *   - authMiddleware: 从 ./auth 导入
 *   - wrongQuestionService: 数据库操作
 *   - examProcessor: AI识别引擎（延迟加载，避免循环依赖）
 * 
 * @version 1.0
 * @date 2026-02-09
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('./auth');
const { ExamDB, WrongQuestionDB, ExamSectionDB, ExamImageDB } = require('../services/wrongQuestionService');

const router = express.Router();

// ============================================
// Multer 配置（独立于原有 .txt 上传）
// ============================================

const examUploadsDir = path.join(__dirname, '../uploads/exams');
if (!fs.existsSync(examUploadsDir)) {
    fs.mkdirSync(examUploadsDir, { recursive: true });
    console.log('[ExamUpload] 创建 uploads/exams 目录:', examUploadsDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, examUploadsDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const uniqueName = `${uuidv4()}${ext}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['.jpg', '.jpeg', '.png', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error(`不支持的文件类型: ${ext}。支持 jpg/png/pdf`), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 20 * 1024 * 1024,  // 20MB（手机拍照图片可能较大）
        files: 10                      // 最多10张图片
    }
});

// ============================================
// POST /api/exam/upload - 上传试卷图片
// ============================================

router.post('/upload', authMiddleware, upload.array('images', 10), (req, res) => {
    console.log('\n' + '='.repeat(60));
    console.log('[ExamUpload] 📤 试卷上传请求开始');
    console.log('='.repeat(60));

    const userId = req.user.id;
    const username = req.user.username;

    console.log(`[ExamUpload] 👤 用户: ${username} (ID: ${userId})`);
    console.log(`[ExamUpload] 📁 文件数量: ${req.files ? req.files.length : 0}`);
    console.log(`[ExamUpload] 📦 请求体: ${JSON.stringify(req.body)}`);

    try {
        // 验证文件
        if (!req.files || req.files.length === 0) {
            console.log('[ExamUpload] ❌ 没有上传文件');
            return res.status(400).json({
                error: '请上传试卷图片',
                message: '未检测到上传的文件'
            });
        }

        const title = req.body.title?.trim() || '';
        const files = req.files;

        console.log(`[ExamUpload] 📝 试卷标题: "${title || '(未设置)'}"`);
        files.forEach((f, i) => {
            console.log(`[ExamUpload] 📷 图片${i + 1}: ${f.originalname} (${(f.size / 1024).toFixed(1)}KB)`);
        });

        // 步骤1: 创建试卷记录
        console.log('[ExamUpload] 💾 创建试卷记录...');
        const examResult = ExamDB.create({
            user_id: userId,
            title: title,
            subject: 'English',
            image_count: files.length
        });

        const examId = examResult.id;
        console.log(`[ExamUpload] ✅ 试卷记录创建成功, examId: ${examId}`);

        // 步骤2: 保存图片记录
        console.log('[ExamUpload] 💾 保存图片记录...');
        const imagePaths = [];
        files.forEach((file, index) => {
            const imagePath = file.path;
            imagePaths.push(imagePath);

            ExamImageDB.add({
                exam_id: examId,
                image_path: imagePath,
                image_order: index,
                original_name: file.originalname
            });
            console.log(`[ExamUpload] ✅ 图片${index + 1}记录已保存: ${file.filename}`);
        });

        // 步骤3: 返回响应
        const response = {
            success: true,
            message: '试卷图片上传成功',
            exam: {
                id: examId,
                title: title,
                imageCount: files.length,
                status: 'pending',
                userId: userId
            },
            // 提示前端下一步操作
            next: {
                process: `/api/exam/${examId}/process`,
                status: `/api/exam/${examId}/status`
            }
        };

        console.log('[ExamUpload] 📤 返回响应:', JSON.stringify(response, null, 2));
        console.log('='.repeat(60));
        console.log('[ExamUpload] ✅ 上传请求完成');
        console.log('='.repeat(60) + '\n');

        res.status(201).json(response);

    } catch (error) {
        console.error('[ExamUpload] ❌ 上传失败:', error.message);
        console.error('[ExamUpload] ❌ 堆栈:', error.stack);
        res.status(500).json({
            error: '上传失败',
            message: error.message
        });
    }
});

// ============================================
// POST /api/exam/:examId/process - 触发AI识别
// ============================================

router.post('/:examId/process', authMiddleware, (req, res) => {
    const examId = parseInt(req.params.examId);
    const userId = req.user.id;

    console.log('\n' + '='.repeat(60));
    console.log(`[ExamUpload] 🚀 触发AI识别, examId: ${examId}, userId: ${userId}`);
    console.log('='.repeat(60));

    try {
        // 验证试卷存在且属于当前用户
        const exam = ExamDB.getById(examId);
        if (!exam) {
            console.log('[ExamUpload] ❌ 试卷不存在');
            return res.status(404).json({ error: '试卷不存在' });
        }
        if (exam.user_id !== userId) {
            console.log('[ExamUpload] ❌ 试卷不属于当前用户');
            return res.status(403).json({ error: '无权操作此试卷' });
        }
        if (exam.status === 'processing') {
            console.log('[ExamUpload] ⚠️ 试卷正在识别中');
            return res.status(400).json({ error: '试卷正在识别中，请勿重复提交' });
        }

        // 获取图片列表
        const images = ExamImageDB.getByExamId(examId);
        if (images.length === 0) {
            console.log('[ExamUpload] ❌ 试卷没有图片');
            return res.status(400).json({ error: '试卷没有图片，请先上传' });
        }

        console.log(`[ExamUpload] 📷 图片数量: ${images.length}`);
        images.forEach((img, i) => {
            console.log(`[ExamUpload]   ${i + 1}. ${img.original_name} → ${img.image_path}`);
        });

        // 延迟加载 examProcessor（避免循环依赖）
        let examProcessor;
        try {
            examProcessor = require('../services/examProcessor');
            console.log('[ExamUpload] ✅ examProcessor 已加载');
        } catch (e) {
            console.error('[ExamUpload] ❌ examProcessor 加载失败:', e.message);
            return res.status(500).json({ error: 'AI识别引擎加载失败', message: e.message });
        }

        // 异步启动识别（不等待完成）
        console.log('[ExamUpload] 🚀 启动异步识别任务...');
        examProcessor.processExam(examId, userId).catch(err => {
            console.error(`[ExamUpload] ❌ 识别任务异常终止, examId: ${examId}, error:`, err.message);
        });

        // 立即返回
        res.json({
            success: true,
            message: '识别任务已启动',
            exam: {
                id: examId,
                status: 'processing'
            },
            progress: {
                websocket: `订阅 taskId: exam_${examId}`,
                polling: `/api/exam/${examId}/status`
            }
        });

        console.log('='.repeat(60) + '\n');

    } catch (error) {
        console.error('[ExamUpload] ❌ 触发识别失败:', error.message);
        console.error('[ExamUpload] ❌ 堆栈:', error.stack);
        res.status(500).json({ error: '触发识别失败', message: error.message });
    }
});

// ============================================
// POST /api/exam/:examId/cancel - 取消识别任务
// ============================================

router.post('/:examId/cancel', authMiddleware, async (req, res) => {
    const examId = parseInt(req.params.examId);
    const userId = req.user.id;

    console.log(`[ExamUpload] 🛑 取消识别请求, examId: ${examId}`);

    try {
        const exam = ExamDB.getById(examId);
        if (!exam) {
            return res.status(404).json({ error: '试卷不存在' });
        }
        if (exam.user_id !== userId) {
            return res.status(403).json({ error: '无权操作此试卷' });
        }

        // 延迟加载 examProcessor
        let examProcessor;
        try {
            examProcessor = require('../services/examProcessor');
        } catch (e) {
            return res.status(500).json({ error: 'AI识别引擎加载失败' });
        }

        // 调用取消
        await examProcessor.cancelCurrentExam();

        // 确保数据库状态更新
        ExamDB.updateStatus(examId, 'failed', '用户取消');

        console.log(`[ExamUpload] ✅ 识别任务已取消, examId: ${examId}`);

        res.json({
            success: true,
            message: '识别任务已取消'
        });

    } catch (error) {
        console.error('[ExamUpload] ❌ 取消失败:', error.message);
        res.status(500).json({ error: '取消失败', message: error.message });
    }
});

// ============================================
// GET /api/exam/:examId/status - 查询识别状态
// ============================================

router.get('/:examId/status', authMiddleware, (req, res) => {
    const examId = parseInt(req.params.examId);
    const userId = req.user.id;

    console.log(`[ExamUpload] 🔍 查询状态, examId: ${examId}`);

    try {
        const exam = ExamDB.getById(examId);
        if (!exam) {
            return res.status(404).json({ error: '试卷不存在' });
        }
        if (exam.user_id !== userId) {
            return res.status(403).json({ error: '无权查看此试卷' });
        }

        res.json({
            success: true,
            exam: {
                id: exam.id,
                title: exam.title,
                status: exam.status,
                imageCount: exam.image_count,
                totalQuestions: exam.total_questions,
                wrongCount: exam.wrong_count,
                errorMessage: exam.error_message,
                createdAt: exam.created_at,
                completedAt: exam.completed_at
            }
        });
    } catch (error) {
        console.error('[ExamUpload] ❌ 查询状态失败:', error.message);
        res.status(500).json({ error: '查询失败', message: error.message });
    }
});

// ============================================
// GET /api/exam/:examId/result - 获取识别结果
// ============================================

router.get('/:examId/result', authMiddleware, (req, res) => {
    const examId = parseInt(req.params.examId);
    const userId = req.user.id;

    console.log(`[ExamUpload] 🔍 查询识别结果, examId: ${examId}`);

    try {
        const exam = ExamDB.getById(examId);
        if (!exam) {
            return res.status(404).json({ error: '试卷不存在' });
        }
        if (exam.user_id !== userId) {
            return res.status(403).json({ error: '无权查看此试卷' });
        }

        // 获取该试卷的所有错题
        const wrongQuestions = WrongQuestionDB.getList(userId, { examId: examId });

        // 获取该试卷的所有 sections（v1.1 新增）
        let sections = [];
        try {
            sections = ExamSectionDB.getByExamId(examId);
            console.log(`[ExamUpload] 📊 查到 ${sections.length} 个 sections`);
        } catch (secErr) {
            console.warn(`[ExamUpload] ⚠️ 查询 sections 失败（可能是旧数据）:`, secErr.message);
        }

        // 获取图片列表
        const images = ExamImageDB.getByExamId(examId);

        res.json({
            success: true,
            exam: {
                id: exam.id,
                title: exam.title,
                subject: exam.subject,
                status: exam.status,
                imageCount: exam.image_count,
                totalQuestions: exam.total_questions,
                wrongCount: exam.wrong_count,
                createdAt: exam.created_at,
                completedAt: exam.completed_at
            },
            wrongQuestions: wrongQuestions,
            sections: sections.map(sec => ({
                id: sec.id,
                sectionName: sec.section_name,
                sectionType: sec.section_type,
                sectionContent: sec.section_content,
                sectionOrder: sec.section_order,
                isListening: sec.is_listening === 1
            })),
            images: images.map(img => ({
                id: img.id,
                originalName: img.original_name,
                order: img.image_order
            }))
        });
    } catch (error) {
        console.error('[ExamUpload] ❌ 查询结果失败:', error.message);
        res.status(500).json({ error: '查询失败', message: error.message });
    }
});

// ============================================
// GET /api/exam/list - 用户试卷列表
// ============================================

router.get('/list', authMiddleware, (req, res) => {
    const userId = req.user.id;

    console.log(`[ExamUpload] 🔍 查询用户试卷列表, userId: ${userId}`);

    try {
        const exams = ExamDB.getByUserId(userId);

        res.json({
            success: true,
            exams: exams.map(exam => ({
                id: exam.id,
                title: exam.title,
                subject: exam.subject,
                status: exam.status,
                imageCount: exam.image_count,
                totalQuestions: exam.total_questions,
                wrongCount: exam.wrong_count,
                createdAt: exam.created_at,
                completedAt: exam.completed_at
            })),
            total: exams.length
        });
    } catch (error) {
        console.error('[ExamUpload] ❌ 查询列表失败:', error.message);
        res.status(500).json({ error: '查询失败', message: error.message });
    }
});

// ============================================
// DELETE /api/exam/:examId - 删除试卷
// ============================================

router.delete('/:examId', authMiddleware, (req, res) => {
    const examId = parseInt(req.params.examId);
    const userId = req.user.id;

    console.log(`[ExamUpload] 🗑️ 删除试卷, examId: ${examId}, userId: ${userId}`);

    try {
        const success = ExamDB.delete(examId, userId);
        if (success) {
            res.json({ success: true, message: '试卷已删除' });
        } else {
            res.status(404).json({ error: '试卷不存在或无权删除' });
        }
    } catch (error) {
        console.error('[ExamUpload] ❌ 删除失败:', error.message);
        res.status(500).json({ error: '删除失败', message: error.message });
    }
});

// ============================================
// Multer 错误处理
// ============================================

router.use((error, req, res, next) => {
    console.error('[ExamUpload] ⚠️ Multer错误:', error.message);

    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: '文件太大', message: '单个文件不能超过 20MB' });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: '文件过多', message: '最多上传 10 张图片' });
        }
        return res.status(400).json({ error: '上传错误', message: error.message });
    }

    if (error) {
        return res.status(400).json({ error: '上传失败', message: error.message });
    }

    next();
});

module.exports = router;
