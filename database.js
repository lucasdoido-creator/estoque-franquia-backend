const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./estoque.db", (err) => {
  if (err) {
    console.error("Erro ao conectar no banco", err);
  } else {
    console.log("Banco conectado");
  }
});

function adicionarColunaSeNaoExistir(tabela, coluna, definicao) {
  db.all(`PRAGMA table_info(${tabela})`, (err, rows) => {
    if (err) return;

    const existe = rows.some((row) => row.name === coluna);
    if (existe) return;

    db.run(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
  });
}

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
      ativo INTEGER DEFAULT 1,
      FOREIGN KEY(unidade_id) REFERENCES unidades(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      categoria TEXT,
      unidade_medida TEXT,
      estoque_minimo REAL DEFAULT 0,
      codigo_barras TEXT,
      foto_url TEXT,
      unidade_id INTEGER,
      quantidade_embalagem REAL DEFAULT 1,
      custo_embalagem REAL DEFAULT 0,
      custo_unitario REAL DEFAULT 0,
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

  db.run(`
    CREATE TABLE IF NOT EXISTS boletos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fornecedor TEXT NOT NULL,
      descricao TEXT,
      valor REAL NOT NULL,
      vencimento TEXT NOT NULL,
      unidade_id INTEGER,
      observacao TEXT,
      status TEXT DEFAULT 'pendente',
      grupo_parcelamento TEXT,
      parcela_numero INTEGER DEFAULT 1,
      total_parcelas INTEGER DEFAULT 1,
      FOREIGN KEY(unidade_id) REFERENCES unidades(id)
    )
  `);

  db.run(`INSERT OR IGNORE INTO unidades (id, nome) VALUES (1, 'Matriz')`);

  db.run(`
    INSERT OR IGNORE INTO funcionarios
    (id, nome, login, senha, cargo, unidade_id, ativo)
    VALUES (1, 'Administrador', 'admin', '123', 'Administrador', 1, 1)
  `);

  db.run(`
    UPDATE funcionarios
    SET senha = '123',
        ativo = 1,
        cargo = 'Administrador',
        unidade_id = 1
    WHERE login = 'admin'
  `);

  adicionarColunaSeNaoExistir("produtos", "codigo_barras", "TEXT");
  adicionarColunaSeNaoExistir("produtos", "foto_url", "TEXT");
  adicionarColunaSeNaoExistir("produtos", "unidade_id", "INTEGER");
  adicionarColunaSeNaoExistir("produtos", "quantidade_embalagem", "REAL DEFAULT 1");
  adicionarColunaSeNaoExistir("produtos", "custo_embalagem", "REAL DEFAULT 0");
  adicionarColunaSeNaoExistir("produtos", "custo_unitario", "REAL DEFAULT 0");

  adicionarColunaSeNaoExistir("boletos", "grupo_parcelamento", "TEXT");
  adicionarColunaSeNaoExistir("boletos", "parcela_numero", "INTEGER DEFAULT 1");
  adicionarColunaSeNaoExistir("boletos", "total_parcelas", "INTEGER DEFAULT 1");
});

module.exports = db;