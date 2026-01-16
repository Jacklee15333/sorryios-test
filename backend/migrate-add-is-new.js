/**
 * 数据库迁移脚本 - 添加 is_new 字段
 * 
 * 运行方法：
 * cd D:\sorryios-test\backend
 * node migrate-add-is-new.js
 */

const Database = require('better-sqlite3');
const path = require('path');

// 数据库路径
const vocabDbPath = path.join(__dirname, 'data', 'vocabulary.db');

console.log('开始迁移...');
console.log('词库路径:', vocabDbPath);

try {
    const db = new Database(vocabDbPath);
    
    // 检查 words 表是否已有 is_new 字段
    const wordsColumns = db.prepare("PRAGMA table_info(words)").all();
    const hasIsNew = wordsColumns.some(col => col.name === 'is_new');
    
    if (hasIsNew) {
        console.log('is_new 字段已存在，跳过迁移');
    } else {
        console.log('添加 is_new 字段到 words 表...');
        db.exec(`ALTER TABLE words ADD COLUMN is_new INTEGER DEFAULT 0`);
        
        console.log('添加 is_new 字段到 phrases 表...');
        db.exec(`ALTER TABLE phrases ADD COLUMN is_new INTEGER DEFAULT 0`);
        
        console.log('添加 is_new 字段到 patterns 表...');
        db.exec(`ALTER TABLE patterns ADD COLUMN is_new INTEGER DEFAULT 0`);
        
        console.log('迁移完成！');
    }
    
    // 显示统计
    const wordCount = db.prepare('SELECT COUNT(*) as c FROM words').get().c;
    const phraseCount = db.prepare('SELECT COUNT(*) as c FROM phrases').get().c;
    const patternCount = db.prepare('SELECT COUNT(*) as c FROM patterns').get().c;
    
    console.log('\n当前数据统计:');
    console.log('  单词:', wordCount);
    console.log('  短语:', phraseCount);
    console.log('  句型:', patternCount);
    
    db.close();
    console.log('\n数据库已关闭');
    
} catch (e) {
    console.error('迁移失败:', e.message);
    process.exit(1);
}
