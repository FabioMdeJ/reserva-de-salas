

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const salas = await prisma.sala.findMany({
      orderBy: {
        nome: "asc",
      },
    });

    return NextResponse.json(salas);
  } catch (error) {
    console.error("Erro ao buscar salas:", error);

    return NextResponse.json(
      { mensagem: "Não foi possível buscar as salas." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const nome =
      typeof body.nome === "string" ? body.nome.trim() : "";

    const descricao =
      typeof body.descricao === "string"
        ? body.descricao.trim()
        : null;

    const valorHora = Number(body.valorHora);

    if (!nome || !Number.isFinite(valorHora) || valorHora <= 0) {
      return NextResponse.json(
        {
          mensagem:
            "Informe um nome e um valor por hora maior que zero.",
        },
        { status: 400 },
      );
    }

    const sala = await prisma.sala.create({
      data: {
        nome,
        descricao: descricao || null,
        valorHora,
      },
    });

    return NextResponse.json(sala, { status: 201 });
  } catch (error) {
    console.error("Erro ao cadastrar sala:", error);

    return NextResponse.json(
      { mensagem: "Não foi possível cadastrar a sala." },
      { status: 500 },
    );
  }
}
