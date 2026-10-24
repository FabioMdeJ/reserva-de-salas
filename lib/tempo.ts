export const FUSO_HORARIO = "America/Sao_Paulo";

export function obterDataLocal(data = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_HORARIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(data);

  const valores = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return `${valores.year}-${valores.month}-${valores.day}`;
}

export function obterHoraLocal(data = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSO_HORARIO,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(data);
}

export function criarDataReserva(dataLocal: string): Date {
  // A coluna guarda o dia civil selecionado como meia-noite UTC, sem
  // reinterpretá-lo conforme o fuso configurado no servidor.
  return new Date(`${dataLocal}T00:00:00.000Z`);
}

export function dataLocalValida(valor: string | null): valor is string {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T12:00:00.000Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}
