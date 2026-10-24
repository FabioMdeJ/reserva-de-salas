
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { gerarHorarios, obterExpediente } from "@/lib/expediente";
import {
  criarDataReserva,
  dataLocalValida,
  obterDataLocal,
  obterHoraLocal,
} from "@/lib/tempo";

export async function GET(request: NextRequest) {
  const parametros = request.nextUrl.searchParams;
  const salaId = parametros.get("salaId");
  const dataTexto = parametros.get("data");

  if (!salaId || !dataLocalValida(dataTexto)) {
    return NextResponse.json(
      { mensagem: "Informe um salaId e uma data válida (AAAA-MM-DD)." },
      { status: 400 },
    );
  }

  try {
    const sala = await prisma.sala.findFirst({
      where: {
        id: salaId,
        ativa: true,
      },
      select: { id: true },
    });

    if (!sala) {
      return NextResponse.json(
        { mensagem: "Sala não encontrada ou inativa." },
        { status: 404 },
      );
    }

    // UTC noon preserva o mesmo dia civil independentemente do fuso do servidor.
    const dataSelecionada = new Date(`${dataTexto}T12:00:00.000Z`);
    const expediente = obterExpediente(dataSelecionada);

    if (!expediente) {
      return NextResponse.json({
        salaId,
        data: dataTexto,
        horarios: [],
      });
    }

    const horarios = gerarHorarios(expediente);

    const inicioDoDia = criarDataReserva(dataTexto);
    const inicioDoProximoDia = new Date(inicioDoDia);
    inicioDoProximoDia.setUTCDate(inicioDoProximoDia.getUTCDate() + 1);

    const agora = new Date();
    await prisma.reserva.updateMany({
      where: {
        salaId,
        data: { gte: inicioDoDia, lt: inicioDoProximoDia },
        status: "PENDENTE",
        expiraEm: { lte: agora },
      },
      data: { status: "EXPIRADA" },
    });

    const reservas = await prisma.reserva.findMany({
      where: {
        salaId,
        data: {
          gte: inicioDoDia,
          lt: inicioDoProximoDia,
        },
        OR: [
          { status: "CONFIRMADA" },
          { status: "PENDENTE", OR: [{ expiraEm: null }, { expiraEm: { gt: agora } }] },
        ],
      },
      select: {
        horaInicio: true,
        horaFim: true,
      },
    });

    const horariosDisponiveis = horarios.filter((horario) => {
      if (
        dataTexto < obterDataLocal(agora) ||
        (dataTexto === obterDataLocal(agora) && horario.inicio <= obterHoraLocal(agora))
      ) {
        return false;
      }
      const ocupado = reservas.some(
        (reserva) =>
          horario.inicio < reserva.horaFim &&
          horario.fim > reserva.horaInicio,
      );

      return !ocupado;
    });

    return NextResponse.json({
      salaId,
      data: dataTexto,
      horarios: horariosDisponiveis,
    });
  } catch (error) {
    console.error("Erro ao consultar disponibilidade:", error);

    return NextResponse.json(
      { mensagem: "Não foi possível consultar a disponibilidade." },
      { status: 500 },
    );
  }
}
