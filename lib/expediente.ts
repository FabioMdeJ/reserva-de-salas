
export type Expediente = {
  abertura: string;
  fechamento: string;
};

const DURACAO_RESERVA_MINUTOS = 60;

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

export function gerarHorarios(expediente: Expediente) {
  const horarios: { inicio: string; fim: string }[] = [];

  const [horaAbertura, minutoAbertura] = expediente.abertura
    .split(":")
    .map(Number);

  const [horaFechamento, minutoFechamento] = expediente.fechamento
    .split(":")
    .map(Number);

  const abertura = horaAbertura * 60 + minutoAbertura;
  const fechamento = horaFechamento * 60 + minutoFechamento;
  const primeiroInicioEmHoraCheia = Math.ceil(abertura / 60) * 60;

  for (
    let inicio = primeiroInicioEmHoraCheia;
    inicio + DURACAO_RESERVA_MINUTOS <= fechamento;
    inicio += DURACAO_RESERVA_MINUTOS
  ) {
    const fim = inicio + DURACAO_RESERVA_MINUTOS;

    horarios.push({
      inicio: `${String(Math.floor(inicio / 60)).padStart(2, "0")}:${String(inicio % 60).padStart(2, "0")}`,
      fim: `${String(Math.floor(fim / 60)).padStart(2, "0")}:${String(fim % 60).padStart(2, "0")}`,
    });
  }

  return horarios;
}

export function obterHorarioPermitido(data: Date, horaInicio: string) {
  if (!/^(?:[01]\d|2[0-3]):00$/.test(horaInicio)) return null;

  const expediente = obterExpediente(data);
  if (!expediente) return null;

  return gerarHorarios(expediente).find((horario) => horario.inicio === horaInicio) ?? null;
}
