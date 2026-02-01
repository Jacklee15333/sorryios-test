/**
 * 手动SQL更新脚本
 * 确保数据库正确更新
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/grammar.db');

console.log('\n' + '='.repeat(80));
console.log('🔧 手动SQL更新脚本');
console.log('='.repeat(80) + '\n');

console.log('⚠️  请先停止服务！');
console.log('⚠️  运行: 在另一个终端按 Ctrl+C 停止服务\n');

setTimeout(() => {
    const db = new sqlite3.Database(dbPath);
    
    // 使用serialize确保顺序执行
    db.serialize(() => {
        // 查询当前值
        db.get("SELECT id, title, structure FROM grammar WHERE title LIKE '%tell%'", (err, row) => {
            if (err) {
                console.error('❌ 查询错误:', err);
                db.close();
                return;
            }
            
            console.log('【修复前】');
            console.log(`Title: ${row.title}`);
            console.log(`Structure: ${row.structure}\n`);
            
            // 执行更新
            const newStructure = 'say sth. / tell sb. sth. / tell sb. to do sth. / speak + 语言 / talk to/with sb. about sth.';
            
            db.run(
                "UPDATE grammar SET structure = ? WHERE title LIKE '%tell%'",
                [newStructure],
                function(err2) {
                    if (err2) {
                        console.error('❌ 更新失败:', err2);
                        db.close();
                        return;
                    }
                    
                    console.log(`✅ 更新成功！影响 ${this.changes} 条记录\n`);
                    
                    // 验证更新
                    db.get("SELECT structure FROM grammar WHERE title LIKE '%tell%'", (err3, row2) => {
                        if (err3) {
                            console.error('❌ 验证失败:', err3);
                        } else {
                            console.log('【修复后】');
                            console.log(`Structure: ${row2.structure}\n`);
                            
                            // 检查是否包含关键句型
                            if (row2.structure.includes('tell sb. to do sth.')) {
                                console.log('✅ 验证成功：包含 "tell sb. to do sth."\n');
                            } else {
                                console.log('❌ 验证失败：不包含 "tell sb. to do sth."\n');
                            }
                        }
                        
                        // 修复 "it的用法"
                        console.log('='.repeat(80));
                        console.log('修复 "it的用法"...\n');
                        
                        db.get("SELECT structure FROM grammar WHERE title = 'it的用法'", (err4, row3) => {
                            if (err4) {
                                console.error('❌ 查询错误:', err4);
                                db.close();
                                return;
                            }
                            
                            console.log('【修复前】');
                            console.log(`Structure: ${row3.structure}\n`);
                            
                            const newStructure2 = 'It + be + adj. + to do / It + be + adj. + for sb. + to do / It + be + adj. + that从句';
                            
                            db.run(
                                "UPDATE grammar SET structure = ? WHERE title = 'it的用法'",
                                [newStructure2],
                                function(err5) {
                                    if (err5) {
                                        console.error('❌ 更新失败:', err5);
                                    } else {
                                        console.log(`✅ 更新成功！影响 ${this.changes} 条记录\n`);
                                        
                                        // 验证
                                        db.get("SELECT structure FROM grammar WHERE title = 'it的用法'", (err6, row4) => {
                                            if (!err6) {
                                                console.log('【修复后】');
                                                console.log(`Structure: ${row4.structure}\n`);
                                                
                                                if (row4.structure.includes('for sb. + to do')) {
                                                    console.log('✅ 验证成功：包含 "for sb. + to do"\n');
                                                } else {
                                                    console.log('❌ 验证失败：不包含 "for sb. + to do"\n');
                                                }
                                            }
                                            
                                            console.log('='.repeat(80));
                                            console.log('✅ 所有更新完成！');
                                            console.log('='.repeat(80) + '\n');
                                            console.log('下一步：');
                                            console.log('1. 重启服务: cd D:\\sorryios-test && update.bat');
                                            console.log('2. 运行测试: cd backend\\services && node test-matching-fix.js\n');
                                            
                                            db.close();
                                        });
                                    }
                                }
                            );
                        });
                    });
                }
            );
        });
    });
}, 1000);
