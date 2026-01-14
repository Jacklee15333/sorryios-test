/**
 * 英语课堂报告生成器 v3.2
 * 
 * 【v3.2 更新】
 * - 简化分类：词汇（合并单词+短语+句型）+ 语法
 * - 统一用"词汇"表格展示所有词汇内容
 * - 每项带有类型标签（单词/短语/句型）
 * 
 * @author Sorryios AI Team
 * @version 3.2.0
 * @date 2026-01-14
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
     * 合并所有词汇为统一列表
     */
    mergeVocabulary(vocabulary) {
        const merged = [];
        
        // 添加单词
        if (vocabulary.words && vocabulary.words.length > 0) {
            for (const w of vocabulary.words) {
                merged.push({
                    type: 'word',
                    name: w.word || '',
                    phonetic: w.phonetic || '',
                    pos: w.pos || '',
                    meaning: w.meaning || '',
                    example: w.example || '',
                    forms: w.forms || null,
                    note: w.note || '',
                    _source: w._source
                });
            }
        }
        
        // 添加短语
        if (vocabulary.phrases && vocabulary.phrases.length > 0) {
            for (const p of vocabulary.phrases) {
                merged.push({
                    type: 'phrase',
                    name: p.phrase || '',
                    phonetic: '',
                    pos: '',
                    meaning: p.meaning || '',
                    example: p.example || '',
                    forms: null,
                    note: '',
                    _source: p._source
                });
            }
        }
        
        // 添加句型
        if (vocabulary.patterns && vocabulary.patterns.length > 0) {
            for (const p of vocabulary.patterns) {
                merged.push({
                    type: 'pattern',
                    name: p.pattern || '',
                    phonetic: '',
                    pos: '',
                    meaning: p.meaning || '',
                    example: p.example || '',
                    forms: null,
                    note: '',
                    _source: p._source
                });
            }
        }
        
        return merged;
    }

    /**
     * 生成HTML报告（v3.2 简化版：词汇+语法两大类）
     */
    generateHTML(data, title = '英语课堂学习笔记') {
        const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        const vocabulary = data.vocabulary || { words: [], phrases: [], patterns: [] };
        const grammar = data.grammar || [];
        
        // 合并词汇
        const mergedVocab = this.mergeVocabulary(vocabulary);
        const totalVocab = mergedVocab.length;
        const totalGrammar = grammar.length;
        
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
            gap: 40px;
            margin-top: 20px;
            flex-wrap: wrap;
        }
        
        header .stat-item {
            background: rgba(255,255,255,0.1);
            padding: 15px 30px;
            border-radius: 10px;
        }
        
        header .stat-item .number {
            font-size: 2em;
            font-weight: bold;
            color: #ffd700;
        }
        
        header .stat-item .label {
            font-size: 0.9em;
            opacity: 0.8;
        }
        
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
        
        main {
            padding: 40px;
        }
        
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
        
        .vocab-name {
            font-weight: bold;
            color: #2c3e50;
            font-size: 1.05em;
        }
        
        .type-tag {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 0.75em;
            margin-left: 8px;
            font-weight: normal;
        }
        
        .type-tag.word { background: #e8f5e9; color: #2e7d32; }
        .type-tag.phrase { background: #e3f2fd; color: #1565c0; }
        .type-tag.pattern { background: #fff3e0; color: #ef6c00; }
        
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
        
        .grammar-card {
            background: #f8f9fa;
            border-radius: 12px;
            margin-bottom: 20px;
            overflow: hidden;
            border: 1px solid #e0e0e0;
        }
        
        .grammar-card-header {
            background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
            color: white;
            padding: 15px 20px;
            font-weight: bold;
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
        
        .grammar-item:last-child {
            margin-bottom: 0;
        }
        
        .grammar-item-title {
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .grammar-item-content {
            padding-left: 24px;
            color: #555;
        }
        
        .grammar-item-content ul {
            margin: 0;
            padding-left: 20px;
        }
        
        .grammar-item-content li {
            margin: 5px 0;
        }
        
        .mistake-item {
            background: #fff;
            padding: 12px;
            border-radius: 8px;
            margin: 8px 0;
            border-left: 4px solid #e74c3c;
        }
        
        .mistake-wrong {
            color: #e74c3c;
            text-decoration: line-through;
        }
        
        .mistake-arrow {
            margin: 0 10px;
            color: #999;
        }
        
        .mistake-correct {
            color: #27ae60;
            font-weight: bold;
        }
        
        .mistake-explanation {
            margin-top: 8px;
            color: #666;
            font-size: 0.9em;
        }
        
        .examples-box {
            background: #fff;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #e0e0e0;
        }
        
        .examples-box ul {
            margin: 0;
        }
        
        .section-divider {
            height: 40px;
        }
        
        footer {
            background: #f8f9fa;
            padding: 20px 40px;
            text-align: center;
            color: #999;
            font-size: 0.9em;
            border-top: 1px solid #eee;
        }
        
        @media print {
            body {
                background: white;
                padding: 0;
            }
            .container {
                box-shadow: none;
            }
            .export-bar {
                display: none;
            }
            .section-header {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>📖 ${title}</h1>
            <div class="meta">生成时间: ${timestamp}</div>
            <div class="stats">
                <div class="stat-item">
                    <div class="number">${totalVocab}</div>
                    <div class="label">词汇</div>
                </div>
                <div class="stat-item">
                    <div class="number">${totalGrammar}</div>
                    <div class="label">语法</div>
                </div>
            </div>
        </header>
        
        <div class="export-bar">
            <button class="export-btn pdf" onclick="window.print()">🖨️ 打印/导出PDF</button>
        </div>
        
        <main>
            <section>
                <div class="section-header">
                    <span class="icon">📚</span>
                    <h2>词汇</h2>
                    <span class="desc">共 ${totalVocab} 项</span>
                </div>
                ${this.renderMergedVocabulary(mergedVocab)}
            </section>
            
            <div class="section-divider"></div>
            
            <section>
                <div class="section-header">
                    <span class="icon">📖</span>
                    <h2>语法</h2>
                    <span class="desc">共 ${totalGrammar} 项</span>
                </div>
                ${this.renderGrammar(grammar)}
            </section>
        </main>
        
        <footer>
            由 Sorryios AI 智能生成 | ${timestamp}
        </footer>
    </div>
</body>
</html>`;
    }

    renderMergedVocabulary(vocabList) {
        if (!vocabList || vocabList.length === 0) {
            return '<p style="color: #999; padding: 20px;">暂无词汇内容</p>';
        }
        
        return `
        <table class="data-table">
            <thead>
                <tr>
                    <th class="index">#</th>
                    <th style="width: 280px;">词汇</th>
                    <th style="width: 80px;">音标</th>
                    <th style="width: 200px;">含义</th>
                    <th>例句</th>
                </tr>
            </thead>
            <tbody>
                ${vocabList.map((v, i) => `
                <tr>
                    <td class="index">${i + 1}</td>
                    <td>
                        <span class="vocab-name">${v.name}</span>
                        ${this.renderWordForms(v.forms)}
                    </td>
                    <td class="phonetic">${v.phonetic || ''}</td>
                    <td><span class="pos">${v.pos || ''}</span> ${v.meaning || ''}</td>
                    <td class="example">${v.example || ''}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>`;
    }

    getTypeTag(type) {
        // 不再显示类型标签
        return '';
    }

    renderWordForms(forms) {
        if (!forms) return '';
        
        const formItems = [];
        if (forms.past) formItems.push(`<div class="word-form-item">${forms.past}<span class="word-form-label">过去式</span></div>`);
        if (forms.past_participle || forms.pp) formItems.push(`<div class="word-form-item">${forms.past_participle || forms.pp}<span class="word-form-label">过去分词</span></div>`);
        if (forms.third_person) formItems.push(`<div class="word-form-item">${forms.third_person}<span class="word-form-label">三单</span></div>`);
        if (forms.present_participle || forms.ing) formItems.push(`<div class="word-form-item">${forms.present_participle || forms.ing}<span class="word-form-label">现在分词</span></div>`);
        if (forms.comparative) formItems.push(`<div class="word-form-item">${forms.comparative}<span class="word-form-label">比较级</span></div>`);
        if (forms.superlative) formItems.push(`<div class="word-form-item">${forms.superlative}<span class="word-form-label">最高级</span></div>`);
        
        if (formItems.length === 0) return '';
        
        return `<div class="word-forms">${formItems.join('')}</div>`;
    }

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

    generateMarkdown(data, title = '英语课堂学习笔记') {
        const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        const vocabulary = data.vocabulary || { words: [], phrases: [], patterns: [] };
        const grammar = data.grammar || [];
        
        const mergedVocab = this.mergeVocabulary(vocabulary);
        
        let md = `# 📖 ${title}\n\n`;
        md += `> 生成时间: ${timestamp}\n\n`;
        md += `## 📊 统计\n\n`;
        md += `| 词汇 | 语法 |\n|------|------|\n`;
        md += `| ${mergedVocab.length} | ${grammar.length} |\n\n`;
        
        md += `---\n\n# 📚 词汇\n\n`;
        
        if (mergedVocab.length > 0) {
            md += `| # | 词汇 | 含义 | 例句 |\n|---|------|------|------|\n`;
            mergedVocab.forEach((v, i) => {
                md += `| ${i + 1} | ${v.name} | ${v.meaning || ''} | ${v.example || ''} |\n`;
            });
            md += '\n';
        }
        
        md += `---\n\n# 📖 语法\n\n`;
        
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

    saveHTML(data, filename = null, title = '英语课堂学习笔记') {
        const html = this.generateHTML(data, title);
        const outputFilename = filename || `report_${Date.now()}.html`;
        const outputPath = path.join(this.outputDir, outputFilename);
        
        fs.writeFileSync(outputPath, html, 'utf-8');
        console.log(`✅ HTML报告已保存: ${outputPath}`);
        
        return outputPath;
    }

    saveMarkdown(data, filename = null, title = '英语课堂学习笔记') {
        const md = this.generateMarkdown(data, title);
        const outputFilename = filename || `report_${Date.now()}.md`;
        const outputPath = path.join(this.outputDir, outputFilename);
        
        fs.writeFileSync(outputPath, md, 'utf-8');
        console.log(`✅ Markdown报告已保存: ${outputPath}`);
        
        return outputPath;
    }

    saveJSON(data, filename = null) {
        const outputFilename = filename || `report_${Date.now()}.json`;
        const outputPath = path.join(this.outputDir, outputFilename);
        
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`✅ JSON已保存: ${outputPath}`);
        
        return outputPath;
    }

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