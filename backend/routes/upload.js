/**
 * 文件上传路由 v2.4 - 修复版
 * POST /api/upload
 * 
 * 【v2.4 修复内容】
 * - 添加：强制用户认证（必须登录才能上传）
 * - 修复：确保所有任务都关联用户ID
 * - 改进：详细的调试日志
 * 
 * 之前的问题：允许未登录用户上传，导致任务没有user_id
 * 修复后：所有上传都需要登录，确保数据隔离
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const taskQueue = require('../services/taskQueue');
const { authMiddleware } = require('./auth');  // ⭐ 导入认证中间件

const router = express.Router();

// 确保 uploads 目录存在
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('[Upload] 创建 uploads 目录:', uploadsDir);
}

/**
 * v2.3: 修复中文文件名编码
 * multer 的 file.originalname 可能是 latin1 编码的，需要转换为 utf8
 */
function decodeFileName(filename) {
    try {
        // 尝试从 latin1 解码为 utf8
        const decoded = Buffer.from(filename, 'latin1').toString('utf8');
        
        // 检查解码后是否包含乱码（乱码通常包含替换字符）
        if (decoded.includes('�')) {
            return filename; // 如果解码后有乱码，返回原始文件名
        }
        
        return decoded;
    } catch (e) {
        console.log('[Upload] 文件名解码失败，使用原始名称:', e.message);
        return filename;
    }
}

// Multer 配置
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads'));
    },
    filename: (req, file, cb) => {
        // 生成唯一文件名，保留原始扩展名
        const ext = path.extname(file.originalname);
        const uniqueName = `${uuidv4()}${ext}`;
        cb(null, uniqueName);
    }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
    // 目前只支持 TXT 文件
    const allowedTypes = ['.txt', '.text'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error(`不支持的文件类型: ${ext}。目前只支持 .txt 文件`), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024  // 10MB 限制
    }
});

/**
 * 生成默认标题：X月X日课堂笔记
 */
function generateDefaultTitle() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    return `${month}月${day}日课堂笔记`;
}

/**
 * POST /api/upload
 * 上传文件并创建处理任务
 * 
 * ⭐ v2.4 重要修复：添加 authMiddleware，强制要求登录
 */
router.post('/upload', authMiddleware, upload.single('file'), (req, res) => {
    console.log('\n' + '='.repeat(60));
    console.log('[Upload] 📤 上传请求开始');
    console.log('='.repeat(60));
    
    // ⭐ v2.4: 从认证中间件获取用户信息
    const userId = req.user.id;
    const username = req.user.username;
    
    console.log(`[Upload] 👤 当前用户: ${username} (ID: ${userId})`);
    console.log(`[Upload] 📁 文件信息: ${req.file ? req.file.originalname : '无文件'}`);
    console.log(`[Upload] 📦 请求体: ${JSON.stringify(req.body)}`);
    
    try {
        // ========================================
        // 步骤1: 验证文件
        // ========================================
        if (!req.file) {
            console.log('[Upload] ❌ 验证失败: 没有检测到文件');
            return res.status(400).json({
                error: '请上传文件',
                message: '未检测到上传的文件'
            });
        }

        const file = req.file;
        
        // ========================================
        // 步骤2: 处理文件名
        // ========================================
        const originalName = decodeFileName(file.originalname);
        console.log(`[Upload] 📝 原始文件名: ${file.originalname}`);
        if (originalName !== file.originalname) {
            console.log(`[Upload] 📝 解码后文件名: ${originalName}`);
        }
        
        // ========================================
        // 步骤3: 获取自定义标题
        // ========================================
        const customTitle = req.body.customTitle?.trim() || generateDefaultTitle();
        console.log(`[Upload] 📝 任务标题: ${customTitle}`);
        
        // ========================================
        // 步骤4: 记录上传信息
        // ========================================
        console.log(`[Upload] 📊 文件大小: ${(file.size / 1024).toFixed(2)} KB`);
        console.log(`[Upload] 💾 保存路径: ${file.path}`);
        console.log(`[Upload] 🔒 用户ID: ${userId} (已验证)`);

        // ========================================
        // 步骤5: 创建任务（关联用户）
        // ========================================
        console.log('[Upload] 🚀 准备创建任务...');
        console.log(`[Upload]    - 文件: ${originalName}`);
        console.log(`[Upload]    - 标题: ${customTitle}`);
        console.log(`[Upload]    - 用户: ${userId}`);
        
        const task = taskQueue.createTask({
            originalName: originalName,
            savedPath: file.path,
            size: file.size,
            mimeType: file.mimetype,
            customTitle: customTitle,
            userId: userId  // ⭐ v2.4: 确保任务关联用户
        });
        
        console.log(`[Upload] ✅ 任务创建成功!`);
        console.log(`[Upload]    - 任务ID: ${task.id}`);
        console.log(`[Upload]    - 用户ID: ${task.userId}`);
        console.log(`[Upload]    - 状态: ${task.status}`);

        // ========================================
        // 步骤6: 返回响应
        // ========================================
        const response = {
            success: true,
            message: '文件上传成功，任务已创建',
            task: {
                id: task.id,
                status: task.status,
                file: {
                    name: originalName,
                    size: file.size
                },
                customTitle: customTitle,
                userId: userId,  // ⭐ 返回用户ID
                createdAt: task.createdAt
            },
            // 告诉前端如何获取进度
            progress: {
                websocket: `订阅 taskId: ${task.id}`,
                polling: `/api/task/${task.id}`
            }
        };
        
        console.log('[Upload] 📤 返回响应:');
        console.log(JSON.stringify(response, null, 2));
        console.log('='.repeat(60));
        console.log('[Upload] ✅ 上传请求完成');
        console.log('='.repeat(60) + '\n');
        
        res.status(201).json(response);

    } catch (error) {
        console.log('\n' + '='.repeat(60));
        console.log('[Upload] ❌ 上传失败');
        console.log('='.repeat(60));
        console.error('[Upload] 错误类型:', error.constructor.name);
        console.error('[Upload] 错误信息:', error.message);
        console.error('[Upload] 错误堆栈:');
        console.error(error.stack);
        console.log('='.repeat(60) + '\n');
        
        res.status(500).json({
            error: '上传失败',
            message: error.message
        });
    }
});

/**
 * 错误处理中间件（Multer错误）
 */
router.use((error, req, res, next) => {
    console.log('\n' + '='.repeat(60));
    console.log('[Upload] ⚠️ Multer 错误处理');
    console.log('='.repeat(60));
    console.error('[Upload] 错误类型:', error.constructor.name);
    console.error('[Upload] 错误信息:', error.message);
    console.error('[Upload] 错误堆栈:');
    console.error(error.stack);
    console.log('='.repeat(60) + '\n');
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: '文件太大',
                message: '文件大小不能超过 10MB'
            });
        }
        return res.status(400).json({
            error: '上传错误',
            message: error.message
        });
    }
    
    if (error) {
        return res.status(400).json({
            error: '上传失败',
            message: error.message
        });
    }
    
    next();
});

module.exports = router;
