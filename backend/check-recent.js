const Database = require("better-sqlite3");
const db = new Database("./data/vocabulary.db");

console.log("检查最近添加的短语:");
console.log("");

// ID: 2597
const phrase1 = db.prepare("SELECT * FROM phrases WHERE id = 2597").get();
console.log("ID: 2597");
console.log("  phrase:", phrase1.phrase);
console.log("  is_new:", phrase1.is_new);
console.log("  enabled:", phrase1.enabled);
console.log("  category:", phrase1.category);
console.log("  created_at:", phrase1.created_at);
console.log("");

// ID: 2637
const phrase2 = db.prepare("SELECT * FROM phrases WHERE id = 2637").get();
console.log("ID: 2637");
console.log("  phrase:", phrase2.phrase);
console.log("  is_new:", phrase2.is_new);
console.log("  enabled:", phrase2.enabled);
console.log("  category:", phrase2.category);
console.log("  created_at:", phrase2.created_at);
console.log("");

// 查看最后10条记录
console.log("最后添加的10条短语:");
const latest = db.prepare("SELECT id, phrase, created_at, is_new FROM phrases ORDER BY id DESC LIMIT 10").all();
latest.forEach(p => {
    console.log("  ID:" + p.id, p.phrase, "| created_at:", p.created_at, "| is_new:", p.is_new);
});

db.close();
