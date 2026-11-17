// Visão "Notas atômicas": o grafo de todas as notas e suas ligações, filtrado por semestre e
// matéria. Clicar numa nota mostra o que ela é e a que se liga; dois cliques (ou "Abrir") leem.
import { useEffect, useMemo, useState } from "react";
import { AVS, nomeAv, type Av } from "../lib/avaliacao";
import { PALETA, plural, semAcento, useApp } from "../lib/loja";
import { Link, ir, useBusca } from "../lib/rota";
import { Grafo, type NoGrafo } from "../componentes/Grafo";
import { Icone } from "../componentes/Icone";
import { Carregando, Selo, Vazio } from "../componentes/ui";

export function Notas() {
  const { bib, idx, tema } = useApp();
  const busca = useBusca();
  const inicial = useMemo(() => new URLSearchParams(busca).get("materia"), [busca]);
  const [semestre, setSemestre] = useState<number | null>(null);
  const [materia, setMateria] = useState<string | null>(inicial);
  const [soProva, setSoProva] = useState(false);
  const [naoLidas, setNaoLidas] = useState(false);
  const [av, setAv] = useState<Av | null>(null);
  const [termo, setTermo] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [modo, setModo] = useState<"grafo" | "lista">("grafo");

  useEffect(() => setMateria(inicial), [inicial]);

  const materias = useMemo(() => (bib ? bib.materias.filter((m) => semestre === null || m.semestre === semestre) : []), [bib, semestre]);
  const ativa = materia && materias.some((m) => m.id === materia) ? materia : null;

  const visiveis = useMemo(() => {
    if (!bib) return [];
    const ids = new Set(materias.map((m) => m.id));
    return bib.notas.filter((n) => (ativa ? n.materia === ativa : ids.has(n.materia)) && (!soProva || n.prova || n.mapa) && (!naoLidas || !idx.lidas.has(n.id)) && (!av || idx.modulo.get(n.modulo)?.avaliacao === av));
  }, [bib, materias, ativa, soProva, naoLidas, av, idx]);

  // com uma matéria só, a cor distingue os módulos; com várias, as matérias
  const { nos, legenda } = useMemo(() => {
    const porModulo = !!ativa || materias.length === 1;
    const mods = [...new Set(visiveis.map((n) => n.modulo))];
    const corModulo = new Map(mods.map((m, i) => [m, PALETA[i % PALETA.length]]));
    const nos: NoGrafo[] = visiveis.map((n) => ({
      id: n.id, titulo: n.titulo, grupo: porModulo ? n.modulo : n.materia, cor: porModulo ? corModulo.get(n.modulo)! : idx.cor(n.materia), prova: n.prova, mapa: n.mapa, lida: idx.lidas.has(n.id),
    }));
    const legenda = porModulo
      ? mods.map((m) => ({ id: m, nome: idx.modulo.get(m)?.titulo || "", cor: corModulo.get(m)! }))
      : materias.filter((m) => visiveis.some((n) => n.materia === m.id)).map((m) => ({ id: m.id, nome: m.nome, cor: idx.cor(m.id) }));
    return { nos, legenda };
  }, [visiveis, ativa, materias, idx]);

  const arestas = bib?.links || [];
  const realce = useMemo(() => {
    const t = semAcento(termo.trim());
    if (t.length < 2) return null;
    return new Set(visiveis.filter((n) => semAcento(n.titulo + " " + n.resumo + " " + n.tags.join(" ")).includes(t)).map((n) => n.id));
  }, [termo, visiveis]);

  if (!bib) return <Carregando />;
  const nota = sel ? idx.nota.get(sel) : null;
  const ligadas = nota ? [...new Set([...(idx.saidas.get(nota.id) || []), ...(idx.entradas.get(nota.id) || [])])].map((id) => idx.nota.get(id)).filter((n) => !!n) : [];
  const nLigacoes = arestas.filter(([a, b]) => visiveis.some((n) => n.id === a) && visiveis.some((n) => n.id === b)).length;

  return (
    <div className="pagina pagina-notas">
      <header className="cabeca-pagina">
        <div>
          <p className="olho">Notas atômicas</p>
          <h1 className="titulo-pagina">Como as ideias se conectam</h1>
          <p className="sub" data-testid="resumo-grafo">{plural(visiveis.length, "nota", "notas")} · {plural(nLigacoes, "ligação", "ligações")}</p>
        </div>
        <div className="alternador" role="group" aria-label="Modo de visualização">
          <button type="button" className={modo === "grafo" ? "ativo" : ""} onClick={() => setModo("grafo")}><Icone nome="grafo" tam={15} /> Grafo</button>
          <button type="button" className={modo === "lista" ? "ativo" : ""} onClick={() => setModo("lista")}><Icone nome="lista" tam={15} /> Lista</button>
        </div>
      </header>

      <div className="filtros">
        {idx.semestres.length > 1 && (
          <div className="chips" role="group" aria-label="Semestre">
            <button type="button" className={"chip" + (semestre === null ? " ativo" : "")} onClick={() => setSemestre(null)}>Todos os semestres</button>
            {idx.semestres.map((s) => (
              <button type="button" key={s} className={"chip" + (semestre === s ? " ativo" : "")} onClick={() => setSemestre(s)}>{s}º</button>
            ))}
          </div>
        )}
        <div className="chips" role="group" aria-label="Matéria">
          {materias.length > 1 && <button type="button" className={"chip" + (!ativa ? " ativo" : "")} onClick={() => setMateria(null)}>Todas as matérias</button>}
          {materias.map((m) => (
            <button type="button" key={m.id} className={"chip" + (ativa === m.id || materias.length === 1 ? " ativo" : "")} onClick={() => setMateria(ativa === m.id ? null : m.id)}>
              <i className="ponto" style={{ background: idx.cor(m.id) }} /> {m.nome}
            </button>
          ))}
        </div>
        <div className="chips">
          {AVS.map((a) => (
            <button type="button" key={a} className={"chip" + (av === a ? " ativo" : "")} onClick={() => setAv(av === a ? null : a)} aria-pressed={av === a} data-av={a}>{nomeAv(a)}</button>
          ))}
          <button type="button" className={"chip" + (soProva ? " ativo" : "")} onClick={() => setSoProva((v) => !v)} aria-pressed={soProva}><Icone nome="prova" tam={14} /> Só prova</button>
          <button type="button" className={"chip" + (naoLidas ? " ativo" : "")} onClick={() => setNaoLidas((v) => !v)} aria-pressed={naoLidas}>Não lidas</button>
          <label className="campo-busca">
            <Icone nome="busca" tam={15} />
            <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Realçar no grafo…" aria-label="Realçar notas" />
            {realce && <small>{realce.size}</small>}
          </label>
        </div>
      </div>

      {!visiveis.length ? (
        <Vazio icone="grafo" titulo="Nenhuma nota com esses filtros" />
      ) : modo === "grafo" ? (
        <div className={"palco" + (nota ? " com-painel" : "")}>
          <div className="palco-grafo">
            <Grafo nos={nos} arestas={arestas} selecionado={sel} aoSelecionar={setSel} aoAbrir={(id) => ir("/nota/" + id)} tema={tema} realce={realce} />
            <div className="legenda-cores">
              {legenda.slice(0, 12).map((l) => (
                <span key={l.id}><i style={{ background: l.cor }} /> {l.nome}</span>
              ))}
            </div>
            {!nota && <p className="dica-grafo">Clique numa nota para ver as ligações. Dois cliques abrem a leitura.</p>}
          </div>
          {nota && (
            <aside className="painel-nota" data-testid="painel-nota">
              <button type="button" className="botao-icone fechar" onClick={() => setSel(null)} aria-label="Fechar"><Icone nome="fechar" tam={16} /></button>
              <span className="rotulo">{idx.materia.get(nota.materia)?.nome} · {idx.modulo.get(nota.modulo)?.titulo}</span>
              <h3>{nota.titulo}</h3>
              <div className="selos">
                {nota.mapa && <Selo tipo="mapa">Mapa do módulo</Selo>}
                {nota.prova && <Selo tipo="prova">Prova</Selo>}
                {idx.lidas.has(nota.id) && <Selo tipo="neutro">Lida</Selo>}
                <Selo tipo="neutro">{nota.minutos} min</Selo>
              </div>
              <p>{nota.resumo}</p>
              <Link para={"/nota/" + nota.id} className="botao primario largo">Abrir nota <Icone nome="direita" tam={15} /></Link>
              {ligadas.length > 0 && (
                <>
                  <h4>Ligada a {ligadas.length}</h4>
                  <ul className="lista-ligadas">
                    {ligadas.map((l) => (
                      <li key={l!.id}>
                        <button type="button" onClick={() => setSel(l!.id)}>
                          <i className="ponto" style={{ background: nos.find((x) => x.id === l!.id)?.cor || "var(--fraco)" }} />
                          {l!.titulo}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </aside>
          )}
        </div>
      ) : (
        <div className="lista-notas">
          {(ativa ? [ativa] : materias.map((m) => m.id)).map((mid) =>
            (idx.modulosDe.get(mid) || []).map((mod) => {
              const ns = visiveis.filter((n) => n.modulo === mod.id && (!realce || realce.has(n.id)));
              if (!ns.length) return null;
              return (
                <section key={mod.id}>
                  <h3><i className="ponto" style={{ background: idx.cor(mid) }} /> {idx.materia.get(mid)?.nome} · {mod.titulo}</h3>
                  <ul>
                    {ns.map((n) => (
                      <li key={n.id}>
                        <Link para={"/nota/" + n.id} className={idx.lidas.has(n.id) ? "lida" : ""}>
                          <span>
                            <strong>{n.titulo}</strong>
                            <small>{n.resumo}</small>
                          </span>
                          <span className="selos">
                            {n.prova && <Selo tipo="prova">Prova</Selo>}
                            <Selo tipo="neutro"><Icone nome="link" tam={12} /> {(idx.saidas.get(n.id)?.length || 0) + (idx.entradas.get(n.id)?.length || 0)}</Selo>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
