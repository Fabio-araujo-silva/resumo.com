// Modo prova: só o conteúdo emergencial, separado por avaliação (N1 e N2). Por nota de prova, o
// bloco "essencial"; depois as dicas de prova, as questões e os flashcards das notas de prova.
import { useEffect, useMemo, useState } from "react";
import { api, mensagem, type ProvaDados } from "../lib/api";
import { nomeAv, provasDe } from "../lib/avaliacao";
import { dataCurta, diasAte, plural, textoProva, useApp } from "../lib/loja";
import { Link, ir, useBusca } from "../lib/rota";
import { ConteudoNota } from "../componentes/ConteudoNota";
import { Icone } from "../componentes/Icone";
import { Barra, Carregando, Selo, Vazio } from "../componentes/ui";
import { Ajuda } from "../componentes/Ajuda";

const PRIORIDADE: Record<number, string> = { 1: "Prioridade alta", 2: "Prioridade média", 3: "Prioridade baixa" };

export function ProvaLista() {
  const { bib, idx } = useApp();
  if (!bib) return <Carregando />;
  // uma prova por matéria e por avaliação que tenha conteúdo marcado
  const provas = bib.materias
    .flatMap((m) =>
      provasDe(m, idx).map((p) => {
        const mods = new Set((idx.modulosDe.get(m.id) || []).filter((x) => x.avaliacao === p.av).map((x) => x.id));
        const notas = (idx.notasDaMateria.get(m.id) || []).filter((n) => n.prova && mods.has(n.modulo));
        return { m, ...p, notas, lidas: notas.filter((n) => idx.lidas.has(n.id)).length };
      })
    )
    .filter((x) => x.notas.length)
    .sort((a, b) => {
      const passou = (x: typeof a) => (x.dias !== null && x.dias < 0 ? 1 : 0);
      return passou(a) - passou(b) || (a.dias ?? 9999) - (b.dias ?? 9999) || a.m.semestre - b.m.semestre || a.av.localeCompare(b.av);
    });
  return (
    <div className="pagina">
      <header className="cabeca-pagina">
        <div>
          <p className="olho">Modo prova</p>
          <h1 className="titulo-pagina">O que é emergencial</h1>
          <p className="sub">Só o que foi marcado como conteúdo de prova, por avaliação (N1 e N2) e na ordem de prioridade. Um cartão por matéria e por prova.</p>
        </div>
      </header>
      {!provas.length && <Vazio icone="prova" titulo="Nenhum conteúdo de prova marcado">Quando uma matéria tiver notas marcadas como prova, ela aparece aqui.</Vazio>}
      <div className="grade-prova">
        {provas.map(({ m, av, data, dias, notas, lidas }) => (
          <Link key={m.id + av} para={`/prova/${m.id}?av=${av}`} className={"cartao cartao-prova" + (dias !== null && dias >= 0 && dias <= 7 ? " urgente" : "")} data-materia={m.id} data-av={av}>
            <span className="rotulo"><i className="ponto" style={{ background: idx.cor(m.id) }} /> {m.semestre}º semestre <b className="sigla-av">{nomeAv(av)}</b></span>
            <h3>{m.nome}</h3>
            {dias !== null ? (
              <p className="contagem"><strong>{dias < 0 ? "–" : dias}</strong> {dias < 0 ? "prova já passou" : dias === 1 ? "dia para a prova" : "dias para a prova"}<small>{nomeAv(av)} · {dataCurta(data!)}</small></p>
            ) : (
              <p className="contagem sem-data">{nomeAv(av)} sem data de prova definida</p>
            )}
            <Barra valor={lidas} total={notas.length} cor="var(--ambar)" />
            <span className="sub">{lidas} de {plural(notas.length, "nota de prova lida", "notas de prova lidas")}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ProvaMateria({ id }: { id: string }) {
  const { idx, marcarLida } = useApp();
  const busca = useBusca();
  const pedida = useMemo(() => new URLSearchParams(busca).get("av") || "", [busca]);
  const [dados, setDados] = useState<ProvaDados | null>(null);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<"essencial" | "dicas" | "questoes">("essencial");

  useEffect(() => {
    let vivo = true;
    setDados(null);
    setErro("");
    api.get<ProvaDados>("/api/prova/" + id + (pedida ? "?av=" + pedida : "")).then((d) => vivo && setDados(d)).catch((e) => vivo && setErro(mensagem(e)));
    return () => {
      vivo = false;
    };
  }, [id, pedida]);

  if (erro) return <div className="pagina"><Vazio icone="alerta" titulo="Não foi possível abrir">{erro}</Vazio></div>;
  if (!dados) return <div className="pagina"><Carregando /></div>;
  const { materia, notas, av } = dados;
  const dias = diasAte(materia.provaData);
  const lidas = notas.filter((n) => idx.lidas.has(n.id)).length;
  const cartas = notas.reduce((s, n) => s + (idx.nota.get(n.id)?.cards || 0), 0);
  const minutos = notas.reduce((s, n) => s + n.minutos, 0);

  return (
    <div className="pagina pagina-prova">
      <header className={"heroi heroi-prova-modo" + (dias !== null && dias >= 0 && dias <= 7 ? " urgente" : "")}>
        <Link para="/prova" className="voltar"><Icone nome="esquerda" tam={15} /> Modo prova</Link>
        <p className="olho"><Icone nome="raio" tam={14} /> Conteúdo emergencial · {nomeAv(av)}</p>
        <h1>{materia.nome}</h1>
        {dados.avaliacoes.length > 1 && (
          <div className="alternador alternador-av" role="group" aria-label="Avaliação">
            {dados.avaliacoes.map((a) => (
              <button type="button" key={a.av} className={a.av === av ? "ativo" : ""} onClick={() => ir(`/prova/${id}?av=${a.av}`, { manterRolagem: true })} data-av={a.av}>
                {nomeAv(a.av)} <small>{a.notas}</small>
              </button>
            ))}
          </div>
        )}
        <div className="heroi-dados">
          {dias !== null && <span className="heroi-prova"><Icone nome="prova" tam={15} /> {nomeAv(av)}: {textoProva(dias)} · {dataCurta(materia.provaData!)}</span>}
          <span><b>{notas.length}</b> notas de prova</span>
          <span><b>{lidas}</b> lidas</span>
          <span><b>~{minutos} min</b> para ler tudo</span>
        </div>
        {materia.provaFoco && (
          <div className="foco">
            <span className="rotulo">O que cai na {nomeAv(av)} <Ajuda>Escrito pelo administrador a partir do que o professor disse que cai nesta prova.</Ajuda></span>
            <p>{materia.provaFoco}</p>
          </div>
        )}
        <div className="heroi-acoes">
          {cartas > 0 && <Link para={`/flashcards/${id}?modo=prova&av=${av}`} className="botao claro"><Icone nome="cartas" tam={16} /> Flashcards da prova ({cartas})</Link>}
          <Link para={"/materia/" + id} className="botao vidro"><Icone nome="estante" tam={16} /> Matéria completa</Link>
        </div>
      </header>

      {!notas.length ? (
        <Vazio icone="prova" titulo="Nada marcado como prova nesta matéria" />
      ) : (
        <>
          <p className="legenda-abas">
            <strong>Essencial</strong>: o mínimo de cada nota de prova, com "já sei" para marcar o que domina. <strong>Dicas de prova</strong>: como o assunto costuma ser cobrado e as pegadinhas. <strong>Teste-se</strong>: questões com correção na hora.
          </p>
          <div className="abas" role="tablist">
            <button type="button" role="tab" aria-selected={aba === "essencial"} className={aba === "essencial" ? "ativa" : ""} onClick={() => setAba("essencial")}>Essencial <b>{notas.length}</b></button>
            <button type="button" role="tab" aria-selected={aba === "dicas"} className={aba === "dicas" ? "ativa" : ""} onClick={() => setAba("dicas")}>Dicas de prova <b>{dados.dicas.length}</b></button>
            <button type="button" role="tab" aria-selected={aba === "questoes"} className={aba === "questoes" ? "ativa" : ""} onClick={() => setAba("questoes")}>Teste-se <b>{dados.questoes.length}</b></button>
          </div>

          {aba === "essencial" && (
            <div className="fluxo-prova">
              {notas.map((n, i) => {
                const lida = idx.lidas.has(n.id);
                return (
                  <section key={n.id} className={"ficha-prova p" + n.prioridade + (lida ? " lida" : "")} data-nota={n.id}>
                    <header>
                      <span className="ficha-num">{i + 1}</span>
                      <div>
                        <h3><Link para={"/nota/" + n.id}>{n.titulo}</Link></h3>
                        <span className="sub">{n.modulo}</span>
                      </div>
                      <Selo tipo={n.prioridade === 1 ? "alta" : "neutro"}>{PRIORIDADE[n.prioridade]}</Selo>
                    </header>
                    {n.essencial.length ? n.essencial.map((h, j) => <ConteudoNota key={j} html={h} notaId={n.id} />) : <p className="ficha-resumo">{n.resumo}</p>}
                    <footer>
                      <Link para={"/nota/" + n.id} className="link-suave">Ler a nota completa ({n.minutos} min) <Icone nome="direita" tam={13} /></Link>
                      <button type="button" className={"botao pequeno " + (lida ? "fantasma" : "")} onClick={() => marcarLida(n.id, !lida)} aria-pressed={lida}>
                        <Icone nome="check" tam={14} /> {lida ? "Revisada" : "Marcar como revisada"}
                      </button>
                    </footer>
                  </section>
                );
              })}
            </div>
          )}

          {aba === "dicas" && (
            <div className="fluxo-prova">
              {!dados.dicas.length && <Vazio icone="prova" titulo="Sem dicas de prova nestas notas" />}
              {dados.dicas.map((d, i) => (
                <section key={i} className="callout callout-prova dica-solta">
                  <div className="callout-cabeca">
                    <span className="callout-rotulo">Dica de prova</span>
                    {d.titulo && <span className="callout-titulo">{d.titulo}</span>}
                  </div>
                  <div className="callout-corpo"><ConteudoNota html={d.html} /></div>
                  <Link para={"/nota/" + d.nota.id} className="link-suave">{d.nota.titulo} <Icone nome="direita" tam={13} /></Link>
                </section>
              ))}
            </div>
          )}

          {aba === "questoes" && (
            <div className="fluxo-prova">
              {!dados.questoes.length && <Vazio icone="prova" titulo="Sem questões nestas notas" />}
              {dados.questoes.map((q, i) => (
                <section key={i} className="questao-solta">
                  <ConteudoNota html={q.html} />
                  <Link para={"/nota/" + q.nota.id} className="link-suave">Da nota: {q.nota.titulo} <Icone nome="direita" tam={13} /></Link>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
