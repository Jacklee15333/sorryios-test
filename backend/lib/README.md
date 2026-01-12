# 核心库文件目录

⚠️ **重要**：请将以下文件从你的原始项目复制到此目录：

```powershell
# 假设原始代码在 D:\sorryios-test\
copy D:\sorryios-test\text-splitter.js .\
copy D:\sorryios-test\sorryios-automation.js .\
copy D:\sorryios-test\report-generator.js .\
```

## 需要的文件

| 文件 | 导出 | 说明 |
|-----|------|------|
| text-splitter.js | `{ TextSplitter }` | 智能文本分割器 |
| sorryios-automation.js | `{ SorryiosAutomation, CONFIG }` | 浏览器自动化 |
| report-generator.js | `ReportGenerator` (默认导出) | 报告生成器 |

## 验证

复制完成后，目录结构应该是：

```
lib/
├── README.md (本文件)
├── text-splitter.js
├── sorryios-automation.js
└── report-generator.js
```
