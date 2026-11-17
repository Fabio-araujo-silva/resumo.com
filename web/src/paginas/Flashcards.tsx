// Flashcards: a lista de baralhos (um por matéria) e a sessão de estudo, com os quatro botões do
// Anki. O servidor escolhe a carta e calcula os intervalos; aqui é só a mesa de estudo.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, mensagem, type Baralho, type Estatisticas, type LimiteCartas, type Rodada } from "../lib/api";
import { nomeAv } from "../lib/avaliacao";
import { Ajuda, ComAjuda } from "../componentes/Ajuda";
import { Modal } from "../componentes/ui";
import { ir } from "../lib/rota";
import { plural, useApp } from "../lib/loja";
import { Link, useBusca } from "../lib/rota";
import { ConteudoNota } from "../componentes/ConteudoNota";
import { Icone } from "../componentes/Icone";
import { Carregando, Vazio } from "../componentes/ui";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function Baralhos() {
  const { idx } = useApp();
  const { avisar } = useApp();
  const [dados, setDados] = useState<{ baralhos: Baralho[]; estatisticas: Estatisticas; limite: LimiteCartas } | null>(null);
  const [erro, setErro] = useState("");
  const carregar = useCallback(() => {
    api.get<{ baralhos: Baralho[]; estatisticas: Estatisticas; limite: LimiteCartas }>("/api/flashcards/baralhos").then(setDados).catch((e) => setErro(mensagem(e)));
  }, []);
  useEffect(carregar, [carregar]);
  const mudarLimite = async (n: number) => {
    if (!dados) return;
    const novo = Math.min(dados.limite.maximo, Math.max(dados.limite.minimo, n));
    if (novo === dados.limite.novosPorDia) return;
    try {
      await api.post("/api/flashcards/limite", { novosPorDia: novo });
      avisar(`Agora entram até ${novo} flashcards novos por dia em cada baralho.`, "ok");
      carregar();
      window.dispatchEvent(new Event("resumo:estudou"));
    } catch (e) {
      avisar(mensagem(e), "erro");
    }
  };
  if (erro) return <div className="pagina"><Vazio icone="alerta" titulo="Não foi possível carregar">{erro}</Vazio></div>;
  if (!dados) return <div className="pagina"><Carregando /></div>;
  const { baralhos, estatisticas: e, limite } = dados;
  const aguardando = baralhos.reduce((s, b) => s + b.novasRestantes, 0);
  const semestres = [...new Set(baralhos.map((b) => b.semestre))].sort((a, b) => a - b);
  const maior = Math.max(1, ...e.semana.map((d) => d.n));
  return (
    <div className="pagina">
      <header className="cabeca-pagina">
        <div>
          <p className="olho">Flashcards</p>
          <h1 className="titulo-pagina">Baralhos por matéria</h1>
          <p className="sub">Repetição espaçada com o algoritmo do Anki: cada flashcard volta quando você está prestes a esquecer.</p>
        </div>
      </header>

      <section className="estatisticas">
        <div className="cartao">
          <span className="rotulo"><ComAjuda ajuda="Quantos flashcards você respondeu hoje, somando todos os baralhos.">Hoje</ComAjuda></span>
          <strong className="numerao">{e.feitasHoje}</strong>
          <span className="sub">{e.feitasHoje === 1 ? "revisão feita" : "revisões feitas"}</span>
        </div>
        <div className="cartao">
          <span className="rotulo"><ComAjuda ajuda="Dias seguidos em que você estudou pelo menos um flashcard.">Sequência</ComAjuda></span>
          <strong className="numerao">{e.sequencia}</strong>
          <span className="sub">{e.sequencia === 1 ? "dia seguido" : "dias seguidos"}</span>
        </div>
        <div className="cartao">
          <span className="rotulo"><ComAjuda ajuda="Das revisões dos últimos 30 dias, quantas você acertou (não conta os flashcards novos). Entre 80% e 90% é o esperado.">Retenção (30 dias)</ComAjuda></span>
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

      {baralhos.length > 0 && (
        <section className="cartao limite-diario" data-testid="limite-diario">
          <div className="limite-texto">
            <h2 className="titulo-secao"><Icone nome="raio" tam={17} /> Flashcards novos por dia</h2>
            <p className="sub">
              Quantos flashcards inéditos entram por dia em cada baralho (as revisões não têm esse teto).
              {aguardando > 0 ? <strong> Há {plural(aguardando, "flashcard novo esperando", "flashcards novos esperando")}: aumente para adiantá-los hoje.</strong> : " O padrão do Anki é " + limite.padrao + "."}
            </p>
          </div>
          <div className="limite-controle" role="group" aria-label="Flashcards novos por dia">
            <button type="button" className="botao-icone" onClick={() => mudarLimite(limite.novosPorDia - 10)} disabled={limite.novosPorDia <= limite.minimo} aria-label="Diminuir 10">−</button>
            <strong data-testid="limite-valor">{limite.novosPorDia}</strong>
            <button type="button" className="botao-icone" onClick={() => mudarLimite(limite.novosPorDia + 10)} disabled={limite.novosPorDia >= limite.maximo} aria-label="Aumentar 10">+</button>
          </div>
          <div className="chips" role="group" aria-label="Valores prontos">
            {[10, 20, 40, 60, 100].map((n) => (
              <button type="button" key={n} className={"chip" + (limite.novosPorDia === n ? " ativo" : "")} onClick={() => mudarLimite(n)}>{n}</button>
            ))}
          </div>
        </section>
      )}

      {!baralhos.length && <Vazio icone="cartas" titulo="Nenhum baralho ainda">Os flashcards aparecem junto com os resumos de cada matéria.</Vazio>}
      {semestres.map((s) => (
        <section key={s} className="grupo-baralhos">
          <h2 className="titulo-secao">{s}º semestre</h2>
          <div className="tabela-baralhos" role="table">
            <div className="linha cabecalho" role="row">
              <span role="columnheader">Matéria</span>
              <span role="columnheader" className="num novas"><ComAjuda ajuda="Flashcards que você nunca viu e que entram hoje (até o seu limite diário).">Novos</ComAjuda></span>
              <span role="columnheader" className="num aprendendo"><ComAjuda ajuda="Flashcards que você viu há pouco e que voltam em minutos até você acertar.">Aprendendo</ComAjuda></span>
              <span role="columnheader" className="num revisar"><ComAjuda ajuda="Flashcards que vencem hoje: revisar agora é o que faz a memória durar.">Revisar</ComAjuda></span>
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
                      <small>{plural(b.total, "flashcard", "flashcards")} · {b.estudadas} vistos · <span title="Maduros: com intervalo de 21 dias ou mais (já estão bem guardados)">{b.maduras} maduros</span>{b.novasRestantes > 0 ? ` · ${b.novasRestantes} novos esperando` : ""}</small>
                    </span>
                  </span>
                  <span role="cell" className={"num novas" + (b.novos ? "" : " zero")}>{b.novos}</span>
                  <span role="cell" className={"num aprendendo" + (b.aprendendo ? "" : " zero")}>{b.aprendendo}</span>
                  <span role="cell" className={"num revisar" + (b.revisar ? "" : " zero")}>{b.revisar}</span>
                  <span role="cell" className="baralho-acoes">
                    {b.avaliacoes.map((a) => (
                      <Link key={a.av} para={`/flashcards/${b.materia}?av=${a.av}`} className="botao pequeno fantasma" title={`Só os ${a.cartas} flashcards da ${nomeAv(a.av)}`} data-av={a.av}>{nomeAv(a.av)}</Link>
                    ))}
                    {b.deProva > 0 && <Link para={`/flashcards/${b.materia}?modo=prova`} className="botao pequeno fantasma" title="Só os flashcards das notas marcadas como prova"><Icone nome="prova" tam={14} /> Prova</Link>}
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
  { r: 1, nome: "De novo", classe: "de-novo", dica: "Errei ou não lembrei: o flashcard volta daqui a pouco." },
  { r: 2, nome: "Difícil", classe: "dificil", dica: "Lembrei com esforço: volta antes do normal." },
  { r: 3, nome: "Bom", classe: "bom", dica: "Lembrei: volta no intervalo normal." },
  { r: 4, nome: "Fácil", classe: "facil", dica: "Lembrei na hora: volta bem mais tarde." },
];

export function Estudo({ materia }: { materia: string }) {
  const { idx, ehPendente, adicionarPendencia, removerPendencia } = useApp();
  const [irPara, setIrPara] = useState<{ id: string; titulo: string } | null>(null);
  const busca = useBusca();
  const { nota, modo, av } = useMemo(() => {
    const p = new URLSearchParams(busca);
    const a = (p.get("av") || "").toLowerCase();
    return { nota: p.get("nota"), modo: p.get("modo") === "prova" ? "prova" : "", av: a === "n1" || a === "n2" ? a : "" };
  }, [busca]);
  const [rodada, setRodada] = useState<Rodada | null>(null);
  const [virada, setVirada] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feitas, setFeitas] = useState(0);
  const [agora, setAgora] = useState(Date.now());

  const filtro = useMemo(() => ({ materia, ...(nota ? { nota } : {}), ...(modo ? { modo } : {}), ...(av ? { av } : {}) }), [materia, nota, modo, av]);
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
        window.dispatchEvent(new Event("resumo:estudou"));
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
  const titulo = nota ? idx.nota.get(nota)?.titulo || "Nota" : modo ? "Flashcards da prova" + (av ? " " + nomeAv(av) : "") : av ? "Flashcards da " + nomeAv(av) : "Baralho completo";
  const voltar = nota ? "/nota/" + nota : modo ? "/prova/" + materia + (av ? "?av=" + av : "") : "/flashcards";
  // limite diário atingido com cartas novas sobrando: dá para liberar mais sem sair daqui
  const liberar = async (quantas: number) => {
    if (!rodada) return;
    try {
      await api.post("/api/flashcards/limite", { novosPorDia: rodada.contagem.limite + quantas });
      carregar();
    } catch (e) {
      setErro(mensagem(e));
    }
  };

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
        <div className="contadores-caixa">
          <div className="contadores" aria-label="Flashcards restantes" data-testid="contadores">
            <span className="novas" title="Novos: nunca vistos">{c.novos}</span>
            <span className="aprendendo" title="Aprendendo: voltam em minutos">{c.aprendendo}</span>
            <span className="revisar" title="Revisar: vencem hoje">{c.revisar}</span>
          </div>
          <Ajuda rotulo="O que são esses números?">
            <span className="legenda-cores-num">
              <b className="novas">Azul</b>: flashcards novos, que você ainda não viu (entram até o seu limite diário).<br />
              <b className="aprendendo">Vermelho</b>: em aprendizado; voltam em minutos até você acertar.<br />
              <b className="revisar">Verde</b>: revisões que vencem hoje, agendadas pelo algoritmo do Anki.
            </span>
          </Ajuda>
        </div>
      </header>
      {erro && <div className="alerta alerta-erro">{erro}</div>}

      {carta ? (
        <div className="mesa">
          <div className={"carta" + (virada ? " virada" : "")} data-testid="carta" data-estado={carta.estado}>
            <div className="carta-topo">
              <span className="carta-tipo">{carta.estado === "novo" ? "Novo" : carta.estado === "revisao" ? "Revisão" : carta.estado === "reaprendendo" ? "Reaprendendo" : "Aprendendo"}</span>
              {/* o assunto do flashcard: abre a nota, com confirmação antes de sair do estudo */}
              <button type="button" className="carta-assunto" onClick={() => setIrPara({ id: carta.nota.id, titulo: carta.nota.titulo })} title="Ir para o conteúdo deste flashcard" data-testid="assunto">
                <Icone nome="livro" tam={13} /> {carta.nota.titulo}
              </button>
              {ehPendente(carta.nota.id) ? (
                <button type="button" className="carta-pendencia ativa" onClick={() => removerPendencia(carta.nota.id)} title="Este assunto está nas suas pendências. Clique para tirar." data-testid="pendencia-carta" aria-pressed="true">
                  <Icone nome="marcado" tam={15} /> Nas pendências
                </button>
              ) : (
                <button type="button" className="carta-pendencia" onClick={() => adicionarPendencia(carta.nota.id)} title="Guarda o assunto deste flashcard na aba Pendências para estudar depois" data-testid="pendencia-carta" aria-pressed="false">
                  <Icone nome="marcador" tam={15} /> Estudar depois
                </button>
              )}
            </div>
            <div className="carta-frente">
              <ConteudoNota html={carta.frente} />
              <Ajuda rotulo="O que esta pergunta quer saber?" testid="explica">
                <span className="explica-carta">
                  {carta.explica && <span className="explica-texto" dangerouslySetInnerHTML={{ __html: carta.explica }} />}
                  <span className="explica-assunto">
                    <small>Assunto</small>
                    <strong>{carta.nota.titulo}</strong>
                    {carta.nota.modulo && <em>{carta.nota.modulo}</em>}
                    {!carta.explica && carta.nota.resumo && <span>{carta.nota.resumo}</span>}
                  </span>
                </span>
              </Ajuda>
            </div>
            {virada && (
              <>
                <hr />
                <div className="carta-verso" data-testid="verso"><ConteudoNota html={carta.verso} /></div>
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
                <button type="button" key={b.r} className={"resposta " + b.classe} disabled={enviando} onClick={() => responder(b.r)} data-resposta={b.r} title={b.dica}>
                  <small>{rodada.previsoes?.[b.r]}</small>
                  <strong>{b.nome}</strong>
                  <kbd>{b.r}</kbd>
                </button>
              ))}
            </div>
          )}
          <p className="legenda-estudo">
            {!virada
              ? "Tente lembrar a resposta antes de mostrar. O ? ao lado da pergunta explica o que ela quer saber."
              : "Seja honesto: o tempo em cima de cada botão é quando este flashcard volta a aparecer."}
          </p>
        </div>
      ) : (
        <div className="fim-estudo" data-testid="fim-estudo">
          <span className="fim-icone"><Icone nome="check" tam={34} /></span>
          <h2>{c.total === 0 ? "Este baralho ainda não tem flashcards" : "Por agora é isso"}</h2>
          {rodada.proximaEm ? (
            <p>O próximo flashcard volta em <strong>{Math.max(1, Math.ceil((rodada.proximaEm - agora) / 60000))} min</strong>. Ela aparece aqui sozinha.</p>
          ) : c.total > 0 ? (
            <p>{feitas ? `Você respondeu ${plural(feitas, "flashcard", "flashcards")} nesta sessão. ` : ""}Não há mais flashcards para hoje neste baralho. O intervalo de cada um já foi agendado.</p>
          ) : null}
          {!nota && !modo && c.novasRestantes > 0 && (
            <div className="liberar-novas" data-testid="liberar-novas">
              <p>Ainda há <strong>{plural(c.novasRestantes, "flashcard novo", "flashcards novos")}</strong> neste baralho. Seu limite é de {c.limite} por dia.</p>
              <div className="linha-botoes">
                <button type="button" className="botao primario" onClick={() => liberar(10)}><Icone nome="raio" tam={16} /> Estudar mais 10 hoje</button>
                {c.novasRestantes > 10 && <button type="button" className="botao fantasma" onClick={() => liberar(c.novasRestantes)}>Liberar todas ({c.novasRestantes})</button>}
              </div>
              <small>Isso aumenta o seu limite diário. Dá para voltar ao normal na tela de baralhos.</small>
            </div>
          )}
          <div className="linha-botoes">
            <Link para={voltar} className={"botao " + (!nota && !modo && c.novasRestantes > 0 ? "fantasma" : "primario")}>{nota ? "Voltar à nota" : modo ? "Voltar ao modo prova" : "Ver baralhos"}</Link>
            {!nota && <Link para={"/materia/" + materia} className="botao fantasma">Ler a matéria</Link>}
          </div>
        </div>
      )}
      {irPara && (
        <Modal titulo="Ir para o conteúdo?" aoFechar={() => setIrPara(null)}>
          <p>Você vai sair do estudo e abrir a nota <strong>{irPara.titulo}</strong>. Os flashcards já respondidos ficam salvos; os outros esperam por você.</p>
          <div className="linha-botoes" data-testid="confirmar-ir">
            <button type="button" className="botao primario" onClick={() => ir("/nota/" + irPara.id)}><Icone nome="livro" tam={16} /> Abrir a nota</button>
            {!ehPendente(irPara.id) && (
              <button type="button" className="botao fantasma" onClick={() => { adicionarPendencia(irPara.id); setIrPara(null); }} data-testid="guardar-pendencia" title="Não sai do estudo: o assunto fica na aba Pendências para depois">
                <Icone nome="marcador" tam={16} /> Guardar nas pendências
              </button>
            )}
            <button type="button" className="botao fantasma" onClick={() => setIrPara(null)}>Continuar estudando</button>
          </div>
          {!ehPendente(irPara.id) && <p className="sub">"Guardar nas pendências" não tira você do estudo: o assunto fica na aba Pendências para estudar depois.</p>}
        </Modal>
      )}
    </div>
  );
}
