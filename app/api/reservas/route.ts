import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { obterHorarioPermitido } from "@/lib/expediente";
import {
  criarReservasComBloqueio,
  respostaErroReserva,
} from "@/lib/reserva-service";
import {
  criarDataReserva,
  dataLocalValida,
  obterDataLocal,
  obterHoraLocal,
} from "@/lib/tempo";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ mensagem: "O corpo da solicitação deve ser JSON válido." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ mensagem: "Informe os dados da reserva." }, { status: 400 });
  }

  const dados = body as Record<string, unknown>;
  const salaId = typeof dados.salaId === "string" ? dados.salaId.trim() : "";
  const nome = typeof dados.nome === "string" ? dados.nome.trim() : "";
  const email = typeof dados.email === "string" ? dados.email.trim().toLowerCase() : "";
  const telefone = typeof dados.telefone === "string" ? dados.telefone.trim() : "";
  const dataTexto = typeof dados.data === "string" ? dados.data : null;
  const horariosRecebidos = dados.horarios === undefined && typeof dados.horaInicio === "string"
    ? [dados.horaInicio]
    : dados.horarios;

  if (
    !salaId || salaId.length > 100 || nome.length < 2 || nome.length > 120 ||
    email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    telefone.length > 30 || !dataLocalValida(dataTexto) ||
    !Array.isArray(horariosRecebidos) || horariosRecebidos.length === 0 ||
    horariosRecebidos.length > 10 ||
    !horariosRecebidos.every((hora): hora is string => typeof hora === "string" && /^\d{2}:\d{2}$/.test(hora)) ||
    new Set(horariosRecebidos).size !== horariosRecebidos.length
  ) {
    return NextResponse.json(
      { mensagem: "Informe nome, e-mail, sala, data e pelo menos um horário válido." },
      { status: 400 },
    );
  }

  const dataReserva = criarDataReserva(dataTexto);
  const inicioProximoDia = new Date(dataReserva);
  inicioProximoDia.setUTCDate(inicioProximoDia.getUTCDate() + 1);
  const agoraSolicitacao = new Date();

  const horariosOrdenados = [...horariosRecebidos].sort();
  const dataNoonUtc = new Date(`${dataTexto}T12:00:00.000Z`);
  const periodos: Array<{ horaInicio: string; horaFim: string }> = [];
  for (const horaInicio of horariosOrdenados) {
    const periodo = obterHorarioPermitido(dataNoonUtc, horaInicio);
    if (!periodo) {
      return NextResponse.json({ mensagem: "Escolha um horário válido dentro do expediente." }, { status: 400 });
    }
    periodos.push({ horaInicio: periodo.inicio, horaFim: periodo.fim });
  }

  if (dataTexto < obterDataLocal(agoraSolicitacao) || (
    dataTexto === obterDataLocal(agoraSolicitacao) &&
    periodos.some((periodo) => periodo.horaInicio <= obterHoraLocal(agoraSolicitacao))
  )) {
    return NextResponse.json({ mensagem: "Escolha uma data e um horário futuros." }, { status: 400 });
  }

  try {
    const resultado = await criarReservasComBloqueio(prisma, {
      salaId,
      dataTexto,
      dataReserva,
      inicioProximoDia,
      periodos,
      nome,
      email,
      telefone: telefone || null,
    });

    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    const resposta = respostaErroReserva(error);
    if (resposta) {
      return NextResponse.json({ mensagem: resposta.mensagem }, { status: resposta.status });
    }
    console.error("Erro ao criar reserva:", error);
    return NextResponse.json({ mensagem: "Não foi possível criar a reserva." }, { status: 500 });
  }
}
