import assert from "node:assert/strict";
import test from "node:test";
import {
  criarReservaComBloqueio,
  HorarioIndisponivel,
  ReservaTemporariamenteIndisponivel,
  respostaErroReserva,
} from "../lib/reserva-service.ts";

const dados = (email) => ({
  salaId: "sala-teste",
  dataTexto: "2099-06-15",
  dataReserva: new Date("2099-06-15T00:00:00.000Z"),
  inicioProximoDia: new Date("2099-06-16T00:00:00.000Z"),
  horaInicio: "10:00",
  horaFim: "11:00",
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
    const tx = {
      $queryRaw: async (_template, salaId, dataTexto) => {
        const chave = `${salaId}:${dataTexto}`;
        const anterior = this.locks.get(chave) ?? Promise.resolve();
        let liberar;
        const atual = new Promise((resolve) => { liberar = resolve; });
        this.locks.set(chave, anterior.then(() => atual));
        await anterior;
        liberarBloqueio = liberar;
      },
      sala: {
        findFirst: async () => ({ id: "sala-teste", valorHora: 80 }),
      },
      reserva: {
        updateMany: async ({ where, data: alteracao }) => {
          let count = 0;
          for (const reserva of this.reservas) {
            if (
              reserva.salaId === where.salaId &&
              reserva.status === where.status &&
              reserva.expiraEm <= where.expiraEm.lte
            ) {
              reserva.status = alteracao.status;
              count += 1;
            }
          }
          return { count };
        },
        findFirst: async ({ where }) => {
          const reserva = this.reservas.find((item) =>
            item.salaId === where.salaId &&
            item.data >= where.data.gte && item.data < where.data.lt &&
            item.horaInicio < where.horaInicio.lt && item.horaFim > where.horaFim.gt &&
            (item.status === "CONFIRMADA" ||
              (item.status === "PENDENTE" && item.expiraEm > new Date())),
          );
          return reserva ? { id: reserva.id } : null;
        },
        create: async ({ data }) => {
          const reserva = { id: `reserva-${this.reservas.length + 1}`, ...data, status: "PENDENTE" };
          this.reservas.push(reserva);
          return reserva;
        },
      },
    };

    try {
      return await callback(tx);
    } finally {
      liberarBloqueio?.();
    }
  }
}

test("requisições simultâneas para o mesmo horário criam uma reserva e retornam conflito para a outra", async () => {
  const banco = new BancoFalso();
  const resultados = await Promise.allSettled([
    criarReservaComBloqueio(banco, dados("um@example.test")),
    criarReservaComBloqueio(banco, dados("dois@example.test")),
  ]);

  const criadas = resultados.filter((resultado) => resultado.status === "fulfilled");
  const recusadas = resultados.filter((resultado) => resultado.status === "rejected");
  assert.equal(criadas.length, 1);
  assert.equal(recusadas.length, 1);
  assert.ok(recusadas[0].reason instanceof HorarioIndisponivel);
  assert.equal(respostaErroReserva(recusadas[0].reason).status, 409);
  assert.equal(banco.reservas.length, 1);
  assert.equal(banco.niveisDeIsolamento.every((nivel) => nivel === "ReadCommitted"), true);
  assert.equal(banco.reservas[0].expiraEm.getTime() - Date.now() >= 14 * 60 * 1000, true);
});

test("falhas P2034 são repetidas com limite e permitem concluir a transação", async () => {
  const banco = new BancoFalso();
  banco.falhasTransitorias = 2;

  await criarReservaComBloqueio(banco, dados("retry@example.test"));

  assert.equal(banco.tentativas, 3);
  assert.equal(banco.reservas.length, 1);
});

test("falhas P2034 persistentes viram indisponibilidade temporária, não conflito", async () => {
  const banco = new BancoFalso();
  banco.falhasTransitorias = 3;

  await assert.rejects(
    criarReservaComBloqueio(banco, dados("busy@example.test")),
    (error) => error instanceof ReservaTemporariamenteIndisponivel &&
      respostaErroReserva(error).status === 503,
  );
  assert.equal(banco.tentativas, 3);
  assert.equal(banco.reservas.length, 0);
});

test("erros inesperados continuam sendo erros internos, nunca conflitos", async () => {
  const falha = new Error("database unavailable");
  const banco = {
    $transaction: async () => { throw falha; },
  };

  await assert.rejects(criarReservaComBloqueio(banco, dados("error@example.test")), (error) => error === falha);
  assert.equal(respostaErroReserva(falha), null);
});
