const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("estoque.db");

db.serialize(() => {
  db.run(`UPDATE produtos SET custo = 6 WHERE id = 2`);
  db.run(`UPDATE produtos SET custo = 9 WHERE id = 3`);

  console.log("Custos atualizados ✅");
});

db.close();