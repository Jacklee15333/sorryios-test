/**
 * 数据库清洗脚本 v1.0
 * 用于批量清洗已有的短语和句型数据
 * 
 * 运行方式：node backend/scripts/cleanDatabase.js
 * 
 * 功能：
 * 1. 备份原数据库
 * 2. 清洗 vocabulary.db 中的短语和句型
 * 3. 清洗 processing_logs.db 中的AI生成内容
 * 4. 显示清洗前后对比
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// 引入文本清洗工具
const { getTextCleaner } = require('../services/textCleaner');
const textCleaner = getTextCleaner();

// 数据库路径
const DATA_DIR = path.join(__dirname, '../data');
const VOCAB_DB = path.join(DATA_DIR, 'vocabulary.db');
const LOGS_DB = path.join(DATA_DIR, 'processing_logs.db');

/**
 * 备份数据库
 */
function backupDatabase(dbPath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupPath = `${dbPath}.backup_${timestamp}`;
    fs.copyFileSync(dbPath, backupPath);
    console.log(`✅ 备份完成: ${backupPath}`);
    return backupPath;
}

/**
 * 清洗 vocabulary.db
 */
function cleanVocabularyDb() {
    console.log('\n' + '='.repeat(60));
    console.log('清洗 vocabulary.db');
    console.log('='.repeat(60));
    
    if (!fs.existsSync(VOCAB_DB)) {
        console.log('⚠️  数据库文件不存在，跳过');
        return;
    }
    
    // 备份
    const backupPath = backupDatabase(VOCAB_DB);
    
    const db = new Database(VOCAB_DB);
    
    try {
        // 统计信息
        const stats = {
            phrases: { total: 0, cleaned: 0 },
            patterns: { total: 0, cleaned: 0 }
        };
        
        // 清洗短语
        console.log('\n📌 清洗短语表...');
        const phrases = db.prepare('SELECT id, phrase, meaning, example FROM phrases').all();
        stats.phrases.total = phrases.length;
        
        const updatePhrase = db.prepare(`
            UPDATE phrases 
            SET phrase = ?, meaning = ?, example = ? 
            WHERE id = ?
        `);
        
        let phraseSamples = [];
        for (const row of phrases) {
            const cleaned = textCleaner.cleanPhrase(row);
            
            // 检查是否有变化
            if (cleaned.phrase !== row.phrase || 
                cleaned.meaning !== row.meaning || 
                cleaned.example !== row.example) {
                
                updatePhrase.run(cleaned.phrase, cleaned.meaning, cleaned.example, row.id);
                stats.phrases.cleaned++;
                
                // 记录前3个示例
                if (phraseSamples.length < 3) {
                    phraseSamples.push({
                        before: row.phrase,
                        after: cleaned.phrase
                    });
                }
            }
        }
        
        console.log(`✅ 短语清洗完成: ${stats.phrases.cleaned}/${stats.phrases.total} 项被清洗`);
        
        // 显示示例
        if (phraseSamples.length > 0) {
            console.log('\n📝 清洗示例：');
            phraseSamples.forEach((sample, i) => {
                console.log(`  ${i + 1}. 原文: "${sample.before}"`);
                console.log(`     清洗: "${sample.after}"`);
            });
        }
        
        // 清洗句型
        console.log('\n📌 清洗句型表...');
        const patterns = db.prepare('SELECT id, pattern, meaning, example FROM patterns').all();
        stats.patterns.total = patterns.length;
        
        const updatePattern = db.prepare(`
            UPDATE patterns 
            SET pattern = ?, meaning = ?, example = ? 
            WHERE id = ?
        `);
        
        let patternSamples = [];
        for (const row of patterns) {
            const cleaned = textCleaner.cleanPattern(row);
            
            // 检查是否有变化
            if (cleaned.pattern !== row.pattern || 
                cleaned.meaning !== row.meaning || 
                cleaned.example !== row.example) {
                
                updatePattern.run(cleaned.pattern, cleaned.meaning, cleaned.example, row.id);
                stats.patterns.cleaned++;
                
                // 记录前3个示例
                if (patternSamples.length < 3) {
                    patternSamples.push({
                        before: row.pattern,
                        after: cleaned.pattern
                    });
                }
            }
        }
        
        console.log(`✅ 句型清洗完成: ${stats.patterns.cleaned}/${stats.patterns.total} 项被清洗`);
        
        // 显示示例
        if (patternSamples.length > 0) {
            console.log('\n📝 清洗示例：');
            patternSamples.forEach((sample, i) => {
                console.log(`  ${i + 1}. 原文: "${sample.before}"`);
                console.log(`     清洗: "${sample.after}"`);
            });
        }
        
        // 总结
        console.log('\n' + '─'.repeat(60));
        console.log('📊 vocabulary.db 清洗总结');
        console.log('─'.repeat(60));
        console.log(`短语: ${stats.phrases.cleaned}/${stats.phrases.total} 项被清洗`);
        console.log(`句型: ${stats.patterns.cleaned}/${stats.patterns.total} 项被清洗`);
        console.log(`备份: ${backupPath}`);
        
    } catch (error) {
        console.error('❌ 清洗失败:', error.message);
        console.log('⚠️  可以使用备份文件恢复:', backupPath);
        throw error;
    } finally {
        db.close();
    }
}

/**
 * 清洗 processing_logs.db
 */
function cleanProcessingLogsDb() {
    console.log('\n' + '='.repeat(60));
    console.log('清洗 processing_logs.db');
    console.log('='.repeat(60));
    
    if (!fs.existsSync(LOGS_DB)) {
        console.log('⚠️  数据库文件不存在，跳过');
        return;
    }
    
    // 备份
    const backupPath = backupDatabase(LOGS_DB);
    
    const db = new Database(LOGS_DB);
    
    try {
        // 统计信息
        let cleanedCount = 0;
        
        console.log('\n📌 清洗 AI 生成内容...');
        
        // 获取所有带 ai_content 的记录
        const logs = db.prepare(`
            SELECT id, item_type, item_text, ai_content 
            FROM processing_logs 
            WHERE ai_content IS NOT NULL AND ai_content != ''
        `).all();
        
        console.log(`找到 ${logs.length} 条 AI 生成记录`);
        
        const updateLog = db.prepare(`
            UPDATE processing_logs 
            SET ai_content = ? 
            WHERE id = ?
        `);
        
        for (const row of logs) {
            try {
                const aiContent = JSON.parse(row.ai_content);
                let cleaned = null;
                let hasChange = false;
                
                // 根据类型清洗
                if (row.item_type === 'phrase' && aiContent.phrase) {
                    cleaned = textCleaner.cleanPhrase(aiContent);
                    hasChange = JSON.stringify(cleaned) !== JSON.stringify(aiContent);
                } else if (row.item_type === 'pattern' && aiContent.pattern) {
                    cleaned = textCleaner.cleanPattern(aiContent);
                    hasChange = JSON.stringify(cleaned) !== JSON.stringify(aiContent);
                } else if (row.item_type === 'grammar' && aiContent.title) {
                    cleaned = textCleaner.cleanGrammar(aiContent);
                    hasChange = JSON.stringify(cleaned) !== JSON.stringify(aiContent);
                }
                
                if (hasChange && cleaned) {
                    updateLog.run(JSON.stringify(cleaned), row.id);
                    cleanedCount++;
                }
            } catch (e) {
                console.warn(`⚠️  跳过记录 ${row.id}: ${e.message}`);
            }
        }
        
        console.log(`✅ AI内容清洗完成: ${cleanedCount}/${logs.length} 项被清洗`);
        
        // 总结
        console.log('\n' + '─'.repeat(60));
        console.log('📊 processing_logs.db 清洗总结');
        console.log('─'.repeat(60));
        console.log(`AI记录: ${cleanedCount}/${logs.length} 项被清洗`);
        console.log(`备份: ${backupPath}`);
        
    } catch (error) {
        console.error('❌ 清洗失败:', error.message);
        console.log('⚠️  可以使用备份文件恢复:', backupPath);
        throw error;
    } finally {
        db.close();
    }
}

/**
 * 主函数
 */
async function main() {
    console.log('\n' + '█'.repeat(60));
    console.log('███ 数据库清洗工具 v1.0');
    console.log('█'.repeat(60));
    console.log('\n此脚本将清洗数据库中的短语和句型，去除加号并统一格式。');
    console.log('原数据库文件会自动备份。\n');
    
    // 检查数据库是否存在
    const dbExists = {
        vocab: fs.existsSync(VOCAB_DB),
        logs: fs.existsSync(LOGS_DB)
    };
    
    if (!dbExists.vocab && !dbExists.logs) {
        console.log('❌ 未找到任何数据库文件');
        console.log(`   请确认数据目录: ${DATA_DIR}`);
        process.exit(1);
    }
    
    console.log('📂 数据库检查：');
    console.log(`   vocabulary.db: ${dbExists.vocab ? '✓ 存在' : '✗ 不存在'}`);
    console.log(`   processing_logs.db: ${dbExists.logs ? '✓ 存在' : '✗ 不存在'}`);
    
    // 询问确认
    console.log('\n⚠️  警告: 此操作将修改数据库，请确认已备份重要数据！');
    console.log('按 Ctrl+C 取消，按 Enter 继续...\n');
    
    // 等待用户确认（如果是交互式运行）
    if (process.stdin.isTTY) {
        await new Promise(resolve => {
            process.stdin.once('data', resolve);
        });
    }
    
    try {
        // 清洗 vocabulary.db
        if (dbExists.vocab) {
            cleanVocabularyDb();
        }
        
        // 清洗 processing_logs.db
        if (dbExists.logs) {
            cleanProcessingLogsDb();
        }
        
        console.log('\n' + '█'.repeat(60));
        console.log('🎉 数据库清洗完成！');
        console.log('█'.repeat(60));
        console.log('\n提示：');
        console.log('1. 所有备份文件保存在原数据库目录');
        console.log('2. 如需回滚，删除新文件并重命名备份文件');
        console.log('3. 重启服务以应用更改\n');
        
    } catch (error) {
        console.error('\n❌ 清洗过程中出现错误:', error.message);
        console.error('请查看备份文件并手动恢复数据库');
        process.exit(1);
    }
}

// 运行主函数
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    cleanVocabularyDb,
    cleanProcessingLogsDb
};
