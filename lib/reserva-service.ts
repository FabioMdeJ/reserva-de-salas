import type { Prisma, PrismaClient } from "../generated/prisma/client";

export class HorarioIndisponivel extends Error {}
export class SalaNaoEncontrada extends Error {}
export class ReservaTemporariamenteIndisponivel extends Error {}

type Database = Pick<PrismaClient, "$transaction">;
type Transaction = Prisma.TransactionClient;

export type DadosReservaVisitante = {
  salaId: string;
  dataTexto: string;
  dataReserva: Date;
  inicioProximoDia: Date;
  horaInicio: string;
  horaFim: string;
  nome: string;
  email: string;
  telefone: string | null;
};

const MAX_TENTATIVAS = 3;

function codigoErroTransitorio(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const erro = error as {
    code?: unknown;
    meta?: { code?: unknown };
    cause?: { code?: unknown };
  };
  if (erro.code === "P2034" || erro.code === "40001") return erro.code;
  if (erro.meta?.code === "40001") return "40001";
  if (erro.cause?.code === "40001") return "40001";
  return undefined;
}

function falhaDeSerializacao(error: unknown): boolean {
  return codigoErroTransitorio(error) !== undefined;
}

export function respostaErroReserva(error: unknown): { status: number; mensagem: string } | null {
  if (error instanceof HorarioIndisponivel) {
    return { status: 409, mensagem: "Este horário acabou de ficar indisponível. Escolha outro." };
  }
  if (error instanceof SalaNaoEncontrada) {
    return { status: 404, mensagem: "Sala não encontrada ou inativa." };
  }
  if (error instanceof ReservaTemporariamenteIndisponivel) {
    return { status: 503, mensagem: "Não foi possível concluir a reserva agora. Tente novamente." };
  }
  return null;
}

export async function criarReservaComBloqueio(
  database: Database,
  dados: DadosReservaVisitante,
) {
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa += 1) {
    try {
      return await database.$transaction(async (tx: Transaction) => {
        // ReadCommitted garante que, após aguardar o advisory lock, a consulta
        // seguinte veja a reserva confirmada pela transação que liberou o lock.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${dados.salaId}), hashtext(${dados.dataTexto}))`;
        const agora = new Date();

        const sala = await tx.sala.findFirst({
          where: { id: dados.salaId, ativa: true },
          select: { id: true, valorHora: true },
        });
        if (!sala) throw new SalaNaoEncontrada();

        await tx.reserva.updateMany({
          where: {
            salaId: dados.salaId,
            data: { gte: dados.dataReserva, lt: dados.inicioProximoDia },
            status: "PENDENTE",
            expiraEm: { lte: agora },
          },
          data: { status: "EXPIRADA" },
        });

        const conflito = await tx.reserva.findFirst({
          where: {
            salaId: dados.salaId,
            data: { gte: dados.dataReserva, lt: dados.inicioProximoDia },
            horaInicio: { lt: dados.horaFim },
            horaFim: { gt: dados.horaInicio },
            OR: [
              { status: "CONFIRMADA" },
              { status: "PENDENTE", OR: [{ expiraEm: null }, { expiraEm: { gt: agora } }] },
            ],
          },
          select: { id: true },
        });
        if (conflito) throw new HorarioIndisponivel();

        return tx.reserva.create({
          data: {
            salaId: dados.salaId,
            visitanteNome: dados.nome,
            visitanteEmail: dados.email,
            visitanteTelefone: dados.telefone,
            data: dados.dataReserva,
            horaInicio: dados.horaInicio,
            horaFim: dados.horaFim,
            valor: sala.valorHora,
            expiraEm: new Date(agora.getTime() + 15 * 60 * 1000),
          },
          select: {
            id: true,
            salaId: true,
            data: true,
            horaInicio: true,
            horaFim: true,
            valor: true,
            status: true,
            expiraEm: true,
          },
        });
      }, {
        isolationLevel: "ReadCommitted",
        maxWait: 5000,
        timeout: 10000,
      });
    } catch (error) {
      if (!falhaDeSerializacao(error)) throw error;
      if (tentativa === MAX_TENTATIVAS) {
        throw new ReservaTemporariamenteIndisponivel();
      }
      await new Promise((resolve) => setTimeout(resolve, tentativa * 20));
    }
  }

  throw new ReservaTemporariamenteIndisponivel();
}
