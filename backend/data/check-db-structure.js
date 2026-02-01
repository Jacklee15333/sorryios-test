/**
 * 数据库结构检查脚本
 * 查找所有数据库和表
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('\n' + '='.repeat(80));
console.log('🔍 数据库结构检查');
console.log('='.repeat(80) + '\n');

// 检查所有 .db 文件
const dbFiles = fs.readdirSync('.').filter(f => f.endsWith('.db'));

console.log('📁 发现的数据库文件：');
dbFiles.forEach(file => console.log(`  - ${file}`));
console.log('');

// 检查每个数据库的表结构
let checkCount = 0;

dbFiles.forEach(dbFile => {
    checkCount++;
    const db = new sqlite3.Database(dbFile);
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 数据库: ${dbFile}`);
    console.log('='.repeat(80));
    
    db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, tables) => {
        if (err) {
            console.error('❌ 错误:', err.message);
        } else {
            console.log(`\n表列表 (共 ${tables.length} 个):`);
            tables.forEach(t => console.log(`  - ${t.name}`));
            
            // 对于每个表，获取列信息
            let tableCount = 0;
            tables.forEach(table => {
                db.all(`PRAGMA table_info(${table.name})`, (err2, columns) => {
                    tableCount++;
                    
                    if (err2) {
                        console.error(`  ❌ 无法读取 ${table.name} 的结构`);
                    } else {
                        console.log(`\n  📋 表: ${table.name}`);
                        console.log(`     列: ${columns.map(c => c.name).join(', ')}`);
                        
                        // 如果表名包含 grammar, it, tell, say 等关键词
                        const isRelevant = /grammar|it|tell|say|pattern/i.test(table.name);
                        if (isRelevant) {
                            // 获取记录数
                            db.get(`SELECT COUNT(*) as count FROM ${table.name}`, (err3, row) => {
                                if (!err3) {
                                    console.log(`     记录数: ${row.count}`);
                                    
                                    // 如果记录数不多，显示几条示例
                                    if (row.count <= 100) {
                                        db.all(`SELECT * FROM ${table.name} LIMIT 3`, (err4, rows) => {
                                            if (!err4 && rows.length > 0) {
                                                console.log(`     示例记录:`);
                                                rows.forEach((r, i) => {
                                                    console.log(`       ${i+1}. ${JSON.stringify(r).substring(0, 100)}...`);
                                                });
                                            }
                                        });
                                    }
                                }
                            });
                        }
                    }
                    
                    // 检查是否是最后一个表
                    if (tableCount === tables.length) {
                        checkCount--;
                        if (checkCount === 0) {
                            console.log('\n' + '='.repeat(80) + '\n');
                            db.close();
                        }
                    }
                });
            });
            
            if (tables.length === 0) {
                checkCount--;
                if (checkCount === 0) {
                    console.log('\n' + '='.repeat(80) + '\n');
                }
                db.close();
            }
        }
    });
});

// 等待所有数据库检查完成
setTimeout(() => {
    console.log('✅ 检查完成\n');
    process.exit(0);
}, 3000);
