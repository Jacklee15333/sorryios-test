const fs = require("fs");

console.log("检查匹配算法:");
console.log("");

// 查找 matchingService.js
const matchingServicePath = "./services/matchingService.js";

if (fs.existsSync(matchingServicePath)) {
    const content = fs.readFileSync(matchingServicePath, "utf8");
    
    // 查找短语匹配的代码
    const phrasesMatch = content.match(/phrases\.find\([^)]+\)/g);
    const phrasesFilter = content.match(/phrases\.filter\([^)]+\)/g);
    
    console.log("找到的短语匹配代码:");
    if (phrasesMatch) {
        console.log("\nphrases.find 调用:");
        phrasesMatch.forEach((match, i) => {
            console.log("  [" + (i+1) + "]", match);
        });
    }
    
    if (phrasesFilter) {
        console.log("\nphrases.filter 调用:");
        phrasesFilter.forEach((match, i) => {
            console.log("  [" + (i+1) + "]", match);
        });
    }
    
    // 查找是否有标准化处理
    const hasNormalize = content.includes("normalize") || 
                        content.includes("REPLACE") || 
                        content.includes("toLowerCase") ||
                        content.includes("trim");
    
    console.log("\n是否使用标准化:", hasNormalize ? "✅ 是" : "❌ 否");
    
    // 查找完全匹配的代码
    const exactMatch = content.match(/===.*phrase|phrase.*===/g);
    if (exactMatch && exactMatch.length > 0) {
        console.log("\n⚠️ 发现精确匹配（===）:");
        exactMatch.slice(0, 5).forEach(match => console.log("  -", match));
    }
    
} else {
    console.log("❌ 未找到 matchingService.js");
}
