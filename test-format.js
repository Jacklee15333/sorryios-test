/**
 * test-format.js - 格式化功能测试脚本
 * 
 * 运行方式: node test-format.js
 */

const ReportGenerator = require('./report-generator');

// 创建报告生成器实例
const generator = new ReportGenerator({ outputDir: './test-output' });

// ============================================
// 测试用例1: 完全没有换行的文本（模拟bug情况）
// ============================================
const testCase1 = `一、课程概述本节课主要讲解了JavaScript的基础知识，包括变量声明、数据类型和函数定义。二、核心知识点1) 变量声明：var、let、const的区别和使用场景。2) 数据类型：包括String、Number、Boolean、Object、Array等。3) 函数定义：function关键字和箭头函数的写法。三、重点总结✅ let和const是ES6新增的声明方式，推荐使用。❌ var存在变量提升问题，尽量避免使用。💡 箭头函数没有自己的this，适合回调函数场景。四、课后作业完成课后练习题1-10题，下节课检查。`;

console.log('='.repeat(60));
console.log('测试用例1: 完全没有换行的文本');
console.log('='.repeat(60));
console.log('\n【原始文本】:');
console.log(testCase1);
console.log('\n【格式化后】:');
console.log(generator.smartFormat(testCase1));

// ============================================
// 测试用例2: 有部分换行的文本
// ============================================
const testCase2 = `一、项目背景
这是一个自动化项目，用于处理课堂录音。
二、技术方案
1) 使用Playwright进行浏览器自动化
2) 使用Node.js作为运行环境
3) 分段处理长文本
三、注意事项
✅ 确保网络稳定 ❌ 不要在高峰期运行 💡 建议使用代理`;

console.log('\n' + '='.repeat(60));
console.log('测试用例2: 有部分换行的文本');
console.log('='.repeat(60));
console.log('\n【原始文本】:');
console.log(testCase2);
console.log('\n【格式化后】:');
console.log(generator.smartFormat(testCase2));

// ============================================
// 测试用例3: 生成HTML报告
// ============================================
console.log('\n' + '='.repeat(60));
console.log('测试用例3: 生成HTML报告');
console.log('='.repeat(60));

const testData = {
    title: '测试课程笔记',
    segments: [
        {
            segmentText: '原始课堂录音文本...',
            originalLength: 5000,
            response: {
                text: testCase1
            }
        },
        {
            segmentText: '第二段原始文本...',
            originalLength: 4500,
            response: {
                text: testCase2
            }
        }
    ]
};

const paths = generator.saveAll(testData, 'test-report');
console.log('\n生成的报告文件:');
console.log('- HTML:', paths.html);
console.log('- Markdown:', paths.markdown);

// ============================================
// 测试用例4: 强制格式化函数
// ============================================
console.log('\n' + '='.repeat(60));
console.log('测试用例4: 强制格式化函数');
console.log('='.repeat(60));

const noNewlineText = `首先我们来看一下基础概念。这是一个非常重要的知识点。其次需要注意的是实践操作。只有动手实践才能真正掌握。另外还要关注一些常见的坑。很多初学者都会踩到这些坑。最后总结一下今天的内容。希望大家回去好好复习。`;

console.log('\n【原始文本（无换行）】:');
console.log(noNewlineText);
console.log('\n【强制格式化后】:');
console.log(generator.forceFormat(noNewlineText));

// ============================================
// 测试用例5: SorryiosAutomation的cleanText函数
// ============================================
console.log('\n' + '='.repeat(60));
console.log('测试用例5: cleanText函数对比');
console.log('='.repeat(60));

const SorryiosAutomation = require('./sorryios-automation');
const automation = new SorryiosAutomation();

const textWithNewlines = `第一行内容
第二行内容

第三行内容（空行后）
   带缩进的行   
	制表符开头的行`;

console.log('\n【原始文本】:');
console.log(JSON.stringify(textWithNewlines));

console.log('\n【cleanText处理后】:');
console.log(JSON.stringify(automation.cleanText(textWithNewlines)));

console.log('\n【预期结果】应该保留换行符，只清理多余空白');

// ============================================
// 汇总
// ============================================
console.log('\n' + '='.repeat(60));
console.log('✅ 测试完成！请检查:');
console.log('='.repeat(60));
console.log('1. 格式化后的文本是否有正确的分段');
console.log('2. HTML报告是否美观可读');
console.log('3. cleanText是否保留了换行符');
console.log('\n生成的测试报告位于 ./test-output/ 目录');
