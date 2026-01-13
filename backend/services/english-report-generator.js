/**
 * 英语课堂报告生成器 v3.1
 * 
 * 更新：简化为2大类展示（词汇基础 + 语法知识）
 * 
 * @author Sorryios AI Team
 * @version 3.1.0
 * @date 2026-01-13
 */

const fs = require('fs');
const path = require('path');

class EnglishReportGenerator {
    constructor(options = {}) {
        this.outputDir = options.outputDir || './outputs';
        this.ensureOutputDir();
    }

    ensureOutputDir() {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * 生成HTML报告（新版2大类结构）
     */
    generateHTML(data, title = '英语课堂学习笔记') {
        const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        const summary = data.summary || {};
        const vocabulary = data.vocabulary || { words: [], phrases: [], patterns: [] };
        const grammar = data.grammar || [];
        
        return `<!DOCTYPE html>
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
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
            line-height: 1.8;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1100px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            overflow: hidden;
        }
        
        /* 头部 */
        header {
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        
        header h1 {
            font-size: 2.2em;
            margin-bottom: 15px;
        }
        
        header .meta {
            opacity: 0.9;
            font-size: 0.95em;
        }
        
        header .stats {
            display: flex;
            justify-content: center;
            gap: 30px;
            margin-top: 20px;
            flex-wrap: wrap;
        }
        
        header .stat-item {
            background: rgba(255,255,255,0.1);
            padding: 10px 20px;
            border-radius: 8px;
        }
        
        header .stat-item .number {
            font-size: 1.8em;
            font-weight: bold;
            color: #ffd700;
        }
        
        header .stat-item .label {
            font-size: 0.85em;
            opacity: 0.8;
        }
        
        /* 导出栏 */
        .export-bar {
            background: #f8f9fa;
            padding: 15px 40px;
            border-bottom: 1px solid #eee;
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        
        .export-btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s;
        }
        
        .export-btn.pdf { background: #e74c3c; color: white; }
        .export-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        
        /* 主体 */
        main {
            padding: 40px;
        }
        
        /* 大分类标题 */
        .section-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px 30px;
            border-radius: 12px;
            margin-bottom: 25px;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        
        .section-header .icon {
            font-size: 2em;
        }
        
        .section-header h2 {
            font-size: 1.5em;
            font-weight: 600;
        }
        
        .section-header .desc {
            font-size: 0.9em;
            opacity: 0.9;
            margin-left: auto;
        }
        
        /* 子分类标题 */
        .sub-section-title {
            font-size: 1.2em;
            color: #2c3e50;
            margin: 30px 0 15px 0;
            padding-bottom: 10px;
            border-bottom: 2px solid #667eea;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        /* 表格样式 */
        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            font-size: 0.95em;
        }
        
        .data-table th {
            background: #667eea;
            color: white;
            padding: 12px 15px;
            text-align: left;
            font-weight: 500;
        }
        
        .data-table td {
            padding: 12px 15px;
            border-bottom: 1px solid #eee;
            vertical-align: top;
        }
        
        .data-table tr:hover {
            background: #f8f9fa;
        }
        
        .data-table .index {
            width: 50px;
            text-align: center;
            color: #999;
        }
        
        /* 单词行（带变形） */
        .word-main {
            font-weight: bold;
            color: #2c3e50;
            font-size: 1.05em;
        }
        
        .word-forms {
            margin-top: 5px;
            padding-left: 10px;
            border-left: 3px solid #ddd;
        }
        
        .word-form-item {
            color: #e67e22;
            font-size: 0.9em;
            margin: 2px 0;
        }
        
        .word-form-label {
            color: #999;
            font-size: 0.8em;
            margin-left: 5px;
        }
        
        .phonetic {
            color: #9b59b6;
            font-family: 'Lucida Sans Unicode', sans-serif;
        }
        
        .pos {
            color: #3498db;
            font-weight: 500;
        }
        
        .example {
            color: #666;
            font-style: italic;
            font-size: 0.9em;
        }
        
        /* 语法卡片 */
        .grammar-card {
            background: #f8f9fa;
            border-radius: 12px;
            margin-bottom: 20px;
            overflow: hidden;
            border: 1px solid #e0e0e0;
        }
        
        .grammar-card-header {
            background: linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%);
            color: white;
            padding: 15px 20px;
            font-size: 1.1em;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .grammar-card-body {
            padding: 20px;
        }
        
        .grammar-item {
            margin-bottom: 15px;
        }
        
        .grammar-item-title {
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .grammar-item-content {
            padding-left: 25px;
            color: #555;
        }
        
        .grammar-item-content ul {
            margin: 5px 0;
            padding-left: 20px;
        }
        
        .grammar-item-content li {
            margin: 5px 0;
        }
        
        /* 易错点 */
        .mistake-item {
            background: #fff5f5;
            border-left: 4px solid #e74c3c;
            padding: 10px 15px;
            margin: 8px 0;
            border-radius: 0 8px 8px 0;
        }
        
        .mistake-wrong {
            color: #e74c3c;
            text-decoration: line-through;
        }
        
        .mistake-correct {
            color: #27ae60;
            font-weight: bold;
        }
        
        .mistake-arrow {
            color: #999;
            margin: 0 10px;
        }
        
        .mistake-explanation {
            color: #666;
            font-size: 0.9em;
            margin-top: 5px;
        }
        
        /* 例句框 */
        .examples-box {
            background: #e8f4fd;
            border-radius: 8px;
            padding: 12px 15px;
            margin-top: 10px;
        }
        
        .examples-box li {
            color: #2980b9;
        }
        
        /* 页脚 */
        footer {
            background: #f8f9fa;
            padding: 20px 40px;
            text-align: center;
            color: #666;
            font-size: 0.9em;
            border-top: 1px solid #eee;
        }
        
        /* 打印样式 */
        @media print {
            body { background: white; padding: 0; }
            .container { box-shadow: none; border-radius: 0; }
            .export-bar { display: none; }
            header { background: #1a1a2e !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .section-header { background: #667eea !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .grammar-card-header { background: #9b59b6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        
        /* 响应式 */
        @media (max-width: 768px) {
            header .stats { gap: 15px; }
            .export-bar { padding: 15px 20px; }
            main { padding: 20px; }
            .data-table { font-size: 0.85em; }
            .data-table th, .data-table td { padding: 8px 10px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>📖 ${title}</h1>
            <div class="meta">
                <p>生成时间: ${timestamp}</p>
            </div>
            <div class="stats">
                <div class="stat-item">
                    <div class="number">${summary.total_words || 0}</div>
                    <div class="label">单词</div>
                </div>
                <div class="stat-item">
                    <div class="number">${summary.total_phrases || 0}</div>
                    <div class="label">短语</div>
                </div>
                <div class="stat-item">
                    <div class="number">${summary.total_patterns || 0}</div>
                    <div class="label">句型</div>
                </div>
                <div class="stat-item">
                    <div class="number">${summary.total_grammar || 0}</div>
                    <div class="label">语法点</div>
                </div>
            </div>
        </header>
        
        <div class="export-bar">
            <button class="export-btn pdf" onclick="window.print()">📄 导出PDF / 打印</button>
            <span style="color: #666; line-height: 36px; margin-left: 10px;">提示：点击打印后选择"另存为PDF"即可导出PDF文件</span>
        </div>
        
        <main>
            <!-- ==================== 第一部分：词汇基础 ==================== -->
            <div class="section-header">
                <span class="icon">📚</span>
                <h2>词汇基础</h2>
                <span class="desc">需要记住的单词、短语、句型</span>
            </div>
            
            ${this.renderWords(vocabulary.words)}
            ${this.renderPhrases(vocabulary.phrases)}
            ${this.renderPatterns(vocabulary.patterns)}
            
            <!-- ==================== 第二部分：语法知识 ==================== -->
            <div class="section-header" style="background: linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%); margin-top: 40px;">
                <span class="icon">📖</span>
                <h2>语法知识</h2>
                <span class="desc">需要理解的语法规则</span>
            </div>
            
            ${this.renderGrammar(grammar)}
        </main>
        
        <footer>
            <p>🤖 由 Sorryios AI 智能生成 | 英语课堂笔记系统 v3.1</p>
            ${summary.filter_stats ? `<p>词汇过滤：${summary.filter_stats.original} → ${summary.filter_stats.final}（移除 ${summary.filter_stats.removed} 个基础词）</p>` : ''}
        </footer>
    </div>
</body>
</html>`;
    }

    /**
     * 渲染单词表格
     */
    renderWords(words) {
        if (!words || words.length === 0) {
            return '<p style="color: #999; padding: 20px;">暂无单词</p>';
        }
        
        return `
        <h3 class="sub-section-title">📝 单词</h3>
        <table class="data-table">
            <thead>
                <tr>
                    <th class="index">#</th>
                    <th style="width: 180px;">单词</th>
                    <th style="width: 100px;">音标</th>
                    <th style="width: 200px;">含义</th>
                    <th>例句</th>
                </tr>
            </thead>
            <tbody>
                ${words.map((w, i) => `
                <tr>
                    <td class="index">${i + 1}</td>
                    <td>
                        <div class="word-main">${w.word || ''}</div>
                        ${this.renderWordForms(w.forms)}
                    </td>
                    <td class="phonetic">${w.phonetic || ''}</td>
                    <td><span class="pos">${w.pos || ''}</span> ${w.meaning || ''}</td>
                    <td class="example">${w.example || ''}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>`;
    }

    /**
     * 渲染单词变形
     */
    renderWordForms(forms) {
        if (!forms) return '';
        
        const formItems = [];
        if (forms.past) formItems.push(`<div class="word-form-item">${forms.past}<span class="word-form-label">过去式</span></div>`);
        if (forms.past_participle) formItems.push(`<div class="word-form-item">${forms.past_participle}<span class="word-form-label">过去分词</span></div>`);
        if (forms.third_person) formItems.push(`<div class="word-form-item">${forms.third_person}<span class="word-form-label">三单</span></div>`);
        if (forms.present_participle) formItems.push(`<div class="word-form-item">${forms.present_participle}<span class="word-form-label">现在分词</span></div>`);
        if (forms.comparative) formItems.push(`<div class="word-form-item">${forms.comparative}<span class="word-form-label">比较级</span></div>`);
        if (forms.superlative) formItems.push(`<div class="word-form-item">${forms.superlative}<span class="word-form-label">最高级</span></div>`);
        
        if (formItems.length === 0) return '';
        
        return `<div class="word-forms">${formItems.join('')}</div>`;
    }

    /**
     * 渲染短语表格
     */
    renderPhrases(phrases) {
        if (!phrases || phrases.length === 0) {
            return '';
        }
        
        return `
        <h3 class="sub-section-title">💬 短语</h3>
        <table class="data-table">
            <thead>
                <tr>
                    <th class="index">#</th>
                    <th style="width: 250px;">短语</th>
                    <th style="width: 200px;">含义</th>
                    <th>例句</th>
                </tr>
            </thead>
            <tbody>
                ${phrases.map((p, i) => `
                <tr>
                    <td class="index">${i + 1}</td>
                    <td class="word-main">${p.phrase || ''}</td>
                    <td>${p.meaning || ''}</td>
                    <td class="example">${p.example || ''}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>`;
    }

    /**
     * 渲染句型表格
     */
    renderPatterns(patterns) {
        if (!patterns || patterns.length === 0) {
            return '';
        }
        
        return `
        <h3 class="sub-section-title">📐 句型</h3>
        <table class="data-table">
            <thead>
                <tr>
                    <th class="index">#</th>
                    <th style="width: 300px;">句型</th>
                    <th style="width: 200px;">含义</th>
                    <th>例句</th>
                </tr>
            </thead>
            <tbody>
                ${patterns.map((p, i) => `
                <tr>
                    <td class="index">${i + 1}</td>
                    <td class="word-main">${p.pattern || ''}</td>
                    <td>${p.meaning || ''}</td>
                    <td class="example">${p.example || ''}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>`;
    }

    /**
     * 渲染语法卡片
     */
    renderGrammar(grammar) {
        if (!grammar || grammar.length === 0) {
            return '<p style="color: #999; padding: 20px;">暂无语法知识点</p>';
        }
        
        return grammar.map((g, i) => `
        <div class="grammar-card">
            <div class="grammar-card-header">
                <span>🎴</span>
                <span>${i + 1}. ${g.title || '语法知识点'}</span>
            </div>
            <div class="grammar-card-body">
                ${g.definition ? `
                <div class="grammar-item">
                    <div class="grammar-item-title">📝 定义</div>
                    <div class="grammar-item-content">${g.definition}</div>
                </div>` : ''}
                
                ${g.structure ? `
                <div class="grammar-item">
                    <div class="grammar-item-title">📋 结构</div>
                    <div class="grammar-item-content">${g.structure}</div>
                </div>` : ''}
                
                ${g.usage && g.usage.length > 0 ? `
                <div class="grammar-item">
                    <div class="grammar-item-title">💡 用法</div>
                    <div class="grammar-item-content">
                        <ul>
                            ${g.usage.map(u => `<li>${u}</li>`).join('')}
                        </ul>
                    </div>
                </div>` : ''}
                
                ${g.mistakes && g.mistakes.length > 0 ? `
                <div class="grammar-item">
                    <div class="grammar-item-title">⚠️ 易错点</div>
                    <div class="grammar-item-content">
                        ${g.mistakes.map(m => `
                        <div class="mistake-item">
                            <span class="mistake-wrong">❌ ${m.wrong}</span>
                            <span class="mistake-arrow">→</span>
                            <span class="mistake-correct">✅ ${m.correct}</span>
                            ${m.explanation ? `<div class="mistake-explanation">${m.explanation}</div>` : ''}
                        </div>
                        `).join('')}
                    </div>
                </div>` : ''}
                
                ${g.examples && g.examples.length > 0 ? `
                <div class="grammar-item">
                    <div class="grammar-item-title">📌 例句</div>
                    <div class="grammar-item-content">
                        <div class="examples-box">
                            <ul>
                                ${g.examples.map(ex => `<li>${ex}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                </div>` : ''}
            </div>
        </div>
        `).join('');
    }

    /**
     * 生成Markdown报告
     */
    generateMarkdown(data, title = '英语课堂学习笔记') {
        const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        const summary = data.summary || {};
        const vocabulary = data.vocabulary || { words: [], phrases: [], patterns: [] };
        const grammar = data.grammar || [];
        
        let md = `# 📖 ${title}\n\n`;
        md += `> 生成时间: ${timestamp}\n\n`;
        md += `## 📊 统计\n\n`;
        md += `| 单词 | 短语 | 句型 | 语法点 |\n|------|------|------|--------|\n`;
        md += `| ${summary.total_words || 0} | ${summary.total_phrases || 0} | ${summary.total_patterns || 0} | ${summary.total_grammar || 0} |\n\n`;
        
        // 词汇基础
        md += `---\n\n# 📚 词汇基础\n\n`;
        
        // 单词
        if (vocabulary.words && vocabulary.words.length > 0) {
            md += `## 📝 单词\n\n`;
            md += `| # | 单词 | 音标 | 含义 | 例句 |\n|---|------|------|------|------|\n`;
            vocabulary.words.forEach((w, i) => {
                let wordCell = w.word || '';
                if (w.forms) {
                    const formParts = [];
                    if (w.forms.past) formParts.push(w.forms.past);
                    if (w.forms.past_participle) formParts.push(w.forms.past_participle);
                    if (formParts.length > 0) {
                        wordCell += ` (${formParts.join('/')})`;
                    }
                }
                md += `| ${i + 1} | ${wordCell} | ${w.phonetic || ''} | ${w.pos || ''} ${w.meaning || ''} | ${w.example || ''} |\n`;
            });
            md += '\n';
        }
        
        // 短语
        if (vocabulary.phrases && vocabulary.phrases.length > 0) {
            md += `## 💬 短语\n\n`;
            md += `| # | 短语 | 含义 | 例句 |\n|---|------|------|------|\n`;
            vocabulary.phrases.forEach((p, i) => {
                md += `| ${i + 1} | ${p.phrase || ''} | ${p.meaning || ''} | ${p.example || ''} |\n`;
            });
            md += '\n';
        }
        
        // 句型
        if (vocabulary.patterns && vocabulary.patterns.length > 0) {
            md += `## 📐 句型\n\n`;
            md += `| # | 句型 | 含义 | 例句 |\n|---|------|------|------|\n`;
            vocabulary.patterns.forEach((p, i) => {
                md += `| ${i + 1} | ${p.pattern || ''} | ${p.meaning || ''} | ${p.example || ''} |\n`;
            });
            md += '\n';
        }
        
        // 语法知识
        md += `---\n\n# 📖 语法知识\n\n`;
        
        if (grammar && grammar.length > 0) {
            grammar.forEach((g, i) => {
                md += `## ${i + 1}. ${g.title || '语法知识点'}\n\n`;
                if (g.definition) md += `**📝 定义：** ${g.definition}\n\n`;
                if (g.structure) md += `**📋 结构：** ${g.structure}\n\n`;
                if (g.usage && g.usage.length > 0) {
                    md += `**💡 用法：**\n`;
                    g.usage.forEach(u => md += `- ${u}\n`);
                    md += '\n';
                }
                if (g.mistakes && g.mistakes.length > 0) {
                    md += `**⚠️ 易错点：**\n`;
                    g.mistakes.forEach(m => {
                        md += `- ❌ ~~${m.wrong}~~ → ✅ **${m.correct}**`;
                        if (m.explanation) md += ` (${m.explanation})`;
                        md += '\n';
                    });
                    md += '\n';
                }
                if (g.examples && g.examples.length > 0) {
                    md += `**📌 例句：**\n`;
                    g.examples.forEach(ex => md += `- ${ex}\n`);
                    md += '\n';
                }
            });
        }
        
        md += `---\n\n*由 Sorryios AI 智能生成*\n`;
        
        return md;
    }

    /**
     * 保存HTML报告
     */
    saveHTML(data, filename = null, title = '英语课堂学习笔记') {
        const html = this.generateHTML(data, title);
        const outputFilename = filename || `report_${Date.now()}.html`;
        const outputPath = path.join(this.outputDir, outputFilename);
        
        fs.writeFileSync(outputPath, html, 'utf-8');
        console.log(`✅ HTML报告已保存: ${outputPath}`);
        
        return outputPath;
    }

    /**
     * 保存Markdown报告
     */
    saveMarkdown(data, filename = null, title = '英语课堂学习笔记') {
        const md = this.generateMarkdown(data, title);
        const outputFilename = filename || `report_${Date.now()}.md`;
        const outputPath = path.join(this.outputDir, outputFilename);
        
        fs.writeFileSync(outputPath, md, 'utf-8');
        console.log(`✅ Markdown报告已保存: ${outputPath}`);
        
        return outputPath;
    }

    /**
     * 保存JSON
     */
    saveJSON(data, filename = null) {
        const outputFilename = filename || `report_${Date.now()}.json`;
        const outputPath = path.join(this.outputDir, outputFilename);
        
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`✅ JSON已保存: ${outputPath}`);
        
        return outputPath;
    }

    /**
     * 保存所有格式
     */
    saveAll(data, baseName = null, title = '英语课堂学习笔记') {
        const base = baseName || `report_${Date.now()}`;
        
        return {
            html: this.saveHTML(data, `${base}.html`, title),
            markdown: this.saveMarkdown(data, `${base}.md`, title),
            json: this.saveJSON(data, `${base}.json`)
        };
    }
}

module.exports = EnglishReportGenerator;