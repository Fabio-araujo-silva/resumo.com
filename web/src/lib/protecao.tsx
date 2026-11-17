// Proteção do conteúdo para contas de aluno. Nada disto é infalível (uma foto da tela com o celular
// sempre é possível); o objetivo é dar trabalho e deixar todo vazamento com o nome de quem vazou:
//   - marca d'água com nome + código da conta + data, em toda a tela (e ela volta se for removida);
//   - sem selecionar, copiar, arrastar, menu do botão direito, imprimir ou salvar a página;
//   - a tela é coberta quando a janela perde o foco e quando a tecla PrintScreen é apertada.
import { useEffect, useRef } from "react";
import type { Usuario } from "./api";

const editavel = (alvo: EventTarget | null) => alvo instanceof HTMLElement && !!alvo.closest("input, textarea, [contenteditable=true]");

export function ativarProtecao(desfocar: boolean): () => void {
  const corpo = document.body;
  corpo.classList.add("protegido");
  let relogio = 0;
  const cobrir = (ms: number) => {
    corpo.classList.add("coberto");
    clearTimeout(relogio);
    relogio = window.setTimeout(() => corpo.classList.remove("coberto"), ms);
  };
  const barrar = (e: Event) => {
    if (!editavel(e.target)) e.preventDefault();
  };
  const tecla = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (k === "printscreen") {
      cobrir(2500);
      navigator.clipboard?.writeText("").catch(() => {});
      return;
    }
    const bloqueada =
      (ctrl && ["p", "s", "u"].includes(k)) ||
      (ctrl && e.shiftKey && ["i", "j", "c", "s"].includes(k)) ||
      k === "f12" ||
      (ctrl && ["c", "x", "a"].includes(k) && !editavel(e.target));
    if (bloqueada) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const perdeuFoco = () => desfocar && corpo.classList.add("sem-foco");
  const ganhouFoco = () => corpo.classList.remove("sem-foco");
  const visibilidade = () => (document.hidden ? perdeuFoco() : ganhouFoco());
  const imprimir = () => cobrir(4000);

  const eventos: [EventTarget, string, EventListener, boolean?][] = [
    [document, "contextmenu", barrar],
    [document, "copy", barrar],
    [document, "cut", barrar],
    [document, "dragstart", barrar],
    [document, "selectstart", barrar],
    [document, "keydown", tecla as EventListener, true],
    [document, "keyup", tecla as EventListener, true],
    [window, "blur", perdeuFoco],
    [window, "focus", ganhouFoco],
    [document, "visibilitychange", visibilidade],
    [window, "beforeprint", imprimir],
  ];
  for (const [alvo, nome, f, captura] of eventos) alvo.addEventListener(nome, f, captura);
  return () => {
    for (const [alvo, nome, f, captura] of eventos) alvo.removeEventListener(nome, f, captura);
    clearTimeout(relogio);
    corpo.classList.remove("protegido", "sem-foco", "coberto");
  };
}

function desenharAzulejo(linhas: string[], claro: boolean): string {
  const c = document.createElement("canvas");
  const escala = Math.min(2, window.devicePixelRatio || 1);
  const L = 380;
  const A = 230;
  c.width = L * escala;
  c.height = A * escala;
  const g = c.getContext("2d");
  if (!g) return "";
  g.scale(escala, escala);
  g.translate(L / 2, A / 2);
  g.rotate((-24 * Math.PI) / 180);
  g.textAlign = "center";
  g.fillStyle = claro ? "rgba(15, 35, 50, 0.085)" : "rgba(220, 240, 250, 0.07)";
  g.font = "600 14px Inter, system-ui, sans-serif";
  g.fillText(linhas[0], 0, -8);
  g.font = "500 11.5px Inter, system-ui, sans-serif";
  g.fillText(linhas[1], 0, 10);
  return c.toDataURL("image/png");
}

// Marca d'água visível. Fica fora da árvore do React de propósito: se alguém apagar o elemento pelo
// inspetor, um observador o recoloca.
export function MarcaDagua({ usuario, tema }: { usuario: Usuario; tema: string }) {
  const el = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const criar = () => {
      const d = document.createElement("div");
      d.className = "marca-dagua";
      d.setAttribute("aria-hidden", "true");
      d.dataset.conta = usuario.etiqueta;
      const agora = new Date();
      const data = agora.toLocaleDateString("pt-BR") + " " + agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const img = desenharAzulejo([usuario.nome + " · " + usuario.email, `conta ${usuario.etiqueta} · ${data}`], tema === "light");
      d.style.cssText = `position:fixed;inset:0;z-index:2147483000;pointer-events:none;background-image:url(${img});background-size:380px 230px;`;
      return d;
    };
    const adulterada = (d: HTMLDivElement) =>
      !d.isConnected || d.hidden || d.className !== "marca-dagua" || d.style.display === "none" || d.style.visibility === "hidden" || d.style.opacity === "0" || !d.style.backgroundImage || d.style.position !== "fixed";
    // vigia o próprio elemento (estilo, classe, atributos) e o <body> (se ele for arrancado)
    const atrib = new MutationObserver(() => el.current && adulterada(el.current) && por());
    const obs = new MutationObserver(() => (!el.current || adulterada(el.current)) && por());
    function por() {
      atrib.disconnect();
      el.current?.remove();
      el.current = criar();
      document.body.appendChild(el.current);
      atrib.observe(el.current, { attributes: true });
    }
    por();
    obs.observe(document.body, { childList: true });
    const relogio = window.setInterval(por, 60000); // renova a data e a hora
    return () => {
      obs.disconnect();
      atrib.disconnect();
      clearInterval(relogio);
      el.current?.remove();
      el.current = null;
    };
  }, [usuario, tema]);
  return null;
}
