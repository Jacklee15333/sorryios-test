/**
 * Sorryios AI 智能笔记系统 - 后端服务器
 * 
 * 版本: v4.1.0
 * 更新: 添加用户已掌握词汇API
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

// 创建 Express 应用
const app = express();
const server = http.createServer(app);

// 配置
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ============================================
// 中间件配置
// ============================================

// CORS 跨域配置
app.use(cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'],
    credentials: true
}));

// JSON 解析
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 请求日志中间件
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    next();
});

// ============================================
// WebSocket 配置
// ============================================

const wss = new WebSocket.Server({ server });

// WebSocket 连接管理
const wsClients = new Map();

wss.on('connection', (ws, req) => {
    const clientId = Date.now().toString();
    wsClients.set(clientId, ws);
    
    // 获取连接来源信息
    const origin = req.headers.origin || '未知';
    const referer = req.headers.referer || '未知';
    
    // 详细日志
    console.log('\n' + '─'.repeat(50));
    console.log(`[WebSocket] ✅ 新连接`);
    console.log(`   客户端ID: ${clientId}`);
    console.log(`   来源Origin: ${origin}`);
    console.log(`   来源页面: ${referer}`);
    console.log(`   当前连接数: ${wsClients.size}`);
    console.log('─'.repeat(50));

    ws.on('message', (message) => {
        const msgStr = message.toString();
        console.log(`[WebSocket] 📥 收到消息 [${clientId}]: ${msgStr.substring(0, 100)}`);
        
        try {
            const data = JSON.parse(msgStr);
            
            // 处理订阅任务进度
            if (data.type === 'subscribe' && data.taskId) {
                ws.taskId = data.taskId;
                console.log(`[WebSocket] 📌 订阅任务: ${data.taskId}`);
            }
            // ping/pong 心跳
            else if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
                console.log(`[WebSocket] 💓 心跳响应 [${clientId}]`);
            }
            // 取消订阅
            else if (data.type === 'unsubscribe') {
                ws.taskId = null;
            }
        } catch (e) {
            console.log(`[WebSocket] ⚠️ 非JSON消息 [${clientId}]: "${msgStr.substring(0, 50)}..."`);
        }
    });

    ws.on('close', (code, reason) => {
        wsClients.delete(clientId);
        console.log(`[WebSocket] ❌ 连接断开 [${clientId}] 码:${code} 剩余:${wsClients.size}`);
    });

    ws.on('error', (error) => {
        wsClients.delete(clientId);
        console.log(`[WebSocket] ❌ 错误 [${clientId}]:`, error.message);
    });

    // 发送连接成功消息
    ws.send(JSON.stringify({ type: 'connected', clientId }));
});

// 广播任务进度更新
function broadcastTaskProgress(taskId, progress, status, message = '') {
    const data = JSON.stringify({
        type: 'progress',
        taskId,
        progress,
        status,
        message,
        currentStep: message,  // 🔧 同时发送两个字段，兼容前端
        timestamp: new Date().toISOString()
    });

    let sentCount = 0;
    wsClients.forEach((ws, clientId) => {
        if (ws.readyState === WebSocket.OPEN) {
            // 🔧 修改：发送给所有连接的客户端，让前端自己过滤
            ws.send(data);
            sentCount++;
        }
    });
    
    // 调试：显示发送了多少个客户端
    if (sentCount > 0) {
        console.log(`[WebSocket] 📤 推送进度: ${taskId.slice(0,8)} - ${progress}% - ${message.substring(0, 30)} (${sentCount}个客户端)`);
    }
}

// 导出广播函数供其他模块使用
global.broadcastTaskProgress = broadcastTaskProgress;

// 🔧 关键修复：将进度回调注入到 taskQueue
const taskQueue = require('./services/taskQueue');
taskQueue.setProgressCallback((taskId, task) => {
    console.log(`[WebSocket] 📤 推送进度: ${taskId.slice(0,8)} - ${task.progress}% - ${task.currentStep}`);
    broadcastTaskProgress(taskId, task.progress, task.status, task.currentStep);
});

// ============================================
// 路由配置
// ============================================

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '4.1.0',
        wsClients: wsClients.size
    });
});

// 路由加载函数
function loadRoute(name, routePath, mountPath) {
    try {
        const router = require(routePath);
        const actualRouter = router.router || router;
        app.use(mountPath, actualRouter);
        console.log(`[Server] ✓ 加载路由: ${name}`);
        return actualRouter;
    } catch (e) {
        console.warn(`[Server] ✗ 路由 ${name} 加载失败: ${e.message}`);
        return null;
    }
}

// 加载所有路由
loadRoute('upload', './routes/upload', '/api');
loadRoute('task', './routes/task', '/api');
loadRoute('report', './routes/report', '/api');
loadRoute('admin', './routes/admin', '/api/admin');
loadRoute('chunk-api', './routes/chunk-api', '/api/chunk');
loadRoute('ai-api', './routes/ai-api', '/api/ai');
loadRoute('auth', './routes/auth', '/api');  // 修复：挂载到 /api（auth.js 里已包含 /auth 和 /user 前缀）
loadRoute('grammar-api', './routes/grammar-api', '/api/grammar');
loadRoute('vocabulary-api', './routes/vocabulary-api', '/api/vocabulary');
loadRoute('processing-log-api', './routes/processing-log-api', '/api/processing-log');

// 🆕 v4.1.0: 用户已掌握词汇API
loadRoute('user-mastered-api', './routes/user-mastered-api', '/api/user-mastered');

// ============================================
// 页面路由
// ============================================

app.get('/admin', (req, res) => {
    const adminPath = path.join(__dirname, 'public/admin.html');
    if (fs.existsSync(adminPath)) {
        res.sendFile(adminPath);
    } else {
        res.status(404).send('管理后台页面不存在');
    }
});

app.get('/grammar-admin', (req, res) => {
    const grammarAdminPath = path.join(__dirname, 'public/grammar-admin.html');
    if (fs.existsSync(grammarAdminPath)) {
        res.sendFile(grammarAdminPath);
    } else {
        res.status(404).send('语法库管理页面不存在');
    }
});

app.get('/vocabulary-admin', (req, res) => {
    const vocabularyAdminPath = path.join(__dirname, 'public/vocabulary-admin.html');
    if (fs.existsSync(vocabularyAdminPath)) {
        res.sendFile(vocabularyAdminPath);
    } else {
        res.status(404).send('词库管理页面不存在');
    }
});

app.get('/processing-log-admin', (req, res) => {
    const processingLogAdminPath = path.join(__dirname, 'public/processing-log-admin.html');
    if (fs.existsSync(processingLogAdminPath)) {
        res.sendFile(processingLogAdminPath);
    } else {
        res.status(404).send('处理日志管理页面不存在');
    }
});

app.get('/', (req, res) => {
    res.json({
        name: 'Sorryios AI 智能笔记系统',
        version: '4.1.0',
        endpoints: {
            health: '/api/health',
            upload: '/api/upload',
            task: '/api/task/:id',
            admin: '/admin',
            userMastered: '/api/user-mastered'
        }
    });
});

// ============================================
// 错误处理
// ============================================

app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        error: '接口不存在',
        path: req.path
    });
});

app.use((err, req, res, next) => {
    console.error('[Server] 错误:', err);
    res.status(500).json({
        success: false,
        error: err.message || '服务器内部错误'
    });
});

// ============================================
// 确保必要目录存在
// ============================================

const requiredDirs = [
    path.join(__dirname, 'uploads'),
    path.join(__dirname, 'outputs'),
    path.join(__dirname, 'data'),
    path.join(__dirname, 'data/chunks'),
    path.join(__dirname, 'data/progress'),
    path.join(__dirname, 'data/results'),
    path.join(__dirname, 'public')
];

requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[Server] 创建目录: ${dir}`);
    }
});

// ============================================
// 启动服务器
// ============================================

server.listen(PORT, HOST, () => {
    console.log('\n' + '='.repeat(60));
    console.log('  Sorryios AI 智能笔记系统 v4.1.0');
    console.log('='.repeat(60));
    console.log(`  🚀 服务器启动成功！`);
    console.log(`  📡 地址: http://localhost:${PORT}`);
    console.log(`  🔌 WebSocket: ws://localhost:${PORT}`);
    console.log('');
    console.log('  📌 可用页面:');
    console.log(`     - 管理后台: http://localhost:${PORT}/admin`);
    console.log(`     - 语法库管理: http://localhost:${PORT}/grammar-admin`);
    console.log(`     - 词库管理: http://localhost:${PORT}/vocabulary-admin`);
    console.log(`     - 处理日志: http://localhost:${PORT}/processing-log-admin`);
    console.log('');
    console.log('  📌 API 接口:');
    console.log(`     - 健康检查: http://localhost:${PORT}/api/health`);
    console.log(`     - 文件上传: POST http://localhost:${PORT}/api/upload`);
    console.log(`     - 任务查询: GET http://localhost:${PORT}/api/task/:id`);
    console.log(`     - 语法库: http://localhost:${PORT}/api/grammar`);
    console.log(`     - 词库: http://localhost:${PORT}/api/vocabulary`);
    console.log(`     - 处理日志: http://localhost:${PORT}/api/processing-log`);
    console.log(`     - 已掌握词汇: http://localhost:${PORT}/api/user-mastered`);
    console.log('='.repeat(60) + '\n');
});

// ============================================
// 优雅关闭
// ============================================

process.on('SIGINT', () => {
    console.log('\n[Server] 正在关闭服务器...');
    wsClients.forEach((ws) => ws.close());
    server.close(() => {
        console.log('[Server] 服务器已关闭');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n[Server] 收到终止信号，正在关闭...');
    server.close(() => process.exit(0));
});

process.on('uncaughtException', (err) => {
    console.error('[Server] 未捕获的异常:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Server] 未处理的 Promise 拒绝:', reason);
});

module.exports = { app, server, wss, broadcastTaskProgress };