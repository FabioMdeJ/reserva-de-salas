import assert from "node:assert/strict";
import test from "node:test";
import {
  alternarSelecaoHorario,
  classificarHorarios,
  filtrarSelecaoDisponivel,
  urlDisponibilidade,
} from "../lib/disponibilidade.ts";
import { gerarHorarios, obterExpediente } from "../lib/expediente.ts";

const dataFutura = "2099-06-20";
const dataHoje = "2099-06-19";
const horaAgora = "09:00";
const periodosSabado = gerarHorarios(obterExpediente(new Date(`${dataFutura}T12:00:00.000Z`)));

test("dia sem reservas retorna todos os períodos do expediente como disponíveis", () => {
  const grade = classificarHorarios(periodosSabado, [], dataFutura, dataHoje, horaAgora);

  assert.equal(grade.length, 4);
  assert.ok(grade.every((horario) => horario.estado === "DISPONIVEL"));
});

test("dia parcialmente ocupado mantém a grade e marca somente os conflitos", () => {
  const grade = classificarHorarios(
    periodosSabado,
    [{ horaInicio: "09:00", horaFim: "10:00" }, { horaInicio: "11:00", horaFim: "12:00" }],
    dataFutura,
    dataHoje,
    horaAgora,
  );

  assert.deepEqual(grade.map(({ inicio, estado }) => [inicio, estado]), [
    ["08:00", "DISPONIVEL"],
    ["09:00", "RESERVADO"],
    ["10:00", "DISPONIVEL"],
    ["11:00", "RESERVADO"],
  ]);
});

test("dia completamente ocupado mantém todos os períodos identificados como reservados", () => {
  const reservas = periodosSabado.map(({ inicio, fim }) => ({ horaInicio: inicio, horaFim: fim }));
  const grade = classificarHorarios(periodosSabado, reservas, dataFutura, dataHoje, horaAgora);

  assert.equal(grade.length, periodosSabado.length);
  assert.ok(grade.every((horario) => horario.estado === "RESERVADO"));
});

test("horários reservados não podem ser selecionados e são removidos após atualizar a disponibilidade", () => {
  const gradeInicial = classificarHorarios(
    periodosSabado,
    [],
    dataFutura,
    dataHoje,
    horaAgora,
  );
  const selecionados = alternarSelecaoHorario([], "09:00", gradeInicial);
  const gradeAtualizada = classificarHorarios(
    periodosSabado,
    [{ horaInicio: "09:00", horaFim: "10:00" }],
    dataFutura,
    dataHoje,
    horaAgora,
  );

  assert.deepEqual(alternarSelecaoHorario(selecionados, "09:00", gradeAtualizada), selecionados);
  assert.deepEqual(filtrarSelecaoDisponivel(selecionados, gradeAtualizada), []);
});

test("mudar a data produz uma nova consulta de disponibilidade", () => {
  assert.notEqual(
    urlDisponibilidade("sala 1", "2099-06-20"),
    urlDisponibilidade("sala 1", "2099-06-21"),
  );
  assert.equal(
    urlDisponibilidade("sala 1", "2099-06-21"),
    "/api/disponibilidade?salaId=sala%201&data=2099-06-21",
  );
});
