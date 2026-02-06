/**
 * Sorryios AI 智能笔记系统 - 后端服务器 - v4.7.1 Bug修复版
 * 
 * 🐛 v4.7.1 Bug修复：
 * ✅ 修复客户端删除时的边界情况
 * ✅ 优化错误处理逻辑
 * ✅ 添加更完善的日志
 * 
 * 📦 v4.7 功能：
 * ✅ 添加 WebSocket 心跳机制 (ping/pong)
 * ✅ 添加客户端超时检测 (60秒无响应断开)
 * ✅ 添加详细的 WebSocket 调试日志
 * ✅ 修复切换标签页导致任务进度显示中断的问题
 * ✅ 保留所有原有功能和逻辑
 * 
 * 版本: v4.7.1
 * 更新: Bug修复版
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
// WebSocket 配置常量
// ============================================

const WS_CONFIG = {
    HEARTBEAT_INTERVAL: 30000,   // 心跳检测间隔 (30秒)
    CLIENT_TIMEOUT: 60000,       // 客户端超时时间 (60秒无响应则断开)
    DEBUG: true,                 // 调试日志开关
};

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

// 前端应用静态文件（如果存在）
const frontendPath = path.join(__dirname, 'public/app');
if (fs.existsSync(frontendPath)) {
    app.use('/app', express.static(frontendPath));
    console.log('[Server] ✓ 前端应用已加载: /app');
}

// 请求日志中间件
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    next();
});

// ============================================
// WebSocket 配置 - v4.7.1 Bug修复版
// ============================================

const wss = new WebSocket.Server({ server });

// WebSocket 连接管理
const wsClients = new Map(); // clientId -> { ws, taskId, lastPing, isAlive }

/**
 * WebSocket 调试日志函数
 */
function wsLog(message, type = 'INFO', data = null) {
    if (!WS_CONFIG.DEBUG) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[WebSocket ${timestamp}]`;
    const typeEmoji = {
        INFO: 'ℹ️',
        SUCCESS: '✅',
        ERROR: '❌',
        WARN: '⚠️',
        HEARTBEAT: '💓',
        MESSAGE: '📨',
        BROADCAST: '📤',
    };
    
    console.log(`${prefix} [${typeEmoji[type] || '•'}] ${message}`, data || '');
}

/**
 * 安全删除客户端
 */
function safeDeleteClient(clientId, reason = '未知') {
    const clientInfo = wsClients.get(clientId);
    if (clientInfo) {
        wsClients.delete(clientId);
        wsLog(`客户端已删除 [${clientId.substring(0, 8)}...]`, 'INFO', {
            reason,
            remainingClients: wsClients.size,
        });
        return true;
    }
    return false;
}

wss.on('connection', (ws, req) => {
    const clientId = Date.now().toString();
    
    // 初始化客户端信息
    const clientInfo = {
        ws: ws,
        taskId: null,
        lastPing: Date.now(),
        isAlive: true,
        connectedAt: new Date().toISOString(),
    };
    
    wsClients.set(clientId, clientInfo);
    
    // 获取连接来源信息
    const origin = req.headers.origin || '未知';
    const referer = req.headers.referer || '未知';
    
    // 详细日志
    wsLog('新连接', 'SUCCESS', {
        clientId: clientId.substring(0, 8) + '...',
        origin,
        referer,
        totalClients: wsClients.size,
    });

    // ========== 消息处理 ==========
    ws.on('message', (message) => {
        const msgStr = message.toString();
        
        try {
            const data = JSON.parse(msgStr);
            
            // 🆕 心跳 ping 处理
            if (data.type === 'ping') {
                clientInfo.lastPing = Date.now();
                clientInfo.isAlive = true;
                
                // 回复 pong
                try {
                    ws.send(JSON.stringify({ 
                        type: 'pong',
                        timestamp: Date.now(),
                        clientId: clientId,
                    }));
                    
                    wsLog(`心跳响应 [${clientId.substring(0, 8)}...]`, 'HEARTBEAT');
                } catch (error) {
                    wsLog(`心跳响应失败 [${clientId.substring(0, 8)}...]`, 'ERROR', error.message);
                }
                return;
            }
            
            // 订阅任务进度
            if (data.type === 'subscribe' && data.taskId) {
                clientInfo.taskId = data.taskId;
                wsLog(`订阅任务: ${data.taskId.substring(0, 8)}... [客户端: ${clientId.substring(0, 8)}...]`, 'INFO');
            }
            
            // 取消订阅
            else if (data.type === 'unsubscribe') {
                const oldTaskId = clientInfo.taskId;
                clientInfo.taskId = null;
                wsLog(`取消订阅任务: ${oldTaskId?.substring(0, 8) || '无'} [客户端: ${clientId.substring(0, 8)}...]`, 'INFO');
            }
            
            // 其他消息类型
            else {
                wsLog(`收到消息 [${clientId.substring(0, 8)}...]`, 'MESSAGE', {
                    type: data.type,
                    preview: msgStr.substring(0, 50),
                });
            }
            
        } catch (e) {
            wsLog(`非JSON消息 [${clientId.substring(0, 8)}...]`, 'WARN', {
                preview: msgStr.substring(0, 50),
            });
        }
    });

    // ========== 连接关闭 ==========
    ws.on('close', (code, reason) => {
        safeDeleteClient(clientId, `关闭 (code: ${code})`);
    });

    // ========== 错误处理 ==========
    ws.on('error', (error) => {
        wsLog(`错误 [${clientId.substring(0, 8)}...]`, 'ERROR', {
            message: error.message,
        });
        // 发生错误时删除客户端
        safeDeleteClient(clientId, '错误');
    });

    // ========== 发送连接成功消息 ==========
    try {
        ws.send(JSON.stringify({ 
            type: 'connected', 
            clientId,
            serverTime: new Date().toISOString(),
            heartbeatInterval: WS_CONFIG.HEARTBEAT_INTERVAL,
        }));
    } catch (error) {
        wsLog(`发送欢迎消息失败 [${clientId.substring(0, 8)}...]`, 'ERROR', error.message);
    }
});

// ============================================
// 🆕 心跳检测定时器
// ============================================

const heartbeatInterval = setInterval(() => {
    const now = Date.now();
    let aliveCount = 0;
    let timeoutCount = 0;
    
    // 转换为数组以避免在遍历时修改Map
    const clientsArray = Array.from(wsClients.entries());
    
    clientsArray.forEach(([clientId, clientInfo]) => {
        const timeSinceLastPing = now - clientInfo.lastPing;
        
        // 检查是否超时
        if (timeSinceLastPing > WS_CONFIG.CLIENT_TIMEOUT) {
            wsLog(`客户端超时，断开连接 [${clientId.substring(0, 8)}...]`, 'WARN', {
                lastPingAgo: `${(timeSinceLastPing / 1000).toFixed(0)}秒前`,
                timeout: `${WS_CONFIG.CLIENT_TIMEOUT / 1000}秒`,
            });
            
            try {
                clientInfo.ws.terminate();
            } catch (error) {
                wsLog(`终止连接失败 [${clientId.substring(0, 8)}...]`, 'ERROR', error.message);
            }
            
            safeDeleteClient(clientId, '超时');
            timeoutCount++;
        } else {
            aliveCount++;
        }
    });
    
    if (WS_CONFIG.DEBUG && (aliveCount > 0 || timeoutCount > 0)) {
        wsLog('心跳检测完成', 'HEARTBEAT', {
            存活: aliveCount,
            超时: timeoutCount,
        });
    }
}, WS_CONFIG.HEARTBEAT_INTERVAL);

// ============================================
// 广播任务进度更新 - v4.7.1 优化版
// ============================================

function broadcastTaskProgress(taskId, progress, status, message = '') {
    const data = {
        type: 'progress',
        taskId,
        progress,
        status,
        message,
        currentStep: message,
        timestamp: new Date().toISOString()
    };
    
    const dataStr = JSON.stringify(data);
    let sentCount = 0;
    let failCount = 0;

    wsClients.forEach((clientInfo, clientId) => {
        // 只发送给连接正常的客户端
        if (clientInfo.ws.readyState === WebSocket.OPEN) {
            try {
                clientInfo.ws.send(dataStr);
                sentCount++;
            } catch (error) {
                wsLog(`发送失败 [${clientId.substring(0, 8)}...]`, 'ERROR', {
                    error: error.message,
                });
                failCount++;
                // 发送失败，标记为需要清理
                safeDeleteClient(clientId, '发送失败');
            }
        } else {
            // WebSocket 不在 OPEN 状态，清理
            safeDeleteClient(clientId, '连接不可用');
        }
    });
    
    if (sentCount > 0 || failCount > 0) {
        wsLog(`推送进度: ${taskId.substring(0, 8)}...`, 'BROADCAST', {
            进度: `${progress}%`,
            状态: status,
            消息: message.substring(0, 30),
            成功: sentCount,
            失败: failCount,
        });
    }
}

// 导出广播函数供其他模块使用
global.broadcastTaskProgress = broadcastTaskProgress;

// 将进度回调注入到 taskQueue
const taskQueue = require('./services/taskQueue');
taskQueue.setProgressCallback((taskId, task) => {
    wsLog(`任务进度更新: ${taskId.substring(0, 8)}...`, 'INFO', {
        进度: `${task.progress}%`,
        步骤: task.currentStep?.substring(0, 30),
    });
    
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
        version: '4.7.1',
        wsClients: wsClients.size,
        wsConfig: {
            heartbeatInterval: WS_CONFIG.HEARTBEAT_INTERVAL,
            clientTimeout: WS_CONFIG.CLIENT_TIMEOUT,
        }
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

// ============================================
// 路由加载顺序（具体路由在前，通配符路由在后）
// ============================================

loadRoute('admin', './routes/admin', '/api/admin');
loadRoute('chunk-api', './routes/chunk-api', '/api/chunk');
loadRoute('ai-api', './routes/ai-api', '/api/ai');
loadRoute('grammar-api', './routes/grammar-api', '/api/grammar');
loadRoute('vocabulary-api', './routes/vocabulary-api', '/api/vocabulary');
loadRoute('processing-log-api', './routes/processing-log-api', '/api/processing-log');
loadRoute('matching-dict-api', './routes/matching-dict-api', '/api/matching-dict');
loadRoute('user-mastered-api', './routes/user-mastered-api', '/api/user-mastered');

// 通配符路由放最后
loadRoute('upload', './routes/upload', '/api');
loadRoute('auth', './routes/auth', '/api');
loadRoute('report', './routes/report', '/api');
loadRoute('task', './routes/task', '/api');

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

app.get('/matching-dict-admin', (req, res) => {
    const matchingDictAdminPath = path.join(__dirname, 'public/matching-dict-admin.html');
    if (fs.existsSync(matchingDictAdminPath)) {
        res.sendFile(matchingDictAdminPath);
    } else {
        res.status(404).send('匹配词典管理页面不存在');
    }
});

// ============================================
// 根路径和前端应用路由
// ============================================

// 根路径：优先显示前端应用，否则显示API信息
app.get('/', (req, res) => {
    const frontendIndex = path.join(__dirname, 'public/app/index.html');
    if (fs.existsSync(frontendIndex)) {
        res.sendFile(frontendIndex);
    } else {
        res.json({
            name: 'Sorryios AI 智能笔记系统',
            version: '4.7.1',
            frontend: '前端应用未部署，请访问 /admin 进入管理后台',
            endpoints: {
                health: '/api/health',
                upload: '/api/upload',
                task: '/api/task/:id',
                admin: '/admin',
                userMastered: '/api/user-mastered',
                matchingDict: '/api/matching-dict'
            },
            changelog: {
                v471: 'Bug修复：优化客户端删除逻辑',
                v47: '添加 WebSocket 心跳机制，修复切换标签页问题'
            }
        });
    }
});

// 前端应用SPA路由支持（处理前端路由刷新问题）
app.get('/app/*', (req, res) => {
    const frontendIndex = path.join(__dirname, 'public/app/index.html');
    if (fs.existsSync(frontendIndex)) {
        res.sendFile(frontendIndex);
    } else {
        res.status(404).send('前端应用未部署');
    }
});

// ============================================
// 错误处理
// ============================================

// 404处理 - 对于非API请求，尝试返回前端应用
app.use((req, res, next) => {
    // API请求返回JSON错误
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            error: '接口不存在',
            path: req.path
        });
    }
    
    // 非API请求，如果前端存在则返回前端（支持SPA路由）
    const frontendIndex = path.join(__dirname, 'public/app/index.html');
    if (fs.existsSync(frontendIndex)) {
        return res.sendFile(frontendIndex);
    }
    
    // 都不存在，返回404
    res.status(404).json({
        success: false,
        error: '页面不存在',
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
    const hasFrontend = fs.existsSync(path.join(__dirname, 'public/app/index.html'));
    
    console.log('\n' + '='.repeat(60));
    console.log('  Sorryios AI 智能笔记系统 v4.7.1 (Bug修复版)');
    console.log('  🐛 修复重连逻辑和客户端删除问题');
    console.log('  🆕 WebSocket 心跳机制');
    console.log('  🆕 修复切换标签页导致进度中断的问题');
    console.log('='.repeat(60));
    console.log(`  🚀 服务器启动成功！`);
    console.log(`  📡 地址: http://localhost:${PORT}`);
    console.log(`  🔌 WebSocket: ws://localhost:${PORT}`);
    console.log('');
    console.log('  ⚙️  WebSocket 配置:');
    console.log(`     - 心跳间隔: ${WS_CONFIG.HEARTBEAT_INTERVAL / 1000} 秒`);
    console.log(`     - 超时时间: ${WS_CONFIG.CLIENT_TIMEOUT / 1000} 秒`);
    console.log(`     - 调试日志: ${WS_CONFIG.DEBUG ? '开启 ✅' : '关闭 ❌'}`);
    console.log('');
    console.log('  📌 可用页面:');
    if (hasFrontend) {
        console.log(`     - 前端应用: http://localhost:${PORT}/`);
        console.log(`     - 前端应用: http://localhost:${PORT}/app`);
    }
    console.log(`     - 管理后台: http://localhost:${PORT}/admin`);
    console.log(`     - 语法库管理: http://localhost:${PORT}/grammar-admin`);
    console.log(`     - 词库管理: http://localhost:${PORT}/vocabulary-admin`);
    console.log(`     - 处理日志: http://localhost:${PORT}/processing-log-admin`);
    console.log(`     - 替换库管理: http://localhost:${PORT}/matching-dict-admin`);
    console.log('');
    console.log('  📌 API 接口:');
    console.log(`     - 健康检查: http://localhost:${PORT}/api/health`);
    console.log(`     - 文件上传: POST http://localhost:${PORT}/api/upload`);
    console.log(`     - 任务查询: GET http://localhost:${PORT}/api/task/:id`);
    console.log('='.repeat(60) + '\n');
});

// ============================================
// 优雅关闭
// ============================================

process.on('SIGINT', () => {
    console.log('\n[Server] 正在关闭服务器...');
    
    // 清理心跳定时器
    clearInterval(heartbeatInterval);
    
    // 关闭所有 WebSocket 连接
    wsClients.forEach((clientInfo, clientId) => {
        try {
            clientInfo.ws.close(1000, 'Server shutting down');
        } catch (e) {
            // 忽略错误
        }
    });
    wsClients.clear();
    
    server.close(() => {
        console.log('[Server] 服务器已关闭');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n[Server] 收到终止信号，正在关闭...');
    clearInterval(heartbeatInterval);
    server.close(() => process.exit(0));
});

process.on('uncaughtException', (err) => {
    console.error('[Server] 未捕获的异常:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Server] 未处理的 Promise 拒绝:', reason);
});

module.exports = { app, server, wss, broadcastTaskProgress };