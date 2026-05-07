const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("estoque.db");

db.run(
  `UPDATE funcionarios SET ativo = 1, senha = '123', cargo = 'admin' WHERE login = 'admin'`,
  function (err) {
    if (err) {
      console.error(err.message);
    } else {
      console.log("Admin reativado ✅");
    }

    db.close();
  }
);