/**
 * 数据迁移脚本：replace.db → matching.db
 * 
 * 运行方式：
 * node migrate-replace-to-matching.js
 * 
 * 功能：
 * 1. 读取 replace.db 中的替换规则
 * 2. 迁移到 matching.db，action 设为 'replace'
 * 3. target_text 存储替换后的文本
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');

const REPLACE_DB_PATH = path.join(DATA_DIR, 'replace.db');
const MATCHING_DB_PATH = path.join(DATA_DIR, 'matching.db');

console.log('===== 数据迁移：replace.db → matching.db =====\n');

// 检查 replace.db 是否存在
if (!fs.existsSync(REPLACE_DB_PATH)) {
    console.log('❌ replace.db 不存在，无需迁移');
    process.exit(0);
}

// 打开数据库
const replaceDb = new Database(REPLACE_DB_PATH);
const matchingDb = new Database(MATCHING_DB_PATH);

// 确保 matching.db 有 use_count 列
try {
    matchingDb.exec(`ALTER TABLE matching_rules ADD COLUMN use_count INTEGER DEFAULT 0`);
    console.log('✓ 已添加 use_count 列');
} catch (e) {
    // 列已存在
}

// 读取 replace.db 中的规则
const replaceRules = replaceDb.prepare('SELECT * FROM replace_rules').all();
console.log(`📊 replace.db 中共 ${replaceRules.length} 条规则\n`);

if (replaceRules.length === 0) {
    console.log('❌ 没有需要迁移的数据');
    replaceDb.close();
    matchingDb.close();
    process.exit(0);
}

// 迁移数据
let migrated = 0;
let skipped = 0;
let updated = 0;

const insertStmt = matchingDb.prepare(`
    INSERT INTO matching_rules (
        original_text, original_type, action, target_text, notes, use_count, created_at, created_by
    ) VALUES (?, ?, 'replace', ?, ?, ?, ?, ?)
`);

const checkStmt = matchingDb.prepare(`
    SELECT id FROM matching_rules 
    WHERE LOWER(original_text) = LOWER(?) AND LOWER(original_type) = LOWER(?)
`);

const updateStmt = matchingDb.prepare(`
    UPDATE matching_rules SET
        action = 'replace',
        target_text = ?,
        notes = ?,
        use_count = use_count + ?,
        created_at = ?
    WHERE id = ?
`);

for (const rule of replaceRules) {
    const existing = checkStmt.get(rule.original_text, rule.original_type);
    
    if (existing) {
        // 更新现有规则
        updateStmt.run(
            rule.replace_text,
            rule.notes,
            rule.use_count || 0,
            rule.created_at,
            existing.id
        );
        updated++;
        console.log(`  🔄 更新: "${rule.original_text}" → "${rule.replace_text}"`);
    } else {
        // 插入新规则
        insertStmt.run(
            rule.original_text,
            rule.original_type,
            rule.replace_text,
            rule.notes,
            rule.use_count || 0,
            rule.created_at,
            rule.created_by || 'admin'
        );
        migrated++;
        console.log(`  ✅ 迁移: "${rule.original_text}" → "${rule.replace_text}"`);
    }
}

console.log('\n===== 迁移完成 =====');
console.log(`✅ 新增: ${migrated} 条`);
console.log(`🔄 更新: ${updated} 条`);
console.log(`📊 总计: ${migrated + updated} 条`);

// 关闭数据库
replaceDb.close();
matchingDb.close();

console.log('\n💡 建议：迁移完成后可以删除 replace.db 和 replaceService.js');
console.log('   rm data/replace.db');
console.log('   rm services/replaceService.js');
