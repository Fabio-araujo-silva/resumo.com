// O texto de uma nota (HTML que vem pronto do servidor) e tudo o que nele é clicável:
//   - links entre notas: prévia ao passar o mouse; clique abre a nota ao lado, sem sair da leitura
//   - modo "Testar-se": os termos em negrito e os grifos viram lacunas; clique para revelar
//   - tabelas: clique no cabeçalho de uma coluna para escondê-la e se testar
//   - blocos (definição, dica de prova...): clique no título para recolher e abrir
//   - "Essencial": cada item vira um "já sei" que fica guardado neste aparelho
//   - listas numeradas: passo a passo com cada passo marcável
//   - questões "Teste-se" com correção na hora e placar; figuras ampliáveis
import { memo, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { useApp } from "../lib/loja";
import { ir } from "../lib/rota";

type Previa = { id: string; x: number; y: number; acima: boolean } | null;
type Props = {
  html: string;
  notaId?: string; // identifica a nota para guardar os "já sei"
  navegar?: boolean; // links levam direto à nota (nas notas-mapa); o padrão é espiar ao lado
  teste?: boolean; // modo "Testar-se" ligado
  aoContar?: (total: number, reveladas: number) => void;
};

export const espiar = (id: string) => window.dispatchEvent(new CustomEvent("resumo:espiar", { detail: id }));

const SEL_LACUNA = ":is(p, li, td, dd) :is(strong, mark)";
const dentroDe = (el: Element, seletor: string) => !!el.closest(seletor);
const lacunasDe = (raiz: HTMLElement) => [...raiz.querySelectorAll<HTMLElement>(SEL_LACUNA)].filter((e) => !dentroDe(e, ".questao, .callout-cabeca, th, a") && !e.querySelector("strong, mark") && (e.textContent || "").trim().length > 1);

// ---------- "já sei" (guardado no aparelho, por conta) ----------
const chaveSei = (conta: string) => "resumo-sei:" + conta;
function lerSei(conta: string): Record<string, 1> {
  try {
    return JSON.parse(localStorage.getItem(chaveSei(conta)) || "{}");
  } catch {
    return {};
  }
}
const marca = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};

function contarEssencial(bloco: HTMLElement) {
  const itens = bloco.querySelectorAll(".callout-corpo li");
  const sei = bloco.querySelectorAll(".callout-corpo li.sei").length;
  let conta = bloco.querySelector<HTMLElement>(".sei-conta");
  if (!conta) {
    conta = document.createElement("span");
    conta.className = "sei-conta";
    bloco.querySelector(".callout-cabeca")?.appendChild(conta);
  }
  conta.textContent = itens.length ? `${sei}/${itens.length} já sei` : "";
  bloco.classList.toggle("dominado", itens.length > 0 && sei === itens.length);
}

function contarPassos(lista: HTMLElement) {
  const itens = lista.querySelectorAll(":scope > li");
  const feitos = lista.querySelectorAll(":scope > li.feito").length;
  const barra = lista.previousElementSibling;
  if (barra?.classList.contains("passos-barra")) {
    barra.querySelector("b")!.textContent = `${feitos}/${itens.length}`;
    barra.querySelector<HTMLElement>("i")!.style.width = (itens.length ? (feitos / itens.length) * 100 : 0) + "%";
    barra.classList.toggle("completa", feitos === itens.length);
  }
}

// Prepara o HTML recém-inserido: marca o que é interativo e restaura o que o aluno já marcou.
function preparar(raiz: HTMLElement, notaId: string | undefined, conta: string) {
  for (const lista of raiz.querySelectorAll<HTMLElement>("ol:not(.q-alts)")) {
    if (lista.children.length < 3 || dentroDe(lista, ".questao, li")) continue;
    lista.classList.add("passos");
    const barra = document.createElement("div");
    barra.className = "passos-barra";
    barra.innerHTML = '<span>Passo a passo</span><span class="passos-trilho"><i></i></span><b></b>';
    lista.before(barra);
    contarPassos(lista);
  }
  for (const t of raiz.querySelectorAll<HTMLElement>("table")) {
    const cabecas = t.querySelectorAll<HTMLElement>("thead th");
    if (cabecas.length < 2 || t.querySelectorAll("tbody tr").length < 2) continue;
    t.classList.add("interativa");
    cabecas.forEach((th, i) => {
      if (i === 0) return;
      th.setAttribute("role", "button");
      th.setAttribute("tabindex", "0");
      th.title = "Esconder esta coluna para se testar";
    });
  }
  for (const c of raiz.querySelectorAll<HTMLElement>(".callout")) {
    const cab = c.querySelector<HTMLElement>(".callout-cabeca");
    cab?.setAttribute("role", "button");
    cab?.setAttribute("tabindex", "0");
    cab?.setAttribute("aria-expanded", String(!c.classList.contains("dobrado")));
  }
  const sei = lerSei(conta);
  for (const bloco of raiz.querySelectorAll<HTMLElement>(".callout-essencial")) {
    bloco.querySelectorAll<HTMLElement>(".callout-corpo li").forEach((li) => {
      li.dataset.sei = marca((notaId || "") + "|" + (li.textContent || "").trim());
      li.classList.toggle("sei", !!sei[li.dataset.sei]);
      li.setAttribute("role", "checkbox");
      li.setAttribute("aria-checked", String(!!sei[li.dataset.sei]));
    });
    contarEssencial(bloco);
  }
}

function responder(botao: HTMLElement) {
  const q = botao.closest<HTMLElement>(".questao");
  if (!q || q.dataset.resp != null) return;
  const escolhida = Number(botao.dataset.i);
  const correta = Number(q.dataset.correta);
  q.dataset.resp = String(escolhida);
  q.classList.add(escolhida === correta ? "acertou" : "errou");
  q.querySelectorAll<HTMLElement>(".q-alt").forEach((b) => {
    const i = Number(b.dataset.i);
    if (i === correta) b.classList.add("certa");
    else if (i === escolhida) b.classList.add("errada");
    b.setAttribute("disabled", "");
  });
  q.querySelector<HTMLElement>(".q-coment")?.removeAttribute("hidden");
}

function alternarColuna(th: HTMLElement) {
  const tabela = th.closest("table");
  if (!tabela) return;
  const i = [...th.parentElement!.children].indexOf(th);
  const esconder = !th.classList.contains("oculta");
  th.classList.toggle("oculta", esconder);
  th.title = esconder ? "Mostrar a coluna" : "Esconder esta coluna para se testar";
  tabela.querySelectorAll<HTMLElement>(`tbody tr > :nth-child(${i + 1})`).forEach((td) => td.classList.toggle("col-oculta", esconder));
}

const Html = memo(function Html({ html }: { html: string }) {
  return <div className="prosa" dangerouslySetInnerHTML={{ __html: html }} />;
});

export function ConteudoNota({ html, notaId, navegar, teste, aoContar }: Props) {
  const { idx, usuario } = useApp();
  const caixa = useRef<HTMLDivElement>(null);
  const [previa, setPrevia] = useState<Previa>(null);
  const [figura, setFigura] = useState<{ src: string; legenda: string } | null>(null);
  const [placar, setPlacar] = useState<{ certas: number; total: number } | null>(null);
  const relogio = useRef(0);
  const conta = usuario?.id || "";
  const contar = useRef(aoContar);
  contar.current = aoContar;

  const recontar = () => {
    const raiz = caixa.current?.querySelector<HTMLElement>(".prosa");
    if (!raiz) return;
    const todas = lacunasDe(raiz);
    contar.current?.(todas.length, todas.filter((e) => e.classList.contains("revelada")).length);
  };

  useLayoutEffect(() => {
    const raiz = caixa.current?.querySelector<HTMLElement>(".prosa");
    if (!raiz) return;
    preparar(raiz, notaId, conta);
    setPlacar(null);
    recontar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, notaId, conta]);

  // ao entrar no modo teste, todas as lacunas voltam a ficar fechadas
  useLayoutEffect(() => {
    const raiz = caixa.current?.querySelector<HTMLElement>(".prosa");
    if (!raiz) return;
    if (teste) lacunasDe(raiz).forEach((e) => {
      e.classList.add("lacuna");
      e.classList.remove("revelada");
    });
    else raiz.querySelectorAll(".lacuna").forEach((e) => e.classList.remove("lacuna", "revelada"));
    recontar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teste, html]);

  const atualizarPlacar = () => {
    const qs = [...(caixa.current?.querySelectorAll<HTMLElement>(".questao[data-correta]") || [])];
    if (qs.length < 2 || qs.some((q) => q.dataset.resp == null)) return setPlacar(null);
    setPlacar({ certas: qs.filter((q) => q.classList.contains("acertou")).length, total: qs.length });
  };
  const refazer = () => {
    caixa.current?.querySelectorAll<HTMLElement>(".questao").forEach((q) => {
      delete q.dataset.resp;
      q.classList.remove("acertou", "errou");
      q.querySelectorAll(".q-alt").forEach((b) => {
        b.classList.remove("certa", "errada");
        b.removeAttribute("disabled");
      });
      q.querySelector(".q-coment")?.setAttribute("hidden", "");
    });
    setPlacar(null);
    caixa.current?.querySelector(".questao")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const clique = (e: MouseEvent<HTMLDivElement>) => {
    const alvo = e.target as HTMLElement;
    const link = alvo.closest<HTMLAnchorElement>("a");
    if (link) {
      if (!link.classList.contains("wl")) return; // link externo: comportamento normal
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      setPrevia(null);
      if (navegar) ir(link.getAttribute("href") || "/");
      else espiar(link.dataset.nota || "");
      return;
    }
    const alt = alvo.closest<HTMLElement>(".q-alt");
    if (alt) {
      responder(alt);
      return atualizarPlacar();
    }
    const revelar = alvo.closest<HTMLElement>(".q-revelar");
    if (revelar) {
      revelar.parentElement?.querySelector<HTMLElement>(".q-coment")?.removeAttribute("hidden");
      revelar.remove();
      return;
    }
    const lacuna = alvo.closest<HTMLElement>(".lacuna:not(.revelada)");
    if (lacuna) {
      lacuna.classList.add("revelada");
      return recontar();
    }
    const celula = alvo.closest<HTMLElement>("td.col-oculta");
    if (celula) return celula.classList.remove("col-oculta");
    const th = alvo.closest<HTMLElement>("table.interativa thead th[role=button]");
    if (th) return alternarColuna(th);
    const cab = alvo.closest<HTMLElement>(".callout-cabeca");
    if (cab) {
      const bloco = cab.parentElement!;
      const fechado = bloco.classList.toggle("dobrado");
      cab.setAttribute("aria-expanded", String(!fechado));
      return;
    }
    const item = alvo.closest<HTMLElement>(".callout-essencial .callout-corpo li");
    if (item && item.dataset.sei) {
      const ligado = item.classList.toggle("sei");
      item.setAttribute("aria-checked", String(ligado));
      const sei = lerSei(conta);
      if (ligado) sei[item.dataset.sei] = 1;
      else delete sei[item.dataset.sei];
      try {
        localStorage.setItem(chaveSei(conta), JSON.stringify(sei));
      } catch {}
      contarEssencial(item.closest<HTMLElement>(".callout-essencial")!);
      return;
    }
    const passo = alvo.closest<HTMLElement>("ol.passos > li");
    if (passo) {
      passo.classList.toggle("feito");
      return contarPassos(passo.parentElement as HTMLElement);
    }
    const fig = alvo.closest<HTMLElement>(".fig");
    const img = fig?.querySelector("img");
    if (img) setFigura({ src: img.src, legenda: fig?.querySelector(".fig-leg")?.textContent || "" });
  };

  // Enter/espaço fazem o mesmo que o clique nos elementos que ganharam role=button
  const tecla = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const alvo = e.target as HTMLElement;
    if ((e.key === "Enter" || e.key === " ") && alvo.matches("[role=button], [role=checkbox]")) {
      e.preventDefault();
      alvo.click();
    }
  };

  const sobre = (e: MouseEvent<HTMLDivElement>) => {
    const link = (e.target as HTMLElement).closest<HTMLElement>("a.wl");
    clearTimeout(relogio.current);
    if (!link) return setPrevia(null);
    const id = link.dataset.nota || "";
    const r = link.getBoundingClientRect();
    const acima = r.bottom + 190 > window.innerHeight;
    relogio.current = window.setTimeout(() => setPrevia({ id, x: Math.min(Math.max(12, r.left), window.innerWidth - 332), y: acima ? r.top - 8 : r.bottom + 8, acima }), 180);
  };
  const saiu = () => {
    clearTimeout(relogio.current);
    setPrevia(null);
  };

  const alvoPrevia = previa ? idx.nota.get(previa.id) : null;
  return (
    <div ref={caixa} className={"conteudo-nota" + (teste ? " em-teste" : "")} onClick={clique} onKeyDown={tecla} onMouseOver={sobre} onMouseLeave={saiu}>
      <Html html={html} />
      {placar && (
        <div className={"placar" + (placar.certas === placar.total ? " cheio" : "")} data-testid="placar">
          <strong>{placar.certas} de {placar.total}</strong>
          <span>{placar.certas === placar.total ? "Gabaritou as questões desta nota." : "questões certas. Releia o comentário das que errou."}</span>
          <button type="button" className="botao pequeno fantasma" onClick={refazer}>Refazer</button>
        </div>
      )}
      {previa && alvoPrevia && (
        <div className={"previa-link" + (previa.acima ? " acima" : "")} style={{ left: previa.x, top: previa.y }} role="tooltip">
          <span className="rotulo">{idx.materia.get(alvoPrevia.materia)?.nome} · {idx.modulo.get(alvoPrevia.modulo)?.titulo}</span>
          <strong>{alvoPrevia.titulo}</strong>
          <p>{alvoPrevia.resumo}</p>
          <small>{navegar ? "Clique para abrir" : "Clique para espiar ao lado"}</small>
        </div>
      )}
      {figura && (
        <div className="lightbox" onClick={() => setFigura(null)} role="dialog" aria-label="Figura ampliada">
          <img src={figura.src} alt={figura.legenda} draggable={false} />
          {figura.legenda && <p>{figura.legenda}</p>}
        </div>
      )}
    </div>
  );
}
