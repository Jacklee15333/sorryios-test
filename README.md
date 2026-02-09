# SorryIOS 英语学习系统 — 完整系统交接文档

> **更新日期**: 2026-02-09（最新版，含本次所有修改）  
> **项目路径**: `D:\sorryios-test\`  
> **运行环境**: Windows 11, PowerShell, Node.js  
> **前端地址**: http://localhost:5173 (Vite dev server)  
> **后端地址**: http://localhost:3000  
> **数据库管理页**: http://localhost:3000 (内置Web UI)  
> **数据库文件**: `D:\sorryios-test\backend\data\`  
> **接口路由**: `D:\sorryios-test\backend\routes\`  
> **服务层**: `D:\sorryios-test\backend\services\`  
> **后端测试**: `D:\sorryios-test\backend\tests\`

---

## 一、项目总览

SorryIOS 是一个面向英语学习者的智能分析系统，包含 **两个核心模块**：

1. **课堂笔记模块**（原有）：上传 `.txt` 课堂笔记 → 10阶段流水线 → AI提取单词/短语/句型/语法 → 词库匹配 → 生成结构化学习报告
2. **错题收集模块**（新增）：上传已批改的试卷图片 → Playwright自动化 → sorryios.ai(Thinking模型)识别错题 → 结构化存储 → 错题本Dashboard → 本次错题报告

两模块共享：用户认证(JWT)、WebSocket进度推送、SQLite数据库(better-sqlite3)、Playwright自动化引擎(sorryios-automation.js)、历史记录页面（混合展示，按时间排序）。

---

## 二、技术栈

| 层 | 技术 | 版本/说明 |
|----|------|-----------|
| **前端框架** | React | 18.2 |
| **构建工具** | Vite | 5.0，开发端口5173，代理API到3000 |
| **UI样式** | Tailwind CSS | 核心样式，侧边栏/卡片/按钮全部Tailwind |
| **后端框架** | Express.js | HTTP服务器 + REST API |
| **实时通信** | ws (WebSocket) | 原生WebSocket，心跳30秒，超时60秒 |
| **数据库** | SQLite | better-sqlite3（同步操作） |
| **浏览器自动化** | Playwright | 控制 sorryios.ai 网页版，发送文本/图片给AI |
| **认证** | JWT | Bearer token，存localStorage |
| **文件上传** | Multer | .txt用原有配置，图片用独立配置(最多10张) |
| **导出** | docx + html2canvas | Word/PDF/HTML多格式导出 |

---

## 三、目录结构（当前最新）

```
D:\sorryios-test\
├── backend\
│   ├── server.js                         # Express入口 + WebSocket（630行）
│   ├── lib\
│   │   └── sorryios-automation.js        # Playwright自动化（~1971行，含bug修复）
│   ├── services\
│   │   ├── database.js                   # SQLite核心（1021行，better-sqlite3）
│   │   ├── aiProcessor.js                # 课堂笔记AI处理器（2183行，10阶段流水线）
│   │   ├── taskQueue.js                  # 任务队列（单processor限制，仅课堂笔记用）
│   │   ├── matchingService.js            # 匹配算法引擎（3180行，v5.3.0）
│   │   ├── vocabularyService.js          # 词库服务（words/phrases/patterns CRUD）
│   │   ├── grammarService.js             # 语法库服务
│   │   ├── matchingDictService.js        # 替换词库服务
│   │   ├── processingLogService.js       # 处理日志服务
│   │   ├── postProcessor.js              # AI补充 + 最终报告生成
│   │   ├── smart-text-splitter.js        # 智能文本分割器
│   │   ├── userService.js                # 用户认证服务
│   │   ├── wrongQuestionService.js       # 错题数据库服务（建表+CRUD）
│   │   └── examProcessor.js              # 错题识别引擎（图片→AI→JSON→DB）
│   ├── routes\
│   │   ├── upload.js                     # .txt文件上传（仅txt，Multer）
│   │   ├── auth.js                       # 认证路由（登录/注册/authMiddleware）
│   │   ├── task.js                       # 任务查询路由
│   │   ├── report.js                     # 报告路由
│   │   ├── admin.js                      # 管理后台路由
│   │   ├── processing-log-api.js         # 主处理流程API（667行）
│   │   ├── vocabulary-api.js             # 词库CRUD API
│   │   ├── grammar-api.js                # 语法库CRUD API
│   │   ├── matching-dict-api.js          # 替换词库API
│   │   ├── user-mastered-api.js          # 已掌握词汇API
│   │   ├── ai-api.js                     # AI接口
│   │   ├── chunk-api.js                  # 文本分块API
│   │   ├── exam-upload-api.js            # 试卷上传+管理API
│   │   └── wrong-question-api.js         # 错题CRUD+统计API
│   ├── data\
│   │   ├── sorryios.db                   # 主数据库（users/tasks/words/phrases/patterns/exams/wrong_questions等）
│   │   ├── grammar.db                    # 语法库（独立）
│   │   └── matching.db                   # 替换词库（独立）
│   ├── uploads\                          # .txt上传存储
│   │   └── exams\                        # 试卷图片存储
│   ├── public\                           # 数据库管理页（Web UI）
│   └── tests\                            # 后端测试
│       └── test-v5.3.0-cache-fix.js      # 100条匹配测试用例
│
├── frontend\
│   ├── package.json
│   ├── vite.config.js                    # 代理 /api → localhost:3000
│   └── src\
│       ├── main.jsx                      # 入口
│       ├── App.jsx                       # 主路由+侧边栏布局（~719行）
│       ├── PDFPreviewPage.jsx            # PDF预览独立页面
│       ├── components\
│       │   ├── FileUploader.jsx          # .txt文件上传（拖拽）
│       │   ├── ProgressTracker.jsx       # 进度跟踪器（通用，两模块复用）
│       │   ├── ReportViewer.jsx          # 课堂笔记报告查看器（2516行）
│       │   ├── ExamReportViewer.jsx      # 🆕 本次错题报告查看器（~467行）
│       │   ├── MasteredWords.jsx         # 已掌握词汇管理
│       │   ├── LoginPage.jsx             # 登录/注册页面
│       │   ├── ExamUploader.jsx          # 试卷图片上传（拖拽+预览）
│       │   └── WrongQuestionBook.jsx     # 错题本Dashboard（所有错题汇总）
│       ├── hooks\
│       │   └── useTaskProgress.js        # WebSocket进度通信Hook（516行）
│       └── contexts\
│           └── AuthContext.jsx           # 认证上下文（JWT + localStorage）
```

---

## 四、数据库表结构

### 主数据库 (sorryios.db)

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| users | 用户表 | id, username, password_hash, nickname, token |
| tasks | 课堂笔记任务表 | id, user_id, title, status, progress, file_name, output_html/md/json |
| words | 单词库(2944个) | id, word, phonetic, pos, meaning, example |
| phrases | 短语库(2824个) | id, phrase, meaning, example |
| patterns | 句型库(169个) | id, pattern, meaning, example, structure |
| user_mastered_words | 已掌握词汇 | id, user_id, word, word_type, created_at |
| matched_items | 匹配记录 | task关联 |
| unmatched_items | 未匹配记录 | task关联 |
| logs | 系统日志 | — |
| **exams** | 试卷记录表 | id, user_id, title, subject, image_count, total_questions, wrong_count, status(pending/processing/done/failed), created_at, completed_at |
| **wrong_questions** | 错题表(核心) | id, exam_id, user_id, question_number, question_type, question_content, user_answer, correct_answer, knowledge_points(JSON), error_analysis, section, mastered(0/1), mastered_at, created_at |
| **exam_images** | 试卷图片 | id, exam_id, image_path, image_order, original_name |

### 独立数据库

| 数据库文件 | 表 | 用途 |
|------------|-----|------|
| grammar.db | grammar(136条) | 语法库（title, category, definition, structure, usage, examples, keywords, sub_topics） |
| matching.db | matching_dict(504条替换+40条排除) | 替换词库（original_text, target_text, type, target_type） |

---

## 五、功能模块详解

### 5.1 课堂笔记模块

**用户流程**: 登录 → 上传.txt笔记 → 实时查看处理进度 → 查看报告 → 标记已掌握 → 历史记录可回看

**10阶段处理流水线**（aiProcessor.js编排）：

| 阶段 | 名称 | 模块 | 功能 |
|------|------|------|------|
| 1 | 文本分割 | smart-text-splitter.js | 长文本按token限制分割为多个chunk（~4000 token/chunk） |
| 2 | AI提取 | aiProcessor.js | 每个chunk通过Playwright发给sorryios.ai(Instant模型)，提取单词/短语/句型/语法 |
| 3 | 结果合并 | aiProcessor.js (ResultMerger) | 多chunk结果合并为一份 |
| 4 | 词库精确匹配 | matchingService.js | 与本地词库匹配 |
| 5 | 匹配分类 | matchingService.js | 分为matched/unmatched/excluded/replaced四类 |
| 6 | AI补充 | postProcessor.js | 对unmatched项调用AI生成释义和例句 |
| 7 | 已掌握过滤 | postProcessor.js | 过滤用户标记为"已学会"的词条 |
| 8 | 最终报告 | postProcessor.js | 合并生成最终结构化报告 |
| 9 | 数据入库 | processingLogService.js | 写入SQLite |
| 10 | 完成通知 | WebSocket | 推送status='completed' |

**匹配算法核心**（matchingService.js，3180行，v5.3.0）：
- 匹配优先级：黑名单检查 → 替换词库精确 → 词库精确(score=1.0) → 替换词库模糊(≥80%) → 词库模糊(word≥90%, phrase≥85%, pattern≥85%, grammar≥85%)
- 特殊处理：不规则动词表(100+映射)、形容词变形表、句型占位符智能匹配(sb./sth./adj./doing/to do)、完整句型白名单(70+)
- v5.3.0缓存优化：batchMatch时一次性加载全部数据到内存，DB查询从400+次降至4次，黑名单过滤O(n²)→O(n)

**任务队列**（taskQueue.js）：
- 单processor限制（setProcessor只能设一个，被课堂笔记独占）
- FIFO队列，最大并发数1（串行处理）
- ⚠️ 错题模块不能复用taskQueue，独立管理任务状态

**报告查看器**（ReportViewer.jsx，2516行）：
- 三大区块：单词表格 + 短语/句型表格 + 语法卡片
- 每条有"已学会"和"识别错误"操作，支持3秒撤销
- 导出：PDF（浏览器打印）、HTML（完整文件）、Word（docx库生成）
- 内置诊断功能：检测浏览器插件干扰、表格列数、打印样式

### 5.2 错题收集模块

**用户流程**: 登录 → 上传试卷图片(jpg/png/pdf，最多10张) → AI自动识别错题 → 查看本次错题报告 → 错题本查看所有错题 → 标记已掌握 → 历史记录可回看

**处理流水线**（examProcessor.js，7个Stage）：

| Stage | 进度 | 功能 | 实现 |
|-------|------|------|------|
| 1 | 5-10% | 初始化 | 读取exams表和exam_images表，验证图片文件存在 |
| 2 | 15-30% | 启动浏览器 | SorryiosAutomation.init() → login() → selectIdleAccount() → startNewChat() → selectThinkingModel() |
| 3 | 35-60% | 上传图片+发送Prompt | sendMessageWithImages(prompt, imagePaths) |
| 4 | 60-80% | 等待AI响应 | waitForResponse()，Thinking模型需要较长时间 |
| 5 | 80-85% | 解析JSON | JsonExtractor.extract()，5种策略容错解析 |
| 6 | 90-95% | 存入数据库 | WrongQuestionDB.addBatch()，事务批量插入 |
| 7 | 100% | 完成清理 | 更新exam状态为done，关闭浏览器（finally保证） |

**与课堂笔记模块的关键差异**：
- 不复用taskQueue（只支持单processor），独立管理任务状态
- 直接调用 `global.broadcastTaskProgress(taskId, progress, status, message)` 推送进度（4个独立参数，不是对象）
- taskId格式为 `exam_{examId}`，前端useTaskProgress直接订阅
- 图片上传独立Multer配置，存储在uploads/exams/子目录
- 使用Thinking模型（不是Instant），识别效果更好
- 完成时广播 `status='done'`（不是'completed'），前端ProgressTracker已兼容处理

**AI Prompt模板**（examProcessor.js的EXAM_PROMPT常量）：
要求AI以严格JSON返回：
```json
{
  "subject": "...",
  "examTitle": "...",
  "totalQuestions": 0,
  "wrongQuestions": [{
    "questionNumber": "21",
    "section": "完形填空",
    "questionType": "choice",
    "questionContent": "...",
    "userAnswer": "A",
    "correctAnswer": "C",
    "knowledgePoints": ["时态", "虚拟语气"],
    "errorAnalysis": "..."
  }]
}
```

**本次错题报告**（ExamReportViewer.jsx，~467行）：
- 从 `/api/exam/:examId/result` 加载数据
- 按 section（大题类型）分组展示错题
- 每道错题显示：题号、题型、题目内容、你的答案 vs 正确答案、知识点标签、错因分析
- 支持"标记已掌握"/"取消掌握"按钮
- 参考 ReportViewer.jsx 的样式风格

### 5.3 历史记录页面（混合展示）

App.jsx内置的历史记录页面，**混合显示**课堂笔记和试卷错题：
- 课堂笔记来自 `/api/user/stats` 的 `recentTasks`
- 试卷记录来自 `/api/exam/list`
- 按时间倒序混合排列
- 每条记录有类型标注：📖 课堂笔记 / 📝 试卷错题
- 点击课堂笔记 → 跳转 ReportViewer
- 点击试卷错题 → 跳转 ExamReportViewer

### 5.4 用户认证系统

- JWT Bearer token认证
- authMiddleware：解析Authorization header → userService.getUserFromToken(token) → req.user
- 两种路由导出格式：auth.js导出 `{ router, authMiddleware }`，其他路由导出 `module.exports = router`
- server.js的loadRoute函数自动处理：`const actualRouter = router.router || router`

### 5.5 WebSocket进度推送

- 服务端：`global.broadcastTaskProgress(taskId, progress, status, message)` — **4个独立参数**（不是传对象！）
- 内部构建消息：`{ type: 'progress', taskId, progress, status, message, currentStep: message, timestamp }`
- 只发送给订阅了该taskId的客户端（或未订阅任何任务的客户端，向后兼容）
- 心跳：30秒间隔ping/pong，60秒无响应断开
- 前端：useTaskProgress hook订阅，自动重连（最多5次，间隔3秒），标签页切回自动同步

---

## 六、API路由完整列表

### 认证（挂载 /api）
| 方法 | 路径 | 功能 |
|------|------|------|
| POST | /api/auth/register | 用户注册 |
| POST | /api/auth/login | 用户登录（返回JWT） |
| GET | /api/user/profile | 获取用户信息 |
| GET | /api/user/stats | 获取学习统计（含recentTasks，用于历史记录） |

### 课堂笔记（挂载 /api）
| 方法 | 路径 | 功能 |
|------|------|------|
| POST | /api/upload | 上传.txt文件（需登录，FormData） |
| GET | /api/task/:taskId | 获取任务状态 |
| GET | /api/tasks/:taskId/report | 获取报告数据 |

### 词库管理
| 方法 | 路径 | 功能 |
|------|------|------|
| CRUD | /api/vocabulary/words | 单词库 |
| CRUD | /api/vocabulary/phrases | 短语库 |
| CRUD | /api/vocabulary/patterns | 句型库 |
| CRUD | /api/grammar | 语法库 |
| CRUD | /api/matching-dict | 替换词库 |

### 已掌握词汇（挂载 /api/user-mastered）
| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /api/user-mastered/stats | 统计 |
| GET | /api/user-mastered/list | 列表（可按type过滤） |
| POST | /api/user-mastered/add | 添加 |
| POST | /api/user-mastered/remove | 移除 |
| POST | /api/user-mastered/clear | 清空 |

### 试卷管理（挂载 /api/exam）
| 方法 | 路径 | 功能 |
|------|------|------|
| POST | /api/exam/upload | 上传试卷图片（FormData多文件，jpg/png/pdf，最多10张） |
| POST | /api/exam/:examId/process | 触发AI识别 |
| GET | /api/exam/:examId/status | 查询识别状态 |
| GET | /api/exam/:examId/result | 获取识别结果（exam信息 + wrongQuestions数组） |
| GET | /api/exam/list | 用户的试卷列表（用于历史记录） |
| DELETE | /api/exam/:examId | 删除试卷 |

### 错题管理（挂载 /api/wrong-questions）
| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /api/wrong-questions | 错题列表（筛选：section, questionType, mastered, examId） |
| GET | /api/wrong-questions/stats | 错题统计（按section/type分组） |
| GET | /api/wrong-questions/:id | 单条详情 |
| PUT | /api/wrong-questions/:id | 编辑 |
| DELETE | /api/wrong-questions/:id | 删除 |
| POST | /api/wrong-questions/:id/master | 标记已掌握 |
| POST | /api/wrong-questions/:id/unmaster | 取消已掌握 |

---

## 七、前端页面路由

侧边栏采用**分组结构**（App.jsx）：

```
├── 📖 课堂笔记
│   ├── 上传笔记           → currentPage = 'upload'        → <FileUploader>
│   ├── [处理中](动态)      → currentPage = 'processing'     → <ProgressTracker>
│   └── 查看报告(从历史进入) → currentPage = 'report'         → <ReportViewer>
│
├── 📝 错题收集
│   ├── 上传试卷           → currentPage = 'exam-upload'    → <ExamUploader>
│   ├── [识别中](动态)      → currentPage = 'exam-progress'  → <ProgressTracker>(复用)
│   ├── 错题本             → currentPage = 'exam-book'      → <WrongQuestionBook>
│   └── 本次报告(完成后进入) → currentPage = 'exam-report'    → <ExamReportViewer> 🆕
│
├── 📊 通用
│   ├── 历史记录           → currentPage = 'history'        → 内置App.jsx（混合显示课堂笔记+试卷错题）
│   └── 已掌握             → currentPage = 'filter'         → <MasteredWords>
```

---

## 八、关键代码位置索引

### server.js（630行）
- WebSocket配置: 第39-43行
- broadcastTaskProgress函数: 第279-330行（**4个独立参数：taskId, progress, status, message**）
- global.broadcastTaskProgress挂载: 第333行
- loadRoute函数: 第366-377行（自动处理 `router.router || router`）
- 路由加载区域: 第383-399行
- requiredDirs数组: 第530-542行（含uploads/exams）

### sorryios-automation.js（~1971行）
- selectInstantModel(): 第242-425行（含模型切换后URL保护）
- sendMessage(): 第464-713行（课堂笔记文本发送）
- waitForResponse(): 第862行起
- startNewChat(): ~第1200行（**无条件强制导航到根路径**，不做检测）
- selectThinkingModel(): 第1299行起（含模型切换后URL保护）
- sendMessageWithImages(): 第1459行起（试卷图片上传+发送）
- close(): 第1783行
- 导出: `{ SorryiosAutomation, CONFIG }`

### aiProcessor.js（2183行）
- JsonExtractor类: 第454-523行（5种策略容错解析，被examProcessor复用）
- taskQueue.setProcessor(processTask): 第2175行（单processor限制，仅课堂笔记用）

### examProcessor.js
- EXAM_PROMPT: AI识别prompt模板
- processExam(examId, userId): 主流水线函数（7个Stage）
- broadcastProgress(): 内部封装，调用 `global.broadcastTaskProgress(taskId, progress, status, message)`
- taskId格式: `exam_${examId}`
- 完成时status: `'done'`（不是'completed'）

### database.js（1021行）
- db对象创建: 第30行，路径backend/data/sorryios.db
- 外键约束: 第33行 `db.pragma('foreign_keys = ON')`
- 导出: `{ db, UserDB, TaskDB, LogDB, UserMasteredDB, ... }`

### wrongQuestionService.js
- 建表（CREATE TABLE IF NOT EXISTS）: 模块加载时自动执行
- 导出: `{ ExamDB, WrongQuestionDB, ExamImageDB, initWrongQuestionTables }`
- WrongQuestionDB.addBatch(): 事务批量插入错题
- WrongQuestionDB.getList(): 支持按examId/section/questionType/mastered筛选

### App.jsx（~719行）
- state定义: 第14-30行（含currentExamId, examHistory）
- 进度完成处理: 第47-66行（兼容status='completed'和'done'，区分课堂笔记/试卷任务）
- loadUserData: 第90-107行（同时加载taskHistory和examHistory）
- handleExamUploadSuccess: 第150-162行（保存currentExamId）
- handleViewExamReport: 第201-206行（跳转到exam-report页面）
- 分组侧边栏nav: 第276-395行
- 历史记录页面: 第512-643行（混合显示，按时间排序，带类型标注）
- exam-progress的onViewReport: 第673-686行（跳转到exam-report）
- exam-report页面渲染: 第695-701行

### ProgressTracker.jsx
- isCompleted判断: 第40行（`status === 'completed' || status === 'done'`，兼容两种状态）
- 完成时显示"查看报告"按钮: 第230-248行（onViewReport回调）

### ExamReportViewer.jsx（~467行）
- 数据加载: 从 `/api/exam/:examId/result` 获取
- 按section分组展示
- 标记已掌握: 调用 `/api/wrong-questions/:id/master`
- 取消掌握: 调用 `/api/wrong-questions/:id/unmaster`
- 调试日志前缀: `[ExamReportViewer]`

### ReportViewer.jsx（2516行）
- 三大区块：单词表格 + 短语/句型表格 + 语法卡片
- "已学会"→ `/api/user-mastered/add` + 前端乐观更新
- "识别错误"→ 仅前端隐藏
- 导出：PDF/HTML/Word
- 内置诊断按钮

### useTaskProgress.js（516行）
- 主通道：WebSocket连接（自动检测端口：前端5173→后端3000）
- 备用通道：HTTP轮询（每5秒，WebSocket失效10秒后自动降级）
- 心跳：每30秒ping/pong
- 重连：最多5次，间隔3秒
- 页面可见性：标签页切回时自动同步

---

## 九、Playwright自动化引擎详解

### 执行流程（错题模块）

```
selectIdleAccount():
  1. 点击账号 → 等待输入框出现
  2. startNewChat()（强制导航到根路径，确保新对话）
  3. selectInstantModel()（含模型切换后URL保护）

examProcessor:
  4. selectThinkingModel()（切到Thinking模型，含URL保护防跳旧对话）
  5. sendMessageWithImages()（上传图片 + 发送prompt + 等待AI响应）
```

### 已修复的Bug（本次会话）

**Bug 1：Thinking模型选错选成Auto**
- 根因：筛选条件 `item.text.includes('思考')` 匹配到了 `"Auto\n自动决定思考时长"` 中的"思考"
- 修复：先排除Auto/Instant/Pro选项，只匹配英文 `Thinking` 关键词

**Bug 2：在旧对话里发消息**
- 根因：`selectIdleAccount` 点击账号后进入上次打开的对话，不是新对话
- 修复：新增 `startNewChat()` 方法，无条件强制导航到根路径

**Bug 3：模型切换导致跳回旧对话**
- 根因：sorryios.ai切换Thinking模型时，SPA会自动恢复上次使用该模型的旧对话
- 修复：`selectThinkingModel()` 和 `selectInstantModel()` 末尾增加步骤5——检查URL是否含 `/c/`，如果是则强制导航回根路径

### 调试日志

sorryios-automation.js 中所有关键操作都有 `📊 调试` 前缀的console.log，在PowerShell终端可以看到：
- `[新对话]` — startNewChat的执行详情
- `[步骤1-5]` — selectThinkingModel的每个步骤
- `[sendMessageWithImages]` — 图片上传和发送流程

---

## 十、运行指南

### 启动方式

```powershell
# 启动后端
cd D:\sorryios-test\backend
npm run dev     # 或 node --watch server.js
# 监听端口 3000

# 启动前端（新终端窗口）
cd D:\sorryios-test\frontend
npm run dev     # Vite dev server
# 监听端口 5173，代理 API 到 3000
```

### 正常启动日志应包含

```
[WrongQuestionService] ✅ 所有错题相关表初始化完成
[Server] ✓ 加载路由: exam-upload-api
[Server] ✓ 加载路由: wrong-question-api
```

### 测试执行

```powershell
cd D:\sorryios-test\backend\tests
node test-v5.3.0-cache-fix.js    # 100条匹配测试
```

### 调试开关

| 开关 | 位置 | 说明 |
|------|------|------|
| matchingService.verboseLog | matchingService.js | 匹配详细日志（当前hardcoded true） |
| matchingService.debug | matchingService.js | 调试模式（默认false） |
| useTaskProgress CONFIG.DEBUG | useTaskProgress.js | WebSocket日志（当前true） |
| ReportViewer "诊断"按钮 | 浏览器内 | 输出表格/插件/样式诊断到控制台 |
| `[ExamReportViewer]` 前缀 | 浏览器控制台 | 错题报告组件调试 |
| `[ExamProcessor]` 前缀 | PowerShell终端 | 试卷处理流水线调试 |
| `📊 调试` 前缀 | PowerShell终端 | Playwright自动化调试 |

### 数据库管理

浏览器访问 `http://localhost:3000`，可使用内置的数据库管理 Web UI 直接查看/编辑词库数据。

---

## 十一、已知问题和待优化项

### 已确认但暂不影响使用的问题

1. **ResultMerger无去重逻辑** — 多chunk合并时直接push，可能有重复词条
2. **SQLite并发写入** — 两模块同时运行可能冲突（better-sqlite3有WAL模式但未开启）
3. **AI返回JSON不稳定** — JsonExtractor有5种策略容错，但仍可能解析失败
4. **selectInstantModel/selectThinkingModel的menuMaxY硬编码450** — sorryios.ai界面改版可能失效
5. **sendMessageWithImages的+按钮定位** — 依赖页面结构，改版可能失效
6. **smart-text-splitter.js的overlapSize配置** — 存在但未实现（标记为待开发）
7. **postProcessor.js大小写不一致查找** — AI补充阶段可能漏匹配（已标记）

### 可以优化的方向

1. 错题本增加复习功能（间隔重复、错题重做）
2. 错题统计可视化（按知识点分布图、错误趋势图）
3. 多张图片分别识别（当前所有图片+一个prompt一起发送）
4. 已掌握词汇和错题本的统一管理（两个模块的"掌握"功能可以互联）
5. WAL模式启用（解决并发写入问题）
6. 开启overlapSize（提高长文本分割质量）

---

## 十二、关键状态值对照表

### 课堂笔记任务 status

| 值 | 含义 | 来源 |
|----|------|------|
| pending | 排队中 | taskQueue |
| processing | 处理中 | aiProcessor |
| completed | 已完成 | aiProcessor 10阶段流水线完成 |
| failed | 失败 | 异常捕获 |

### 试卷任务 status

| 值 | 含义 | 来源 |
|----|------|------|
| pending | 已上传待识别 | exam-upload-api |
| processing | AI识别中 | examProcessor |
| **done** | 已完成 | examProcessor（⚠️ 注意不是'completed'） |
| failed | 失败 | 异常捕获 |

### 前端 ProgressTracker isCompleted 判断

```javascript
const isCompleted = status === 'completed' || status === 'done';  // 兼容两种
```

---

## 十三、代码规范（续开发必遵）

1. **console.log必须带模块前缀**：`console.log('[ExamProcessor] Stage 2: 正在启动浏览器...');`
2. **最小化修改原则**：不改变原有文件的任何逻辑和功能
3. **新建文件优先**：能新建文件解决的，就不修改现有文件
4. **错误处理**：每个async函数都要try-catch，错误信息详细到能定位问题
5. **路由导出格式**：新路由统一用 `module.exports = router`
6. **authMiddleware导入**：`const { authMiddleware } = require('./auth');`（routes目录内）
7. **broadcastTaskProgress参数**：必须是4个独立参数 `(taskId, progress, status, message)`，不是传对象
8. **试卷taskId格式**：`exam_${examId}`
9. **试卷完成status**：用 `'done'`，不是 `'completed'`
10. **调试信息**：新代码必须包含详细的console.log，方便在PowerShell中定位错误

---

*本文档是 2026-02-09 系统完整快照，可直接发给新聊天继续开发。*
