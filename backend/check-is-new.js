const Database = require("better-sqlite3");
const db = new Database("./data/vocabulary.db");

console.log("检查 is_new 状态:");
const phrase = db.prepare("SELECT id, phrase, is_new FROM phrases WHERE id = 2597").get();
console.log("ID:", phrase.id);
console.log("phrase:", phrase.phrase);
console.log("is_new:", phrase.is_new);

console.log("\n所有 is_new=1 的短语:");
const newPhrases = db.prepare("SELECT id, phrase FROM phrases WHERE is_new = 1").all();
console.log("找到", newPhrases.length, "条:");
newPhrases.forEach(p => console.log("  ID:" + p.id, p.phrase));

db.close();
