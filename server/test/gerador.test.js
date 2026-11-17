// Geração com o Claude local: a pasta de trabalho, o pedido, a rodada de correção e a publicação.
// O `claude` de verdade é trocado por test/claude-de-mentira.mjs (mesmo protocolo: prompt no stdin,
// eventos stream-json no stdout, escreve em ./pacote).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { zipSync, strToU8 } from "fflate";
import { subir, pacoteAnatomia, PDF } from "./_ajuda.js";
import { gerarResumo, textoDeOffice } from "../src/gerador.js";

const falso = fileURLToPath(new URL("./claude-de-mentira.mjs", import.meta.url));
const comClaudeFalso = { claudeBin: process.execPath, claudeArgs: [falso], claudeTimeoutMin: 1 };

function pptx() {
  const slide = (t) => strToU8(`<p:sld><a:p><a:r><a:t>${t}</a:t></a:r><a:r><a:t> &amp; mais</a:t></a:r></a:p><a:p><a:r><a:t>segunda linha</a:t></a:r></a:p></p:sld>`);
  return Buffer.from(zipSync({ "ppt/slides/slide2.xml": slide("Slide dois"), "ppt/slides/slide1.xml": slide("Slide um"), "ppt/slides/slide10.xml": slide("Slide dez"), "ppt/notesSlides/notesSlide1.xml": strToU8("<a:p><a:r><a:t>fala do professor</a:t></a:r></a:p>") }));
}

test("texto de PPTX e DOCX é extraído na ordem dos slides", () => {
  const t = textoDeOffice(pptx(), "aula.pptx");
  assert.match(t, /===== SLIDE 1 =====\nSlide um & mais\nsegunda linha\n\[anotações do apresentador\]\nfala do professor\n\n===== SLIDE 2 =====\nSlide dois[\s\S]*===== SLIDE 3 =====\nSlide dez/);
  const docx = Buffer.from(zipSync({ "word/document.xml": strToU8("<w:body><w:p><w:r><w:t>Primeiro</w:t></w:r><w:r><w:t xml:space=\"preserve\"> parágrafo</w:t></w:r></w:p><w:p><w:r><w:t>Segundo</w:t></w:r></w:p></w:body>") }));
  assert.equal(textoDeOffice(docx, "x.docx"), "Primeiro parágrafo\nSegundo");
  assert.equal(textoDeOffice(Buffer.from("não é zip"), "x.pptx"), null);
});

test("gerar: monta a pasta, aciona o Claude, manda corrigir o erro do validador e publica", async () => {
  const s = await subir(comClaudeFalso);
  s.importar(pacoteAnatomia());
  const log = [];
  const status = [];
  const r = await gerarResumo(s.db, s.config, {
    materia: { nome: "Neurofisiologia", semestre: 3 },
    materiais: [{ nome: "aula 1.pdf", bytes: PDF }, { nome: "aula 2.pptx", bytes: pptx() }, { nome: "aula 1.pdf", bytes: PDF }],
    conteudosProva: "Potencial de ação\ne sinapse química",
    instrucoes: "Foque no que o professor repetiu.",
    aoLogar: (l) => log.push(l),
    aoMudar: (st) => status.push(st),
  });
  assert.equal(r.ok, true, r.erro + "\n" + log.join("\n"));
  assert.deepEqual(status, ["preparando", "gerando", "validando", "corrigindo", "validando", "importando"]);
  assert.equal(r.materia, "neurofisiologia");
  assert.deepEqual([r.importado.criadas.length, r.importado.flashcards], [2, 2]);

  // a pasta de trabalho tem tudo o que a instância precisa
  const dir = r.dir;
  assert.deepEqual(fs.readdirSync(path.join(dir, "materiais")).sort(), ["1-aula 1.pdf", "_texto", "aula 1.pdf", "aula 2.pptx"]);
  assert.match(fs.readFileSync(path.join(dir, "materiais", "_texto", "aula 2.pptx.txt"), "utf8"), /SLIDE 1/);
  assert.ok(fs.readFileSync(path.join(dir, "FORMATO.md"), "utf8").includes("Pacote resumo.com"));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8")).permissions.defaultMode, "acceptEdits");
  const pedido = fs.readFileSync(path.join(dir, "PEDIDO.md"), "utf8");
  assert.match(pedido, /slug: neurofisiologia/);
  assert.match(pedido, /materiais\/aula 2\.pptx` \(texto extraído em `materiais\/_texto\/aula 2\.pptx\.txt`\)/);
  assert.match(pedido, /> Potencial de ação\n> e sinapse química/);
  assert.match(pedido, /Foque no que o professor repetiu\./);
  assert.match(pedido, /\[\[anatomia\/Plexo braquial\]\]/, "o pedido lista as notas de outras matérias para ligar");
  assert.ok(!/já tem no site/.test(pedido), "matéria nova não tem notas anteriores");

  // duas chamadas: a original e a de correção, com --continue e os erros do validador no prompt
  const chamadas = fs.readFileSync(path.join(dir, "chamadas.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(chamadas.length, 2);
  assert.deepEqual(chamadas[0].args.slice(0, 4), ["-p", "--output-format", "stream-json", "--verbose"]);
  assert.deepEqual(chamadas[0].args.slice(4, 7), ["--permission-mode", "acceptEdits", "--allowedTools"]);
  assert.ok(chamadas[0].args.includes("Bash(node *)") && !chamadas[0].args.includes("--continue"));
  assert.ok(chamadas[1].args.includes("--continue"));
  assert.match(chamadas[1].prompt, /validador do resumo.com recusou/);
  const tudo = log.join("\n");
  assert.match(tudo, /Material: aula 2\.pptx .* \+ texto extraído/);
  assert.match(tudo, /Claude: Li o pedido .* FORMATO\.md presente/);
  assert.match(tudo, /→ Write pacote\/01 - Sistema Nervoso\/01 - Neurônio\.md/);
  assert.match(tudo, /ERRO .*falta 'resumo'/);
  assert.match(tudo, /Claude terminou \(success, 1 s, 3 turnos · US\$ 0\.42\)/);
  assert.match(tudo, /Publicado: 2 nota\(s\) nova\(s\)/);

  // está no site: nota de prova (o dono disse o que cai), ligada, com flashcard
  const ana = await s.entrar("ana@teste.com", "ana-senha-123");
  const n = (await s.pedir(ana, "GET", "/api/notas/neurofisiologia/neuronio")).json;
  assert.deepEqual([n.nota.prova, n.nota.materia.semestre, n.cards, n.saidas.map((x) => x.titulo)], [true, 3, 1, ["Sinapse química"]]);

  // o script de validação que fica na pasta funciona sozinho (é o que o Claude roda)
  const v = spawnSync(process.execPath, ["validar.mjs"], { cwd: dir, encoding: "utf8" });
  assert.equal(v.status, 0, v.stdout + v.stderr);
  assert.match(v.stdout, /Pacote válido/);

  // acrescentar à mesma matéria: o pedido avisa o que já existe
  const r2 = await gerarResumo(s.db, s.config, { materia: { slug: "neurofisiologia" }, materiais: [{ nome: "aula 3.pdf", bytes: PDF }], rascunho: true });
  assert.equal(r2.ok, true, r2.erro);
  assert.match(fs.readFileSync(path.join(r2.dir, "PEDIDO.md"), "utf8"), /já tem no site[\s\S]*- Neurônio — A célula que conduz/);
  assert.deepEqual([r2.importado.criadas.length, r2.importado.atualizadas.length], [0, 1], "só a nota que mudou (prova) é atualizada");
  await s.fechar();
});

test("gerar: falhas viram mensagens claras e nada é publicado", async () => {
  const s = await subir(comClaudeFalso);
  const base = { materia: { nome: "Bioquímica", semestre: 2 }, materiais: [{ nome: "a.pdf", bytes: PDF }] };
  const notas = () => s.db.prepare("select count(*) c from notas").get().c;

  assert.match((await gerarResumo(s.db, s.config, { ...base, materiais: [] })).erro, /pelo menos um material/);
  assert.match((await gerarResumo(s.db, s.config, { ...base, materia: { nome: "Bioquímica" } })).erro, /semestre/);

  process.env.MODO = "teimoso";
  const teimoso = await gerarResumo(s.db, s.config, base);
  assert.equal(teimoso.ok, false);
  assert.match(teimoso.erro, /continuou com erros/);
  assert.match(teimoso.relatorio, /falta 'resumo'/);
  assert.equal(fs.readFileSync(path.join(teimoso.dir, "chamadas.log"), "utf8").trim().split("\n").length, 3, "uma geração + duas rodadas de correção, e para");

  process.env.MODO = "quebrado";
  const quebrado = await gerarResumo(s.db, s.config, base);
  assert.match(quebrado.erro, /saiu com código 3: credenciais inválidas/);

  process.env.MODO = "lento";
  const controle = new AbortController();
  setTimeout(() => controle.abort(), 400);
  const cancelado = await gerarResumo(s.db, s.config, { ...base, sinal: controle.signal });
  assert.deepEqual([cancelado.ok, cancelado.cancelado], [false, true]);
  delete process.env.MODO;

  const semClaude = await gerarResumo(s.db, { ...s.config, claudeBin: "claude-que-nao-existe-xyz", claudeArgs: null }, base);
  assert.match(semClaude.erro, /não encontrei o Claude Code/);
  assert.equal(notas(), 0);
  await s.fechar();
});

test("gerar pelo painel: envia os materiais, acompanha o log e o conteúdo aparece", async () => {
  const s = await subir(comClaudeFalso);
  const admin = await s.entrar("admin@teste.com", "admin-senha-1");
  assert.equal((await s.enviar(admin, "/api/admin/geracoes", { nome: "Neuro", semestre: "3" }, [])).status, 400);
  assert.equal((await s.enviar(admin, "/api/admin/geracoes", { nome: "Neuro", semestre: "3" }, [{ campo: "materiais", nome: "virus.exe", bytes: PDF }])).status, 400);
  assert.equal((await s.enviar(admin, "/api/admin/geracoes", { nome: "Neuro" }, [{ campo: "materiais", nome: "a.pdf", bytes: PDF }])).status, 400);

  const r = await s.enviar(admin, "/api/admin/geracoes", { nome: "Neuro", semestre: "3", conteudosProva: "sinapse", rascunho: "1" }, [{ campo: "materiais", nome: "a.pdf", bytes: PDF }, { campo: "materiais", nome: "b.pptx", bytes: pptx() }]);
  assert.equal(r.status, 200);
  let g;
  for (let i = 0; i < 100; i++) {
    g = (await s.pedir(admin, "GET", "/api/admin/geracoes/" + r.json.id)).json.geracao;
    if (["concluida", "erro", "cancelada"].includes(g.status)) break;
    await new Promise((ok) => setTimeout(ok, 100));
  }
  assert.equal(g.status, "concluida", g.log);
  assert.deepEqual(g.pedido.materiais, ["a.pdf", "b.pptx"]);
  assert.equal(g.resultado.importado.criadas.length, 2);
  assert.match(g.log, /\[\d\d:\d\d:\d\d\] Abrindo o Claude Code/);
  assert.match(g.log, /Publicado como rascunho/);
  assert.equal((await s.pedir(admin, "GET", "/api/admin/geracoes")).json.geracoes[0].id, r.json.id);
  const mat = (await s.pedir(admin, "GET", "/api/admin/materias")).json.materias[0];
  assert.deepEqual([mat.id, mat.notas, mat.rascunhos], ["neuro", 2, 2], "com 'revisar antes de publicar', entra como rascunho");
  assert.equal((await s.pedir(admin, "POST", "/api/admin/geracoes/" + r.json.id + "/cancelar")).status, 404);
  const cl = (await s.pedir(admin, "GET", "/api/admin/claude")).json;
  assert.equal(typeof cl.disponivel, "boolean");
  await s.fechar();
});
