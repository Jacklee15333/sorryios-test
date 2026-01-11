/**
 * report-generator.js - 增强版
 * 
 * 修复内容：
 * 1. 增强智能格式化，处理各种编号和结构
 * 2. 添加强制格式化功能，即使输入没有换行也能分段
 * 3. 优化HTML和Markdown输出
 */

const fs = require('fs');
const path = require('path');

class ReportGenerator {
    constructor(options = {}) {
        this.outputDir = options.outputDir || './output';
        this.ensureOutputDir();
    }

    ensureOutputDir() {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    // ============================================
    // 核心修复：智能格式化函数
    // ============================================

    /**
     * 智能格式化文本 - 【增强版】
     * 处理各种编号、序号、emoji等，添加适当的换行
     */
    smartFormat(text) {
        if (!text) return '';

        let formatted = text;

        // ========== 第一步：预处理 ==========
        // 统一换行符
        formatted = formatted.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // 如果文本完全没有换行，需要强制分割
        const hasNewlines = formatted.includes('\n');
        
        if (!hasNewlines) {
            console.log('⚠️ 检测到文本无换行，启用强制格式化');
            formatted = this.forceFormat(formatted);
        }

        // ========== 第二步：处理各种编号 ==========
        
        // 1. 中文大写序号：一、二、三、...
        formatted = formatted.replace(/([。！？\n]|^)\s*([一二三四五六七八九十]+)[、．.]/g, '$1\n\n$2、');
        
        // 2. 阿拉伯数字序号：1. 2. 3. 或 1) 2) 3) 或 1、2、3、
        formatted = formatted.replace(/([。！？\n]|^)\s*(\d+)\s*[.．、)）]\s*/g, '$1\n\n$2. ');
        
        // 3. 小写字母序号：a. b. c. 或 a) b) c)
        formatted = formatted.replace(/([。！？\n]|^)\s*([a-zA-Z])\s*[.．)）]\s*/g, '$1\n\n$2. ');
        
        // 4. 项目符号：• - * ▪ ▸
        formatted = formatted.replace(/([。！？\n]|^)\s*([•\-\*▪▸►◆●○])\s*/g, '$1\n$2 ');
        
        // 5. Emoji标记：✅ ❌ ⭐ 📌 💡 🔹 🔸 等
        formatted = formatted.replace(/([。！？\n]|^)\s*([\u{1F300}-\u{1F9FF}✅❌⭐📌💡🔹🔸⚠️📍🎯✨🔥💪👉👆📝🔑⚡️🌟💎🎉🏆])/gu, '$1\n$2');

        // ========== 第三步：处理段落 ==========
        
        // 6. 中文句末标点后，如果紧跟大写字母或中文，添加换行
        formatted = formatted.replace(/([。！？])([A-Z\u4e00-\u9fa5])/g, '$1\n$2');
        
        // 7. 冒号后的内容另起一行（如果冒号后有较长内容）
        formatted = formatted.replace(/([：:])([^\n]{50,})/g, '$1\n$2');

        // ========== 第四步：清理 ==========
        
        // 8. 去掉多余的空行（超过2个连续换行变成2个）
        formatted = formatted.replace(/\n{3,}/g, '\n\n');
        
        // 9. 去掉行首行尾空格
        formatted = formatted.replace(/^ +| +$/gm, '');
        
        // 10. 去掉开头的空行
        formatted = formatted.replace(/^\n+/, '');

        return formatted;
    }

    /**
     * 强制格式化 - 当文本完全没有换行时使用
     * 尝试根据内容特征强制分割
     */
    forceFormat(text) {
        let formatted = text;

        // 在中文大写序号前强制换行
        formatted = formatted.replace(/([一二三四五六七八九十]+)[、．.]/g, '\n\n$1、');
        
        // 在数字序号前强制换行
        formatted = formatted.replace(/(\d+)\s*[.．、)）]/g, '\n\n$1. ');
        
        // 在常见分隔词前换行
        const separators = [
            '首先', '其次', '第三', '第四', '第五',
            '另外', '此外', '同时', '最后', '总之',
            '然而', '但是', '不过', '因此', '所以',
            '综上所述', '总结', '小结', '结论',
            '优点', '缺点', '建议', '注意',
            '第一', '第二', '第三', '第四', '第五',
            '步骤一', '步骤二', '步骤三',
            '要点一', '要点二', '要点三'
        ];
        
        for (const sep of separators) {
            const regex = new RegExp(`([。！？])\\s*(${sep})`, 'g');
            formatted = formatted.replace(regex, '$1\n\n$2');
        }

        // 在emoji前换行
        formatted = formatted.replace(/([\u{1F300}-\u{1F9FF}✅❌⭐📌💡🔹🔸⚠️📍🎯✨🔥💪👉👆📝🔑⚡️🌟💎🎉🏆])/gu, '\n$1');

        // 每隔200-300字符的句号后换行（避免一段太长）
        let result = '';
        let charCount = 0;
        for (let i = 0; i < formatted.length; i++) {
            const char = formatted[i];
            result += char;
            charCount++;
            
            if (charCount > 200 && ['。', '！', '？', '.', '!', '?'].includes(char)) {
                result += '\n';
                charCount = 0;
            }
        }

        return result;
    }

    // ============================================
    // HTML 报告生成
    // ============================================

    /**
     * 生成HTML报告
     */
    generateHTML(data) {
        const {
            title = '课堂学习笔记',
            segments = [],
            metadata = {}
        } = data;

        const timestamp = new Date().toLocaleString('zh-CN');
        
        // 处理每个分段的内容
        const contentSections = segments.map((seg, index) => {
            const formattedResponse = this.smartFormat(seg.response?.text || seg.response || '');
            const htmlContent = this.textToHtml(formattedResponse);
            
            return `
                <section class="segment">
                    <h2>📚 第 ${index + 1} 部分</h2>
                    <div class="segment-meta">
                        <span>原文长度: ${seg.originalLength || seg.segmentText?.length || 0} 字符</span>
                    </div>
                    <div class="ai-response">
                        ${htmlContent}
                    </div>
                </section>
            `;
        }).join('\n');

        const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
            line-height: 1.8;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            overflow: hidden;
        }
        
        header {
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        
        header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        header .meta {
            opacity: 0.8;
            font-size: 0.95em;
        }
        
        main {
            padding: 40px;
        }
        
        .segment {
            margin-bottom: 40px;
            padding: 30px;
            background: #f8f9fa;
            border-radius: 12px;
            border-left: 4px solid #667eea;
        }
        
        .segment h2 {
            color: #1a1a2e;
            margin-bottom: 15px;
            font-size: 1.4em;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .segment-meta {
            font-size: 0.85em;
            color: #666;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px dashed #ddd;
        }
        
        .ai-response {
            background: white;
            padding: 25px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        
        .ai-response p {
            margin-bottom: 1em;
            text-align: justify;
        }
        
        .ai-response p:last-child {
            margin-bottom: 0;
        }
        
        /* 编号列表样式 */
        .ai-response .numbered-item {
            margin: 15px 0;
            padding-left: 10px;
        }
        
        .ai-response .section-title {
            font-weight: bold;
            font-size: 1.1em;
            color: #1a1a2e;
            margin-top: 20px;
            margin-bottom: 10px;
            padding-bottom: 5px;
            border-bottom: 2px solid #667eea;
        }
        
        /* Emoji高亮 */
        .ai-response .emoji-line {
            background: linear-gradient(90deg, #f0f4ff 0%, transparent 100%);
            padding: 8px 12px;
            border-radius: 6px;
            margin: 10px 0;
        }
        
        footer {
            background: #f8f9fa;
            padding: 20px 40px;
            text-align: center;
            color: #666;
            font-size: 0.9em;
            border-top: 1px solid #eee;
        }
        
        /* 打印优化 */
        @media print {
            body {
                background: white;
                padding: 0;
            }
            .container {
                box-shadow: none;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>📖 ${title}</h1>
            <div class="meta">
                <p>生成时间: ${timestamp}</p>
                <p>共 ${segments.length} 个分段</p>
            </div>
        </header>
        
        <main>
            ${contentSections}
        </main>
        
        <footer>
            <p>🤖 由 AI 智能生成 | 课堂笔记自动化系统</p>
        </footer>
    </div>
</body>
</html>`;

        return html;
    }

    /**
     * 文本转HTML - 保留格式和结构
     */
    textToHtml(text) {
        if (!text) return '<p>（无内容）</p>';

        // 分割成段落
        const paragraphs = text.split(/\n\n+/);
        
        return paragraphs.map(para => {
            if (!para.trim()) return '';
            
            // 处理单行内的换行
            let html = para
                .split('\n')
                .map(line => this.formatLine(line))
                .join('<br>\n');
            
            return `<p>${html}</p>`;
        }).filter(p => p).join('\n');
    }

    /**
     * 格式化单行 - 添加样式
     */
    formatLine(line) {
        if (!line.trim()) return '';
        
        let formatted = line;
        
        // 转义HTML特殊字符
        formatted = formatted
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        
        // 检测并标记中文大写序号标题
        if (/^[一二三四五六七八九十]+[、．.]/.test(formatted)) {
            return `<span class="section-title">${formatted}</span>`;
        }
        
        // 检测emoji开头的行
        if (/^[\u{1F300}-\u{1F9FF}✅❌⭐📌💡🔹🔸⚠️📍🎯✨🔥💪👉👆📝🔑⚡️🌟💎🎉🏆]/u.test(formatted)) {
            return `<span class="emoji-line">${formatted}</span>`;
        }
        
        // 检测数字编号
        if (/^\d+[.．、)）]/.test(formatted)) {
            return `<span class="numbered-item">${formatted}</span>`;
        }
        
        return formatted;
    }

    // ============================================
    // Markdown 报告生成
    // ============================================

    /**
     * 生成Markdown报告
     */
    generateMarkdown(data) {
        const {
            title = '课堂学习笔记',
            segments = [],
            metadata = {}
        } = data;

        const timestamp = new Date().toLocaleString('zh-CN');
        
        let markdown = `# 📖 ${title}\n\n`;
        markdown += `> 生成时间: ${timestamp}\n`;
        markdown += `> 共 ${segments.length} 个分段\n\n`;
        markdown += `---\n\n`;

        segments.forEach((seg, index) => {
            const formattedResponse = this.smartFormat(seg.response?.text || seg.response || '');
            
            markdown += `## 📚 第 ${index + 1} 部分\n\n`;
            markdown += `*原文长度: ${seg.originalLength || seg.segmentText?.length || 0} 字符*\n\n`;
            markdown += formattedResponse;
            markdown += `\n\n---\n\n`;
        });

        markdown += `\n\n*🤖 由 AI 智能生成*\n`;

        return markdown;
    }

    // ============================================
    // 文件保存
    // ============================================

    /**
     * 保存HTML报告
     */
    saveHTML(data, filename = null) {
        const html = this.generateHTML(data);
        const outputFilename = filename || `report_${Date.now()}.html`;
        const outputPath = path.join(this.outputDir, outputFilename);
        
        fs.writeFileSync(outputPath, html, 'utf-8');
        console.log(`✅ HTML报告已保存: ${outputPath}`);
        
        return outputPath;
    }

    /**
     * 保存Markdown报告
     */
    saveMarkdown(data, filename = null) {
        const markdown = this.generateMarkdown(data);
        const outputFilename = filename || `report_${Date.now()}.md`;
        const outputPath = path.join(this.outputDir, outputFilename);
        
        fs.writeFileSync(outputPath, markdown, 'utf-8');
        console.log(`✅ Markdown报告已保存: ${outputPath}`);
        
        return outputPath;
    }

    /**
     * 同时保存HTML和Markdown
     */
    saveAll(data, baseName = null) {
        const base = baseName || `report_${Date.now()}`;
        
        return {
            html: this.saveHTML(data, `${base}.html`),
            markdown: this.saveMarkdown(data, `${base}.md`)
        };
    }
}

module.exports = ReportGenerator;