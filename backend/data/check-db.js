/**
 * 数据库内容检查脚本
 * 检查 grammar.db 中相关记录的 structure 和 usage 字段
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'grammar.db');
const db = new sqlite3.Database(dbPath);

console.log('\n' + '='.repeat(80));
console.log('📊 语法库数据检查');
console.log('='.repeat(80) + '\n');

// 检查 "it的用法"
console.log('1. 检查 "it的用法" 记录：\n');
db.get('SELECT id, title, structure, usage FROM grammar WHERE title LIKE "%it的用法%"', (err, row) => {
    if (err) {
        console.error('❌ 查询错误:', err);
    } else if (row) {
        console.log(`ID: ${row.id}`);
        console.log(`Title: ${row.title}`);
        console.log(`Structure: ${row.structure || '(空)'}`);
        console.log(`Usage: ${row.usage ? row.usage.substring(0, 200) + '...' : '(空)'}`);
        
        // 分析 structure
        if (row.structure) {
            console.log('\nStructure 字段分析：');
            const structures = row.structure.split(/[/|;、]/).map(s => s.trim()).filter(Boolean);
            structures.forEach((s, i) => {
                console.log(`  ${i+1}. "${s}"`);
            });
            
            // 检查是否包含我们需要的模式
            const hasPattern1 = structures.some(s => /adj.*for\s+sb/i.test(s));
            const hasPattern2 = structures.some(s => /adj.*to\s+do/i.test(s));
            
            console.log('\n关键模式检查：');
            console.log(`  ${hasPattern1 ? '✅' : '❌'} 包含 "adj. ... for sb" 模式`);
            console.log(`  ${hasPattern2 ? '✅' : '❌'} 包含 "adj. ... to do" 模式`);
        } else {
            console.log('\n⚠️  structure 字段为空！');
        }
    } else {
        console.log('❌ 未找到 "it的用法" 记录');
    }
    
    console.log('\n' + '-'.repeat(80) + '\n');
    
    // 检查 "say/tell/speak/talk辨析"
    console.log('2. 检查 "say/tell/speak/talk辨析" 记录：\n');
    db.get('SELECT id, title, structure, usage FROM grammar WHERE title LIKE "%say/tell%"', (err2, row2) => {
        if (err2) {
            console.error('❌ 查询错误:', err2);
        } else if (row2) {
            console.log(`ID: ${row2.id}`);
            console.log(`Title: ${row2.title}`);
            console.log(`Structure: ${row2.structure || '(空)'}`);
            console.log(`Usage: ${row2.usage ? row2.usage.substring(0, 200) + '...' : '(空)'}`);
            
            // 分析 structure
            if (row2.structure) {
                console.log('\nStructure 字段分析：');
                const structures = row2.structure.split(/[/|;、]/).map(s => s.trim()).filter(Boolean);
                structures.forEach((s, i) => {
                    console.log(`  ${i+1}. "${s}"`);
                });
            }
            
            // 分析 usage
            if (row2.usage) {
                console.log('\nUsage 字段分析：');
                try {
                    const usageArray = JSON.parse(row2.usage);
                    usageArray.forEach((u, i) => {
                        if (i < 3) { // 只显示前3个
                            console.log(`  ${i+1}. "${u.substring(0, 100)}..."`);
                        }
                    });
                } catch (e) {
                    console.log(`  (非JSON格式): "${row2.usage.substring(0, 100)}..."`);
                }
            }
        } else {
            console.log('❌ 未找到 "say/tell/speak/talk辨析" 记录');
        }
        
        console.log('\n' + '='.repeat(80) + '\n');
        db.close();
    });
});
