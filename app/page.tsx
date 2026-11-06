
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  alternarSelecaoHorario,
  filtrarSelecaoDisponivel,
  urlDisponibilidade,
  type HorarioDisponibilidade,
} from "@/lib/disponibilidade";

type Sala = {
  id: string;
  nome: string;
  descricao: string | null;
  valorHora: string;
  ativa: boolean;
};

type Horario = { inicio: string; fim: string };
type ResultadoReserva = {
  visitanteNome: string;
  salaNome: string;
  data: string;
  horarios: Horario[];
  total: string;
  expiraEm: string;
};

function dataHojeEmSaoPaulo() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valores = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return `${valores.year}-${valores.month}-${valores.day}`;
}

export default function Home() {
  const [salas, setSalas] = useState<Sala[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [salaSelecionada, setSalaSelecionada] = useState("");
  const [dataReserva, setDataReserva] = useState(dataHojeEmSaoPaulo);
  const [horarios, setHorarios] = useState<HorarioDisponibilidade[]>([]);
  const [horariosSelecionados, setHorariosSelecionados] = useState<string[]>([]);
  const [visitanteNome, setVisitanteNome] = useState("");
  const [visitanteEmail, setVisitanteEmail] = useState("");
  const [visitanteTelefone, setVisitanteTelefone] = useState("");
  const [carregandoHorarios, setCarregandoHorarios] = useState(false);
  const [estadoDisponibilidade, setEstadoDisponibilidade] = useState<"ociosa" | "carregando" | "carregada" | "erro">("ociosa");
  const [diaFechado, setDiaFechado] = useState(false);
  const [erroDisponibilidade, setErroDisponibilidade] = useState("");
  const [enviandoReserva, setEnviandoReserva] = useState(false);
  const [versaoDisponibilidade, setVersaoDisponibilidade] = useState(0);
  const [resultadoReserva, setResultadoReserva] = useState<ResultadoReserva | null>(null);
  const [erroReserva, setErroReserva] = useState("");
  const preservarSelecaoNaAtualizacao = useRef(false);

  useEffect(() => {
    async function buscarSalas() {
      try {
        const resposta = await fetch("/api/salas");

        if (!resposta.ok) {
          throw new Error("Não foi possível carregar as salas.");
        }

        const dados: Sala[] = await resposta.json();
        setSalas(dados.filter((sala) => sala.ativa));
      } catch {
        setErro("Não foi possível carregar as salas. Tente novamente.");
      } finally {
        setCarregando(false);
      }
    }

    buscarSalas();
  }, []);

  useEffect(() => {
    if (!salaSelecionada || !dataReserva || resultadoReserva) return;
    const controller = new AbortController();
    const preservarSelecao = preservarSelecaoNaAtualizacao.current;
    preservarSelecaoNaAtualizacao.current = false;

    async function buscarHorarios() {
      setCarregandoHorarios(true);
      setEstadoDisponibilidade("carregando");
      setErroDisponibilidade("");
      setHorarios([]);
      if (!preservarSelecao) {
        setHorariosSelecionados([]);
      }
      try {
        const resposta = await fetch(
          urlDisponibilidade(salaSelecionada, dataReserva),
          { signal: controller.signal, cache: "no-store" },
        );
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.mensagem || "Não foi possível consultar os horários.");
        if (!Array.isArray(dados.horarios) || typeof dados.fechado !== "boolean") {
          throw new Error("A resposta de disponibilidade está em um formato inválido.");
        }
        setHorarios(dados.horarios);
        setDiaFechado(dados.fechado);
        setHorariosSelecionados((selecionados) =>
          filtrarSelecaoDisponivel(selecionados, dados.horarios),
        );
        setEstadoDisponibilidade("carregada");
      } catch (error) {
        if (!controller.signal.aborted) {
          setHorarios([]);
          setHorariosSelecionados([]);
          setDiaFechado(false);
          setEstadoDisponibilidade("erro");
          setErroDisponibilidade(error instanceof Error ? error.message : "Não foi possível consultar os horários.");
        }
      } finally {
        if (!controller.signal.aborted) setCarregandoHorarios(false);
      }
    }

    void buscarHorarios();
    return () => controller.abort();
  }, [salaSelecionada, dataReserva, resultadoReserva, versaoDisponibilidade]);

  function atualizarDisponibilidade() {
    preservarSelecaoNaAtualizacao.current = true;
    setErroReserva("");
    setEstadoDisponibilidade("ociosa");
    setHorarios([]);
    setVersaoDisponibilidade((versao) => versao + 1);
  }

  function alternarHorario(horaInicio: string) {
    if (carregandoHorarios || enviandoReserva) {
      return;
    }
    setErroReserva("");

    setHorariosSelecionados((selecionados) => alternarSelecaoHorario(selecionados, horaInicio, horarios));
  }

  async function criarReserva(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nome = visitanteNome.trim();
    const email = visitanteEmail.trim().toLowerCase();
    if (
      !salaSelecionada || !dataReserva || nome.length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      horariosSelecionados.length === 0 ||
      estadoDisponibilidade !== "carregada" ||
      !horariosSelecionados.every((inicio) =>
        horarios.some((horario) => horario.inicio === inicio && horario.estado === "DISPONIVEL"),
      )
    ) {
      setErroReserva("Informe seu nome e e-mail válidos e selecione pelo menos um período.");
      return;
    }

    setEnviandoReserva(true);
    setErroReserva("");
    try {
      const resposta = await fetch("/api/reservas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salaId: salaSelecionada,
          data: dataReserva,
          horarios: horariosSelecionados,
          nome,
          email,
          telefone: visitanteTelefone,
        }),
      });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        throw new Error(typeof dados?.mensagem === "string" ? dados.mensagem : "Não foi possível criar a reserva.");
      }
      if (
        !dados || !Array.isArray(dados.reservas) || dados.reservas.length === 0 ||
        typeof dados.total !== "string" || typeof dados.expiraEm !== "string"
      ) {
        throw new Error("O servidor não retornou os dados da solicitação. Atualize os horários e tente novamente.");
      }
      setResultadoReserva({
        visitanteNome: nome,
        salaNome: salas.find((sala) => sala.id === salaSelecionada)?.nome ?? "Sala selecionada",
        data: dataReserva,
        horarios: dados.reservas.map((reserva: { horaInicio: string; horaFim: string }) => ({ inicio: reserva.horaInicio, fim: reserva.horaFim })),
        total: dados.total,
        expiraEm: dados.expiraEm,
      });
    } catch (error) {
      setErroReserva(error instanceof Error ? error.message : "Não foi possível criar a reserva.");
    } finally {
      setEnviandoReserva(false);
    }
  }

  function formatarPreco(valor: string) {
    return Number(valor).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  const salaAtual = salas.find((sala) => sala.id === salaSelecionada);
  const valorHora = Number(salaAtual?.valorHora ?? 0);
  const valorTotalEstimado = Math.round(valorHora * 100) * horariosSelecionados.length / 100;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link href="/" className="text-xl font-bold tracking-tight">
            Reserva<span className="text-blue-600">Fácil</span>
          </Link>

          <span className="text-sm text-slate-600">
            Reserve seu espaço por hora
          </span>
        </div>
      </header>

      <section className="bg-slate-900 px-6 py-20 text-white sm:py-28">
        <div className="mx-auto max-w-7xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">
            Seu espaço, no seu tempo
          </p>

          <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
            Encontre o espaço ideal para o seu próximo encontro.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            Conheça nossas salas, consulte os valores por hora e encontre o
            ambiente ideal para suas reuniões e atendimentos.
          </p>

          <a
            href="#salas"
            className="mt-8 inline-flex rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-500"
          >
            Conhecer as salas
          </a>
        </div>
      </section>

      <section id="salas" className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">
            Nossos espaços
          </p>

          <h2 className="mt-2 text-3xl font-bold sm:text-4xl">
            Salas disponíveis
          </h2>

          <p className="mt-3 text-slate-600">
            Confira os espaços disponíveis e seus valores por hora.
          </p>
        </div>

        {carregando && (
          <p className="py-10 text-slate-600">Carregando salas...</p>
        )}

        {!carregando && erro && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            {erro}
          </p>
        )}

        {!carregando && !erro && salas.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <h3 className="text-xl font-semibold">
              Nenhuma sala disponível no momento
            </h3>
            <p className="mt-2 text-slate-600">
              Volte em breve para conferir nossos espaços.
            </p>
          </div>
        )}

        {!carregando && !erro && salas.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {salas.map((sala) => (
              <article
                key={sala.id}
                className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              >
                <div className="mb-5 flex h-36 items-center justify-center rounded-xl bg-blue-50 text-5xl">
                  🏢
                </div>

                <h3 className="text-xl font-bold">{sala.nome}</h3>

                <p className="mt-2 min-h-12 leading-6 text-slate-600">
                  {sala.descricao || "Espaço para reuniões e atendimentos."}
                </p>

                <div className="mt-6 border-t border-slate-100 pt-5">
                  <p className="text-sm text-slate-500">Valor por hora</p>

                  <p className="mt-1 text-2xl font-bold text-blue-700">
                    {formatarPreco(sala.valorHora)}
                    <span className="text-sm font-normal text-slate-500">
                      {" "}
                      / hora
                    </span>
                  </p>
                </div>

                {salaSelecionada !== sala.id && (
                  <button
                    type="button"
                    onClick={() => {
                      setSalaSelecionada(sala.id);
                      setDataReserva(dataHojeEmSaoPaulo());
                      setEstadoDisponibilidade("ociosa");
                      setHorarios([]);
                      setDiaFechado(false);
                      setHorariosSelecionados([]);
                      setResultadoReserva(null);
                      setErroReserva("");
                    }}
                    className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500"
                  >
                    Reservar horário
                  </button>
                )}

                {salaSelecionada === sala.id && (
                  <form onSubmit={criarReserva} className="mt-6 space-y-4 border-t border-slate-100 pt-5">
                    {resultadoReserva ? (
                      <div role="status" className="space-y-3 rounded-lg bg-green-50 p-4 text-sm text-green-900">
                        <h4 className="font-semibold">Solicitação de reserva registrada</h4>
                        <p><strong>Visitante:</strong> {resultadoReserva.visitanteNome}</p>
                        <p><strong>Sala:</strong> {resultadoReserva.salaNome}</p>
                        <p><strong>Data:</strong> {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date(`${resultadoReserva.data}T12:00:00.000Z`))}</p>
                        <div>
                          <p className="font-medium">Períodos registrados:</p>
                          <ul className="list-inside list-disc">
                            {resultadoReserva.horarios.map((horario) => <li key={horario.inicio}>{horario.inicio} – {horario.fim}</li>)}
                          </ul>
                        </div>
                        <p><strong>Quantidade de horas:</strong> {resultadoReserva.horarios.length}</p>
                        <p><strong>Valor total calculado pelo servidor:</strong> {formatarPreco(resultadoReserva.total)}</p>
                        <p><strong>Status:</strong> Pendente. A solicitação não está confirmada nem paga.</p>
                        <p>A próxima etapa deve ser concluída em até 15 minutos, até {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(resultadoReserva.expiraEm))}.</p>
                        <button type="button" onClick={() => setSalaSelecionada("")} className="w-full px-4 py-2 text-sm text-green-900 underline">Fechar</button>
                      </div>
                    ) : (
                      <>
                        <h4 className="font-semibold">Seus dados para a reserva</h4>
                        <label className="block text-sm font-medium">
                          Nome
                          <input required minLength={2} maxLength={120} value={visitanteNome} onChange={(event) => { setVisitanteNome(event.target.value); setErroReserva(""); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                        </label>
                        <label className="block text-sm font-medium">
                          E-mail
                          <input required type="email" maxLength={254} value={visitanteEmail} onChange={(event) => { setVisitanteEmail(event.target.value); setErroReserva(""); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                        </label>
                        <label className="block text-sm font-medium">
                          Telefone (opcional)
                          <input type="tel" maxLength={30} value={visitanteTelefone} onChange={(event) => setVisitanteTelefone(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                        </label>
                        <label className="block text-sm font-medium">
                          Data (horário de São Paulo)
                          <input required type="date" min={dataHojeEmSaoPaulo()} value={dataReserva} onChange={(event) => { setHorariosSelecionados([]); setHorarios([]); setDiaFechado(false); setEstadoDisponibilidade("ociosa"); setDataReserva(event.target.value); setErroReserva(""); setErroDisponibilidade(""); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                        </label>
                        <div>
                          <p className="mb-2 text-sm font-medium">Períodos disponíveis</p>
                          <p className="mb-2 text-xs text-slate-500">Selecione um ou mais períodos. A reserva só será criada ao confirmar.</p>
                          {carregandoHorarios && <p className="text-sm text-slate-500">Consultando...</p>}
                          {estadoDisponibilidade === "erro" && (
                            <div role="alert" className="mb-3 space-y-2 text-sm text-red-700">
                              <p>{erroDisponibilidade}</p>
                              <button type="button" onClick={atualizarDisponibilidade} disabled={carregandoHorarios || enviandoReserva} className="font-medium underline disabled:opacity-50">
                                Tentar consultar novamente
                              </button>
                            </div>
                          )}
                          {estadoDisponibilidade === "carregada" && diaFechado && <p className="text-sm text-slate-500">Não há expediente nesta data (domingo fechado).</p>}
                          {estadoDisponibilidade === "carregada" && !diaFechado && horarios.length === 0 && <p className="text-sm text-slate-500">Nenhum período válido para reserva nesta data.</p>}
                          {estadoDisponibilidade === "carregada" && horarios.length > 0 && !horarios.some((horario) => horario.estado === "DISPONIVEL") && <p className="mb-3 text-sm text-slate-600">Não existem horários disponíveis nesta data.</p>}
                          <div className="grid grid-cols-3 gap-2">
                            {estadoDisponibilidade === "carregada" && horarios.map((horario) => {
                              const selecionado = horariosSelecionados.includes(horario.inicio);
                              const ocupado = horario.estado === "RESERVADO";
                              const indisponivel = horario.estado === "INDISPONIVEL";
                              const desabilitado = horario.estado !== "DISPONIVEL" || carregandoHorarios || enviandoReserva;
                              return (
                                <button
                                  key={horario.inicio}
                                  type="button"
                                  disabled={desabilitado}
                                  aria-pressed={selecionado}
                                  aria-label={`${horario.inicio} a ${horario.fim}: ${ocupado ? "Reservado" : indisponivel ? "Indisponível" : selecionado ? "Selecionado" : "Disponível"}`}
                                  onClick={() => alternarHorario(horario.inicio)}
                                  className={`rounded-lg border px-2 py-2 text-sm ${selecionado ? "border-blue-600 bg-blue-50 text-blue-700" : ocupado || indisponivel ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-70" : "border-slate-300 hover:border-blue-400"}`}
                                >
                                  <span className="block">{horario.inicio} – {horario.fim}</span>
                                  {(ocupado || indisponivel) && <span className="mt-1 block text-xs">{ocupado ? "Reservado" : "Indisponível"}</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-4 text-sm">
                          <p>Preço por hora: <strong>{formatarPreco(salaAtual?.valorHora ?? "0")}</strong></p>
                          <p className="mt-2 font-medium">Períodos selecionados</p>
                          {horariosSelecionados.length > 0 ? (
                            <ul className="mt-1 list-inside list-disc text-slate-600">
                              {horariosSelecionados.map((horaInicio) => {
                                const periodo = horarios.find((horario) => horario.inicio === horaInicio);
                                return periodo ? <li key={horaInicio}>{periodo.inicio} – {periodo.fim}</li> : null;
                              })}
                            </ul>
                          ) : <p className="mt-1 text-slate-500">Nenhum período selecionado.</p>}
                          <p className="mt-2">Quantidade de horas: <strong>{horariosSelecionados.length}</strong></p>
                          <p className="mt-1">Valor total estimado: <strong>{formatarPreco(String(valorTotalEstimado))}</strong></p>
                        </div>
                        {erroReserva && (
                          <div role="alert" className="space-y-2 text-sm text-red-700">
                            <p>{erroReserva}</p>
                            <button type="button" onClick={atualizarDisponibilidade} disabled={carregandoHorarios || enviandoReserva} className="font-medium underline disabled:opacity-50">
                              Atualizar disponibilidade
                            </button>
                          </div>
                        )}
                        <p className="text-xs leading-5 text-slate-500">O valor é estimativo até a confirmação. Os períodos selecionados ficam pendentes por 15 minutos após confirmar. Esta etapa não processa pagamentos.</p>
                        <button type="submit" disabled={horariosSelecionados.length === 0 || carregandoHorarios || estadoDisponibilidade !== "carregada" || enviandoReserva || Boolean(erroReserva) || Boolean(erroDisponibilidade)} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                          {enviandoReserva ? "Criando reserva..." : "Confirmar reserva"}
                        </button>
                        <button type="button" onClick={() => setSalaSelecionada("")} className="w-full px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Fechar</button>
                      </>
                    )}
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-slate-200 bg-white px-6 py-8">
        <div className="mx-auto max-w-7xl text-center text-sm text-slate-500">
          © {new Date().getFullYear()} ReservaFácil. Todos os direitos
          reservados.
        </div>
      </footer>
    </main>
  );
}
