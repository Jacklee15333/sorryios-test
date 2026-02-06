/**
 * SQL 数据修复脚本 (Node.js 版)
 * 用 better-sqlite3 执行，无需安装 sqlite3 命令行工具
 * 
 * 执行方式: cd D:\sorryios-test\backend && node run-sql-fix.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'matching.db');
console.log(`\n📂 数据库路径: ${dbPath}`);

const db = new Database(dbPath);

// ============================================================
// Bug 2 修复: 9 条错误的 target_text 映射
// ============================================================
const bug2Fixes = [
    { id: 70,  oldText: '形容词/副词最高级', newText: '形容词/副词比较级', targetId: 16 },
    { id: 131, oldText: '状语从句',         newText: '不定式 (to + 动词原形)', targetId: 9 },
    { id: 254, oldText: '构词法',          newText: '非谓语',            targetId: 43 },
    { id: 296, oldText: '形容词/副词最高级', newText: '形容词/副词比较级', targetId: 16 },
    { id: 419, oldText: '非谓语',          newText: '词性判断',           targetId: 35 },
    { id: 422, oldText: '非谓语',          newText: '构词法',            targetId: 85 },
    { id: 427, oldText: '非谓语',          newText: '形容词用法',         targetId: 75 },
    { id: 432, oldText: '非谓语',          newText: '形容词用法',         targetId: 75 },
    { id: 460, oldText: '主语',           newText: '词性判断',           targetId: 35 },
];

// ============================================================
// New Bug B 修复: 3 条 exclude 规则清空 target_text
// ============================================================
const bugBIds = [375, 376, 377];

// 开始事务
const runFixes = db.transaction(() => {
    console.log('\n=== Bug 2 修复: 9 条错误映射 ===');
    const updateStmt = db.prepare(`
        UPDATE matching_rules SET 
            target_text = ?, target_db = 'grammar.db', target_table = 'grammar',
            target_id = ?, notes = ?
        WHERE id = ? AND target_text = ?
    `);

    for (const fix of bug2Fixes) {
        const result = updateStmt.run(
            fix.newText, fix.targetId, `匹配到: ${fix.newText}`,
            fix.id, fix.oldText
        );
        const ok = result.changes === 1;
        console.log(`  ID ${fix.id}: "${fix.oldText}" → "${fix.newText}" ${ok ? '✅' : '❌ 未匹配!'}`);
        if (!ok) throw new Error(`ID ${fix.id} 未找到匹配记录，中止修复`);
    }

    console.log('\n=== Bug B 修复: 3 条排除规则清空 target_text ===');
    const clearStmt = db.prepare(`
        UPDATE matching_rules SET target_text = NULL
        WHERE id = ? AND action = 'exclude' AND target_text IS NOT NULL
    `);

    for (const id of bugBIds) {
        const result = clearStmt.run(id);
        const ok = result.changes === 1;
        console.log(`  ID ${id}: target_text → NULL ${ok ? '✅' : '❌ 未匹配!'}`);
        if (!ok) throw new Error(`ID ${id} 未找到匹配记录，中止修复`);
    }
});

try {
    runFixes();
    console.log('\n✅ 事务已提交');
} catch (e) {
    console.error(`\n❌ 修复失败，已回滚: ${e.message}`);
    db.close();
    process.exit(1);
}

// ============================================================
// 验证
// ============================================================
console.log('\n=== 验证修复结果 ===');

console.log('\nBug 2:');
let allOk = true;
for (const fix of bug2Fixes) {
    const row = db.prepare('SELECT target_text, target_id FROM matching_rules WHERE id = ?').get(fix.id);
    const ok = row && row.target_text === fix.newText && row.target_id === fix.targetId;
    if (!ok) allOk = false;
    console.log(`  ID ${fix.id}: text="${row?.target_text}" id=${row?.target_id} ${ok ? '✅' : '❌'}`);
}

console.log('\nBug B:');
for (const id of bugBIds) {
    const row = db.prepare('SELECT target_text FROM matching_rules WHERE id = ?').get(id);
    const ok = row && row.target_text === null;
    if (!ok) allOk = false;
    console.log(`  ID ${id}: target_text=${row?.target_text === null ? 'NULL' : `"${row?.target_text}"`} ${ok ? '✅' : '❌'}`);
}

console.log(`\n${allOk ? '🎉 所有数据修复验证通过！' : '❌ 有修复未生效，请检查！'}`);
db.close();
