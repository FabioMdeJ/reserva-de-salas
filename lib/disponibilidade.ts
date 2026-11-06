export type Periodo = { inicio: string; fim: string };
export type ReservaOcupada = { horaInicio: string; horaFim: string };
export type EstadoHorario = "DISPONIVEL" | "RESERVADO" | "INDISPONIVEL";
export type HorarioDisponibilidade = Periodo & { estado: EstadoHorario };

export function classificarHorarios(
  periodos: Periodo[],
  reservas: ReservaOcupada[],
  data: string,
  dataHoje: string,
  horaAgora: string,
): HorarioDisponibilidade[] {
  return periodos.map((periodo) => {
    const horarioPassado =
      data < dataHoje || (data === dataHoje && periodo.inicio <= horaAgora);
    const reservado = reservas.some(
      (reserva) =>
        periodo.inicio < reserva.horaFim && periodo.fim > reserva.horaInicio,
    );

    return {
      ...periodo,
      estado: horarioPassado
        ? "INDISPONIVEL"
        : reservado
          ? "RESERVADO"
          : "DISPONIVEL",
    };
  });
}

export function filtrarSelecaoDisponivel(
  selecionados: string[],
  horarios: HorarioDisponibilidade[],
) {
  return selecionados.filter((inicio) =>
    horarios.some(
      (horario) => horario.inicio === inicio && horario.estado === "DISPONIVEL",
    ),
  );
}

export function alternarSelecaoHorario(
  selecionados: string[],
  inicio: string,
  horarios: HorarioDisponibilidade[],
) {
  const horario = horarios.find((item) => item.inicio === inicio);
  if (!horario || horario.estado !== "DISPONIVEL") return selecionados;

  return selecionados.includes(inicio)
    ? selecionados.filter((item) => item !== inicio)
    : [...selecionados, inicio].sort();
}

export function urlDisponibilidade(salaId: string, data: string) {
  return `/api/disponibilidade?salaId=${encodeURIComponent(salaId)}&data=${encodeURIComponent(data)}`;
}
