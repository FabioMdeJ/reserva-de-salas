
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Sala = {
  id: string;
  nome: string;
  descricao: string | null;
  valorHora: string;
  ativa: boolean;
};

type Horario = { inicio: string; fim: string };

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
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [horarioSelecionado, setHorarioSelecionado] = useState("");
  const [visitanteNome, setVisitanteNome] = useState("");
  const [visitanteEmail, setVisitanteEmail] = useState("");
  const [visitanteTelefone, setVisitanteTelefone] = useState("");
  const [carregandoHorarios, setCarregandoHorarios] = useState(false);
  const [enviandoReserva, setEnviandoReserva] = useState(false);
  const [mensagemReserva, setMensagemReserva] = useState("");
  const [erroReserva, setErroReserva] = useState("");

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
    if (!salaSelecionada || !dataReserva || mensagemReserva) return;
    const controller = new AbortController();

    async function buscarHorarios() {
      setCarregandoHorarios(true);
      setHorarios([]);
      setHorarioSelecionado("");
      try {
        const resposta = await fetch(
          `/api/disponibilidade?salaId=${encodeURIComponent(salaSelecionada)}&data=${dataReserva}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.mensagem || "Não foi possível consultar os horários.");
        setHorarios(dados.horarios);
        setErroReserva("");
      } catch (error) {
        if (!controller.signal.aborted) {
          setErroReserva(error instanceof Error ? error.message : "Não foi possível consultar os horários.");
        }
      } finally {
        if (!controller.signal.aborted) setCarregandoHorarios(false);
      }
    }

    void buscarHorarios();
    return () => controller.abort();
  }, [salaSelecionada, dataReserva, mensagemReserva]);

  async function criarReserva(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnviandoReserva(true);
    setErroReserva("");
    try {
      const resposta = await fetch("/api/reservas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salaId: salaSelecionada,
          data: dataReserva,
          horaInicio: horarioSelecionado,
          nome: visitanteNome,
          email: visitanteEmail,
          telefone: visitanteTelefone,
        }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.mensagem || "Não foi possível criar a reserva.");
      setMensagemReserva(`Horário reservado até ${new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
      }).format(new Date(dados.reserva.expiraEm))}. O pagamento não foi realizado.`);
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
                      setMensagemReserva("");
                      setErroReserva("");
                    }}
                    className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500"
                  >
                    Reservar horário
                  </button>
                )}

                {salaSelecionada === sala.id && (
                  <form onSubmit={criarReserva} className="mt-6 space-y-4 border-t border-slate-100 pt-5">
                    {mensagemReserva ? (
                      <div role="status" className="rounded-lg bg-green-50 p-4 text-sm text-green-800">
                        {mensagemReserva}
                      </div>
                    ) : (
                      <>
                        <h4 className="font-semibold">Seus dados para a reserva</h4>
                        <label className="block text-sm font-medium">
                          Nome
                          <input required minLength={2} maxLength={120} value={visitanteNome} onChange={(event) => setVisitanteNome(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                        </label>
                        <label className="block text-sm font-medium">
                          E-mail
                          <input required type="email" maxLength={254} value={visitanteEmail} onChange={(event) => setVisitanteEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                        </label>
                        <label className="block text-sm font-medium">
                          Telefone (opcional)
                          <input type="tel" maxLength={30} value={visitanteTelefone} onChange={(event) => setVisitanteTelefone(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                        </label>
                        <label className="block text-sm font-medium">
                          Data (horário de São Paulo)
                          <input required type="date" min={dataHojeEmSaoPaulo()} value={dataReserva} onChange={(event) => setDataReserva(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                        </label>
                        <div>
                          <p className="mb-2 text-sm font-medium">Horários disponíveis</p>
                          {carregandoHorarios && <p className="text-sm text-slate-500">Consultando...</p>}
                          {!carregandoHorarios && horarios.length === 0 && <p className="text-sm text-slate-500">Nenhum horário disponível nesta data.</p>}
                          <div className="grid grid-cols-3 gap-2">
                            {horarios.map((horario) => (
                              <button key={horario.inicio} type="button" onClick={() => setHorarioSelecionado(horario.inicio)} className={`rounded-lg border px-2 py-2 text-sm ${horarioSelecionado === horario.inicio ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-300 hover:border-blue-400"}`}>
                                {horario.inicio}
                              </button>
                            ))}
                          </div>
                        </div>
                        {erroReserva && <p role="alert" className="text-sm text-red-700">{erroReserva}</p>}
                        <p className="text-xs leading-5 text-slate-500">A reserva fica pendente por 15 minutos. Esta etapa não processa pagamentos.</p>
                        <button type="submit" disabled={!horarioSelecionado || carregandoHorarios || enviandoReserva} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
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
