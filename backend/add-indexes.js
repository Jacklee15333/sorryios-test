/**
 * 多数据库索引优化脚本
 * 运行方式: node add-indexes.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');

console.log('📦 数据库优化脚本 v2.0\n');
console.log('数据目录:', dataDir);
console.log('');

// 各数据库的索引配置
const dbConfigs = {
    'vocabulary.db': [
        // words 表
        'CREATE INDEX IF NOT EXISTS idx_words_word ON words(word)',
        'CREATE INDEX IF NOT EXISTS idx_words_enabled ON words(enabled)',
        'CREATE INDEX IF NOT EXISTS idx_words_is_new ON words(is_new)',
        'CREATE INDEX IF NOT EXISTS idx_words_category ON words(category)',
        // phrases 表
        'CREATE INDEX IF NOT EXISTS idx_phrases_phrase ON phrases(phrase)',
        'CREATE INDEX IF NOT EXISTS idx_phrases_enabled ON phrases(enabled)',
        'CREATE INDEX IF NOT EXISTS idx_phrases_is_new ON phrases(is_new)',
        // patterns 表
        'CREATE INDEX IF NOT EXISTS idx_patterns_pattern ON patterns(pattern)',
        'CREATE INDEX IF NOT EXISTS idx_patterns_enabled ON patterns(enabled)',
    ],
    'grammar.db': [
        'CREATE INDEX IF NOT EXISTS idx_grammar_title ON grammar(title)',
        'CREATE INDEX IF NOT EXISTS idx_grammar_enabled ON grammar(enabled)',
        'CREATE INDEX IF NOT EXISTS idx_grammar_is_new ON grammar(is_new)',
        'CREATE INDEX IF NOT EXISTS idx_grammar_category ON grammar(category)',
    ],
    'matching.db': [
        'CREATE INDEX IF NOT EXISTS idx_matching_dict_original ON matching_dict(original_text)',
        'CREATE INDEX IF NOT EXISTS idx_matching_dict_action ON matching_dict(action)',
        'CREATE INDEX IF NOT EXISTS idx_matching_dict_type ON matching_dict(original_type)',
        'CREATE INDEX IF NOT EXISTS idx_matching_dict_is_new ON matching_dict(is_new)',
    ],
    'replace.db': [
        'CREATE INDEX IF NOT EXISTS idx_replace_rules_original ON replace_rules(original_text)',
        'CREATE INDEX IF NOT EXISTS idx_replace_rules_type ON replace_rules(original_type)',
        'CREATE INDEX IF NOT EXISTS idx_replace_rules_is_new ON replace_rules(is_new)',
    ],
    'exclude.db': [
        'CREATE INDEX IF NOT EXISTS idx_exclude_text ON exclude_items(text)',
        'CREATE INDEX IF NOT EXISTS idx_exclude_type ON exclude_items(type)',
    ],
};

let totalCreated = 0;
let totalSkipped = 0;
let totalFailed = 0;

for (const [dbFile, indexes] of Object.entries(dbConfigs)) {
    const dbPath = path.join(dataDir, dbFile);
    
    if (!fs.existsSync(dbPath)) {
        console.log(`⚠️  ${dbFile} 不存在，跳过`);
        continue;
    }
    
    console.log(`\n🔧 处理 ${dbFile}...`);
    
    try {
        const db = new Database(dbPath);
        
        for (const sql of indexes) {
            const indexName = sql.match(/idx_\w+/)?.[0] || 'unknown';
            try {
                db.exec(sql);
                console.log(`   ✅ ${indexName}`);
                totalCreated++;
            } catch (e) {
                if (e.message.includes('already exists')) {
                    console.log(`   ⏭️  ${indexName} (已存在)`);
                    totalSkipped++;
                } else if (e.message.includes('no such table')) {
                    console.log(`   ⚠️  ${indexName} (表不存在)`);
                    totalFailed++;
                } else {
                    console.log(`   ❌ ${indexName}: ${e.message}`);
                    totalFailed++;
                }
            }
        }
        
        // 优化数据库
        console.log(`   📊 ANALYZE...`);
        db.exec('ANALYZE');
        
        console.log(`   🧹 VACUUM...`);
        db.exec('VACUUM');
        
        db.close();
        console.log(`   ✅ ${dbFile} 优化完成`);
        
    } catch (error) {
        console.error(`   ❌ 处理 ${dbFile} 失败:`, error.message);
    }
}

console.log('\n' + '='.repeat(50));
console.log('✨ 优化完成!');
console.log(`   - 新建索引: ${totalCreated}`);
console.log(`   - 已存在: ${totalSkipped}`);
console.log(`   - 失败: ${totalFailed}`);
console.log('='.repeat(50));
