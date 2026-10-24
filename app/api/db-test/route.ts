import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      sucesso: true,
      mensagem: "Conexão com o PostgreSQL funcionando!",
    });
  } catch (error) {
    console.error("Erro ao conectar ao banco:", error);

    return NextResponse.json(
      {
        sucesso: false,
        mensagem: "Não foi possível conectar ao banco de dados.",
      },
      { status: 500 },
    );
  }
}