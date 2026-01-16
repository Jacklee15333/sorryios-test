/**
 * 数据迁移脚本
 * 文件位置: backend/scripts/migrate-exclude.js
 * 
 * 功能：
 * 1. 从 matching.db 的 matching_rules 表中提取 action='exclude' 的记录
 * 2. 迁移到新的 exclude.db 的 excluded_items 表
 * 3. 删除 matching.db 中的 exclude 记录
 * 
 * 使用方法：
 * cd D:\sorryios-test\backend
 * node scripts/migrate-exclude.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 数据库路径
const DATA_DIR = path.join(__dirname, '../data');
const MATCHING_DB_PATH = path.join(DATA_DIR, 'matching.db');
const EXCLUDE_DB_PATH = path.join(DATA_DIR, 'exclude.db');

console.log('========================================');
console.log('排除库数据迁移脚本');
console.log('========================================');
console.log(`数据目录: ${DATA_DIR}`);
console.log(`匹配词典: ${MATCHING_DB_PATH}`);
console.log(`排除库: ${EXCLUDE_DB_PATH}`);
console.log('');

// 检查 matching.db 是否存在
if (!fs.existsSync(MATCHING_DB_PATH)) {
    console.log('[INFO] matching.db 不存在，跳过迁移');
    process.exit(0);
}

// 打开数据库
const matchingDb = new Database(MATCHING_DB_PATH);
const excludeDb = new Database(EXCLUDE_DB_PATH);

try {
    // 1. 初始化 exclude.db 表结构
    console.log('[步骤1] 初始化 exclude.db 表结构...');
    excludeDb.exec(`
        CREATE TABLE IF NOT EXISTS excluded_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_text TEXT NOT NULL,
            original_type TEXT NOT NULL,
            reason TEXT DEFAULT '',
            is_new INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT DEFAULT 'system'
        );
        
        CREATE INDEX IF NOT EXISTS idx_excluded_text_type 
        ON excluded_items(original_text, original_type);
        
        CREATE INDEX IF NOT EXISTS idx_excluded_is_new 
        ON excluded_items(is_new);
    `);
    console.log('[OK] exclude.db 表结构已创建');

    // 2. 检查 matching_rules 表是否存在
    const tableExists = matchingDb.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='matching_rules'
    `).get();

    if (!tableExists) {
        console.log('[INFO] matching_rules 表不存在，跳过迁移');
        process.exit(0);
    }

    // 3. 获取 exclude 记录
    console.log('[步骤2] 查询 matching.db 中的 exclude 记录...');
    const excludeItems = matchingDb.prepare(`
        SELECT * FROM matching_rules WHERE action = 'exclude'
    `).all();

    console.log(`[INFO] 找到 ${excludeItems.length} 条 exclude 记录`);

    if (excludeItems.length === 0) {
        console.log('[INFO] 没有需要迁移的数据');
        process.exit(0);
    }

    // 4. 迁移数据
    console.log('[步骤3] 迁移数据到 exclude.db...');
    
    const insertStmt = excludeDb.prepare(`
        INSERT OR IGNORE INTO excluded_items 
        (original_text, original_type, reason, is_new, created_at, created_by)
        VALUES (?, ?, ?, 0, ?, ?)
    `);

    let migrated = 0;
    let skipped = 0;

    for (const item of excludeItems) {
        try {
            const result = insertStmt.run(
                item.original_text,
                item.original_type,
                item.notes || `不是${getTypeLabel(item.original_type)}（从匹配词典迁移）`,
                item.created_at || new Date().toISOString(),
                item.created_by || 'migration'
            );
            
            if (result.changes > 0) {
                migrated++;
                console.log(`  ✓ 迁移: ${item.original_text} (${item.original_type})`);
            } else {
                skipped++;
                console.log(`  - 跳过（已存在）: ${item.original_text}`);
            }
        } catch (e) {
            skipped++;
            console.log(`  ✗ 失败: ${item.original_text} - ${e.message}`);
        }
    }

    console.log(`[INFO] 迁移完成: 成功 ${migrated} 条，跳过 ${skipped} 条`);

    // 5. 删除 matching.db 中的 exclude 记录
    console.log('[步骤4] 删除 matching.db 中的 exclude 记录...');
    const deleteResult = matchingDb.prepare(`
        DELETE FROM matching_rules WHERE action = 'exclude'
    `).run();

    console.log(`[OK] 已删除 ${deleteResult.changes} 条 exclude 记录`);

    // 6. 验证
    console.log('[步骤5] 验证迁移结果...');
    
    const excludeCount = excludeDb.prepare(
        'SELECT COUNT(*) as count FROM excluded_items'
    ).get().count;
    
    const remainingExclude = matchingDb.prepare(
        "SELECT COUNT(*) as count FROM matching_rules WHERE action = 'exclude'"
    ).get().count;

    console.log(`[INFO] exclude.db 现有 ${excludeCount} 条排除记录`);
    console.log(`[INFO] matching.db 剩余 ${remainingExclude} 条 exclude 记录`);

    console.log('');
    console.log('========================================');
    console.log('迁移完成！');
    console.log('========================================');
    console.log(`✓ 迁移了 ${migrated} 条记录到 exclude.db`);
    console.log(`✓ 删除了 ${deleteResult.changes} 条 matching.db 中的 exclude 记录`);
    console.log('');
    console.log('后续步骤：');
    console.log('1. 确保 server.js 中注册了排除库路由');
    console.log('2. 将 exclude-admin.html 部署到 public 目录');
    console.log('3. 重启服务器');

} catch (e) {
    console.error('[ERROR] 迁移失败:', e.message);
    process.exit(1);
} finally {
    matchingDb.close();
    excludeDb.close();
}

function getTypeLabel(type) {
    const labels = {
        'word': '单词',
        'phrase': '短语',
        'pattern': '句型',
        'grammar': '语法'
    };
    return labels[type] || type;
}
