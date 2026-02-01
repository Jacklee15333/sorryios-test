const fs = require("fs");

console.log("详细检查匹配逻辑:");
console.log("");

const matchingServicePath = "./services/matchingService.js";
const content = fs.readFileSync(matchingServicePath, "utf8");

// 查找 matchText 函数或类似的匹配函数
const lines = content.split("\n");

console.log("查找短语匹配的关键代码:");
console.log("");

let inMatchFunction = false;
let matchFunctionLines = [];
let lineNumber = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    lineNumber = i + 1;
    
    // 查找包含 "phrase" 和匹配相关的行
    if (line.includes("phrase") && (line.includes("find") || line.includes("filter") || line.includes("===") || line.includes("==") || line.includes("match"))) {
        console.log("行 " + lineNumber + ":", line.trim());
    }
    
    // 查找标准化函数
    if (line.includes("normalize") || (line.includes("function") && line.includes("text"))) {
        console.log("\n找到可能的标准化函数 (行 " + lineNumber + "):");
        // 显示接下来的5行
        for (let j = i; j < Math.min(i + 6, lines.length); j++) {
            console.log("  " + lines[j]);
        }
        console.log("");
    }
}

console.log("\n查找 toLowerCase 的使用:");
const lowerCaseMatches = content.match(/.{0,50}\.toLowerCase\(\).{0,50}/g);
if (lowerCaseMatches) {
    lowerCaseMatches.slice(0, 5).forEach((match, i) => {
        console.log("  [" + (i+1) + "]", match.trim());
    });
}
