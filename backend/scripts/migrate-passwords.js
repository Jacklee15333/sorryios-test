/**
 * 密码迁移脚本 - 将数据库中的明文密码升级为 bcrypt 哈希
 * 
 * 使用方法: node scripts/migrate-passwords.js
 * 
 * ⚠️ 此脚本只需要运行一次！
 * ⚠️ 运行前请先备份 data/sorryios.db
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/sorryios.db');

console.log('='.repeat(60));
console.log('  密码迁移工具 - 明文 → bcrypt 哈希');
console.log('='.repeat(60));
console.log(`  数据库: ${DB_PATH}`);
console.log('');

try {
    const db = new Database(DB_PATH);
    
    // 获取所有用户
    const users = db.prepare('SELECT id, username, password FROM users').all();
    
    console.log(`  找到 ${users.length} 个用户`);
    console.log('');
    
    let upgraded = 0;
    let skipped = 0;
    
    const updateStmt = db.prepare('UPDATE users SET password = ? WHERE id = ?');
    
    for (const user of users) {
        // 检查是否已经是 bcrypt 格式
        if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
            console.log(`  ⏭️  ${user.username} (ID:${user.id}) - 已是哈希格式，跳过`);
            skipped++;
            continue;
        }
        
        // 哈希密码
        const hashed = bcrypt.hashSync(user.password, 10);
        updateStmt.run(hashed, user.id);
        
        console.log(`  ✅ ${user.username} (ID:${user.id}) - 密码已升级为哈希格式`);
        upgraded++;
    }
    
    db.close();
    
    console.log('');
    console.log('='.repeat(60));
    console.log(`  迁移完成！升级: ${upgraded} 个，跳过: ${skipped} 个`);
    console.log('='.repeat(60));
    
} catch (error) {
    if (error.code === 'SQLITE_CANTOPEN') {
        console.log('  ⚠️ 数据库文件不存在，无需迁移（首次启动时会自动创建）');
    } else {
        console.error('  ❌ 迁移失败:', error.message);
        process.exit(1);
    }
}
