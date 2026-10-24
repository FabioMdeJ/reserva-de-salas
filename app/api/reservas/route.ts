import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { gerarHorarios, obterExpediente } from "@/lib/expediente";
import {
  criarReservaComBloqueio,
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
  const horaInicio = typeof dados.horaInicio === "string" ? dados.horaInicio : "";

  if (
    !salaId || salaId.length > 100 || nome.length < 2 || nome.length > 120 ||
    email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    telefone.length > 30 || !dataLocalValida(dataTexto) || !/^\d{2}:\d{2}$/.test(horaInicio)
  ) {
    return NextResponse.json(
      { mensagem: "Informe nome, e-mail, sala, data e horário válidos." },
      { status: 400 },
    );
  }

  const dataReserva = criarDataReserva(dataTexto);
  const inicioProximoDia = new Date(dataReserva);
  inicioProximoDia.setUTCDate(inicioProximoDia.getUTCDate() + 1);
  const agoraSolicitacao = new Date();

  if (
    dataTexto < obterDataLocal(agoraSolicitacao) ||
    (dataTexto === obterDataLocal(agoraSolicitacao) && horaInicio <= obterHoraLocal(agoraSolicitacao))
  ) {
    return NextResponse.json({ mensagem: "Escolha uma data e um horário futuros." }, { status: 400 });
  }

  const expediente = obterExpediente(new Date(`${dataTexto}T12:00:00.000Z`));
  const horario = expediente && gerarHorarios(expediente).find(
    (opcao) => opcao.inicio === horaInicio,
  );
  if (!horario) {
    return NextResponse.json({ mensagem: "Escolha um horário válido dentro do expediente." }, { status: 400 });
  }

  try {
    const reserva = await criarReservaComBloqueio(prisma, {
      salaId,
      dataTexto,
      dataReserva,
      inicioProximoDia,
      horaInicio,
      horaFim: horario.fim,
      nome,
      email,
      telefone: telefone || null,
    });

    return NextResponse.json({ reserva }, { status: 201 });
  } catch (error) {
    const resposta = respostaErroReserva(error);
    if (resposta) {
      return NextResponse.json({ mensagem: resposta.mensagem }, { status: resposta.status });
    }
    console.error("Erro ao criar reserva:", error);
    return NextResponse.json({ mensagem: "Não foi possível criar a reserva." }, { status: 500 });
  }
}
