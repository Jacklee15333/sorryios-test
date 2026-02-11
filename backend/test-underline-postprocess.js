/**
 * test-underline-postprocess.js
 * 
 * 测试脚本：验证完形填空/选词填空 题号下划线后处理逻辑 v1.2
 * 
 * 用法：node test-underline-postprocess.js
 * 
 * 把这个文件放到 D:\sorryios-test\backend\ 下运行
 */

console.log('═'.repeat(60));
console.log('  题号下划线后处理 v1.2 - 测试脚本');
console.log('═'.repeat(60));
console.log('');

// ============================================
// 从 examProcessor.js 抽取的后处理逻辑（v1.2 增强版，与实际代码一致）
// ============================================
function postProcessClozeContent(sectionContent, wrongQuestions) {
    let processedContent = sectionContent || '';
    if (!processedContent) return processedContent;

    // 1. 收集该 section 下的所有题号（v1.2 增强版）
    const allQuestionNumbers = new Set();

    // 来源A: 错题列表中的题号
    (wrongQuestions || []).forEach(q => {
        if (q.questionNumber) allQuestionNumbers.add(String(q.questionNumber).trim());
    });
    console.log(`  📝 题号收集-来源A(错题): [${[...allQuestionNumbers].join(', ')}] (${allQuestionNumbers.size}个)`);

    // 来源B: 从选项行/答案行中提取题号（v1.2 放宽正则）
    const optionLineRegex = /^[✗×]?\s*(\d{1,3})\s*[.):：]\s*(?:[A-E][\s.,)]|（|用户|正确|学生)/gm;
    let optMatch;
    while ((optMatch = optionLineRegex.exec(processedContent)) !== null) {
        allQuestionNumbers.add(optMatch[1]);
    }
    console.log(`  📝 题号收集-来源B(选项行正则): [${[...allQuestionNumbers].join(', ')}] (${allQuestionNumbers.size}个)`);

    // 来源C: 扫描正文中的裸题号（v1.2 新增）
    const bareNumRegex = /(?:^|[\s,;.!?，。；！？"'(（])(\d{1,3})(?=[\s,;.!?，。；！？"'）)"]|$)/gm;
    const candidateNums = new Set();
    const contentLines = processedContent.split('\n');
    for (const cLine of contentLines) {
        const cTrimmed = cLine.trim();
        if (/^[✗×]?\s*\d{1,3}\s*[.):：]\s*(?:[A-E][\s.,)]|（|用户|正确|学生)/.test(cTrimmed)) continue;
        if (/用户答案|正确答案|userAnswer|correctAnswer|Word\s*box/i.test(cTrimmed)) continue;
        let bm;
        while ((bm = bareNumRegex.exec(cLine)) !== null) {
            const n = parseInt(bm[1]);
            if (n >= 1 && n <= 200 && n !== 12 && !/\b\d{4}\b/.test(cLine.substring(Math.max(0, bm.index - 5), bm.index + bm[0].length + 5))) {
                candidateNums.add(String(n));
            }
        }
        bareNumRegex.lastIndex = 0;
    }
    console.log(`  📝 题号收集-来源C(正文裸数字候选): [${[...candidateNums].join(', ')}]`);

    // 来源C 验证
    if (candidateNums.size > 0) {
        const knownNums = [...allQuestionNumbers].map(Number).filter(n => !isNaN(n));
        const candidates = [...candidateNums].map(Number).filter(n => !isNaN(n));

        if (knownNums.length > 0) {
            const minKnown = Math.min(...knownNums);
            const maxKnown = Math.max(...knownNums);
            for (const c of candidates) {
                if (c >= minKnown - 3 && c <= maxKnown + 3) {
                    allQuestionNumbers.add(String(c));
                }
            }
        } else {
            const sorted = candidates.sort((a, b) => a - b);
            if (sorted.length >= 3) {
                const maxGap = Math.max(...sorted.slice(1).map((v, i) => v - sorted[i]));
                if (maxGap <= 2) {
                    console.log(`  📝 来源C验证：${sorted.length}个候选构成连续序列(最大间隔${maxGap})，全部加入`);
                    sorted.forEach(n => allQuestionNumbers.add(String(n)));
                }
            } else if (sorted.length >= 2) {
                if (sorted[1] - sorted[0] <= 2) {
                    sorted.forEach(n => allQuestionNumbers.add(String(n)));
                }
            }
        }
    }

    console.log(`  📝 题号收集-最终结果: [${[...allQuestionNumbers].sort((a,b) => parseInt(a) - parseInt(b)).join(', ')}] (共${allQuestionNumbers.size}个)`);

    if (allQuestionNumbers.size === 0) {
        console.log('  ⚠️ 未检测到任何题号！');
        return processedContent;
    }

    const sortedNums = [...allQuestionNumbers].sort((a, b) => parseInt(b) - parseInt(a));
    const lines = processedContent.split('\n');

    const processedLines = lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        if (/^[✗×]?\s*\d{1,3}\s*[.):：]\s*(?:[A-E][\s.,)]|（|用户|正确|学生)/.test(trimmed)) return line;
        if (/用户答案|正确答案|userAnswer|correctAnswer|Word\s*box/i.test(trimmed)) return line;

        let result = line;
        let changed = false;
        for (const num of sortedNums) {
            if (result.includes(`____${num}____`)) continue;
            const before = result;
            result = result.replace(new RegExp(`(\\s)${num}(\\s)`, 'g'), `$1____${num}____$2`);
            result = result.replace(new RegExp(`(\\s)${num}([.,;!?，。；！？])`, 'g'), `$1____${num}____$2`);
            result = result.replace(new RegExp(`(\\s)${num}$`, 'g'), `$1____${num}____`);
            result = result.replace(new RegExp(`^${num}(\\s)`, ''), `____${num}____$1`);
            if (result !== before) {
                changed = true;
                console.log(`  行${lineIdx + 1}: [替换题号${num}] "${before.trim().substring(0, 60)}" → "${result.trim().substring(0, 60)}"`);
            }
        }
        return result;
    });

    return processedLines.join('\n');
}


// ============================================
// 测试用例
// ============================================

let allPass = true;
function check(desc, pass) {
    const icon = pass ? '✅' : '❌';
    console.log(`  ${icon} ${desc}`);
    if (!pass) allPass = false;
}


// ── 测试1：完形填空（AI返回裸题号）──
console.log('\n' + '─'.repeat(60));
console.log('测试1：完形填空 - AI返回裸题号（你遇到的实际场景 Part II）');
console.log('─'.repeat(60));

const test1_content = `II. Choose the best answer（选择最恰当的答案）（本大题共8题，每题1分，共8分）

Have you ever heard about World Braille Day? It is celebrated 17 January 4th each year to show respect for Louis Braille. He was an inventor who had a great influence on blind people.

Braille became blind 18 he was a child. So his parents sent him to a school where he learned by listening. At the age of 10, he got a chance to learn a special writing system. It consisted of 12 raised dots (点). Different groups of dots stood for different letters. "What 19 amazing idea!" Braille thought. In the following years, he further 20 the system and developed a new one using only six dots, helping the blind read much more easily.

Today, Braille is greatly respected worldwide, for his curiosity and hard work have brought light to the dark world.

17. A. at  B. in  C. on
✗ 18. A. when  B. unless  C. because
19. A. a  B. an  C. /
20. A. studies  B. studied  C. has studied`;

const result1 = postProcessClozeContent(test1_content, [{ questionNumber: '18' }]);
console.log('\n📋 处理后结果:');
console.log('─'.repeat(40));
console.log(result1);
console.log('─'.repeat(40));

console.log('\n✅ 验证:');
check('17 应有下划线', result1.includes('____17____'));
check('18 应有下划线', result1.includes('____18____'));
check('19 应有下划线', result1.includes('____19____'));
check('20 应有下划线', result1.includes('____20____'));
check('选项行 "17. A. at" 不应被修改', result1.includes('17. A. at'));
check('选项行 "✗ 18. A. when" 不应被修改', result1.includes('✗ 18. A. when'));
check('"12 raised dots" 中的 12 不应被改', result1.includes('12 raised dots'));
check('"age of 10" 不应被改', result1.includes('age of 10'));
check('应该是 "celebrated ____17____ January"', result1.includes('celebrated ____17____ January'));


// ── 测试2：选词填空（关键测试！之前失败的场景 Part III）──
console.log('\n' + '─'.repeat(60));
console.log('测试2：选词填空 - 你实际遇到的 Part III 场景（"25: B" 格式）');
console.log('─'.repeat(60));

const test2_content = `Word box: A. belonged B. feelings C. grew D. perfect E. record

Have you thought about starting a diary? It's more than a notebook — it is a quiet friend who listens anytime.

First, it's your private space. It's a place where you can be completely honest with your true 25. You can write about your joys or worries. This is a great way to relax after a busy school day.

It's also a powerful tool for your English studies. You don't need to write 26 articles. Just try writing two or three sentences every day. This daily practice makes using English more natural and builds your confidence.

Furthermore, your diary becomes a personal 27 of your life. Years later, when you look back on your middle school journey, you'll realize it was not only a time of change, but a story of how you 28.

Start small, keep going, and you will discover its magic for yourself!

25: B
26: D
27: E
28: C`;

const result2 = postProcessClozeContent(test2_content, []);  // 注意：零错题！
console.log('\n📋 处理后结果:');
console.log('─'.repeat(40));
console.log(result2);
console.log('─'.repeat(40));

console.log('\n✅ 验证:');
check('25 应有下划线', result2.includes('____25____'));
check('26 应有下划线', result2.includes('____26____'));
check('27 应有下划线', result2.includes('____27____'));
check('28 应有下划线', result2.includes('____28____'));


// ── 测试3：选词填空（带学生作答格式）──
console.log('\n' + '─'.repeat(60));
console.log('测试3：选词填空 - AI返回 "25.（学生作答：B）" 格式');
console.log('─'.repeat(60));

const test3_content = `Word box: A. belonged B. feelings C. grew D. perfect E. record

First, it's your private space. It's a place where you can be completely honest with your true 25. You can write about your joys or worries.

You don't need to write 26 articles. Just try writing two or three sentences every day.

Furthermore, your diary becomes a personal 27 of your life. Years later, you'll realize it was a story of how you 28.

25.（学生作答：B）
26.（学生作答：D）
✗ 27.（学生作答：A，被批改为E）
用户答案: A 正确答案: E
28.（学生作答：C）`;

const result3 = postProcessClozeContent(test3_content, [{ questionNumber: '27' }]);
console.log('\n📋 处理后结果:');
console.log('─'.repeat(40));
console.log(result3);
console.log('─'.repeat(40));

console.log('\n✅ 验证:');
check('25 应有下划线', result3.includes('____25____'));
check('26 应有下划线', result3.includes('____26____'));
check('27 应有下划线', result3.includes('____27____'));
check('28 应有下划线', result3.includes('____28____'));
check('选项行 "25.（学生作答" 不应被修改', result3.includes('25.（学生作答'));
check('选项行 "✗ 27.（学生作答" 不应被修改', result3.includes('✗ 27.（学生作答'));
check('答案行不应被修改', result3.includes('用户答案: A 正确答案: E'));


// ── 测试4：AI已加了下划线（不应重复）──
console.log('\n' + '─'.repeat(60));
console.log('测试4：AI已经加了下划线（不应重复添加）');
console.log('─'.repeat(60));

const test4_content = `It is celebrated ____17____ January 4th each year.
Braille became blind ____18____ he was a child.

17. A. at  B. in  C. on
18. A. when  B. unless  C. because`;

const result4 = postProcessClozeContent(test4_content, [{ questionNumber: '18' }]);
console.log('\n📋 处理后结果:');
console.log(result4);
check('不应出现双重下划线', !result4.includes('________17________') && !result4.includes('________18________'));


// ── 测试5：选词填空极简 "25. B" 格式 ──
console.log('\n' + '─'.repeat(60));
console.log('测试5：选词填空 - "25. B" 极简格式（旧版BUG场景）');
console.log('─'.repeat(60));

const test5_content = `First, you can be honest with your true 25. You can write about your joys.

You don't need to write 26 articles. Just try every day.

Your diary becomes a personal 27 of your life.

It was a story of how you 28.

25. B
26. D
27. E
28. C`;

const result5 = postProcessClozeContent(test5_content, []);
console.log('\n📋 处理后结果:');
console.log('─'.repeat(40));
console.log(result5);
console.log('─'.repeat(40));

console.log('\n✅ 验证:');
check('25 应有下划线', result5.includes('____25____'));
check('26 应有下划线', result5.includes('____26____'));
check('27 应有下划线', result5.includes('____27____'));
check('28 应有下划线', result5.includes('____28____'));


// ═══ 汇总 ═══
console.log('\n' + '═'.repeat(60));
if (allPass) {
    console.log('  🎉 全部 5 组测试通过！修复有效！');
} else {
    console.log('  ❌ 有测试失败，请检查上方输出');
}
console.log('═'.repeat(60));
