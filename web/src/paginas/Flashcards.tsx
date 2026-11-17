// Flashcards: a lista de baralhos (um por matéria) e a sessão de estudo, com os quatro botões do
// Anki. O servidor escolhe a carta e calcula os intervalos; aqui é só a mesa de estudo.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, mensagem, type Baralho, type Estatisticas, type Rodada } from "../lib/api";
import { plural, useApp } from "../lib/loja";
import { Link, useBusca } from "../lib/rota";
import { ConteudoNota } from "../componentes/ConteudoNota";
import { Icone } from "../componentes/Icone";
import { Carregando, Vazio } from "../componentes/ui";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function Baralhos() {
  const { idx } = useApp();
  const [dados, setDados] = useState<{ baralhos: Baralho[]; estatisticas: Estatisticas } | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    api.get<{ baralhos: Baralho[]; estatisticas: Estatisticas }>("/api/flashcards/baralhos").then(setDados).catch((e) => setErro(mensagem(e)));
  }, []);
  if (erro) return <div className="pagina"><Vazio icone="alerta" titulo="Não foi possível carregar">{erro}</Vazio></div>;
  if (!dados) return <div className="pagina"><Carregando /></div>;
  const { baralhos, estatisticas: e } = dados;
  const semestres = [...new Set(baralhos.map((b) => b.semestre))].sort((a, b) => a - b);
  const maior = Math.max(1, ...e.semana.map((d) => d.n));
  return (
    <div className="pagina">
      <header className="cabeca-pagina">
        <div>
          <p className="olho">Flashcards</p>
          <h1 className="titulo-pagina">Baralhos por matéria</h1>
          <p className="sub">Repetição espaçada com o algoritmo do Anki: a carta volta quando você está prestes a esquecer.</p>
        </div>
      </header>

      <section className="estatisticas">
        <div className="cartao">
          <span className="rotulo">Hoje</span>
          <strong className="numerao">{e.feitasHoje}</strong>
          <span className="sub">{e.feitasHoje === 1 ? "revisão feita" : "revisões feitas"}</span>
        </div>
        <div className="cartao">
          <span className="rotulo">Sequência</span>
          <strong className="numerao">{e.sequencia}</strong>
          <span className="sub">{e.sequencia === 1 ? "dia seguido" : "dias seguidos"}</span>
        </div>
        <div className="cartao">
          <span className="rotulo">Retenção (30 dias)</span>
          <strong className="numerao">{e.retencao === null ? "–" : e.retencao + "%"}</strong>
          <span className="sub">das revisões acertadas</span>
        </div>
        <div className="cartao semana">
          <span className="rotulo">Últimos 7 dias</span>
          <div className="barras" aria-label="Revisões por dia">
            {e.semana.map((d) => (
              <span key={d.dia} title={`${d.n} em ${d.dia.split("-").reverse().join("/")}`}>
                <i style={{ height: Math.max(4, (d.n / maior) * 100) + "%" }} className={d.n ? "" : "zero"} />
                <small>{DIAS[new Date(d.dia + "T12:00:00").getDay()]}</small>
              </span>
            ))}
          </div>
        </div>
      </section>

      {!baralhos.length && <Vazio icone="cartas" titulo="Nenhum baralho ainda">Os flashcards aparecem junto com os resumos de cada matéria.</Vazio>}
      {semestres.map((s) => (
        <section key={s} className="grupo-baralhos">
          <h2 className="titulo-secao">{s}º semestre</h2>
          <div className="tabela-baralhos" role="table">
            <div className="linha cabecalho" role="row">
              <span role="columnheader">Matéria</span>
              <span role="columnheader" className="num novas" title="Cartas novas para hoje">Novas</span>
              <span role="columnheader" className="num aprendendo" title="Em aprendizado">Aprendendo</span>
              <span role="columnheader" className="num revisar" title="Para revisar hoje">Revisar</span>
              <span role="columnheader" />
            </div>
            {baralhos.filter((b) => b.semestre === s).map((b) => {
              const pendente = b.novos + b.aprendendo + b.revisar;
              return (
                <div className="linha" role="row" key={b.materia} data-baralho={b.materia}>
                  <span role="cell" className="baralho-nome">
                    <i className="ponto" style={{ background: idx.cor(b.materia) }} />
                    <span>
                      <strong>{b.nome}</strong>
                      <small>{plural(b.total, "carta", "cartas")} · {b.estudadas} vistas · {b.maduras} maduras</small>
                    </span>
                  </span>
                  <span role="cell" className={"num novas" + (b.novos ? "" : " zero")}>{b.novos}</span>
                  <span role="cell" className={"num aprendendo" + (b.aprendendo ? "" : " zero")}>{b.aprendendo}</span>
                  <span role="cell" className={"num revisar" + (b.revisar ? "" : " zero")}>{b.revisar}</span>
                  <span role="cell" className="baralho-acoes">
                    {b.deProva > 0 && <Link para={`/flashcards/${b.materia}?modo=prova`} className="botao pequeno fantasma" title="Só as cartas das notas de prova"><Icone nome="prova" tam={14} /> Prova</Link>}
                    <Link para={"/flashcards/" + b.materia} className={"botao pequeno " + (pendente ? "primario" : "fantasma")}>{pendente ? "Estudar" : "Em dia"}</Link>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

const BOTOES = [
  { r: 1, nome: "De novo", classe: "de-novo" },
  { r: 2, nome: "Difícil", classe: "dificil" },
  { r: 3, nome: "Bom", classe: "bom" },
  { r: 4, nome: "Fácil", classe: "facil" },
];

export function Estudo({ materia }: { materia: string }) {
  const { idx } = useApp();
  const busca = useBusca();
  const { nota, modo } = useMemo(() => {
    const p = new URLSearchParams(busca);
    return { nota: p.get("nota"), modo: p.get("modo") === "prova" ? "prova" : "" };
  }, [busca]);
  const [rodada, setRodada] = useState<Rodada | null>(null);
  const [virada, setVirada] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feitas, setFeitas] = useState(0);
  const [agora, setAgora] = useState(Date.now());

  const filtro = useMemo(() => ({ materia, ...(nota ? { nota } : {}), ...(modo ? { modo } : {}) }), [materia, nota, modo]);
  const carregar = useCallback(() => {
    setErro("");
    api
      .get<Rodada>("/api/flashcards/proxima?" + new URLSearchParams(filtro as Record<string, string>).toString())
      .then((r) => {
        setRodada(r);
        setVirada(false);
      })
      .catch((e) => setErro(mensagem(e)));
  }, [filtro]);
  useEffect(() => {
    setRodada(null);
    setFeitas(0);
    carregar();
  }, [carregar]);

  const responder = useCallback(
    async (resposta: number) => {
      if (!rodada?.carta || enviando) return;
      setEnviando(true);
      try {
        const r = await api.post<Rodada>("/api/flashcards/responder", { ...filtro, carta: rodada.carta.id, resposta });
        setRodada(r);
        setVirada(false);
        setFeitas((n) => n + 1);
        window.dispatchEvent(new Event("sinapse:estudou"));
      } catch (e) {
        setErro(mensagem(e));
      }
      setEnviando(false);
    },
    [rodada, enviando, filtro]
  );

  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea")) return;
      if (!rodada?.carta) return;
      if (!virada && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setVirada(true);
      } else if (virada && ["1", "2", "3", "4"].includes(e.key)) responder(Number(e.key));
      else if (virada && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        responder(3);
      }
    };
    document.addEventListener("keydown", t);
    return () => document.removeEventListener("keydown", t);
  }, [rodada, virada, responder]);

  // sem cartas agora, mas há uma em aprendizado: conta o tempo e recarrega quando ela vencer
  useEffect(() => {
    if (!rodada || rodada.carta || !rodada.proximaEm) return;
    const t = setInterval(() => {
      setAgora(Date.now());
      if (Date.now() >= rodada.proximaEm!) carregar();
    }, 1000);
    return () => clearInterval(t);
  }, [rodada, carregar]);

  const nomeMateria = idx.materia.get(materia)?.nome || "";
  const titulo = nota ? idx.nota.get(nota)?.titulo || "Nota" : modo ? "Cartas da prova" : "Baralho completo";
  const voltar = nota ? "/nota/" + nota : modo ? "/prova/" + materia : "/flashcards";

  if (erro && !rodada) return <div className="pagina"><Vazio icone="alerta" titulo="Não foi possível abrir o baralho">{erro}</Vazio></div>;
  if (!rodada) return <div className="pagina"><Carregando /></div>;
  const c = rodada.contagem;
  const carta = rodada.carta;

  return (
    <div className="pagina pagina-estudo">
      <header className="estudo-topo">
        <Link para={voltar} className="voltar"><Icone nome="esquerda" tam={15} /> {nota ? "Voltar à nota" : modo ? "Modo prova" : "Baralhos"}</Link>
        <div className="estudo-titulo">
          <span className="rotulo">{nomeMateria}</span>
          <strong>{titulo}</strong>
        </div>
        <div className="contadores" aria-label="Cartas restantes" data-testid="contadores">
          <span className="novas" title="Novas">{c.novos}</span>
          <span className="aprendendo" title="Aprendendo">{c.aprendendo}</span>
          <span className="revisar" title="Para revisar">{c.revisar}</span>
        </div>
      </header>
      {erro && <div className="alerta alerta-erro">{erro}</div>}

      {carta ? (
        <div className="mesa">
          <div className={"carta" + (virada ? " virada" : "")} data-testid="carta" data-estado={carta.estado}>
            <span className="carta-tipo">{carta.estado === "novo" ? "Nova" : carta.estado === "revisao" ? "Revisão" : carta.estado === "reaprendendo" ? "Reaprendendo" : "Aprendendo"}</span>
            <div className="carta-frente"><ConteudoNota html={carta.frente} /></div>
            {virada && (
              <>
                <hr />
                <div className="carta-verso" data-testid="verso"><ConteudoNota html={carta.verso} /></div>
                <Link para={"/nota/" + carta.nota.id} className="link-suave carta-origem">Da nota: {carta.nota.titulo} <Icone nome="direita" tam={13} /></Link>
              </>
            )}
          </div>
          {!virada ? (
            <button type="button" className="botao primario mostrar" onClick={() => setVirada(true)} autoFocus>
              Mostrar resposta <kbd>espaço</kbd>
            </button>
          ) : (
            <div className="respostas" role="group" aria-label="Como foi?">
              {BOTOES.map((b) => (
                <button type="button" key={b.r} className={"resposta " + b.classe} disabled={enviando} onClick={() => responder(b.r)} data-resposta={b.r}>
                  <small>{rodada.previsoes?.[b.r]}</small>
                  <strong>{b.nome}</strong>
                  <kbd>{b.r}</kbd>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="fim-estudo" data-testid="fim-estudo">
          <span className="fim-icone"><Icone nome="check" tam={34} /></span>
          <h2>{c.total === 0 ? "Este baralho ainda não tem cartas" : "Por agora é isso"}</h2>
          {rodada.proximaEm ? (
            <p>A próxima carta volta em <strong>{Math.max(1, Math.ceil((rodada.proximaEm - agora) / 60000))} min</strong>. Ela aparece aqui sozinha.</p>
          ) : c.total > 0 ? (
            <p>{feitas ? `Você respondeu ${plural(feitas, "carta", "cartas")} nesta sessão. ` : ""}Não há mais cartas para hoje neste baralho. O intervalo de cada uma já foi agendado.</p>
          ) : null}
          <div className="linha-botoes">
            <Link para={voltar} className="botao primario">{nota ? "Voltar à nota" : modo ? "Voltar ao modo prova" : "Ver baralhos"}</Link>
            {!nota && <Link para={"/materia/" + materia} className="botao fantasma">Ler a matéria</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
