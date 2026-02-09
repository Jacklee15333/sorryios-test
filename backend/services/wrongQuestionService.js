/**
 * wrongQuestionService.js - 错题收集数据库服务 v1.0
 * 
 * 功能：
 * - 自动建表（exams, wrong_questions, exam_images）
 * - 试卷 CRUD
 * - 错题 CRUD + 筛选 + 统计
 * - 试卷图片管理
 * 
 * 依赖：复用现有 database.js 的 db 对象（better-sqlite3 同步操作）
 * 
 * @version 1.0
 * @date 2026-02-09
 */

const { db } = require('./database');

// ============================================
// 自动建表（CREATE TABLE IF NOT EXISTS）
// ============================================

function initWrongQuestionTables() {
    console.log('[WrongQuestionService] 开始初始化错题相关表...');

    try {
        // ---- 试卷记录表 ----
        db.exec(`
            CREATE TABLE IF NOT EXISTS exams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT DEFAULT '',
                subject TEXT DEFAULT 'English',
                image_count INTEGER DEFAULT 0,
                total_questions INTEGER DEFAULT 0,
                wrong_count INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                error_message TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
        console.log('[WrongQuestionService] ✅ exams 表已就绪');

        // ---- 错题表（核心） ----
        db.exec(`
            CREATE TABLE IF NOT EXISTS wrong_questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                question_number TEXT DEFAULT '',
                question_type TEXT DEFAULT '',
                question_content TEXT DEFAULT '',
                user_answer TEXT DEFAULT '',
                correct_answer TEXT DEFAULT '',
                knowledge_points TEXT DEFAULT '[]',
                error_analysis TEXT DEFAULT '',
                section TEXT DEFAULT '',
                mastered INTEGER DEFAULT 0,
                mastered_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (exam_id) REFERENCES exams(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
        console.log('[WrongQuestionService] ✅ wrong_questions 表已就绪');

        // ---- 试卷图片存储 ----
        db.exec(`
            CREATE TABLE IF NOT EXISTS exam_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_id INTEGER NOT NULL,
                image_path TEXT NOT NULL,
                image_order INTEGER DEFAULT 0,
                original_name TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (exam_id) REFERENCES exams(id)
            )
        `);
        console.log('[WrongQuestionService] ✅ exam_images 表已就绪');

        // ---- 索引 ----
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_exams_user_id ON exams(user_id);
            CREATE INDEX IF NOT EXISTS idx_exams_status ON exams(status);
            CREATE INDEX IF NOT EXISTS idx_wrong_questions_exam_id ON wrong_questions(exam_id);
            CREATE INDEX IF NOT EXISTS idx_wrong_questions_user_id ON wrong_questions(user_id);
            CREATE INDEX IF NOT EXISTS idx_wrong_questions_mastered ON wrong_questions(mastered);
            CREATE INDEX IF NOT EXISTS idx_wrong_questions_section ON wrong_questions(section);
            CREATE INDEX IF NOT EXISTS idx_exam_images_exam_id ON exam_images(exam_id);
        `);
        console.log('[WrongQuestionService] ✅ 索引已就绪');

        console.log('[WrongQuestionService] ✅ 所有错题相关表初始化完成');
    } catch (error) {
        console.error('[WrongQuestionService] ❌ 建表失败:', error.message);
        console.error('[WrongQuestionService] ❌ 错误堆栈:', error.stack);
        throw error;
    }
}

// ============================================
// 试卷操作（ExamDB）
// ============================================

const ExamDB = {
    /**
     * 创建试卷记录
     */
    create(data) {
        console.log('[WrongQuestionService] 📝 创建试卷记录:', JSON.stringify(data));
        try {
            const stmt = db.prepare(`
                INSERT INTO exams (user_id, title, subject, image_count, status)
                VALUES (?, ?, ?, ?, 'pending')
            `);
            const result = stmt.run(
                data.user_id,
                data.title || '',
                data.subject || 'English',
                data.image_count || 0
            );
            console.log('[WrongQuestionService] ✅ 试卷创建成功, id:', result.lastInsertRowid);
            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            console.error('[WrongQuestionService] ❌ 创建试卷失败:', error.message);
            throw error;
        }
    },

    /**
     * 根据ID获取试卷
     */
    getById(id) {
        console.log('[WrongQuestionService] 🔍 查询试卷, id:', id);
        const row = db.prepare('SELECT * FROM exams WHERE id = ?').get(id);
        if (row) {
            console.log('[WrongQuestionService] ✅ 找到试卷:', row.title, '状态:', row.status);
        } else {
            console.log('[WrongQuestionService] ⚠️ 未找到试卷, id:', id);
        }
        return row || null;
    },

    /**
     * 获取用户的试卷列表
     */
    getByUserId(userId, limit = 50) {
        console.log('[WrongQuestionService] 🔍 查询用户试卷列表, userId:', userId, 'limit:', limit);
        const rows = db.prepare(`
            SELECT * FROM exams WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
        `).all(userId, limit);
        console.log('[WrongQuestionService] ✅ 找到', rows.length, '份试卷');
        return rows;
    },

    /**
     * 更新试卷状态
     */
    updateStatus(id, status, errorMessage = '') {
        console.log('[WrongQuestionService] 🔄 更新试卷状态, id:', id, '→', status);
        try {
            const updates = { status };
            let sql = 'UPDATE exams SET status = ?';
            const params = [status];

            if (errorMessage) {
                sql += ', error_message = ?';
                params.push(errorMessage);
            }

            if (status === 'done' || status === 'failed') {
                sql += ', completed_at = CURRENT_TIMESTAMP';
            }

            sql += ' WHERE id = ?';
            params.push(id);

            const result = db.prepare(sql).run(...params);
            console.log('[WrongQuestionService] ✅ 状态更新成功, changes:', result.changes);
            return result.changes > 0;
        } catch (error) {
            console.error('[WrongQuestionService] ❌ 更新状态失败:', error.message);
            throw error;
        }
    },

    /**
     * 更新试卷统计
     */
    updateStats(id, totalQuestions, wrongCount) {
        console.log('[WrongQuestionService] 📊 更新试卷统计, id:', id, 'total:', totalQuestions, 'wrong:', wrongCount);
        try {
            const result = db.prepare(`
                UPDATE exams SET total_questions = ?, wrong_count = ? WHERE id = ?
            `).run(totalQuestions, wrongCount, id);
            console.log('[WrongQuestionService] ✅ 统计更新成功');
            return result.changes > 0;
        } catch (error) {
            console.error('[WrongQuestionService] ❌ 更新统计失败:', error.message);
            throw error;
        }
    },

    /**
     * 删除试卷（级联删除错题和图片记录）
     */
    delete(id, userId) {
        console.log('[WrongQuestionService] 🗑️ 删除试卷, id:', id, 'userId:', userId);
        try {
            // 先验证归属
            const exam = db.prepare('SELECT * FROM exams WHERE id = ? AND user_id = ?').get(id, userId);
            if (!exam) {
                console.log('[WrongQuestionService] ⚠️ 试卷不存在或不属于该用户');
                return false;
            }

            // 使用事务删除
            const deleteTransaction = db.transaction(() => {
                db.prepare('DELETE FROM wrong_questions WHERE exam_id = ?').run(id);
                db.prepare('DELETE FROM exam_images WHERE exam_id = ?').run(id);
                db.prepare('DELETE FROM exams WHERE id = ?').run(id);
            });
            deleteTransaction();

            console.log('[WrongQuestionService] ✅ 试卷及关联数据删除成功');
            return true;
        } catch (error) {
            console.error('[WrongQuestionService] ❌ 删除试卷失败:', error.message);
            throw error;
        }
    }
};

// ============================================
// 错题操作（WrongQuestionDB）
// ============================================

const WrongQuestionDB = {
    /**
     * 添加单条错题
     */
    add(data) {
        console.log('[WrongQuestionService] 📝 添加错题, exam_id:', data.exam_id, 'question_number:', data.question_number);
        try {
            const stmt = db.prepare(`
                INSERT INTO wrong_questions (
                    exam_id, user_id, question_number, question_type, 
                    question_content, user_answer, correct_answer, 
                    knowledge_points, error_analysis, section
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const result = stmt.run(
                data.exam_id,
                data.user_id,
                data.question_number || '',
                data.question_type || '',
                data.question_content || '',
                data.user_answer || '',
                data.correct_answer || '',
                typeof data.knowledge_points === 'string' ? data.knowledge_points : JSON.stringify(data.knowledge_points || []),
                data.error_analysis || '',
                data.section || ''
            );
            console.log('[WrongQuestionService] ✅ 错题添加成功, id:', result.lastInsertRowid);
            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            console.error('[WrongQuestionService] ❌ 添加错题失败:', error.message);
            throw error;
        }
    },

    /**
     * 批量添加错题（事务）
     */
    addBatch(items) {
        console.log('[WrongQuestionService] 📝 批量添加错题, 数量:', items.length);
        try {
            const insert = db.prepare(`
                INSERT INTO wrong_questions (
                    exam_id, user_id, question_number, question_type,
                    question_content, user_answer, correct_answer,
                    knowledge_points, error_analysis, section
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const insertMany = db.transaction((items) => {
                const ids = [];
                for (const item of items) {
                    const result = insert.run(
                        item.exam_id,
                        item.user_id,
                        item.question_number || '',
                        item.question_type || '',
                        item.question_content || '',
                        item.user_answer || '',
                        item.correct_answer || '',
                        typeof item.knowledge_points === 'string' ? item.knowledge_points : JSON.stringify(item.knowledge_points || []),
                        item.error_analysis || '',
                        item.section || ''
                    );
                    ids.push(result.lastInsertRowid);
                }
                return ids;
            });

            const ids = insertMany(items);
            console.log('[WrongQuestionService] ✅ 批量添加成功, 共', ids.length, '条');
            return { success: true, count: ids.length, ids };
        } catch (error) {
            console.error('[WrongQuestionService] ❌ 批量添加错题失败:', error.message);
            throw error;
        }
    },

    /**
     * 根据ID获取错题
     */
    getById(id) {
        const row = db.prepare('SELECT * FROM wrong_questions WHERE id = ?').get(id);
        if (row) {
            row.knowledge_points = JSON.parse(row.knowledge_points || '[]');
        }
        return row || null;
    },

    /**
     * 获取错题列表（支持筛选）
     */
    getList(userId, filters = {}) {
        console.log('[WrongQuestionService] 🔍 查询错题列表, userId:', userId, 'filters:', JSON.stringify(filters));

        let sql = 'SELECT wq.*, e.title as exam_title FROM wrong_questions wq LEFT JOIN exams e ON wq.exam_id = e.id WHERE wq.user_id = ?';
        const params = [userId];

        // 筛选条件
        if (filters.examId) {
            sql += ' AND wq.exam_id = ?';
            params.push(filters.examId);
        }
        if (filters.section) {
            sql += ' AND wq.section = ?';
            params.push(filters.section);
        }
        if (filters.questionType) {
            sql += ' AND wq.question_type = ?';
            params.push(filters.questionType);
        }
        if (filters.mastered !== undefined && filters.mastered !== null && filters.mastered !== '') {
            sql += ' AND wq.mastered = ?';
            params.push(parseInt(filters.mastered));
        }

        sql += ' ORDER BY wq.created_at DESC';

        if (filters.limit) {
            sql += ' LIMIT ?';
            params.push(parseInt(filters.limit));
            if (filters.offset) {
                sql += ' OFFSET ?';
                params.push(parseInt(filters.offset));
            }
        }

        const rows = db.prepare(sql).all(...params);
        console.log('[WrongQuestionService] ✅ 找到', rows.length, '条错题');

        // 解析 JSON 字段
        return rows.map(row => ({
            ...row,
            knowledge_points: JSON.parse(row.knowledge_points || '[]')
        }));
    },

    /**
     * 获取错题统计
     */
    getStats(userId) {
        console.log('[WrongQuestionService] 📊 查询错题统计, userId:', userId);
        try {
            const total = db.prepare(
                'SELECT COUNT(*) as count FROM wrong_questions WHERE user_id = ?'
            ).get(userId).count;

            const mastered = db.prepare(
                'SELECT COUNT(*) as count FROM wrong_questions WHERE user_id = ? AND mastered = 1'
            ).get(userId).count;

            const thisWeek = db.prepare(`
                SELECT COUNT(*) as count FROM wrong_questions 
                WHERE user_id = ? AND created_at >= date('now', '-7 days')
            `).get(userId).count;

            // 按 section 分组统计
            const bySection = db.prepare(`
                SELECT section, COUNT(*) as count 
                FROM wrong_questions WHERE user_id = ? AND section != ''
                GROUP BY section ORDER BY count DESC
            `).all(userId);

            // 按 questionType 分组统计
            const byType = db.prepare(`
                SELECT question_type, COUNT(*) as count 
                FROM wrong_questions WHERE user_id = ? AND question_type != ''
                GROUP BY question_type ORDER BY count DESC
            `).all(userId);

            const stats = { total, mastered, unmastered: total - mastered, thisWeek, bySection, byType };
            console.log('[WrongQuestionService] ✅ 统计结果:', JSON.stringify({ total, mastered, thisWeek }));
            return stats;
        } catch (error) {
            console.error('[WrongQuestionService] ❌ 统计查询失败:', error.message);
            throw error;
        }
    },

    /**
     * 更新错题
     */
    update(id, userId, data) {
        console.log('[WrongQuestionService] 🔄 更新错题, id:', id);
        try {
            // 验证归属
            const existing = db.prepare('SELECT * FROM wrong_questions WHERE id = ? AND user_id = ?').get(id, userId);
            if (!existing) {
                console.log('[WrongQuestionService] ⚠️ 错题不存在或不属于该用户');
                return false;
            }

            const fields = [];
            const values = [];

            if (data.question_content !== undefined) { fields.push('question_content = ?'); values.push(data.question_content); }
            if (data.user_answer !== undefined) { fields.push('user_answer = ?'); values.push(data.user_answer); }
            if (data.correct_answer !== undefined) { fields.push('correct_answer = ?'); values.push(data.correct_answer); }
            if (data.error_analysis !== undefined) { fields.push('error_analysis = ?'); values.push(data.error_analysis); }
            if (data.knowledge_points !== undefined) {
                fields.push('knowledge_points = ?');
                values.push(typeof data.knowledge_points === 'string' ? data.knowledge_points : JSON.stringify(data.knowledge_points));
            }
            if (data.section !== undefined) { fields.push('section = ?'); values.push(data.section); }
            if (data.question_type !== undefined) { fields.push('question_type = ?'); values.push(data.question_type); }

            if (fields.length === 0) {
                console.log('[WrongQuestionService] ⚠️ 没有需要更新的字段');
                return false;
            }

            values.push(id);
            const sql = `UPDATE wrong_questions SET ${fields.join(', ')} WHERE id = ?`;
            const result = db.prepare(sql).run(...values);
            console.log('[WrongQuestionService] ✅ 更新成功, changes:', result.changes);
            return result.changes > 0;
        } catch (error) {
            console.error('[WrongQuestionService] ❌ 更新错题失败:', error.message);
            throw error;
        }
    },

    /**
     * 标记为已掌握
     */
    markMastered(id, userId) {
        console.log('[WrongQuestionService] ✅ 标记已掌握, id:', id);
        try {
            const result = db.prepare(`
                UPDATE wrong_questions SET mastered = 1, mastered_at = CURRENT_TIMESTAMP 
                WHERE id = ? AND user_id = ?
            `).run(id, userId);
            console.log('[WrongQuestionService] ✅ 标记成功, changes:', result.changes);
            return result.changes > 0;
        } catch (error) {
            console.error('[WrongQuestionService] ❌ 标记已掌握失败:', error.message);
            throw error;
        }
    },

    /**
     * 取消已掌握
     */
    unmarkMastered(id, userId) {
        console.log('[WrongQuestionService] ↩️ 取消已掌握, id:', id);
        try {
            const result = db.prepare(`
                UPDATE wrong_questions SET mastered = 0, mastered_at = NULL 
                WHERE id = ? AND user_id = ?
            `).run(id, userId);
            console.log('[WrongQuestionService] ✅ 取消成功, changes:', result.changes);
            return result.changes > 0;
        } catch (error) {
            console.error('[WrongQuestionService] ❌ 取消已掌握失败:', error.message);
            throw error;
        }
    },

    /**
     * 删除错题
     */
    delete(id, userId) {
        console.log('[WrongQuestionService] 🗑️ 删除错题, id:', id);
        try {
            const result = db.prepare(
                'DELETE FROM wrong_questions WHERE id = ? AND user_id = ?'
            ).run(id, userId);
            console.log('[WrongQuestionService] ✅ 删除成功, changes:', result.changes);
            return result.changes > 0;
        } catch (error) {
            console.error('[WrongQuestionService] ❌ 删除错题失败:', error.message);
            throw error;
        }
    }
};

// ============================================
// 试卷图片操作（ExamImageDB）
// ============================================

const ExamImageDB = {
    /**
     * 添加图片记录
     */
    add(data) {
        console.log('[WrongQuestionService] 🖼️ 添加图片记录, exam_id:', data.exam_id, 'path:', data.image_path);
        try {
            const stmt = db.prepare(`
                INSERT INTO exam_images (exam_id, image_path, image_order, original_name)
                VALUES (?, ?, ?, ?)
            `);
            const result = stmt.run(
                data.exam_id,
                data.image_path,
                data.image_order || 0,
                data.original_name || ''
            );
            console.log('[WrongQuestionService] ✅ 图片记录添加成功, id:', result.lastInsertRowid);
            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            console.error('[WrongQuestionService] ❌ 添加图片记录失败:', error.message);
            throw error;
        }
    },

    /**
     * 获取试卷的所有图片
     */
    getByExamId(examId) {
        console.log('[WrongQuestionService] 🔍 查询试卷图片, exam_id:', examId);
        const rows = db.prepare(
            'SELECT * FROM exam_images WHERE exam_id = ? ORDER BY image_order ASC'
        ).all(examId);
        console.log('[WrongQuestionService] ✅ 找到', rows.length, '张图片');
        return rows;
    },

    /**
     * 删除试卷的所有图片记录
     */
    deleteByExamId(examId) {
        console.log('[WrongQuestionService] 🗑️ 删除试卷图片记录, exam_id:', examId);
        const result = db.prepare('DELETE FROM exam_images WHERE exam_id = ?').run(examId);
        console.log('[WrongQuestionService] ✅ 删除成功, changes:', result.changes);
        return result.changes;
    }
};

// ============================================
// 初始化建表
// ============================================
initWrongQuestionTables();

// ============================================
// 导出
// ============================================
module.exports = {
    ExamDB,
    WrongQuestionDB,
    ExamImageDB,
    initWrongQuestionTables
};
