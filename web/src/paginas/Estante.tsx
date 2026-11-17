// Visão "Prateleira": semestre -> matéria (um livro na prateleira) -> avaliação (N1, N2) ->
// módulos (cada um é uma fileira de fichas que rola de lado) -> notas. É a visão para estudar em ordem.
import { useMemo, useState } from "react";
import type { Materia } from "../lib/api";
import { AVS, nomeAv, provasDe, proximaProva, type Av } from "../lib/avaliacao";
import { dataCurta, plural, textoProva, useApp } from "../lib/loja";
import { Link, ir } from "../lib/rota";
import { Icone } from "../componentes/Icone";
import { Anel, Barra, Carregando, CartaoNota, Vazio } from "../componentes/ui";
import { Ajuda } from "../componentes/Ajuda";

export function CapaMateria({ materia }: { materia: Materia }) {
  const { idx } = useApp();
  const notas = (idx.notasDaMateria.get(materia.id) || []).filter((n) => !n.mapa);
  const lidas = notas.filter((n) => idx.lidas.has(n.id)).length;
  const provas = provasDe(materia, idx);
  const proxima = proximaProva(materia, idx);
  const cor = idx.cor(materia.id);
  return (
    <Link para={"/materia/" + materia.id} className="capa" style={{ ["--cor" as string]: cor }} data-materia={materia.id}>
      <span className="capa-lombada" />
      <span className="olho">
        {materia.semestre}º semestre
        {provas.length > 0 && <b className="capa-av">{provas.map((p) => nomeAv(p.av)).join(" · ")}</b>}
      </span>
      <h3>{materia.nome}</h3>
      <span className="capa-info">
        {plural((idx.modulosDe.get(materia.id) || []).length, "módulo", "módulos")} · {plural(notas.length, "nota", "notas")}
      </span>
      {proxima && <span className={"capa-prova" + (proxima.dias! <= 7 ? " urgente" : "")}>{nomeAv(proxima.av)}: {textoProva(proxima.dias)}</span>}
      <span className="capa-progresso">
        <Barra valor={lidas} total={notas.length} cor="rgba(255,255,255,.92)" />
        <small>{lidas}/{notas.length} lidas</small>
      </span>
    </Link>
  );
}

export function Estante() {
  const { bib, idx } = useApp();
  const [semestre, setSemestre] = useState<number | null>(null);
  if (!bib) return <Carregando />;
  const semestres = idx.semestres.filter((s) => semestre === null || s === semestre);
  return (
    <div className="pagina">
      <header className="cabeca-pagina">
        <div>
          <p className="olho">Prateleira</p>
          <h1 className="titulo-pagina">Matérias por semestre</h1>
          <p className="sub">Escolha uma matéria e estude os módulos em ordem, por avaliação (N1 e N2).</p>
        </div>
        {idx.semestres.length > 1 && (
          <div className="chips" role="group" aria-label="Filtrar por semestre">
            <button type="button" className={"chip" + (semestre === null ? " ativo" : "")} onClick={() => setSemestre(null)}>Todos</button>
            {idx.semestres.map((s) => (
              <button type="button" key={s} className={"chip" + (semestre === s ? " ativo" : "")} onClick={() => setSemestre(s)}>{s}º</button>
            ))}
          </div>
        )}
      </header>
      {!bib.materias.length && <Vazio titulo="Nenhuma matéria ainda">Quando houver resumos publicados, eles aparecem aqui.</Vazio>}
      {semestres.map((s) => (
        <section key={s} className="prateleira">
          <h2 className="prateleira-rotulo"><span>{s}º semestre</span></h2>
          <div className="prateleira-livros">
            {bib.materias.filter((m) => m.semestre === s).map((m) => (
              <CapaMateria key={m.id} materia={m} />
            ))}
          </div>
          <div className="prateleira-tabua" />
        </section>
      ))}
    </div>
  );
}

export function PaginaMateria({ id }: { id: string }) {
  const { bib, idx } = useApp();
  const [soProva, setSoProva] = useState(false);
  const [av, setAv] = useState<Av | null>(null);
  const materia = idx.materia.get(id);
  const modulos = idx.modulosDe.get(id) || [];
  const notas = useMemo(() => (idx.notasDaMateria.get(id) || []).filter((n) => !n.mapa), [idx, id]);
  if (!bib) return <Carregando />;
  if (!materia) return <div className="pagina"><Vazio titulo="Matéria não encontrada">Ela pode ter sido removida, ou seu acesso não a inclui.</Vazio></div>;

  const lidas = notas.filter((n) => idx.lidas.has(n.id)).length;
  const proxima = (idx.notasDaMateria.get(id) || []).find((n) => !idx.lidas.has(n.id) && !n.mapa) || (idx.notasDaMateria.get(id) || [])[0];
  const deProva = notas.filter((n) => n.prova).length;
  const cartas = (idx.notasDaMateria.get(id) || []).reduce((s, n) => s + n.cards, 0);
  const minutos = notas.reduce((s, n) => s + n.minutos, 0);
  const provas = provasDe(materia, idx);
  const ativa = av && provas.some((p) => p.av === av) ? av : null;
  let ordem = 0; // numeração dos módulos corre pela matéria inteira

  return (
    <div className="pagina pagina-materia">
      <header className="heroi" style={{ ["--cor" as string]: idx.cor(id) }}>
        <Link para="/estante" className="voltar"><Icone nome="esquerda" tam={15} /> Prateleira</Link>
        <p className="olho">{materia.eixo || `${materia.semestre}º semestre`}</p>
        <h1>{materia.nome}</h1>
        {materia.descricao && <p className="heroi-desc">{materia.descricao}</p>}
        <div className="heroi-dados">
          <span><b>{modulos.length}</b> {modulos.length === 1 ? "módulo" : "módulos"}</span>
          <span><b>{notas.length}</b> notas</span>
          <span><b>{cartas}</b> flashcards</span>
          <span><b>{minutos < 60 ? minutos + " min" : (minutos / 60).toFixed(1).replace(".", ",") + " h"}</b> de leitura</span>
          {provas.filter((p) => p.dias !== null && p.dias >= 0).map((p) => (
            <span className="heroi-prova" key={p.av}><Icone nome="prova" tam={15} /> {nomeAv(p.av)}: {textoProva(p.dias)} · {dataCurta(p.data!)}</span>
          ))}
        </div>
        <div className="heroi-acoes">
          {proxima && (
            <button type="button" className="botao claro" onClick={() => ir("/nota/" + proxima.id)}>
              <Icone nome="livro" tam={16} /> {lidas ? "Continuar leitura" : "Começar a ler"}
            </button>
          )}
          {deProva > 0 && <Link para={"/prova/" + id} className="botao vidro"><Icone nome="prova" tam={16} /> Modo prova</Link>}
          {cartas > 0 && <Link para={"/flashcards/" + id} className="botao vidro"><Icone nome="cartas" tam={16} /> Flashcards</Link>}
          <Link para={"/notas?materia=" + id} className="botao vidro" title="Navegue pelas notas um tópico por vez, seguindo as ligações"><Icone nome="grafo" tam={16} /> Explorar ligações</Link>
        </div>
        <div className="heroi-anel"><Anel valor={lidas} total={notas.length} tam={72} /></div>
      </header>

      <p className="legenda-cartoes">
        Cada cartão é uma nota curta. <span className="selo selo-mapa">Mapa</span> abre a visão geral do módulo; <span className="selo selo-prova">Prova</span> marca o que cai na prova; o número com <Icone nome="cartas" tam={12} /> é a quantidade de flashcards da nota.
      </p>
      <div className="barra-filtros">
        <div className="chips" role="group" aria-label="Avaliação">
          {provas.length > 1 && <button type="button" className={"chip" + (!ativa ? " ativo" : "")} onClick={() => setAv(null)}>N1 e N2</button>}
          {provas.length > 1 && provas.map((p) => (
            <button type="button" key={p.av} className={"chip" + (ativa === p.av ? " ativo" : "")} onClick={() => setAv(p.av)} data-av={p.av}>Só {nomeAv(p.av)}</button>
          ))}
        </div>
        {deProva > 0 && (
          <button type="button" className={"chip" + (soProva ? " ativo" : "")} onClick={() => setSoProva((v) => !v)} aria-pressed={soProva}>
            <Icone nome="prova" tam={14} /> Só conteúdo de prova ({deProva})
          </button>
        )}
      </div>

      {AVS.map((a) => {
        const prova = provas.find((p) => p.av === a);
        const mods = modulos.filter((m) => m.avaliacao === a);
        if (!prova || !mods.length) return null;
        const numerados = mods.map((mod) => ({ mod, n: ++ordem }));
        if (ativa && ativa !== a) return null;
        const doGrupo = mods.flatMap((m) => idx.notasDoModulo.get(m.id) || []);
        const leitura = doGrupo.filter((n) => !n.mapa);
        const feitasGrupo = leitura.filter((n) => idx.lidas.has(n.id)).length;
        const provaGrupo = leitura.filter((n) => n.prova).length;
        const cartasGrupo = doGrupo.reduce((s, n) => s + n.cards, 0);
        return (
          <section key={a} className={"avaliacao avaliacao-" + a} data-avaliacao={a}>
            <header className="avaliacao-cabeca">
              <span className="avaliacao-sigla">{nomeAv(a)}</span>
              <div>
                <h2>{a === "n1" ? "Primeira avaliação" : "Segunda avaliação"} <Ajuda>Os módulos que caem na {nomeAv(a)}. Cada avaliação tem a sua data, o seu modo prova e os seus flashcards.</Ajuda></h2>
                <p>
                  {plural(mods.length, "módulo", "módulos")} · {feitasGrupo}/{leitura.length} notas lidas
                  {prova.data ? ` · prova em ${dataCurta(prova.data)}` : ""}
                  {prova.dias !== null && prova.dias >= 0 ? ` (${textoProva(prova.dias).replace("prova ", "")})` : ""}
                </p>
              </div>
              <div className="linha-botoes">
                {provaGrupo > 0 && <Link para={`/prova/${id}?av=${a}`} className="botao pequeno fantasma"><Icone nome="prova" tam={14} /> Modo prova {nomeAv(a)}</Link>}
                {cartasGrupo > 0 && <Link para={`/flashcards/${id}?av=${a}`} className="botao pequeno fantasma"><Icone nome="cartas" tam={14} /> Flashcards {nomeAv(a)}</Link>}
              </div>
            </header>
            {numerados.map(({ mod, n }) => {
              const todas = idx.notasDoModulo.get(mod.id) || [];
              const visiveis = soProva ? todas.filter((x) => x.prova) : todas;
              if (!visiveis.length) return null;
              const contam = todas.filter((x) => !x.mapa);
              const feitas = contam.filter((x) => idx.lidas.has(x.id)).length;
              let numero = 0;
              return (
                <section key={mod.id} className="modulo" data-modulo={mod.id}>
                  <header>
                    <span className="modulo-num">{n}</span>
                    <div>
                      <h3>{mod.titulo}</h3>
                      {mod.descricao && <p>{mod.descricao}</p>}
                    </div>
                    <span className={"modulo-progresso" + (feitas === contam.length && contam.length ? " completo" : "")}>
                      {feitas === contam.length && contam.length ? <Icone nome="check" tam={14} /> : null} {feitas}/{contam.length}
                    </span>
                  </header>
                  <div className="trilho">
                    {visiveis.map((x) => (
                      <CartaoNota key={x.id} nota={x} lida={idx.lidas.has(x.id)} numero={x.mapa ? undefined : ++numero} />
                    ))}
                  </div>
                </section>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
