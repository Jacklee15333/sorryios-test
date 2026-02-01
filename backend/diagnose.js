const Database = require("better-sqlite3");

console.log("=".repeat(60));
console.log("  匹配失败诊断: tell sb. sth.");
console.log("=".repeat(60));
console.log("");

const db = new Database("./data/vocabulary.db");

// 1. 精确查询
console.log("1️⃣  精确查询:");
const exact = db.prepare("SELECT * FROM patterns WHERE pattern = ?").get("tell sb. sth.");
if (exact) {
    console.log("   ✅ 找到记录");
    console.log("   ID:", exact.id);
    console.log("   pattern:", exact.pattern);
    console.log("   enabled:", exact.enabled === 1 ? "✅ 启用" : "❌ 禁用");
    console.log("   meaning:", exact.meaning);
} else {
    console.log("   ❌ 未找到记录");
}
console.log("");

// 2. 模糊查询
console.log("2️⃣  模糊查询 (包含 tell):");
const fuzzy = db.prepare("SELECT * FROM patterns WHERE pattern LIKE ?").all("%tell%");
console.log("   找到", fuzzy.length, "条记录:");
fuzzy.forEach(p => {
    console.log("   - ID:" + p.id, '"' + p.pattern + '"', "(enabled=" + p.enabled + ")");
});
console.log("");

// 3. 查询所有 sb 相关的句型
console.log("3️⃣  查询包含 sb 的句型:");
const sbPatterns = db.prepare("SELECT * FROM patterns WHERE pattern LIKE ?").all("%sb%");
console.log("   找到", sbPatterns.length, "条记录:");
sbPatterns.forEach(p => {
    console.log("   - ID:" + p.id, '"' + p.pattern + '"', "(enabled=" + p.enabled + ")");
});
console.log("");

// 4. 统计
console.log("4️⃣  句型统计:");
const total = db.prepare("SELECT COUNT(*) as c FROM patterns").get().c;
const enabled = db.prepare("SELECT COUNT(*) as c FROM patterns WHERE enabled = 1").get().c;
console.log("   总数:", total);
console.log("   启用:", enabled);
console.log("   禁用:", total - enabled);
console.log("");

// 5. 查看前20个句型
console.log("5️⃣  前20个句型:");
const top20 = db.prepare("SELECT id, pattern, enabled FROM patterns ORDER BY id LIMIT 20").all();
top20.forEach(p => {
    const status = p.enabled === 1 ? "✅" : "❌";
    console.log("   " + status + " ID:" + p.id + ' "' + p.pattern + '"');
});

db.close();

console.log("");
console.log("=".repeat(60));
console.log("  诊断完成");
console.log("=".repeat(60));
