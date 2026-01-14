/**
 * 文件上传路由
 * POST /api/upload
 * 
 * 【v2.2 更新】支持用户关联
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const taskQueue = require('../services/taskQueue');
const { verifyToken } = require('../services/userService');

const router = express.Router();

// 确保 uploads 目录存在
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('[Upload] 创建 uploads 目录:', uploadsDir);
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
 * 从请求中获取用户ID
 */
function getUserIdFromRequest(req) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return null;
        }
        
        const token = authHeader.substring(7);
        const payload = verifyToken(token);
        
        if (payload && payload.userId) {
            return payload.userId;
        }
        return null;
    } catch (e) {
        console.log('[Upload] 获取用户ID失败:', e.message);
        return null;
    }
}

/**
 * POST /api/upload
 * 上传文件并创建处理任务
 */
router.post('/upload', upload.single('file'), (req, res) => {
    console.log('=== 上传请求开始 ===');
    console.log('req.file:', req.file ? `${req.file.originalname} (${req.file.size} bytes)` : 'undefined');
    console.log('req.body:', req.body);
    
    try {
        if (!req.file) {
            console.log('❌ 没有检测到文件');
            return res.status(400).json({
                error: '请上传文件',
                message: '未检测到上传的文件'
            });
        }

        const file = req.file;
        
        // 【v2.2】获取当前登录用户ID
        const userId = getUserIdFromRequest(req);
        console.log(`👤 用户ID: ${userId || '未登录'}`);
        
        // 获取自定义标题，如果没有则使用默认标题
        const customTitle = req.body.customTitle?.trim() || generateDefaultTitle();
        
        console.log(`📤 文件上传: ${file.originalname} (${file.size} bytes)`);
        console.log(`📝 报告标题: ${customTitle}`);
        console.log(`📁 保存路径: ${file.path}`);

        // 创建任务，【v2.2】传入用户ID
        console.log('>>> 准备创建任务...');
        const task = taskQueue.createTask({
            originalName: file.originalname,
            savedPath: file.path,
            size: file.size,
            mimeType: file.mimetype,
            customTitle: customTitle,
            userId: userId  // 【v2.2 新增】关联用户
        });
        console.log('>>> 任务创建成功:', task.id, '用户:', userId);

        res.status(201).json({
            success: true,
            message: '文件上传成功，任务已创建',
            task: {
                id: task.id,
                status: task.status,
                file: {
                    name: file.originalname,
                    size: file.size
                },
                customTitle: customTitle,
                userId: userId,  // 【v2.2】返回给前端
                createdAt: task.createdAt
            },
            // 告诉前端如何获取进度
            progress: {
                websocket: `订阅 taskId: ${task.id}`,
                polling: `/api/task/${task.id}`
            }
        });
        console.log('=== 上传请求完成 ===');

    } catch (error) {
        console.error('❌ 上传失败:', error);
        console.error('❌ 错误堆栈:', error.stack);
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
    console.error('=== Multer 错误处理 ===');
    console.error('错误类型:', error.constructor.name);
    console.error('错误信息:', error.message);
    console.error('错误堆栈:', error.stack);
    
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