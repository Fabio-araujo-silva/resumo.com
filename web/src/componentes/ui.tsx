// Peças pequenas de interface usadas em várias telas.
import { useEffect, type ReactNode } from "react";
import { Icone } from "./Icone";
import { Link } from "../lib/rota";
import type { NotaMeta } from "../lib/api";

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div className="carregando" role="status">
      <span className="pulso-carga" />
      {texto}
    </div>
  );
}

export function Vazio({ icone = "livro", titulo, children }: { icone?: string; titulo: string; children?: ReactNode }) {
  return (
    <div className="vazio">
      <Icone nome={icone} tam={30} />
      <h3>{titulo}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Barra({ valor, total, cor }: { valor: number; total: number; cor?: string }) {
  const pct = total ? Math.round((valor / total) * 100) : 0;
  return (
    <div className="barra" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} title={`${valor} de ${total}`}>
      <i style={{ width: pct + "%", background: cor }} />
    </div>
  );
}

export function Anel({ valor, total, tam = 44 }: { valor: number; total: number; tam?: number }) {
  const r = (tam - 6) / 2;
  const c = 2 * Math.PI * r;
  const pct = total ? valor / total : 0;
  return (
    <svg className="anel" width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} role="img" aria-label={`${Math.round(pct * 100)}% lido`}>
      <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke="var(--linha)" strokeWidth="4" />
      <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke="var(--acento)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform={`rotate(-90 ${tam / 2} ${tam / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle">{Math.round(pct * 100)}</text>
    </svg>
  );
}

export function Selo({ tipo, children }: { tipo: "prova" | "mapa" | "pdf" | "rascunho" | "neutro" | "alta"; children: ReactNode }) {
  return <span className={"selo selo-" + tipo}>{children}</span>;
}

export function Modal({ titulo, aoFechar, children, largo }: { titulo: string; aoFechar: () => void; children: ReactNode; largo?: boolean }) {
  useEffect(() => {
    const t = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    document.addEventListener("keydown", t);
    return () => document.removeEventListener("keydown", t);
  }, [aoFechar]);
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className={"modal" + (largo ? " modal-largo" : "")} role="dialog" aria-modal="true" aria-label={titulo}>
        <header>
          <h2>{titulo}</h2>
          <button type="button" className="botao-icone" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="fechar" />
          </button>
        </header>
        <div className="modal-corpo">{children}</div>
      </div>
    </div>
  );
}

// Cartão de uma nota (prateleira, módulos, listas).
export function CartaoNota({ nota, lida, numero }: { nota: NotaMeta; lida: boolean; numero?: number }) {
  return (
    <Link para={"/nota/" + nota.id} className={"cartao-nota" + (lida ? " lida" : "") + (nota.mapa ? " mapa" : "")} data-nota={nota.id}>
      <div className="cartao-nota-topo">
        {numero != null && <span className="cartao-nota-num">{String(numero).padStart(2, "0")}</span>}
        {nota.mapa && <Selo tipo="mapa">Mapa</Selo>}
        {nota.prova && <Selo tipo="prova">Prova</Selo>}
        {nota.pdf && <Selo tipo="pdf">PDF</Selo>}
        {nota.rascunho && <Selo tipo="rascunho">Rascunho</Selo>}
        {lida && (
          <span className="cartao-nota-lida" title="Lida">
            <Icone nome="check" tam={14} />
          </span>
        )}
      </div>
      <h4>{nota.mapa ? nota.titulo.replace(/^Mapa\s*[-–—:]\s*/i, "Visão geral: ") : nota.titulo}</h4>
      <p>{nota.resumo}</p>
      <div className="cartao-nota-pe">
        <span><Icone nome="relogio" tam={13} /> {nota.minutos} min</span>
        {nota.cards > 0 && <span><Icone nome="cartas" tam={13} /> {nota.cards}</span>}
      </div>
    </Link>
  );
}

export function Avisos({ avisos }: { avisos: { id: number; texto: string; tipo: string }[] }) {
  return (
    <div className="avisos" aria-live="polite">
      {avisos.map((a) => (
        <div key={a.id} className={"aviso aviso-" + a.tipo}>
          <Icone nome={a.tipo === "erro" ? "alerta" : a.tipo === "ok" ? "check" : "pulso"} tam={16} />
          {a.texto}
        </div>
      ))}
    </div>
  );
}
