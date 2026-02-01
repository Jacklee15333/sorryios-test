/**
 * aiProcessor 修复验证脚本
 * 
 * 用途：验证修复后的AI分类是否正确
 * 运行：node verify-ai-classification.js
 */

const fs = require('fs');
const path = require('path');

// 颜色输出
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// 测试用例
const TEST_CASES = [
    {
        name: '测试1：单词讲解（proper）',
        input: '我们来学习proper这个词，proper是形容词，表示合适的，用法是proper + 名词',
        expectedCategory: 'words',
        expectedValue: 'proper',
        description: 'AI应该将"proper"识别为单词，而不是语法'
    },
    {
        name: '测试2：语法讲解（现在完成时）',
        input: '今天我们学习现在完成时，构成是have/has + 过去分词',
        expectedCategory: 'grammar',
        expectedValue: '现在完成时',
        description: 'AI应该将"现在完成时"识别为语法点'
    },
    {
        name: '测试3：固定短语（look at）',
        input: 'look at是固定短语，表示看',
        expectedCategory: 'phrases',
        expectedValue: 'look at',
        description: 'AI应该将"look at"识别为短语'
    },
    {
        name: '测试4：句型模板（it is adj. to do sth.）',
        input: 'it is adj. to do sth.是一个重要句型',
        expectedCategory: 'patterns',
        expectedValue: 'it is adj. to do sth.',
        description: 'AI应该将句型识别为patterns，而不是phrases'
    }
];

// 读取修复后的文件
function checkFileUpdated() {
    const filePath = path.join(__dirname, 'aiProcessor.js');
    
    if (!fs.existsSync(filePath)) {
        log('❌ 错误：找不到 aiProcessor.js 文件', 'red');
        return false;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    // 检查关键修复点
    const checks = [
        {
            name: '单词 vs 语法的严格区分',
            pattern: /【单词 vs 语法的严格区分 - 极其重要】/,
            found: false
        },
        {
            name: '句型模板说明',
            pattern: /以下是\【句型模板\】，要放入 patterns/,
            found: false
        },
        {
            name: 'detailPrompt重要提醒',
            pattern: /如果是单个英文单词.*生成到words/,
            found: false
        },
        {
            name: 'phrases vs patterns快速判断',
            pattern: /【phrases vs patterns 快速判断】/,
            found: false
        }
    ];
    
    log('\n' + '═'.repeat(80), 'cyan');
    log('文件修复检查', 'cyan');
    log('═'.repeat(80), 'cyan');
    
    let allFound = true;
    
    for (const check of checks) {
        check.found = check.pattern.test(content);
        if (check.found) {
            log(`✅ ${check.name}`, 'green');
        } else {
            log(`❌ ${check.name}`, 'red');
            allFound = false;
        }
    }
    
    log('═'.repeat(80), 'cyan');
    
    if (allFound) {
        log('\n✅ 文件已正确更新，包含所有修复内容', 'green');
        return true;
    } else {
        log('\n❌ 文件缺少某些修复内容，请检查是否使用了正确的文件', 'red');
        return false;
    }
}

// 主函数
function main() {
    log('═'.repeat(80), 'cyan');
    log('aiProcessor.js 修复验证脚本', 'cyan');
    log('═'.repeat(80), 'cyan');
    
    // 检查文件是否已更新
    const fileOk = checkFileUpdated();
    
    if (!fileOk) {
        log('\n⚠️  请先替换 aiProcessor.js 文件，然后再运行此脚本', 'yellow');
        process.exit(1);
    }
    
    // 说明测试用例
    log('\n' + '═'.repeat(80), 'cyan');
    log('测试用例说明', 'cyan');
    log('═'.repeat(80), 'cyan');
    
    log('\n⚠️  注意：此脚本只检查文件是否包含修复内容', 'yellow');
    log('要完整测试AI分类是否正确，需要：', 'yellow');
    log('1. 重启服务（运行 update.bat）', 'yellow');
    log('2. 上传实际的音频文件', 'yellow');
    log('3. 检查AI提取的JSON结果', 'yellow');
    
    log('\n预期的AI行为：', 'cyan');
    TEST_CASES.forEach((test, i) => {
        log(`\n[测试${i + 1}] ${test.name}`, 'white');
        log(`  输入: "${test.input.substring(0, 50)}..."`, 'white');
        log(`  预期分类: ${test.expectedCategory}`, 'green');
        log(`  预期值: "${test.expectedValue}"`, 'green');
        log(`  说明: ${test.description}`, 'yellow');
    });
    
    log('\n' + '═'.repeat(80), 'cyan');
    log('验证完成', 'cyan');
    log('═'.repeat(80), 'cyan');
    
    log('\n📋 下一步操作：', 'cyan');
    log('1. 重启服务：cd D:\\sorryios-test && update.bat', 'white');
    log('2. 上传测试音频（包含单词讲解的录音）', 'white');
    log('3. 查看AI提取结果，确认分类是否正确', 'white');
    log('4. 如果发现"proper"仍被识别为语法，请检查文件是否正确替换', 'white');
}

// 执行
main();
