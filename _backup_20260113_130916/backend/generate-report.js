/**
 * 从JSON结果生成报告
 * 
 * 使用方法：
 *   node generate-report.js <json文件路径> [输出文件名] [报告标题]
 * 
 * 示例：
 *   node generate-report.js data/results/test_xxx_final.json my-report "1月12日英语笔记"
 */

const fs = require('fs');
const path = require('path');
const ReportGenerator = require('./services/english-report-generator');

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('用法: node generate-report.js <json文件路径> [输出文件名] [报告标题]');
        console.log('');
        console.log('示例:');
        console.log('  node generate-report.js data/results/test_xxx_final.json');
        console.log('  node generate-report.js data/results/test_xxx_final.json my-report "1月12日英语笔记"');
        process.exit(1);
    }
    
    const jsonPath = args[0];
    const baseName = args[1] || `report_${Date.now()}`;
    const title = args[2] || '英语课堂学习笔记';
    
    // 检查文件是否存在
    if (!fs.existsSync(jsonPath)) {
        console.error(`❌ 文件不存在: ${jsonPath}`);
        process.exit(1);
    }
    
    console.log('='.repeat(60));
    console.log('英语课堂报告生成器');
    console.log('='.repeat(60));
    console.log(`📄 输入文件: ${jsonPath}`);
    console.log(`📝 报告标题: ${title}`);
    console.log(`📁 输出文件名: ${baseName}`);
    console.log('');
    
    try {
        // 读取JSON
        const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
        const data = JSON.parse(jsonContent);
        
        console.log('📊 数据统计:');
        if (data.summary) {
            console.log(`   单词: ${data.summary.total_words || 0}`);
            console.log(`   短语: ${data.summary.total_phrases || 0}`);
            console.log(`   句型: ${data.summary.total_patterns || 0}`);
            console.log(`   语法点: ${data.summary.total_grammar || 0}`);
        }
        console.log('');
        
        // 生成报告
        const generator = new ReportGenerator({ outputDir: './outputs' });
        const files = generator.saveAll(data, baseName, title);
        
        console.log('');
        console.log('✅ 报告生成完成！');
        console.log('='.repeat(60));
        console.log('📁 输出文件:');
        console.log(`   HTML:     ${files.html}`);
        console.log(`   Markdown: ${files.markdown}`);
        console.log(`   JSON:     ${files.json}`);
        console.log('');
        console.log('💡 提示:');
        console.log('   - 双击 .html 文件在浏览器中查看');
        console.log('   - 在浏览器中按 Ctrl+P 可导出为PDF');
        console.log('   - .md 文件可用于 Notion、Obsidian 等笔记软件');
        
    } catch (error) {
        console.error('❌ 生成失败:', error.message);
        process.exit(1);
    }
}

main();
