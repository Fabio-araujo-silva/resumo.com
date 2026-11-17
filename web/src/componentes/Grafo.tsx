// Grafo das notas atômicas (como a visão de grafo do Obsidian), desenhado num canvas.
// Simulação de forças simples: os nós se repelem, as ligações puxam, cada grupo tem seu centro.
// Nota lida = bolinha cheia; não lida = anel; conteúdo de prova = anel âmbar; nota-mapa = nó maior.
import { useEffect, useRef } from "react";
import { Icone } from "./Icone";

export type NoGrafo = { id: string; titulo: string; cor: string; grupo: string; prova: boolean; mapa: boolean; lida: boolean };
type Ponto = NoGrafo & { x: number; y: number; vx: number; vy: number; r: number; grau: number; fixo: boolean };
type Props = {
  nos: NoGrafo[];
  arestas: [string, string][];
  selecionado: string | null;
  aoSelecionar: (id: string | null) => void;
  aoAbrir: (id: string) => void;
  tema: string;
  realce?: Set<string> | null; // resultado da busca: o resto esmaece
};

const semente = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};
const cortar = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export function Grafo({ nos, arestas, selecionado, aoSelecionar, aoAbrir, tema, realce }: Props) {
  const tela = useRef<HTMLCanvasElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const estado = useRef({
    pontos: [] as Ponto[],
    porId: new Map<string, Ponto>(),
    vizinhos: new Map<string, Set<string>>(),
    arestas: [] as [Ponto, Ponto][],
    centros: new Map<string, { x: number; y: number }>(),
    vista: { x: 0, y: 0, k: 1 },
    alfa: 1,
    sobre: null as string | null,
    larg: 800,
    alt: 600,
    quadro: 0,
    cores: { texto: "#fff", suave: "#999", linha: "#444", acento: "#2fc4b2", ambar: "#f0b85a", fundo: "#000" },
    ajustado: false,
    mexeu: false, // o aluno já moveu ou aproximou a vista: não reenquadrar sozinho
  });
  const props = useRef({ selecionado, aoSelecionar, aoAbrir, realce });
  props.current = { selecionado, aoSelecionar, aoAbrir, realce };

  // ---------- desenho ----------
  const desenhar = () => {
    const c = tela.current;
    const e = estado.current;
    if (!c) return;
    const g = c.getContext("2d");
    if (!g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, e.larg, e.alt);
    g.translate(e.larg / 2 + e.vista.x, e.alt / 2 + e.vista.y);
    g.scale(e.vista.k, e.vista.k);
    const k = e.vista.k;
    const gordo = 1 / Math.sqrt(Math.min(1, k));
    const foco = e.sobre || props.current.selecionado;
    const perto = foco ? e.vizinhos.get(foco) : null;
    const real = props.current.realce;
    const apagado = (p: Ponto) => (foco ? p.id !== foco && !perto?.has(p.id) : real ? !real.has(p.id) : false);

    g.lineCap = "round";
    for (const [a, b] of e.arestas) {
      const viva = foco && (a.id === foco || b.id === foco);
      g.globalAlpha = viva ? 0.9 : apagado(a) || apagado(b) ? 0.07 : 0.3;
      g.strokeStyle = viva ? e.cores.acento : e.cores.linha;
      g.lineWidth = (viva ? 1.7 : 1) / k;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    for (const p of e.pontos) {
      const fraco = apagado(p);
      g.globalAlpha = fraco ? 0.2 : 1;
      if (p.prova) {
        g.strokeStyle = e.cores.ambar;
        g.lineWidth = 1.6 / k;
        g.beginPath();
        g.arc(p.x, p.y, p.r * gordo + 3.2 / k, 0, Math.PI * 2);
        g.stroke();
      }
      g.beginPath();
      g.arc(p.x, p.y, p.r * gordo, 0, Math.PI * 2);
      g.fillStyle = e.cores.fundo;
      g.fill();
      g.globalAlpha = (fraco ? 0.2 : 1) * (p.lida || p.mapa ? 1 : 0.42);
      g.fillStyle = p.cor;
      g.fill();
      g.globalAlpha = fraco ? 0.2 : 1;
      g.strokeStyle = p.cor;
      g.lineWidth = 1.5 / k;
      g.stroke();
      if (p.id === props.current.selecionado || p.id === e.sobre) {
        g.strokeStyle = e.cores.texto;
        g.lineWidth = 2 / k;
        g.beginPath();
        g.arc(p.x, p.y, p.r * gordo + (p.prova ? 6.5 : 3.5) / k, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // rótulos: sempre nos mapas e no foco; nos demais, só com zoom suficiente
    g.textAlign = "center";
    g.textBaseline = "top";
    for (const p of e.pontos) {
      const emFoco = foco && (p.id === foco || perto?.has(p.id));
      const noRealce = real && real.has(p.id) && real.size <= 14;
      if (!(emFoco || noRealce || p.mapa || k > 1.05)) continue;
      if (apagado(p)) continue;
      const forte = p.id === foco || p.mapa;
      g.globalAlpha = emFoco || noRealce ? 1 : p.mapa ? 0.92 : Math.min(1, (k - 1.05) * 3);
      g.font = `${forte ? 600 : 500} ${(forte ? 12 : 11) / k}px "Inter Variable", Inter, system-ui, sans-serif`;
      g.fillStyle = forte ? e.cores.texto : e.cores.suave;
      g.fillText(cortar(p.mapa ? p.titulo.replace(/^Mapa\s*[-–—:]\s*/i, "") : p.titulo, 36), p.x, p.y + p.r * gordo + 5 / k);
    }
    g.globalAlpha = 1;
  };

  // ---------- simulação ----------
  const passo = () => {
    const e = estado.current;
    const ps = e.pontos;
    const n = ps.length;
    for (let i = 0; i < n; i++) {
      const a = ps[i];
      for (let j = i + 1; j < n; j++) {
        const b = ps[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = semente(a.id) - 0.5;
          dy = semente(b.id) - 0.5;
          d2 = 1;
        }
        if (d2 > 150000) continue;
        const f = 3000 / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }
    for (const [a, b] of e.arestas) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const alvo = a.mapa || b.mapa ? 96 : 70;
      const f = (d - alvo) * 0.02;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
    for (const p of ps) {
      const c = e.centros.get(p.grupo) || { x: 0, y: 0 };
      p.vx += (c.x - p.x) * 0.009 - p.x * 0.0012;
      p.vy += (c.y - p.y) * 0.009 - p.y * 0.0012;
      p.vx *= 0.78;
      p.vy *= 0.78;
      if (!p.fixo) {
        p.x += p.vx * e.alfa;
        p.y += p.vy * e.alfa;
      }
    }
    e.alfa *= 0.988;
  };

  const ajustar = () => {
    const e = estado.current;
    if (!e.pontos.length) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of e.pontos) {
      x0 = Math.min(x0, p.x - p.r);
      x1 = Math.max(x1, p.x + p.r);
      y0 = Math.min(y0, p.y - p.r);
      y1 = Math.max(y1, p.y + p.r + 16);
    }
    const k = Math.max(0.3, Math.min(1.7, Math.min((e.larg - 70) / Math.max(60, x1 - x0), (e.alt - 70) / Math.max(60, y1 - y0))));
    e.vista = { k, x: (-(x0 + x1) / 2) * k, y: (-(y0 + y1) / 2) * k };
  };

  const animar = () => {
    const e = estado.current;
    cancelAnimationFrame(e.quadro);
    const laco = () => {
      if (e.alfa > 0.03) {
        passo();
        if (e.alfa > 0.5) passo();
        if (!e.mexeu) {
          ajustar();
          e.ajustado = true;
        }
      }
      desenhar();
      if (e.alfa > 0.03) e.quadro = requestAnimationFrame(laco);
    };
    e.quadro = requestAnimationFrame(laco);
  };

  // ---------- dados ----------
  useEffect(() => {
    const e = estado.current;
    const antigos = e.porId;
    const grupos = [...new Set(nos.map((n) => n.grupo))];
    // os grupos (matérias ou módulos) ficam em volta de uma elipse deitada, que aproveita a tela larga
    const raio = grupos.length > 1 ? 60 + 20 * Math.sqrt(nos.length) : 0;
    e.centros = new Map(grupos.map((g, i) => [g, { x: Math.cos(Math.PI + (i / grupos.length) * Math.PI * 2) * raio * 1.5, y: Math.sin(Math.PI + (i / grupos.length) * Math.PI * 2) * raio * 0.8 }]));
    const grau = new Map<string, number>();
    const ids = new Set(nos.map((n) => n.id));
    const validas = arestas.filter(([a, b]) => ids.has(a) && ids.has(b));
    for (const [a, b] of validas) {
      grau.set(a, (grau.get(a) || 0) + 1);
      grau.set(b, (grau.get(b) || 0) + 1);
    }
    let novos = 0;
    e.pontos = nos.map((n) => {
      const velho = antigos.get(n.id);
      const gr = grau.get(n.id) || 0;
      const r = (n.mapa ? 8.5 : 4.8) + Math.min(5.5, gr * 0.55);
      if (velho) return { ...velho, ...n, r, grau: gr };
      novos++;
      const c = e.centros.get(n.grupo) || { x: 0, y: 0 };
      const ang = semente(n.id) * Math.PI * 2;
      const dist = 30 + semente(n.id + "r") * 120;
      return { ...n, x: c.x + Math.cos(ang) * dist, y: c.y + Math.sin(ang) * dist, vx: 0, vy: 0, r, grau: gr, fixo: false };
    });
    e.porId = new Map(e.pontos.map((p) => [p.id, p]));
    e.arestas = validas.map(([a, b]) => [e.porId.get(a)!, e.porId.get(b)!]);
    e.vizinhos = new Map();
    for (const [a, b] of validas) {
      if (!e.vizinhos.has(a)) e.vizinhos.set(a, new Set());
      if (!e.vizinhos.has(b)) e.vizinhos.set(b, new Set());
      e.vizinhos.get(a)!.add(b);
      e.vizinhos.get(b)!.add(a);
    }
    if (novos || e.pontos.length !== antigos.size) {
      // conjunto mudou: acomoda antes de mostrar, e enquadra
      e.alfa = 1;
      for (let i = 0; i < 240; i++) passo();
      e.alfa = 0.35;
      e.ajustado = false;
      e.mexeu = false;
    }
    animar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nos, arestas]);

  useEffect(() => {
    const s = getComputedStyle(document.documentElement);
    const v = (n: string) => s.getPropertyValue(n).trim();
    estado.current.cores = { texto: v("--texto"), suave: v("--suave"), linha: v("--linha-forte"), acento: v("--acento"), ambar: v("--ambar"), fundo: v("--painel") };
    desenhar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tema]);

  useEffect(() => {
    desenhar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionado, realce]);

  // ---------- tamanho e interação ----------
  useEffect(() => {
    const c = tela.current!;
    const cx = caixa.current!;
    const e = estado.current;
    const medir = () => {
      const r = cx.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      e.larg = Math.max(200, r.width);
      e.alt = Math.max(200, r.height);
      c.width = Math.round(e.larg * dpr);
      c.height = Math.round(e.alt * dpr);
      c.style.width = e.larg + "px";
      c.style.height = e.alt + "px";
      if (!e.ajustado) ajustar();
      desenhar();
    };
    const obs = new ResizeObserver(medir);
    obs.observe(cx);
    medir();

    const mundo = (ev: { clientX: number; clientY: number }) => {
      const r = c.getBoundingClientRect();
      return { x: (ev.clientX - r.left - e.larg / 2 - e.vista.x) / e.vista.k, y: (ev.clientY - r.top - e.alt / 2 - e.vista.y) / e.vista.k };
    };
    const acertar = (ev: { clientX: number; clientY: number }) => {
      const m = mundo(ev);
      let melhor: Ponto | null = null;
      let dist = Infinity;
      for (const p of e.pontos) {
        const d = Math.hypot(p.x - m.x, p.y - m.y) - p.r / Math.sqrt(Math.min(1, e.vista.k));
        if (d < 7 / e.vista.k && d < dist) {
          dist = d;
          melhor = p;
        }
      }
      return melhor;
    };
    const dedos = new Map<number, { x: number; y: number }>();
    let arrasto: { ponto: Ponto | null; x: number; y: number; moveu: boolean; vx: number; vy: number } | null = null;
    let pinca = 0;

    const baixo = (ev: PointerEvent) => {
      c.setPointerCapture(ev.pointerId);
      dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (dedos.size === 2) {
        const [a, b] = [...dedos.values()];
        pinca = Math.hypot(a.x - b.x, a.y - b.y);
        arrasto = null;
        return;
      }
      const p = acertar(ev);
      arrasto = { ponto: p, x: ev.clientX, y: ev.clientY, moveu: false, vx: e.vista.x, vy: e.vista.y };
      if (p) p.fixo = true;
    };
    const mover = (ev: PointerEvent) => {
      if (dedos.has(ev.pointerId)) dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (dedos.size === 2 && pinca) {
        const [a, b] = [...dedos.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        e.vista.k = Math.max(0.25, Math.min(4, e.vista.k * (d / pinca)));
        e.mexeu = true;
        pinca = d;
        desenhar();
        return;
      }
      if (!arrasto) {
        const p = acertar(ev);
        const id = p ? p.id : null;
        if (id !== e.sobre) {
          e.sobre = id;
          c.style.cursor = id ? "pointer" : "grab";
          desenhar();
        }
        return;
      }
      const dx = ev.clientX - arrasto.x;
      const dy = ev.clientY - arrasto.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) arrasto.moveu = true;
      if (!arrasto.moveu) return;
      e.mexeu = true;
      if (arrasto.ponto) {
        const m = mundo(ev);
        arrasto.ponto.x = m.x;
        arrasto.ponto.y = m.y;
        if (e.alfa < 0.25) {
          e.alfa = 0.25;
          animar();
        }
      } else {
        e.vista.x = arrasto.vx + dx;
        e.vista.y = arrasto.vy + dy;
        c.style.cursor = "grabbing";
      }
      desenhar();
    };
    const cima = (ev: PointerEvent) => {
      dedos.delete(ev.pointerId);
      pinca = 0;
      if (!arrasto) return;
      const a = arrasto;
      arrasto = null;
      if (a.ponto) a.ponto.fixo = false;
      c.style.cursor = e.sobre ? "pointer" : "grab";
      if (!a.moveu) props.current.aoSelecionar(a.ponto ? a.ponto.id : null);
    };
    const duplo = (ev: MouseEvent) => {
      const p = acertar(ev);
      if (p) props.current.aoAbrir(p.id);
    };
    const roda = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = c.getBoundingClientRect();
      const px = ev.clientX - r.left - e.larg / 2;
      const py = ev.clientY - r.top - e.alt / 2;
      const k = Math.max(0.25, Math.min(4, e.vista.k * Math.exp(-ev.deltaY * 0.0016)));
      e.vista.x = px - ((px - e.vista.x) / e.vista.k) * k;
      e.vista.y = py - ((py - e.vista.y) / e.vista.k) * k;
      e.vista.k = k;
      e.mexeu = true;
      desenhar();
    };
    const saiu = () => {
      if (e.sobre) {
        e.sobre = null;
        desenhar();
      }
    };
    c.addEventListener("pointerdown", baixo);
    c.addEventListener("pointermove", mover);
    c.addEventListener("pointerup", cima);
    c.addEventListener("pointercancel", cima);
    c.addEventListener("pointerleave", saiu);
    c.addEventListener("dblclick", duplo);
    c.addEventListener("wheel", roda, { passive: false });
    // para os testes automatizados: onde cada nó está na tela
    (window as unknown as Record<string, unknown>).__grafo = {
      pontos: () => {
        const r = c.getBoundingClientRect();
        return e.pontos.map((p) => ({ id: p.id, x: r.left + e.larg / 2 + e.vista.x + p.x * e.vista.k, y: r.top + e.alt / 2 + e.vista.y + p.y * e.vista.k }));
      },
    };
    return () => {
      obs.disconnect();
      cancelAnimationFrame(e.quadro);
      c.removeEventListener("pointerdown", baixo);
      c.removeEventListener("pointermove", mover);
      c.removeEventListener("pointerup", cima);
      c.removeEventListener("pointercancel", cima);
      c.removeEventListener("pointerleave", saiu);
      c.removeEventListener("dblclick", duplo);
      c.removeEventListener("wheel", roda);
      delete (window as unknown as Record<string, unknown>).__grafo;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoom = (f: number) => {
    const e = estado.current;
    const k = Math.max(0.25, Math.min(4, e.vista.k * f));
    e.vista.x = (e.vista.x / e.vista.k) * k;
    e.vista.y = (e.vista.y / e.vista.k) * k;
    e.vista.k = k;
    e.mexeu = true;
    desenhar();
  };

  return (
    <div className="grafo" ref={caixa}>
      <canvas ref={tela} aria-label="Grafo das notas e suas ligações" role="img" />
      <div className="grafo-controles">
        <button type="button" onClick={() => zoom(1.3)} title="Aproximar" aria-label="Aproximar">+</button>
        <button type="button" onClick={() => zoom(1 / 1.3)} title="Afastar" aria-label="Afastar">−</button>
        <button type="button" onClick={() => { estado.current.mexeu = false; ajustar(); desenhar(); }} title="Enquadrar tudo" aria-label="Enquadrar tudo">
          <Icone nome="foco" tam={15} />
        </button>
      </div>
      <div className="grafo-legenda">
        <span><i className="bola cheia" /> lida</span>
        <span><i className="bola" /> não lida</span>
        <span><i className="bola prova" /> prova</span>
        <span><i className="bola mapa" /> mapa do módulo</span>
      </div>
    </div>
  );
}
