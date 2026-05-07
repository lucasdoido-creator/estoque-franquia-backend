const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 5000;
const SERVER_IP = "192.168.1.126";

const db = new sqlite3.Database("estoque.db");

/* =========================
   UPLOADS
========================= */

const uploadPath = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath);
}

app.use("/uploads", express.static(uploadPath));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadPath);
  },

  filename: function (req, file, cb) {
    const nome = Date.now() + "-" + file.originalname.replace(/\s+/g, "-");
    cb(null, nome);
  },
});

const upload = multer({ storage });

app.post("/upload", upload.single("imagem"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ erro: "Nenhuma imagem enviada" });
  }

  res.json({
    url: `http://${SERVER_IP}:${PORT}/uploads/${req.file.filename}`,
  });
});

/* =========================
   LOGIN
========================= */

app.post("/login", (req, res) => {
  const { login, senha } = req.body;

  db.get(
    `
    SELECT 
      f.*,
      u.nome as unidade
    FROM funcionarios f
    LEFT JOIN unidades u ON f.unidade_id = u.id
    WHERE 
      f.login = ?
      AND f.senha = ?
      AND f.ativo = 1
    `,
    [login, senha],
    (err, row) => {
      if (err) return res.status(500).json({ erro: err.message });

      if (!row) {
        return res.status(401).json({
          erro: "Login ou senha inválidos",
        });
      }

      res.json(row);
    }
  );
});

/* =========================
   FUNCIONÁRIOS
========================= */

app.get("/funcionarios", (req, res) => {
  db.all(
    `
    SELECT 
      f.*,
      u.nome as unidade
    FROM funcionarios f
    LEFT JOIN unidades u ON f.unidade_id = u.id
    ORDER BY f.nome
    `,
    (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows);
    }
  );
});

app.post("/funcionarios", (req, res) => {
  const { nome, login, senha, cargo, unidade_id } = req.body;

  db.run(
    `
    INSERT INTO funcionarios
    (nome, login, senha, cargo, unidade_id, ativo)
    VALUES (?, ?, ?, ?, ?, 1)
    `,
    [nome, login, senha, cargo, unidade_id],
    function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ id: this.lastID, sucesso: true });
    }
  );
});

app.put("/funcionarios/:id", (req, res) => {
  const { nome, login, senha, cargo, unidade_id } = req.body;

  db.run(
    `
    UPDATE funcionarios
    SET
      nome = ?,
      login = ?,
      senha = CASE WHEN ? = '' THEN senha ELSE ? END,
      cargo = ?,
      unidade_id = ?
    WHERE id = ?
    `,
    [nome, login, senha, senha, cargo, unidade_id, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ sucesso: true });
    }
  );
});

app.put("/funcionarios/:id/ativar", (req, res) => {
  db.run(
    `UPDATE funcionarios SET ativo = 1 WHERE id = ?`,
    [req.params.id],
    function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ sucesso: true });
    }
  );
});

app.put("/funcionarios/:id/desativar", (req, res) => {
  db.run(
    `UPDATE funcionarios SET ativo = 0 WHERE id = ?`,
    [req.params.id],
    function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ sucesso: true });
    }
  );
});

/* =========================
   UNIDADES
========================= */

app.get("/unidades", (req, res) => {
  db.all(`SELECT * FROM unidades ORDER BY nome`, (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});

app.post("/unidades", (req, res) => {
  db.run(
    `INSERT INTO unidades (nome) VALUES (?)`,
    [req.body.nome],
    function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ id: this.lastID, sucesso: true });
    }
  );
});

app.put("/unidades/:id", (req, res) => {
  db.run(
    `UPDATE unidades SET nome = ? WHERE id = ?`,
    [req.body.nome, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ sucesso: true });
    }
  );
});

app.delete("/unidades/:id", (req, res) => {
  db.run(`DELETE FROM unidades WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ sucesso: true });
  });
});

/* =========================
   PRODUTOS
========================= */

function calcularCustoUnitario(custoEmbalagem, quantidadeEmbalagem) {
  const custo = Number(custoEmbalagem || 0);
  const qtd = Number(quantidadeEmbalagem || 1);

  if (!qtd || qtd <= 0) return 0;

  return custo / qtd;
}

app.get("/produtos", (req, res) => {
  db.all(
    `
    SELECT 
      p.*,
      u.nome as unidade
    FROM produtos p
    LEFT JOIN unidades u ON p.unidade_id = u.id
    ORDER BY p.nome
    `,
    (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows);
    }
  );
});

app.post("/produtos", (req, res) => {
  const {
    nome,
    categoria,
    unidade_medida,
    estoque_minimo,
    codigo_barras,
    foto_url,
    unidade_id,
    quantidade_embalagem,
    custo_embalagem,
    custo_unitario,
  } = req.body;

  const qtdEmb = Number(quantidade_embalagem || 1);
  const custoEmb = Number(custo_embalagem || 0);
  const custoUnit =
    Number(custo_unitario || 0) > 0
      ? Number(custo_unitario)
      : calcularCustoUnitario(custoEmb, qtdEmb);

  db.run(
    `
    INSERT INTO produtos
    (
      nome,
      categoria,
      unidade_medida,
      estoque_minimo,
      codigo_barras,
      foto_url,
      unidade_id,
      quantidade_embalagem,
      custo_embalagem,
      custo_unitario
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      nome,
      categoria,
      unidade_medida,
      Number(estoque_minimo || 0),
      codigo_barras,
      foto_url,
      unidade_id || null,
      qtdEmb,
      custoEmb,
      custoUnit,
    ],
    function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({
        id: this.lastID,
        sucesso: true,
      });
    }
  );
});

app.put("/produtos/:id", (req, res) => {
  const {
    nome,
    categoria,
    unidade_medida,
    estoque_minimo,
    codigo_barras,
    foto_url,
    unidade_id,
    quantidade_embalagem,
    custo_embalagem,
    custo_unitario,
  } = req.body;

  const qtdEmb = Number(quantidade_embalagem || 1);
  const custoEmb = Number(custo_embalagem || 0);
  const custoUnit =
    Number(custo_unitario || 0) > 0
      ? Number(custo_unitario)
      : calcularCustoUnitario(custoEmb, qtdEmb);

  db.run(
    `
    UPDATE produtos
    SET
      nome = ?,
      categoria = ?,
      unidade_medida = ?,
      estoque_minimo = ?,
      codigo_barras = ?,
      foto_url = ?,
      unidade_id = ?,
      quantidade_embalagem = ?,
      custo_embalagem = ?,
      custo_unitario = ?
    WHERE id = ?
    `,
    [
      nome,
      categoria,
      unidade_medida,
      Number(estoque_minimo || 0),
      codigo_barras,
      foto_url,
      unidade_id || null,
      qtdEmb,
      custoEmb,
      custoUnit,
      req.params.id,
    ],
    function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ sucesso: true });
    }
  );
});

app.delete("/produtos/:id", (req, res) => {
  db.run(`DELETE FROM produtos WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ sucesso: true });
  });
});

/* =========================
   ESTOQUE
========================= */

app.get("/estoque", (req, res) => {
  db.all(
    `
    SELECT 
      e.*,
      p.nome as produto,
      p.categoria,
      p.unidade_medida,
      p.estoque_minimo,
      p.foto_url,
      p.quantidade_embalagem,
      p.custo_embalagem,
      p.custo_unitario as custo_unitario_produto,
      u.nome as unidade
    FROM estoques e
    JOIN produtos p ON e.produto_id = p.id
    JOIN unidades u ON e.unidade_id = u.id
    ORDER BY p.nome
    `,
    (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows);
    }
  );
});

/* =========================
   MOVIMENTAÇÕES
========================= */

app.post("/movimentar", (req, res) => {
  const {
    produto_id,
    unidade_id,
    funcionario_id,
    tipo,
    quantidade,
    custo_unitario,
    observacao,
  } = req.body;

  const qtd = Number(quantidade || 0);
  const custo = Number(custo_unitario || 0);

  if (!produto_id || !unidade_id || !funcionario_id || !tipo || !qtd) {
    return res.status(400).json({
      erro: "Dados obrigatórios incompletos",
    });
  }

  const quantidadeFinal =
    tipo === "saida" || tipo === "perca" ? -qtd : qtd;

  db.serialize(() => {
    db.run(
      `
      INSERT INTO movimentacoes
      (
        produto_id,
        unidade_id,
        funcionario_id,
        tipo,
        quantidade,
        custo_unitario,
        observacao
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        produto_id,
        unidade_id,
        funcionario_id,
        tipo,
        qtd,
        custo,
        observacao || "",
      ],
      function (err) {
        if (err) return res.status(500).json({ erro: err.message });

        if (custo > 0) {
          db.run(
            `
            UPDATE produtos
            SET 
              custo_unitario = ?,
              custo_embalagem = CASE 
                WHEN quantidade_embalagem IS NOT NULL AND quantidade_embalagem > 0
                THEN ? * quantidade_embalagem
                ELSE custo_embalagem
              END
            WHERE id = ?
            `,
            [custo, custo, produto_id]
          );
        }

        db.get(
          `
          SELECT id, quantidade, custo_unitario
          FROM estoques
          WHERE produto_id = ? AND unidade_id = ?
          `,
          [produto_id, unidade_id],
          (erroBusca, estoqueExistente) => {
            if (erroBusca) {
              return res.status(500).json({ erro: erroBusca.message });
            }

            if (estoqueExistente) {
              db.run(
                `
                UPDATE estoques
                SET 
                  quantidade = quantidade + ?,
                  custo_unitario = CASE 
                    WHEN ? > 0 THEN ? 
                    ELSE custo_unitario 
                  END
                WHERE id = ?
                `,
                [quantidadeFinal, custo, custo, estoqueExistente.id],
                function (erroUpdate) {
                  if (erroUpdate) {
                    return res.status(500).json({ erro: erroUpdate.message });
                  }

                  res.json({ sucesso: true });
                }
              );
            } else {
              db.run(
                `
                INSERT INTO estoques
                (
                  produto_id,
                  unidade_id,
                  quantidade,
                  custo_unitario
                )
                VALUES (?, ?, ?, ?)
                `,
                [produto_id, unidade_id, quantidadeFinal, custo],
                function (erroInsert) {
                  if (erroInsert) {
                    return res.status(500).json({ erro: erroInsert.message });
                  }

                  res.json({ sucesso: true });
                }
              );
            }
          }
        );
      }
    );
  });
});

app.get("/movimentacoes", (req, res) => {
  db.all(
    `
    SELECT
      m.*,
      p.nome as produto,
      p.unidade_medida,
      u.nome as unidade,
      f.nome as funcionario
    FROM movimentacoes m
    JOIN produtos p ON m.produto_id = p.id
    JOIN unidades u ON m.unidade_id = u.id
    LEFT JOIN funcionarios f ON m.funcionario_id = f.id
    ORDER BY m.data_movimento DESC
    `,
    (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows);
    }
  );
});

/* =========================
   TRANSFERÊNCIA
========================= */

app.post("/transferir", (req, res) => {
  const {
    produto_id,
    unidade_origem_id,
    unidade_destino_id,
    quantidade,
    funcionario_id,
  } = req.body;

  const qtd = Number(quantidade || 0);

  if (!produto_id || !unidade_origem_id || !unidade_destino_id || !qtd) {
    return res
      .status(400)
      .json({ erro: "Dados incompletos para transferência" });
  }

  if (Number(unidade_origem_id) === Number(unidade_destino_id)) {
    return res
      .status(400)
      .json({ erro: "Origem e destino não podem ser iguais" });
  }

  db.get(
    `
    SELECT *
    FROM estoques
    WHERE produto_id = ? AND unidade_id = ?
    `,
    [produto_id, unidade_origem_id],
    (err, estoque) => {
      if (err) return res.status(500).json({ erro: err.message });

      if (!estoque) {
        return res.status(400).json({ erro: "Produto sem estoque na origem" });
      }

      if (Number(estoque.quantidade || 0) < qtd) {
        return res.status(400).json({ erro: "Estoque insuficiente" });
      }

      db.serialize(() => {
        db.run(
          `
          UPDATE estoques
          SET quantidade = quantidade - ?
          WHERE produto_id = ? AND unidade_id = ?
          `,
          [qtd, produto_id, unidade_origem_id],
          function (erroSaida) {
            if (erroSaida) {
              return res.status(500).json({ erro: erroSaida.message });
            }

            db.get(
              `
              SELECT id FROM estoques
              WHERE produto_id = ? AND unidade_id = ?
              `,
              [produto_id, unidade_destino_id],
              (erroBusca, destino) => {
                if (erroBusca) {
                  return res.status(500).json({ erro: erroBusca.message });
                }

                if (destino) {
                  db.run(
                    `
                    UPDATE estoques
                    SET 
                      quantidade = quantidade + ?,
                      custo_unitario = ?
                    WHERE id = ?
                    `,
                    [qtd, estoque.custo_unitario, destino.id],
                    function (erroUpdate) {
                      if (erroUpdate) {
                        return res
                          .status(500)
                          .json({ erro: erroUpdate.message });
                      }

                      res.json({ sucesso: true, funcionario_id });
                    }
                  );
                } else {
                  db.run(
                    `
                    INSERT INTO estoques
                    (
                      produto_id,
                      unidade_id,
                      quantidade,
                      custo_unitario
                    )
                    VALUES (?, ?, ?, ?)
                    `,
                    [
                      produto_id,
                      unidade_destino_id,
                      qtd,
                      estoque.custo_unitario,
                    ],
                    function (erroInsert) {
                      if (erroInsert) {
                        return res
                          .status(500)
                          .json({ erro: erroInsert.message });
                      }

                      res.json({ sucesso: true, funcionario_id });
                    }
                  );
                }
              }
            );
          }
        );
      });
    }
  );
});

/* =========================
   BOLETOS
========================= */

app.get("/boletos", (req, res) => {
  db.all(`SELECT * FROM boletos ORDER BY vencimento`, (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});

app.post("/boletos", (req, res) => {
  const {
    fornecedor,
    descricao,
    valor,
    vencimento,
    unidade_id,
    observacao,
  } = req.body;

  db.run(
    `
    INSERT INTO boletos
    (
      fornecedor,
      descricao,
      valor,
      vencimento,
      unidade_id,
      observacao
    )
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      fornecedor,
      descricao,
      Number(valor || 0),
      vencimento,
      unidade_id || null,
      observacao || "",
    ],
    function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ id: this.lastID, sucesso: true });
    }
  );
});

app.put("/boletos/:id/pagar", (req, res) => {
  db.run(
    `
    UPDATE boletos
    SET status = 'pago'
    WHERE id = ?
    `,
    [req.params.id],
    function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ sucesso: true });
    }
  );
});

/* =========================
   START
========================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});