const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./estoque.db", (err) => {
  if (err) {
    console.error("Erro ao conectar no banco", err);
  } else {
    console.log("Banco conectado");
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS unidades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS funcionarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      login TEXT NOT NULL UNIQUE,
      senha TEXT NOT NULL,
      cargo TEXT,
      unidade_id INTEGER,
      ativo INTEGER DEFAULT 1
    )
  `);

  db.run(`
    INSERT OR IGNORE INTO unidades (id, nome)
    VALUES (1, 'Matriz')
  `);

  db.run(`
    INSERT OR IGNORE INTO funcionarios
    (id, nome, login, senha, cargo, unidade_id, ativo)
    VALUES
    (1, 'Administrador', 'admin', '123', 'Administrador', 1, 1)
  `);

  db.run(`
    UPDATE funcionarios
    SET senha='123', ativo=1
    WHERE login='admin'
  `);
});

module.exports = db;