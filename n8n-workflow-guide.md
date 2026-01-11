# 📋 n8n 工作流配置指南

## 一、整体架构

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Schedule   │───▶│  Read Files  │───▶│    Switch    │
│   Trigger    │    │  from Disk   │    │  (文件类型)   │
└──────────────┘    └──────────────┘    └──────┬───────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
                    ▼                          ▼                          ▼
             ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
             │    音频      │          │    文本      │          │    其他      │
             │   Whisper    │          │   直接处理   │          │   跳过      │
             └──────┬───────┘          └──────┬───────┘          └──────────────┘
                    │                          │
                    └────────────┬─────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │     Execute Command      │
                    │    (main-processor.js)   │
                    └──────────────┬───────────┘
                                   ▼
                    ┌──────────────────────────┐
                    │     Move Processed       │
                    │        File              │
                    └──────────────────────────┘
```

---

## 二、节点配置详解

### 2.1 Schedule Trigger（定时触发）

**作用**：每隔一段时间检查输入文件夹

```
节点类型: Schedule Trigger
设置:
  - Trigger Interval: Custom (Cron)
  - Cron Expression: */30 * * * * *   (每30秒)
  
  或者使用简单模式:
  - Trigger Interval: Seconds
  - Seconds Between Triggers: 30
```

---

### 2.2 Read Files from Disk（读取文件）

**作用**：读取 `/input` 目录中的文件

```
节点类型: Read/Write Files from Disk
Operation: Read File(s) From Disk

设置:
  - File(s) Selector: /input/*
  - Options:
    - File Extension: (留空，读取所有文件)
```

---

### 2.3 Switch（文件类型判断）

**作用**：根据文件扩展名分流处理

```
节点类型: Switch
Mode: Rules

Rules:
  1. 音频文件 (Audio)
     - Value 1: {{ $json.fileName }}
     - Operation: Regex Match
     - Value 2: \.(mp3|wav|m4a|flac|ogg|webm)$
     - Output: 0
  
  2. 文本文件 (Text)
     - Value 1: {{ $json.fileName }}
     - Operation: Regex Match
     - Value 2: \.(txt|md)$
     - Output: 1
  
  3. 其他文件 (Fallback)
     - Output: 2
```

---

### 2.4 Execute Command - Whisper转写（音频分支）

**作用**：调用Whisper将音频转为文本

```
节点类型: Execute Command

Command:
whisper "/input/{{ $json.fileName }}" --model large-v3 --language zh --output_format txt --output_dir "/output"

Options:
  - Execute in: Shell
  - Timeout: 1800000 (30分钟，音频转写可能很慢)
```

---

### 2.5 Execute Command - 主处理脚本

**作用**：调用Node.js脚本执行完整流程

```
节点类型: Execute Command

Command:
cd /app && node main-processor.js --input "/input/{{ $json.fileName }}" --output "/output"

Options:
  - Execute in: Shell
  - Timeout: 600000 (10分钟)
```

**注意**：需要先把脚本复制到Docker容器中，见下方部署说明。

---

### 2.6 Move File（移动已处理文件）

**作用**：将处理完的文件移到 `processed` 文件夹，避免重复处理

```
节点类型: Read/Write Files from Disk
Operation: Move a File

Settings:
  - Source Path: /input/{{ $json.fileName }}
  - Destination Path: /input/processed/{{ $json.fileName }}
```

---

## 三、完整工作流JSON

将以下JSON导入到n8n中：

```json
{
  "name": "Sorryios AI 自动化工作流",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "seconds",
              "secondsInterval": 30
            }
          ]
        }
      },
      "name": "Schedule Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.1,
      "position": [250, 300]
    },
    {
      "parameters": {
        "fileSelector": "/input/*",
        "options": {}
      },
      "name": "Read Files",
      "type": "n8n-nodes-base.readWriteFile",
      "typeVersion": 1,
      "position": [450, 300]
    },
    {
      "parameters": {
        "rules": {
          "values": [
            {
              "conditions": {
                "options": {
                  "caseSensitive": true,
                  "leftValue": "",
                  "typeValidation": "strict"
                },
                "conditions": [
                  {
                    "leftValue": "={{ $json.fileName }}",
                    "rightValue": "\\.(mp3|wav|m4a|flac|ogg|webm)$",
                    "operator": {
                      "type": "string",
                      "operation": "regex"
                    }
                  }
                ],
                "combinator": "and"
              },
              "renameOutput": true,
              "outputKey": "Audio"
            },
            {
              "conditions": {
                "options": {
                  "caseSensitive": true,
                  "leftValue": "",
                  "typeValidation": "strict"
                },
                "conditions": [
                  {
                    "leftValue": "={{ $json.fileName }}",
                    "rightValue": "\\.(txt|md)$",
                    "operator": {
                      "type": "string",
                      "operation": "regex"
                    }
                  }
                ],
                "combinator": "and"
              },
              "renameOutput": true,
              "outputKey": "Text"
            }
          ]
        },
        "options": {}
      },
      "name": "File Type Switch",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [650, 300]
    },
    {
      "parameters": {
        "command": "=whisper \"/input/{{ $json.fileName }}\" --model large-v3 --language zh --output_format txt --output_dir \"/output\"",
        "options": {
          "timeout": 1800000
        }
      },
      "name": "Whisper Transcribe",
      "type": "n8n-nodes-base.executeCommand",
      "typeVersion": 1,
      "position": [850, 200]
    },
    {
      "parameters": {
        "command": "=node /app/main-processor.js --input \"/input/{{ $json.fileName }}\" --output \"/output\"",
        "options": {
          "timeout": 600000
        }
      },
      "name": "Process with AI",
      "type": "n8n-nodes-base.executeCommand",
      "typeVersion": 1,
      "position": [1050, 300]
    },
    {
      "parameters": {
        "operation": "move",
        "sourcePath": "=/input/{{ $json.fileName }}",
        "destinationPath": "=/input/processed/{{ $json.fileName }}",
        "options": {}
      },
      "name": "Move to Processed",
      "type": "n8n-nodes-base.readWriteFile",
      "typeVersion": 1,
      "position": [1250, 300]
    }
  ],
  "connections": {
    "Schedule Trigger": {
      "main": [
        [
          {
            "node": "Read Files",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Read Files": {
      "main": [
        [
          {
            "node": "File Type Switch",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "File Type Switch": {
      "main": [
        [
          {
            "node": "Whisper Transcribe",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Process with AI",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Whisper Transcribe": {
      "main": [
        [
          {
            "node": "Process with AI",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Process with AI": {
      "main": [
        [
          {
            "node": "Move to Processed",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

---

## 四、部署步骤

### 4.1 方案A：直接在Windows上运行脚本（推荐）

由于n8n在Docker中，Whisper和Playwright都在Windows上，可以改用HTTP触发方式：

**步骤1**：在Windows上创建一个简单的HTTP服务器

```javascript
// server.js - 放在 D:\sorryios-test\ 目录
const http = require('http');
const { processFile } = require('./main-processor');

const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/process') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { filePath } = JSON.parse(body);
                const result = await processFile(filePath, 'D:\\sorryios-test\\n8n-output');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(3000, () => {
    console.log('处理服务器运行在 http://localhost:3000');
});
```

**步骤2**：启动服务器

```powershell
cd D:\sorryios-test
node server.js
```

**步骤3**：在n8n中使用HTTP Request节点

```
节点类型: HTTP Request
Method: POST
URL: http://host.docker.internal:3000/process
Body:
{
  "filePath": "D:\\sorryios-test\\n8n-input\\{{ $json.fileName }}"
}
```

---

### 4.2 方案B：把脚本放进Docker（适合纯Docker环境）

**步骤1**：创建自定义Dockerfile

```dockerfile
FROM n8nio/n8n

USER root

# 安装Node.js依赖
RUN npm install -g playwright
RUN npx playwright install chromium --with-deps

# 复制脚本
COPY *.js /app/

USER node
```

**步骤2**：构建并运行

```powershell
cd D:\sorryios-test
docker build -t n8n-sorryios .
docker run -d --name n8n-sorryios \
  -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  -v D:\sorryios-test\n8n-input:/input \
  -v D:\sorryios-test\n8n-output:/output \
  n8n-sorryios
```

---

## 五、测试流程

### 5.1 单独测试文本切分

```powershell
cd D:\sorryios-test
node text-splitter.js --input "n8n-input\1月7日课堂笔记.txt" --output "test-segments.json"
```

### 5.2 单独测试Playwright自动化

```powershell
cd D:\sorryios-test
# 创建测试输入
echo '{"segments": ["你好，请介绍一下你自己", "1+1等于几"]}' > test-input.json
node sorryios-automation.js --input test-input.json --output test-output.json
```

### 5.3 完整流程测试

```powershell
cd D:\sorryios-test
node main-processor.js --input "n8n-input\1月7日课堂笔记.txt" --output "n8n-output"
```

---

## 六、常见问题排查

### Q1: Playwright找不到元素

**原因**：sorryios.ai网页结构可能变化

**解决**：
1. 把 `headless: false` 改成可视模式
2. 用浏览器开发者工具检查实际的选择器
3. 更新 `sorryios-automation.js` 中的选择器

### Q2: Whisper转写很慢

**原因**：large-v3模型较大

**解决**：
- 可以改用 `medium` 或 `small` 模型
- 确保有CUDA支持（GPU加速）

### Q3: n8n读不到文件

**检查**：
```powershell
docker exec -it n8n-new ls -la /input
```

确认文件夹正确挂载。

### Q4: 登录状态失效

**原因**：Cookie过期

**解决**：
删除 `sorryios-auth.json` 文件，脚本会自动重新登录。

---

## 七、下一步优化建议

1. **并发处理**：修改 `sorryios-automation.js`，同时打开多个浏览器实例
2. **错误通知**：添加钉钉/企业微信通知节点
3. **进度追踪**：在n8n中添加状态记录
4. **断点续传**：记录已处理的片段，失败后可以继续
