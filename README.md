# Sorryios AI 智能笔记系统 - 完整技术文档

> 最后更新：2025年1月22日

---

## 一、系统概述

### 1.1 产品定位

**Sorryios AI 智能笔记系统** 是一款英语学习辅助工具，帮助用户高效管理和学习英语词汇、短语及语法知识。

### 1.2 核心流程

```
用户上传英语笔记 → AI自动提取词汇/短语/语法点 → 与现有词库匹配 → 生成学习报告
```

---

## 二、技术架构

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 前端 | React + Vite | 构建后为静态文件，由后端托管 |
| 后端 | Node.js + Express.js | RESTful API |
| 实时通信 | WebSocket | 任务进度推送 |
| 数据库 | SQLite | 4个独立数据库文件 |
| AI处理 | Playwright + Chromium | Headless模式调用AI |
| 部署 | Docker | 一键脚本部署 |

---

## 三、数据库架构（4个库）

### 3.1 整体结构

```
D:\sorryios-test\data\
│
├── sorryios.db      ← 主库（用户、任务、待审核记录）
├── vocabulary.db    ← 词库（单词、短语、句型）
├── grammar.db       ← 语法库（支持子话题）
└── matching.db      ← 匹配规则库（替换 + 排除）
```

---

### 3.2 sorryios.db（主库）

存储用户信息、任务记录和待审核数据。

| 表名 | 记录数 | 用途 |
|------|--------|------|
| users | 4 | 用户账号 |
| tasks | 1 | 处理任务 |
| files | 0 | 上传文件 |
| logs | 4 | 操作日志 |
| matched_items | 84 | 模糊匹配（85%-99%）待审核 |
| unmatched_items | 59 | AI生成（<85%）待完善 |
| user_mastered_words | 0 | 用户已掌握词汇 |

#### users 表结构
```
id, username, password, email, role, status, 
created_at, last_login, total_tasks, total_files, nickname
```

#### tasks 表结构
```
id, user_id, title, status, progress, file_name, file_size, file_type, 
segments_total, segments_processed, output_html, output_md, output_json, 
error_message, created_at, started_at, completed_at, 
total_items, exact_match_count, fuzzy_match_count, unmatched_count
```

#### matched_items 表结构（模糊匹配待审核）
```
id, task_id, item_type, original_text, matched_text, match_score, 
source_db, source_table, source_id, matched_data, 
status, reviewed_at, reviewed_by, notes, created_at
```

#### unmatched_items 表结构（AI生成待完善）
```
id, task_id, item_type, original_text, ai_generated, 
status, edited_content, imported_to, imported_id, 
reviewed_at, reviewed_by, notes, created_at, updated_at
```

---

### 3.3 vocabulary.db（词库）

存储英语单词、短语和句型。

| 表名 | 记录数 | 说明 |
|------|--------|------|
| words | 2,794 | 单词表 |
| phrases | 2,612 | 短语表 |
| patterns | 143 | 句型表 |

**词库总量：5,549 条**

#### words 表结构
```
id, word, phonetic, pos, meaning, example, irregular_forms, 
category, difficulty, enabled, created_at, updated_at, is_new
```

#### phrases 表结构
```
id, phrase, meaning, example, 
category, difficulty, enabled, created_at, updated_at, is_new
```

#### patterns 表结构
```
id, pattern, meaning, example, 
category, difficulty, enabled, created_at, updated_at, is_new
```

---

### 3.4 grammar.db（语法库）

存储语法知识点，支持子话题功能。

| 表名 | 记录数 | 说明 |
|------|--------|------|
| grammar | 50 | 语法点表 |

#### grammar 表结构
```
id, title, keywords, definition, structure, usage, mistakes, examples, 
category, difficulty, enabled, created_at, updated_at, sub_topics, is_new
```

**sub_topics 字段**：JSON格式，存储子话题列表，支持层级编辑。

---

### 3.5 matching.db（匹配规则库）

存储替换和排除规则，两种功能合并到同一张表。

| 表名 | 记录数 | 说明 |
|------|--------|------|
| matching_rules | 37 | 替换+排除规则 |

#### matching_rules 表结构
```
id, original_text, original_type, action, 
target_db, target_table, target_id, target_text, 
notes, created_at, created_by
```

#### 规则逻辑
- `target_text` **有值** → 替换为目标文本，继续后续匹配
- `target_text` **为空** → 排除该词条，不展示、不上报

---

## 四、核心匹配流程

### 4.1 流程图

```
┌─────────────────────────────────────────────────────────────┐
│                      AI 提取词汇/短语/语法                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  ① matching.db 精确匹配                                      │
│     ├─ target_text 为空   → 🚫 跳过（不展示、不上报）         │
│     ├─ target_text 有值   → 🔄 用目标文本继续后续流程         │
│     └─ 没命中             → 继续 ↓                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  ② vocabulary.db + grammar.db（精确匹配）                    │
│     ├─ 100% 命中  → ✅ 直接使用，不上报                       │
│     └─ 没命中     → 继续 ↓                                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  ③ vocabulary.db + grammar.db（模糊匹配）                    │
│     ├─ 100%       → ✅ 直接使用，不上报                       │
│     ├─ 85%-99%    → 📋 存入 matched_items（待审核）          │
│     └─ <85%       → 🤖 存入 unmatched_items（AI生成）        │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 特殊规则

- **通用模板跳过**：含 `sb.`、`sth.`、`doing` 等占位符的模板，跳过替换库的模糊匹配
- **统一相似度阈值**：≥85% 为模糊匹配，<85% 触发AI生成

---

## 五、待审核数据

### 5.1 数据类型

| 表 | 类型 | 数量 | 说明 |
|----|------|------|------|
| matched_items | 模糊匹配 | 84条 | 相似度 85%-99%，需人工确认 |
| unmatched_items | AI生成 | 59条 | 相似度 <85%，AI自动生成释义 |

### 5.2 审核后操作

| 类型 | 通过 | 拒绝 |
|------|------|------|
| 模糊匹配 | 采用词库中的匹配数据 | 丢弃 |
| AI生成 | 编辑后导入词库/语法库 | 丢弃 |

---

## 六、跨库转移功能

### 6.1 词库 ↔ 语法库（双向转移）

```
vocabulary.db          grammar.db
┌─────────────┐       ┌─────────────┐
│   words     │ ←──→  │   grammar   │
│   phrases   │ ←──→  │             │
│   patterns  │ ←──→  │             │
└─────────────┘       └─────────────┘
```

支持将词库中的条目转移到语法库，或将语法库条目转移到词库的对应表。

---

## 七、管理页面

| 页面 | 路由 | 功能 |
|------|------|------|
| 管理后台首页 | `/admin` | 导航入口 |
| 词库管理 | `/vocabulary-admin` | 单词/短语/句型的增删改查 |
| 语法库管理 | `/grammar-admin` | 语法点管理，支持子话题编辑 |
| 处理日志 | `/processing-log-admin` | 审核AI提取结果 |
| 匹配规则管理 | `/matching-dict-admin` | 替换/排除规则管理 |

---

## 八、部署方式

### 8.1 目录结构

```
D:\sorryios-test\
├── docker-compose.yml
├── Dockerfile
├── start.bat          ← 启动服务
├── update.bat         ← 更新代码后重新部署
├── logs.bat           ← 查看日志
├── data/              ← 数据库文件（持久化）
│   ├── sorryios.db
│   ├── vocabulary.db
│   ├── grammar.db
│   └── matching.db
├── server/            ← 后端代码
└── dist/              ← 前端构建产物
```

### 8.2 常用命令

```powershell
# 启动服务
双击 start.bat

# 更新代码后重新部署
双击 update.bat

# 查看日志
双击 logs.bat
```

### 8.3 访问地址

```
http://localhost:3000/
```

---

## 九、版本演进历史

| 日期 | 版本 | 主要更新 |
|------|------|----------|
| 01-15 | v5.0 | 数据库架构重构、匹配记录保存功能 |
| 01-16 | v6.0 | 替换库功能、UI改造、「转为语法」功能 |
| 01-19 | v6.1 | 语法转移合并、子话题编辑功能 |
| 01-19 | v6.2 | 跨库转移、分页系统、数据库索引优化 |
| 01-19 | v7.0 | Docker部署、UI统一为Claude风格 |
| 01-20 | v6.3.5 | 多目标替换功能（拖动组合短语） |
| 01-22 | 最新 | 排除库合并到匹配规则库、精简为4个数据库 |

---

## 十、数据统计汇总

| 类别 | 数量 |
|------|------|
| 单词 (words) | 2,794 |
| 短语 (phrases) | 2,612 |
| 句型 (patterns) | 143 |
| 语法 (grammar) | 50 |
| 匹配规则 (matching_rules) | 37 |
| **知识库总计** | **5,636** |
| 待审核 - 模糊匹配 | 84 |
| 待审核 - AI生成 | 59 |

---

## 附录：表字段速查

### A. sorryios.db

| 表 | 核心字段 |
|----|----------|
| users | id, username, password, email, role, status |
| tasks | id, user_id, title, status, progress, output_html/md/json |
| matched_items | id, task_id, item_type, original_text, matched_text, match_score |
| unmatched_items | id, task_id, item_type, original_text, ai_generated, status |

### B. vocabulary.db

| 表 | 核心字段 |
|----|----------|
| words | id, word, phonetic, pos, meaning, example, irregular_forms |
| phrases | id, phrase, meaning, example |
| patterns | id, pattern, meaning, example |

### C. grammar.db

| 表 | 核心字段 |
|----|----------|
| grammar | id, title, keywords, definition, structure, usage, mistakes, examples, sub_topics |

### D. matching.db

| 表 | 核心字段 |
|----|----------|
| matching_rules | id, original_text, original_type, action, target_text |

---

> 文档结束
