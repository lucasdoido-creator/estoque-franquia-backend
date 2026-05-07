const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("estoque.db");

function adicionarColuna(tabela, coluna, tipo) {
  db.all(`PRAGMA table_info(${tabela})`, (err, rows) => {
    if (err) {
      console.log(err.message);
      return;
    }

    const existe = rows.some((r) => r.name === coluna);

    if (existe) {
      console.log(`${tabela}.${coluna} já existe ✅`);
      return;
    }

    db.run(
      `ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`,
      (erro) => {
        if (erro) {
          console.log(`Erro ao criar ${coluna}:`, erro.message);
        } else {
          console.log(`${tabela}.${coluna} criada ✅`);
        }
      }
    );
  });
}

db.serialize(() => {
  adicionarColuna(
    "produtos",
    "quantidade_embalagem",
    "REAL DEFAULT 1"
  );

  adicionarColuna(
    "produtos",
    "custo_embalagem",
    "REAL DEFAULT 0"
  );

  adicionarColuna(
    "produtos",
    "custo_unitario",
    "REAL DEFAULT 0"
  );
});

setTimeout(() => {
  db.close();
}, 2000);