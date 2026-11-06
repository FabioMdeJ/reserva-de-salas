import assert from "node:assert/strict";
import test from "node:test";
import { gerarHorarios, obterExpediente, obterHorarioPermitido } from "../lib/expediente.ts";

const dataUTC = (data) => new Date(`${data}T12:00:00.000Z`);

test("segunda a sexta gera apenas inícios cheios de 08:00 a 17:00", () => {
  const expediente = obterExpediente(dataUTC("2026-10-26"));
  assert.ok(expediente);

  const horarios = gerarHorarios(expediente);
  assert.equal(horarios.length, 10);
  assert.deepEqual(horarios[0], { inicio: "08:00", fim: "09:00" });
  assert.deepEqual(horarios.at(-1), { inicio: "17:00", fim: "18:00" });
  assert.ok(horarios.every(({ inicio, fim }) => inicio.endsWith(":00") && fim.endsWith(":00")));
  assert.ok(horarios.every(({ inicio, fim }) => Number(fim.slice(0, 2)) - Number(inicio.slice(0, 2)) === 1));
});

test("sábado gera 08:00, 09:00, 10:00 e 11:00, encerrando ao meio-dia", () => {
  const expediente = obterExpediente(dataUTC("2026-10-31"));
  assert.ok(expediente);

  const horarios = gerarHorarios(expediente);
  assert.deepEqual(horarios, [
    { inicio: "08:00", fim: "09:00" },
    { inicio: "09:00", fim: "10:00" },
    { inicio: "10:00", fim: "11:00" },
    { inicio: "11:00", fim: "12:00" },
  ]);
});

test("domingo não possui expediente nem horários", () => {
  const expediente = obterExpediente(dataUTC("2026-11-01"));
  assert.equal(expediente, null);
});

test("a grade pula qualquer abertura que não esteja em uma hora cheia", () => {
  assert.deepEqual(gerarHorarios({ abertura: "08:30", fechamento: "11:15" }), [
    { inicio: "09:00", fim: "10:00" },
    { inicio: "10:00", fim: "11:00" },
  ]);
});

test("valida somente horários cheios e inícios que cabem no expediente", () => {
  const segunda = dataUTC("2026-10-26");
  const sabado = dataUTC("2026-10-31");
  const domingo = dataUTC("2026-11-01");

  assert.deepEqual(obterHorarioPermitido(segunda, "17:00"), { inicio: "17:00", fim: "18:00" });
  assert.equal(obterHorarioPermitido(segunda, "18:00"), null);
  for (const hora of ["08:30", "09:15", "10:45", "07:00", "24:00"]) {
    assert.equal(obterHorarioPermitido(segunda, hora), null, `segunda deve rejeitar ${hora}`);
  }
  assert.deepEqual(obterHorarioPermitido(sabado, "11:00"), { inicio: "11:00", fim: "12:00" });
  assert.equal(obterHorarioPermitido(sabado, "12:00"), null);
  assert.equal(obterHorarioPermitido(domingo, "08:00"), null);
});
