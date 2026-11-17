// Grava um pacote já validado (pacote.js) no banco, e o caminho inverso: exporta uma matéria como pacote.
// Também mantém o índice de títulos (para resolver [[links]]) e a tabela de ligações entre notas.
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { transacao } from "./db.js";
import { analisar, textoPuro, caminhoSeguro } from "./markdown.js";
import { slug, sha1, contarPalavras } from "./util.js";

// Muda toda vez que o conteúdo muda: os caches de HTML se guiam por ele.
export const conteudo = { versao: 1 };

export const idCard = (notaId, frente) => sha1(notaId + "\n" + slug(frente)).slice(0, 20);
export const pastaAnexos = (dataDir, materia) => path.join(dataDir, "anexos", materia);
export function arquivoAnexo(dataDir, materia, caminho) {
  const seguro = caminhoSeguro(caminho);
  if (!seguro || !/^[a-z0-9-]+$/.test(materia)) return null;
  return path.join(pastaAnexos(dataDir, materia), ...seguro.split("/"));
}

// ---------- índice de títulos ----------
let indice = null;
let indiceVersao = 0;
function obterIndice(db) {
  if (indice && indiceVersao === conteudo.versao) return indice;
  const porMateria = new Map();
  const global = new Map();
  const notas = db.prepare("select n.id, n.materia_id, n.slug, n.titulo, n.resumo, n.publicada from notas n join materias m on m.id = n.materia_id order by m.semestre, m.nome, n.ordem").all();
  for (const n of notas) {
    const chaves = new Set([n.slug, slug(n.titulo)]);
    if (!porMateria.has(n.materia_id)) porMateria.set(n.materia_id, new Map());
    for (const c of chaves) {
      if (!porMateria.get(n.materia_id).has(c)) porMateria.get(n.materia_id).set(c, n);
      if (!global.has(c)) global.set(c, n);
    }
  }
  indice = { porMateria, global };
  indiceVersao = conteudo.versao;
  return indice;
}

// Devolve a função que resolve o alvo de um [[link]] escrito numa nota da matéria dada.
// opcoes.pode(nota) decide se quem está lendo enxerga a nota (rascunhos, matérias liberadas).
export function criarResolver(db, materiaId, opcoes = {}) {
  const idx = obterIndice(db);
  const pode = opcoes.pode || (() => true);
  return (alvo) => {
    let nota = null;
    const partes = String(alvo).split("/");
    if (partes.length === 2 && idx.porMateria.has(partes[0].trim())) nota = idx.porMateria.get(partes[0].trim()).get(slug(partes[1])) || null;
    else {
      const s = slug(alvo);
      nota = (idx.porMateria.get(materiaId) && idx.porMateria.get(materiaId).get(s)) || idx.global.get(s) || null;
    }
    return nota && pode(nota) ? nota : null;
  };
}

export function reindexarLinks(db) {
  conteudo.versao++;
  const notas = db.prepare("select id, materia_id, md from notas").all();
  const inserir = db.prepare("insert or ignore into links (origem, destino) values (?, ?)");
  transacao(db, () => {
    db.exec("delete from links");
    for (const n of notas) {
      const resolver = criarResolver(db, n.materia_id);
      for (const alvo of analisar(n.md).alvos) {
        const d = resolver(alvo);
        if (d && d.id !== n.id) inserir.run(n.id, d.id);
      }
    }
  });
}

// ---------- gravação ----------
function sincronizarCards(db, materiaId, notaId, flashcards) {
  const ids = flashcards.map((f) => idCard(notaId, f.frente));
  const atuais = db.prepare("select id from flashcards where nota_id = ?").all(notaId);
  const apagar = db.prepare("delete from flashcards where id = ?");
  for (const a of atuais) if (!ids.includes(a.id)) apagar.run(a.id);
  const por = db.prepare(
    `insert into flashcards (id, materia_id, nota_id, frente, verso, ordem, explica) values (?, ?, ?, ?, ?, ?, ?)
     on conflict(id) do update set frente = excluded.frente, verso = excluded.verso, ordem = excluded.ordem, materia_id = excluded.materia_id, explica = excluded.explica`
  );
  flashcards.forEach((f, i) => por.run(ids[i], materiaId, notaId, f.frente, f.verso, i, f.explica || ""));
  return ids.length;
}

// Cria ou atualiza uma nota. n = { slug, titulo, resumo, md, prova, prioridade, tags, fontes, ordem, pdf }
export function gravarNota(db, materiaId, moduloId, n, opcoes = {}) {
  const agora = Date.now();
  const id = materiaId + "/" + n.slug;
  const a = analisar(n.md || "");
  const texto = textoPuro(a.corpo + "\n" + a.questoes.map((q) => q.enunciado).join("\n"));
  const minutos = Math.max(1, Math.round(contarPalavras(a.corpo) / 170));
  const tags = JSON.stringify(n.tags || []);
  const fontes = JSON.stringify(n.fontes || []);
  const atual = db.prepare("select * from notas where id = ?").get(id);
  let situacao = "igual";
  if (!atual) {
    db.prepare(
      `insert into notas (id, materia_id, modulo_id, slug, titulo, resumo, md, texto, prova, prioridade, tags, fontes, ordem, minutos, pdf, publicada, criado_em, atualizado_em)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, materiaId, moduloId, n.slug, n.titulo, n.resumo || "", n.md || "", texto, n.prova ? 1 : 0, n.prioridade || 2, tags, fontes, n.ordem ?? 999, minutos, n.pdf || null, opcoes.publicada === false ? 0 : 1, agora, agora);
    situacao = "criada";
  } else {
    const mudou =
      atual.modulo_id !== moduloId || atual.titulo !== n.titulo || atual.resumo !== (n.resumo || "") || atual.md !== (n.md || "") || !!atual.prova !== !!n.prova ||
      atual.prioridade !== (n.prioridade || 2) || atual.tags !== tags || atual.fontes !== fontes || atual.ordem !== (n.ordem ?? 999) || (atual.pdf || null) !== (n.pdf || null);
    if (mudou) {
      db.prepare(
        `update notas set modulo_id = ?, titulo = ?, resumo = ?, md = ?, texto = ?, prova = ?, prioridade = ?, tags = ?, fontes = ?, ordem = ?, minutos = ?, pdf = ?, atualizado_em = ? where id = ?`
      ).run(moduloId, n.titulo, n.resumo || "", n.md || "", texto, n.prova ? 1 : 0, n.prioridade || 2, tags, fontes, n.ordem ?? 999, minutos, n.pdf || null, agora, id);
      situacao = "atualizada";
    }
  }
  const cards = sincronizarCards(db, materiaId, id, a.flashcards);
  return { id, situacao, cards };
}

export function gravarModulo(db, materiaId, mod) {
  const id = materiaId + "/" + mod.slug;
  db.prepare(
    `insert into modulos (id, materia_id, slug, titulo, descricao, ordem) values (?, ?, ?, ?, ?, ?)
     on conflict(id) do update set titulo = excluded.titulo, ordem = excluded.ordem,
       descricao = case when excluded.descricao != '' then excluded.descricao else modulos.descricao end`
  ).run(id, materiaId, mod.slug, mod.titulo, mod.descricao || "", mod.ordem ?? 999);
  // a avaliação só muda quando quem grava diz qual é (um pacote que não fala de N1/N2 não mexe nela)
  if (mod.avaliacao && mod.avaliacaoDita !== false) db.prepare("update modulos set avaliacao = ? where id = ?").run(mod.avaliacao, id);
  return id;
}

export function gravarAnexo(db, dataDir, materiaId, caminho, bytes, mime) {
  const destino = arquivoAnexo(dataDir, materiaId, caminho);
  if (!destino) throw new Error("caminho de anexo inválido: " + caminho);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, bytes);
  db.prepare(
    `insert into anexos (materia_id, caminho, mime, tamanho) values (?, ?, ?, ?)
     on conflict(materia_id, caminho) do update set mime = excluded.mime, tamanho = excluded.tamanho`
  ).run(materiaId, caminho, mime, bytes.length);
}

const limparModulosVazios = (db, materiaId) => db.prepare("delete from modulos where materia_id = ? and id not in (select distinct modulo_id from notas where materia_id = ?)").run(materiaId, materiaId);

// modo "mesclar": acrescenta e atualiza (o padrão; nada do que já existe some).
// modo "substituir": a matéria fica exatamente igual ao pacote (notas fora dele são apagadas).
export function importarPacote(db, dataDir, p, opcoes = {}) {
  if (!p.ok) throw new Error("pacote inválido: corrija os erros antes de importar");
  const modo = opcoes.modo === "substituir" ? "substituir" : "mesclar";
  const agora = Date.now();
  const mid = p.materia.slug;
  const rel = { materia: mid, modo, criadas: [], atualizadas: [], removidas: [], iguais: 0, flashcards: 0, anexos: p.anexos.length };
  transacao(db, () => {
    const existente = db.prepare("select * from materias where id = ?").get(mid);
    if (!existente)
      db.prepare("insert into materias (id, nome, semestre, eixo, descricao, cor, prova_data, prova_foco, n2_data, n2_foco, criado_em, atualizado_em) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
        mid, p.materia.nome, p.materia.semestre, p.materia.eixo, p.materia.descricao, p.materia.cor, p.materia.provaData, p.materia.provaFoco || "", p.materia.n2Data ?? null, p.materia.n2Foco || "", agora, agora
      );
    else
      db.prepare("update materias set nome = ?, semestre = ?, eixo = ?, descricao = ?, cor = ?, prova_data = ?, prova_foco = ?, n2_data = ?, n2_foco = ?, atualizado_em = ? where id = ?").run(
        p.materia.nome, p.materia.semestre, p.materia.eixo || existente.eixo, p.materia.descricao || existente.descricao, p.materia.cor || existente.cor,
        p.materia.provaData ?? existente.prova_data, p.materia.provaFoco ?? existente.prova_foco, p.materia.n2Data ?? existente.n2_data, p.materia.n2Foco ?? existente.n2_foco, agora, mid
      );
    for (const a of p.anexos) gravarAnexo(db, dataDir, mid, a.caminho, a.bytes, a.mime);
    const idModulo = new Map();
    for (const mod of p.modulos) idModulo.set(mod.slug, gravarModulo(db, mid, mod));
    const noPacote = new Set();
    for (const n of p.notas) {
      const r = gravarNota(db, mid, idModulo.get(n.modulo), n, { publicada: opcoes.publicada });
      noPacote.add(r.id);
      rel.flashcards += r.cards;
      if (r.situacao === "criada") rel.criadas.push(n.titulo);
      else if (r.situacao === "atualizada") rel.atualizadas.push(n.titulo);
      else rel.iguais++;
    }
    if (modo === "substituir") {
      for (const n of db.prepare("select id, titulo from notas where materia_id = ?").all(mid))
        if (!noPacote.has(n.id)) {
          db.prepare("delete from notas where id = ?").run(n.id);
          rel.removidas.push(n.titulo);
        }
    }
    limparModulosVazios(db, mid);
  });
  reindexarLinks(db);
  return rel;
}

export function apagarNota(db, id) {
  const n = db.prepare("select materia_id from notas where id = ?").get(id);
  if (!n) return false;
  db.prepare("delete from notas where id = ?").run(id);
  limparModulosVazios(db, n.materia_id);
  reindexarLinks(db);
  return true;
}

export function apagarMateria(db, dataDir, id) {
  if (!/^[a-z0-9-]+$/.test(id)) return false;
  const r = db.prepare("delete from materias where id = ?").run(id);
  db.prepare("delete from user_materias where materia_id = ?").run(id);
  fs.rmSync(pastaAnexos(dataDir, id), { recursive: true, force: true });
  reindexarLinks(db);
  return r.changes > 0;
}

// ---------- exportação ----------
const NOME_PRIORIDADE = { 1: "alta", 2: "media", 3: "baixa" };
const nomeArquivo = (s) => String(s).replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
const doisDigitos = (n) => String(n).padStart(2, "0");

export function exportarPacote(db, dataDir, materiaId) {
  const m = db.prepare("select * from materias where id = ?").get(materiaId);
  if (!m) return null;
  const arquivos = new Map();
  const modulos = db.prepare("select * from modulos where materia_id = ? order by ordem, titulo").all(materiaId);
  const yml = { formato: 1, slug: m.id, nome: m.nome, semestre: m.semestre };
  if (m.eixo) yml.eixo = m.eixo;
  if (m.descricao) yml.descricao = m.descricao;
  if (m.cor) yml.cor = m.cor;
  const prova = {};
  if (m.prova_data || m.prova_foco) prova.n1 = { ...(m.prova_data ? { data: m.prova_data } : {}), ...(m.prova_foco ? { foco: m.prova_foco } : {}) };
  if (m.n2_data || m.n2_foco) prova.n2 = { ...(m.n2_data ? { data: m.n2_data } : {}), ...(m.n2_foco ? { foco: m.n2_foco } : {}) };
  if (Object.keys(prova).length) yml.prova = prova;
  yml.modulos = [];
  modulos.forEach((mod, i) => {
    const pasta = `${doisDigitos(i + 1)} - ${nomeArquivo(mod.titulo)}`;
    yml.modulos.push({ pasta, titulo: mod.titulo, avaliacao: mod.avaliacao, ...(mod.descricao ? { descricao: mod.descricao } : {}) });
    const notas = db.prepare("select * from notas where modulo_id = ? order by ordem, titulo").all(mod.id);
    notas.forEach((n, j) => {
      const props = { id: n.slug, titulo: n.titulo, resumo: n.resumo, prova: !!n.prova };
      if (n.prova) props.prioridade = NOME_PRIORIDADE[n.prioridade] || "media";
      const tags = JSON.parse(n.tags);
      const fontes = JSON.parse(n.fontes);
      if (tags.length) props.tags = tags;
      if (fontes.length) props.fontes = fontes;
      if (n.pdf) props.pdf = n.pdf;
      arquivos.set(`${pasta}/${doisDigitos(j + 1)} - ${nomeArquivo(n.titulo)}.md`, `---\n${YAML.stringify(props).trim()}\n---\n\n${n.md.trim()}\n`);
    });
  });
  arquivos.set("materia.yml", YAML.stringify(yml));
  for (const a of db.prepare("select caminho from anexos where materia_id = ?").all(materiaId)) {
    const arq = arquivoAnexo(dataDir, materiaId, a.caminho);
    if (arq && fs.existsSync(arq)) arquivos.set(a.caminho, fs.readFileSync(arq));
  }
  return arquivos;
}
