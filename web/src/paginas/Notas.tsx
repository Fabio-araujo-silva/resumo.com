// "Explorar ligações": um tópico por vez. No centro, a nota escolhida; em volta, só as notas
// ligadas a ela. Clicar numa vizinha faz dela o novo centro, e assim se navega pelo conteúdo sem
// nunca ver o mapa inteiro de uma vez (que é denso demais para estudar).
// Não fica no menu: abre a partir de uma nota ("Explorar ligações") ou de uma matéria.
import { useEffect, useMemo, useState } from "react";
import { AVS, nomeAv, type Av } from "../lib/avaliacao";
import { PALETA, plural, semAcento, useApp } from "../lib/loja";
import { Link, ir, useBusca } from "../lib/rota";
import { Grafo, type NoGrafo } from "../componentes/Grafo";
import { Icone } from "../componentes/Icone";
import { Ajuda } from "../componentes/Ajuda";
import { Carregando, Selo, Vazio } from "../componentes/ui";

const semMapa = (t: string) => t.replace(/^Mapa\s*[-–—:]\s*/i, "Visão geral: ");

export function Notas() {
  const { bib, idx, tema } = useApp();
  const busca = useBusca();
  const params = useMemo(() => new URLSearchParams(busca), [busca]);
  const [materia, setMateria] = useState<string | null>(params.get("materia"));
  const [av, setAv] = useState<Av | null>(null);
  const [termo, setTermo] = useState("");
  const [foco, setFoco] = useState<string | null>(params.get("nota"));
  const [caminho, setCaminho] = useState<string[]>([]); // por onde passou, para voltar

  useEffect(() => {
    if (params.get("nota")) setFoco(params.get("nota"));
    if (params.get("materia")) setMateria(params.get("materia"));
  }, [params]);

  // tópicos que dá para escolher (filtrados por matéria, avaliação e busca)
  const topicos = useMemo(() => {
    if (!bib) return [];
    const t = semAcento(termo.trim());
    return bib.notas.filter(
      (n) =>
        (!materia || n.materia === materia) &&
        (!av || idx.modulo.get(n.modulo)?.avaliacao === av) &&
        (!t || semAcento(n.titulo + " " + n.resumo + " " + n.tags.join(" ")).includes(t))
    );
  }, [bib, idx, materia, av, termo]);

  // sem tópico escolhido: começa pela visão geral do primeiro módulo da seleção
  const centro = foco && idx.nota.get(foco) ? foco : topicos.find((n) => n.mapa)?.id || topicos[0]?.id || null;
  const nota = centro ? idx.nota.get(centro)! : null;

  const { nos, arestas, saidas, entradas } = useMemo(() => {
    if (!nota || !bib) return { nos: [] as NoGrafo[], arestas: [] as [string, string][], saidas: [] as string[], entradas: [] as string[] };
    const saidas = idx.saidas.get(nota.id) || [];
    const entradas = idx.entradas.get(nota.id) || [];
    const ids = new Set([nota.id, ...saidas, ...entradas]);
    const mods = [...new Set([...ids].map((i) => idx.nota.get(i)?.modulo || ""))];
    const cor = new Map(mods.map((m, i) => [m, PALETA[i % PALETA.length]]));
    const nos: NoGrafo[] = [...ids].map((i) => {
      const n = idx.nota.get(i)!;
      return { id: i, titulo: n.titulo, grupo: "um", cor: cor.get(n.modulo)!, prova: n.prova, mapa: n.mapa || i === nota.id, lida: idx.lidas.has(i) };
    });
    // só as ligações que tocam o centro: o resto fica escondido de propósito
    const arestas = bib.links.filter(([a, b]) => (a === nota.id || b === nota.id) && ids.has(a) && ids.has(b));
    return { nos, arestas, saidas, entradas };
  }, [bib, idx, nota]);

  if (!bib) return <Carregando />;
  const focar = (id: string | null) => {
    if (!id || id === centro) return;
    if (centro) setCaminho((c) => [...c.filter((x) => x !== centro), centro].slice(-8));
    setFoco(id);
  };
  const voltar = () => {
    const ant = caminho[caminho.length - 1];
    if (!ant) return;
    setCaminho((c) => c.slice(0, -1));
    setFoco(ant);
  };
  const linha = (id: string) => {
    const n = idx.nota.get(id);
    if (!n) return null;
    return (
      <li key={id}>
        <button type="button" onClick={() => focar(id)} title={n.resumo}>
          <i className="ponto" style={{ background: nos.find((x) => x.id === id)?.cor }} />
          <span>{semMapa(n.titulo)}</span>
          {n.prova && <Selo tipo="prova">prova</Selo>}
        </button>
      </li>
    );
  };
  const materiasVisiveis = bib.materias;

  return (
    <div className="pagina pagina-explorar">
      <header className="cabeca-pagina">
        <div>
          <p className="olho">Explorar ligações</p>
          <h1 className="titulo-pagina">Um tópico por vez</h1>
          <p className="sub">
            No centro, o tópico escolhido; em volta, só as notas ligadas a ele. Clique numa delas para ir até lá e seguir o fio. Dois cliques abrem a nota.
          </p>
        </div>
      </header>

      <div className="explorar">
        <aside className="explorar-topicos">
          <div className="chips" role="group" aria-label="Matéria">
            {materiasVisiveis.length > 1 && <button type="button" className={"chip" + (!materia ? " ativo" : "")} onClick={() => setMateria(null)}>Todas</button>}
            {materiasVisiveis.map((m) => (
              <button type="button" key={m.id} className={"chip" + (materia === m.id || materiasVisiveis.length === 1 ? " ativo" : "")} onClick={() => setMateria(materia === m.id ? null : m.id)}>
                <i className="ponto" style={{ background: idx.cor(m.id) }} /> {m.nome}
              </button>
            ))}
          </div>
          <div className="chips" role="group" aria-label="Avaliação">
            {AVS.map((a) => (
              <button type="button" key={a} className={"chip" + (av === a ? " ativo" : "")} onClick={() => setAv(av === a ? null : a)} aria-pressed={av === a} data-av={a}>{nomeAv(a)}</button>
            ))}
          </div>
          <label className="campo-busca">
            <Icone nome="busca" tam={15} />
            <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Procurar um tópico…" aria-label="Procurar um tópico" />
          </label>
          <ul className="lista-topicos" data-testid="topicos">
            {topicos.slice(0, 200).map((n) => (
              <li key={n.id}>
                <button type="button" className={n.id === centro ? "ativo" : ""} onClick={() => focar(n.id)} data-nota={n.id}>
                  <span>{semMapa(n.titulo)}</span>
                  <small>{idx.modulo.get(n.modulo)?.titulo}</small>
                </button>
              </li>
            ))}
            {!topicos.length && <li className="sub">Nenhum tópico com esses filtros.</li>}
          </ul>
        </aside>

        {!nota ? (
          <Vazio icone="grafo" titulo="Escolha um tópico na lista" />
        ) : (
          <>
            <section className="palco-grafo explorar-grafo">
              <Grafo nos={nos} arestas={arestas} selecionado={nota.id} aoSelecionar={focar} aoAbrir={(id) => ir("/nota/" + id)} tema={tema} />
              <p className="dica-grafo">Clique para ir até a nota ligada. Dois cliques abrem.</p>
            </section>

            <aside className="painel-nota" data-testid="painel-nota" data-nota={nota.id}>
              {caminho.length > 0 && (
                <button type="button" className="link-botao voltar-foco" onClick={voltar} data-testid="voltar-foco">
                  <Icone nome="esquerda" tam={14} /> Voltar para {semMapa(idx.nota.get(caminho[caminho.length - 1])?.titulo || "")}
                </button>
              )}
              <span className="rotulo">{idx.materia.get(nota.materia)?.nome} · {idx.modulo.get(nota.modulo)?.titulo}</span>
              <h3>{semMapa(nota.titulo)}</h3>
              <div className="selos">
                {nota.prova && <Selo tipo="prova">Prova</Selo>}
                {idx.lidas.has(nota.id) && <Selo tipo="neutro">Lida</Selo>}
                <Selo tipo="neutro">{nota.minutos} min</Selo>
              </div>
              <p>{nota.resumo}</p>
              <Link para={"/nota/" + nota.id} className="botao primario largo">Abrir nota <Icone nome="direita" tam={15} /></Link>
              <p className="sub" data-testid="resumo-grafo">{plural(new Set([...saidas, ...entradas]).size, "ligação", "ligações")}</p>
              {saidas.length > 0 && (
                <>
                  <h4>Esta nota leva a <Ajuda>Notas que este tópico cita no texto: o próximo passo natural.</Ajuda></h4>
                  <ul className="lista-ligadas">{saidas.map(linha)}</ul>
                </>
              )}
              {entradas.length > 0 && (
                <>
                  <h4>Citada em <Ajuda>Notas que citam este tópico: onde ele é usado.</Ajuda></h4>
                  <ul className="lista-ligadas">{entradas.filter((e) => !saidas.includes(e)).map(linha)}</ul>
                </>
              )}
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
