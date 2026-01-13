/**
 * 测试 english-classroom-processor.js v3.1
 * 
 * 使用方法：
 *   cd D:\sorryios-test\backend
 *   node test-processor.js
 */

const fs = require('fs');
const path = require('path');
const { EnglishClassroomProcessor } = require('./services/english-classroom-processor');
const ReportGenerator = require('./services/english-report-generator');

async function test() {
    console.log('='.repeat(60));
    console.log('英语课堂处理器测试 v3.1');
    console.log('输出结构：词汇基础 + 语法知识');
    console.log('='.repeat(60));
    
    const processor = new EnglishClassroomProcessor();
    
    // 测试文本（模拟英语课堂录音转写）
    const testText = `
    Good morning class! Today we're going to learn some important irregular verbs.
    
    First, let's talk about the verb "go". Many students make mistakes with this one.
    The past tense is "went", not "goed". Remember: go - went - gone. 
    This is what we call ABC type - all three forms are different.
    
    老师问：去用英语怎么说？
    Student: Go!
    老师：对！那过去式呢？
    Student: Goed?
    老师：不对！是 went，w-e-n-t。这是一个不规则动词。
    
    Now let's look at another important verb: "tell".
    tell - told - told. This is ABB type - the past and past participle are the same.
    
    很多同学分不清 tell, speak, say, talk 的区别。让我来解释一下：
    - tell: 告诉某人某事，后面必须有人。tell somebody something, tell him the truth
    - say: 说话的内容，后面直接跟说的话。say hello, say something
    - speak: 强调说话的方式或语言。speak English, speak loudly
    - talk: 交谈，强调双向交流。talk to someone, talk about something
    
    还有一个AAA型动词：cut - cut - cut。三个形式完全一样。
    
    Student常见错误：
    错误：He cutted the paper.
    正确：He cut the paper.
    
    Let's practice some sentence patterns:
    1. It is important for us to learn English.
       It is + adj + for sb + to do sth
    
    2. I saw him play basketball. vs I saw him playing basketball.
       see sb do sth = 看见某人做了某事（全过程）
       see sb doing sth = 看见某人正在做某事（进行中）
    
    重点短语：
    - look forward to doing sth - 期待做某事
    - be good at doing sth - 擅长做某事
    - ask sb to do sth - 请求某人做某事
    
    Homework: Please review all the irregular verbs we learned today.
    `.repeat(3);  // 重复3次模拟较长文本
    
    console.log(`\n测试文本长度: ${testText.length} 字符\n`);
    
    // 生成任务ID和标题
    const taskId = 'test_' + Date.now();
    const now = new Date();
    const reportTitle = `${now.getMonth() + 1}月${now.getDate()}日英语课堂笔记`;
    
    try {
        const result = await processor.process(testText, {
            taskId: taskId,
            onProgress: (p) => {
                console.log(`[进度] ${p.status}: ${p.message}`);
            }
        });
        
        if (result.success) {
            console.log('\n' + '='.repeat(60));
            console.log('AI处理成功！');
            console.log('='.repeat(60));
            
            // 显示统计
            console.log('\n📊 统计:');
            console.log(`  单词: ${result.data.summary.total_words}`);
            console.log(`  短语: ${result.data.summary.total_phrases}`);
            console.log(`  句型: ${result.data.summary.total_patterns}`);
            console.log(`  语法点: ${result.data.summary.total_grammar}`);
            
            if (result.data.summary.filter_stats) {
                console.log('\n🔍 过滤统计:');
                console.log(`  原始: ${result.data.summary.filter_stats.original}`);
                console.log(`  过滤后: ${result.data.summary.filter_stats.final}`);
                console.log(`  移除: ${result.data.summary.filter_stats.removed}`);
            }
            
            // 生成报告
            console.log('\n' + '='.repeat(60));
            console.log('📄 生成报告...');
            console.log('='.repeat(60));
            
            const outputDir = path.join(__dirname, 'outputs');
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            const generator = new ReportGenerator({ outputDir: outputDir });
            const files = generator.saveAll(result.data, taskId, reportTitle);
            
            console.log('\n' + '='.repeat(60));
            console.log('✅ 全部完成！');
            console.log('='.repeat(60));
            console.log('\n📁 输出文件:');
            console.log(`   📄 HTML:     ${files.html}`);
            console.log(`   📝 Markdown: ${files.markdown}`);
            console.log(`   📊 JSON:     ${files.json}`);
            console.log('');
            console.log('💡 使用提示:');
            console.log('   1. 双击 .html 文件在浏览器中查看漂亮的报告');
            console.log('   2. 在浏览器中按 Ctrl+P 可导出为PDF');
            console.log('   3. .md 文件可导入 Notion、Obsidian 等笔记软件');
            console.log('='.repeat(60));
            
        } else {
            console.error('处理失败:', result.error);
        }
        
    } catch (error) {
        console.error('测试出错:', error);
    }
}

// 运行测试
test().catch(console.error);