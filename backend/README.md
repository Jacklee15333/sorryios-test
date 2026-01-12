# Sorryios AI 智能笔记系统 - 后端服务

> 📡 提供 RESTful API 和 WebSocket 实时进度推送

---

## 🚀 快速开始

### 1. 安装依赖

```powershell
cd sorryios-web\backend
npm install
```

### 2. 复制核心库文件

将你现有的核心代码复制到 `lib` 目录：

```powershell
# 假设原始代码在 D:\sorryios-test\
copy D:\sorryios-test\text-splitter.js .\lib\
copy D:\sorryios-test\sorryios-automation.js .\lib\
copy D:\sorryios-test\report-generator.js .\lib\
```

### 3. 启动服务

```powershell
# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
```

启动后访问：`http://localhost:3000`

---

## 📡 API 接口

### 健康检查
```
GET /api/health
```

### 上传文件
```
POST /api/upload
Content-Type: multipart/form-data
Body: file=<你的txt文件>

返回: { taskId, status, ... }
```

### 查询任务状态
```
GET /api/task/:taskId
```

### 获取任务列表
```
GET /api/task?page=1&limit=10
```

### 取消任务
```
POST /api/task/:taskId/cancel
```

### 获取报告
```
GET /api/report/:taskId
```

### 下载报告
```
GET /api/report/:taskId/download?format=html|md|json
```

---

## 🔌 WebSocket 实时进度

连接地址：`ws://localhost:3000`

### 订阅任务进度
```javascript
const socket = io('http://localhost:3000');

// 订阅任务
socket.emit('subscribe', taskId);

// 接收进度更新
socket.on('taskUpdate', (data) => {
    console.log('进度:', data.progress, '%');
    console.log('状态:', data.currentStep);
});
```

### 进度数据格式
```json
{
    "id": "task-uuid",
    "status": "processing",
    "progress": 45,
    "currentStep": "处理第 3/7 段...",
    "totalSegments": 7,
    "processedSegments": 2
}
```

---

## 📁 目录结构

```
backend/
├── server.js              # 主入口
├── package.json           # 依赖配置
├── routes/
│   ├── upload.js          # 文件上传 API
│   ├── task.js            # 任务管理 API
│   └── report.js          # 报告获取 API
├── services/
│   ├── taskQueue.js       # 内存任务队列
│   └── aiProcessor.js     # AI处理封装
├── lib/                   # ⚠️ 需要复制核心库
│   ├── text-splitter.js
│   ├── sorryios-automation.js
│   └── report-generator.js
├── uploads/               # 上传文件临时存储
└── outputs/               # 报告输出目录
```

---

## 🧪 使用 Postman 测试

### 测试1：上传文件
1. 新建 POST 请求：`http://localhost:3000/api/upload`
2. Body → form-data
3. 添加 Key: `file`，Type: File，选择一个 txt 文件
4. 发送请求，记下返回的 `taskId`

### 测试2：查询进度
```
GET http://localhost:3000/api/task/<taskId>
```

### 测试3：获取报告
```
GET http://localhost:3000/api/report/<taskId>
```

---

## ⚙️ 配置说明

编辑 `services/aiProcessor.js` 中的 CONFIG：

```javascript
const CONFIG = {
    maxSegmentLength: 6000,      // 每段最大字符数
    requestInterval: 15000,      // 段间等待时间(ms)
    responseTimeout: 180000,     // AI响应超时
    systemPrompt: '...',         // 自定义AI提示词
};
```

---

## 🔧 故障排除

### 问题：启动报错 "Cannot find module '../lib/xxx'"
**原因**：未复制核心库文件
**解决**：执行上面的"复制核心库文件"步骤

### 问题：浏览器无法启动
**原因**：Playwright 未安装浏览器
**解决**：
```powershell
npx playwright install chromium
```

### 问题：登录失败
**原因**：sorryios.ai 账号密码错误或已过期
**解决**：检查 `lib/sorryios-automation.js` 中的 CONFIG.username 和 CONFIG.password

---

## 📋 下一步

后端 API 测试通过后，可以开始开发前端：
1. React + Vite 项目搭建
2. 文件拖拽上传组件
3. 实时进度显示
4. 报告预览和下载

---

*文档更新：2026-01-11*
