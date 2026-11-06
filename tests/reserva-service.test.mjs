import assert from "node:assert/strict";
import test from "node:test";
import {
  criarReservasComBloqueio,
  HorarioIndisponivel,
  HorariosInvalidos,
  ReservaTemporariamenteIndisponivel,
  respostaErroReserva,
} from "../lib/reserva-service.ts";

const dados = (email) => ({
  salaId: "sala-teste",
  dataTexto: "2099-06-15",
  dataReserva: new Date("2099-06-15T00:00:00.000Z"),
  inicioProximoDia: new Date("2099-06-16T00:00:00.000Z"),
  periodos: [{ horaInicio: "10:00", horaFim: "11:00" }],
  nome: "Visitante de teste",
  email,
  telefone: null,
});

class BancoFalso {
  reservas = [];
  locks = new Map();
  tentativas = 0;
  falhasTransitorias = 0;
  niveisDeIsolamento = [];
  falharNaCriacao = null;

  async $transaction(callback, options) {
    this.tentativas += 1;
    this.niveisDeIsolamento.push(options.isolationLevel);
    if (this.falhasTransitorias > 0) {
      this.falhasTransitorias -= 1;
      const error = new Error("serialization failure");
      error.code = "P2034";
      throw error;
    }

    let liberarBloqueio;
    let reservasDaTransacao;
    let numeroCriacao = 0;
    const tx = {
      $queryRaw: async (template, salaId, dataTexto) => {
        assert.match(Array.from(template).join(" "), /pg_advisory_xact_lock/);
        assert.match(Array.from(template).join(" "), /IS NOT NULL AS locked/);
        const chave = `${salaId}:${dataTexto}`;
        const anterior = this.locks.get(chave) ?? Promise.resolve();
        let liberar;
        const atual = new Promise((resolve) => { liberar = resolve; });
        this.locks.set(chave, anterior.then(() => atual));
        await anterior;
        reservasDaTransacao = this.reservas.map((reserva) => ({ ...reserva }));
        liberarBloqueio = liberar;
      },
      sala: {
        findFirst: async () => ({ id: "sala-teste", valorHora: 80 }),
      },
      reserva: {
        updateMany: async ({ where, data: alteracao }) => {
          let count = 0;
          for (const reserva of reservasDaTransacao) {
            const expiradoPorExpiraEm = where.OR.some((condicao) =>
              condicao.expiraEm?.lte instanceof Date &&
              reserva.expiraEm instanceof Date &&
              reserva.expiraEm <= condicao.expiraEm.lte,
            );
            const expiradoPeloCreatedAt = where.OR.some((condicao) =>
              condicao.expiraEm === null &&
              reserva.expiraEm === null &&
              reserva.createdAt instanceof Date &&
              reserva.createdAt <= condicao.createdAt.lte,
            );
            if (
              reserva.salaId === where.salaId &&
              reserva.status === where.status &&
              (expiradoPorExpiraEm || expiradoPeloCreatedAt)
            ) {
              reserva.status = alteracao.status;
              count += 1;
            }
          }
          return { count };
        },
        findFirst: async ({ where }) => {
          const filtroPendente = where.OR.find((condicao) => condicao.status === "PENDENTE");
          const reserva = reservasDaTransacao.find((item) =>
            item.salaId === where.salaId &&
            item.data >= where.data.gte && item.data < where.data.lt &&
            item.horaInicio < where.horaInicio.lt && item.horaFim > where.horaFim.gt &&
            (item.status === "CONFIRMADA" ||
              (item.status === "PENDENTE" &&
                filtroPendente.OR.some((condicao) =>
                  condicao.expiraEm?.gt instanceof Date
                    ? item.expiraEm instanceof Date && item.expiraEm > condicao.expiraEm.gt
                    : item.expiraEm === null && item.createdAt instanceof Date && item.createdAt > condicao.createdAt.gt,
                ))),
          );
          return reserva ? { id: reserva.id } : null;
        },
        create: async ({ data }) => {
          numeroCriacao += 1;
          if (numeroCriacao === this.falharNaCriacao) throw new Error("simulated create failure");
          const reserva = { id: `reserva-${reservasDaTransacao.length + 1}`, createdAt: new Date(), ...data, status: "PENDENTE" };
          reservasDaTransacao.push(reserva);
          return reserva;
        },
      },
    };

    try {
      const resultado = await callback(tx);
      this.reservas = reservasDaTransacao;
      return resultado;
    } finally {
      liberarBloqueio?.();
    }
  }
}

test("requisições simultâneas para o mesmo horário criam uma reserva e retornam conflito para a outra", async () => {
  const banco = new BancoFalso();
  const resultados = await Promise.allSettled([
    criarReservasComBloqueio(banco, dados("um@example.test")),
    criarReservasComBloqueio(banco, dados("dois@example.test")),
  ]);

  const criadas = resultados.filter((resultado) => resultado.status === "fulfilled");
  const recusadas = resultados.filter((resultado) => resultado.status === "rejected");
  assert.equal(criadas.length, 1);
  assert.equal(recusadas.length, 1);
  assert.ok(recusadas[0].reason instanceof HorarioIndisponivel);
  assert.equal(respostaErroReserva(recusadas[0].reason).status, 409);
  assert.equal(banco.reservas.length, 1);
  assert.equal(banco.niveisDeIsolamento.every((nivel) => nivel === "ReadCommitted"), true);
  assert.equal(criadas[0].value.reservas[0].expiraEm.getTime() - Date.now() >= 14 * 60 * 1000, true);
});

test("falhas P2034 são repetidas com limite e permitem concluir a transação", async () => {
  const banco = new BancoFalso();
  banco.falhasTransitorias = 2;

  await criarReservasComBloqueio(banco, dados("retry@example.test"));

  assert.equal(banco.tentativas, 3);
  assert.equal(banco.reservas.length, 1);
});

test("falhas P2034 persistentes viram indisponibilidade temporária, não conflito", async () => {
  const banco = new BancoFalso();
  banco.falhasTransitorias = 3;

  await assert.rejects(
    criarReservasComBloqueio(banco, dados("busy@example.test")),
    (error) => error instanceof ReservaTemporariamenteIndisponivel &&
      respostaErroReserva(error).status === 503,
  );
  assert.equal(banco.tentativas, 3);
  assert.equal(banco.reservas.length, 0);
});

test("um período cria uma reserva individual pendente com preço do banco e validade de 15 minutos", async () => {
  const banco = new BancoFalso();
  const antes = Date.now();

  const resultado = await criarReservasComBloqueio(banco, dados("uma-hora@example.test"));

  assert.equal(resultado.reservas.length, 1);
  assert.equal(resultado.reservas[0].status, "PENDENTE");
  assert.equal(resultado.reservas[0].valor, 80);
  assert.equal(resultado.total, "80.00");
  assert.equal(resultado.reservas[0].expiraEm.getTime() - resultado.reservas[0].createdAt.getTime(), 15 * 60 * 1000);
  assert.ok(resultado.reservas[0].expiraEm.getTime() >= antes + 15 * 60 * 1000);
  assert.ok(resultado.reservas[0].expiraEm.getTime() <= Date.now() + 15 * 60 * 1000);
});

test("erros inesperados continuam sendo erros internos, nunca conflitos", async () => {
  const falha = new Error("database unavailable");
  const banco = {
    $transaction: async () => { throw falha; },
  };

  await assert.rejects(criarReservasComBloqueio(banco, dados("error@example.test")), (error) => error === falha);
  assert.equal(respostaErroReserva(falha), null);
});

test("reservas confirmadas e pendentes ainda válidas bloqueiam horários sobrepostos", async () => {
  for (const [status, expiraEm, idadeCriacaoMs] of [
    ["CONFIRMADA", null, 0],
    ["PENDENTE", null, 5 * 60 * 1000],
    ["PENDENTE", new Date(Date.now() + 60_000), 0],
  ]) {
    const banco = new BancoFalso();
    banco.reservas.push({
      id: "reserva-existente",
      salaId: "sala-teste",
      data: new Date("2099-06-15T00:00:00.000Z"),
      horaInicio: "10:00",
      horaFim: "11:00",
      status,
      expiraEm,
      createdAt: new Date(Date.now() - idadeCriacaoMs),
    });

    await assert.rejects(
      criarReservasComBloqueio(banco, dados(`${status.toLowerCase()}@example.test`)),
      (error) => error instanceof HorarioIndisponivel,
    );
    assert.equal(banco.reservas.length, 1);
  }
});

test("pendências expiradas e reservas canceladas não bloqueiam o horário", async () => {
  const banco = new BancoFalso();
  banco.reservas.push(
    {
      id: "reserva-expirada",
      salaId: "sala-teste",
      data: new Date("2099-06-15T00:00:00.000Z"),
      horaInicio: "10:00",
      horaFim: "11:00",
      status: "PENDENTE",
      expiraEm: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 20 * 60 * 1000),
    },
    {
      id: "reserva-pendente-antiga-sem-expiracao",
      salaId: "sala-teste",
      data: new Date("2099-06-15T00:00:00.000Z"),
      horaInicio: "10:00",
      horaFim: "11:00",
      status: "PENDENTE",
      expiraEm: null,
      createdAt: new Date(Date.now() - 20 * 60 * 1000),
    },
    {
      id: "reserva-cancelada",
      salaId: "sala-teste",
      data: new Date("2099-06-15T00:00:00.000Z"),
      horaInicio: "10:00",
      horaFim: "11:00",
      status: "CANCELADA",
      expiraEm: null,
    },
    {
      id: "reserva-confirmada",
      salaId: "sala-teste",
      data: new Date("2099-06-15T00:00:00.000Z"),
      horaInicio: "12:00",
      horaFim: "13:00",
      status: "CONFIRMADA",
      expiraEm: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 20 * 60 * 1000),
    },
  );

  await criarReservasComBloqueio(banco, dados("liberado@example.test"));

  assert.equal(banco.reservas.length, 5);
  assert.equal(banco.reservas[0].status, "EXPIRADA");
  assert.equal(banco.reservas[1].status, "EXPIRADA");
  assert.equal(banco.reservas[2].status, "CANCELADA");
  assert.equal(banco.reservas[3].status, "CONFIRMADA");
  assert.equal(banco.reservas[4].status, "PENDENTE");
});

test("vários períodos viram reservas individuais com total calculado pelo valor-hora do banco", async () => {
  const banco = new BancoFalso();
  const resultado = await criarReservasComBloqueio(banco, {
    ...dados("multiplos@example.test"),
    periodos: [
      { horaInicio: "09:00", horaFim: "10:00" },
      { horaInicio: "11:00", horaFim: "12:00" },
      { horaInicio: "12:00", horaFim: "13:00" },
    ],
  });

  assert.equal(resultado.reservas.length, 3);
  assert.deepEqual(resultado.reservas.map(({ horaInicio }) => horaInicio), ["09:00", "11:00", "12:00"]);
  assert.equal(resultado.reservas.every(({ valor }) => valor === 80), true);
  assert.equal(resultado.reservas.every(({ status }) => status === "PENDENTE"), true);
  assert.equal(resultado.total, "240.00");
  assert.equal(new Set(resultado.reservas.map(({ expiraEm }) => expiraEm.getTime())).size, 1);
  assert.equal(resultado.reservas.every(({ expiraEm }) =>
    expiraEm.getTime() - resultado.reservas[0].expiraEm.getTime() === 0 &&
    expiraEm.getTime() - Date.now() >= 14 * 60 * 1000 &&
    expiraEm.getTime() - Date.now() <= 15 * 60 * 1000,
  ), true);
});

test("um conflito em qualquer período impede criar todo o conjunto", async () => {
  const banco = new BancoFalso();
  banco.reservas.push({
    id: "reserva-existente",
    salaId: "sala-teste",
    data: new Date("2099-06-15T00:00:00.000Z"),
    horaInicio: "10:00",
    horaFim: "11:00",
    status: "CONFIRMADA",
    expiraEm: null,
  });

  await assert.rejects(
    criarReservasComBloqueio(banco, {
      ...dados("conflito@example.test"),
      periodos: [
        { horaInicio: "09:00", horaFim: "10:00" },
        { horaInicio: "10:00", horaFim: "11:00" },
        { horaInicio: "11:00", horaFim: "12:00" },
      ],
    }),
    (error) => error instanceof HorarioIndisponivel && respostaErroReserva(error).status === 409,
  );
  assert.equal(banco.reservas.length, 1);
});

test("requisições concorrentes de conjuntos iguais criam somente um conjunto completo", async () => {
  const banco = new BancoFalso();
  const requisitar = (email) => criarReservasComBloqueio(banco, {
    ...dados(email),
    periodos: [
      { horaInicio: "09:00", horaFim: "10:00" },
      { horaInicio: "10:00", horaFim: "11:00" },
    ],
  });

  const resultados = await Promise.allSettled([
    requisitar("um-conjunto@example.test"),
    requisitar("outro-conjunto@example.test"),
  ]);
  const criadas = resultados.filter((resultado) => resultado.status === "fulfilled");
  const recusadas = resultados.filter((resultado) => resultado.status === "rejected");

  assert.equal(criadas.length, 1);
  assert.equal(criadas[0].value.reservas.length, 2);
  assert.equal(recusadas.length, 1);
  assert.ok(recusadas[0].reason instanceof HorarioIndisponivel);
  assert.equal(banco.reservas.length, 2);
});

test("períodos duplicados ou sobrepostos são rejeitados antes da transação", async () => {
  const banco = new BancoFalso();
  const periodosInvalidos = [
    [{ horaInicio: "09:00", horaFim: "10:00" }, { horaInicio: "09:00", horaFim: "10:00" }],
    [{ horaInicio: "09:00", horaFim: "11:00" }, { horaInicio: "10:00", horaFim: "11:00" }],
  ];

  for (const periodos of periodosInvalidos) {
    await assert.rejects(
      criarReservasComBloqueio(banco, { ...dados("invalidos@example.test"), periodos }),
      (error) => error instanceof HorariosInvalidos && respostaErroReserva(error).status === 400,
    );
  }

  assert.equal(banco.tentativas, 0);
  assert.equal(banco.reservas.length, 0);
});

test("falha ao inserir um período reverte todos os períodos do conjunto", async () => {
  const banco = new BancoFalso();
  banco.falharNaCriacao = 2;

  await assert.rejects(
    criarReservasComBloqueio(banco, {
      ...dados("rollback@example.test"),
      periodos: [
        { horaInicio: "09:00", horaFim: "10:00" },
        { horaInicio: "10:00", horaFim: "11:00" },
      ],
    }),
    /simulated create failure/,
  );

  assert.equal(banco.reservas.length, 0);
});
