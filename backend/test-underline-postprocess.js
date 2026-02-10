/**
 * test-underline-postprocess.js
 * 
 * 测试脚本：验证完形填空题号下划线后处理逻辑
 * 
 * 用法：node test-underline-postprocess.js
 * 
 * 把这个文件放到 D:\sorryios-test\backend\ 下运行
 */

console.log('═'.repeat(60));
console.log('  完形填空题号下划线后处理 - 测试脚本');
console.log('═'.repeat(60));
console.log('');

// ============================================
// 从 examProcessor.js 抽取的后处理逻辑（独立版本 v1.2）
// ============================================
function postProcessClozeContent(sectionContent, wrongQuestions) {
    let processedContent = sectionContent || '';
    if (!processedContent) return processedContent;

    // 1. 收集所有题号
    const allQuestionNumbers = new Set();
    (wrongQuestions || []).forEach(q => {
        if (q.questionNumber) allQuestionNumbers.add(String(q.questionNumber).trim());
    });
    // 从选项行中提取题号（支持多种格式）
    const optionLineRegex = /^[✗×]?\s*(\d{1,3})\.\s*(?:[A-D]\.|（|用户)/gm;
    let optMatch;
    while ((optMatch = optionLineRegex.exec(processedContent)) !== null) {
        allQuestionNumbers.add(optMatch[1]);
    }

    console.log(`  题号集合: [${[...allQuestionNumbers].join(', ')}]`);

    if (allQuestionNumbers.size === 0) {
        console.log('  ⚠️ 未检测到任何题号！');
        return processedContent;
    }

    // 从大到小排序处理
    const sortedNums = [...allQuestionNumbers].sort((a, b) => parseInt(b) - parseInt(a));
    const lines = processedContent.split('\n');

    const processedLines = lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        // 跳过选项行
        if (/^[✗×]?\s*\d{1,3}\.\s*(?:[A-D]\.|（|用户|正确)/.test(trimmed)) {
            return line;
        }
        // 跳过答案行
        if (/用户答案|正确答案|userAnswer|correctAnswer/i.test(trimmed)) {
            return line;
        }

        let result = line;
        let changed = false;
        for (const num of sortedNums) {
            if (result.includes(`____${num}____`)) continue;
            const before = result;
            // 模式1: 空格+数字+空格
            result = result.replace(
                new RegExp(`(\\s)${num}(\\s)`, 'g'),
                `$1____${num}____$2`
            );
            // 模式2: 空格+数字+标点
            result = result.replace(
                new RegExp(`(\\s)${num}([.,;!?，。；！？])`, 'g'),
                `$1____${num}____$2`
            );
            // 模式3: 空格+数字+行尾
            result = result.replace(
                new RegExp(`(\\s)${num}$`, 'g'),
                `$1____${num}____`
            );
            // 模式4: 行首裸题号
            result = result.replace(
                new RegExp(`^${num}(\\s)`, ''),
                `____${num}____$1`
            );
            if (result !== before) changed = true;
        }
        if (changed) {
            console.log(`  行${lineIdx + 1}: [已替换] "${line.trim().substring(0, 60)}" → "${result.trim().substring(0, 60)}"`);
        }
        return result;
    });

    return processedLines.join('\n');
}


// ============================================
// 测试用例
// ============================================

// 测试1：AI返回裸题号（你遇到的实际情况）
console.log('\n' + '─'.repeat(60));
console.log('测试1：AI返回裸题号（你遇到的实际场景）');
console.log('─'.repeat(60));

const test1_content = `II. Choose the best answer（选择最恰当的答案）（本大题共8题，每题1分，共8分）

Have you ever heard about World Braille Day? It is celebrated 17 January 4th each year to show respect for Louis Braille. He was an inventor who had a great influence on blind people.

Braille became blind 18 he was a child. So his parents sent him to a school where he learned by listening. At the age of 10, he got a chance to learn a special writing system. It consisted of 12 raised dots (点). Different groups of dots stood for different letters. "What 19 amazing idea!" Braille thought. In the following years, he further 20 the system and developed a new one using only six dots, helping the blind read much more easily.

Today, Braille is greatly respected worldwide, for his curiosity and hard work have brought light to the dark world.

17. A. at  B. in  C. on
✗ 18. A. when  B. unless  C. because
19. A. a  B. an  C. /
20. A. studies  B. studied  C. has studied`;

const test1_wrongQs = [
    { questionNumber: '18' }
];

const result1 = postProcessClozeContent(test1_content, test1_wrongQs);
console.log('\n📋 处理后结果:');
console.log('─'.repeat(40));
console.log(result1);
console.log('─'.repeat(40));

// 验证
const checks1 = [
    { desc: '17 应有下划线', pass: result1.includes('____17____') },
    { desc: '18 应有下划线', pass: result1.includes('____18____') },
    { desc: '19 应有下划线', pass: result1.includes('____19____') },
    { desc: '20 应有下划线', pass: result1.includes('____20____') },
    { desc: '选项行 "17. A. at" 不应被修改', pass: result1.includes('17. A. at') },
    { desc: '选项行 "✗ 18. A. when" 不应被修改', pass: result1.includes('✗ 18. A. when') },
    { desc: '"12 raised dots" 中的 12 不应被改（不是题号）', pass: result1.includes('12 raised dots') },
    { desc: '"10" (age of 10) 不应被改（不是题号）', pass: result1.includes('age of 10') },
    { desc: '不应有 "____ 17 ____"（下划线和数字间不该有空格）', pass: !result1.includes('____ 17') && !result1.includes('17 ____') },
    { desc: '应该是 "celebrated ____17____ January"（紧贴）', pass: result1.includes('celebrated ____17____ January') },
];

console.log('\n✅ 验证结果:');
let allPass = true;
checks1.forEach(c => {
    const icon = c.pass ? '✅' : '❌';
    console.log(`  ${icon} ${c.desc}`);
    if (!c.pass) allPass = false;
});


// 测试2：AI已经按要求加了下划线（不应重复）
console.log('\n' + '─'.repeat(60));
console.log('测试2：AI已经加了下划线（不应重复添加）');
console.log('─'.repeat(60));

const test2_content = `It is celebrated ____17____ January 4th each year.
Braille became blind ____18____ he was a child.

17. A. at  B. in  C. on
18. A. when  B. unless  C. because`;

const result2 = postProcessClozeContent(test2_content, [{ questionNumber: '18' }]);
console.log('\n📋 处理后结果:');
console.log(result2);

const noDoubleUnderline = !result2.includes('________17________') && !result2.includes('________18________');
console.log(`\n  ${noDoubleUnderline ? '✅' : '❌'} 不应出现双重下划线`);
if (!noDoubleUnderline) allPass = false;


// 测试3：选词填空（vocabulary 类型）
console.log('\n' + '─'.repeat(60));
console.log('测试3：选词填空 - 嵌入式题号也需要加下划线');
console.log('─'.repeat(60));

const test3_content = `Word box: A. belonged B. feelings C. grew D. perfect E. record

Have you thought about starting a diary? It's more than a notebook — it is a quiet friend who listens anytime.

First, it's your private space. It's a place where you can be completely honest with your true 25. You can write about your joys or worries.

It's also a powerful tool for your English studies. You don't need to write 26 articles. Just try writing two or three sentences every day.

Furthermore, your diary becomes a personal 27 of your life. Years later, when you look back, you'll realize it was a story of how you 28.

25.（学生作答：B）
26.（学生作答：D）
✗ 27.（学生作答：A，被批改为E）
用户答案: A 正确答案: E
28.（学生作答：C）`;

const test3_wrongQs = [{ questionNumber: '27' }];
const result3 = postProcessClozeContent(test3_content, test3_wrongQs);
console.log('\n📋 处理后结果:');
console.log('─'.repeat(40));
console.log(result3);
console.log('─'.repeat(40));

const checks3 = [
    { desc: '25 应有下划线 ("true ____25____.")', pass: result3.includes('____25____') },
    { desc: '26 应有下划线 ("write ____26____ articles")', pass: result3.includes('____26____') },
    { desc: '27 应有下划线 ("personal ____27____ of")', pass: result3.includes('____27____') },
    { desc: '28 应有下划线 ("you ____28____.")', pass: result3.includes('____28____') },
    { desc: '选项行 "25.（学生作答" 不应被修改', pass: result3.includes('25.（学生作答') },
    { desc: '选项行 "✗ 27.（学生作答" 不应被修改', pass: result3.includes('✗ 27.（学生作答') },
    { desc: '答案行不应被修改', pass: result3.includes('用户答案: A 正确答案: E') },
];

console.log('\n✅ 验证结果:');
checks3.forEach(c => {
    const icon = c.pass ? '✅' : '❌';
    console.log(`  ${icon} ${c.desc}`);
    if (!c.pass) allPass = false;
});


// 汇总
console.log('\n' + '═'.repeat(60));
if (allPass) {
    console.log('  🎉 全部测试通过！');
} else {
    console.log('  ❌ 有测试失败，请检查上方输出');
}
console.log('═'.repeat(60));
