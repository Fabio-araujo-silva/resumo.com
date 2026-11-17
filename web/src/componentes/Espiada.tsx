// "Espiar": abre uma nota ligada num painel ao lado, sem tirar o aluno da nota (ou da ficha de
// prova, ou da carta) que ele está lendo. Dentro do painel os links continuam funcionando, com
// "voltar"; "Abrir nota" leva para a leitura completa.
import { useCallback, useEffect, useState } from "react";
import { api, mensagem, type NotaCompleta } from "../lib/api";
import { useApp } from "../lib/loja";
import { ir, useCaminho } from "../lib/rota";
import { ConteudoNota } from "./ConteudoNota";
import { Icone } from "./Icone";
import { Carregando, Selo } from "./ui";

export function Espiada() {
  const { idx } = useApp();
  const caminho = useCaminho();
  const [pilha, setPilha] = useState<string[]>([]);
  const [dados, setDados] = useState<NotaCompleta | null>(null);
  const [erro, setErro] = useState("");
  const atual = pilha[pilha.length - 1];

  const fechar = useCallback(() => setPilha([]), []);
  useEffect(() => {
    const abrir = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) setPilha((p) => (p[p.length - 1] === id ? p : [...p, id]));
    };
    window.addEventListener("sinapse:espiar", abrir);
    return () => window.removeEventListener("sinapse:espiar", abrir);
  }, []);
  useEffect(fechar, [caminho, fechar]); // mudou de página: fecha
  useEffect(() => {
    if (!atual) return;
    const t = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    document.addEventListener("keydown", t);
    return () => document.removeEventListener("keydown", t);
  }, [atual, fechar]);

  useEffect(() => {
    if (!atual) return;
    let vivo = true;
    setDados(null);
    setErro("");
    api.get<NotaCompleta>("/api/notas/" + atual).then((d) => vivo && setDados(d)).catch((e) => vivo && setErro(mensagem(e)));
    return () => {
      vivo = false;
    };
  }, [atual]);

  if (!atual) return null;
  const meta = idx.nota.get(atual);
  const titulo = dados?.nota.titulo || meta?.titulo || "Nota";
  return (
    <div className="espiada-fundo" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <aside className="espiada" role="dialog" aria-label={"Espiando: " + titulo} data-testid="espiada" data-nota={atual}>
        <header>
          {pilha.length > 1 && (
            <button type="button" className="botao-icone" onClick={() => setPilha((p) => p.slice(0, -1))} aria-label="Voltar à nota anterior" title="Voltar">
              <Icone nome="esquerda" />
            </button>
          )}
          <span className="rotulo">
            <Icone nome="olho" tam={14} /> Espiando{meta ? " · " + (idx.modulo.get(meta.modulo)?.titulo || "") : ""}
          </span>
          <button type="button" className="botao-icone" onClick={fechar} aria-label="Fechar" title="Fechar (Esc)">
            <Icone nome="fechar" />
          </button>
        </header>
        <div className="espiada-corpo">
          <h2>{titulo.replace(/^Mapa\s*[-–—:]\s*/i, "")}</h2>
          {meta && <p className="leitor-resumo">{meta.resumo}</p>}
          <div className="selos">
            {meta?.prova && <Selo tipo="prova">Conteúdo de prova</Selo>}
            {meta && idx.lidas.has(meta.id) && <Selo tipo="neutro">Lida</Selo>}
            {meta && <Selo tipo="neutro"><Icone nome="relogio" tam={12} /> {meta.minutos} min</Selo>}
          </div>
          {erro ? <div className="alerta alerta-erro">{erro}</div> : !dados ? <Carregando texto="Abrindo…" /> : <ConteudoNota html={dados.html} notaId={atual} />}
        </div>
        <footer>
          <button type="button" className="botao primario largo" onClick={() => ir("/nota/" + atual)}>
            Abrir nota completa <Icone nome="direita" tam={15} />
          </button>
        </footer>
      </aside>
    </div>
  );
}
