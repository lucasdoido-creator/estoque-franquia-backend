const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("estoque.db");

const nomesParaResetar = [
  "%COCA%",
  "%AGUA C GAS%",
  "%ÁGUA C GÁS%",
  "%AGUA COM GAS%",
  "%ÁGUA COM GÁS%"
];

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, function (err, rows) {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function executar() {
  try {
    console.log("Buscando produtos para resetar...");

    const produtos = await all(
      `
      SELECT id, nome
      FROM produtos
      WHERE ${nomesParaResetar.map(() => "nome LIKE ?").join(" OR ")}
      `,
      nomesParaResetar
    );

    if (produtos.length === 0) {
      console.log("Nenhum produto encontrado.");
      return;
    }

    console.log("Produtos encontrados:");
    produtos.forEach((p) => console.log(`${p.id} - ${p.nome}`));

    const ids = produtos.map((p) => p.id);
    const placeholders = ids.map(() => "?").join(",");

    await run(
      `
      UPDATE estoques
      SET quantidade = 0,
          custo_unitario = 0
      WHERE produto_id IN (${placeholders})
      `,
      ids
    );

    await run(
      `
      UPDATE produtos
      SET quantidade_embalagem = 1,
          custo_embalagem = 0,
          custo_unitario = 0
      WHERE id IN (${placeholders})
      `,
      ids
    );

    console.log("Reset concluído com sucesso ✅");
  } catch (err) {
    console.error("Erro:", err.message);
  } finally {
    db.close();
  }
}

executar();