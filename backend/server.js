/**
 * Sorryios AI 智能笔记系统 - 后端服务入口 (增强版)
 * 
 * 新增功能：
 * - SQLite 数据库
 * - 管理员 Dashboard
 * - 用户管理
 * - 任务记录持久化
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
const adminRoutes = require('./routes/admin');

// 服务
const taskQueue = require('./services/taskQueue');
const aiProcessor = require('./services/aiProcessor');

// 数据库（新增）
const { initDatabase, LogDB } = require('./services/database');

const app = express();
const server = http.createServer(app);

// WebSocket 配置
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));
app.use('/admin', express.static(path.join(__dirname, 'public'))); // 管理后台静态文件

// 将 io 实例挂载到 app
app.set('io', io);

// API 路由
app.use('/api/upload', uploadRoutes);
app.use('/api/task', taskRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/admin', adminRoutes);  // 新增：管理员 API

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        queueSize: taskQueue.getQueueSize(),
        activeTasks: taskQueue.getActiveTasks(),
        database: 'connected'
    });
});

// 根路径 - API 文档
app.get('/', (req, res) => {
    res.json({
        name: 'Sorryios AI 智能笔记系统',
        version: '2.0.0',
        endpoints: {
            // 原有 API
            upload: 'POST /api/upload',
            taskStatus: 'GET /api/task/:id',
            taskList: 'GET /api/task',
            report: 'GET /api/report/:id',
            download: 'GET /api/report/:id/download',
            health: 'GET /api/health',
            // 新增：管理员 API
            adminDashboard: 'GET /api/admin/dashboard',
            adminUsers: 'GET /api/admin/users',
            adminTasks: 'GET /api/admin/tasks',
            adminFiles: 'GET /api/admin/files',
            adminLogs: 'GET /api/admin/logs'
        },
        links: {
            frontend: 'http://localhost:5173',
            adminPanel: 'http://localhost:3000/admin/admin.html'
        }
    });
});

// 管理后台入口重定向
app.get('/admin', (req, res) => {
    res.redirect('/admin/admin.html');
});

// WebSocket 连接处理
io.on('connection', (socket) => {
    console.log(`📡 Client connected: ${socket.id}`);

    socket.on('subscribe', (taskId) => {
        socket.join(`task:${taskId}`);
        console.log(`👀 Client ${socket.id} subscribed to: ${taskId}`);
        
        const task = taskQueue.getTask(taskId);
        if (task) {
            socket.emit('taskUpdate', task);
        }
    });

    socket.on('unsubscribe', (taskId) => {
        socket.leave(`task:${taskId}`);
    });

    socket.on('disconnect', () => {
        console.log(`📴 Client disconnected: ${socket.id}`);
    });
});

// 任务进度更新回调
taskQueue.setProgressCallback((taskId, progress) => {
    io.to(`task:${taskId}`).emit('taskUpdate', progress);
    console.log(`📤 Progress: Task ${taskId.slice(0, 8)}... - ${progress.status} (${progress.progress || 0}%)`);
});

// 错误处理
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    
    // 记录错误日志
    LogDB.add({
        level: 'error',
        action: 'server_error',
        message: err.message,
        details: { stack: err.stack }
    });
    
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
    });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    // 初始化 AI 处理器
    aiProcessor.init();
    
    console.log('');
    console.log('='.repeat(60));
    console.log('  🤖 Sorryios AI Smart Note System v2.0');
    console.log('='.repeat(60));
    console.log(`  📡 API Server:    http://localhost:${PORT}`);
    console.log(`  📡 API Docs:      http://localhost:${PORT}/`);
    console.log(`  📡 Health Check:  http://localhost:${PORT}/api/health`);
    console.log('  ' + '-'.repeat(56));
    console.log(`  🔧 Admin Panel:   http://localhost:${PORT}/admin`);
    console.log(`  👤 Default Login: admin / admin123`);
    console.log('='.repeat(60));
    console.log('');
});

module.exports = { app, server, io };
