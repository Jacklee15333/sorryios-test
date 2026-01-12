/**
 * 文件上传路由
 * POST /api/upload
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const taskQueue = require('../services/taskQueue');

const router = express.Router();

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
 * POST /api/upload
 * 上传文件并创建处理任务
 */
router.post('/', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: '请上传文件',
                message: '未检测到上传的文件'
            });
        }

        const file = req.file;
        console.log(`📤 文件上传: ${file.originalname} (${file.size} bytes)`);

        // 创建任务
        const task = taskQueue.createTask({
            originalName: file.originalname,
            savedPath: file.path,
            size: file.size,
            mimeType: file.mimetype
        });

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
                createdAt: task.createdAt
            },
            // 告诉前端如何获取进度
            progress: {
                websocket: `订阅 taskId: ${task.id}`,
                polling: `/api/task/${task.id}`
            }
        });

    } catch (error) {
        console.error('❌ 上传失败:', error);
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
