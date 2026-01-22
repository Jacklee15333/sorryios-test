/**
 * 排除库迁移脚本 v1.0
 * 将 exclude.db 的数据迁移到 matching.db
 * 
 * 使用方法：
 * 1. 将此文件放到 backend/ 目录
 * 2. 运行: node migrate-exclude-to-matching.js
 * 
 * 迁移逻辑：
 * - exclude.db 中的记录 → matching.db 的 matching_rules 表
 * - target_text 设为空（表示跳过）
 * - action 设为 'exclude'（方便识别来源）
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 数据库路径（根据你的实际路径调整）
const EXCLUDE_DB_PATH = path.join(__dirname, 'data/exclude.db');
const MATCHING_DB_PATH = path.join(__dirname, 'data/matching.db');

function migrate() {
    console.log('===========================================');
    console.log('排除库迁移脚本 v1.0');
    console.log('===========================================\n');

    // 检查文件是否存在
    if (!fs.existsSync(EXCLUDE_DB_PATH)) {
        console.log(`❌ 排除库不存在: ${EXCLUDE_DB_PATH}`);
        console.log('如果排除库在其他位置，请修改脚本中的路径');
        return;
    }

    if (!fs.existsSync(MATCHING_DB_PATH)) {
        console.log(`❌ 替换库不存在: ${MATCHING_DB_PATH}`);
        return;
    }

    // 打开数据库
    const excludeDb = new Database(EXCLUDE_DB_PATH);
    const matchingDb = new Database(MATCHING_DB_PATH);

    try {
        // 读取排除库数据
        const excludeItems = excludeDb.prepare('SELECT * FROM excluded_items').all();
        console.log(`📖 读取排除库: ${excludeItems.length} 条记录\n`);

        if (excludeItems.length === 0) {
            console.log('✅ 排除库为空，无需迁移');
            return;
        }

        // 准备插入语句
        const insertStmt = matchingDb.prepare(`
            INSERT INTO matching_rules (
                original_text, original_type, action, 
                target_text, notes, created_by, created_at
            ) VALUES (?, ?, 'exclude', '', ?, ?, CURRENT_TIMESTAMP)
        `);

        // 检查是否已存在
        const checkStmt = matchingDb.prepare(`
            SELECT id FROM matching_rules 
            WHERE original_text = ? AND original_type = ?
        `);

        let migrated = 0;
        let skipped = 0;

        // 开始事务
        const migrateAll = matchingDb.transaction(() => {
            for (const item of excludeItems) {
                // 检查是否已存在
                const existing = checkStmt.get(item.original_text, item.original_type);
                
                if (existing) {
                    console.log(`⏭️ 跳过(已存在): [${item.original_type}] "${item.original_text}"`);
                    skipped++;
                    continue;
                }

                // 插入新记录
                insertStmt.run(
                    item.original_text,
                    item.original_type,
                    item.reason || '从排除库迁移',
                    item.created_by || 'migration'
                );
                
                console.log(`✅ 迁移成功: [${item.original_type}] "${item.original_text}"`);
                migrated++;
            }
        });

        migrateAll();

        console.log('\n===========================================');
        console.log('迁移完成！');
        console.log(`✅ 成功迁移: ${migrated} 条`);
        console.log(`⏭️ 跳过(已存在): ${skipped} 条`);
        console.log('===========================================\n');

        // 验证
        const totalAfter = matchingDb.prepare('SELECT COUNT(*) as count FROM matching_rules').get();
        const excludeCount = matchingDb.prepare("SELECT COUNT(*) as count FROM matching_rules WHERE action = 'exclude'").get();
        
        console.log('当前替换库统计:');
        console.log(`- 总记录数: ${totalAfter.count}`);
        console.log(`- 排除规则: ${excludeCount.count}`);
        console.log(`- 替换规则: ${totalAfter.count - excludeCount.count}`);

        console.log('\n💡 提示: 迁移完成后，可以考虑:');
        console.log('   1. 备份 exclude.db');
        console.log('   2. 删除或重命名 exclude.db（防止旧代码继续使用）');

    } catch (e) {
        console.error('❌ 迁移失败:', e.message);
    } finally {
        excludeDb.close();
        matchingDb.close();
    }
}

// 运行迁移
migrate();
