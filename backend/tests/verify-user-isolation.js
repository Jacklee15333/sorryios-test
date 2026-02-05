/**
 * 多用户数据隔离验证脚本
 * 文件位置: backend/tests/verify-user-isolation.js
 * 
 * 用途：快速验证用户数据是否完全隔离
 */

const { UserMasteredDB } = require('../services/database');

console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
console.log('║                       多用户数据隔离验证                                        ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
console.log('');

// 获取所有用户的已掌握词汇统计
const allUsers = {};

// 查询数据库获取所有用户ID
const { db } = require('../services/database');
const users = db.prepare(`
  SELECT DISTINCT user_id FROM user_mastered_words ORDER BY user_id
`).all();

console.log(`📊 发现 ${users.length} 个用户的数据`);
console.log('');

// 为每个用户生成统计
users.forEach(({ user_id }) => {
  const stats = UserMasteredDB.getStats(user_id);
  const words = UserMasteredDB.getAll(user_id);
  
  allUsers[user_id] = {
    stats,
    words: words.slice(0, 5), // 只显示前5个
    total: words.length
  };
});

// 显示详细信息
Object.keys(allUsers).forEach(userId => {
  const userData = allUsers[userId];
  
  console.log('─'.repeat(80));
  console.log(`👤 用户ID: ${userId}`);
  console.log('─'.repeat(80));
  
  console.log('📊 统计信息:');
  console.log(`   总计: ${userData.stats.total} 个`);
  console.log(`   - 单词: ${userData.stats.words || 0}`);
  console.log(`   - 短语: ${userData.stats.phrases || 0}`);
  console.log(`   - 句型: ${userData.stats.patterns || 0}`);
  console.log(`   - 语法: ${userData.stats.grammar || 0}`);
  
  if (userData.words.length > 0) {
    console.log('');
    console.log('📝 已掌握词汇示例 (前5个):');
    userData.words.forEach((w, index) => {
      const typeIcon = {
        word: '📘',
        phrase: '📗',
        pattern: '📙',
        grammar: '📕'
      }[w.word_type] || '📖';
      
      console.log(`   ${index + 1}. ${typeIcon} [${w.word_type}] ${w.word}`);
    });
    
    if (userData.total > 5) {
      console.log(`   ... 还有 ${userData.total - 5} 个词汇`);
    }
  }
  
  console.log('');
});

console.log('═'.repeat(80));
console.log('');

// 验证隔离效果
console.log('🔍 验证隔离效果:');
console.log('');

const userIds = Object.keys(allUsers);

if (userIds.length < 2) {
  console.log('⚠️  只有一个用户的数据，无法验证隔离效果');
} else {
  let allIsolated = true;
  
  for (let i = 0; i < userIds.length; i++) {
    for (let j = i + 1; j < userIds.length; j++) {
      const user1 = userIds[i];
      const user2 = userIds[j];
      
      const words1 = new Set(allUsers[user1].words.map(w => w.word));
      const words2 = new Set(allUsers[user2].words.map(w => w.word));
      
      // 检查是否有交集
      const intersection = [...words1].filter(w => words2.has(w));
      
      console.log(`用户${user1} vs 用户${user2}:`);
      
      if (intersection.length > 0) {
        console.log(`  ⚠️  发现 ${intersection.length} 个相同词汇: ${intersection.slice(0, 3).join(', ')}...`);
        console.log(`  📝 说明: 这是正常的，不同用户可以标记相同的词汇`);
      } else {
        console.log(`  ✅ 没有相同词汇`);
      }
      
      // 关键验证：通过API查询
      const user1Data = UserMasteredDB.getAll(parseInt(user1));
      const user2Data = UserMasteredDB.getAll(parseInt(user2));
      
      // 检查user1的数据中是否包含user2的数据
      const hasLeakage = user1Data.some(w1 => 
        user2Data.some(w2 => w1.word === w2.word && w1.created_at === w2.created_at)
      );
      
      if (hasLeakage) {
        console.log(`  ❌ 数据泄露！用户${user1}能看到用户${user2}的数据`);
        allIsolated = false;
      } else {
        console.log(`  ✅ 数据隔离正常`);
      }
      
      console.log('');
    }
  }
  
  console.log('═'.repeat(80));
  console.log('');
  
  if (allIsolated) {
    console.log('✅ 验证结果：所有用户数据完全隔离！');
  } else {
    console.log('❌ 验证结果：发现数据泄露问题！');
  }
}

console.log('');
console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
console.log('║                            验证完成                                           ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
