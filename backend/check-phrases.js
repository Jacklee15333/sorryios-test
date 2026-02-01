const Database = require("better-sqlite3");

console.log("=".repeat(60));
console.log("  重新诊断: tell sb. sth. (phrases 表)");
console.log("=".repeat(60));
console.log("");

const db = new Database("./data/vocabulary.db");

// 1. 精确查询 phrases 表
console.log("1️⃣  精确查询 phrases 表:");
const exact = db.prepare("SELECT * FROM phrases WHERE phrase = ?").get("tell sb. sth.");
if (exact) {
    console.log("   ✅ 找到记录");
    console.log("   ID:", exact.id);
    console.log("   phrase:", exact.phrase);
    console.log("   meaning:", exact.meaning);
    console.log("   enabled:", exact.enabled === 1 ? "✅ 启用" : "❌ 禁用");
    console.log("   category:", exact.category);
    console.log("   example:", exact.example);
} else {
    console.log("   ❌ 未找到记录");
}
console.log("");

// 2. 模糊查询 phrases 表
console.log("2️⃣  模糊查询 phrases 表 (包含 tell):");
const fuzzy = db.prepare("SELECT * FROM phrases WHERE phrase LIKE ?").all("%tell%");
console.log("   找到", fuzzy.length, "条记录:");
fuzzy.forEach(p => {
    console.log("   - ID:" + p.id, '"' + p.phrase + '"', "(enabled=" + p.enabled + ", meaning: " + p.meaning + ")");
});
console.log("");

// 3. 检查完整的记录（包括可能的空格问题）
console.log("3️⃣  检查字符编码:");
const tellRecord = db.prepare("SELECT * FROM phrases WHERE phrase LIKE ?").get("%tell sb%sth%");
if (tellRecord) {
    console.log("   找到记录 ID:", tellRecord.id);
    console.log("   phrase 长度:", tellRecord.phrase.length);
    console.log("   phrase 字符:");
    for (let i = 0; i < tellRecord.phrase.length; i++) {
        const char = tellRecord.phrase[i];
        const code = tellRecord.phrase.charCodeAt(i);
        console.log("     [" + i + "] '" + char + "' -> " + code);
    }
}

db.close();

console.log("");
console.log("=".repeat(60));
console.log("  诊断完成");
console.log("=".repeat(60));
