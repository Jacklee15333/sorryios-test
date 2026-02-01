const Database = require("better-sqlite3");

console.log("模拟匹配过程:");
console.log("");

const db = new Database("./data/vocabulary.db");

// 模拟 AI 提取的文本
const extractedTexts = [
    "tell sb. sth.",
    "tell sb sth",
    "tell sb. sth",
    "tell sb sth."
];

console.log("测试不同格式的匹配:");
extractedTexts.forEach(text => {
    // 精确匹配
    const exact = db.prepare("SELECT id, phrase FROM phrases WHERE phrase = ?").get(text);
    
    // 标准化后匹配（去除点和多余空格）
    const normalized = db.prepare("SELECT id, phrase FROM phrases WHERE REPLACE(REPLACE(LOWER(phrase), '.', ''), '  ', ' ') = REPLACE(REPLACE(LOWER(?), '.', ''), '  ', ' ')").get(text);
    
    console.log("  \"" + text + "\":");
    console.log("    精确匹配:", exact ? "✅ ID:" + exact.id : "❌");
    console.log("    标准化匹配:", normalized ? "✅ ID:" + normalized.id : "❌");
});

db.close();
