/**
 * 检查并清理词库中的重复数据
 * 运行方式: node check-duplicates.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'vocabulary.db');
const db = new Database(dbPath);

console.log('🔍 检查词库重复数据...\n');

// 检查重复的单词
const dupWords = db.prepare(`
    SELECT word, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
    FROM words 
    GROUP BY word 
    HAVING cnt > 1
`).all();

if (dupWords.length > 0) {
    console.log(`⚠️ 发现 ${dupWords.length} 组重复的单词:`);
    dupWords.forEach(d => {
        console.log(`   "${d.word}" 重复 ${d.cnt} 次, ID: ${d.ids}`);
    });
    console.log('');
} else {
    console.log('✅ 单词表没有重复数据\n');
}

// 检查重复的短语
const dupPhrases = db.prepare(`
    SELECT phrase, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
    FROM phrases 
    GROUP BY phrase 
    HAVING cnt > 1
`).all();

if (dupPhrases.length > 0) {
    console.log(`⚠️ 发现 ${dupPhrases.length} 组重复的短语:`);
    dupPhrases.forEach(d => {
        console.log(`   "${d.phrase}" 重复 ${d.cnt} 次, ID: ${d.ids}`);
    });
    console.log('');
} else {
    console.log('✅ 短语表没有重复数据\n');
}

// 检查重复的句型
const dupPatterns = db.prepare(`
    SELECT pattern, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
    FROM patterns 
    GROUP BY pattern 
    HAVING cnt > 1
`).all();

if (dupPatterns.length > 0) {
    console.log(`⚠️ 发现 ${dupPatterns.length} 组重复的句型:`);
    dupPatterns.forEach(d => {
        console.log(`   "${d.pattern}" 重复 ${d.cnt} 次, ID: ${d.ids}`);
    });
    console.log('');
} else {
    console.log('✅ 句型表没有重复数据\n');
}

// 如果有重复数据，询问是否清理
const totalDups = dupWords.length + dupPhrases.length + dupPatterns.length;

if (totalDups > 0) {
    console.log('----------------------------------------');
    console.log('💡 如需清理重复数据，请运行: node check-duplicates.js --clean');
    console.log('   清理规则: 保留最早创建的记录，删除后来的重复记录');
    console.log('----------------------------------------\n');
    
    // 如果传入 --clean 参数则执行清理
    if (process.argv.includes('--clean')) {
        console.log('🧹 开始清理重复数据...\n');
        
        let cleaned = { words: 0, phrases: 0, patterns: 0 };
        
        // 清理重复单词（保留id最小的）
        for (const dup of dupWords) {
            const ids = dup.ids.split(',').map(Number).sort((a, b) => a - b);
            const keepId = ids[0];
            const deleteIds = ids.slice(1);
            
            for (const id of deleteIds) {
                db.prepare('DELETE FROM words WHERE id = ?').run(id);
                cleaned.words++;
                console.log(`   删除重复单词: "${dup.word}" (ID: ${id}, 保留ID: ${keepId})`);
            }
        }
        
        // 清理重复短语
        for (const dup of dupPhrases) {
            const ids = dup.ids.split(',').map(Number).sort((a, b) => a - b);
            const keepId = ids[0];
            const deleteIds = ids.slice(1);
            
            for (const id of deleteIds) {
                db.prepare('DELETE FROM phrases WHERE id = ?').run(id);
                cleaned.phrases++;
                console.log(`   删除重复短语: "${dup.phrase}" (ID: ${id}, 保留ID: ${keepId})`);
            }
        }
        
        // 清理重复句型
        for (const dup of dupPatterns) {
            const ids = dup.ids.split(',').map(Number).sort((a, b) => a - b);
            const keepId = ids[0];
            const deleteIds = ids.slice(1);
            
            for (const id of deleteIds) {
                db.prepare('DELETE FROM patterns WHERE id = ?').run(id);
                cleaned.patterns++;
                console.log(`   删除重复句型: "${dup.pattern}" (ID: ${id}, 保留ID: ${keepId})`);
            }
        }
        
        console.log('\n✅ 清理完成!');
        console.log(`   单词: 删除 ${cleaned.words} 条`);
        console.log(`   短语: 删除 ${cleaned.phrases} 条`);
        console.log(`   句型: 删除 ${cleaned.patterns} 条`);
    }
} else {
    console.log('🎉 数据库没有重复数据，一切正常！');
}

db.close();
