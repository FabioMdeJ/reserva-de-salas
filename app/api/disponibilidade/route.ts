
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { classificarHorarios } from "@/lib/disponibilidade";
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
        fechado: true,
        horarios: [],
      });
    }

    const horarios = gerarHorarios(expediente);

    const inicioDoDia = criarDataReserva(dataTexto);
    const inicioDoProximoDia = new Date(inicioDoDia);
    inicioDoProximoDia.setUTCDate(inicioDoProximoDia.getUTCDate() + 1);

    const agora = new Date();
    const limiteExpiracao = new Date(agora.getTime() - 15 * 60 * 1000);
    await prisma.reserva.updateMany({
      where: {
        salaId,
        data: { gte: inicioDoDia, lt: inicioDoProximoDia },
        status: "PENDENTE",
        OR: [
          { expiraEm: { lte: agora } },
          { expiraEm: null, createdAt: { lte: limiteExpiracao } },
        ],
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
          {
            status: "PENDENTE",
            OR: [
              { expiraEm: { gt: agora } },
              { expiraEm: null, createdAt: { gt: limiteExpiracao } },
            ],
          },
        ],
      },
      select: {
        horaInicio: true,
        horaFim: true,
      },
    });

    const horariosClassificados = classificarHorarios(
      horarios,
      reservas,
      dataTexto,
      obterDataLocal(agora),
      obterHoraLocal(agora),
    );

    return NextResponse.json({
      salaId,
      data: dataTexto,
      fechado: false,
      horarios: horariosClassificados,
    });
  } catch (error) {
    console.error("Erro ao consultar disponibilidade:", error);

    return NextResponse.json(
      { mensagem: "Não foi possível consultar a disponibilidade." },
      { status: 500 },
    );
  }
}
