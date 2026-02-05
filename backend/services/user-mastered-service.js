/**
 * 用户已掌握词汇服务 v5.1
 * 文件位置: backend/services/user-mastered-service.js
 * 
 * 📦 v5.1 更新：修复字段名不匹配问题
 * 
 * 修复内容：
 * - ✅ 使用 content 字段而不是 word/phrase/pattern
 * - ✅ 添加详细的调试日志
 * - ✅ 增强错误处理
 * 
 * 功能：
 * - 记录用户已掌握的词汇
 * - 生成报告时自动过滤已掌握词汇
 */

const { db, UserMasteredDB } = require('./database');

/**
 * 过滤报告数据（移除已掌握的词汇）
 * 
 * @param {Object} reportData - 报告数据
 * @param {Object} reportData.vocabulary - 词汇数据
 * @param {Array} reportData.vocabulary.words - 单词列表
 * @param {Array} reportData.vocabulary.phrases - 短语列表
 * @param {Array} reportData.vocabulary.patterns - 句型列表
 * @param {Array} reportData.grammar - 语法列表
 * @param {Number} userId - 用户ID
 * @returns {Object} 过滤后的报告数据
 */
function filterReportData(reportData, userId) {
    console.log('\n' + '='.repeat(60));
    console.log('[UserMasteredService] 🔍 过滤已掌握词汇');
    console.log('='.repeat(60));
    console.log(`[UserMasteredService] 用户ID: ${userId}`);
    
    if (!userId) {
        console.log('[UserMasteredService] ⚠️  未提供用户ID，跳过过滤');
        console.log('='.repeat(60) + '\n');
        return reportData;
    }

    try {
        // 获取用户已掌握的词汇集合
        const mastered = UserMasteredDB.getMasteredSet(userId);
        
        console.log('[UserMasteredService] 📊 已掌握词汇统计:');
        console.log(`[UserMasteredService]    - words: ${mastered.words.size}`);
        console.log(`[UserMasteredService]    - phrases: ${mastered.phrases.size}`);
        console.log(`[UserMasteredService]    - patterns: ${mastered.patterns.size}`);
        console.log(`[UserMasteredService]    - grammar: ${mastered.grammar.size}`);
        console.log(`[UserMasteredService]    - total: ${mastered.all.size}`);
        
        // 调试：显示前5个已掌握的单词
        if (mastered.words.size > 0) {
            const sampleWords = Array.from(mastered.words).slice(0, 5);
            console.log(`[UserMasteredService] 📝 已掌握单词示例: ${sampleWords.join(', ')}`);
        }
        
        let filteredCount = { words: 0, phrases: 0, patterns: 0, grammar: 0 };

        // ============================================
        // 过滤单词
        // ============================================
        if (reportData.vocabulary && reportData.vocabulary.words) {
            const originalCount = reportData.vocabulary.words.length;
            
            reportData.vocabulary.words = reportData.vocabulary.words.filter(item => {
                // ✅ v5.1 修复：优先使用 content 字段，兼容 word 字段
                const key = (item.content || item.word || '').toLowerCase().trim();
                
                if (!key) {
                    console.log(`[UserMasteredService] ⚠️  单词字段为空:`, item);
                    return true;  // 保留空项，让前端显示错误
                }
                
                const isMastered = mastered.words.has(key) || mastered.all.has(key);
                
                // 调试：显示被过滤的单词
                if (isMastered) {
                    console.log(`[UserMasteredService] 🗑️  过滤单词: "${key}"`);
                }
                
                return !isMastered;
            });
            
            filteredCount.words = originalCount - reportData.vocabulary.words.length;
            
            if (filteredCount.words > 0) {
                console.log(`[UserMasteredService] ✅ 单词过滤: ${originalCount} → ${reportData.vocabulary.words.length} (过滤 ${filteredCount.words} 个)`);
            }
        }

        // ============================================
        // 过滤短语
        // ============================================
        if (reportData.vocabulary && reportData.vocabulary.phrases) {
            const originalCount = reportData.vocabulary.phrases.length;
            
            reportData.vocabulary.phrases = reportData.vocabulary.phrases.filter(item => {
                // ✅ v5.1 修复：优先使用 content 字段，兼容 phrase 字段
                const key = (item.content || item.phrase || '').toLowerCase().trim();
                
                if (!key) {
                    console.log(`[UserMasteredService] ⚠️  短语字段为空:`, item);
                    return true;
                }
                
                const isMastered = mastered.phrases.has(key) || mastered.all.has(key);
                
                if (isMastered) {
                    console.log(`[UserMasteredService] 🗑️  过滤短语: "${key}"`);
                }
                
                return !isMastered;
            });
            
            filteredCount.phrases = originalCount - reportData.vocabulary.phrases.length;
            
            if (filteredCount.phrases > 0) {
                console.log(`[UserMasteredService] ✅ 短语过滤: ${originalCount} → ${reportData.vocabulary.phrases.length} (过滤 ${filteredCount.phrases} 个)`);
            }
        }

        // ============================================
        // 过滤句型
        // ============================================
        if (reportData.vocabulary && reportData.vocabulary.patterns) {
            const originalCount = reportData.vocabulary.patterns.length;
            
            reportData.vocabulary.patterns = reportData.vocabulary.patterns.filter(item => {
                // ✅ v5.1 修复：优先使用 content 字段，兼容 pattern 字段
                const key = (item.content || item.pattern || '').toLowerCase().trim();
                
                if (!key) {
                    console.log(`[UserMasteredService] ⚠️  句型字段为空:`, item);
                    return true;
                }
                
                const isMastered = mastered.patterns.has(key) || mastered.all.has(key);
                
                if (isMastered) {
                    console.log(`[UserMasteredService] 🗑️  过滤句型: "${key}"`);
                }
                
                return !isMastered;
            });
            
            filteredCount.patterns = originalCount - reportData.vocabulary.patterns.length;
            
            if (filteredCount.patterns > 0) {
                console.log(`[UserMasteredService] ✅ 句型过滤: ${originalCount} → ${reportData.vocabulary.patterns.length} (过滤 ${filteredCount.patterns} 个)`);
            }
        }

        // ============================================
        // 过滤语法
        // ============================================
        if (reportData.grammar) {
            const originalCount = reportData.grammar.length;
            
            reportData.grammar = reportData.grammar.filter(item => {
                // ✅ v5.1 修复：优先使用 content 字段，兼容 title 字段
                const key = (item.content || item.title || '').toLowerCase().trim();
                
                if (!key) {
                    console.log(`[UserMasteredService] ⚠️  语法字段为空:`, item);
                    return true;
                }
                
                const isMastered = mastered.grammar.has(key) || mastered.all.has(key);
                
                if (isMastered) {
                    console.log(`[UserMasteredService] 🗑️  过滤语法: "${key}"`);
                }
                
                return !isMastered;
            });
            
            filteredCount.grammar = originalCount - reportData.grammar.length;
            
            if (filteredCount.grammar > 0) {
                console.log(`[UserMasteredService] ✅ 语法过滤: ${originalCount} → ${reportData.grammar.length} (过滤 ${filteredCount.grammar} 个)`);
            }
        }

        // ============================================
        // 汇总统计
        // ============================================
        const totalFiltered = filteredCount.words + filteredCount.phrases + 
                             filteredCount.patterns + filteredCount.grammar;
        
        console.log('[UserMasteredService] ─────────────────────────────────────');
        console.log('[UserMasteredService] 📊 过滤汇总:');
        console.log(`[UserMasteredService]    - 单词: ${filteredCount.words} 个`);
        console.log(`[UserMasteredService]    - 短语: ${filteredCount.phrases} 个`);
        console.log(`[UserMasteredService]    - 句型: ${filteredCount.patterns} 个`);
        console.log(`[UserMasteredService]    - 语法: ${filteredCount.grammar} 个`);
        console.log(`[UserMasteredService]    - 总计: ${totalFiltered} 个`);
        console.log('='.repeat(60));
        console.log('[UserMasteredService] ✅ 过滤完成');
        console.log('='.repeat(60) + '\n');

        return reportData;
        
    } catch (error) {
        console.error('[UserMasteredService] ❌ 过滤失败:', error);
        console.error('[UserMasteredService] 堆栈:', error.stack);
        console.log('='.repeat(60) + '\n');
        
        // 失败时返回原始数据
        return reportData;
    }
}

// 导出主数据库的 UserMasteredDB，保持 API 兼容
module.exports = {
    db,
    UserMasteredDB,
    filterReportData,
    // 兼容旧版本的初始化函数
    initDatabase: () => {
        console.log('[UserMasteredService] v5.1: 使用主数据库，无需单独初始化');
    }
};