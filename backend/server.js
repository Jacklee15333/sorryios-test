/**
 * Sorryios AI 智能笔记系统 - 后端服务器
 * 
 * 功能：
 * - 文件上传和处理
 * - AI 分析任务队列
 * - WebSocket 实时进度推送
 * - 用户认证
 * - 语法库管理
 * - 报告生成和下载
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
    console.log(`[WebSocket] 客户端连接: ${clientId}`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`[WebSocket] 收到消息:`, data);
            
            // 处理订阅任务进度
            if (data.type === 'subscribe' && data.taskId) {
                ws.taskId = data.taskId;
            }
        } catch (e) {
            console.error('[WebSocket] 消息解析错误:', e);
        }
    });

    ws.on('close', () => {
        wsClients.delete(clientId);
        console.log(`[WebSocket] 客户端断开: ${clientId}`);
    });

    ws.on('error', (error) => {
        console.error(`[WebSocket] 错误:`, error);
        wsClients.delete(clientId);
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
        timestamp: new Date().toISOString()
    });

    wsClients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN && (!ws.taskId || ws.taskId === taskId)) {
            ws.send(data);
        }
    });
}

// 导出广播函数供其他模块使用
global.broadcastTaskProgress = broadcastTaskProgress;

// ============================================
// 路由配置
// ============================================

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '3.2'
    });
});

// 导入路由模块
let uploadRouter, taskRouter, reportRouter, adminRouter, chunkApiRouter, aiApiRouter, authRouter, grammarApiRouter;

try {
    uploadRouter = require('./routes/upload');
    console.log('[Server] ✓ 加载路由: upload');
} catch (e) {
    console.warn('[Server] ✗ 路由 upload 不存在，跳过');
}

try {
    taskRouter = require('./routes/task');
    console.log('[Server] ✓ 加载路由: task');
} catch (e) {
    console.warn('[Server] ✗ 路由 task 不存在，跳过');
}

try {
    reportRouter = require('./routes/report');
    console.log('[Server] ✓ 加载路由: report');
} catch (e) {
    console.warn('[Server] ✗ 路由 report 不存在，跳过');
}

try {
    adminRouter = require('./routes/admin');
    console.log('[Server] ✓ 加载路由: admin');
} catch (e) {
    console.warn('[Server] ✗ 路由 admin 不存在，跳过');
}

try {
    chunkApiRouter = require('./routes/chunk-api');
    console.log('[Server] ✓ 加载路由: chunk-api');
} catch (e) {
    console.warn('[Server] ✗ 路由 chunk-api 不存在，跳过');
}

try {
    aiApiRouter = require('./routes/ai-api');
    console.log('[Server] ✓ 加载路由: ai-api');
} catch (e) {
    console.warn('[Server] ✗ 路由 ai-api 不存在，跳过');
}

try {
    const authModule = require('./routes/auth');
    // auth.js 可能导出 { router, authMiddleware } 或直接导出 router
    authRouter = authModule.router || authModule;
    console.log('[Server] ✓ 加载路由: auth');
} catch (e) {
    console.warn('[Server] ✗ 路由 auth 不存在，跳过');
}

try {
    grammarApiRouter = require('./routes/grammar-api');
    console.log('[Server] ✓ 加载路由: grammar-api');
} catch (e) {
    console.warn('[Server] ✗ 路由 grammar-api 不存在，跳过');
}

// 注册路由 (注意顺序：具体路径要在通配符路径之前)
if (grammarApiRouter) app.use('/api/grammar', grammarApiRouter);  // 放在前面，避免被task拦截
if (uploadRouter) app.use('/api', uploadRouter);
if (taskRouter) app.use('/api', taskRouter);
if (reportRouter) app.use('/api', reportRouter);
if (adminRouter) app.use('/api/admin', adminRouter);
if (chunkApiRouter) app.use('/api/chunk', chunkApiRouter);
if (aiApiRouter) app.use('/api/ai', aiApiRouter);
if (authRouter) app.use('/', authRouter);  // auth 路由包含 /api/auth 和 /api/user

// ============================================
// 页面路由
// ============================================

// 管理后台
app.get('/admin', (req, res) => {
    const adminPath = path.join(__dirname, 'public/admin.html');
    if (fs.existsSync(adminPath)) {
        res.sendFile(adminPath);
    } else {
        res.status(404).send('管理后台页面不存在');
    }
});

// 语法库管理页面
app.get('/grammar-admin', (req, res) => {
    const grammarAdminPath = path.join(__dirname, 'public/grammar-admin.html');
    if (fs.existsSync(grammarAdminPath)) {
        res.sendFile(grammarAdminPath);
    } else {
        res.status(404).send('语法库管理页面不存在，请先复制 grammar-admin.html 到 public 目录');
    }
});

// 根路径
app.get('/', (req, res) => {
    res.json({
        name: 'Sorryios AI 智能笔记系统',
        version: '3.2',
        endpoints: {
            health: '/api/health',
            upload: '/api/upload',
            task: '/api/task/:id',
            admin: '/admin',
            grammarAdmin: '/grammar-admin',
            grammar: '/api/grammar'
        }
    });
});

// ============================================
// 错误处理
// ============================================

// 404 处理
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        error: '接口不存在',
        path: req.path
    });
});

// 全局错误处理
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
    console.log('  Sorryios AI 智能笔记系统 v3.2');
    console.log('='.repeat(60));
    console.log(`  🚀 服务器启动成功！`);
    console.log(`  📡 地址: http://localhost:${PORT}`);
    console.log(`  🔌 WebSocket: ws://localhost:${PORT}`);
    console.log('');
    console.log('  📌 可用页面:');
    console.log(`     - 管理后台: http://localhost:${PORT}/admin`);
    console.log(`     - 语法库管理: http://localhost:${PORT}/grammar-admin`);
    console.log('');
    console.log('  📌 API 接口:');
    console.log(`     - 健康检查: http://localhost:${PORT}/api/health`);
    console.log(`     - 文件上传: POST http://localhost:${PORT}/api/upload`);
    console.log(`     - 任务查询: GET http://localhost:${PORT}/api/task/:id`);
    console.log(`     - 语法库: http://localhost:${PORT}/api/grammar`);
    console.log('='.repeat(60) + '\n');
});

// ============================================
// 优雅关闭
// ============================================

process.on('SIGINT', () => {
    console.log('\n[Server] 正在关闭服务器...');
    
    // 关闭 WebSocket 连接
    wsClients.forEach((ws) => {
        ws.close();
    });
    
    server.close(() => {
        console.log('[Server] 服务器已关闭');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n[Server] 收到终止信号，正在关闭...');
    server.close(() => {
        process.exit(0);
    });
});

// 未捕获的异常处理
process.on('uncaughtException', (err) => {
    console.error('[Server] 未捕获的异常:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Server] 未处理的 Promise 拒绝:', reason);
});

module.exports = { app, server, wss, broadcastTaskProgress };