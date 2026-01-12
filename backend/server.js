/**
 * Sorryios AI 智能笔记系统 - 后端服务入口
 * 
 * 功能：
 * - 文件上传 API
 * - 任务状态查询
 * - WebSocket 实时进度推送
 * - 报告获取/下载
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// 路由
const uploadRoutes = require('./routes/upload');
const taskRoutes = require('./routes/task');
const reportRoutes = require('./routes/report');

// 服务
const taskQueue = require('./services/taskQueue');
const aiProcessor = require('./services/aiProcessor');

const app = express();
const server = http.createServer(app);

// WebSocket 配置
const io = new Server(server, {
    cors: {
        origin: '*', // 开发环境允许所有来源，生产环境请限制
        methods: ['GET', 'POST']
    }
});

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务（报告文件）
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));

// 将 io 实例挂载到 app，供路由使用
app.set('io', io);

// API 路由
app.use('/api/upload', uploadRoutes);
app.use('/api/task', taskRoutes);
app.use('/api/report', reportRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        queueSize: taskQueue.getQueueSize(),
        activeTasks: taskQueue.getActiveTasks()
    });
});

// 根路径
app.get('/', (req, res) => {
    res.json({
        name: 'Sorryios AI 智能笔记系统',
        version: '1.0.0',
        endpoints: {
            upload: 'POST /api/upload',
            taskStatus: 'GET /api/task/:id',
            taskList: 'GET /api/task',
            report: 'GET /api/report/:id',
            download: 'GET /api/report/:id/download',
            health: 'GET /api/health'
        }
    });
});

// WebSocket 连接处理
io.on('connection', (socket) => {
    console.log(`📡 客户端连接: ${socket.id}`);

    // 客户端订阅任务进度
    socket.on('subscribe', (taskId) => {
        socket.join(`task:${taskId}`);
        console.log(`👀 客户端 ${socket.id} 订阅任务: ${taskId}`);
        
        // 立即发送当前状态
        const task = taskQueue.getTask(taskId);
        if (task) {
            socket.emit('taskUpdate', task);
        }
    });

    // 取消订阅
    socket.on('unsubscribe', (taskId) => {
        socket.leave(`task:${taskId}`);
        console.log(`👋 客户端 ${socket.id} 取消订阅: ${taskId}`);
    });

    socket.on('disconnect', () => {
        console.log(`📴 客户端断开: ${socket.id}`);
    });
});

// 任务进度更新回调（供 aiProcessor 调用）
taskQueue.setProgressCallback((taskId, progress) => {
    io.to(`task:${taskId}`).emit('taskUpdate', progress);
    console.log(`📤 推送进度: 任务 ${taskId.slice(0, 8)}... - ${progress.status} (${progress.progress || 0}%)`);
});

// 错误处理
app.use((err, req, res, next) => {
    console.error('❌ 服务器错误:', err);
    res.status(500).json({
        error: '服务器内部错误',
        message: err.message
    });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    // 初始化 AI 处理器
    aiProcessor.init();
    
    console.log('');
    console.log('🚀 ====================================');
    console.log('🚀  Sorryios AI 智能笔记系统');
    console.log('🚀 ====================================');
    console.log(`📡 服务地址: http://localhost:${PORT}`);
    console.log(`📡 API文档:  http://localhost:${PORT}/`);
    console.log(`📡 健康检查: http://localhost:${PORT}/api/health`);
    console.log('🚀 ====================================');
    console.log('');
});

module.exports = { app, server, io };
