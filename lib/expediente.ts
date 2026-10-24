
export type Expediente = {
  abertura: string;
  fechamento: string;
};

export function obterExpediente(data: Date): Expediente | null {
  const diaSemana = data.getUTCDay();

  // Domingo: fechado
  if (diaSemana === 0) {
    return null;
  }

  // Sábado: 08h às 12h
  if (diaSemana === 6) {
    return {
      abertura: "08:00",
      fechamento: "12:00",
    };
  }

  // Segunda a sexta: 08h às 18h
  return {
    abertura: "08:00",
    fechamento: "18:00",
  };
}

export function gerarHorarios(
  expediente: Expediente,
  duracaoMinutos = 60,
) {
  const horarios: { inicio: string; fim: string }[] = [];

  const [horaAbertura, minutoAbertura] = expediente.abertura
    .split(":")
    .map(Number);

  const [horaFechamento, minutoFechamento] = expediente.fechamento
    .split(":")
    .map(Number);

  const abertura = horaAbertura * 60 + minutoAbertura;
  const fechamento = horaFechamento * 60 + minutoFechamento;

  for (
    let inicio = abertura;
    inicio + duracaoMinutos <= fechamento;
    inicio += duracaoMinutos
  ) {
    const fim = inicio + duracaoMinutos;

    horarios.push({
      inicio: `${String(Math.floor(inicio / 60)).padStart(2, "0")}:${String(inicio % 60).padStart(2, "0")}`,
      fim: `${String(Math.floor(fim / 60)).padStart(2, "0")}:${String(fim % 60).padStart(2, "0")}`,
    });
  }

  return horarios;
}
