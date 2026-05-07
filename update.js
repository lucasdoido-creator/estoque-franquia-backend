const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("estoque.db");

db.serialize(() => {
  db.run(`ALTER TABLE produtos ADD COLUMN unidade_medida TEXT`, (err) => {
    if (err) console.log("unidade_medida:", err.message);
    else console.log("Coluna unidade_medida criada ✅");
  });

  db.run(`ALTER TABLE produtos ADD COLUMN estoque_minimo REAL`, (err) => {
    if (err) console.log("estoque_minimo:", err.message);
    else console.log("Coluna estoque_minimo criada ✅");
  });
});

db.close();