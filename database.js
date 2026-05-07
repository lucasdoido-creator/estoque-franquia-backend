const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./estoque.db", (err) => {
  if (err) {
    console.error("Erro ao conectar no banco", err);
  } else {
    console.log("Banco conectado 🚀");
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
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      categoria TEXT,
      unidade_medida TEXT,
      estoque_minimo REAL DEFAULT 0
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
      ativo INTEGER DEFAULT 1,
      FOREIGN KEY(unidade_id) REFERENCES unidades(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS estoques (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      unidade_id INTEGER NOT NULL,
      quantidade REAL DEFAULT 0,
      custo_unitario REAL DEFAULT 0,
      FOREIGN KEY(produto_id) REFERENCES produtos(id),
      FOREIGN KEY(unidade_id) REFERENCES unidades(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS movimentacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      unidade_id INTEGER NOT NULL,
      funcionario_id INTEGER,
      tipo TEXT NOT NULL,
      quantidade REAL NOT NULL,
      custo_unitario REAL DEFAULT 0,
      observacao TEXT,
      data_movimento DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(produto_id) REFERENCES produtos(id),
      FOREIGN KEY(unidade_id) REFERENCES unidades(id),
      FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id)
    )
  `);
});

module.exports = db;