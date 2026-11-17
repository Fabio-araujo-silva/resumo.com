// Markdown das notas atômicas -> HTML. Mesmas convenções do Mathsidian/Obsidian:
//   - callouts:   > [!definicao] Título        (tipos em CALLOUTS)
//   - links:      [[Outra nota]]  ou  [[Outra nota|texto]]
//   - destaque:   ==texto==
//   - figuras:    ![legenda](anexos/arquivo.jpg)
// E dois callouts que NÃO ficam no fluxo de leitura como texto comum:
//   - > [!flashcard] Pergunta      (corpo = resposta)  -> vira carta do baralho da matéria
//   - > [!questao] Enunciado       (- [ ] / - [x] alternativas, texto depois = comentário) -> vira quiz
// HTML cru é desligado: nada do texto vira tag.
import MarkdownIt from "markdown-it";
import { slug, escHtml, semAcento } from "./util.js";

export const CALLOUTS = {
  definicao: { rotulo: "Definição", familia: "def" },
  conceito: { rotulo: "Conceito", familia: "def" },
  ideia: { rotulo: "Ideia central", familia: "ideia" },
  objetivos: { rotulo: "O que você vai aprender", familia: "ideia" },
  prova: { rotulo: "Dica de prova", familia: "prova" },
  dica: { rotulo: "Dica de prova", familia: "prova" },
  atencao: { rotulo: "Atenção", familia: "atencao" },
  cuidado: { rotulo: "Atenção", familia: "atencao" },
  pratica: { rotulo: "Na prática", familia: "pratica" },
  exemplo: { rotulo: "Exemplo", familia: "nota" },
  mnemonico: { rotulo: "Mnemônico", familia: "mnemo" },
  essencial: { rotulo: "Essencial para a prova", familia: "essencial" },
  revisao: { rotulo: "Revisão rápida", familia: "ideia" },
  nota: { rotulo: "Nota", familia: "nota" },
  info: { rotulo: "Nota", familia: "nota" },
};
const ESPECIAIS = new Set(["flashcard", "questao"]);
const normTipo = (t) => semAcento(t).toLowerCase();

const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false });
const esc = md.utils.escapeHtml;

// ---------- ==destaque== ----------
function marca(state, silent) {
  const inicio = state.pos;
  const src = state.src;
  if (src.charCodeAt(inicio) !== 0x3d || src.charCodeAt(inicio + 1) !== 0x3d) return false;
  const fim = src.indexOf("==", inicio + 2);
  if (fim < 0 || fim >= state.posMax || fim === inicio + 2) return false;
  const dentro = src.slice(inicio + 2, fim);
  if (dentro.includes("\n") || /^\s|\s$/.test(dentro)) return false;
  if (!silent) {
    state.push("mark_open", "mark", 1);
    const max = state.posMax;
    state.pos = inicio + 2;
    state.posMax = fim;
    state.md.inline.tokenize(state);
    state.posMax = max;
    state.push("mark_close", "mark", -1);
  }
  state.pos = fim + 2;
  return true;
}
md.inline.ruler.before("emphasis", "marca", marca);

// ---------- [[links]] ----------
function wikilink(state, silent) {
  const src = state.src;
  const inicio = state.pos;
  if (src.charCodeAt(inicio) !== 0x5b || src.charCodeAt(inicio + 1) !== 0x5b) return false;
  const fim = src.indexOf("]]", inicio + 2);
  if (fim < 0 || fim > state.posMax) return false;
  const dentro = src.slice(inicio + 2, fim);
  if (!dentro || dentro.includes("\n") || dentro.includes("[[")) return false;
  if (!silent) {
    const [alvo, apelido] = dentro.split("|");
    const t = state.push("wikilink", "a", 0);
    t.meta = { alvo: alvo.split("#")[0].trim(), rotulo: (apelido || alvo.split("#")[0]).trim() };
  }
  state.pos = fim + 2;
  return true;
}
md.inline.ruler.before("link", "wikilink", wikilink);
md.renderer.rules.wikilink = (tokens, idx, _o, env) => {
  const { alvo, rotulo } = tokens[idx].meta;
  const nota = env.resolver ? env.resolver(alvo) : null;
  if (!nota) return `<span class="wl-falta" title="Nota ainda não disponível">${esc(rotulo)}</span>`;
  if (env.links) env.links.add(nota.id);
  return `<a class="wl" href="/nota/${esc(nota.id)}" data-nota="${esc(nota.id)}">${esc(rotulo)}</a>`;
};

// ---------- callouts ----------
function callouts(state) {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== "blockquote_open") continue;
    const p = tokens[i + 1];
    const inline = tokens[i + 2];
    if (!p || p.type !== "paragraph_open" || !inline || inline.type !== "inline") continue;
    const m = /^\[!([\p{L}\w-]+)\]([+-]?)[ \t]*(.*)$/mu.exec(inline.content);
    if (!m || m.index !== 0) continue;
    // "> [!tipo]- Título" começa recolhido (como no Obsidian); o leitor abre e fecha com um clique
    tokens[i].meta = { callout: normTipo(m[1]), titulo: m[3].trim(), recolhido: m[2] === "-" };
    const resto = inline.content.slice(m[0].length).replace(/^\n/, "");
    inline.content = resto;
    if (!resto.trim()) {
      p.hidden = true;
      tokens[i + 3].hidden = true;
    }
  }
}
md.core.ruler.before("inline", "callouts", callouts);

md.renderer.rules.blockquote_open = (tokens, idx, _o, env) => {
  const meta = tokens[idx].meta;
  if (!meta || !meta.callout) return "<blockquote>\n";
  const def = CALLOUTS[meta.callout] || { rotulo: meta.callout.charAt(0).toUpperCase() + meta.callout.slice(1), familia: "nota" };
  const titulo = meta.titulo ? md.renderInline(meta.titulo, env) : "";
  return `<div class="callout callout-${def.familia}${meta.recolhido ? " dobrado" : ""}" data-callout="${esc(meta.callout)}"><div class="callout-cabeca"><span class="callout-rotulo">${esc(
    def.rotulo
  )}</span>${titulo ? `<span class="callout-titulo">${titulo}</span>` : ""}</div><div class="callout-corpo">\n`;
};
md.renderer.rules.blockquote_close = (tokens, idx) => {
  let prof = 0;
  for (let i = idx; i >= 0; i--) {
    if (tokens[i].type === "blockquote_close") prof++;
    else if (tokens[i].type === "blockquote_open" && --prof === 0) return tokens[i].meta && tokens[i].meta.callout ? "</div></div>\n" : "</blockquote>\n";
  }
  return "</blockquote>\n";
};

// ---------- títulos com âncora (para o sumário da nota) ----------
function ancoras(state) {
  const usados = new Map();
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "heading_open" || t.level !== 0) continue;
    const texto = (tokens[i + 1]?.content || "").replace(/[*_=`]/g, "").replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2");
    let id = "s-" + slug(texto);
    const n = usados.get(id) || 0;
    usados.set(id, n + 1);
    if (n) id += "-" + (n + 1);
    t.attrSet("id", id);
    // h1 dentro do corpo vira h2: o título da nota vem das propriedades
    if (t.tag === "h1") {
      t.tag = "h2";
      for (let j = i + 1; j < tokens.length; j++)
        if (tokens[j].type === "heading_close") {
          tokens[j].tag = "h2";
          break;
        }
    }
    if (state.env.titulos) state.env.titulos.push({ id, texto: texto.trim(), nivel: t.tag === "h2" ? 2 : 3 });
  }
}
md.core.ruler.push("ancoras", ancoras);

// ---------- figuras, tabelas e links externos ----------
export const caminhoSeguro = (c) => {
  const limpo = String(c || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");
  if (!limpo || limpo.startsWith("/") || /^[a-z]+:/i.test(limpo) || limpo.split("/").some((p) => p === ".." || p === "" || p === ".")) return null;
  return limpo;
};
const urlAnexo = (materia, caminho) => `/api/anexos/${encodeURIComponent(materia)}/${caminho.split("/").map(encodeURIComponent).join("/")}`;

md.renderer.rules.image = (tokens, idx, _o, env) => {
  const t = tokens[idx];
  let bruto = t.attrGet("src") || "";
  try {
    bruto = decodeURI(bruto);
  } catch {}
  const legenda = t.content || "";
  const caminho = caminhoSeguro(bruto);
  if (!caminho || !env.materia) return `<span class="fig-falta">[figura: ${esc(legenda || bruto)}]</span>`;
  if (env.imagens) env.imagens.add(caminho);
  return `<span class="fig"><img src="${esc(urlAnexo(env.materia, caminho))}" alt="${esc(legenda)}" loading="lazy" draggable="false">${
    legenda ? `<span class="fig-leg">${md.renderInline(legenda, { ...env, imagens: null })}</span>` : ""
  }</span>`;
};
md.renderer.rules.table_open = () => '<div class="tabela"><table>\n';
md.renderer.rules.table_close = () => "</table></div>\n";
md.renderer.rules.link_open = (tokens, idx, opts, _env, self) => {
  const href = tokens[idx].attrGet("href") || "";
  if (/^https?:/i.test(href)) {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noopener noreferrer");
  }
  return self.renderToken(tokens, idx, opts);
};

// ---------- análise: separa flashcards e questões do fluxo de leitura ----------
const RE_CALLOUT = /^\s{0,3}>\s*\[!([\p{L}\w-]+)\][+-]?[ \t]*(.*)$/u;
const RE_CITACAO = /^\s{0,3}>/;
const RE_ALT = /^[-*+]\s+\[( |x|X)\]\s+(.*)$/;
export const marcadorQuestao = (i) => `@@QUESTAO${i}@@`;

function montarFlashcard(titulo, corpo) {
  // linhas "?? ..." explicam o que a pergunta está pedindo: aparecem no "?" ao lado dela, não na resposta
  const explica = corpo.filter((l) => /^\s*\?\?/.test(l)).map((l) => l.replace(/^\s*\?\?\s*/, "").trim()).filter(Boolean).join(" ");
  const linhas = corpo.filter((l) => !/^\s*\?\?/.test(l));
  const corte = linhas.findIndex((l) => /^-{3,}\s*$/.test(l));
  let frente = titulo;
  let verso;
  if (corte >= 0) {
    frente = [titulo, linhas.slice(0, corte).join("\n").trim()].filter(Boolean).join("\n\n");
    verso = linhas.slice(corte + 1).join("\n");
  } else if (!titulo) {
    const primeira = linhas.findIndex((l) => l.trim());
    frente = primeira >= 0 ? linhas[primeira] : "";
    verso = primeira >= 0 ? linhas.slice(primeira + 1).join("\n") : "";
  } else verso = linhas.join("\n");
  return { frente: frente.trim(), verso: verso.trim(), explica };
}

function montarQuestao(titulo, corpo) {
  const enun = titulo ? [titulo] : [];
  const alternativas = [];
  const coment = [];
  let fase = 0; // 0 enunciado, 1 alternativas, 2 comentário
  for (const l of corpo) {
    const m = RE_ALT.exec(l.trim());
    if (m && fase <= 1) {
      fase = 1;
      alternativas.push({ texto: m[2].trim(), correta: m[1] !== " " });
    } else if (fase === 0) enun.push(l);
    else if (fase === 1 && /^\s+\S/.test(l) && alternativas.length) alternativas[alternativas.length - 1].texto += " " + l.trim();
    else if (fase === 1 && !l.trim()) fase = 2;
    else {
      fase = 2;
      coment.push(l);
    }
  }
  // sem alternativas: questão aberta; o corpo é a resposta
  if (!alternativas.length && titulo) return { enunciado: titulo.trim(), alternativas: [], comentario: corpo.join("\n").trim() };
  return { enunciado: enun.join("\n").trim(), alternativas, comentario: coment.join("\n").trim() };
}

// Lê o corpo de uma nota e devolve: o texto de leitura (sem flashcards, com marcadores no lugar das
// questões), as cartas, as questões e tudo o que o validador precisa conferir.
export function analisar(texto) {
  const linhas = String(texto || "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const saida = [];
  const flashcards = [];
  const questoes = [];
  const tipos = [];
  let cerca = false;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (/^\s{0,3}(```|~~~)/.test(l)) cerca = !cerca;
    const m = !cerca && RE_CALLOUT.exec(l);
    if (!m) {
      saida.push(l);
      continue;
    }
    const tipo = normTipo(m[1]);
    tipos.push(tipo);
    if (!ESPECIAIS.has(tipo)) {
      saida.push(l);
      continue;
    }
    const corpo = [];
    let j = i + 1;
    for (; j < linhas.length && RE_CITACAO.test(linhas[j]); j++) corpo.push(linhas[j].replace(/^\s{0,3}>[ \t]?/, ""));
    i = j - 1;
    if (tipo === "flashcard") flashcards.push({ ...montarFlashcard(m[2].trim(), corpo), linha: saida.length + 1 });
    else {
      questoes.push(montarQuestao(m[2].trim(), corpo));
      saida.push("", marcadorQuestao(questoes.length - 1), "");
    }
  }
  const corpo = saida
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const tudo = [corpo, ...flashcards.flatMap((f) => [f.frente, f.verso]), ...questoes.flatMap((q) => [q.enunciado, q.comentario, ...q.alternativas.map((a) => a.texto)])].join("\n");
  const alvos = [...new Set([...tudo.matchAll(/\[\[([^\[\]\n]+)\]\]/g)].map((x) => x[1].split("|")[0].split("#")[0].trim()).filter(Boolean))];
  const imagens = [
    ...new Set(
      [...tudo.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((x) => {
        try {
          return decodeURI(x[1]);
        } catch {
          return x[1];
        }
      })
    ),
  ];
  return { corpo, flashcards, questoes, tipos, alvos, imagens };
}

// Blocos de um tipo de callout (para o modo prova: "essencial" e "prova").
export function extrairCallouts(corpo, tiposQueridos) {
  const linhas = String(corpo || "").split("\n");
  const blocos = [];
  for (let i = 0; i < linhas.length; i++) {
    const m = RE_CALLOUT.exec(linhas[i]);
    if (!m) continue;
    const tipo = normTipo(m[1]);
    const dentro = [];
    let j = i + 1;
    for (; j < linhas.length && RE_CITACAO.test(linhas[j]); j++) dentro.push(linhas[j].replace(/^\s{0,3}>[ \t]?/, ""));
    i = j - 1;
    if (tiposQueridos.includes(tipo)) blocos.push({ tipo, titulo: m[2].trim(), md: dentro.join("\n").trim() });
  }
  return blocos;
}

// ---------- renderização ----------
// ctx = { materia, resolver(alvo) -> { id, titulo } | null }
export function renderTrecho(texto, ctx = {}) {
  return md.render(String(texto || ""), { materia: ctx.materia, resolver: ctx.resolver, links: ctx.links, imagens: ctx.imagens }).trim();
}
export const renderLinha = (texto, ctx = {}) => md.renderInline(String(texto || ""), { materia: ctx.materia, resolver: ctx.resolver });

export function htmlQuestao(q, ctx = {}) {
  const correta = q.alternativas.findIndex((a) => a.correta);
  const alts = q.alternativas
    .map(
      (a, i) =>
        `<li><button type="button" class="q-alt" data-i="${i}"><span class="q-letra">${String.fromCharCode(65 + i)}</span><span class="q-texto">${renderLinha(
          a.texto,
          ctx
        )}</span></button></li>`
    )
    .join("");
  const coment = q.comentario ? renderTrecho(q.comentario, ctx) : "";
  if (!q.alternativas.length)
    return `<div class="questao questao-aberta"><div class="q-rotulo">Teste-se</div><div class="q-enun">${renderTrecho(
      q.enunciado,
      ctx
    )}</div><button type="button" class="q-revelar">Ver resposta</button><div class="q-coment" hidden>${coment}</div></div>`;
  return `<div class="questao" data-correta="${correta}"><div class="q-rotulo">Teste-se</div><div class="q-enun">${renderTrecho(
    q.enunciado,
    ctx
  )}</div><ol class="q-alts">${alts}</ol><div class="q-coment" hidden>${coment}</div></div>`;
}

// Corpo de leitura (já sem flashcards) -> HTML, com as questões no lugar dos marcadores.
export function renderNota(corpo, questoes = [], ctx = {}) {
  const env = { materia: ctx.materia, resolver: ctx.resolver, links: new Set(), imagens: new Set(), titulos: [] };
  let fonte = String(corpo || "");
  if (ctx.titulo) {
    // um "# Título" repetindo o nome da nota no começo do corpo é redundante: some
    const m = /^\s*#\s+(.+)\n?/.exec(fonte);
    if (m && slug(m[1]) === slug(ctx.titulo)) fonte = fonte.slice(m[0].length);
  }
  let html = md.render(fonte, env);
  questoes.forEach((q, i) => {
    html = html.replace(`<p>${marcadorQuestao(i)}</p>`, htmlQuestao(q, env));
  });
  return { html, links: [...env.links], imagens: [...env.imagens], titulos: env.titulos };
}

// Texto corrido para a busca (sem marcação).
export function textoPuro(texto) {
  return String(texto || "")
    .replace(/@@QUESTAO\d+@@/g, " ")
    .replace(/^\s{0,3}>\s*\[![^\]]+\][+-]?/gm, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, " ")
    .replace(/[>#*_=`|~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- marca d'água invisível ----------
// Cada aluno recebe o texto com uma etiqueta de caracteres de largura zero. Se um trecho copiado
// vazar, a etiqueta diz de qual conta saiu.
const ZW0 = "​";
const ZW1 = "‌";
const ZWI = "⁠";
export function etiquetaInvisivel(hex) {
  const bits = [...hex].map((c) => parseInt(c, 16).toString(2).padStart(4, "0")).join("");
  return ZWI + [...bits].map((b) => (b === "1" ? ZW1 : ZW0)).join("") + ZWI;
}
export function marcarHtml(html, hex) {
  if (!hex) return html;
  const tag = etiquetaInvisivel(hex);
  let n = 0;
  // só em parágrafos e células: num <li> com bloco dentro, os caracteres criariam uma linha vazia
  return html.replace(/<\/(p|td)>/g, (m) => (n++ % 5 === 0 ? tag + m : m));
}
export function lerEtiquetas(texto) {
  const achadas = new Set();
  const re = new RegExp(`${ZWI}([${ZW0}${ZW1}]{8,})${ZWI}`, "g");
  for (const m of String(texto || "").matchAll(re)) {
    const bits = [...m[1]].map((c) => (c === ZW1 ? "1" : "0")).join("");
    let hex = "";
    for (let i = 0; i + 4 <= bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    achadas.add(hex);
  }
  return [...achadas];
}

export { escHtml };
