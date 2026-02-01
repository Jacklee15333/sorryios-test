/**
 * 数据库修复脚本
 * 更新 grammar 表的 structure 字段，添加缺失的句型模式
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/grammar.db');
const db = new sqlite3.Database(dbPath);

console.log('\n' + '='.repeat(80));
console.log('🔧 数据库修复脚本');
console.log('='.repeat(80) + '\n');

// 修复 "it的用法"
console.log('1. 修复 "it的用法" 的 structure 字段\n');

db.get('SELECT id, structure FROM grammar WHERE title = "it的用法"', (err, row) => {
    if (err) {
        console.error('❌ 查询错误:', err);
        return;
    }
    
    if (!row) {
        console.log('❌ 未找到 "it的用法" 记录');
        return;
    }
    
    console.log(`当前 structure: ${row.structure}\n`);
    
    // 新的完整 structure
    const newStructure = 'It + be + adj. + to do / It + be + adj. + for sb. + to do / It + be + adj. + that从句';
    
    console.log(`更新为: ${newStructure}\n`);
    
    db.run(
        'UPDATE grammar SET structure = ? WHERE id = ?',
        [newStructure, row.id],
        function(err2) {
            if (err2) {
                console.error('❌ 更新失败:', err2);
            } else {
                console.log(`✅ 更新成功！影响 ${this.changes} 条记录\n`);
            }
            
            // 验证更新
            db.get('SELECT structure FROM grammar WHERE id = ?', [row.id], (err3, row2) => {
                if (!err3 && row2) {
                    console.log('验证新值:');
                    console.log(`  ${row2.structure}\n`);
                }
            });
        }
    );
});

// 修复 "say/tell/speak/talk辨析"
console.log('2. 修复 "say/tell/speak/talk辨析" 的 structure 字段\n');

db.get('SELECT id, structure FROM grammar WHERE title LIKE "%say%tell%"', (err, row) => {
    if (err) {
        console.error('❌ 查询错误:', err);
        return;
    }
    
    if (!row) {
        console.log('❌ 未找到记录');
        return;
    }
    
    console.log(`当前 structure: ${row.structure}\n`);
    
    // 新的完整 structure
    const newStructure = 'say sth. / tell sb. sth. / tell sb. to do sth. / speak + 语言 / talk to/with sb. about sth.';
    
    console.log(`更新为: ${newStructure}\n`);
    
    db.run(
        'UPDATE grammar SET structure = ? WHERE id = ?',
        [newStructure, row.id],
        function(err2) {
            if (err2) {
                console.error('❌ 更新失败:', err2);
            } else {
                console.log(`✅ 更新成功！影响 ${this.changes} 条记录\n`);
            }
            
            // 验证更新
            db.get('SELECT structure FROM grammar WHERE id = ?', [row.id], (err3, row2) => {
                if (!err3 && row2) {
                    console.log('验证新值:');
                    console.log(`  ${row2.structure}\n`);
                    
                    // 关闭数据库
                    setTimeout(() => {
                        console.log('='.repeat(80));
                        console.log('✅ 修复完成！');
                        console.log('='.repeat(80) + '\n');
                        console.log('请重新运行测试: node test-matching-fix.js\n');
                        db.close();
                    }, 500);
                }
            });
        }
    );
});