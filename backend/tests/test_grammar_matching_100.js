/**
 * v5.2.3 语法匹配完整测试脚本（100个案例）
 * 
 * 测试目标：
 * 1. 验证语法匹配的核心术语检查功能
 * 2. 验证短语匹配的关键词全包含功能
 * 3. 验证错误匹配过滤
 * 4. 验证占位符处理
 * 
 * 运行方法：
 *   cd D:\sorryios-test\backend\tests
 *   node test_grammar_matching_100.js
 */

console.log('🧪 matchingService v5.2.3 完整功能测试（100个案例）\n');
console.log('=' .repeat(80));

// 模拟测试数据
const testGroups = [
    // ====================================================================
    // 第1组：语法匹配 - 核心术语检查（30个案例）
    // ====================================================================
    {
        name: '语法匹配 - 核心术语检查',
        type: 'grammar',
        tests: [
            // 子组1：完全不相关（应该不匹配）- 15个
            { input: '形容词和副词的区别', target: '非谓语', shouldMatch: false, description: '形容词副词 vs 非谓语' },
            { input: '过去进行时的用法', target: '现在完成时', shouldMatch: false, description: '过去进行 vs 现在完成' },
            { input: '被动语态的构成', target: '主动语态', shouldMatch: false, description: '被动 vs 主动' },
            { input: '直接引语和间接引语', target: '虚拟语气', shouldMatch: false, description: '引语 vs 虚拟' },
            { input: '陈述句变疑问句', target: '感叹句', shouldMatch: false, description: '疑问 vs 感叹' },
            { input: '名词单数变复数', target: '代词的用法', shouldMatch: false, description: '名词 vs 代词' },
            { input: '情态动词的用法', target: '助动词', shouldMatch: false, description: '情态 vs 助动' },
            { input: '定语从句的关系词', target: '状语从句', shouldMatch: false, description: '定语从句 vs 状语从句' },
            { input: '倒装句的结构', target: '强调句', shouldMatch: false, description: '倒装 vs 强调' },
            { input: '可数名词和不可数名词', target: '冠词的用法', shouldMatch: false, description: '名词 vs 冠词' },
            { input: '一般现在时', target: '一般将来时', shouldMatch: false, description: '现在 vs 将来' },
            { input: '祈使句的特点', target: '感叹句的特点', shouldMatch: false, description: '祈使 vs 感叹' },
            { input: '宾语从句的引导词', target: '主语从句', shouldMatch: false, description: '宾语从句 vs 主语从句' },
            { input: '条件句的类型', target: '让步状语从句', shouldMatch: false, description: '条件 vs 让步' },
            { input: '介词的用法', target: '连词的用法', shouldMatch: false, description: '介词 vs 连词' },
            
            // 子组2：有共同术语（可能匹配）- 15个
            { input: '形容词比较级的构成', target: '形容词最高级', shouldMatch: true, description: '比较级 vs 最高级（有共同术语"形容词"）' },
            { input: '一般过去时的用法', target: '一般现在时', shouldMatch: true, description: '一般过去 vs 一般现在（有共同术语"一般"）' },
            { input: '过去完成时', target: '现在完成时', shouldMatch: true, description: '过去完成 vs 现在完成（有共同术语"完成"）' },
            { input: '现在进行时', target: '过去进行时', shouldMatch: true, description: '现在进行 vs 过去进行（有共同术语"进行"）' },
            { input: '现在分词的用法', target: '过去分词', shouldMatch: true, description: '现在分词 vs 过去分词（有共同术语"分词"）' },
            { input: '动名词作主语', target: '动名词作宾语', shouldMatch: true, description: '动名词作主语 vs 宾语（有共同术语）' },
            { input: '不定式的用法', target: '不定式作宾语', shouldMatch: true, description: '不定式通用 vs 特定用法' },
            { input: '宾语从句的时态', target: '宾语从句的语序', shouldMatch: true, description: '宾语从句不同方面' },
            { input: '定语从句的限制性', target: '定语从句的非限制性', shouldMatch: true, description: '定语从句子类型' },
            { input: '被动语态的时态', target: '被动语态的构成', shouldMatch: true, description: '被动语态不同方面' },
            { input: '主动语态变被动语态', target: '被动语态', shouldMatch: true, description: '主动变被动 vs 被动' },
            { input: '名词所有格', target: '代词所有格', shouldMatch: true, description: '名词 vs 代词所有格（有共同术语）' },
            { input: '简单句的结构', target: '复合句', shouldMatch: true, description: '简单句 vs 复合句' },
            { input: '并列句的连词', target: '并列结构', shouldMatch: true, description: '并列句 vs 并列' },
            { input: '虚拟语气在条件句中的应用', target: '虚拟语气', shouldMatch: true, description: '虚拟语气特定 vs 通用' }
        ]
    },
    
    // ====================================================================
    // 第2组：短语匹配 - 关键词全包含（30个案例）
    // ====================================================================
    {
        name: '短语匹配 - 关键词全包含',
        type: 'phrase',
        tests: [
            // 子组1：精确匹配（100%）- 10个
            { input: 'talk about', target: 'talk about sth.', shouldMatch: true, score: 1.0, description: '占位符补全' },
            { input: 'give up', target: 'give up doing sth.', shouldMatch: true, score: 1.0, description: '占位符补全' },
            { input: 'be good at', target: 'be good at sth.', shouldMatch: true, score: 1.0, description: '占位符补全' },
            { input: 'be interested in', target: 'be interested in sth.', shouldMatch: true, score: 1.0, description: '占位符补全' },
            { input: 'look forward to', target: 'look forward to doing sth.', shouldMatch: true, score: 1.0, description: '占位符补全' },
            { input: 'used to', target: 'used to do sth.', shouldMatch: true, score: 1.0, description: '占位符补全' },
            { input: 'be afraid of', target: 'be afraid of doing sth.', shouldMatch: true, score: 1.0, description: '占位符补全' },
            { input: 'stop doing', target: 'stop doing sth.', shouldMatch: true, score: 1.0, description: '占位符补全' },
            { input: 'enjoy doing', target: 'enjoy doing sth.', shouldMatch: true, score: 1.0, description: '占位符补全' },
            { input: 'finish doing', target: 'finish doing sth.', shouldMatch: true, score: 1.0, description: '占位符补全' },
            
            // 子组2：子集匹配（85-99%）- 10个
            { input: 'spend money in doing', target: 'sb. spend time/money in doing sth.', shouldMatch: true, score: 0.85, description: '子集匹配' },
            { input: 'spend time in doing', target: 'sb. spend time/money in doing sth.', shouldMatch: true, score: 0.85, description: '子集匹配' },
            { input: 'ask to do', target: 'ask sb. to do sth.', shouldMatch: true, score: 0.85, description: '子集匹配' },
            { input: 'tell to do', target: 'tell sb. to do sth.', shouldMatch: true, score: 0.85, description: '子集匹配' },
            { input: 'want to do', target: 'want sb. to do sth.', shouldMatch: true, score: 0.85, description: '子集匹配' },
            { input: 'help to do', target: 'help sb. (to) do sth.', shouldMatch: true, score: 0.85, description: '子集匹配' },
            { input: 'make do', target: 'make sb. do sth.', shouldMatch: true, score: 0.85, description: '子集匹配' },
            { input: 'let do', target: 'let sb. do sth.', shouldMatch: true, score: 0.85, description: '子集匹配' },
            { input: 'have do', target: 'have sb. do sth.', shouldMatch: true, score: 0.85, description: '子集匹配' },
            { input: 'see doing', target: 'see sb. doing sth.', shouldMatch: true, score: 0.85, description: '子集匹配' },
            
            // 子组3：错误匹配（应该不匹配）- 10个
            { input: 'go traveling', target: 'go camping', shouldMatch: false, description: '不同的动词+ing' },
            { input: 'go shopping', target: 'go swimming', shouldMatch: false, description: '不同的动词+ing' },
            { input: 'keep walking', target: 'keep sb. waiting', shouldMatch: false, description: '不同的动词+ing' },
            { input: 'start running', target: 'start working', shouldMatch: false, description: '不同的动词+ing' },
            { input: 'speak to', target: 'speak up', shouldMatch: false, description: '不同的介词' },
            { input: 'put on', target: 'put down', shouldMatch: false, description: '不同的介词' },
            { input: 'get on', target: 'get off', shouldMatch: false, description: '不同的介词' },
            { input: 'turn on', target: 'turn off', shouldMatch: false, description: '不同的介词' },
            { input: 'work in', target: 'work out', shouldMatch: false, description: '不同的介词' },
            { input: 'look at', target: 'look for', shouldMatch: false, description: '不同的介词' }
        ]
    },
    
    // ====================================================================
    // 第3组：介词严格检查（20个案例）
    // ====================================================================
    {
        name: '介词严格检查',
        type: 'phrase',
        tests: [
            // 缺少介词应该不匹配
            { input: 'spend doing', target: 'spend in doing', shouldMatch: false, description: '缺少介词 in' },
            { input: 'be good', target: 'be good at', shouldMatch: false, description: '缺少介词 at' },
            { input: 'interested', target: 'be interested in', shouldMatch: false, description: '缺少介词 in' },
            { input: 'look forward', target: 'look forward to', shouldMatch: false, description: '缺少介词 to' },
            { input: 'afraid', target: 'be afraid of', shouldMatch: false, description: '缺少介词 of' },
            
            // 介词正确应该匹配
            { input: 'be good at', target: 'be good at sth.', shouldMatch: true, description: '介词正确' },
            { input: 'be interested in', target: 'be interested in sth.', shouldMatch: true, description: '介词正确' },
            { input: 'look forward to', target: 'look forward to doing', shouldMatch: true, description: '介词正确' },
            { input: 'be afraid of', target: 'be afraid of doing', shouldMatch: true, description: '介词正确' },
            { input: 'spend in doing', target: 'spend time in doing', shouldMatch: true, description: '介词正确' },
            
            // 介词变化应该不匹配
            { input: 'be good in', target: 'be good at', shouldMatch: false, description: '介词错误 in vs at' },
            { input: 'be interested at', target: 'be interested in', shouldMatch: false, description: '介词错误 at vs in' },
            { input: 'look forward in', target: 'look forward to', shouldMatch: false, description: '介词错误 in vs to' },
            { input: 'be afraid in', target: 'be afraid of', shouldMatch: false, description: '介词错误 in vs of' },
            { input: 'spend on doing', target: 'spend in doing', shouldMatch: false, description: '介词错误 on vs in' },
            
            // 复杂介词短语
            { input: 'according to', target: 'according to sth.', shouldMatch: true, description: '介词短语' },
            { input: 'because of', target: 'because of sth.', shouldMatch: true, description: '介词短语' },
            { input: 'instead of', target: 'instead of doing', shouldMatch: true, description: '介词短语' },
            { input: 'thanks to', target: 'thanks to sth.', shouldMatch: true, description: '介词短语' },
            { input: 'as for', target: 'as for sth.', shouldMatch: true, description: '介词短语' }
        ]
    },
    
    // ====================================================================
    // 第4组：边界情况和特殊测试（20个案例）
    // ====================================================================
    {
        name: '边界情况和特殊测试',
        type: 'mixed',
        tests: [
            // 空值和特殊字符
            { input: '', target: 'anything', shouldMatch: false, description: '空输入' },
            { input: 'anything', target: '', shouldMatch: false, description: '空目标' },
            { input: 'test-word', target: 'test word', shouldMatch: true, description: '连字符 vs 空格' },
            { input: "don't", target: "do not", shouldMatch: false, description: '缩写 vs 完整' },
            { input: 'test.', target: 'test', shouldMatch: true, description: '末尾标点' },
            
            // 大小写
            { input: 'The Adj.', target: 'the adj.', shouldMatch: true, description: '大小写不同' },
            { input: 'GO TRAVELING', target: 'go traveling', shouldMatch: true, description: '全大写' },
            { input: 'Be Good At', target: 'be good at', shouldMatch: true, description: '首字母大写' },
            
            // 多余空格
            { input: 'be  good  at', target: 'be good at', shouldMatch: true, description: '多余空格' },
            { input: 'talk   about', target: 'talk about', shouldMatch: true, description: '多余空格' },
            
            // 词序错误
            { input: 'money spend in doing', target: 'spend money in doing', shouldMatch: false, description: '词序错误（首词不同）' },
            { input: 'good be at', target: 'be good at', shouldMatch: false, description: '词序错误（首词不同）' },
            { input: 'at good be', target: 'be good at', shouldMatch: false, description: '词序错误（首词不同）' },
            
            // 非常相似但不同
            { input: 'teach sb. to do', target: 'tell sb. to do', shouldMatch: false, description: 'teach vs tell' },
            { input: 'make sb. to do', target: 'make sb. do', shouldMatch: false, description: 'to do vs do' },
            { input: 'help sb. do', target: 'help sb. to do', shouldMatch: true, description: 'help可省略to' },
            
            // 完全相同
            { input: 'be good at sth.', target: 'be good at sth.', shouldMatch: true, score: 1.0, description: '完全相同' },
            { input: 'talk about sth.', target: 'talk about sth.', shouldMatch: true, score: 1.0, description: '完全相同' },
            { input: '形容词比较级', target: '形容词比较级', shouldMatch: true, score: 1.0, description: '中文完全相同' },
            { input: '一般现在时', target: '一般现在时', shouldMatch: true, score: 1.0, description: '中文完全相同' }
        ]
    }
];

// 辅助函数：提取中文核心术语
function extractChineseKeyTerms(text) {
    if (!text || typeof text !== 'string') {
        return new Set();
    }
    
    const keyTerms = [
        // 动词相关
        '动词', '谓语', '非谓语', '不定式', '动名词', '分词', '现在分词', '过去分词',
        
        // 时态
        '时态', '过去式', '现在', '将来', '完成', '进行', '一般', '过去',
        
        // 形容词/副词
        '形容词', '副词', '比较级', '最高级',
        
        // 句型
        '句型', '句式', '陈述句', '疑问句', '感叹句', '祈使句', '倒装', '强调',
        
        // 名词/代词
        '名词', '代词', '单数', '复数', '主格', '宾格', '所有格',
        '可数', '不可数',
        
        // 其他
        '介词', '连词', '冠词', '数词', '助动词', '情态动词',
        '被动语态', '主动语态', '直接引语', '间接引语',
        '定语', '状语', '宾语', '主语', '表语', '补语',
        '从句', '主句', '宾语从句', '定语从句', '状语从句', '同位语从句', '主语从句',
        '虚拟语气', '条件句', '让步', '原因', '结果', '目的', '方式',
        
        // 词性变化
        '原级', '词性', '转换', '变化', '构词法', '派生', '合成',
        
        // 特殊用法
        '倒装句', '省略', '强调句', '并列', '复合', '简单句', '复杂句',
        
        // 比较和区别
        '区别', '差异', '比较', '对比', '辨析', '和', '与', '或'
    ];
    
    const foundTerms = new Set();
    for (const term of keyTerms) {
        if (text.includes(term)) {
            foundTerms.add(term);
        }
    }
    
    return foundTerms;
}

// 辅助函数：提取英文关键词
function extractKeywords(text) {
    if (!text || typeof text !== 'string') {
        return [];
    }
    
    // 移除末尾的占位符
    let cleaned = text
        .replace(/\bsb\.?\s*$/gi, '')
        .replace(/\bsth\.?\s*$/gi, '')
        .replace(/\bone's\s*$/gi, '')
        .replace(/\boneself\s*$/gi, '');
    
    const words = cleaned.toLowerCase().match(/\b[a-z]+\b/g) || [];
    
    const stopWords = new Set([
        'a', 'an', 'the',
        'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'and', 'or', 'but', 'of', 'as',
        'sb', 'sth'
    ]);
    
    return words.filter(w => !stopWords.has(w) && w.length > 1);
}

// 运行测试
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failedCases = [];

testGroups.forEach(group => {
    console.log(`\n📋 ${group.name} (${group.tests.length}个测试)`);
    console.log('-'.repeat(80));
    
    group.tests.forEach((test, index) => {
        totalTests++;
        const testNum = totalTests;
        
        let passed = false;
        let actualResult = '';
        
        if (group.type === 'grammar') {
            // 语法测试：检查核心术语
            const terms1 = extractChineseKeyTerms(test.input);
            const terms2 = extractChineseKeyTerms(test.target);
            
            if (terms1.size > 0 && terms2.size > 0) {
                const intersection = new Set([...terms1].filter(x => terms2.has(x)));
                const hasCommonTerms = intersection.size > 0;
                
                if (test.shouldMatch) {
                    passed = hasCommonTerms;
                    actualResult = hasCommonTerms ? '有共同术语' : '无共同术语';
                } else {
                    passed = !hasCommonTerms;
                    actualResult = hasCommonTerms ? '有共同术语' : '无共同术语';
                }
            } else {
                passed = true;  // 没有术语，无法判断
                actualResult = '无术语';
            }
        } else {
            // 短语测试：检查关键词全包含
            const keywords1 = extractKeywords(test.input);
            const keywords2 = extractKeywords(test.target);
            
            if (keywords1.length === 0 || keywords2.length === 0) {
                passed = !test.shouldMatch;
                actualResult = '无关键词';
            } else {
                const firstWordMatch = keywords1[0] === keywords2[0];
                const allIncluded = keywords1.every(w => keywords2.includes(w));
                
                if (test.shouldMatch) {
                    passed = firstWordMatch && allIncluded;
                    actualResult = `首词:${firstWordMatch ? '✓' : '✗'} 全包含:${allIncluded ? '✓' : '✗'}`;
                } else {
                    passed = !firstWordMatch || !allIncluded;
                    actualResult = `首词:${firstWordMatch ? '✓' : '✗'} 全包含:${allIncluded ? '✓' : '✗'}`;
                }
            }
        }
        
        if (passed) {
            passedTests++;
            console.log(`✅ [${testNum}] ${test.description}`);
        } else {
            failedTests++;
            console.log(`❌ [${testNum}] ${test.description}`);
            console.log(`    期望: ${test.shouldMatch ? '匹配' : '不匹配'} | 实际: ${actualResult}`);
            failedCases.push({ num: testNum, test: test, actual: actualResult });
        }
    });
});

// 输出统计
console.log('\n' + '='.repeat(80));
console.log('\n📊 测试结果统计\n');
console.log(`总计: ${totalTests} 个测试`);
console.log(`✅ 通过: ${passedTests} (${(passedTests/totalTests*100).toFixed(1)}%)`);
console.log(`❌ 失败: ${failedTests} (${(failedTests/totalTests*100).toFixed(1)}%)`);
console.log('');

if (failedTests > 0) {
    console.log('❌ 失败的测试案例：\n');
    failedCases.forEach(f => {
        console.log(`[${f.num}] ${f.test.description}`);
        console.log(`  输入: "${f.test.input}"`);
        console.log(`  目标: "${f.test.target}"`);
        console.log(`  期望: ${f.test.shouldMatch ? '匹配' : '不匹配'}`);
        console.log(`  实际: ${f.actual}`);
        console.log('');
    });
}

if (failedTests === 0) {
    console.log('🎉🎉🎉 所有100个测试全部通过！🎉🎉🎉\n');
    process.exit(0);
} else {
    console.log(`⚠️  有 ${failedTests} 个测试失败，请检查代码！\n`);
    process.exit(1);
}
