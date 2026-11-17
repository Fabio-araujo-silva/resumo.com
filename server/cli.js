#!/usr/bin/env node
// CLI do resumo.com. É por aqui que uma instância do Claude (ou você) confere e publica conteúdo.
//
//   node server/cli.js validar  <pasta|pacote.zip>
//   node server/cli.js importar <pasta|pacote.zip> [--substituir] [--rascunho] [--url https://site --token XXX]
//   node server/cli.js exportar <materia> <destino.zip>
//   node server/cli.js gerar --materia <slug> --nome "Nome" --semestre N [--avaliacao n1|n2] [--prova "o que cai"] [--rascunho] <arquivos...>
//   node server/cli.js criar-admin --email voce@exemplo.com --senha ******** [--nome "Você"]
//   node server/cli.js listar
import fs from "node:fs";
import path from "node:path";
import { carregarConfig } from "./src/config.js";
import { lerPasta, lerZip, analisarPacote, relatorio, zipar } from "./src/pacote.js";

function lerArgs(argv) {
  const pos = [];
  const op = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const chave = a.slice(2);
      const prox = argv[i + 1];
      if (prox === undefined || prox.startsWith("--")) op[chave] = true;
      else {
        op[chave] = prox;
        i++;
      }
    } else pos.push(a);
  }
  return { pos, op };
}

function lerPacote(alvo) {
  if (!alvo) throw new Error("diga a pasta ou o .zip do pacote");
  const abs = path.resolve(alvo);
  if (!fs.existsSync(abs)) throw new Error("não encontrei: " + abs);
  return fs.statSync(abs).isDirectory() ? lerPasta(abs) : lerZip(fs.readFileSync(abs));
}

async function abrir() {
  const { abrirDb } = await import("./src/db.js");
  const config = carregarConfig();
  return { config, db: abrirDb(config.dataDir) };
}

async function existentesNoBanco(db, materia) {
  const { slug } = await import("./src/util.js");
  const existentes = new Set();
  for (const n of db.prepare("select slug, titulo from notas").all()) {
    existentes.add(n.slug);
    existentes.add(slug(n.titulo));
  }
  const anexosExistentes = new Set(db.prepare("select caminho from anexos where materia_id = ?").all(materia || "").map((a) => a.caminho));
  return { existentes, anexosExistentes };
}

async function enviar(url, token, arquivos, op) {
  const form = new FormData();
  form.append("modo", op.substituir ? "substituir" : "mesclar");
  form.append("rascunho", op.rascunho ? "1" : "0");
  form.append("arquivo", new Blob([zipar(arquivos)], { type: "application/zip" }), "pacote.zip");
  const r = await fetch(url.replace(/\/+$/, "") + "/api/admin/importar", { method: "POST", headers: { authorization: "Bearer " + token, "x-resumo": "1" }, body: form });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`o site recusou (${r.status}): ${corpo.error || "erro"}${corpo.relatorio ? "\n" + corpo.relatorio : ""}`);
  return corpo;
}

const comandos = {
  async validar({ pos }) {
    const arquivos = lerPacote(pos[0]);
    let extras = {};
    try {
      const { db } = await abrir();
      const previa = analisarPacote(arquivos);
      extras = await existentesNoBanco(db, previa.materia.slug);
      db.close();
    } catch {}
    const r = analisarPacote(arquivos, extras);
    console.log(relatorio(r));
    return r.ok ? 0 : 1;
  },

  async importar({ pos, op }) {
    const arquivos = lerPacote(pos[0]);
    if (op.url) {
      if (!op.token) throw new Error("para enviar a um site, passe --token (crie um em Admin > Tokens de API)");
      const local = analisarPacote(arquivos);
      if (local.erros.some((e) => !/ausente do pacote/.test(e.msg))) {
        console.log(relatorio(local));
        return 1;
      }
      const resp = await enviar(op.url, op.token, arquivos, op);
      console.log(resp.relatorio);
      console.log(`Enviado: ${resp.importado.criadas.length} nova(s), ${resp.importado.atualizadas.length} atualizada(s), ${resp.importado.removidas.length} removida(s).`);
      return 0;
    }
    const { db, config } = await abrir();
    const { importarPacote } = await import("./src/importar.js");
    const previa = analisarPacote(arquivos);
    const r = analisarPacote(arquivos, await existentesNoBanco(db, previa.materia.slug));
    console.log(relatorio(r));
    if (!r.ok) return 1;
    const rel = importarPacote(db, config.dataDir, r, { modo: op.substituir ? "substituir" : "mesclar", publicada: !op.rascunho });
    console.log(
      `Importado em ${config.dataDir}: ${rel.criadas.length} nova(s), ${rel.atualizadas.length} atualizada(s), ${rel.iguais} sem mudança, ${rel.removidas.length} removida(s), ${rel.flashcards} flashcard(s).`
    );
    db.close();
    return 0;
  },

  async exportar({ pos }) {
    const [materia, destino] = pos;
    if (!materia || !destino) throw new Error("uso: exportar <materia> <destino.zip>");
    const { db, config } = await abrir();
    const { exportarPacote } = await import("./src/importar.js");
    const arquivos = exportarPacote(db, config.dataDir, materia);
    if (!arquivos) throw new Error("matéria não encontrada: " + materia);
    fs.writeFileSync(path.resolve(destino), zipar(arquivos));
    console.log(`Exportado: ${destino} (${arquivos.size} arquivos)`);
    db.close();
    return 0;
  },

  async "criar-admin"({ op }) {
    if (!op.email || !op.senha) throw new Error("uso: criar-admin --email voce@exemplo.com --senha ******** [--nome Nome]");
    const { db } = await abrir();
    const { criarUsuario } = await import("./src/auth.js");
    const existe = db.prepare("select id from users where email = ?").get(String(op.email).trim().toLowerCase());
    if (existe) {
      const { hashSenha } = await import("./src/auth.js");
      db.prepare("update users set senha_hash = ?, papel = 'admin', ativo = 1 where id = ?").run(hashSenha(String(op.senha)), existe.id);
      console.log("Conta já existia: senha trocada e papel definido como admin.");
    } else {
      criarUsuario(db, { email: op.email, nome: op.nome || "Admin", senha: String(op.senha), papel: "admin" });
      console.log("Admin criado: " + op.email);
    }
    db.close();
    return 0;
  },

  async listar() {
    const { db } = await abrir();
    for (const m of db.prepare("select * from materias order by semestre, nome").all()) {
      const n = db.prepare("select count(*) c, sum(prova) p from notas where materia_id = ?").get(m.id);
      const f = db.prepare("select count(*) c from flashcards where materia_id = ?").get(m.id);
      console.log(`${m.semestre}º  ${m.id.padEnd(28)} ${m.nome}  (${n.c} notas, ${n.p || 0} de prova, ${f.c} flashcards)`);
      for (const nota of db.prepare("select n.titulo, mo.titulo modulo from notas n join modulos mo on mo.id = n.modulo_id where n.materia_id = ? order by mo.ordem, n.ordem").all(m.id))
        console.log(`      ${nota.modulo} / ${nota.titulo}`);
    }
    db.close();
    return 0;
  },

  async gerar({ pos, op }) {
    if (!op.materia || !pos.length) throw new Error('uso: gerar --materia <slug> [--nome "Nome" --semestre N] [--prova "o que cai"] [--instrucoes "..."] [--rascunho] <arquivos...>');
    const { db, config } = await abrir();
    const { gerarResumo } = await import("./src/gerador.js");
    const r = await gerarResumo(db, config, {
      materia: { slug: op.materia, nome: op.nome, semestre: op.semestre ? Number(op.semestre) : undefined },
      materiais: pos.map((p) => ({ nome: path.basename(p), caminho: path.resolve(p) })),
      conteudosProva: typeof op.prova === "string" ? op.prova : "",
      instrucoes: typeof op.instrucoes === "string" ? op.instrucoes : "",
      rascunho: !!op.rascunho,
      avaliacao: typeof op.avaliacao === "string" ? op.avaliacao : "",
      enviarPara: op.url ? { url: op.url, token: op.token, enviar } : null,
      aoLogar: (linha) => console.log(linha),
    });
    db.close();
    return r.ok ? 0 : 1;
  },
};

const [, , nome, ...resto] = process.argv;
const cmd = comandos[nome];
if (!cmd) {
  console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 10).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(nome ? 1 : 0);
}
cmd(lerArgs(resto))
  .then((codigo) => process.exit(codigo || 0))
  .catch((e) => {
    console.error("Erro: " + e.message);
    process.exit(1);
  });
