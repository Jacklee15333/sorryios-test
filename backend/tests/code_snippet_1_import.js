// ============================================
// 代码片段1: 引入 PatternValidator（插入位置：约第60-65行之后）
// ============================================
// 在以下代码之后：
//   let matchingService = null;
//   let processingLogService = null;
//   let excludeService = null;
//   try {
//       const { getMatchingService } = require('./matchingService');
//       ...
//   } catch (e) {
//       ...
//   }
//
// 插入以下代码：
// ─────────────────────────────────────────────────────────────

// 句型验证服务 v1.0
let patternValidator = null;
try {
    const { getPatternValidator } = require('./patternValidator');
    patternValidator = getPatternValidator();
    console.log('[AIProcessor] ✓ 句型验证服务已加载');
} catch (e) {
    console.warn('[AIProcessor] ✗ 句型验证服务未加载:', e.message);
}

// ─────────────────────────────────────────────────────────────
