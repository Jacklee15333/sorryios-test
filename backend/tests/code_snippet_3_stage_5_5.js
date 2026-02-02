// ============================================
// 代码片段3: 阶段5.5 句型验证（插入位置：约第1238行之后）
// ============================================
// 找到以下代码：
//   onProgress({ currentStep: '🔧 标准化处理...', progress: 64 });
//   const extractedKeywords = keywordNormalizer.normalize(rawKeywords);
//
//   // ========== 阶段6: 匹配数据库 ==========
//
// 在 `const extractedKeywords = ...` 这行之后，`// ========== 阶段6: 匹配数据库 ==========` 之前
// 插入以下新代码：
// ─────────────────────────────────────────────────────────────

        // ========== 阶段5.5: 句型验证（v1.0新增）==========
        console.log('\n' + '─'.repeat(60)); 
        console.log('📌 阶段5.5: 句型验证'); 
        console.log('─'.repeat(60));
        onProgress({ currentStep: '📌 阶段5.5: 句型验证', progress: 64.5 });
        
        if (patternValidator && extractedKeywords.patterns && extractedKeywords.patterns.length > 0) {
            console.log(`[阶段5.5] 开始验证 ${extractedKeywords.patterns.length} 个句型...`);
            onProgress({ currentStep: `🔍 验证句型: ${extractedKeywords.patterns.length} 个`, progress: 64.5 });
            
            const validationResult = patternValidator.validateBatch(extractedKeywords.patterns);
            
            // 更新extractedKeywords，只保留通过验证的句型
            extractedKeywords.patterns = validationResult.valid;
            
            console.log(`[阶段5.5] ─────────────────────────────────────`);
            console.log(`[阶段5.5] 📊 验证结果:`);
            console.log(`[阶段5.5]   原始句型: ${validationResult.total}`);
            console.log(`[阶段5.5]   ✅ 通过验证: ${validationResult.valid.length}`);
            console.log(`[阶段5.5]   ❌ 被排除: ${validationResult.excluded.length}`);
            
            if (validationResult.excluded.length > 0) {
                console.log(`[阶段5.5] ─────────────────────────────────────`);
                console.log(`[阶段5.5] 🚫 被排除的句型详情:`);
                validationResult.excluded.forEach((item, index) => {
                    console.log(`[阶段5.5]   [${index + 1}] "${item.pattern}"`);
                    console.log(`[阶段5.5]       原因: ${item.reason}`);
                    if (item.matchedRule) {
                        console.log(`[阶段5.5]       规则: ${item.matchedRule}`);
                    }
                });
            }
            
            console.log(`[阶段5.5] ─────────────────────────────────────`);
            
            const validationInfo = `✅ 句型验证完成: ${validationResult.valid.length}/${validationResult.total} 通过`;
            console.log(`[阶段5.5] ${validationInfo}`);
            onProgress({ currentStep: validationInfo, progress: 65 });
        } else {
            if (!patternValidator) {
                console.log(`[阶段5.5] ⚠️ 句型验证服务未启用`);
                onProgress({ currentStep: '⚠️ 句型验证服务未启用', progress: 64.5 });
            } else {
                console.log(`[阶段5.5] ℹ️ 无句型需要验证`);
                onProgress({ currentStep: 'ℹ️ 无句型需要验证', progress: 64.5 });
            }
        }

// ─────────────────────────────────────────────────────────────
// 注意：插入后，原来的 "阶段6: 匹配数据库" 应该紧随其后，不需要修改
// ─────────────────────────────────────────────────────────────
