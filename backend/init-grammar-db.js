/**
 * 语法数据库初始化脚本
 * 将 grammar_database.json 导入到 SQLite 数据库
 * 
 * 使用方法：
 * node init-grammar-db.js
 */

const path = require('path');
const fs = require('fs');
const { GrammarService } = require('./services/grammarService');

// 配置路径
const JSON_PATH = path.join(__dirname, 'data/grammar_database.json');
const DB_PATH = path.join(__dirname, 'data/grammar.db');

console.log('='.repeat(50));
console.log('语法数据库初始化脚本');
console.log('='.repeat(50));

// 检查 JSON 文件是否存在
if (!fs.existsSync(JSON_PATH)) {
    console.error(`\n❌ 错误: JSON 文件不存在: ${JSON_PATH}`);
    console.log('\n请先将 grammar_database.json 放到 backend/data/ 目录');
    process.exit(1);
}

// 检查数据库是否已存在
if (fs.existsSync(DB_PATH)) {
    console.log(`\n⚠️  警告: 数据库已存在: ${DB_PATH}`);
    console.log('如果继续，将会跳过已存在的语法点\n');
}

// 初始化服务并导入
try {
    console.log('\n📦 正在初始化数据库...');
    const service = new GrammarService(DB_PATH);
    
    console.log('📥 正在导入 JSON 数据...');
    const result = service.importFromJson(JSON_PATH);
    
    console.log('\n✅ 导入完成！');
    console.log(`   成功导入: ${result.imported} 条`);
    console.log(`   跳过(已存在): ${result.skipped} 条`);
    
    // 显示统计
    const stats = service.getStats();
    console.log('\n📊 数据库统计:');
    console.log(`   总数: ${stats.total}`);
    console.log(`   已启用: ${stats.enabled}`);
    console.log(`   已禁用: ${stats.disabled}`);
    console.log('\n   分类统计:');
    stats.categories.forEach(c => {
        console.log(`   - ${c.category}: ${c.count} 条`);
    });
    
    service.close();
    
    console.log('\n' + '='.repeat(50));
    console.log('初始化完成！');
    console.log('数据库文件位置:', DB_PATH);
    console.log('='.repeat(50));
    
} catch (error) {
    console.error('\n❌ 初始化失败:', error.message);
    process.exit(1);
}
