// Pendências: conteúdos que a pessoa separou para estudar depois (de um flashcard que errou, de uma
// nota). Ficam aqui até ela dar baixa.
import { useMemo } from "react";
import { quando, useApp } from "../lib/loja";
import { Link } from "../lib/rota";
import { Icone } from "../componentes/Icone";
import { Carregando, Selo, Vazio } from "../componentes/ui";

export function Pendencias() {
  const { bib, idx, pendencias, removerPendencia, marcarLida } = useApp();
  // agrupadas por matéria, na ordem em que foram adicionadas (a mais recente primeiro)
  const grupos = useMemo(() => {
    const m = new Map<string, { id: string; em: number }[]>();
    for (const p of pendencias) {
      const n = idx.nota.get(p.nota);
      if (!n) continue;
      if (!m.has(n.materia)) m.set(n.materia, []);
      m.get(n.materia)!.push({ id: p.nota, em: p.em });
    }
    return [...m.entries()];
  }, [pendencias, idx]);
  if (!bib) return <Carregando />;

  return (
    <div className="pagina pagina-estreita">
      <header className="cabeca-pagina">
        <div>
          <p className="olho">Pendências</p>
          <h1 className="titulo-pagina">Para estudar depois</h1>
          <p className="sub">
            Conteúdos que você separou, por exemplo a partir de um flashcard que errou. Abra, estude e clique em <strong>Dei baixa</strong>: ele sai da lista.
          </p>
        </div>
      </header>

      {!grupos.length && (
        <Vazio icone="marcador" titulo="Nenhuma pendência">
          Durante os flashcards, toque em <strong>Estudar depois</strong> para guardar o assunto aqui. Na leitura de uma nota, use o botão <strong>Adicionar às pendências</strong>.
        </Vazio>
      )}

      {grupos.map(([materia, itens]) => (
        <section key={materia} className="grupo-pendencias">
          <h2 className="titulo-secao"><i className="ponto" style={{ background: idx.cor(materia) }} /> {idx.materia.get(materia)?.nome} <small className="sub">{itens.length}</small></h2>
          <ul className="lista-pendencias" data-testid="pendencias">
            {itens.map(({ id, em }) => {
              const n = idx.nota.get(id)!;
              return (
                <li key={id} data-nota={id}>
                  <Link para={"/nota/" + id} className="pendencia-corpo">
                    <span className="rotulo">{idx.modulo.get(n.modulo)?.titulo}</span>
                    <strong>{n.titulo}</strong>
                    <p>{n.resumo}</p>
                    <span className="selos">
                      {n.prova && <Selo tipo="prova">Prova</Selo>}
                      <Selo tipo="neutro"><Icone nome="relogio" tam={12} /> {n.minutos} min</Selo>
                      <Selo tipo="neutro">adicionada {quando(em)}</Selo>
                    </span>
                  </Link>
                  <div className="pendencia-acoes">
                    <Link para={"/nota/" + id} className="botao pequeno fantasma"><Icone nome="livro" tam={14} /> Estudar</Link>
                    <button
                      type="button"
                      className="botao pequeno primario"
                      onClick={() => {
                        removerPendencia(id, true);
                        marcarLida(id, true);
                      }}
                      title="Já estudei: tira da lista e marca a nota como lida"
                    >
                      <Icone nome="check" tam={14} /> Dei baixa
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
