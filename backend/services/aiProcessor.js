/**
 * AI 处理器服务 - 英语课堂专用版 v5.1
 * 
 * 【v5.1 更新】 (2026-02-02)
 * - 新增：句型验证服务（PatternValidator）
 * - 新增：阶段5.5 - 句型验证，过滤普通疑问句
 * - 优化：AI提示词，明确排除普通疑问句（what is, who is等）
 * - 改进：详细的验证日志，便于调试
 * 
 * 【v5.0 更新】 (2026-01-26)
 * - 新增：文本自动清洗功能（去除加号、统一符号）
 * - 新增：textCleaner 服务集成
 * - 优化：短语和句型统一使用 sb., sth. 等通用符号
 * - 优化：自动删除括号内的示例
 * 
 * 【v4.3.8 更新】
 * - 优化：添加正确性检查（Ms→Ms.等）
 * - 优化：转换规则归类到语法（some→any等）
 * 
 * 【v4.3.7 更新】
 * - 优化：进一步加强短语判断规则，排除更多伪短语
 * 
 * 【v4.3.6 更新】
 * - 优化：短语判断规则 - 只提取真正的固定搭配，避免伪短语
 * 
 * 【v4.3.5 更新】
 * - 修复：排除库过滤 - 排除库中的项不再出现在"待完善入库"
 * 
 * 【v4.3.4 更新】
 * - 修复：AI生成内容保存到数据库（待完善入库能看到AI内容）
 * 
 * 【v4.3.3 更新】
 * - 修复：阶段6匹配结果保存到数据库
 * - 新增：matched_items / unmatched_items 记录
 * - 新增：任务统计字段更新
 * 
 * 【v4.3.2 更新】
 * - 添加详细进度日志推送到前端
 * - 每个阶段都推送详细执行信息
 * 
 * @author Sorryios AI Team
 * @version 5.1
 * @date 2026-02-02
 */

const fs = require('fs');
const path = require('path');

const { TextSplitter } = require('../lib/text-splitter');
const { SorryiosAutomation } = require('../lib/sorryios-automation');
const EnglishReportGenerator = require('./english-report-generator');

const taskQueue = require('./taskQueue');

// 处理日志服务
let matchingService = null;
let processingLogService = null;
// [Bug 17 修复] 移除独立的 excludeService，统一使用 matchingDictService（matching.db）
// 原来 excludeService(exclude.db) 和 matchingDictService(matching.db) 双系统不同步
let matchingDictServiceRef = null;
try {
    const { getMatchingService } = require('./matchingService');
    const { getProcessingLogService } = require('./processingLogService');
    const { getMatchingDictService } = require('./matchingDictService');
    matchingService = getMatchingService();
    processingLogService = getProcessingLogService();
    matchingDictServiceRef = getMatchingDictService();
    console.log('[AIProcessor] ✓ 处理日志服务已加载');
    console.log('[AIProcessor] ✓ 排除检查已统一使用 matchingDictService');
} catch (e) {
    console.warn('[AIProcessor] ✗ 处理日志服务未加载:', e.message);
}

// ============================================
// 句型验证服务 v1.0
// ============================================
let patternValidator = null;
try {
    const { getPatternValidator } = require('./patternValidator');
    patternValidator = getPatternValidator();
    console.log('[AIProcessor] ✓ 句型验证服务已加载');
} catch (e) {
    console.warn('[AIProcessor] ✗ 句型验证服务未加载:', e.message);
}

// ============================================
// 文本清洗服务 v5.0
// ============================================
let textCleaner = null;
try {
    const { getTextCleaner } = require('./textCleaner');
    textCleaner = getTextCleaner();
    console.log('[AIProcessor] ✓ 文本清洗服务已加载');
} catch (e) {
    console.warn('[AIProcessor] ✗ 文本清洗服务未加载:', e.message);
}

// ============================================
// 配置
// ============================================

const CONFIG = {
    maxSegmentLength: 6000,
    requestInterval: 15000,
    outputDir: path.join(__dirname, '../outputs'),
    progressDir: path.join(__dirname, '../data/progress'),
    maxRetries: 2,
    browserRestartDelay: 5000,
    maxBrowserRestarts: 5,
    
    extractionPrompt: `直接输出JSON，第一个字符是{，最后一个字符是}
禁止：开头语、结尾语、\`\`\`代码块、任何解释说明

你是英语教学助手，从课堂录音内容中找出【学生不懂、需要记住的】词汇。

⚠️ 重要：这是老师上课的录音转文字，你要先理解内容，判断哪些是教学重点！

【✅ 需要提取的情况】
- 老师专门讲解、解释含义的词汇（如："environment，环境，记一下"）
- 老师强调重点的词汇（如："这个词很重要"、"考试会考"）
- 老师给出中文翻译的词汇（如："protect，保护"）
- 老师纠正发音/拼写的词汇
- 学生问"什么意思"、"怎么读"的词汇
- 老师反复强调的词汇

【❌ 不要提取的情况】
- 只是例句中随便出现的简单词（如例句 "The apple is red" 中的 apple, red）
- 老师随口带过、没有解释的词
- 小学基础词汇（is, are, have, the, a, this, that, it, they...）
- 作为背景出现、不是教学重点的词
- 中文讲解中偶尔蹦出的英文

【分类规则】
1. words: 重点单词（英文原形，小写）
2. phrases: 固定短语搭配
3. patterns: 句型模板（如 so...that...）
4. grammar: 语法知识点名称（必须用中文）

⚠️⚠️⚠️【单词 vs 语法的严格区分 - 极其重要】⚠️⚠️⚠️

【words（单词）】
✅ 任何具体的英文单词本身
   - proper, environment, protect, important, beautiful
   - 即使老师讲了这个词的"用法"、"结构"，也只是在教这个**单词**
   - 提取为：words: ["proper"]
   - 绝对不要提取为：grammar: ["proper"] ❌
   - 绝对不要提取为：grammar: ["proper的用法"] ❌

【grammar（语法）】
✅ 语法规则、时态、句式等**系统性语法知识**（必须用中文）
   - 现在完成时、被动语态、宾语从句
   - some和any的用法、可数名词和不可数名词
   - 第三人称单数、冠词用法
   
❌ 以下【不是语法】，是单词！
   - proper ❌ → 这是单词
   - beautiful ❌ → 这是单词
   - important ❌ → 这是单词
   - 任何单个英文单词 ❌ → 都是单词，不是语法
   
【核心判断原则】
1. 如果是**一个具体的英文单词**（不管老师怎么讲它）→ words
2. 如果是**一种语法规则/现象**（用中文描述）→ grammar
3. grammar 必须是中文，如果是纯英文 → 100%是words

【对比示例】
❌ 错误：
  老师讲："proper这个词，形容词，表示合适的，用法是proper + 名词"
  → 提取为 grammar: ["proper"] ✗
  
✅ 正确：
  老师讲："proper这个词，形容词，表示合适的，用法是proper + 名词"
  → 提取为 words: ["proper"] ✓
  → 原因：这是在教一个**单词**，不是在讲语法规则

✅ 正确：
  老师讲："现在完成时的构成是have/has + 过去分词"
  → 提取为 grammar: ["现在完成时"] ✓
  → 原因：这是在讲**语法规则**

⚠️【介词特别注意】
- 单独出现的介词（on, off, up, down, in, out, to, for...）要检查前后文！
- 很可能是动词短语的一部分被语音识别分开了
- 例如：turn off, go out, look for, put on 等
- 如果是短语的一部分，提取完整短语，不要单独提取介词

⚠️⚠️⚠️【短语判断规则 - 非常重要】⚠️⚠️⚠️

只有以下情况才算【真正的短语】，才放入 phrases：

✅ 动词 + 固定介词/副词（介词/副词是固定搭配，换了就错）
   look at, look after, look for, look up
   give up, give in, give out
   put on, put off, put up, turn on, turn off
   get up, get on, get off, take off
   speak up, stand up, wake up

✅ 固定搭配（整体意义 ≠ 单词意义相加）
   look forward to, be good at, be interested in
   take care of, pay attention to, make sure
   a lot of, a kind of, instead of

✅ 特殊词性用法（不含多个占位符的固定搭配）
   look adj.（看起来...，系动词用法）
   the adj.（表示一类人）

❌❌❌ 以下是【句型模板】，要放入 patterns，不是 phrases ❌❌❌

句型模板特征：含多个占位符，可灵活替换成分
   it takes sb. time to do sth. → patterns
   it is adj. to do sth. → patterns
   it is adj. for sb. to do sth. → patterns
   find it adj. to do → patterns
   make sb. do sth. → patterns
   so...that..., such...that... → patterns
   not only...but also... → patterns
   either...or..., neither...nor... → patterns
   there be... → patterns

【短语 vs 句型的判断标准】
- phrases: 固定搭配，整体记忆（如 look at, give up, be good at）
- patterns: 句型框架，可替换成分（如 it is adj. to do sth.）

⚠️⚠️⚠️【句型识别规则 - 极其重要】⚠️⚠️⚠️

【✅ 应该识别为句型的特征】
1. 特定语法现象（there be存在句, it形式主语/宾语）
2. 固定的句式结构（感叹句, 强调句, 倒装句）
3. 特殊的固定搭配（so...that..., too...to..., not only...but also...）
4. 虽然含疑问词，但表达特殊功能：
   - Why not...? → 表建议，是句型 ✅
   - How about...? → 表建议，是句型 ✅
   - What about...? → 表建议，是句型 ✅
5. 感叹句（What a...! How adj...!）
6. 使役动词句型（make sb. do, let sb. do, have sb. do）
7. 感官动词句型（see sb. do/doing, hear sb. do/doing）
8. 英语教学中的重点句型（比较级句型、祈使句等）

【❌ 不应该识别为句型 - 这些是普通疑问句，不要提取！】

⚠️ 以下是普通的疑问句，只是用来"提问信息"，没有特殊的语法功能，不是句型！

❌ 特殊疑问句（纯粹提问，不要提取）：
   what is sth.         ❌ → 普通疑问，不是句型
   what are you doing   ❌ → 普通疑问，不是句型
   what do you think    ❌ → 普通疑问，不是句型
   who is sb.           ❌ → 普通疑问，不是句型
   who are they         ❌ → 普通疑问，不是句型
   where is...?         ❌ → 普通疑问，不是句型
   where do you live    ❌ → 普通疑问，不是句型
   when is...?          ❌ → 普通疑问，不是句型
   when did you arrive  ❌ → 普通疑问，不是句型
   why is...?           ❌ → 普通疑问，不是句型（注意：Why not...? 才是句型）
   how is...?           ❌ → 普通疑问，不是句型（注意：How about...? 才是句型）
   how old are you      ❌ → 普通疑问，不是句型
   how long is it       ❌ → 普通疑问，不是句型
   how many/much...     ❌ → 普通疑问，不是句型

❌ 一般疑问句（是/否回答，不要提取）：
   Do you...?           ❌ → 普通疑问，不是句型
   Does he...?          ❌ → 普通疑问，不是句型
   Can you...?          ❌ → 普通疑问，不是句型
   Is this...?          ❌ → 普通疑问，不是句型
   Are you...?          ❌ → 普通疑问，不是句型
   Will you...?         ❌ → 普通疑问，不是句型
   Have you...?         ❌ → 普通疑问，不是句型

❌ 简单陈述句（主谓宾结构，无特殊性，不要提取）：
   I am...              ❌ → 普通陈述，不是句型
   He is...             ❌ → 普通陈述，不是句型
   They like...         ❌ → 普通陈述，不是句型

【核心判断原则 - 必须牢记】
✅ 如果只是"提问某个信息"或"陈述某件事" → 不是句型，不要提取
✅ 如果有"特殊的语法功能"或"固定的句式结构" → 才是句型，提取

【对比示例 - 理解差异】
❌ 错误示例：
   老师讲："What is your name? 是问名字的"
   → 提取为 patterns: ["what is sth."] ✗
   → 原因：这只是普通的疑问句，用来提问信息，不是特殊句型

✅ 正确示例1：
   老师讲："Why not go to the park? 表示建议"
   → 提取为 patterns: ["Why not do sth.?"] ✓
   → 原因：虽然有疑问词，但有特殊功能（表建议），是句型

✅ 正确示例2：
   老师讲："What a beautiful day! 这是感叹句"
   → 提取为 patterns: ["What a adj. n.!"] ✓
   → 原因：感叹句是特殊句式，是句型

✅ 正确示例3：
   老师讲："There is a book on the desk. 这是存在句"
   → 提取为 patterns: ["there be sth."] ✓
   → 原因：there be是特定语法现象，是句型

⚠️ 再次强调：普通的疑问句（what is, who is, where is, do you, can you等）只是用来提问信息，没有特殊的语法功能，不是句型！请不要提取！

✅ 例外：介词考点（老师特别强调的介词用法）

❌ 及物动词 + sth./sb.（这只是动词的基本用法，不是短语！）
   protect sth. ❌ → 只提取单词 protect
   clean sth. ❌ → 只提取单词 clean
   speak sth. ❌ → 只提取单词 speak
   
❌ 动词 + 普通名词宾语（宾语可以随便换）
   plant trees ❌ → 只提取单词 plant
   build houses ❌ → 只提取单词 build
   share ideas ❌ → 只提取单词 share
   read books ❌ → 只提取单词 read

❌ 动词 + 宾语 + 介词短语（整个太长，不是固定搭配）
   share ideas on a website ❌ → 只提取 share（动词）
   build houses for people ❌ → 只提取 build（动词）

❌ 介词 + 名词短语（不以动词开头的不是动词短语！）
   for a successful experiment ❌ → 只提取 successful, experiment
   from the article ❌ → 只提取 article
   in science class ❌ → 不提取
   in the morning ❌ → 不提取

❌ 动词 + 介词 + 普通名词（介词后面可以换任何名词）
   go to school ❌ → go to 不是固定短语
   live in Beijing ❌ → live in 不是固定短语

❌ 完整句子（句子不是短语！）
   is this your book ❌ → 不提取
   what do you think ❌ → 不提取

❌ 不完整/不规范的片段（不是通用模板）
   not rich families ❌ → 不是短语
   the whole summer ❌ → 不是短语
   very important ❌ → 只提取 important

❌ 转换规则（应该放到 grammar）
   some → any ❌ → 放grammar，不是短语
   do → does ❌ → 放grammar，不是短语

✅ 例外：介词考点（老师特别强调的介词用法）
   on a website ✅ → 如果老师强调 on 的用法，可以提取
   at night ✅ → 如果老师强调 at 的用法，可以提取

【短语判断口诀】
1. 必须以动词或be开头（for/from/in开头的不是动词短语）
2. 介词/副词是固定的吗？能换吗？不能换→短语，能换→只是单词
3. 整体意义 ≠ 各部分意义相加 → 才是短语
4. 不是通用模板的不算短语（如 build houses, not rich families）
5. 含多个占位符（sb./sth./adj./adv.）→ 句型模板（patterns），不是短语

【phrases vs patterns 快速判断】
- 固定搭配，整体记忆 → phrases（如 look at, give up）
- 句型框架，可替换成分 → patterns（如 it is adj. to do sth.）
- 只有sb./sth.占位符 → phrases（如 tell sb. sth.）
- 有adj./adv./doing等多种占位符 → patterns（如 find it adj. to do）

⚠️【语法分类规则 - 非常重要】
以下情况必须放入 grammar，不是短语！

1. 含语法术语的（中文或英文）：
   主语、谓语、宾语、动词、名词、形容词、副词、时态、语态、从句、不定式、动名词、分词、被动语态

2. 转换规则/变化规则（A→B格式）：
   some → any ✅ 放grammar（肯定句变否定句/疑问句的变化）
   a/an → the ✅ 放grammar（冠词用法）
   do → does ✅ 放grammar（第三人称单数变化）
   
3. 语法现象描述：
   "肯定句中用some，否定句/疑问句中用any" → 放grammar
   "可数名词复数加s/es" → 放grammar

⚠️【正确性检查】
提取的单词必须是正确完整的形式：
   Ms ❌ → Ms. ✅（称呼要带点）
   Mr ❌ → Mr. ✅
   Dr ❌ → Dr. ✅
   etc ❌ → etc. ✅

⚠️⚠️⚠️【句型格式规范 - 非常重要】⚠️⚠️⚠️

【禁止使用的格式】：
❌ 不要使用加号 "+" 连接占位符
   错误示例：it is + adj. + to do sth. ❌
   错误示例：make sb. + do sth. ❌
   错误示例：it takes sb. + time + to do sth. ❌

【必须使用的格式】：
✅ 使用空格自然连接，占位符保持原样
   正确示例：it is adj. to do sth. ✅
   正确示例：make sb. do sth. ✅
   正确示例：it takes sb. time to do sth. ✅
   正确示例：spend time doing sth. ✅
   正确示例：find it adj. to do ✅

【常用占位符标准格式】：
   sb. = somebody（某人）
   sth. = something（某物）
   adj. = adjective（形容词）
   adv. = adverb（副词）
   doing sth. = 动名词短语
   to do sth. = 不定式短语

【句型提取示例】：
   ✅ it is adj. to do sth.
   ✅ it is adj. for sb. to do sth.
   ✅ make sb. do sth.
   ✅ let sb. do sth.
   ✅ have sb. do sth.
   ✅ see sb. do sth.
   ✅ see sb. doing sth.
   ✅ spend time doing sth.
   ✅ stop sb. from doing sth.
   ✅ ask sb. to do sth.
   ✅ tell sb. to do sth.

记住：占位符之间用【空格】连接，不要用【加号】！

【输出格式】：
{"words":["environment"],"phrases":["look forward to doing sth."],"patterns":["so...that..."],"grammar":["现在完成时","some和any的用法"]}

【待分析内容】
---`,

    detailPrompt: `直接输出JSON，第一个字符是{，最后一个字符是}
禁止：开头语、结尾语、\`\`\`代码块

请为以下词汇/语法生成详细信息。

⚠️【重要提醒】⚠️
- 如果是单个英文单词（如proper, environment），生成到words
- 如果是中文语法点（如现在完成时），生成到grammar
- 不要把单词放入grammar！

⚠️【句型格式要求】⚠️
- 禁止使用加号"+"连接占位符
- 占位符之间使用空格自然连接
- 示例：it is adj. to do sth.（正确） ❌ it is + adj. + to do sth.（错误）

【输出格式】
{"vocabulary":{"words":[{"word":"","phonetic":"","pos":"","meaning":"","example":""}],"phrases":[{"phrase":"","meaning":"","example":""}],"patterns":[{"pattern":"","meaning":"","example":""}]},"grammar":[{"title":"","definition":"","structure":"","usage":[],"examples":[]}]}

【需要生成详情的内容】
---`,

    get systemPrompt() {
        return this.extractionPrompt;
    }
};

// ============================================
// JSON 提取器
// ============================================

class JsonExtractor {
    static extract(response) {
        if (!response || typeof response !== 'string') return null;
        const text = response.trim();
        
        // 策略1: 直接解析
        try { return JSON.parse(text); } catch (e) {}
        
        // 策略2: 提取最外层 {} 
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) { try { return JSON.parse(jsonMatch[0]); } catch (e) {} }
        
        // 策略3: 代码块提取
        const codeBlockMatch = text.match(/```json?\s*([\s\S]*?)```/);
        if (codeBlockMatch) { try { return JSON.parse(codeBlockMatch[1].trim()); } catch (e) {} }
        
        // 策略4: 基础修复
        try {
            let fixed = text.replace(/^[^{]*/, '').replace(/[^}]*$/, '').replace(/'/g, '"').replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
            return JSON.parse(fixed);
        } catch (e) {}
        
        // [Bug 29 修复] 策略5: 截断JSON修复
        // 当AI返回内容过长被截断时，JSON缺少闭合括号导致解析失败
        // 尝试补全缺失的 ] 和 } 来修复截断的JSON
        try {
            let truncated = text.replace(/^[^{]*/, ''); // 去掉 { 之前的内容
            if (truncated.includes('{')) {
                // 移除末尾不完整的字符串/值（截断可能发生在值中间）
                // 例如: ..."meaning":"这是一个测  ← 截断在字符串中间
                truncated = truncated.replace(/,\s*"[^"]*"?\s*:\s*"?[^"{}[\]]*$/, '');
                // 也处理截断在key中间的情况: ..."mea
                truncated = truncated.replace(/,\s*"[^"]*$/, '');
                
                // 计算未闭合的括号
                let openBraces = 0, openBrackets = 0;
                let inString = false, escaped = false;
                for (const ch of truncated) {
                    if (escaped) { escaped = false; continue; }
                    if (ch === '\\') { escaped = true; continue; }
                    if (ch === '"') { inString = !inString; continue; }
                    if (inString) continue;
                    if (ch === '{') openBraces++;
                    else if (ch === '}') openBraces--;
                    else if (ch === '[') openBrackets++;
                    else if (ch === ']') openBrackets--;
                }
                
                // 补全闭合符号
                if (openBraces > 0 || openBrackets > 0) {
                    let repair = truncated;
                    for (let i = 0; i < openBrackets; i++) repair += ']';
                    for (let i = 0; i < openBraces; i++) repair += '}';
                    
                    const parsed = JSON.parse(repair);
                    console.warn(`[JsonExtractor] ⚠️ 截断JSON已修复 (补全 ${openBrackets}个] ${openBraces}个}), 原始长度: ${text.length}`);
                    return parsed;
                }
            }
        } catch (e) {
            // 截断修复也失败，输出诊断信息
        }
        
        // 所有策略都失败，输出诊断日志帮助调试
        console.error('[JsonExtractor] ✗ JSON解析失败');
        console.error(`[JsonExtractor] 📋 响应长度: ${text.length} 字符`);
        console.error(`[JsonExtractor] 📋 前200字符: ${text.substring(0, 200)}`);
        console.error(`[JsonExtractor] 📋 后200字符: ${text.substring(Math.max(0, text.length - 200))}`);
        return null;
    }
}

// ============================================
// 关键词标准化器 v4.3.1
// ============================================

class KeywordNormalizer {
    constructor() {
        this.grammarMapping = {
            // 时态
            'present perfect': '现在完成时', 'present perfect tense': '现在完成时',
            'simple past': '一般过去时', 'past tense': '一般过去时', 'past': '一般过去时',
            'simple present': '一般现在时', 'present tense': '一般现在时',
            'past continuous': '过去进行时', 'present continuous': '现在进行时',
            'future tense': '一般将来时', 'past perfect': '过去完成时',
            'present perfect continuous': '现在完成进行时', 'past perfect continuous': '过去完成进行时',
            
            // 语态
            'passive voice': '被动语态', 'passive': '被动语态', 'active voice': '主动语态',
            
            // 非谓语动词
            'infinitive': '不定式', 'to do': '不定式', 'to do sth': '不定式', 'to do sth.': '不定式',
            'gerund': '动名词', 'v-ing': '动名词', 'v-ing as subject': '动名词作主语',
            'participle': '分词', 'present participle': '现在分词', 'past participle': '过去分词',
            
            // 从句
            'clause': '从句', 'attributive clause': '定语从句', 'relative clause': '定语从句',
            'object clause': '宾语从句', 'adverbial clause': '状语从句',
            'subject clause': '主语从句', 'predicative clause': '表语从句',
            'appositive clause': '同位语从句', 'noun clause': '名词性从句',
            
            // 句子成分
            'subject': '主语', 'predicate': '谓语', 'object': '宾语',
            'complement': '补语', 'attributive': '定语', 'adverbial': '状语',
            'appositive': '同位语',
            
            // 基本词类（新增）
            'verb': '动词', 'noun': '名词', 'adjective': '形容词', 'adverb': '副词',
            'preposition': '介词', 'pronoun': '代词', 'conjunction': '连词', 
            'article': '冠词', 'interjection': '感叹词',
            
            // 动词类型（新增）
            'transitive verb': '及物动词', 'intransitive verb': '不及物动词',
            'modal verb': '情态动词', 'auxiliary verb': '助动词', 'auxiliary': '助动词',
            'linking verb': '系动词', 'phrasal verb': '短语动词',
            
            // 名词类型（新增）
            'countable noun': '可数名词', 'uncountable noun': '不可数名词',
            'proper noun': '专有名词', 'common noun': '普通名词',
            'abstract noun': '抽象名词', 'concrete noun': '具体名词',
            'collective noun': '集体名词',
            
            // 代词类型（新增）
            'personal pronoun': '人称代词', 'possessive pronoun': '物主代词',
            'demonstrative pronoun': '指示代词', 'reflexive pronoun': '反身代词',
            'relative pronoun': '关系代词', 'indefinite pronoun': '不定代词',
            'interrogative pronoun': '疑问代词', 'reciprocal pronoun': '相互代词',
            
            // 形容词/副词类型（新增）
            'comparative adjective': '形容词比较级', 'superlative adjective': '形容词最高级',
            'comparative adverb': '副词比较级', 'superlative adverb': '副词最高级',
            
            // 冠词类型（新增）
            'definite article': '定冠词', 'indefinite article': '不定冠词',
            
            // 连词类型（新增）
            'coordinating conjunction': '并列连词', 'subordinating conjunction': '从属连词',
            
            // 介词相关（新增）
            'prepositional phrase': '介词短语',
            
            // 数和格
            'singular': '单数', 'plural': '复数',
            'third person singular': '第三人称单数',
            
            // 句型
            'negative sentence': '否定句', 'negative': '否定句',
            'interrogative sentence': '疑问句', 'interrogative': '疑问句',
            'imperative sentence': '祈使句', 'imperative': '祈使句',
            'exclamatory sentence': '感叹句', 'exclamatory': '感叹句',
            'declarative sentence': '陈述句', 'declarative': '陈述句',
            
            // 比较级和最高级
            'comparative': '比较级', 'superlative': '最高级',
            
            // 其他
            'subjunctive mood': '虚拟语气', 'conditional sentence': '条件句',
            'inversion': '倒装', 'emphasis': '强调',
        };
        
        // ✅ v4.3.6 修复：移除基本词性标记，避免误判
        // 问题：proper的释义"形容词，表示合适的"会因为包含"形容词"而被误判为语法点
        // 解决：只保留真正的语法概念（时态、语态、从句等），移除词性标记
        this.grammarKeywords = {
            chinese: [
                // 句子成分（保留）
                '主语', '谓语', '宾语', '补语', '定语', '状语', '同位语',
                
                // ❌ 已移除基本词性：'动词', '名词', '形容词', '副词', '代词', '介词', '连词'
                // 原因：单词释义本应包含词性，不应因此被判定为语法点
                
                // 时态和语态（保留）
                '时态', '语态', '现在时', '过去时', '将来时', '完成时', '进行时',
                '一般现在时', '一般过去时', '一般将来时', '现在进行时', '过去进行时',
                '现在完成时', '过去完成时', '被动语态', '主动语态',
                
                // 从句和非谓语（保留）
                '从句', '定语从句', '宾语从句', '状语从句', '主语从句',
                '不定式', '动名词', '分词', '现在分词', '过去分词',
                
                // 数和人称（保留）
                '第三人称', '单数', '复数', '原形',
                
                // 句型（保留）
                '否定句', '疑问句', '感叹句', '祈使句',
                
                // 其他语法概念（保留）
                '比较级', '最高级', '情态动词', '助动词', '系动词',
                '目的状语', '结果状语', '表语', '宾补'
            ],
            english: [
                // 句子成分（保留）
                'subject', 'predicate', 'object', 'complement', 'attributive', 'adverbial', 'appositive',
                
                // ❌ 已移除基本词类标记
                // 'verb', 'noun', 'adjective', 'adverb', 'preposition', 'pronoun', 'conjunction', 'article', 'interjection',
                
                // ❌ 已移除动词类型标记
                // 'transitive', 'intransitive', 'modal', 'auxiliary', 'linking', 'phrasal',
                
                // ❌ 已移除名词类型标记（包括 'proper'）
                // 'countable', 'uncountable', 'proper', 'common', 'abstract', 'concrete', 'collective',
                
                // ❌ 已移除代词类型标记
                // 'personal', 'possessive', 'demonstrative', 'reflexive', 'relative', 'indefinite', 'interrogative', 'reciprocal',
                
                // 时态和语态（保留）
                'tense', 'voice', 'passive', 'active',
                'present', 'past', 'future', 'perfect', 'continuous', 'progressive',
                'simple', 'perfect continuous',
                
                // 从句和非谓语（保留）
                'clause', 'infinitive', 'gerund', 'participle',
                
                // 数（保留）
                'singular', 'plural',
                
                // 句型（保留）
                'negative', 'interrogative', 'imperative', 'exclamatory', 'declarative',
                
                // 比较级和最高级（保留）
                'comparative', 'superlative',
                
                // 其他语法概念（保留）
                'subjunctive', 'conditional', 'inversion', 'emphasis'
            ]
        };
        
        // 语法模式：这些词/短语本身就是语法内容（加强版）
        this.grammarPatterns = [
            /^to do\b/i,                    // to do 开头
            /^to do sth\.?$/i,              // to do sth.（完整匹配）
            /^to do sth\b/i,                // to do sth 开头（但不匹配 how to do sth）
            /^v-?ing/i,                     // v-ing 或 ving 开头
            /\bv-?s\b/i,                    // v-s 或 vs
            /^doing sth\.?/i,               // doing sth 开头（避免误匹配句型）
            /做.*语/,                        // 做...语
            /作.*语/,                        // 作...语
            /sb\.\s*do/i,                   // sb. do
            /sth\.\s*to\s*do/i,             // sth. to do
        ];
        
        this.properNouns = new Set([
            'english', 'chinese', 'french', 'german', 'spanish', 'japanese', 'korean',
            'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
            'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
            'china', 'america', 'usa', 'uk', 'england', 'france', 'germany', 'japan', 'korea', 'russia', 'italy', 'spain', 'canada', 'australia',
            'beijing', 'shanghai', 'london', 'paris', 'tokyo', 'new york',
            'christmas', 'easter', 'halloween', 'thanksgiving', 'internet', 'wifi', 'tv'
        ]);
    }

    normalize(keywords) {
        console.log('\n[KeywordNormalizer] ═══════════════════════════════════════');
        console.log('[KeywordNormalizer] 阶段5.1: 标准化处理');
        console.log('[KeywordNormalizer] ═══════════════════════════════════════');
        
        const original = {
            words: keywords.words?.length || 0,
            phrases: keywords.phrases?.length || 0,
            patterns: keywords.patterns?.length || 0,
            grammar: keywords.grammar?.length || 0
        };
        console.log(`[KeywordNormalizer] 输入: 单词${original.words}, 短语${original.phrases}, 句型${original.patterns}, 语法${original.grammar}`);
        
        let result = this.correctClassification(keywords);
        result = this.normalizeCase(result);
        result = this.normalizeAbbreviations(result);
        result.grammar = this.convertGrammarToChinese(result.grammar);
        result = this.deduplicate(result);
        result = this.filterInvalid(result);
        
        console.log(`[KeywordNormalizer] 输出: 单词${result.words.length}, 短语${result.phrases.length}, 句型${result.patterns.length}, 语法${result.grammar.length}`);
        console.log('[KeywordNormalizer] ═══════════════════════════════════════\n');
        
        return result;
    }

    /**
     * 阶段8.1: 最终标准化
     */
    finalNormalize(mergedData) {
        console.log('\n[FinalNormalizer] ═══════════════════════════════════════');
        console.log('[FinalNormalizer] 阶段8.1: 最终标准化');
        console.log('[FinalNormalizer] ═══════════════════════════════════════');
        
        const original = {
            words: mergedData.vocabulary.words?.length || 0,
            phrases: mergedData.vocabulary.phrases?.length || 0,
            patterns: mergedData.vocabulary.patterns?.length || 0,
            grammar: mergedData.grammar?.length || 0
        };
        console.log(`[FinalNormalizer] 输入: 单词${original.words}, 短语${original.phrases}, 句型${original.patterns}, 语法${original.grammar}`);
        
        const result = JSON.parse(JSON.stringify(mergedData));
        
        // 步骤1: 检查名称是否为语法
        console.log('[FinalNormalizer] → 步骤1: 检查名称是否为语法内容');
        const movedFromName = [];
        
        result.vocabulary.words = result.vocabulary.words.filter(item => {
            if (this.isGrammarPattern(item.word)) {
                console.log(`[FinalNormalizer]   单词→语法: "${item.word}"`);
                movedFromName.push({ title: this.convertToGrammarTitle(item.word), definition: item.meaning || '', _source: item._source });
                return false;
            }
            return true;
        });
        
        result.vocabulary.phrases = result.vocabulary.phrases.filter(item => {
            if (this.isGrammarPattern(item.phrase)) {
                console.log(`[FinalNormalizer]   短语→语法: "${item.phrase}"`);
                movedFromName.push({ title: this.convertToGrammarTitle(item.phrase), definition: item.meaning || '', _source: item._source });
                return false;
            }
            return true;
        });
        
        result.vocabulary.patterns = result.vocabulary.patterns.filter(item => {
            if (this.isGrammarPattern(item.pattern)) {
                console.log(`[FinalNormalizer]   句型→语法: "${item.pattern}"`);
                movedFromName.push({ title: this.convertToGrammarTitle(item.pattern), definition: item.meaning || '', _source: item._source });
                return false;
            }
            return true;
        });
        
        console.log(`[FinalNormalizer]   因名称移动: ${movedFromName.length} 项`);
        
        // 步骤2: 检查含义中的语法词
        console.log('[FinalNormalizer] → 步骤2: 检查含义中的语法词');
        const movedFromMeaning = [];
        
        result.vocabulary.words = result.vocabulary.words.filter(item => {
            if (this.containsGrammarKeyword(item.meaning || '')) {
                console.log(`[FinalNormalizer]   单词→语法(含义): "${item.word}"`);
                movedFromMeaning.push({ title: this.extractGrammarTitle(item.word, item.meaning), definition: item.meaning, _source: item._source });
                return false;
            }
            return true;
        });
        
        result.vocabulary.phrases = result.vocabulary.phrases.filter(item => {
            if (this.containsGrammarKeyword(item.meaning || '')) {
                console.log(`[FinalNormalizer]   短语→语法(含义): "${item.phrase}"`);
                movedFromMeaning.push({ title: this.extractGrammarTitle(item.phrase, item.meaning), definition: item.meaning, _source: item._source });
                return false;
            }
            return true;
        });
        
        result.vocabulary.patterns = result.vocabulary.patterns.filter(item => {
            if (this.containsGrammarKeyword(item.meaning || '')) {
                console.log(`[FinalNormalizer]   句型→语法(含义): "${item.pattern}"`);
                movedFromMeaning.push({ title: this.extractGrammarTitle(item.pattern, item.meaning), definition: item.meaning, _source: item._source });
                return false;
            }
            return true;
        });
        
        console.log(`[FinalNormalizer]   因含义移动: ${movedFromMeaning.length} 项`);
        result.grammar.push(...movedFromName, ...movedFromMeaning);
        
        // 步骤3: 标准化大小写
        console.log('[FinalNormalizer] → 步骤3: 标准化大小写');
        
        result.vocabulary.words = result.vocabulary.words.map(item => {
            if (item.word) {
                const oldWord = item.word;
                item.word = this.normalizeItemCase(item.word);
                if (oldWord !== item.word) console.log(`[FinalNormalizer]   "${oldWord}" → "${item.word}"`);
            }
            return item;
        });
        
        result.vocabulary.phrases = result.vocabulary.phrases.map(item => {
            if (item.phrase) {
                const oldPhrase = item.phrase;
                item.phrase = this.normalizeItemCase(item.phrase);
                if (oldPhrase !== item.phrase) console.log(`[FinalNormalizer]   "${oldPhrase}" → "${item.phrase}"`);
            }
            return item;
        });
        
        result.vocabulary.patterns = result.vocabulary.patterns.map(item => {
            if (item.pattern) {
                const oldPattern = item.pattern;
                item.pattern = this.normalizeItemCase(item.pattern);
                if (oldPattern !== item.pattern) console.log(`[FinalNormalizer]   "${oldPattern}" → "${item.pattern}"`);
            }
            return item;
        });
        
        // 步骤4: 去重
        console.log('[FinalNormalizer] → 步骤4: 去重');
        const beforeDedupe = {
            words: result.vocabulary.words.length,
            phrases: result.vocabulary.phrases.length,
            patterns: result.vocabulary.patterns.length,
            grammar: result.grammar.length
        };
        
        result.vocabulary.words = this.dedupeObjects(result.vocabulary.words, 'word');
        result.vocabulary.phrases = this.dedupeObjects(result.vocabulary.phrases, 'phrase');
        result.vocabulary.patterns = this.dedupeObjects(result.vocabulary.patterns, 'pattern');
        result.grammar = this.dedupeObjects(result.grammar, 'title');
        
        console.log(`[FinalNormalizer]   单词: ${beforeDedupe.words} → ${result.vocabulary.words.length}`);
        console.log(`[FinalNormalizer]   短语: ${beforeDedupe.phrases} → ${result.vocabulary.phrases.length}`);
        console.log(`[FinalNormalizer]   句型: ${beforeDedupe.patterns} → ${result.vocabulary.patterns.length}`);
        console.log(`[FinalNormalizer]   语法: ${beforeDedupe.grammar} → ${result.grammar.length}`);
        
        // 更新统计
        result.summary = {
            total_words: result.vocabulary.words.length,
            total_phrases: result.vocabulary.phrases.length,
            total_patterns: result.vocabulary.patterns.length,
            total_grammar: result.grammar.length
        };
        
        console.log('[FinalNormalizer] ───────────────────────────────────────');
        console.log(`[FinalNormalizer] 最终: 单词${result.vocabulary.words.length}, 短语${result.vocabulary.phrases.length}, 句型${result.vocabulary.patterns.length}, 语法${result.grammar.length}`);
        console.log('[FinalNormalizer] ═══════════════════════════════════════\n');
        
        // ========== v5.0: 文本清洗 ==========
        // 去除加号、替换通用符号（sb., sth.）、删除括号示例
        if (textCleaner) {
            console.log('[TextCleaner] ═══════════════════════════════════════');
            console.log('[TextCleaner] 开始清洗文本（去除+号、统一符号）');
            console.log('[TextCleaner] ═══════════════════════════════════════');
            
            const beforeClean = {
                words: result.vocabulary.words.length,
                phrases: result.vocabulary.phrases.length,
                patterns: result.vocabulary.patterns.length,
                grammar: result.grammar.length
            };
            
            try {
                // 清洗词汇数据
                result.vocabulary = textCleaner.cleanVocabulary(result.vocabulary);
                
                // 清洗语法数据
                result.grammar = textCleaner.cleanGrammarList(result.grammar);
                
                console.log(`[TextCleaner] ✅ 清洗完成:`);
                console.log(`[TextCleaner]   - 单词: ${beforeClean.words} 项`);
                console.log(`[TextCleaner]   - 短语: ${beforeClean.phrases} 项`);
                console.log(`[TextCleaner]   - 句型: ${beforeClean.patterns} 项`);
                console.log(`[TextCleaner]   - 语法: ${beforeClean.grammar} 项`);
                console.log('[TextCleaner] ═══════════════════════════════════════\n');
            } catch (cleanError) {
                console.error('[TextCleaner] ❌ 清洗失败:', cleanError.message);
                console.warn('[TextCleaner] ⚠️  将使用未清洗的数据');
            }
        } else {
            console.warn('[TextCleaner] ⚠️  文本清洗服务未启用，跳过清洗');
        }
        
        return result;
    }

    isGrammarPattern(text) {
        if (!text) return false;
        
        // v4.3.9: 排除疑问句型（如 how to do sth., what to do 等）
        // 这些是句型，不是语法内容
        const questionPatterns = [
            /^how\s+to\s+(do|be|make|get|use)/i,
            /^what\s+to\s+(do|be|make|get|use)/i,
            /^when\s+to\s+(do|be|make|get|use)/i,
            /^where\s+to\s+(do|be|make|get|go)/i,
            /^why\s+to\s+(do|be|make|get|use)/i,
            /^which\s+to\s+(do|be|make|get|use|choose)/i,
            /^whether\s+to\s+(do|be|make|get|use)/i,
        ];
        
        for (const qPattern of questionPatterns) {
            if (qPattern.test(text)) {
                return false;  // 疑问句型，不是语法
            }
        }
        
        // 继续原有的语法模式匹配
        for (const pattern of this.grammarPatterns) {
            if (pattern.test(text)) return true;
        }
        const lowerText = text.toLowerCase().trim();
        if (this.grammarMapping[lowerText]) return true;
        return false;
    }

    convertToGrammarTitle(text) {
        const lowerText = text.toLowerCase().trim();
        if (this.grammarMapping[lowerText]) return this.grammarMapping[lowerText];
        if (/^to do\b/i.test(text)) return '不定式';
        if (/^v-?ing/i.test(text)) return '动名词';
        return text;
    }

    containsGrammarKeyword(text) {
        if (!text) return false;
        for (const keyword of this.grammarKeywords.chinese) {
            if (text.includes(keyword)) return true;
        }
        return false;
    }

    extractGrammarTitle(word, meaning) {
        for (const keyword of this.grammarKeywords.chinese) {
            if (meaning.includes(keyword)) {
                const match = meaning.match(new RegExp(`[（(]([^）)]*${keyword}[^）)]*)[）)]`));
                if (match) return match[1].trim();
                return keyword;
            }
        }
        return `${word}（${meaning}）`;
    }

    /**
     * 🆕 v4.3.1 修复：标准化大小写（正确处理 sth. sb. 等缩写）
     */
    normalizeItemCase(text) {
        if (!text || typeof text !== 'string') return '';
        
        // 1. 保护 ... 和缩写（sth. sb. sw.）- 使用不会被 toLowerCase 影响的标记
        let result = text;
        result = result.replace(/\.\.\./g, '\x00ELLIPSIS\x00');
        result = result.replace(/\b(sth|sb|sw)\./gi, (match) => match.toLowerCase().replace('.', '\x00DOT\x00'));
        
        // 2. 按空格分割
        const words = result.split(/(\s+)/);
        
        // 3. 处理每个单词
        const normalized = words.map(word => {
            if (/^\s+$/.test(word)) return word; // 保留空格
            
            // 跳过包含保护标记的部分
            if (word.includes('\x00')) return word;
            
            // 移除标点来检查是否是专有名词
            const cleanWord = word.replace(/[.,;:!?'"()]/g, '').toLowerCase();
            
            // 专有名词首字母大写
            if (this.properNouns.has(cleanWord)) {
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            
            return word.toLowerCase();
        });
        
        result = normalized.join('');
        
        // 4. 恢复保护的内容
        result = result.replace(/\x00ELLIPSIS\x00/g, '...');
        result = result.replace(/\x00DOT\x00/g, '.');
        
        return result.trim();
    }

    dedupeObjects(array, keyField) {
        if (!Array.isArray(array) || array.length === 0) return [];
        const seen = new Map();
        const duplicates = [];
        const result = array.filter(item => {
            if (!item || !item[keyField]) return false;
            const key = String(item[keyField]).toLowerCase().trim();
            if (seen.has(key)) {
                duplicates.push({
                    key,
                    original: seen.get(key)[keyField],
                    duplicate: item[keyField]
                });
                return false;
            }
            seen.set(key, item);
            return true;
        });
        
        // 输出去重详情
        if (duplicates.length > 0) {
            console.log(`[dedupeObjects] 🔄 发现 ${duplicates.length} 个重复项 (字段: ${keyField}):`);
            duplicates.forEach(d => {
                console.log(`[dedupeObjects]   - "${d.duplicate}" (重复的key: "${d.key}")`);
            });
        }
        
        return result;
    }

    correctClassification(keywords) {
        const result = { words: [], phrases: [], patterns: [], grammar: [...(keywords.grammar || [])] };
        for (const word of (keywords.words || [])) {
            if (this.isGrammarContent(word)) result.grammar.push(word);
            else result.words.push(word);
        }
        for (const phrase of (keywords.phrases || [])) {
            if (this.isGrammarContent(phrase)) result.grammar.push(phrase);
            else result.phrases.push(phrase);
        }
        for (const pattern of (keywords.patterns || [])) {
            if (this.isGrammarContent(pattern)) result.grammar.push(pattern);
            else result.patterns.push(pattern);
        }
        return result;
    }

    isGrammarContent(text) {
        if (!text) return false;
        const lowerText = text.toLowerCase();
        for (const keyword of this.grammarKeywords.chinese) { if (text.includes(keyword)) return true; }
        for (const keyword of this.grammarKeywords.english) {
            if (new RegExp(`\\b${keyword}\\b`, 'i').test(lowerText)) return true;
        }
        if (this.grammarMapping[lowerText]) return true;
        for (const pattern of this.grammarPatterns) { if (pattern.test(text)) return true; }
        return false;
    }

    normalizeCase(keywords) {
        return {
            words: (keywords.words || []).map(word => {
                const lower = word.toLowerCase().trim();
                if (this.properNouns.has(lower)) return this.capitalizeFirst(lower);
                return lower;
            }),
            phrases: (keywords.phrases || []).map(phrase => this.normalizeItemCase(phrase)),
            patterns: (keywords.patterns || []).map(pattern => this.normalizeItemCase(pattern)),
            grammar: keywords.grammar || []
        };
    }

    capitalizeFirst(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    normalizeAbbreviations(keywords) {
        const abbrs = { 'something': 'sth.', 'somebody': 'sb.', 'someone': 'sb.', 'somewhere': 'sw.', 'sth': 'sth.', 'sb': 'sb.', 'sw': 'sw.' };
        const normalize = (text) => {
            if (!text) return '';
            let result = text;
            for (const [full, abbr] of Object.entries(abbrs)) {
                result = result.replace(new RegExp(`\\b${full}\\b`, 'gi'), abbr);
            }
            return result.replace(/\.{2,}/g, '.').replace(/\s+/g, ' ').trim();
        };
        return {
            words: (keywords.words || []).map(normalize),
            phrases: (keywords.phrases || []).map(normalize),
            patterns: (keywords.patterns || []).map(normalize),
            grammar: keywords.grammar || []
        };
    }

    convertGrammarToChinese(grammarList) {
        if (!grammarList || grammarList.length === 0) return [];
        return grammarList.map(grammar => {
            if (!grammar) return null;
            if (/[\u4e00-\u9fa5]/.test(grammar)) return grammar.trim();
            const lowerGrammar = grammar.toLowerCase().trim();
            if (this.grammarMapping[lowerGrammar]) return this.grammarMapping[lowerGrammar];
            for (const [en, cn] of Object.entries(this.grammarMapping)) {
                if (lowerGrammar.includes(en)) return cn;
            }
            return grammar.trim();
        }).filter(Boolean);
    }

    deduplicate(keywords) {
        const dedupeArray = (arr) => {
            if (!arr || arr.length === 0) return [];
            const seen = new Set();
            return arr.filter(item => {
                if (!item) return false;
                const key = item.toLowerCase().trim();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        };
        return {
            words: dedupeArray(keywords.words),
            phrases: dedupeArray(keywords.phrases),
            patterns: dedupeArray(keywords.patterns),
            grammar: dedupeArray(keywords.grammar)
        };
    }

    filterInvalid(keywords) {
        return {
            words: (keywords.words || []).filter(w => w && w.length >= 2 && !/\s/.test(w) && !/[\u4e00-\u9fa5]/.test(w) && /[a-zA-Z]/.test(w)),
            phrases: (keywords.phrases || []).filter(p => p && p.length >= 3 && !/[\u4e00-\u9fa5]/.test(p) && p.split(/\s+/).filter(w => w.length > 0).length >= 2),
            patterns: (keywords.patterns || []).filter(p => p && p.length >= 3 && !/[\u4e00-\u9fa5]/.test(p)),
            grammar: (keywords.grammar || []).filter(g => g && g.trim().length > 0)
        };
    }
}

const keywordNormalizer = new KeywordNormalizer();

// ============================================
// 结果合并器
// ============================================

class ResultMerger {
    static createEmptyResult() {
        return { vocabulary: { words: [], phrases: [], patterns: [] }, grammar: [], summary: { total_words: 0, total_phrases: 0, total_patterns: 0, total_grammar: 0 } };
    }

    static mergeKeywords(results) {
        const merged = { words: [], phrases: [], patterns: [], grammar: [] };
        // 🔧 B3修复：使用Set去重，防止多chunk边界产生重复项
        const seen = { words: new Set(), phrases: new Set(), patterns: new Set(), grammar: new Set() };

        const addUnique = (arr, seenSet, items) => {
            for (const item of items) {
                const key = String(item).toLowerCase().trim();
                if (key && !seenSet.has(key)) {
                    seenSet.add(key);
                    arr.push(item);
                }
            }
        };

        for (const result of results) {
            if (!result) continue;

            const rawWords = Array.isArray(result.words) ? result.words :
                (result.vocabulary?.words ? result.vocabulary.words.map(w => w.word || w).filter(Boolean) : []);
            addUnique(merged.words, seen.words, rawWords);

            const rawPhrases = Array.isArray(result.phrases) ? result.phrases :
                (result.vocabulary?.phrases ? result.vocabulary.phrases.map(p => p.phrase || p).filter(Boolean) : []);
            addUnique(merged.phrases, seen.phrases, rawPhrases);

            const rawPatterns = Array.isArray(result.patterns) ? result.patterns :
                (result.vocabulary?.patterns ? result.vocabulary.patterns.map(p => p.pattern || p).filter(Boolean) : []);
            addUnique(merged.patterns, seen.patterns, rawPatterns);

            const rawGrammar = Array.isArray(result.grammar) ? result.grammar.map(g => typeof g === 'string' ? g : g?.title).filter(Boolean) : [];
            addUnique(merged.grammar, seen.grammar, rawGrammar);
        }
        console.log(`[ResultMerger] B3去重合并: 单词${merged.words.length}, 短语${merged.phrases.length}, 句型${merged.patterns.length}, 语法${merged.grammar.length}`);
        return merged;
    }
}

// ============================================
// 单词过滤器
// ============================================

class WordFilter {
    constructor() {
        this.elementaryWords = new Set();
        this.blacklistWords = new Set();
        const elementaryPath = path.join(__dirname, '../data/elementary_words.json');
        const blacklistPath = path.join(__dirname, '../data/blacklist_words.json');
        try { if (fs.existsSync(elementaryPath)) { this.elementaryWords = new Set(JSON.parse(fs.readFileSync(elementaryPath, 'utf-8')).words.map(w => w.toLowerCase())); console.log(`[WordFilter] 加载小学词汇: ${this.elementaryWords.size} 个`); } } catch (e) {}
        try { if (fs.existsSync(blacklistPath)) { this.blacklistWords = new Set(JSON.parse(fs.readFileSync(blacklistPath, 'utf-8')).words.map(w => w.toLowerCase())); console.log(`[WordFilter] 加载黑名单: ${this.blacklistWords.size} 个`); } } catch (e) {}
    }

    filter(data) {
        console.log('\n[WordFilter] ═══════════════════════════════════════');
        console.log('[WordFilter] 阶段8: 过滤基础词汇');
        console.log('[WordFilter] ═══════════════════════════════════════');
        if (!data?.vocabulary) return data;
        let filtered = JSON.parse(JSON.stringify(data));
        const originalCount = filtered.vocabulary.words?.length || 0;
        if (filtered.vocabulary.words) {
            filtered.vocabulary.words = filtered.vocabulary.words.filter(item => {
                const word = (item.word || '').toLowerCase();
                return !this.elementaryWords.has(word) && !this.blacklistWords.has(word) && word.length >= 2;
            });
        }
        const finalCount = filtered.vocabulary.words?.length || 0;
        console.log(`[WordFilter] 单词: ${originalCount} → ${finalCount} (移除 ${originalCount - finalCount} 个)`);
        filtered.summary = { total_words: finalCount, total_phrases: filtered.vocabulary.phrases?.length || 0, total_patterns: filtered.vocabulary.patterns?.length || 0, total_grammar: filtered.grammar?.length || 0 };
        console.log('[WordFilter] ═══════════════════════════════════════\n');
        return filtered;
    }
}

// ============================================
// 辅助函数
// ============================================

function generateDefaultTitle() { const now = new Date(); return `${now.getMonth() + 1}月${now.getDate()}日英语课堂笔记`; }
function isGarbled(str) { if (!str) return true; if (/[\u00c0-\u00ff]{2,}|Ã|â|ã/.test(str)) return true; return str.length > 5 && !(str.match(/[\u4e00-\u9fa5]/g) || []).length; }
function getFinalTitle(task) {
    if (task.customTitle?.trim()) return task.customTitle.trim();
    const baseName = path.basename(task.file.originalName, path.extname(task.file.originalName));
    if (!isGarbled(baseName)) return baseName;
    return generateDefaultTitle();
}
function getProgressFilePath(taskId) { return path.join(CONFIG.progressDir, `${taskId}.json`); }
function saveProgress(taskId, progressData) { if (!fs.existsSync(CONFIG.progressDir)) fs.mkdirSync(CONFIG.progressDir, { recursive: true }); fs.writeFileSync(getProgressFilePath(taskId), JSON.stringify(progressData, null, 2), 'utf-8'); console.log(`💾 进度已保存: ${progressData.completedCount}/${progressData.totalSegments}`); }
function loadProgress(taskId) { const filePath = getProgressFilePath(taskId); if (fs.existsSync(filePath)) { try { const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')); console.log(`📂 加载进度: ${data.completedCount}/${data.totalSegments}`); return data; } catch (e) {} } return null; }
function clearProgress(taskId) { const filePath = getProgressFilePath(taskId); if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); console.log(`🗑️ 进度已清理`); } }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function withTimeout(promise, ms, errorMsg = '超时') { let timeoutId; const timeoutPromise = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error(errorMsg)), ms); }); return Promise.race([promise.finally(() => clearTimeout(timeoutId)), timeoutPromise]); }

// ============================================
// 浏览器管理
// ============================================

async function initBrowser() { console.log('🌐 初始化浏览器...'); const automation = new SorryiosAutomation(); await withTimeout(automation.init(), 60000, '浏览器启动超时'); await withTimeout(automation.login(), 60000, '登录超时'); await withTimeout(automation.selectIdleAccount(), 30000, '选择账号超时'); console.log('✅ AI账号已就绪'); return automation; }
async function closeBrowser(automation) { if (automation) { try { await automation.close(); console.log('🔒 浏览器已关闭'); } catch (e) { try { require('child_process').exec('taskkill /F /IM chromium.exe /T', () => {}); } catch (e2) {} } } await sleep(2000); }
async function processSegmentWithRetry(automation, message, index, total, onProgress = null) {
    for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
        try {
            const logMsg = `📤 发送片段 ${index + 1}/${total} (尝试 ${attempt}/${CONFIG.maxRetries})`;
            console.log(logMsg);
            if (onProgress) onProgress({ currentStep: logMsg });
            
            const response = await withTimeout(automation.sendMessage(message), 300000, `片段 ${index + 1} 超时`);
            const rawText = typeof response === 'object' ? response.text : response;
            // [Bug 29 诊断] 记录原始响应长度，帮助定位截断问题
            console.log(`[processSegment] 📋 原始响应: ${(rawText||'').length} 字符`);
            const parsed = JsonExtractor.extract(rawText);
            if (parsed) { 
                const successMsg = `✅ 片段 ${index + 1}/${total} 处理成功`;
                console.log(successMsg); 
                if (onProgress) onProgress({ currentStep: successMsg });
                return { index, success: true, output: parsed, attempt }; 
            }
            throw new Error('JSON解析失败');
        } catch (error) { 
            const errorMsg = `❌ 片段 ${index + 1} 尝试 ${attempt} 失败: ${error.message}`;
            console.error(errorMsg); 
            if (onProgress) onProgress({ currentStep: errorMsg });
            if (attempt < CONFIG.maxRetries) await sleep(CONFIG.browserRestartDelay); 
        }
    }
    return { index, success: false, error: `所有尝试都失败` };
}

// ============================================
// 主处理函数
// ============================================

async function processTask(task, onProgress) {
    const { id: taskId, file } = task;
    console.log('\n' + '='.repeat(60)); 
    console.log('🎓 英语课堂智能分析系统 v4.3.2'); 
    console.log('='.repeat(60)); 
    console.log(`📁 任务ID: ${taskId}`); 
    console.log(`📄 文件: ${file.originalName}`); 
    console.log('='.repeat(60) + '\n');

    let automation = null; 
    let results = []; 
    let segmentTexts = []; 
    let totalSegments = 0; 
    let startIndex = 0; 
    let needNewConversation = false; 
    let browserRestartCount = 0;
    const wordFilter = new WordFilter();

    try {
        // ========== 阶段1-3: 准备工作 ==========
        onProgress({ currentStep: '📌 阶段1-3: 准备工作', progress: 2 });
        
        onProgress({ currentStep: '📄 读取文件...', progress: 5 });
        const content = fs.readFileSync(file.savedPath, 'utf-8'); 
        const fileInfo = `📄 文件读取完成: ${content.length} 字符`;
        console.log(fileInfo);
        onProgress({ currentStep: fileInfo, progress: 8 });
        
        onProgress({ currentStep: '✂️ 智能分段中...', progress: 10 });
        const splitter = new TextSplitter({ maxSegmentLength: CONFIG.maxSegmentLength, minSegmentLength: 200 });
        segmentTexts = splitter.split(content).map(s => typeof s === 'object' ? s.content : s); 
        totalSegments = segmentTexts.length; 
        const segmentInfo = `📝 分段完成: ${totalSegments} 段`;
        console.log(segmentInfo);
        onProgress({ currentStep: segmentInfo, progress: 12 });
        
        const savedProgress = loadProgress(taskId);
        if (savedProgress?.results?.length > 0 && savedProgress.completedCount > 0) { 
            results = savedProgress.results; 
            startIndex = savedProgress.completedCount; 
            needNewConversation = true;
            onProgress({ currentStep: `📂 恢复进度: 已完成 ${startIndex}/${totalSegments} 段`, progress: 15 });
        } else { 
            results = new Array(totalSegments).fill(null); 
        }

        // ========== 阶段4: AI提取关键词 ==========
        console.log('\n' + '─'.repeat(60)); 
        console.log('📌 阶段4: AI提取关键词'); 
        console.log('─'.repeat(60));
        onProgress({ currentStep: '📌 阶段4: AI提取关键词', progress: 18 });
        
        let currentIndex = startIndex;
        while (currentIndex < totalSegments) {
            if (!automation) {
                if (browserRestartCount >= CONFIG.maxBrowserRestarts) throw new Error(`浏览器重启次数过多`);
                const browserMsg = browserRestartCount > 0 ? `🔄 重启浏览器 (${browserRestartCount + 1}次)...` : '🌐 启动浏览器...';
                onProgress({ currentStep: browserMsg, progress: 18 });
                try { 
                    automation = await initBrowser(); 
                    browserRestartCount++; 
                    needNewConversation = true;
                    onProgress({ currentStep: '✅ AI账号已就绪', progress: 19 });
                } catch (e) { 
                    onProgress({ currentStep: `⚠️ 浏览器启动失败: ${e.message}`, progress: 18 });
                    await sleep(CONFIG.browserRestartDelay); 
                    continue; 
                }
            }
            
            const progressPercent = Math.round(20 + (currentIndex / totalSegments) * 40);
            onProgress({ currentStep: `🔄 处理片段 ${currentIndex + 1}/${totalSegments}...`, progress: progressPercent });
            
            const message = needNewConversation ? `${CONFIG.extractionPrompt}\n${segmentTexts[currentIndex]}\n---` : `继续提取，JSON格式：\n\n${segmentTexts[currentIndex]}`;
            needNewConversation = false;
            
            try {
                const result = await processSegmentWithRetry(automation, message, currentIndex, totalSegments, onProgress);
                result.input = segmentTexts[currentIndex]; 
                results[currentIndex] = result;
                
                saveProgress(taskId, { taskId, totalSegments, completedCount: currentIndex + 1, successCount: results.filter(r => r?.success).length, results, lastUpdated: new Date().toISOString() });
                onProgress({ currentStep: `💾 进度已保存: ${currentIndex + 1}/${totalSegments}`, progress: progressPercent });
                
                currentIndex++; 
                if (currentIndex < totalSegments) { 
                    const waitMsg = `⏳ 等待 ${CONFIG.requestInterval / 1000} 秒...`;
                    console.log(waitMsg);
                    onProgress({ currentStep: waitMsg, progress: progressPercent });
                    await sleep(CONFIG.requestInterval); 
                }
            } catch (e) { 
                onProgress({ currentStep: `⚠️ 处理异常，准备重启浏览器...`, progress: progressPercent });
                await closeBrowser(automation); 
                automation = null; 
                needNewConversation = true; 
                await sleep(CONFIG.browserRestartDelay); 
            }
        }

        // ========== 阶段5: 合并关键词 ==========
        console.log('\n' + '─'.repeat(60)); 
        console.log('📌 阶段5: 合并关键词'); 
        console.log('─'.repeat(60));
        onProgress({ currentStep: '📌 阶段5: 合并关键词', progress: 62 });
        
        const successResults = results.filter(r => r?.success && r.output).map(r => r.output);
        const successInfo = `✅ 成功片段: ${successResults.length}/${totalSegments}`;
        console.log(successInfo);
        onProgress({ currentStep: successInfo, progress: 62 });
        
        const rawKeywords = ResultMerger.mergeKeywords(successResults);
        const mergeInfo = `🔀 合并结果: 单词${rawKeywords.words.length}, 短语${rawKeywords.phrases.length}, 句型${rawKeywords.patterns.length}, 语法${rawKeywords.grammar.length}`;
        console.log(mergeInfo);
        onProgress({ currentStep: mergeInfo, progress: 63 });
        
        onProgress({ currentStep: '🔧 标准化处理...', progress: 64 });
        const extractedKeywords = keywordNormalizer.normalize(rawKeywords);

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

        // ========== 阶段6: 匹配数据库 ==========
        console.log('\n' + '─'.repeat(60)); 
        console.log('📌 阶段6: 匹配数据库'); 
        console.log('─'.repeat(60));
        onProgress({ currentStep: '📌 阶段6: 匹配数据库', progress: 65 });
        
        let mergedData = ResultMerger.createEmptyResult(); 
        let unmatchedKeywords = { words: [], phrases: [], patterns: [], grammar: [] };
        
        if (matchingService) {
            try {
                onProgress({ currentStep: '🔍 正在匹配数据库...', progress: 66 });
                const matchResult = matchingService.batchMatch(extractedKeywords);
                const stats = matchingService.getMatchStats(matchResult);
                
                const matchInfo = `🔍 匹配结果: 精确${stats.exactMatch}, 模糊${stats.fuzzyMatch}, 未匹配${stats.unmatched}`;
                console.log(`[阶段6] ${matchInfo}`);
                onProgress({ currentStep: matchInfo, progress: 67 });
                
                // ========== v5.1: 添加去重检查 ==========
                console.log('[阶段6] ─────────────────────────────────────');
                console.log('[阶段6] 开始添加匹配结果到 mergedData');
                console.log('[阶段6] ─────────────────────────────────────');
                
                const addedItems = { words: 0, phrases: 0, patterns: 0, grammar: 0 };
                const skippedDuplicates = { words: 0, phrases: 0, patterns: 0, grammar: 0 };
                
                for (const match of matchResult.matched) {
                    if (match.matched_data) {
                        const item = { ...match.matched_data, _source: 'database', _matchScore: match.score };
                        
                        // 去重检查函数（v5.1.1 - 添加null安全检查）
                        const isDuplicate = (arr, keyField, value) => {
                            if (!value) return false; // 如果value为空，不算重复
                            const normalizedValue = String(value).toLowerCase().trim();
                            return arr.some(existingItem => 
                                existingItem[keyField] && 
                                String(existingItem[keyField]).toLowerCase().trim() === normalizedValue
                            );
                        };
                        
                        if (match.item_type === 'word') {
                            if (!isDuplicate(mergedData.vocabulary.words, 'word', item.word)) {
                                mergedData.vocabulary.words.push(item);
                                addedItems.words++;
                                console.log(`[阶段6] ✅ 添加单词: "${item.word}" (来源: ${item._source}, 分数: ${match.score.toFixed(2)})`);
                            } else {
                                skippedDuplicates.words++;
                                console.log(`[阶段6] 🔄 跳过重复单词: "${item.word}"`);
                            }
                        }
                        else if (match.item_type === 'phrase') {
                            if (!isDuplicate(mergedData.vocabulary.phrases, 'phrase', item.phrase)) {
                                mergedData.vocabulary.phrases.push(item);
                                addedItems.phrases++;
                                console.log(`[阶段6] ✅ 添加短语: "${item.phrase}" (来源: ${item._source}, 分数: ${match.score.toFixed(2)})`);
                            } else {
                                skippedDuplicates.phrases++;
                                console.log(`[阶段6] 🔄 跳过重复短语: "${item.phrase}"`);
                            }
                        }
                        else if (match.item_type === 'pattern') {
                            if (!isDuplicate(mergedData.vocabulary.patterns, 'pattern', item.pattern)) {
                                mergedData.vocabulary.patterns.push(item);
                                addedItems.patterns++;
                                console.log(`[阶段6] ✅ 添加句型: "${item.pattern}" (来源: ${item._source}, 分数: ${match.score.toFixed(2)})`);
                            } else {
                                skippedDuplicates.patterns++;
                                console.log(`[阶段6] 🔄 跳过重复句型: "${item.pattern}"`);
                            }
                        }
                        else if (match.item_type === 'grammar') {
                            if (!isDuplicate(mergedData.grammar, 'title', item.title)) {
                                mergedData.grammar.push(item);
                                addedItems.grammar++;
                                console.log(`[阶段6] ✅ 添加语法: "${item.title}" (来源: ${item._source}, 分数: ${match.score.toFixed(2)})`);
                            } else {
                                skippedDuplicates.grammar++;
                                console.log(`[阶段6] 🔄 跳过重复语法: "${item.title}"`);
                            }
                        }
                    }
                }
                
                console.log('[阶段6] ─────────────────────────────────────');
                console.log(`[阶段6] 📊 添加统计:`);
                console.log(`[阶段6]   - 单词: ${addedItems.words} 个 (跳过重复: ${skippedDuplicates.words})`);
                console.log(`[阶段6]   - 短语: ${addedItems.phrases} 个 (跳过重复: ${skippedDuplicates.phrases})`);
                console.log(`[阶段6]   - 句型: ${addedItems.patterns} 个 (跳过重复: ${skippedDuplicates.patterns})`);
                console.log(`[阶段6]   - 语法: ${addedItems.grammar} 个 (跳过重复: ${skippedDuplicates.grammar})`);
                console.log(`[阶段6] 📦 当前 mergedData 总计:`);
                console.log(`[阶段6]   - 单词: ${mergedData.vocabulary.words.length}`);
                console.log(`[阶段6]   - 短语: ${mergedData.vocabulary.phrases.length}`);
                console.log(`[阶段6]   - 句型: ${mergedData.vocabulary.patterns.length}`);
                console.log(`[阶段6]   - 语法: ${mergedData.grammar.length}`);
                console.log('[阶段6] ─────────────────────────────────────');

                for (const unmatched of matchResult.unmatched) {
                    // [Bug 17 修复] 统一使用 matchingDictService 检查排除（原来用的 excludeService 与 matching.db 不同步）
                    if (matchingDictServiceRef && matchingDictServiceRef.isExcluded(unmatched.original_text, unmatched.item_type)) {
                        console.log(`[阶段6] 🚫 跳过排除项: ${unmatched.original_text} (${unmatched.item_type})`);
                        continue;
                    }
                    if (unmatched.item_type === 'word') unmatchedKeywords.words.push(unmatched.original_text);
                    else if (unmatched.item_type === 'phrase') unmatchedKeywords.phrases.push(unmatched.original_text);
                    else if (unmatched.item_type === 'pattern') unmatchedKeywords.patterns.push(unmatched.original_text);
                    else if (unmatched.item_type === 'grammar') unmatchedKeywords.grammar.push(unmatched.original_text);
                }
                
                const dbInfo = `✅ 从数据库获取: ${matchResult.matched.length} 项`;
                console.log(`[阶段6] ${dbInfo}`);
                onProgress({ currentStep: dbInfo, progress: 68 });
                
                if (matchResult.unmatched.length > 0) {
                    const needAiInfo = `⏳ 需要AI生成: ${matchResult.unmatched.length} 项`;
                    console.log(`[阶段6] ${needAiInfo}`);
                    onProgress({ currentStep: needAiInfo, progress: 69 });
                }

                // ========== v5.0: 保存匹配记录到数据库 ==========
                if (processingLogService) {
                    try {
                        // 保存匹配记录
                        // [Bug A 修复] 添加 source_db/source_table/source_id，原来映射遗漏导致这三个字段始终为NULL
                        const matchedItems = matchResult.matched.map(m => ({
                            task_id: taskId,
                            original_text: m.original_text,
                            matched_text: m.matched_text,
                            item_type: m.item_type,
                            match_score: m.score,
                            source_db: m.source_db || null,
                            source_table: m.source_table || null,
                            source_id: m.source_id || null,
                            matched_data: m.matched_data,
                            status: m.score >= 1.0 ? 'confirmed' : 'pending'
                        }));
                        
                        // 🔧 去重：同一task中相同的词只保存一次
                        const seenMatched = new Set();
                        const uniqueMatchedItems = matchedItems.filter(item => {
                            const key = `${item.item_type}:${item.original_text.toLowerCase()}`;
                            if (seenMatched.has(key)) {
                                console.log(`[阶段6] 🔄 去重(matched): ${item.original_text} (${item.item_type})`);
                                return false;
                            }
                            seenMatched.add(key);
                            return true;
                        });
                        
                        if (uniqueMatchedItems.length > 0) {
                            processingLogService.addMatchedItems(uniqueMatchedItems);
                            const dedupeInfo = matchedItems.length > uniqueMatchedItems.length 
                                ? ` (去重前: ${matchedItems.length})` 
                                : '';
                            console.log(`[阶段6] 💾 保存匹配记录: ${uniqueMatchedItems.length} 条${dedupeInfo}`);
                            onProgress({ currentStep: `💾 保存匹配记录: ${uniqueMatchedItems.length} 条${dedupeInfo}`, progress: 69 });
                        }
                        
                        // 保存未匹配记录（[Bug 17 修复] 使用 matchingDictService 统一过滤）
                        let unmatchedToSave = matchResult.unmatched;
                        if (matchingDictServiceRef) {
                            unmatchedToSave = matchResult.unmatched.filter(u => 
                                !matchingDictServiceRef.isExcluded(u.original_text, u.item_type)
                            );
                            const excludedCount = matchResult.unmatched.length - unmatchedToSave.length;
                            if (excludedCount > 0) {
                                console.log(`[阶段6] 🚫 排除库过滤: ${excludedCount} 项`);
                            }
                        }
                        
                        const unmatchedItemsToSave = unmatchedToSave.map(u => ({
                            task_id: taskId,
                            original_text: u.original_text,
                            item_type: u.item_type,
                            ai_generated: null,
                            status: 'pending'
                        }));
                        
                        // 🔧 去重：同一task中相同的词只保存一次
                        const seenUnmatched = new Set();
                        const uniqueUnmatchedItems = unmatchedItemsToSave.filter(item => {
                            const key = `${item.item_type}:${item.original_text.toLowerCase()}`;
                            if (seenUnmatched.has(key)) {
                                console.log(`[阶段6] 🔄 去重(unmatched): ${item.original_text} (${item.item_type})`);
                                return false;
                            }
                            seenUnmatched.add(key);
                            return true;
                        });
                        
                        if (uniqueUnmatchedItems.length > 0) {
                            processingLogService.addUnmatchedItems(uniqueUnmatchedItems);
                            const dedupeInfo = unmatchedItemsToSave.length > uniqueUnmatchedItems.length 
                                ? ` (去重前: ${unmatchedItemsToSave.length})` 
                                : '';
                            console.log(`[阶段6] 💾 保存未匹配记录: ${uniqueUnmatchedItems.length} 条${dedupeInfo}`);
                            onProgress({ currentStep: `💾 保存未匹配记录: ${uniqueUnmatchedItems.length} 条${dedupeInfo}`, progress: 69 });
                        }
                        
                        // 更新任务统计（使用去重后的数量）
                        processingLogService.updateTaskStats(taskId, {
                            total_items: uniqueMatchedItems.length + uniqueUnmatchedItems.length,
                            exact_match_count: uniqueMatchedItems.filter(m => m.match_score >= 1.0).length,
                            fuzzy_match_count: uniqueMatchedItems.filter(m => m.match_score < 1.0).length,
                            unmatched_count: uniqueUnmatchedItems.length
                        });
                        console.log(`[阶段6] 💾 更新任务统计完成`);
                        
                    } catch (logError) {
                        console.warn('[阶段6] 保存日志失败:', logError.message);
                    }
                }
            } catch (e) { 
                console.warn('[阶段6] 匹配失败:', e.message); 
                onProgress({ currentStep: `⚠️ 数据库匹配失败: ${e.message}`, progress: 68 });
                unmatchedKeywords = extractedKeywords; 
            }
        } else { 
            onProgress({ currentStep: '⚠️ 数据库服务未启用，全部由AI生成', progress: 68 });
            unmatchedKeywords = extractedKeywords; 
        }

        // ========== 阶段7: AI生成详情 ==========
        const totalUnmatched = unmatchedKeywords.words.length + unmatchedKeywords.phrases.length + unmatchedKeywords.patterns.length + unmatchedKeywords.grammar.length;
        if (totalUnmatched > 0) {
            console.log('\n' + '─'.repeat(60)); 
            console.log(`📌 阶段7: AI生成详情 (${totalUnmatched}项)`); 
            console.log('─'.repeat(60));
            onProgress({ currentStep: `📌 阶段7: AI生成详情 (${totalUnmatched}项)`, progress: 70 });
            
            const detailContent = [];
            if (unmatchedKeywords.words.length > 0) {
                detailContent.push(`【单词】${unmatchedKeywords.words.join(', ')}`);
                onProgress({ currentStep: `📝 待生成单词: ${unmatchedKeywords.words.length} 个`, progress: 71 });
            }
            if (unmatchedKeywords.phrases.length > 0) {
                detailContent.push(`【短语】${unmatchedKeywords.phrases.join(', ')}`);
                onProgress({ currentStep: `📝 待生成短语: ${unmatchedKeywords.phrases.length} 个`, progress: 72 });
            }
            if (unmatchedKeywords.patterns.length > 0) {
                detailContent.push(`【句型】${unmatchedKeywords.patterns.join(', ')}`);
                onProgress({ currentStep: `📝 待生成句型: ${unmatchedKeywords.patterns.length} 个`, progress: 73 });
            }
            if (unmatchedKeywords.grammar.length > 0) {
                detailContent.push(`【语法】${unmatchedKeywords.grammar.join(', ')}`);
                onProgress({ currentStep: `📝 待生成语法: ${unmatchedKeywords.grammar.length} 个`, progress: 74 });
            }
            
            try {
                if (!automation) { 
                    onProgress({ currentStep: '🌐 启动浏览器...', progress: 75 });
                    automation = await initBrowser(); 
                    browserRestartCount++;
                    onProgress({ currentStep: '✅ AI账号已就绪', progress: 76 });
                }
                
                // [Bug 29 修复] 分批发送AI详情生成请求
                // 原来一次性发送全部项目（如37项），AI响应过长被截断导致JSON解析失败
                // 现在每批最多10项，确保AI能完整返回JSON
                const BATCH_SIZE = 10;
                const allBatches = [];
                
                // 构建批次：将所有类型的项目按 BATCH_SIZE 分批
                const allItems = [];
                for (const w of unmatchedKeywords.words) allItems.push({ type: 'word', text: w });
                for (const p of unmatchedKeywords.phrases) allItems.push({ type: 'phrase', text: p });
                for (const p of unmatchedKeywords.patterns) allItems.push({ type: 'pattern', text: p });
                for (const g of unmatchedKeywords.grammar) allItems.push({ type: 'grammar', text: g });
                
                for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
                    const batch = allItems.slice(i, i + BATCH_SIZE);
                    const batchContent = [];
                    const batchWords = batch.filter(b => b.type === 'word').map(b => b.text);
                    const batchPhrases = batch.filter(b => b.type === 'phrase').map(b => b.text);
                    const batchPatterns = batch.filter(b => b.type === 'pattern').map(b => b.text);
                    const batchGrammar = batch.filter(b => b.type === 'grammar').map(b => b.text);
                    
                    if (batchWords.length > 0) batchContent.push(`【单词】${batchWords.join(', ')}`);
                    if (batchPhrases.length > 0) batchContent.push(`【短语】${batchPhrases.join(', ')}`);
                    if (batchPatterns.length > 0) batchContent.push(`【句型】${batchPatterns.join(', ')}`);
                    if (batchGrammar.length > 0) batchContent.push(`【语法】${batchGrammar.join(', ')}`);
                    
                    allBatches.push(batchContent);
                }
                
                const totalBatches = allBatches.length;
                console.log(`[阶段7] 📦 分批策略: ${totalUnmatched}项 → ${totalBatches}批 (每批≤${BATCH_SIZE}项)`);
                onProgress({ currentStep: `📤 分${totalBatches}批发送详情生成请求...`, progress: 77 });
                
                // 合并所有批次的AI结果
                const aiData = { vocabulary: { words: [], phrases: [], patterns: [] }, grammar: [] };
                let batchSuccessCount = 0;
                
                for (let bIdx = 0; bIdx < totalBatches; bIdx++) {
                    const batchContent = allBatches[bIdx];
                    const batchProgress = 77 + Math.floor((bIdx / totalBatches) * 10); // 77-87%
                    
                    onProgress({ currentStep: `📤 批次 ${bIdx + 1}/${totalBatches} 发送中...`, progress: batchProgress });
                    console.log(`[阶段7] 📤 发送批次 ${bIdx + 1}/${totalBatches}: ${batchContent.join(' | ')}`);
                    
                    const batchResult = await processSegmentWithRetry(
                        automation, 
                        `${CONFIG.detailPrompt}\n${batchContent.join('\n')}\n---`, 
                        bIdx, totalBatches, onProgress
                    );
                    
                    if (batchResult.success && batchResult.output) {
                        const batchData = batchResult.output;
                        // 合并到 aiData
                        if (batchData.vocabulary?.words) aiData.vocabulary.words.push(...batchData.vocabulary.words);
                        if (batchData.vocabulary?.phrases) aiData.vocabulary.phrases.push(...batchData.vocabulary.phrases);
                        if (batchData.vocabulary?.patterns) aiData.vocabulary.patterns.push(...batchData.vocabulary.patterns);
                        if (batchData.grammar) aiData.grammar.push(...batchData.grammar);
                        batchSuccessCount++;
                        console.log(`[阶段7] ✅ 批次 ${bIdx + 1}/${totalBatches} 成功 (词:${batchData.vocabulary?.words?.length||0} 短:${batchData.vocabulary?.phrases?.length||0} 句:${batchData.vocabulary?.patterns?.length||0} 法:${batchData.grammar?.length||0})`);
                    } else {
                        console.warn(`[阶段7] ⚠️ 批次 ${bIdx + 1}/${totalBatches} 失败，跳过`);
                    }
                }
                
                console.log(`[阶段7] 📊 批次统计: ${batchSuccessCount}/${totalBatches} 成功`);
                
                if (batchSuccessCount > 0) {
                    
                    console.log('[阶段7] ─────────────────────────────────────');
                    console.log('[阶段7] 开始添加AI生成内容到 mergedData');
                    console.log('[阶段7] ─────────────────────────────────────');
                    
                    const aiAddedItems = { words: 0, phrases: 0, patterns: 0, grammar: 0 };
                    const aiSkippedDuplicates = { words: 0, phrases: 0, patterns: 0, grammar: 0 };
                    
                    // 去重检查函数
                    const isDuplicate = (arr, keyField, value) => {
                            if (!value) return false;
                            const normalizedValue = String(value).toLowerCase().trim();
                            return arr.some(existingItem => 
                                existingItem[keyField] && 
                                String(existingItem[keyField]).toLowerCase().trim() === normalizedValue
                            );
                        };
                    
                    if (aiData.vocabulary?.words) {
                        for (const w of aiData.vocabulary.words) {
                            if (!isDuplicate(mergedData.vocabulary.words, 'word', w.word)) {
                                mergedData.vocabulary.words.push({ ...w, _source: 'ai' });
                                aiAddedItems.words++;
                                console.log(`[阶段7] ✅ 添加AI单词: "${w.word}"`);
                            } else {
                                aiSkippedDuplicates.words++;
                                console.log(`[阶段7] 🔄 跳过重复AI单词: "${w.word}"`);
                            }
                        }
                        const msg = `✅ AI生成单词: ${aiAddedItems.words} 个 (跳过重复: ${aiSkippedDuplicates.words})`;
                        console.log(`[阶段7] ${msg}`);
                        onProgress({ currentStep: msg, progress: 80 });
                    }
                    
                    if (aiData.vocabulary?.phrases) {
                        for (const p of aiData.vocabulary.phrases) {
                            if (!isDuplicate(mergedData.vocabulary.phrases, 'phrase', p.phrase)) {
                                mergedData.vocabulary.phrases.push({ ...p, _source: 'ai' });
                                aiAddedItems.phrases++;
                                console.log(`[阶段7] ✅ 添加AI短语: "${p.phrase}"`);
                            } else {
                                aiSkippedDuplicates.phrases++;
                                console.log(`[阶段7] 🔄 跳过重复AI短语: "${p.phrase}"`);
                            }
                        }
                        const msg = `✅ AI生成短语: ${aiAddedItems.phrases} 个 (跳过重复: ${aiSkippedDuplicates.phrases})`;
                        console.log(`[阶段7] ${msg}`);
                        onProgress({ currentStep: msg, progress: 82 });
                    }
                    
                    if (aiData.vocabulary?.patterns) {
                        for (const p of aiData.vocabulary.patterns) {
                            if (!isDuplicate(mergedData.vocabulary.patterns, 'pattern', p.pattern)) {
                                mergedData.vocabulary.patterns.push({ ...p, _source: 'ai' });
                                aiAddedItems.patterns++;
                                console.log(`[阶段7] ✅ 添加AI句型: "${p.pattern}"`);
                            } else {
                                aiSkippedDuplicates.patterns++;
                                console.log(`[阶段7] 🔄 跳过重复AI句型: "${p.pattern}"`);
                            }
                        }
                        const msg = `✅ AI生成句型: ${aiAddedItems.patterns} 个 (跳过重复: ${aiSkippedDuplicates.patterns})`;
                        console.log(`[阶段7] ${msg}`);
                        onProgress({ currentStep: msg, progress: 84 });
                    }
                    
                    if (aiData.grammar?.length) {
                        for (const g of aiData.grammar) {
                            if (!isDuplicate(mergedData.grammar, 'title', g.title)) {
                                mergedData.grammar.push({ ...g, _source: 'ai' });
                                aiAddedItems.grammar++;
                                console.log(`[阶段7] ✅ 添加AI语法: "${g.title}"`);
                            } else {
                                aiSkippedDuplicates.grammar++;
                                console.log(`[阶段7] 🔄 跳过重复AI语法: "${g.title}"`);
                            }
                        }
                        const msg = `✅ AI生成语法: ${aiAddedItems.grammar} 个 (跳过重复: ${aiSkippedDuplicates.grammar})`;
                        console.log(`[阶段7] ${msg}`);
                        onProgress({ currentStep: msg, progress: 86 });
                    }
                    
                    console.log('[阶段7] ─────────────────────────────────────');
                    console.log(`[阶段7] 📊 AI生成统计:`);
                    console.log(`[阶段7]   - 单词: ${aiAddedItems.words} 个 (跳过重复: ${aiSkippedDuplicates.words})`);
                    console.log(`[阶段7]   - 短语: ${aiAddedItems.phrases} 个 (跳过重复: ${aiSkippedDuplicates.phrases})`);
                    console.log(`[阶段7]   - 句型: ${aiAddedItems.patterns} 个 (跳过重复: ${aiSkippedDuplicates.patterns})`);
                    console.log(`[阶段7]   - 语法: ${aiAddedItems.grammar} 个 (跳过重复: ${aiSkippedDuplicates.grammar})`);
                    console.log(`[阶段7] 📦 当前 mergedData 总计:`);
                    console.log(`[阶段7]   - 单词: ${mergedData.vocabulary.words.length}`);
                    console.log(`[阶段7]   - 短语: ${mergedData.vocabulary.phrases.length}`);
                    console.log(`[阶段7]   - 句型: ${mergedData.vocabulary.patterns.length}`);
                    console.log(`[阶段7]   - 语法: ${mergedData.grammar.length}`);
                    console.log('[阶段7] ─────────────────────────────────────');
                    
                    console.log(`[阶段7] ✅ AI生成完成`);
                    onProgress({ currentStep: '✅ AI详情生成完成', progress: 88 });
                    
                    // ========== v4.3.4: 更新数据库中的未匹配记录 ==========
                    if (processingLogService) {
                        try {
                            // v5.1 新增: 构建AI文本到original_text的映射（第一道防线）
                            const textMapping = {};
                            let mappingCount = 0;
                            
                            // 构建单词映射
                            if (aiData.vocabulary?.words) {
                                for (const word of aiData.vocabulary.words) {
                                    const originalWord = unmatchedKeywords.words.find(w => 
                                        w.toLowerCase() === word.word.toLowerCase() ||
                                        w.toLowerCase().includes(word.word.toLowerCase()) ||
                                        word.word.toLowerCase().includes(w.toLowerCase())
                                    );
                                    if (originalWord) {
                                        textMapping[`word:${word.word}`] = originalWord;
                                        mappingCount++;
                                    }
                                }
                            }
                            
                            // 构建短语映射
                            if (aiData.vocabulary?.phrases) {
                                for (const phrase of aiData.vocabulary.phrases) {
                                    const originalPhrase = unmatchedKeywords.phrases.find(p => 
                                        p.toLowerCase() === phrase.phrase.toLowerCase() ||
                                        p.toLowerCase().includes(phrase.phrase.toLowerCase()) ||
                                        phrase.phrase.toLowerCase().includes(p.toLowerCase())
                                    );
                                    if (originalPhrase) {
                                        textMapping[`phrase:${phrase.phrase}`] = originalPhrase;
                                        mappingCount++;
                                    }
                                }
                            }
                            
                            // 构建句型映射
                            if (aiData.vocabulary?.patterns) {
                                for (const pattern of aiData.vocabulary.patterns) {
                                    const originalPattern = unmatchedKeywords.patterns.find(p => 
                                        p.toLowerCase() === pattern.pattern.toLowerCase() ||
                                        p.toLowerCase().includes(pattern.pattern.toLowerCase()) ||
                                        pattern.pattern.toLowerCase().includes(p.toLowerCase())
                                    );
                                    if (originalPattern) {
                                        textMapping[`pattern:${pattern.pattern}`] = originalPattern;
                                        mappingCount++;
                                    }
                                }
                            }
                            
                            // 构建语法映射
                            if (aiData.grammar) {
                                for (const grammar of aiData.grammar) {
                                    const originalGrammar = unmatchedKeywords.grammar.find(g => 
                                        g.toLowerCase() === grammar.title.toLowerCase() ||
                                        g.toLowerCase().includes(grammar.title.toLowerCase()) ||
                                        grammar.title.toLowerCase().includes(g.toLowerCase())
                                    );
                                    if (originalGrammar) {
                                        textMapping[`grammar:${grammar.title}`] = originalGrammar;
                                        mappingCount++;
                                    }
                                }
                            }
                            
                            console.log(`[阶段7] 📋 构建文本映射: ${mappingCount} 项`);
                            
                            // 更新单词（使用映射后的original_text）
                            if (aiData.vocabulary?.words) {
                                for (const word of aiData.vocabulary.words) {
                                    const originalText = textMapping[`word:${word.word}`] || word.word;
                                    const result = processingLogService.updateUnmatchedAiContent(
                                        taskId, 
                                        originalText, 
                                        'word', 
                                        word
                                    );
                                    if (!result.success) {
                                        console.warn(`[阶段7] ⚠️ 更新单词失败: "${originalText}" (AI: "${word.word}")`);
                                    }
                                }
                            }
                            // 更新短语（使用映射后的original_text）
                            if (aiData.vocabulary?.phrases) {
                                for (const phrase of aiData.vocabulary.phrases) {
                                    const originalText = textMapping[`phrase:${phrase.phrase}`] || phrase.phrase;
                                    const result = processingLogService.updateUnmatchedAiContent(
                                        taskId, 
                                        originalText, 
                                        'phrase', 
                                        phrase
                                    );
                                    if (!result.success) {
                                        console.warn(`[阶段7] ⚠️ 更新短语失败: "${originalText}" (AI: "${phrase.phrase}")`);
                                    }
                                }
                            }
                            // 更新句型（使用映射后的original_text）
                            if (aiData.vocabulary?.patterns) {
                                for (const pattern of aiData.vocabulary.patterns) {
                                    const originalText = textMapping[`pattern:${pattern.pattern}`] || pattern.pattern;
                                    const result = processingLogService.updateUnmatchedAiContent(
                                        taskId, 
                                        originalText, 
                                        'pattern', 
                                        pattern
                                    );
                                    if (!result.success) {
                                        console.warn(`[阶段7] ⚠️ 更新句型失败: "${originalText}" (AI: "${pattern.pattern}")`);
                                    }
                                }
                            }
                            // 更新语法（使用映射后的original_text）
                            if (aiData.grammar) {
                                for (const grammar of aiData.grammar) {
                                    const originalText = textMapping[`grammar:${grammar.title}`] || grammar.title;
                                    const result = processingLogService.updateUnmatchedAiContent(
                                        taskId, 
                                        originalText, 
                                        'grammar', 
                                        grammar
                                    );
                                    if (!result.success) {
                                        console.warn(`[阶段7] ⚠️ 更新语法失败: "${originalText}" (AI: "${grammar.title}")`);
                                    }
                                }
                            }
                            console.log(`[阶段7] 💾 AI生成内容已更新到数据库`);
                            onProgress({ currentStep: '💾 AI生成内容已保存到数据库', progress: 88 });
                        } catch (updateErr) {
                            console.warn('[阶段7] 更新AI内容失败:', updateErr.message);
                        }
                    }
                }
            } catch (e) { 
                console.error('[阶段7] ❌', e.message);
                onProgress({ currentStep: `❌ AI生成失败: ${e.message}`, progress: 88 });
            }
        } else { 
            console.log('\n📌 阶段7: 跳过（全部从数据库获取）');
            onProgress({ currentStep: '⏭️ 阶段7: 跳过（全部从数据库获取）', progress: 88 });
        }

        // ========== 阶段8: 过滤基础词汇 ==========
        onProgress({ currentStep: '📌 阶段8: 过滤基础词汇', progress: 89 });
        const beforeFilter = mergedData.vocabulary.words?.length || 0;
        mergedData = wordFilter.filter(mergedData);
        const afterFilter = mergedData.vocabulary.words?.length || 0;
        const filterInfo = `🔧 过滤结果: ${beforeFilter} → ${afterFilter} (移除 ${beforeFilter - afterFilter} 个基础词)`;
        onProgress({ currentStep: filterInfo, progress: 90 });
        
        onProgress({ currentStep: '🔧 最终标准化处理...', progress: 91 });
        mergedData = keywordNormalizer.finalNormalize(mergedData);

        // ========== 阶段9: 生成报告 ==========
        console.log('\n' + '─'.repeat(60)); 
        console.log('📌 阶段9: 生成报告'); 
        console.log('─'.repeat(60));
        onProgress({ currentStep: '📌 阶段9: 生成报告', progress: 92 });
        
        // ========== v5.1: 报告生成前的最终数据验证 ==========
        console.log('[阶段9] ═══════════════════════════════════════');
        console.log('[阶段9] 最终数据验证（检查重复）');
        console.log('[阶段9] ═══════════════════════════════════════');
        
        const validateData = (arr, keyField, label) => {
            const seen = new Set();
            const duplicates = [];
            arr.forEach(item => {
                if (item && item[keyField]) {
                    const key = item[keyField].toLowerCase().trim();
                    if (seen.has(key)) {
                        duplicates.push(item[keyField]);
                    } else {
                        seen.add(key);
                    }
                }
            });
            
            if (duplicates.length > 0) {
                console.log(`[阶段9] ⚠️  ${label} 中发现 ${duplicates.length} 个重复项:`);
                duplicates.forEach(d => console.log(`[阶段9]   - "${d}"`));
                return false;
            } else {
                console.log(`[阶段9] ✅ ${label}: 无重复，共 ${arr.length} 项`);
                return true;
            }
        };
        
        const wordsValid = validateData(mergedData.vocabulary.words, 'word', '单词');
        const phrasesValid = validateData(mergedData.vocabulary.phrases, 'phrase', '短语');
        const patternsValid = validateData(mergedData.vocabulary.patterns, 'pattern', '句型');
        const grammarValid = validateData(mergedData.grammar, 'title', '语法');
        
        if (!wordsValid || !phrasesValid || !patternsValid || !grammarValid) {
            console.error('[阶段9] ❌ 数据验证失败！发现重复数据，将强制去重');
            
            // 强制最后一次去重
            const finalDedupe = (arr, keyField) => {
                const seen = new Map();
                return arr.filter(item => {
                    if (!item || !item[keyField]) return false;
                    const key = String(item[keyField]).toLowerCase().trim();
                    if (seen.has(key)) {
                        console.log(`[阶段9] 🔧 强制去重: "${item[keyField]}"`);
                        return false;
                    }
                    seen.set(key, item);
                    return true;
                });
            };
            
            mergedData.vocabulary.words = finalDedupe(mergedData.vocabulary.words, 'word');
            mergedData.vocabulary.phrases = finalDedupe(mergedData.vocabulary.phrases, 'phrase');
            mergedData.vocabulary.patterns = finalDedupe(mergedData.vocabulary.patterns, 'pattern');
            mergedData.grammar = finalDedupe(mergedData.grammar, 'title');
            
            console.log('[阶段9] ✅ 强制去重完成');
        } else {
            console.log('[阶段9] ✅ 数据验证通过，无重复数据');
        }
        
        console.log('[阶段9] ═══════════════════════════════════════\n');

        
        const timestamp = Date.now(); 
        const finalTitle = getFinalTitle(task);
        const outputSubDir = `task_${taskId.slice(0, 8)}_${timestamp}`; 
        const outputPath = path.join(CONFIG.outputDir, outputSubDir);
        
        if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true });
        onProgress({ currentStep: `📁 创建输出目录: ${outputSubDir}`, progress: 93 });
        
        const reportGenerator = new EnglishReportGenerator({ outputDir: outputPath });
        mergedData.metadata = { taskId, originalFile: file.originalName, processedAt: new Date().toISOString(), totalSegments, successCount: successResults.length, failCount: totalSegments - successResults.length, browserRestarts: browserRestartCount };
        
        onProgress({ currentStep: '📝 生成 HTML 报告...', progress: 94 });
        onProgress({ currentStep: '📝 生成 Markdown 报告...', progress: 95 });
        onProgress({ currentStep: '📝 生成 JSON 数据...', progress: 96 });
        reportGenerator.saveAll(mergedData, 'report', finalTitle);

        // ========== 完成 ==========
        console.log('\n' + '═'.repeat(60)); 
        console.log('📊 报告生成完成！'); 
        console.log('═'.repeat(60));
        console.log(`   📁 路径: ${outputPath}`); 
        console.log(`   📝 标题: ${finalTitle}`);
        console.log('   ────────────────────────────');
        console.log(`   📚 单词: ${mergedData.summary.total_words}`); 
        console.log(`   📖 短语: ${mergedData.summary.total_phrases}`);
        console.log(`   📋 句型: ${mergedData.summary.total_patterns}`); 
        console.log(`   📑 语法: ${mergedData.summary.total_grammar}`);
        console.log('   ────────────────────────────');
        const totalItems = mergedData.summary.total_words + mergedData.summary.total_phrases + mergedData.summary.total_patterns + mergedData.summary.total_grammar;
        console.log(`   📊 总计: ${totalItems} 项`);
        console.log('═'.repeat(60) + '\n');

        onProgress({ currentStep: '═══════════════════════════════', progress: 97 });
        onProgress({ currentStep: `📊 报告生成完成！`, progress: 98 });
        onProgress({ currentStep: `📚 单词: ${mergedData.summary.total_words} | 📖 短语: ${mergedData.summary.total_phrases}`, progress: 98 });
        onProgress({ currentStep: `📋 句型: ${mergedData.summary.total_patterns} | 📑 语法: ${mergedData.summary.total_grammar}`, progress: 99 });
        onProgress({ currentStep: `🎉 总计: ${totalItems} 项`, progress: 99 });
        onProgress({ currentStep: '═══════════════════════════════', progress: 99 });

        clearProgress(taskId); 
        onProgress({ currentStep: '✅ 处理完成！', progress: 100 });
        
        return { 
            outputDir: outputSubDir, 
            title: finalTitle, 
            files: { html: `${outputSubDir}/report.html`, markdown: `${outputSubDir}/report.md`, json: `${outputSubDir}/report.json` }, 
            stats: { totalSegments, successCount: successResults.length, failCount: totalSegments - successResults.length, totalCharacters: content.length, browserRestarts: browserRestartCount, vocabulary: mergedData.summary } 
        };
    } catch (error) {
        const completedCount = results.filter(r => r).length;
        if (completedCount > 0) saveProgress(taskId, { taskId, totalSegments, completedCount, successCount: results.filter(r => r?.success).length, results, lastUpdated: new Date().toISOString(), error: error.message });
        onProgress({ currentStep: `❌ 处理失败: ${error.message}`, progress: 0 });
        throw error;
    } finally { 
        await closeBrowser(automation); 
    }
}

// ============================================
// 初始化
// ============================================

function init() {
    if (!fs.existsSync(CONFIG.outputDir)) fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    if (!fs.existsSync(CONFIG.progressDir)) fs.mkdirSync(CONFIG.progressDir, { recursive: true });
    taskQueue.setProcessor(processTask);
    try { if (fs.existsSync(CONFIG.progressDir)) { const files = fs.readdirSync(CONFIG.progressDir).filter(f => f.endsWith('.json')); if (files.length > 0) console.log(`\n📋 发现 ${files.length} 个未完成任务`); } } catch (e) {}
    console.log('\n' + '='.repeat(60)); 
    console.log('  🎓 英语课堂智能分析系统 v5.1 已就绪'); 
    console.log('  🆕 v5.1: 句型验证（过滤普通疑问句）'); 
    console.log('='.repeat(60) + '\n');
}

module.exports = { init, processTask, CONFIG, loadProgress, clearProgress, getFinalTitle, generateDefaultTitle, JsonExtractor, ResultMerger, WordFilter, KeywordNormalizer, keywordNormalizer };