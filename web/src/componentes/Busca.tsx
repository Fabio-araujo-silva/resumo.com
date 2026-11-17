// Busca com Ctrl+K: títulos e resumos na hora (já estão na memória) e, depois de uma pausa,
// o texto das notas no servidor.
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { semAcento, useApp } from "../lib/loja";
import { ir } from "../lib/rota";
import { Icone } from "./Icone";

type Item = { id: string; titulo: string; sub: string; trecho?: string; para: string; icone: string };

export function Busca({ aoFechar }: { aoFechar: () => void }) {
  const { bib, idx } = useApp();
  const [q, setQ] = useState("");
  const [remotos, setRemotos] = useState<Item[]>([]);
  const [sel, setSel] = useState(0);
  const lista = useRef<HTMLDivElement>(null);

  const locais = useMemo<Item[]>(() => {
    const termo = semAcento(q.trim());
    if (!bib) return [];
    const nomeMateria = (id: string) => idx.materia.get(id)?.nome || "";
    if (!termo)
      return bib.materias.slice(0, 8).map((m) => ({ id: "m:" + m.id, titulo: m.nome, sub: `${m.semestre}º semestre`, para: "/materia/" + m.id, icone: "livro" }));
    const partes = termo.split(/\s+/);
    const materias = bib.materias
      .filter((m) => partes.every((p) => semAcento(m.nome).includes(p)))
      .map((m) => ({ id: "m:" + m.id, titulo: m.nome, sub: `Matéria · ${m.semestre}º semestre`, para: "/materia/" + m.id, icone: "livro" }));
    const notas = bib.notas
      .map((n) => {
        const t = semAcento(n.titulo);
        const r = semAcento(n.resumo + " " + n.tags.join(" "));
        if (!partes.every((p) => t.includes(p) || r.includes(p))) return null;
        return { peso: partes.every((p) => t.includes(p)) ? (t.startsWith(partes[0]) ? 0 : 1) : 2, n };
      })
      .filter((x): x is { peso: number; n: (typeof bib.notas)[number] } => !!x)
      .sort((a, b) => a.peso - b.peso)
      .slice(0, 12)
      .map(({ n }) => ({ id: n.id, titulo: n.titulo, sub: nomeMateria(n.materia) + " · " + (idx.modulo.get(n.modulo)?.titulo || ""), trecho: n.resumo, para: "/nota/" + n.id, icone: n.prova ? "prova" : "grafo" }));
    return [...materias, ...notas];
  }, [q, bib, idx]);

  useEffect(() => {
    setRemotos([]);
    const termo = q.trim();
    if (termo.length < 3) return;
    let vivo = true;
    const t = setTimeout(() => {
      api
        .get<{ resultados: { id: string; titulo: string; materia: string; trecho: string }[] }>("/api/busca?q=" + encodeURIComponent(termo))
        .then((r) => vivo && setRemotos(r.resultados.map((x) => ({ id: x.id, titulo: x.titulo, sub: (idx.materia.get(x.materia)?.nome || "") + " · no texto", trecho: x.trecho, para: "/nota/" + x.id, icone: "busca" }))))
        .catch(() => {});
    }, 240);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [q, idx]);

  const itens = useMemo(() => {
    const vistos = new Set(locais.map((i) => i.id));
    return [...locais, ...remotos.filter((r) => !vistos.has(r.id))].slice(0, 24);
  }, [locais, remotos]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    lista.current?.querySelector(".busca-item.sel")?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const abrir = (i: Item | undefined) => {
    if (!i) return;
    aoFechar();
    ir(i.para);
  };

  return (
    <div className="modal-fundo busca-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="busca" role="dialog" aria-label="Buscar">
        <div className="busca-campo">
          <Icone nome="busca" />
          <input
            autoFocus
            value={q}
            placeholder="Buscar notas, matérias e conteúdo…"
            aria-label="Buscar"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") aoFechar();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(itens.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") abrir(itens[sel]);
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="busca-lista" ref={lista}>
          {itens.length === 0 && <p className="busca-nada">{q.trim() ? "Nada encontrado." : "Digite para buscar."}</p>}
          {itens.map((i, n) => (
            <button type="button" key={i.id} className={"busca-item" + (n === sel ? " sel" : "")} onMouseEnter={() => setSel(n)} onClick={() => abrir(i)}>
              <Icone nome={i.icone} tam={16} />
              <span>
                <strong>{i.titulo}</strong>
                <small>{i.sub}</small>
                {i.trecho && <em>{i.trecho}</em>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
