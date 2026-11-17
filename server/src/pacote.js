// Pacote resumo.com: o formato universal de entrada de conteúdo (especificação em FORMATO.md).
// Um pacote é uma pasta (ou o .zip dela) com:
//   materia.yml                      dados da matéria
//   <NN - Módulo>/<Nota>.md          notas atômicas (propriedades YAML + Markdown)
//   anexos/...                       figuras e PDFs
// Este arquivo só LÊ e VALIDA. Quem grava no banco é importar.js.
import fs from "node:fs";
import path from "node:path";
import { unzipSync, zipSync, strToU8 } from "fflate";
import YAML from "yaml";
import { analisar, CALLOUTS, caminhoSeguro } from "./markdown.js";
import { slug, contarPalavras, mimeDe, EXT_IMAGEM } from "./util.js";

export const LIMITES = {
  palavrasAviso: 650, // acima disso a nota já não é "atômica"
  palavrasErro: 1300,
  palavrasMinimo: 40,
  resumoMax: 240,
  imagemMaxBytes: 4 * 1024 * 1024,
  pdfMaxBytes: 60 * 1024 * 1024,
};
export const AVALIACOES = ["n1", "n2"];
const normAv = (v) => String(v ?? "").trim().toLowerCase();
const PRIORIDADES = { alta: 1, media: 2, média: 2, baixa: 3 };
const PASTA_ANEXOS = /^(anexos|assets|imagens|figuras)$/i;
const IGNORAR = /(^|\/)(\.[^/]+|_[^/]*|node_modules|README\.md|FORMATO\.md|PEDIDO\.md)(\/|$)/i;

// ---------- leitura ----------
export function lerPasta(dir) {
  const arquivos = new Map();
  const andar = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? rel + "/" + e.name : e.name;
      if (e.isDirectory()) andar(path.join(abs, e.name), r);
      else if (e.isFile()) arquivos.set(r, fs.readFileSync(path.join(abs, e.name)));
    }
  };
  andar(dir, "");
  return arquivos;
}

export function lerZip(buffer) {
  let entradas;
  try {
    entradas = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new Error("o arquivo não é um .zip válido");
  }
  const arquivos = new Map();
  for (const [nome, bytes] of Object.entries(entradas)) {
    const limpo = nome.replace(/\\/g, "/");
    if (limpo.endsWith("/") || limpo.startsWith("__MACOSX/")) continue;
    arquivos.set(limpo, Buffer.from(bytes));
  }
  return tirarPastaRaiz(arquivos);
}

// Zip feito "da pasta" costuma trazer a pasta como raiz: tecnica-cirurgica/materia.yml -> materia.yml
function tirarPastaRaiz(arquivos) {
  if (arquivos.has("materia.yml") || arquivos.has("materia.yaml")) return arquivos;
  const raizes = new Set([...arquivos.keys()].map((k) => k.split("/")[0]));
  if (raizes.size !== 1) return arquivos;
  const raiz = [...raizes][0] + "/";
  if (!arquivos.has(raiz + "materia.yml") && !arquivos.has(raiz + "materia.yaml")) return arquivos;
  return new Map([...arquivos].map(([k, v]) => [k.slice(raiz.length), v]));
}

export function zipar(arquivos) {
  const obj = {};
  for (const [k, v] of arquivos) obj[k] = typeof v === "string" ? strToU8(v) : new Uint8Array(v);
  return Buffer.from(zipSync(obj, { level: 6 }));
}

// ---------- propriedades ----------
const RE_FRONT = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
export function separarPropriedades(texto) {
  const m = RE_FRONT.exec(texto);
  if (!m) return { props: {}, corpo: texto.replace(/^﻿/, ""), erro: null };
  try {
    const props = YAML.parse(m[1]) || {};
    if (typeof props !== "object" || Array.isArray(props)) return { props: {}, corpo: texto.slice(m[0].length), erro: "as propriedades precisam ser pares chave: valor" };
    return { props, corpo: texto.slice(m[0].length), erro: null };
  } catch (e) {
    return { props: {}, corpo: texto.slice(m[0].length), erro: "YAML inválido nas propriedades: " + String(e.message).split("\n")[0] };
  }
}

// "03 - Instrumentais" -> { ordem: 3, titulo: "Instrumentais" }
export function tirarPrefixo(nome) {
  const m = /^(\d{1,3})\s*[-–—._)]\s*(.+)$/.exec(nome.trim()) || /^(\d{1,3})\s+(.+)$/.exec(nome.trim());
  return m ? { ordem: Number(m[1]), titulo: m[2].trim() } : { ordem: null, titulo: nome.trim() };
}

const lista = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]).map((x) => String(x).trim()).filter(Boolean);
const simNao = (v) => (v === true || v === false ? v : /^(sim|true|s|yes)$/i.test(String(v)) ? true : /^(nao|não|false|n|no)$/i.test(String(v)) ? false : null);

// ---------- análise + validação ----------
// arquivos: Map<caminho, Buffer>.  opcoes.existentes: Set com slug() dos títulos de notas já publicadas
// (para saber se um [[link]] aponta para algo que existe fora do pacote).
export function analisarPacote(arquivos, opcoes = {}) {
  const erros = [];
  const avisos = [];
  const erro = (onde, msg) => erros.push({ onde, msg });
  const aviso = (onde, msg) => avisos.push({ onde, msg });
  const existentes = opcoes.existentes || new Set();

  // --- matéria ---
  const nomeYml = arquivos.has("materia.yml") ? "materia.yml" : arquivos.has("materia.yaml") ? "materia.yaml" : null;
  let m = {};
  if (!nomeYml) erro("materia.yml", "falta o arquivo materia.yml na raiz do pacote");
  else {
    try {
      m = YAML.parse(arquivos.get(nomeYml).toString("utf8")) || {};
    } catch (e) {
      erro(nomeYml, "YAML inválido: " + String(e.message).split("\n")[0]);
    }
  }
  // avaliação padrão dos módulos desta matéria; cada módulo pode dizer a sua
  const avPadrao = normAv(m.avaliacao) || "n1";
  if (nomeYml && !AVALIACOES.includes(avPadrao)) erro(nomeYml, `'avaliacao' inválida: "${m.avaliacao}" (use n1 ou n2)`);
  const pv = m.prova && typeof m.prova === "object" ? m.prova : {};
  // prova.n1 / prova.n2; "prova.data" e "prova.foco" soltos valem para a avaliação padrão da matéria
  const provaDe = (av) => (pv[av] && typeof pv[av] === "object" ? pv[av] : pv[av.toUpperCase()] && typeof pv[av.toUpperCase()] === "object" ? pv[av.toUpperCase()] : avPadrao === av ? pv : {});
  const dataDe = (o) => (o.data != null ? String(o.data instanceof Date ? o.data.toISOString().slice(0, 10) : o.data).trim() : null);
  const focoDe = (o) => (o.foco != null ? String(o.foco).trim() : null);
  const materia = {
    slug: String(m.slug || "").trim(),
    nome: String(m.nome || "").trim(),
    semestre: Number(m.semestre),
    eixo: String(m.eixo || "").trim(),
    descricao: String(m.descricao || "").trim(),
    cor: String(m.cor || "").trim(),
    avaliacao: AVALIACOES.includes(avPadrao) ? avPadrao : "n1",
    provaData: dataDe(provaDe("n1")),
    provaFoco: focoDe(provaDe("n1")),
    n2Data: dataDe(provaDe("n2")),
    n2Foco: focoDe(provaDe("n2")),
  };
  if (nomeYml) {
    if (!materia.slug) erro(nomeYml, "falta 'slug' (identificador da matéria, ex.: tecnica-cirurgica)");
    else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(materia.slug)) erro(nomeYml, `'slug' inválido: "${materia.slug}" (use só minúsculas, números e hífen)`);
    if (!materia.nome) erro(nomeYml, "falta 'nome'");
    if (!Number.isInteger(materia.semestre) || materia.semestre < 1 || materia.semestre > 14) erro(nomeYml, "'semestre' precisa ser um número inteiro de 1 a 14");
    if (materia.cor && !/^#[0-9a-f]{6}$/i.test(materia.cor)) erro(nomeYml, `'cor' inválida: "${materia.cor}" (use o formato "#1f6f8b")`);
    for (const d of [materia.provaData, materia.n2Data]) if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) erro(nomeYml, "a data da prova precisa estar no formato AAAA-MM-DD");
  }
  const descModulos = new Map();
  for (const d of Array.isArray(m.modulos) ? m.modulos : []) {
    if (d && d.pasta) descModulos.set(String(d.pasta).trim(), d);
  }

  // --- arquivos ---
  const modulos = new Map(); // slug -> modulo
  const notas = [];
  const anexos = [];
  const usados = new Set(); // anexos referenciados
  const porSlug = new Map();

  const moduloDe = (pasta) => {
    const { ordem, titulo: tituloPasta } = pasta ? tirarPrefixo(pasta) : { ordem: 0, titulo: "Geral" };
    const d = descModulos.get(pasta) || {};
    const titulo = String(d.titulo || tituloPasta).trim();
    const s = slug(titulo);
    if (!modulos.has(s)) {
      const av = normAv(d.avaliacao) || materia.avaliacao;
      if (!AVALIACOES.includes(av)) erro(nomeYml || "materia.yml", `módulo "${pasta}": 'avaliacao' inválida: "${d.avaliacao}" (use n1 ou n2)`);
      modulos.set(s, { slug: s, pasta, titulo, descricao: String(d.descricao || "").trim(), ordem: ordem ?? 999, avaliacao: AVALIACOES.includes(av) ? av : "n1", avaliacaoDita: !!normAv(d.avaliacao) || !!normAv(m.avaliacao) });
    }
    return modulos.get(s);
  };

  const caminhos = [...arquivos.keys()].filter((c) => !IGNORAR.test(c) && c !== nomeYml).sort((a, b) => a.localeCompare(b, "pt", { numeric: true }));
  for (const caminho of caminhos) {
    const partes = caminho.split("/");
    const ext = (caminho.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
    const bytes = arquivos.get(caminho);
    if (PASTA_ANEXOS.test(partes[0]) && partes.length > 1) {
      if (!mimeDe(caminho)) {
        aviso(caminho, "tipo de arquivo não aceito em anexos (use png, jpg, webp, gif ou pdf); ignorado");
        continue;
      }
      const max = ext === ".pdf" ? LIMITES.pdfMaxBytes : LIMITES.imagemMaxBytes;
      if (bytes.length > max) erro(caminho, `arquivo grande demais (${(bytes.length / 1048576).toFixed(1)} MB; máximo ${max / 1048576} MB)`);
      anexos.push({ caminho, bytes, mime: mimeDe(caminho) });
      continue;
    }
    if (ext !== ".md" && ext !== ".pdf") {
      aviso(caminho, "arquivo ignorado (notas são .md; figuras e PDFs vão em anexos/)");
      continue;
    }
    const pasta = partes.length > 1 ? partes[0] : "";
    const base = partes[partes.length - 1].slice(0, -ext.length);
    const { ordem: ordemArq, titulo: tituloArq } = tirarPrefixo(base);

    if (ext === ".pdf") {
      // PDF solto dentro de um módulo: vira uma nota de leitura em PDF
      if (bytes.length > LIMITES.pdfMaxBytes) erro(caminho, "PDF grande demais");
      const mod = moduloDe(pasta);
      const destino = "anexos/pdf/" + slug(tituloArq) + ".pdf";
      anexos.push({ caminho: destino, bytes, mime: "application/pdf" });
      usados.add(destino);
      registrar({ arquivo: caminho, titulo: tituloArq, resumo: "Documento em PDF.", modulo: mod.slug, ordem: ordemArq ?? 999, md: "", pdf: destino, prova: false, prioridade: 2, tags: [], fontes: [] });
      continue;
    }

    const { props, corpo, erro: erroProps } = separarPropriedades(bytes.toString("utf8"));
    if (erroProps) erro(caminho, erroProps);
    const titulo = String(props.titulo || props.title || tituloArq).trim();
    const idFixo = props.id != null ? String(props.id).trim() : "";
    if (idFixo && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(idFixo)) erro(caminho, `'id' inválido: "${idFixo}" (só minúsculas, números e hífen)`);
    const resumo = String(props.resumo ?? "").trim();
    const prova = props.prova == null ? false : simNao(props.prova);
    if (prova === null) erro(caminho, "'prova' precisa ser true ou false");
    let prioridade = 2;
    if (props.prioridade != null) {
      prioridade = PRIORIDADES[String(props.prioridade).toLowerCase()];
      if (!prioridade) erro(caminho, "'prioridade' precisa ser alta, media ou baixa");
    }
    const ordem = props.ordem != null && Number.isFinite(Number(props.ordem)) ? Number(props.ordem) : (ordemArq ?? 999);
    let pdf = null;
    if (props.pdf) {
      pdf = caminhoSeguro(props.pdf);
      if (!pdf || !pdf.toLowerCase().endsWith(".pdf")) erro(caminho, `'pdf' inválido: "${props.pdf}" (aponte para um .pdf dentro de anexos/)`);
      else usados.add(pdf);
    }
    const a = analisar(corpo);
    const onde = caminho;
    const tags = lista(props.tags);
    if (String(props.tipo || "").toLowerCase() === "mapa" && !tags.includes("mapa")) tags.unshift("mapa");
    const mapa = tags.includes("mapa");
    if (!resumo) erro(onde, "falta 'resumo' nas propriedades (uma frase que diz o que a nota ensina)");
    else if (resumo.length > LIMITES.resumoMax) aviso(onde, `'resumo' longo (${resumo.length} caracteres); mantenha em uma frase`);
    const palavras = contarPalavras(a.corpo);
    if (palavras > LIMITES.palavrasErro) erro(onde, `nota grande demais (${palavras} palavras; máximo ${LIMITES.palavrasErro}). Divida em notas atômicas menores e ligue-as com [[links]]`);
    else if (palavras > LIMITES.palavrasAviso) aviso(onde, `nota longa (${palavras} palavras). O ideal é até ${LIMITES.palavrasAviso}: considere dividir`);
    else if (palavras < LIMITES.palavrasMinimo && !pdf && !mapa) aviso(onde, `nota muito curta (${palavras} palavras)`);
    if (/^\s*#\s+/m.test(a.corpo.split("\n")[0] || "") && slug((a.corpo.split("\n")[0] || "").replace(/^\s*#\s+/, "")) !== slug(titulo))
      aviso(onde, "o corpo começa com um título '# ...' diferente do título da nota; use '##' para as seções");
    a.flashcards.forEach((f, i) => {
      if (!f.frente || !f.verso) erro(onde, `flashcard ${i + 1}: precisa de pergunta (na linha do [!flashcard]) e resposta (nas linhas seguintes)`);
      else if (contarPalavras(f.verso) > 60) aviso(onde, `flashcard ${i + 1}: resposta longa (${contarPalavras(f.verso)} palavras); uma carta deve cobrar uma ideia só`);
    });
    const semExplica = a.flashcards.filter((f) => !f.explica).length;
    if (semExplica) aviso(onde, `${semExplica} flashcard(s) sem a linha "??" que explica a pergunta`);
    const frentes = a.flashcards.map((f) => slug(f.frente));
    if (new Set(frentes).size !== frentes.length) erro(onde, "há flashcards com a mesma pergunta nesta nota");
    a.questoes.forEach((q, i) => {
      if (!q.enunciado) erro(onde, `questão ${i + 1}: falta o enunciado`);
      if (q.alternativas.length) {
        const certas = q.alternativas.filter((x) => x.correta).length;
        if (q.alternativas.length < 2) erro(onde, `questão ${i + 1}: precisa de pelo menos 2 alternativas`);
        if (certas !== 1) erro(onde, `questão ${i + 1}: marque exatamente uma alternativa correta com "- [x]" (encontradas: ${certas})`);
      } else if (!q.comentario) erro(onde, `questão ${i + 1}: questão aberta precisa da resposta nas linhas seguintes`);
    });
    for (const t of new Set(a.tipos)) if (!CALLOUTS[t] && t !== "flashcard" && t !== "questao") aviso(onde, `callout desconhecido: [!${t}] (vai aparecer como nota comum)`);
    if (!pdf && !mapa) {
      if (!a.flashcards.length) aviso(onde, "nota sem nenhum flashcard");
      if (prova && !a.tipos.includes("essencial")) aviso(onde, "nota de prova sem bloco [!essencial] (é ele que aparece no modo prova)");
    }
    for (const img of a.imagens) {
      const c = caminhoSeguro(img);
      if (!c) erro(onde, `figura com caminho inválido: "${img}" (use caminhos relativos à raiz do pacote, ex.: anexos/figura.jpg)`);
      else if (!EXT_IMAGEM.some((e) => c.toLowerCase().endsWith(e))) erro(onde, `figura com formato não aceito: "${img}"`);
      else usados.add(c);
    }
    registrar({ arquivo: caminho, id: idFixo, titulo, resumo, modulo: moduloDe(pasta).slug, ordem, md: corpo.trim(), pdf, prova: !!prova, prioridade: prioridade || 2, tags, fontes: lista(props.fontes), alvos: a.alvos, nFlashcards: a.flashcards.length, nQuestoes: a.questoes.length, palavras });
  }

  // Cada nota responde pelo seu id (slug) e pelo slug do título: é assim que os [[links]] a encontram.
  function registrar(n) {
    n.slug = n.id || slug(n.titulo);
    n.minutos = Math.max(1, Math.round((n.palavras || 0) / 170));
    const chaves = new Set([n.slug, slug(n.titulo)]);
    const repetida = [...chaves].map((c) => porSlug.get(c)).find(Boolean);
    if (repetida) erro(n.arquivo, `título repetido na matéria: "${n.titulo}" (também em ${repetida.arquivo})`);
    else for (const c of chaves) porSlug.set(c, n);
    notas.push(n);
  }

  if (nomeYml && !notas.length) erro("pacote", "o pacote não tem nenhuma nota (.md dentro de uma pasta de módulo)");

  // --- anexos referenciados existem? ---
  const temAnexo = new Set(anexos.map((a) => a.caminho));
  const jaNoSite = opcoes.anexosExistentes || new Set();
  for (const c of usados) if (!temAnexo.has(c) && !jaNoSite.has(c)) erro(c, "arquivo referenciado por uma nota, mas ausente do pacote");
  for (const a of anexos) if (!usados.has(a.caminho)) aviso(a.caminho, "anexo não usado por nenhuma nota");

  // --- links ---
  for (const n of notas) {
    for (const alvo of n.alvos || []) {
      const s = slug(alvo.includes("/") ? alvo.split("/").pop() : alvo);
      if (!porSlug.has(s) && !existentes.has(s)) aviso(n.arquivo, `link para nota que não existe: [[${alvo}]] (vai aparecer como texto até a nota ser criada)`);
    }
  }
  const comLink = new Set();
  for (const n of notas)
    for (const alvo of n.alvos || []) {
      const s = slug(alvo.includes("/") ? alvo.split("/").pop() : alvo);
      const destino = porSlug.get(s);
      if (destino && destino !== n) {
        comLink.add(destino.slug);
        comLink.add(n.slug);
      }
    }
  if (notas.length > 1) for (const n of notas) if (!comLink.has(n.slug) && !n.pdf) aviso(n.arquivo, "nota isolada: não liga nem é ligada por nenhuma outra nota do pacote");

  const listaModulos = [...modulos.values()].sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo, "pt"));
  return {
    ok: erros.length === 0,
    erros,
    avisos,
    materia,
    modulos: listaModulos,
    notas,
    anexos,
    resumo: {
      modulos: listaModulos.length,
      notas: notas.length,
      notasDeProva: notas.filter((n) => n.prova).length,
      flashcards: notas.reduce((s, n) => s + (n.nFlashcards || 0), 0),
      questoes: notas.reduce((s, n) => s + (n.nQuestoes || 0), 0),
      anexos: anexos.length,
      palavras: notas.reduce((s, n) => s + (n.palavras || 0), 0),
    },
  };
}

// Texto do relatório (CLI e painel).
export function relatorio(r) {
  const l = [];
  if (r.materia.nome) l.push(`Matéria: ${r.materia.nome} (${r.materia.slug}), ${r.materia.semestre}º semestre`);
  l.push(
    `${r.resumo.modulos} módulo(s), ${r.resumo.notas} nota(s) (${r.resumo.notasDeProva} de prova), ${r.resumo.flashcards} flashcard(s), ${r.resumo.questoes} questão(ões), ${r.resumo.anexos} anexo(s), ${r.resumo.palavras} palavras`
  );
  for (const e of r.erros) l.push(`ERRO   ${e.onde}: ${e.msg}`);
  for (const a of r.avisos) l.push(`aviso  ${a.onde}: ${a.msg}`);
  l.push(r.ok ? (r.avisos.length ? `Pacote válido, com ${r.avisos.length} aviso(s).` : "Pacote válido.") : `Pacote INVÁLIDO: ${r.erros.length} erro(s).`);
  return l.join("\n");
}
