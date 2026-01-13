/**
 * 智能文本切分脚本
 * 功能：将长文本按语义边界切分成适合AI处理的短片段
 * 
 * 使用方法：
 *   node text-splitter.js --input "输入文件.txt" --output "输出.json" --max-length 6000
 */

const fs = require('fs');
const path = require('path');

// ============== 配置 ==============
const DEFAULT_CONFIG = {
    // 每个片段的最大字符数（6000适合GPT-5级别AI，约分6份）
    maxSegmentLength: 6000,
    
    // 每个片段的最小字符数（避免太碎）
    minSegmentLength: 500,
    
    // 重叠字符数（保持上下文连贯）
    overlapLength: 200,
    
    // 优先切分的分隔符（按优先级排序）
    separators: [
        '\n\n\n',      // 多空行（章节分隔）
        '\n\n',        // 双换行（段落分隔）
        '。\n',        // 句号+换行
        '！\n',        // 感叹号+换行
        '？\n',        // 问号+换行
        '。',          // 句号
        '！',          // 感叹号
        '？',          // 问号
        '；',          // 分号
        '，',          // 逗号
        '\n',          // 单换行
        ' ',           // 空格
    ],
};

// ============== 文本切分类 ==============

class TextSplitter {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * 预处理文本
     */
    preprocess(text) {
        // 统一换行符
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // 移除过多的空白行
        text = text.replace(/\n{4,}/g, '\n\n\n');
        
        // 移除首尾空白
        text = text.trim();
        
        return text;
    }

    /**
     * 查找最佳切分点（智能切分）
     * 规则：
     * 1. 绝不在英文单词中间切分
     * 2. 优先在句末标点（。？！；.!?;）后切分
     * 3. 其次在口语语气词（吧、呀、啊、呢、嘛）后切分
     * 4. 再次在次要标点（，,：:）后切分
     * 5. 最后在空格或中文字符后切分
     */
    findBestSplitPoint(text, targetLength) {
        // 如果文本长度小于目标，不需要切分
        if (text.length <= targetLength) {
            return text.length;
        }
        
        // 搜索范围：目标长度前500字符到后100字符
        const searchStart = Math.max(100, targetLength - 500);
        const searchEnd = Math.min(text.length, targetLength + 100);
        
        // 优先级1：句末标点（最优，确保句子完整）
        const sentenceEnders = ['。', '！', '？', '；', '…'];
        let bestPoint = this.findLastMarker(text, searchStart, searchEnd, sentenceEnders);
        if (bestPoint !== -1) {
            return bestPoint;
        }
        
        // 优先级2：英文句末标点（后面跟空格或换行）
        const englishEnders = ['. ', '! ', '? ', '; ', '.\n', '!\n', '?\n', ';\n'];
        bestPoint = this.findLastMarker(text, searchStart, searchEnd, englishEnders);
        if (bestPoint !== -1) {
            return bestPoint;
        }
        
        // 优先级3：口语语气词（针对语音转文字的无标点内容）
        // 这些词后面通常是句子结束
        bestPoint = this.findLastSentenceEndingWord(text, searchStart, searchEnd);
        if (bestPoint !== -1) {
            return bestPoint;
        }
        
        // 优先级4：换行符（段落边界）
        bestPoint = this.findLastMarker(text, searchStart, searchEnd, ['\n']);
        if (bestPoint !== -1) {
            return bestPoint;
        }
        
        // 优先级5：中文逗号、冒号等
        const chinesePunct = ['，', '：', '）', '】', '"', '"'];
        bestPoint = this.findLastMarker(text, searchStart, searchEnd, chinesePunct);
        if (bestPoint !== -1) {
            return bestPoint;
        }
        
        // 优先级6：英文逗号、冒号（后面跟空格）
        const englishPunct = [', ', ': ', ') '];
        bestPoint = this.findLastMarker(text, searchStart, searchEnd, englishPunct);
        if (bestPoint !== -1) {
            return bestPoint;
        }
        
        // 优先级7：空格（英文单词边界）
        bestPoint = this.findLastMarker(text, searchStart, searchEnd, [' ']);
        if (bestPoint !== -1) {
            return bestPoint;
        }
        
        // 最后保底：确保不切在英文单词中间
        let safePoint = targetLength;
        
        // 如果当前位置是英文字母，往前找到单词开始
        while (safePoint > searchStart && this.isEnglishChar(text.charAt(safePoint))) {
            safePoint--;
        }
        
        // 如果往前找太远了（超过200字符），往后找到单词结束
        if (targetLength - safePoint > 200) {
            safePoint = targetLength;
            while (safePoint < searchEnd && this.isEnglishChar(text.charAt(safePoint))) {
                safePoint++;
            }
        }
        
        return safePoint > 0 ? safePoint : targetLength;
    }
    
    /**
     * 查找最后一个句子结束语气词的位置
     * 适用于语音转文字的无标点文本
     */
    findLastSentenceEndingWord(text, start, end) {
        const searchText = text.substring(start, end);
        
        // 口语中常见的句子结束模式（语气词后面不跟中文字符时认为是句子结束）
        // "对吧"、"知道吧"、"是吧"、"好吧"、"对不对"、"知道吗"、"可以吧"
        const patterns = [
            /对吧(?![一-龥])/g,
            /知道吧(?![一-龥])/g,
            /是吧(?![一-龥])/g,
            /好吧(?![一-龥])/g,
            /对不对(?![一-龥])/g,
            /知道吗(?![一-龥])/g,
            /可以吧(?![一-龥])/g,
            /好的(?![一-龥])/g,
            /行吧(?![一-龥])/g,
            /对呀(?![一-龥])/g,
            /是呀(?![一-龥])/g,
            /嘛(?![一-龥])/g,
            /呢(?![一-龥])/g,
            /呀(?![一-龥])/g,
            /啊(?![一-龥])/g,
            /吧(?![一-龥])/g,
        ];
        
        let lastPos = -1;
        let lastLen = 0;
        
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(searchText)) !== null) {
                if (match.index > lastPos) {
                    lastPos = match.index;
                    lastLen = match[0].length;
                }
            }
        }
        
        if (lastPos !== -1) {
            return start + lastPos + lastLen;
        }
        
        return -1;
    }
    
    /**
     * 在指定范围内查找最后一个标记的位置
     * 返回标记之后的位置（即切分点）
     */
    findLastMarker(text, start, end, markers) {
        const searchText = text.substring(start, end);
        
        let lastPos = -1;
        let lastMarker = '';
        
        for (const marker of markers) {
            const pos = searchText.lastIndexOf(marker);
            if (pos !== -1 && pos > lastPos) {
                lastPos = pos;
                lastMarker = marker;
            }
        }
        
        if (lastPos !== -1) {
            // 返回标记之后的位置
            return start + lastPos + lastMarker.length;
        }
        
        return -1;
    }
    
    /**
     * 判断字符是否是英文字母
     */
    isEnglishChar(char) {
        if (!char) return false;
        const code = char.charCodeAt(0);
        // a-z: 97-122, A-Z: 65-90
        return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    }

    /**
     * 切分文本
     */
    split(text) {
        const { maxSegmentLength, overlapLength } = this.config;
        
        // 预处理
        text = this.preprocess(text);
        
        const segments = [];
        let currentPosition = 0;
        
        while (currentPosition < text.length) {
            // 计算这个片段应该包含的文本
            const remainingText = text.substring(currentPosition);
            
            // 查找最佳切分点
            const splitPoint = this.findBestSplitPoint(remainingText, maxSegmentLength);
            
            // 提取片段
            let segment = remainingText.substring(0, splitPoint).trim();
            
            if (segment.length > 0) {
                segments.push({
                    index: segments.length,
                    content: segment,
                    startPosition: currentPosition,
                    endPosition: currentPosition + splitPoint,
                    charCount: segment.length,
                });
            }
            
            // 移动位置（考虑重叠）
            if (splitPoint >= remainingText.length) {
                break;
            }
            
            // 计算新的起始位置
            let newPosition = currentPosition + splitPoint - overlapLength;
            
            // 确保新起始位置不在英文单词中间
            // 如果新位置是英文字母，往后移动直到不是英文字母
            while (newPosition < text.length && this.isEnglishChar(text.charAt(newPosition))) {
                newPosition++;
            }
            
            currentPosition = newPosition;
            
            // 避免无限循环
            if (currentPosition <= (segments.length > 0 ? segments[segments.length - 1].startPosition : -1)) {
                currentPosition = (segments.length > 0 ? segments[segments.length - 1].endPosition : 0);
            }
        }
        
        return segments;
    }

    /**
     * 按段落切分（更简单的方式）
     */
    splitByParagraphs(text, maxParagraphsPerSegment = 5) {
        text = this.preprocess(text);
        
        // 按双换行切分段落
        const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
        
        const segments = [];
        let currentSegment = [];
        let currentLength = 0;
        
        for (const paragraph of paragraphs) {
            // 如果加入这个段落会超过限制，先保存当前片段
            if (currentSegment.length >= maxParagraphsPerSegment || 
                (currentLength + paragraph.length > this.config.maxSegmentLength && currentSegment.length > 0)) {
                segments.push({
                    index: segments.length,
                    content: currentSegment.join('\n\n'),
                    paragraphCount: currentSegment.length,
                    charCount: currentLength,
                });
                currentSegment = [];
                currentLength = 0;
            }
            
            currentSegment.push(paragraph);
            currentLength += paragraph.length + 2; // +2 for \n\n
        }
        
        // 保存最后一个片段
        if (currentSegment.length > 0) {
            segments.push({
                index: segments.length,
                content: currentSegment.join('\n\n'),
                paragraphCount: currentSegment.length,
                charCount: currentLength,
            });
        }
        
        return segments;
    }

    /**
     * 按时间戳切分（适用于Whisper转写的文本）
     * 假设文本格式: [00:00:00] 内容
     */
    splitByTimestamp(text, segmentDurationMinutes = 5) {
        text = this.preprocess(text);
        
        // 匹配时间戳格式 [HH:MM:SS] 或 [MM:SS]
        const timestampRegex = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g;
        
        const segments = [];
        let currentSegment = { content: '', startTime: null, endTime: null };
        
        // 找出所有时间戳
        const matches = [...text.matchAll(timestampRegex)];
        
        if (matches.length === 0) {
            // 没有时间戳，使用普通切分
            return this.split(text);
        }
        
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const hours = match[3] ? parseInt(match[1]) : 0;
            const minutes = match[3] ? parseInt(match[2]) : parseInt(match[1]);
            const seconds = match[3] ? parseInt(match[3]) : parseInt(match[2]);
            const totalMinutes = hours * 60 + minutes + seconds / 60;
            
            // 获取这个时间戳后到下一个时间戳前的文本
            const startIndex = match.index + match[0].length;
            const endIndex = i < matches.length - 1 ? matches[i + 1].index : text.length;
            const content = text.substring(startIndex, endIndex).trim();
            
            if (currentSegment.startTime === null) {
                currentSegment.startTime = totalMinutes;
            }
            
            currentSegment.content += (currentSegment.content ? ' ' : '') + content;
            currentSegment.endTime = totalMinutes;
            
            // 检查是否需要开始新片段
            const duration = currentSegment.endTime - currentSegment.startTime;
            if (duration >= segmentDurationMinutes || 
                currentSegment.content.length > this.config.maxSegmentLength) {
                segments.push({
                    index: segments.length,
                    content: currentSegment.content,
                    startTime: formatTime(currentSegment.startTime),
                    endTime: formatTime(currentSegment.endTime),
                    durationMinutes: duration,
                    charCount: currentSegment.content.length,
                });
                currentSegment = { content: '', startTime: null, endTime: null };
            }
        }
        
        // 保存最后一个片段
        if (currentSegment.content.length > 0) {
            const duration = (currentSegment.endTime || 0) - (currentSegment.startTime || 0);
            segments.push({
                index: segments.length,
                content: currentSegment.content,
                startTime: formatTime(currentSegment.startTime || 0),
                endTime: formatTime(currentSegment.endTime || 0),
                durationMinutes: duration,
                charCount: currentSegment.content.length,
            });
        }
        
        return segments;
    }
}

// ============== 辅助函数 ==============

function formatTime(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor(totalMinutes % 60);
    const seconds = Math.round((totalMinutes % 1) * 60);
    
    if (hours > 0) {
        return hours.toString().padStart(2, '0') + ':' + minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
    }
    return minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
}

function detectTextType(text) {
    // 检测是否包含时间戳
    const hasTimestamp = /\[\d{1,2}:\d{2}(?::\d{2})?\]/.test(text);
    if (hasTimestamp) return 'transcript';
    
    // 检测是否是对话格式
    const hasDialogue = /^[A-Za-z\u4e00-\u9fa5]+[:：]/.test(text);
    if (hasDialogue) return 'dialogue';
    
    // 检测是否有明显的段落结构
    const paragraphCount = (text.match(/\n\n/g) || []).length;
    if (paragraphCount > 5) return 'article';
    
    return 'general';
}

// ============== 主函数 ==============

async function main() {
    // 解析命令行参数
    const args = process.argv.slice(2);
    let inputFile = null;
    let outputFile = null;
    let maxLength = 6000;
    let mode = 'auto'; // auto, paragraph, timestamp, simple
    
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--input':
            case '-i':
                inputFile = args[++i];
                break;
            case '--output':
            case '-o':
                outputFile = args[++i];
                break;
            case '--max-length':
            case '-l':
                maxLength = parseInt(args[++i]);
                break;
            case '--mode':
            case '-m':
                mode = args[++i];
                break;
        }
    }
    
    if (!inputFile) {
        console.error('Usage: node text-splitter.js --input <file> [--output <file>] [--max-length 6000] [--mode auto|paragraph|timestamp|simple]');
        process.exit(1);
    }
    
    // 读取输入文件
    console.log('Reading file: ' + inputFile);
    const text = fs.readFileSync(inputFile, 'utf-8');
    console.log('File size: ' + text.length + ' characters');
    
    // 创建切分器
    const splitter = new TextSplitter({ maxSegmentLength: maxLength });
    
    // 根据模式选择切分方法
    let segments;
    if (mode === 'auto') {
        const textType = detectTextType(text);
        console.log('Detected text type: ' + textType);
        
        switch (textType) {
            case 'transcript':
                segments = splitter.splitByTimestamp(text);
                break;
            case 'article':
                segments = splitter.splitByParagraphs(text);
                break;
            default:
                segments = splitter.split(text);
        }
    } else if (mode === 'paragraph') {
        segments = splitter.splitByParagraphs(text);
    } else if (mode === 'timestamp') {
        segments = splitter.splitByTimestamp(text);
    } else {
        segments = splitter.split(text);
    }
    
    console.log('Split complete: ' + segments.length + ' segments');
    
    // 输出统计
    const stats = {
        totalCharacters: text.length,
        segmentCount: segments.length,
        averageSegmentLength: Math.round(segments.reduce((sum, s) => sum + s.charCount, 0) / segments.length),
        minSegmentLength: Math.min(...segments.map(s => s.charCount)),
        maxSegmentLength: Math.max(...segments.map(s => s.charCount)),
    };
    
    console.log('\nStatistics:');
    console.log('  Total characters: ' + stats.totalCharacters);
    console.log('  Segment count: ' + stats.segmentCount);
    console.log('  Average length: ' + stats.averageSegmentLength);
    console.log('  Min segment: ' + stats.minSegmentLength);
    console.log('  Max segment: ' + stats.maxSegmentLength);
    
    // 准备输出
    const output = {
        sourceFile: inputFile,
        splitMode: mode,
        config: {
            maxSegmentLength: maxLength,
        },
        statistics: stats,
        segments: segments.map(s => s.content),  // 只输出内容，供下一步使用
        segmentDetails: segments,  // 完整信息
        createdAt: new Date().toISOString(),
    };
    
    // 输出结果
    if (outputFile) {
        fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), 'utf-8');
        console.log('\nResults saved to: ' + outputFile);
    } else {
        console.log('\nSplit results:');
        console.log(JSON.stringify(output, null, 2));
    }
}

// 运行
if (require.main === module) {
    main().catch(console.error);
}

// 导出供其他模块使用
module.exports = { TextSplitter, detectTextType };