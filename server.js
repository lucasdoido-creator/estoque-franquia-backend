const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const db = require("./database");

function normalizarNumero(valor, padrao = 0) {
  if (valor === null || valor === undefined || valor === "") return padrao;

  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : padrao;
  }

  const bruto = String(valor).trim();
  const texto = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
  const numero = Number(texto);

  return Number.isFinite(numero) ? numero : padrao;
}

function cargoAcessaTodasUnidades(cargo) {
  const cargoNormalizado = String(cargo || "").toLowerCase();
  return ["admin", "gerente", "administrador"].includes(cargoNormalizado);
}

function adicionarColunaSeNaoExistir(tabela, coluna, definicao) {
  db.all(`PRAGMA table_info(${tabela})`, (err, rows) => {
    if (err) {
      console.error(`Erro ao verificar ${tabela}.${coluna}:`, err.message);
      return;
    }

    const existe = rows.some((row) => row.name === coluna);
    if (existe) return;

    db.run(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`, (erro) => {
      if (erro) console.error(`Erro ao criar ${tabela}.${coluna}:`, erro.message);
    });
  });
}

function somarMeses(dataBase, meses) {
  const data = new Date(`${dataBase}T00:00:00`);
  const diaOriginal = data.getDate();
  data.setMonth(data.getMonth() + meses);

  if (data.getDate() !== diaOriginal) {
    data.setDate(0);
  }

  return data.toISOString().slice(0, 10);
}

db.serialize(() => {
  adicionarColunaSeNaoExistir("boletos", "grupo_parcelamento", "TEXT");
  adicionarColunaSeNaoExistir("boletos", "parcela_numero", "INTEGER DEFAULT 1");
  adicionarColunaSeNaoExistir("boletos", "total_parcelas", "INTEGER DEFAULT 1");
});

function validarFuncionarioUnidade(funcionarioId, unidadeId, res, next) {
  db.get(
    `SELECT id, cargo, unidade_id FROM funcionarios WHERE id = ? AND ativo = 1`,
    [funcionarioId],
    (err, funcionario) => {
      if (err) return res.status(500).json({ erro: err.message });

      if (!funcionario) {
        return res.status(403).json({ erro: "Funcionário inválido ou inativo" });
      }

      if (
        !cargoAcessaTodasUnidades(funcionario.cargo) &&
        Number(funcionario.unidade_id) !== Number(unidadeId)
      ) {
        return res.status(403).json({
          erro: "Funcionário não tem permissão para operar esta unidade",
        });
      }

      next(funcionario);
    }
  );
}

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

  const baseUrl = process.env.PUBLIC_API_URL || `${req.protocol}://${req.get("host")}`;

  res.json({
    url: `${baseUrl}/uploads/${req.file.filename}`,
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
  const custo = normalizarNumero(custoEmbalagem, 0);
  const qtd = normalizarNumero(quantidadeEmbalagem, 1);

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

  const qtdEmb = normalizarNumero(quantidade_embalagem, 1);
  const custoEmb = normalizarNumero(custo_embalagem, 0);
  const custoUnit =
    normalizarNumero(custo_unitario, 0) > 0
      ? normalizarNumero(custo_unitario, 0)
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
      normalizarNumero(estoque_minimo, 0),
      codigo_barras,
      foto_url,
      unidade_id || null,
      qtdEmb,
      custoEmb,
      custoUnit,
    ],
    function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      if (custoUnit > 0 && unidade_id) {
        db.run(
          `
          UPDATE estoques
          SET custo_unitario = ?
          WHERE produto_id = ? AND unidade_id = ?
          `,
          [custoUnit, this.lastID, unidade_id]
        );
      }

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

  const qtdEmb = normalizarNumero(quantidade_embalagem, 1);
  const custoEmb = normalizarNumero(custo_embalagem, 0);
  const custoUnit =
    normalizarNumero(custo_unitario, 0) > 0
      ? normalizarNumero(custo_unitario, 0)
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
      normalizarNumero(estoque_minimo, 0),
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

      if (custoUnit > 0) {
        db.run(
          `
          UPDATE estoques
          SET custo_unitario = ?
          WHERE produto_id = ?
          `,
          [custoUnit, req.params.id]
        );
      }

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

  const qtd = normalizarNumero(quantidade, 0);
  const custoInformado = normalizarNumero(custo_unitario, 0);

  if (!produto_id || !unidade_id || !funcionario_id || !tipo || !qtd) {
    return res.status(400).json({ erro: "Dados obrigatórios incompletos" });
  }

  validarFuncionarioUnidade(funcionario_id, unidade_id, res, () => {
    db.get(
      "SELECT custo_unitario, quantidade_embalagem FROM produtos WHERE id = ?",
      [produto_id],
      (erroProduto, produto) => {
        if (erroProduto) return res.status(500).json({ erro: erroProduto.message });
        if (!produto) return res.status(404).json({ erro: "Produto não encontrado" });

        const custoProduto = normalizarNumero(produto.custo_unitario, 0);
        const custo = custoInformado > 0 ? custoInformado : custoProduto;
        const quantidadeFinal = tipo === "saida" || tipo === "perca" ? -qtd : qtd;

        db.serialize(() => {
          db.run(
            "INSERT INTO movimentacoes (produto_id, unidade_id, funcionario_id, tipo, quantidade, custo_unitario, observacao) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [produto_id, unidade_id, funcionario_id, tipo, qtd, custo, observacao || ""],
            function (err) {
              if (err) return res.status(500).json({ erro: err.message });

              if (custo > 0) {
                db.run(
                  "UPDATE produtos SET custo_unitario = ?, custo_embalagem = CASE WHEN quantidade_embalagem IS NOT NULL AND quantidade_embalagem > 0 THEN ? * quantidade_embalagem ELSE custo_embalagem END WHERE id = ?",
                  [custo, custo, produto_id]
                );
              }

              db.get(
                "SELECT id FROM estoques WHERE produto_id = ? AND unidade_id = ?",
                [produto_id, unidade_id],
                (erroBusca, estoqueExistente) => {
                  if (erroBusca) return res.status(500).json({ erro: erroBusca.message });

                  if (estoqueExistente) {
                    db.run(
                      "UPDATE estoques SET quantidade = quantidade + ?, custo_unitario = CASE WHEN ? > 0 THEN ? ELSE custo_unitario END WHERE id = ?",
                      [quantidadeFinal, custo, custo, estoqueExistente.id],
                      function (erroUpdate) {
                        if (erroUpdate) return res.status(500).json({ erro: erroUpdate.message });
                        res.json({ sucesso: true });
                      }
                    );
                  } else {
                    db.run(
                      "INSERT INTO estoques (produto_id, unidade_id, quantidade, custo_unitario) VALUES (?, ?, ?, ?)",
                      [produto_id, unidade_id, quantidadeFinal, custo],
                      function (erroInsert) {
                        if (erroInsert) return res.status(500).json({ erro: erroInsert.message });
                        res.json({ sucesso: true });
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

  const qtd = normalizarNumero(quantidade, 0);

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

  validarFuncionarioUnidade(funcionario_id, unidade_origem_id, res, () => {
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
});

/* =========================
   BOLETOS
========================= */

app.get("/boletos", (req, res) => {
  db.all(
    `
    SELECT
      b.*,
      u.nome as unidade
    FROM boletos b
    LEFT JOIN unidades u ON b.unidade_id = u.id
    ORDER BY b.vencimento, b.id
    `,
    (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows);
    }
  );
});

app.post("/boletos", (req, res) => {
  const {
    fornecedor,
    descricao,
    valor,
    vencimento,
    unidade_id,
    observacao,
    parcelas,
  } = req.body;

  const totalParcelas = Math.max(1, Math.floor(normalizarNumero(parcelas, 1)));
  const valorTotal = normalizarNumero(valor, 0);
  const valorParcelaBase = Math.floor((valorTotal / totalParcelas) * 100) / 100;
  const grupoParcelamento = totalParcelas > 1 ? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : null;

  if (!fornecedor || !vencimento || valorTotal <= 0) {
    return res.status(400).json({ erro: "Fornecedor, valor e vencimento são obrigatórios" });
  }

  db.serialize(() => {
    const ids = [];
    let respondido = false;

    const finalizarComErro = (err) => {
      if (respondido) return;
      respondido = true;
      return res.status(500).json({ erro: err.message });
    };

    for (let i = 1; i <= totalParcelas; i += 1) {
      const ajusteCentavos = i === totalParcelas ? Number((valorTotal - valorParcelaBase * totalParcelas).toFixed(2)) : 0;
      const valorParcela = Number((valorParcelaBase + ajusteCentavos).toFixed(2));
      const vencimentoParcela = somarMeses(vencimento, i - 1);
      const descricaoParcela = totalParcelas > 1
        ? `${descricao || "Boleto"} - Parcela ${i}/${totalParcelas}`
        : descricao;

      db.run(
        `
        INSERT INTO boletos
        (
          fornecedor,
          descricao,
          valor,
          vencimento,
          unidade_id,
          observacao,
          grupo_parcelamento,
          parcela_numero,
          total_parcelas
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          fornecedor,
          descricaoParcela,
          valorParcela,
          vencimentoParcela,
          unidade_id || null,
          observacao || "",
          grupoParcelamento,
          i,
          totalParcelas,
        ],
        function (err) {
          if (err) return finalizarComErro(err);

          ids.push(this.lastID);
          if (!respondido && ids.length === totalParcelas) {
            respondido = true;
            res.json({ ids, sucesso: true, parcelas: totalParcelas });
          }
        }
      );
    }
  });
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
