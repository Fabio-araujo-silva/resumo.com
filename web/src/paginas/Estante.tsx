// Visão "Prateleira": semestre -> matéria (um livro na prateleira) -> módulos (cada um é uma
// fileira de fichas que rola de lado) -> notas. É a visão para estudar em ordem.
import { useMemo, useState } from "react";
import type { Materia } from "../lib/api";
import { dataCurta, diasAte, plural, textoProva, useApp } from "../lib/loja";
import { Link, ir } from "../lib/rota";
import { Icone } from "../componentes/Icone";
import { Anel, Barra, Carregando, CartaoNota, Vazio } from "../componentes/ui";

export function CapaMateria({ materia }: { materia: Materia }) {
  const { idx } = useApp();
  const notas = (idx.notasDaMateria.get(materia.id) || []).filter((n) => !n.mapa);
  const lidas = notas.filter((n) => idx.lidas.has(n.id)).length;
  const dias = diasAte(materia.prova_data);
  const cor = idx.cor(materia.id);
  return (
    <Link para={"/materia/" + materia.id} className="capa" style={{ ["--cor" as string]: cor }} data-materia={materia.id}>
      <span className="capa-lombada" />
      <span className="olho">{materia.semestre}º semestre</span>
      <h3>{materia.nome}</h3>
      <span className="capa-info">
        {plural((idx.modulosDe.get(materia.id) || []).length, "módulo", "módulos")} · {plural(notas.length, "nota", "notas")}
      </span>
      {dias !== null && dias >= 0 && <span className={"capa-prova" + (dias <= 7 ? " urgente" : "")}>{textoProva(dias)}</span>}
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
          <p className="sub">Escolha uma matéria e estude os módulos em ordem.</p>
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
  const dias = diasAte(materia.prova_data);

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
          {dias !== null && dias >= 0 && <span className="heroi-prova"><Icone nome="prova" tam={15} /> {textoProva(dias)} · {dataCurta(materia.prova_data!)}</span>}
        </div>
        <div className="heroi-acoes">
          {proxima && (
            <button type="button" className="botao claro" onClick={() => ir("/nota/" + proxima.id)}>
              <Icone nome="livro" tam={16} /> {lidas ? "Continuar leitura" : "Começar a ler"}
            </button>
          )}
          {deProva > 0 && <Link para={"/prova/" + id} className="botao vidro"><Icone nome="prova" tam={16} /> Modo prova</Link>}
          {cartas > 0 && <Link para={"/flashcards/" + id} className="botao vidro"><Icone nome="cartas" tam={16} /> Flashcards</Link>}
          <Link para={"/notas?materia=" + id} className="botao vidro"><Icone nome="grafo" tam={16} /> Ver ligações</Link>
        </div>
        <div className="heroi-anel"><Anel valor={lidas} total={notas.length} tam={72} /></div>
      </header>

      <div className="barra-filtros">
        <h2 className="titulo-secao">Módulos</h2>
        {deProva > 0 && (
          <button type="button" className={"chip" + (soProva ? " ativo" : "")} onClick={() => setSoProva((v) => !v)} aria-pressed={soProva}>
            <Icone nome="prova" tam={14} /> Só conteúdo de prova ({deProva})
          </button>
        )}
      </div>

      {modulos.map((mod, i) => {
        const todas = idx.notasDoModulo.get(mod.id) || [];
        const visiveis = soProva ? todas.filter((n) => n.prova) : todas;
        if (!visiveis.length) return null;
        const contam = todas.filter((n) => !n.mapa);
        const feitas = contam.filter((n) => idx.lidas.has(n.id)).length;
        let numero = 0;
        return (
          <section key={mod.id} className="modulo" data-modulo={mod.id}>
            <header>
              <span className="modulo-num">{i + 1}</span>
              <div>
                <h3>{mod.titulo}</h3>
                {mod.descricao && <p>{mod.descricao}</p>}
              </div>
              <span className={"modulo-progresso" + (feitas === contam.length && contam.length ? " completo" : "")}>
                {feitas === contam.length && contam.length ? <Icone nome="check" tam={14} /> : null} {feitas}/{contam.length}
              </span>
            </header>
            <div className="trilho">
              {visiveis.map((n) => (
                <CartaoNota key={n.id} nota={n} lida={idx.lidas.has(n.id)} numero={n.mapa ? undefined : ++numero} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
