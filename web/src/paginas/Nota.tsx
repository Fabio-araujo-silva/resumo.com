// O leitor: uma nota atômica com tudo o que dá para clicar. Barra de ferramentas (testar-se, ouvir,
// tamanho da letra, foco), o texto interativo, o mapa do módulo como grafo, o baralho de cartas da
// nota, as conexões ao lado e os atalhos de teclado.
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ErroApi, mensagem, type Ligada, type NotaCompleta } from "../lib/api";
import { PALETA, useApp } from "../lib/loja";
import { Link, ir } from "../lib/rota";
import { ConteudoNota, espiar } from "../componentes/ConteudoNota";
import { Grafo, type NoGrafo } from "../componentes/Grafo";
import { Icone } from "../componentes/Icone";
import { Carregando, Selo, Vazio } from "../componentes/ui";
import { PlayerVoz } from "../componentes/PlayerVoz";
import { Ajuda } from "../componentes/Ajuda";

const LeitorPdf = lazy(() => import("../componentes/LeitorPdf"));
const cortar = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const semMapa = (t: string) => t.replace(/^Mapa\s*[-–—:]\s*/i, "");

// texto da nota para a voz do navegador (o ElevenLabs recebe o texto pelo servidor)
function textoParaVoz(raiz: HTMLElement): string {
  const c = raiz.cloneNode(true) as HTMLElement;
  c.querySelectorAll(".questao, .fig, .passos-barra, .sei-conta, .placar").forEach((e) => e.remove());
  c.querySelectorAll("td, th").forEach((e) => e.append(", "));
  c.querySelectorAll("p, li, tr, h2, h3, h4, .callout-cabeca").forEach((e) => e.append(". "));
  return (c.textContent || "").replace(/\s+/g, " ").replace(/([.,:;])\s*[.,]/g, "$1").trim();
}
// ---------- baralho da nota: cartas que viram com um clique ----------
function BaralhoDaNota({ cartas, estudar }: { cartas: { frente: string; verso: string }[]; estudar: string }) {
  const [i, setI] = useState(0);
  const [virada, setVirada] = useState(false);
  const mudar = (d: number) => {
    setVirada(false);
    setI((x) => (x + d + cartas.length) % cartas.length);
  };
  const c = cartas[i];
  return (
    <section className="baralho-nota" data-testid="baralho-nota">
      <header>
        <h3><Icone nome="cartas" tam={17} /> Flashcards desta nota</h3>
        <span className="sub">{i + 1} de {cartas.length} · clique no flashcard para virar</span>
      </header>
      <div className="vira-palco">
        <button type="button" className="botao-icone" onClick={() => mudar(-1)} aria-label="Flashcard anterior"><Icone nome="esquerda" /></button>
        <div
          className={"vira" + (virada ? " virada" : "")}
          role="button"
          tabIndex={0}
          aria-label={virada ? "Resposta. Clique para ver a pergunta." : "Pergunta. Clique para ver a resposta."}
          onClick={() => setVirada((v) => !v)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setVirada((v) => !v))}
          data-testid="vira"
        >
          <div className="vira-miolo">
            <div className="vira-face frente"><span className="rotulo">Pergunta</span><div className="prosa" dangerouslySetInnerHTML={{ __html: c.frente }} /></div>
            <div className="vira-face verso"><span className="rotulo">Resposta</span><div className="prosa" dangerouslySetInnerHTML={{ __html: c.verso }} /></div>
          </div>
        </div>
        <button type="button" className="botao-icone" onClick={() => mudar(1)} aria-label="Próximo flashcard"><Icone nome="direita" /></button>
      </div>
      <div className="vira-pontos" aria-hidden="true">
        {cartas.map((_, n) => <i key={n} className={n === i ? "ativo" : ""} />)}
      </div>
      <Link para={estudar} className="link-suave">Estudar estes flashcards com repetição espaçada <Icone nome="direita" tam={13} /></Link>
    </section>
  );
}

// ---------- mapa do módulo: as notas do módulo como um grafo clicável ----------
function MapaDoModulo({ notaId, moduloId }: { notaId: string; moduloId: string }) {
  const { bib, idx, tema } = useApp();
  const { nos, arestas } = useMemo(() => {
    const doModulo = idx.notasDoModulo.get(moduloId) || [];
    const ids = new Set(doModulo.map((n) => n.id));
    const nos: NoGrafo[] = doModulo.map((n, i) => ({ id: n.id, titulo: n.titulo, grupo: "m", cor: n.mapa ? "#5aa7e8" : PALETA[i % PALETA.length], prova: n.prova, mapa: n.mapa, lida: idx.lidas.has(n.id) }));
    return { nos, arestas: (bib?.links || []).filter(([a, b]) => ids.has(a) && ids.has(b)) };
  }, [bib, idx, moduloId]);
  if (nos.length < 3) return null;
  return (
    <section className="mapa-modulo" data-testid="mapa-modulo">
      <Grafo nos={nos} arestas={arestas} selecionado={notaId} tema={tema} aoSelecionar={(id) => id && id !== notaId && espiar(id)} aoAbrir={(id) => ir("/nota/" + id)} />
      <p className="dica-grafo">Clique numa nota para espiar. Dois cliques abrem.</p>
    </section>
  );
}

// Mini-grafo: a nota no centro e as vizinhas em volta. Linha cheia = esta nota cita; tracejada = é citada.
function MiniGrafo({ titulo, saidas, entradas }: { titulo: string; saidas: Ligada[]; entradas: Ligada[] }) {
  const vistos = new Set<string>();
  const viz = [...saidas.map((n) => ({ n, sai: true })), ...entradas.map((n) => ({ n, sai: false }))].filter((v) => !vistos.has(v.n.id) && vistos.add(v.n.id));
  const mostrar = viz.slice(0, 9);
  const L = 300;
  const A = 230;
  const cx = L / 2;
  const cy = A / 2;
  if (!mostrar.length) return null;
  return (
    <svg className="mini-grafo" viewBox={`0 0 ${L} ${A}`} role="img" aria-label={`Ligações de ${titulo}`}>
      {mostrar.map((v, i) => {
        const ang = (i / mostrar.length) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(ang) * 98;
        const y = cy + Math.sin(ang) * 78;
        return (
          <g key={v.n.id}>
            <line x1={cx} y1={cy} x2={x} y2={y} className={v.sai ? "sai" : "chega"} />
            <a href={"/nota/" + v.n.id} onClick={(e) => { e.preventDefault(); espiar(v.n.id); }}>
              <title>{v.n.titulo}</title>
              <circle cx={x} cy={y} r="6" />
              <text x={x} y={y + (y < cy - 4 ? -11 : 18)} textAnchor="middle">
                {cortar(semMapa(v.n.titulo), 18)}
              </text>
            </a>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r="10" className="centro" />
    </svg>
  );
}

function ListaLigadas({ titulo, notas }: { titulo: string; notas: Ligada[] }) {
  if (!notas.length) return null;
  return (
    <div className="ligadas">
      <h4>{titulo}</h4>
      <ul>
        {notas.map((n) => (
          <li key={n.id}>
            <Link para={"/nota/" + n.id} title={n.resumo}>{n.titulo}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- trilha: por onde o aluno passou nesta sessão ----------
type Passo = { id: string; titulo: string };
function registrarNaTrilha(p: Passo): Passo[] {
  let t: Passo[] = [];
  try {
    t = JSON.parse(sessionStorage.getItem("resumo-trilha") || "[]");
  } catch {}
  t = [...t.filter((x) => x.id !== p.id), p].slice(-6);
  try {
    sessionStorage.setItem("resumo-trilha", JSON.stringify(t));
  } catch {}
  return t;
}

const ATALHOS: [string, string][] = [["→ ou N", "próxima nota"], ["← ou P", "nota anterior"], ["T", "testar-se (lacunas)"], ["L", "marcar como lida"], ["O", "ouvir / pausar"], ["F", "modo foco"], ["Esc", "sair do modo"], ["Ctrl K", "buscar"]];
const lerTamanho = () => {
  try {
    const v = Number(localStorage.getItem("resumo-letra"));
    return v >= 14 && v <= 22 ? v : 16.5;
  } catch {
    return 16.5;
  }
};

export function PaginaNota({ id }: { id: string }) {
  const { idx, marcarLida, usuario, ehPendente, adicionarPendencia, removerPendencia } = useApp();
  const [dados, setDados] = useState<NotaCompleta | null>(null);
  const [erro, setErro] = useState<{ status: number; texto: string } | null>(null);
  const [teste, setTeste] = useState(false);
  const [lacunas, setLacunas] = useState({ total: 0, reveladas: 0 });
  const [foco, setFoco] = useState(false);
  const [letra, setLetra] = useState(lerTamanho);
  const [ajuda, setAjuda] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [trilha, setTrilha] = useState<Passo[]>([]);
  const artigo = useRef<HTMLElement>(null);

  useEffect(() => {
    let vivo = true;
    setDados(null);
    setErro(null);
    setTeste(false);
    api
      .get<NotaCompleta>("/api/notas/" + id)
      .then((d) => {
        if (!vivo) return;
        setDados(d);
        setTrilha(registrarNaTrilha({ id: d.nota.id, titulo: d.nota.titulo }));
      })
      .catch((e) => vivo && setErro({ status: e instanceof ErroApi ? e.status : 0, texto: mensagem(e) }));
    return () => {
      vivo = false;
    };
  }, [id]);

  const textoVoz = useCallback(() => {
    const prosa = artigo.current?.querySelector<HTMLElement>(".conteudo-nota .prosa");
    return (dados ? dados.nota.titulo + ". " + dados.nota.resumo + " " : "") + (prosa ? textoParaVoz(prosa) : "");
  }, [dados]);

  // barra de progresso da leitura
  useEffect(() => {
    const medir = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      setProgresso(total > 40 ? Math.min(1, window.scrollY / total) : 0);
    };
    medir();
    window.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    return () => {
      window.removeEventListener("scroll", medir);
      window.removeEventListener("resize", medir);
    };
  }, [dados]);

  useEffect(() => {
    document.body.classList.toggle("modo-foco", foco);
    return () => document.body.classList.remove("modo-foco");
  }, [foco]);
  const mudarLetra = (d: number) =>
    setLetra((v) => {
      const novo = Math.min(22, Math.max(14, Math.round((v + d) * 2) / 2));
      try {
        localStorage.setItem("resumo-letra", String(novo));
      } catch {}
      return novo;
    });

  const lida = dados ? idx.lidas.has(dados.nota.id) : false;
  const concluir = useCallback(() => {
    if (!dados) return;
    if (!idx.lidas.has(dados.nota.id)) marcarLida(dados.nota.id, true);
    if (dados.proxima) ir("/nota/" + dados.proxima.id);
  }, [dados, idx, marcarLida]);

  // atalhos de teclado
  useEffect(() => {
    if (!dados) return;
    const t = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [role=button], button, a")) return;
      if (document.querySelector(".espiada, .modal-fundo, .lightbox")) return;
      const k = e.key.toLowerCase();
      if (k === "arrowright" || k === "n") dados.proxima && ir("/nota/" + dados.proxima.id);
      else if (k === "arrowleft" || k === "p") dados.anterior && ir("/nota/" + dados.anterior.id);
      else if (k === "t") setTeste((v) => !v);
      else if (k === "l") marcarLida(dados.nota.id, !idx.lidas.has(dados.nota.id));
      else if (k === "o") window.dispatchEvent(new Event("resumo:voz-alternar"));
      else if (k === "f") setFoco((v) => !v);
      else if (k === "?") setAjuda((v) => !v);
      else if (k === "escape") {
        setTeste(false);
        setFoco(false);
        setAjuda(false);
      } else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", t);
    return () => document.removeEventListener("keydown", t);
  }, [dados, idx, marcarLida]);

  const contar = useCallback((total: number, reveladas: number) => setLacunas((l) => (l.total === total && l.reveladas === reveladas ? l : { total, reveladas })), []);
  const revelarTudo = () => {
    artigo.current?.querySelectorAll(".lacuna").forEach((e) => e.classList.add("revelada"));
    setLacunas((l) => ({ ...l, reveladas: l.total }));
  };

  if (erro)
    return (
      <div className="pagina">
        <Vazio icone={erro.status === 429 ? "relogio" : "alerta"} titulo={erro.status === 404 ? "Nota não encontrada" : erro.status === 429 ? "Devagar" : "Não foi possível abrir"}>
          {erro.status === 404 ? "Ela pode ter sido removida, ou seu acesso não a inclui." : erro.texto}
        </Vazio>
      </div>
    );
  if (!dados) return <div className="pagina"><Carregando texto="Abrindo a nota…" /></div>;

  const { nota } = dados;
  const caminho = trilha.filter((p) => p.id !== nota.id).slice(-3);
  return (
    <div className="pagina pagina-leitor">
      <div className="progresso-leitura" aria-hidden="true"><i style={{ width: progresso * 100 + "%" }} /></div>
      <article className="leitor" data-nota={nota.id} ref={artigo} style={{ ["--letra" as string]: letra + "px" }}>
        <nav className="migalhas" aria-label="Você está em">
          <Link para={"/materia/" + nota.materia.id}>{nota.materia.nome}</Link>
          <Icone nome="direita" tam={13} />
          <span>{nota.modulo.titulo}</span>
          {caminho.length > 0 && (
            <span className="trilha" data-testid="trilha">
              <Icone nome="voltar" tam={13} />
              {caminho.map((p) => (
                <Link key={p.id} para={"/nota/" + p.id} title={"Voltar para: " + p.titulo}>{cortar(semMapa(p.titulo), 26)}</Link>
              ))}
            </span>
          )}
        </nav>
        <header className="leitor-cabeca" style={{ ["--cor" as string]: idx.cor(nota.materia.id) }}>
          <h1>{nota.mapa ? semMapa(nota.titulo) : nota.titulo}</h1>
          <p className="leitor-resumo">{nota.resumo}</p>
          <div className="selos">
            {nota.mapa && <Selo tipo="mapa">Mapa do módulo</Selo>}
            {nota.prova && <Selo tipo="prova">Conteúdo de prova{nota.prioridade === 1 ? " · prioridade alta" : ""}</Selo>}
            {nota.rascunho && <Selo tipo="rascunho">Rascunho (só você vê)</Selo>}
            <Selo tipo="neutro"><Icone nome="relogio" tam={12} /> {nota.minutos} min</Selo>
            {nota.tags.filter((t) => t !== "mapa").map((t) => (
              <Selo key={t} tipo="neutro">#{t}</Selo>
            ))}
            {usuario?.papel === "admin" && (
              <Link para={"/admin/nota/" + nota.id} className="selo selo-acao"><Icone nome="lapis" tam={12} /> Editar</Link>
            )}
          </div>
        </header>

        {ehPendente(nota.id) && (
          <div className="faixa-pendente" data-testid="faixa-pendente">
            <Icone nome="marcado" tam={17} />
            <span><strong>Está nas suas pendências.</strong> Quando terminar de estudar, dê baixa para tirar da lista.</span>
            <button type="button" className="botao pequeno primario" onClick={() => { removerPendencia(nota.id, true); marcarLida(nota.id, true); }}>
              <Icone nome="check" tam={14} /> Dei baixa
            </button>
          </div>
        )}
        <div className={"ferramentas" + (teste ? " em-teste" : "")} role="toolbar" aria-label="Ferramentas de leitura">
          <button type="button" className={"ferramenta" + (teste ? " ativa" : "")} onClick={() => setTeste((v) => !v)} aria-pressed={teste} data-testid="modo-teste" title="Esconde os termos-chave para você lembrar (T)">
            <Icone nome="prova" tam={16} /> {teste ? "Sair do teste" : "Testar-se"}
          </button>
          {teste ? (
            <>
              <span className="ferramenta-info" data-testid="lacunas">{lacunas.reveladas}/{lacunas.total} reveladas</span>
              <button type="button" className="ferramenta" onClick={revelarTudo}>Revelar tudo</button>
            </>
          ) : (
            <>
              <PlayerVoz notaId={nota.id} pegarTexto={textoVoz} />
              <Ajuda rotulo="Como usar as ferramentas">
                <strong>Testar-se</strong> esconde os termos-chave para você lembrar. <strong>Ouvir</strong> lê a nota em voz alta. <strong>A− A+</strong> mudam a letra. <strong>Foco</strong> esconde o resto da tela. No texto, quase tudo é clicável: links abrem a nota ao lado, tabelas escondem colunas, passos se marcam.
              </Ajuda>
              <span className="ferramenta-grupo" role="group" aria-label="Tamanho da letra">
                <button type="button" className="ferramenta" onClick={() => mudarLetra(-1)} aria-label="Diminuir a letra" title="Letra menor">A−</button>
                <button type="button" className="ferramenta" onClick={() => mudarLetra(1)} aria-label="Aumentar a letra" title="Letra maior">A+</button>
              </span>
              <button type="button" className={"ferramenta" + (foco ? " ativa" : "")} onClick={() => setFoco((v) => !v)} aria-pressed={foco} data-testid="modo-foco" title="Só o texto, sem distrações (F)">
                <Icone nome="foco" tam={16} /> {foco ? "Sair do foco" : "Foco"}
              </button>
              <button type="button" className={"ferramenta so-icone" + (ajuda ? " ativa" : "")} onClick={() => setAjuda((v) => !v)} aria-label="Atalhos de teclado" aria-expanded={ajuda} title="Atalhos (?)">?</button>
            </>
          )}
          {ajuda && (
            <dl className="atalhos" data-testid="atalhos">
              {ATALHOS.map(([k, d]) => (
                <div key={k}><dt><kbd>{k}</kbd></dt><dd>{d}</dd></div>
              ))}
            </dl>
          )}
        </div>
        {teste && <p className="dica-teste">Os termos em negrito e os grifos viraram lacunas. Tente lembrar e clique para conferir. Nas tabelas, clique no título de uma coluna para escondê-la.</p>}

        {nota.mapa && <MapaDoModulo notaId={nota.id} moduloId={nota.modulo.id} />}
        <ConteudoNota html={dados.html} notaId={nota.id} navegar={nota.mapa} teste={teste} aoContar={contar} />

        {nota.pdf && (
          <Suspense fallback={<Carregando texto="Preparando o leitor de PDF…" />}>
            <LeitorPdf notaId={nota.id} />
          </Suspense>
        )}

        {dados.cartas.length > 0 && <BaralhoDaNota key={nota.id} cartas={dados.cartas} estudar={`/flashcards/${nota.materia.id}?nota=${encodeURIComponent(nota.id)}`} />}
        {nota.fontes.length > 0 && <p className="fontes">Fonte: {nota.fontes.join(" · ")}</p>}

        <footer className="leitor-pe">
          <div className="leitor-acoes">
            <button type="button" className={"botao " + (lida ? "fantasma" : "primario")} onClick={() => marcarLida(nota.id, !lida)} data-testid="marcar-lida" aria-pressed={lida}>
              <Icone nome="check" tam={16} /> {lida ? "Lida (desmarcar)" : "Marcar como lida"}
            </button>
            {dados.cards > 0 && (
              <Link para={`/flashcards/${nota.materia.id}?nota=${encodeURIComponent(nota.id)}`} className="botao fantasma">
                <Icone nome="cartas" tam={16} /> Estudar os {dados.cards} flashcards
              </Link>
            )}
            {!ehPendente(nota.id) && (
              <button type="button" className="botao fantasma" onClick={() => adicionarPendencia(nota.id)} data-testid="adicionar-pendencia" title="Guarda esta nota na aba Pendências para estudar depois">
                <Icone nome="marcador" tam={16} /> Adicionar às pendências
              </button>
            )}
          </div>
          <div className="leitor-vizinhas">
            {dados.anterior ? (
              <Link para={"/nota/" + dados.anterior.id} className="vizinha">
                <small><Icone nome="esquerda" tam={13} /> Anterior</small>
                <strong>{dados.anterior.titulo}</strong>
              </Link>
            ) : <span />}
            {dados.proxima ? (
              <button type="button" className="vizinha proxima" onClick={concluir}>
                <small>{lida ? "Próxima" : "Concluir e ir para"} <Icone nome="direita" tam={13} /></small>
                <strong>{dados.proxima.titulo}</strong>
              </button>
            ) : <span />}
          </div>
        </footer>
      </article>

      <aside className="trilho-lateral">
        <section className="cartao conexoes">
          <h3><Icone nome="grafo" tam={16} /> Conexões <Ajuda>As notas que esta cita (leva a) e as que citam esta (citada em). Clique para espiar sem sair daqui.</Ajuda></h3>
          {dados.saidas.length + dados.entradas.length === 0 ? (
            <p className="sub">Esta nota ainda não se liga a outras.</p>
          ) : (
            <>
              <MiniGrafo titulo={nota.titulo} saidas={dados.saidas} entradas={dados.entradas} />
              <ListaLigadas titulo="Esta nota leva a" notas={dados.saidas} />
              <ListaLigadas titulo="Citada em" notas={dados.entradas} />
            </>
          )}
          <Link para={"/notas?nota=" + encodeURIComponent(nota.id)} className="link-suave" data-testid="explorar-ligacoes">Explorar ligações a partir desta nota <Icone nome="direita" tam={13} /></Link>
        </section>
        {dados.titulos.length > 1 && (
          <section className="cartao sumario">
            <h3><Icone nome="lista" tam={16} /> Nesta nota</h3>
            <ul>
              {dados.titulos.map((t) => (
                <li key={t.id} className={"n" + t.nivel}>
                  <a href={"#" + t.id} onClick={(e) => { e.preventDefault(); document.getElementById(t.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{t.texto}</a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
