/**
 * 用户已掌握词汇服务 v5.0
 * 文件位置: backend/services/user-mastered-service.js
 * 
 * 📦 v5.0 更新：改为使用主数据库 sorryios.db
 * 
 * 功能：
 * - 记录用户已掌握的词汇
 * - 生成报告时自动过滤已掌握词汇
 */

// v5.0: 使用主数据库，不再使用独立的 user_mastered.db
const { db, UserMasteredDB } = require('./database');

/**
 * 过滤报告数据（移除已掌握的词汇）
 */
function filterReportData(reportData, userId) {
    if (!userId) return reportData;

    const mastered = UserMasteredDB.getMasteredSet(userId);
    
    // 过滤词汇
    if (reportData.vocabulary) {
        if (reportData.vocabulary.words) {
            reportData.vocabulary.words = reportData.vocabulary.words.filter(item => {
                const key = (item.word || '').toLowerCase().trim();
                return !mastered.words.has(key) && !mastered.all.has(key);
            });
        }
        if (reportData.vocabulary.phrases) {
            reportData.vocabulary.phrases = reportData.vocabulary.phrases.filter(item => {
                const key = (item.phrase || '').toLowerCase().trim();
                return !mastered.phrases.has(key) && !mastered.all.has(key);
            });
        }
        if (reportData.vocabulary.patterns) {
            reportData.vocabulary.patterns = reportData.vocabulary.patterns.filter(item => {
                const key = (item.pattern || '').toLowerCase().trim();
                return !mastered.patterns.has(key) && !mastered.all.has(key);
            });
        }
    }

    // 过滤语法
    if (reportData.grammar) {
        reportData.grammar = reportData.grammar.filter(item => {
            const key = (item.title || '').toLowerCase().trim();
            return !mastered.grammar.has(key) && !mastered.all.has(key);
        });
    }

    return reportData;
}

// v5.0: 导出主数据库的 UserMasteredDB，保持 API 兼容
module.exports = {
    db,
    UserMasteredDB,
    filterReportData,
    // 兼容旧版本的初始化函数（现在不需要了，database.js 已处理）
    initDatabase: () => {
        console.log('[UserMasteredService] v5.0: 使用主数据库，无需单独初始化');
    }
};
