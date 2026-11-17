// API de ponta a ponta: contas e sessões, leitura, proteções, flashcards ao longo dos dias e o painel admin.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { subir, pacoteAnatomia, pacoteFisiologia, nota, PDF, PNG, semInvisiveis, MIN, DIA } from "./_ajuda.js";
import { lerZip, analisarPacote } from "../src/pacote.js";
import { lerEtiquetas } from "../src/markdown.js";
import { etiquetaDe, garantirAdmin } from "../src/auth.js";
import { abrirDb } from "../src/db.js";

const resumida = ({ novos, aprendendo, revisar, total }) => ({ novos, aprendendo, revisar, total });
const relatorioDe = (r) => r.erros.map((e) => e.msg).join(" | ");

test("contas: login, senha errada, conta desativada, vencida e troca de senha", async () => {
  const s = await subir();
  const { pedir } = s;
  assert.equal((await pedir(null, "GET", "/api/auth/me")).json.user, null);
  assert.equal((await pedir(null, "GET", "/api/biblioteca")).status, 401);
  assert.equal((await pedir(null, "POST", "/api/auth/login", { email: "ana@teste.com", senha: "errada" })).status, 401);
  assert.equal((await pedir(null, "POST", "/api/auth/login", { email: "ninguem@teste.com", senha: "ana-senha-123" })).status, 401);

  const ana = await s.entrar("ANA@teste.com ", "ana-senha-123");
  const eu = (await pedir(ana, "GET", "/api/auth/me")).json.user;
  assert.deepEqual([eu.nome, eu.papel, eu.email], ["Ana", "aluno", "ana@teste.com"]);
  assert.match(eu.etiqueta, /^[0-9a-f]{10}$/);
  assert.equal(eu.senha_hash, undefined, "o hash da senha nunca sai do servidor");

  // sem o cabeçalho anti-CSRF, nenhuma escrita passa
  const semCab = await s.app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie: ana } });
  assert.equal(semCab.statusCode, 403);

  assert.equal((await pedir(ana, "POST", "/api/auth/senha", { atual: "errada", nova: "nova-senha-123" })).status, 401);
  assert.equal((await pedir(ana, "POST", "/api/auth/senha", { atual: "ana-senha-123", nova: "curta" })).status, 400);
  assert.equal((await pedir(ana, "POST", "/api/auth/senha", { atual: "ana-senha-123", nova: "nova-senha-123" })).status, 200);
  await assert.rejects(s.entrar("ana@teste.com", "ana-senha-123"));
  await s.entrar("ana@teste.com", "nova-senha-123");

  const admin = await s.entrar("admin@teste.com", "admin-senha-1");
  const id = eu.id;
  // vencida
  await pedir(admin, "PATCH", "/api/admin/usuarios/" + id, { expiraEm: Date.now() - 1000 });
  assert.equal((await pedir(ana, "GET", "/api/auth/me")).json.user, null, "a sessão aberta deixa de valer");
  const r1 = await pedir(null, "POST", "/api/auth/login", { email: "ana@teste.com", senha: "nova-senha-123" });
  assert.equal(r1.status, 403);
  assert.match(r1.json.error, /venceu/);
  // desativada
  await pedir(admin, "PATCH", "/api/admin/usuarios/" + id, { expiraEm: null, ativo: false });
  const r2 = await pedir(null, "POST", "/api/auth/login", { email: "ana@teste.com", senha: "nova-senha-123" });
  assert.match(r2.json.error, /desativado/);
  await pedir(admin, "PATCH", "/api/admin/usuarios/" + id, { ativo: true });
  const ana2 = await s.entrar("ana@teste.com", "nova-senha-123");
  assert.equal((await pedir(ana2, "POST", "/api/auth/logout")).status, 200);
  assert.equal((await pedir(ana2, "GET", "/api/auth/me")).json.user, null);
  await s.fechar();
});

test("um aluno, um dispositivo: entrar em outro lugar derruba a sessão anterior", async () => {
  const s = await subir();
  const celular = await s.entrar("ana@teste.com", "ana-senha-123");
  s.db.prepare("update sessoes set criado_em = criado_em - 5000").run();
  const notebook = await s.entrar("ana@teste.com", "ana-senha-123");
  assert.equal((await s.pedir(celular, "GET", "/api/auth/me")).json.user, null);
  assert.equal((await s.pedir(notebook, "GET", "/api/auth/me")).json.user.nome, "Ana");
  // o admin pode ficar logado em vários
  const a1 = await s.entrar("admin@teste.com", "admin-senha-1");
  const a2 = await s.entrar("admin@teste.com", "admin-senha-1");
  assert.ok((await s.pedir(a1, "GET", "/api/auth/me")).json.user && (await s.pedir(a2, "GET", "/api/auth/me")).json.user);
  await s.fechar();

  const dois = await subir({ maxSessoes: 2 });
  const c1 = await dois.entrar("ana@teste.com", "ana-senha-123");
  dois.db.prepare("update sessoes set criado_em = criado_em - 5000").run();
  const c2 = await dois.entrar("ana@teste.com", "ana-senha-123");
  assert.ok((await dois.pedir(c1, "GET", "/api/auth/me")).json.user && (await dois.pedir(c2, "GET", "/api/auth/me")).json.user);
  await dois.fechar();
});

test("muitas tentativas de login erradas bloqueiam por um tempo", async () => {
  const s = await subir();
  let ultimo;
  for (let i = 0; i < 11; i++) ultimo = await s.pedir(null, "POST", "/api/auth/login", { email: "ana@teste.com", senha: "chute" + i });
  assert.equal(ultimo.status, 429);
  await s.fechar();
});

test("primeira subida cria um admin com senha aleatória e avisa onde ela está", async () => {
  const s = await subir();
  const dir = fs.mkdtempSync(path.join(s.dataDir, "novo-"));
  const db = abrirDb(dir);
  const linhas = [];
  const r = garantirAdmin(db, { ...s.config, dataDir: dir, adminEmail: "", adminSenha: "" }, (l) => linhas.push(l));
  assert.equal(r.email, "admin@sinapse.local");
  assert.match(r.senha, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  assert.match(fs.readFileSync(path.join(dir, "PRIMEIRO-ACESSO.txt"), "utf8"), new RegExp(r.senha));
  assert.equal(garantirAdmin(db, { ...s.config, dataDir: dir }, () => {}), null, "não recria se já existe");
  db.close();
  await s.fechar();
});

test("leitura: biblioteca, nota com ligações, marcar como lida, modo prova e busca", async () => {
  const s = await subir();
  s.importar(pacoteAnatomia());
  const ana = await s.entrar("ana@teste.com", "ana-senha-123");
  const bib = (await s.pedir(ana, "GET", "/api/biblioteca")).json;
  assert.deepEqual(bib.materias.map((m) => [m.id, m.semestre, m.prova_data]), [["anatomia", 1, "2030-06-10"]]);
  assert.deepEqual(bib.modulos.map((m) => m.titulo), ["Membro Superior", "Membro Inferior"]);
  assert.deepEqual(bib.notas.map((n) => n.titulo), ["Mapa - Membro Superior", "Plexo braquial", "Manguito rotador", "Nervo isquiático"]);
  const plexoBib = bib.notas.find((n) => n.id === "anatomia/plexo-braquial");
  assert.deepEqual([plexoBib.prova, plexoBib.prioridade, plexoBib.cards, plexoBib.mapa], [true, 1, 2, false]);
  assert.equal(bib.notas[0].mapa, true);
  assert.equal(bib.links.length, 5);
  assert.deepEqual(bib.lidas, []);
  assert.ok(!JSON.stringify(bib).includes("Ideia central"), "a biblioteca não carrega o texto das notas");

  const r = await s.pedir(ana, "GET", "/api/notas/anatomia/plexo-braquial");
  assert.equal(r.status, 200);
  assert.equal(r.headers["cache-control"], "no-store");
  const n = r.json;
  assert.equal(n.nota.titulo, "Plexo braquial");
  assert.deepEqual([n.nota.materia.nome, n.nota.modulo.titulo, n.nota.prova, n.nota.lida], ["Anatomia", "Membro Superior", true, false]);
  assert.deepEqual(n.saidas.map((x) => x.titulo), ["Manguito rotador"]);
  assert.deepEqual(n.entradas.map((x) => x.titulo), ["Manguito rotador", "Mapa - Membro Superior", "Nervo isquiático"]);
  assert.deepEqual([n.anterior.titulo, n.proxima.titulo], ["Mapa - Membro Superior", "Manguito rotador"]);
  assert.equal(n.cards, 2);
  assert.deepEqual(n.cartas.map((c) => [semInvisiveis(c.frente), semInvisiveis(c.verso)]), [["<p>Pergunta 1 sobre Plexo braquial?</p>", "<p>Resposta 1.</p>"], ["<p>Pergunta 2 sobre Plexo braquial?</p>", "<p>Resposta 2.</p>"]]);
  const html = semInvisiveis(n.html);
  assert.match(html, /callout-ideia/);
  assert.match(html, /<a class="wl" href="\/nota\/anatomia\/manguito-rotador"[^>]*>manguito<\/a>/);
  assert.match(html, /class="questao" data-correta="1"/);
  assert.ok(!html.includes("Pergunta 1 sobre"), "flashcards não aparecem no texto");
  assert.deepEqual(lerEtiquetas(n.html), [etiquetaDe(n.nota && (await s.pedir(ana, "GET", "/api/auth/me")).json.user.id)], "o texto do aluno sai com a etiqueta invisível dele");

  assert.equal((await s.pedir(ana, "POST", "/api/notas/anatomia/plexo-braquial/lida", {})).status, 200);
  assert.deepEqual((await s.pedir(ana, "GET", "/api/biblioteca")).json.lidas, ["anatomia/plexo-braquial"]);
  assert.equal((await s.pedir(ana, "GET", "/api/notas/anatomia/plexo-braquial")).json.nota.lida, true);
  await s.pedir(ana, "POST", "/api/notas/anatomia/plexo-braquial/lida", { lida: false });
  assert.deepEqual((await s.pedir(ana, "GET", "/api/biblioteca")).json.lidas, []);
  assert.deepEqual((await s.pedir(ana, "GET", "/api/recentes")).json.recentes.map((x) => x.titulo), ["Plexo braquial"]);
  assert.equal((await s.pedir(ana, "GET", "/api/notas/anatomia/nao-existe")).status, 404);

  const prova = (await s.pedir(ana, "GET", "/api/prova/anatomia")).json;
  assert.deepEqual([prova.materia.provaData, prova.materia.provaFoco], ["2030-06-10", "Plexo braquial e manguito."]);
  assert.deepEqual(prova.notas.map((x) => [x.titulo, x.prioridade]), [["Plexo braquial", 1], ["Nervo isquiático", 2]], "alta prioridade primeiro");
  assert.match(semInvisiveis(prova.notas[0].essencial[0]), /Raízes C5 a T1/);
  assert.deepEqual(prova.dicas.map((d) => [d.nota.titulo, d.titulo]), [["Plexo braquial", "Pegadinha"]]);
  assert.equal(prova.questoes.length, 1);
  assert.equal((await s.pedir(ana, "GET", "/api/prova/nao-existe")).status, 404);

  const busca = async (q) => (await s.pedir(ana, "GET", "/api/busca?q=" + encodeURIComponent(q))).json.resultados.map((x) => x.titulo);
  assert.deepEqual(await busca("isquiatico"), ["Nervo isquiático"], "sem acento também acha");
  assert.deepEqual(await busca("FASCICULO posterior"), ["Plexo braquial"], "procura dentro do texto");
  assert.deepEqual(await busca("zzzz"), []);
  assert.deepEqual(await busca("a"), []);
  await s.fechar();
});

test("permissões: rascunho só o admin vê; aluno com matérias restritas só vê as dele", async () => {
  const s = await subir();
  s.importar(pacoteAnatomia());
  s.importar(pacoteFisiologia(), { publicada: false });
  const admin = await s.entrar("admin@teste.com", "admin-senha-1");
  const ana = await s.entrar("ana@teste.com", "ana-senha-123");
  const mats = async (c) => (await s.pedir(c, "GET", "/api/biblioteca")).json.materias.map((m) => m.id);
  assert.deepEqual(await mats(ana), ["anatomia"], "matéria só com rascunhos não aparece para o aluno");
  assert.deepEqual(await mats(admin), ["anatomia", "fisiologia"]);
  assert.equal((await s.pedir(ana, "GET", "/api/notas/fisiologia/potencial-de-acao")).status, 404);
  assert.equal((await s.pedir(admin, "GET", "/api/notas/fisiologia/potencial-de-acao")).status, 200);
  assert.equal((await s.pedir(ana, "GET", "/api/flashcards/proxima?materia=fisiologia")).json.carta, null);

  assert.equal((await s.pedir(admin, "POST", "/api/admin/materias/fisiologia/publicar")).json.publicadas, 1);
  assert.deepEqual(await mats(ana), ["anatomia", "fisiologia"]);
  const fis = (await s.pedir(ana, "GET", "/api/notas/fisiologia/potencial-de-acao")).json;
  assert.deepEqual(fis.saidas.map((x) => x.id), ["anatomia/plexo-braquial"], "ligação entre matérias");

  // restringe a Ana à fisiologia
  const id = (await s.pedir(ana, "GET", "/api/auth/me")).json.user.id;
  await s.pedir(admin, "PATCH", "/api/admin/usuarios/" + id, { acessoTotal: false, materias: ["fisiologia"] });
  assert.deepEqual(await mats(ana), ["fisiologia"]);
  assert.equal((await s.pedir(ana, "GET", "/api/notas/anatomia/plexo-braquial")).status, 404);
  assert.equal((await s.pedir(ana, "GET", "/api/prova/anatomia")).status, 404);
  assert.equal((await s.pedir(ana, "GET", "/api/anexos/anatomia/anexos/plexo.png")).status, 404);
  assert.equal((await s.pedir(ana, "GET", "/api/flashcards/proxima?materia=anatomia")).status, 404);
  assert.deepEqual((await s.pedir(ana, "GET", "/api/busca?q=plexo")).json.resultados.map((x) => x.id), ["fisiologia/potencial-de-acao"]);
  const fis2 = (await s.pedir(ana, "GET", "/api/notas/fisiologia/potencial-de-acao")).json;
  assert.deepEqual(fis2.saidas, [], "não vaza a existência de notas de matéria bloqueada");
  assert.match(semInvisiveis(fis2.html), /wl-falta/);

  // nada do painel abre para aluno
  for (const [m, u] of [["GET", "/api/admin/usuarios"], ["GET", "/api/admin/materias"], ["GET", "/api/admin/materias/anatomia/exportar"], ["GET", "/api/admin/acessos"], ["DELETE", "/api/admin/materias/anatomia"]])
    assert.equal((await s.pedir(ana, m, u)).status, 403, m + " " + u);
  assert.equal((await s.pedir(null, "GET", "/api/admin/usuarios")).status, 401);
  await s.fechar();
});

test("proteção: figuras só com sessão, PDF só embaralhado, teto de notas abertas e registro de acessos", async () => {
  const s = await subir({ leiturasPor10Min: 3 });
  s.importar(pacoteAnatomia({ "02 - Membro Inferior/05 - Resumo do joelho.pdf": PDF }));
  const ana = await s.entrar("ana@teste.com", "ana-senha-123");
  const admin = await s.entrar("admin@teste.com", "admin-senha-1");

  assert.equal((await s.pedir(null, "GET", "/api/anexos/anatomia/anexos/plexo.png")).status, 401);
  const img = await s.pedir(ana, "GET", "/api/anexos/anatomia/anexos/plexo.png");
  assert.equal(img.status, 200);
  assert.equal(img.headers["content-type"], "image/png");
  assert.ok(img.bruto.equals(PNG));
  assert.equal((await s.pedir(ana, "GET", "/api/anexos/anatomia/anexos/../../sinapse.db")).status, 404);
  assert.equal((await s.pedir(ana, "GET", "/api/anexos/anatomia/anexos/pdf/resumo-do-joelho.pdf")).status, 403, "o PDF não sai pela rota de anexos");

  const pdf = await s.pedir(ana, "GET", "/api/pdf/anatomia/resumo-do-joelho");
  assert.equal(pdf.status, 200);
  assert.ok(!pdf.bruto.subarray(0, 5).equals(Buffer.from("%PDF-")), "o que trafega não é um PDF que abre");
  const chave = Buffer.from(pdf.headers["x-chave"], "hex");
  const aberto = Buffer.from(pdf.bruto.map((b, i) => b ^ chave[i % 32]));
  assert.ok(aberto.equals(PDF), "o leitor consegue desembaralhar");
  assert.equal((await s.pedir(ana, "GET", "/api/pdf/anatomia/plexo-braquial")).status, 404);
  assert.equal((await s.pedir(ana, "GET", "/api/notas/anatomia/resumo-do-joelho")).json.nota.pdf, true);

  // já abriu 1 nota (o PDF). Mais duas e chega ao teto de 3 em 10 minutos.
  assert.equal((await s.pedir(ana, "GET", "/api/notas/anatomia/plexo-braquial")).status, 200);
  assert.equal((await s.pedir(ana, "GET", "/api/notas/anatomia/manguito-rotador")).status, 200);
  const barrado = await s.pedir(ana, "GET", "/api/notas/anatomia/nervo-isquiatico");
  assert.equal(barrado.status, 429);
  assert.match(barrado.json.error, /muitas notas/);
  assert.equal((await s.pedir(ana, "GET", "/api/notas/anatomia/plexo-braquial")).status, 200, "reabrir o que já estava aberto não conta");
  assert.equal((await s.pedir(admin, "GET", "/api/notas/anatomia/nervo-isquiatico")).status, 200, "o admin não tem teto");
  // passados 10 minutos, libera
  s.db.prepare("update acessos set em = em - ?").run(11 * MIN);
  assert.equal((await s.pedir(ana, "GET", "/api/notas/anatomia/nervo-isquiatico")).status, 200);

  const aud = (await s.pedir(admin, "GET", "/api/admin/acessos")).json;
  const linhaAna = aud.porUsuario.find((u) => u.email === "ana@teste.com");
  assert.equal(linhaAna.dia, 4);
  assert.equal(linhaAna.bloqueios, 1);
  assert.ok(aud.recentes.some((a) => a.tipo === "bloqueio" && a.nome === "Ana"));

  // rastrear um vazamento: o trecho copiado da tela da Ana aponta para a Ana
  const html = (await s.pedir(ana, "GET", "/api/notas/anatomia/plexo-braquial")).json.html;
  const rastro = (await s.pedir(admin, "POST", "/api/admin/rastrear", { texto: html.slice(0, 600) })).json;
  assert.deepEqual(rastro.usuarios.map((u) => u.email), ["ana@teste.com"]);
  const idAna = (await s.pedir(ana, "GET", "/api/auth/me")).json.user;
  assert.deepEqual((await s.pedir(admin, "POST", "/api/admin/rastrear", { texto: "print com o código " + idAna.etiqueta })).json.usuarios.map((u) => u.email), ["ana@teste.com"], "o código da marca d'água visível também serve");
  assert.deepEqual((await s.pedir(admin, "POST", "/api/admin/rastrear", { texto: "nada aqui" })).json.usuarios, []);
  await s.fechar();
});

test("flashcards: a fila segue o Anki ao longo dos dias, por aluno e por matéria", async () => {
  const s = await subir();
  s.importar(pacoteAnatomia());
  s.importar(pacoteFisiologia());
  const ana = await s.entrar("ana@teste.com", "ana-senha-123");
  const prox = async (extra = "") => (await s.pedir(ana, "GET", "/api/flashcards/proxima?materia=anatomia" + extra)).json;
  const resp = async (carta, resposta, extra = {}) => (await s.pedir(ana, "POST", "/api/flashcards/responder", { materia: "anatomia", carta, resposta, ...extra })).json;

  const baralhos = (await s.pedir(ana, "GET", "/api/flashcards/baralhos")).json;
  assert.deepEqual(baralhos.baralhos.map((b) => [b.materia, b.novos, b.aprendendo, b.revisar, b.total, b.deProva]), [["anatomia", 6, 0, 0, 6, 4], ["fisiologia", 2, 0, 0, 2, 0]]);
  assert.deepEqual([baralhos.estatisticas.feitasHoje, baralhos.estatisticas.sequencia, baralhos.estatisticas.retencao], [0, 0, null]);

  let p = await prox();
  assert.deepEqual(resumida(p.contagem), { novos: 6, aprendendo: 0, revisar: 0, total: 6 });
  assert.equal(p.carta.estado, "novo");
  assert.match(p.carta.frente, /Pergunta 1 sobre Plexo braquial/, "cartas novas vêm na ordem das notas");
  assert.match(p.carta.verso, /Resposta 1/);
  assert.equal(p.carta.nota.id, "anatomia/plexo-braquial");
  assert.deepEqual(p.previsoes, { 1: "1 min", 2: "6 min", 3: "10 min", 4: "4 d" });
  const c1 = p.carta.id;

  // Bom na 1ª carta: entra em aprendizado (10 min). A próxima é outra carta nova.
  p = await resp(c1, 3);
  assert.deepEqual(p.agendada.estado, "aprendendo");
  assert.deepEqual(resumida(p.contagem), { novos: 5, aprendendo: 1, revisar: 0, total: 6 });
  assert.notEqual(p.carta.id, c1);
  const c2 = p.carta.id;
  // Fácil na 2ª: forma direto com 4 dias.
  p = await resp(c2, 4);
  assert.deepEqual([p.agendada.estado, p.agendada.intervalo], ["revisao", 4]);
  // De novo na 3ª: volta em 1 minuto.
  const c3 = p.carta.id;
  p = await resp(c3, 1);
  assert.deepEqual(resumida(p.contagem), { novos: 3, aprendendo: 2, revisar: 0, total: 6 });

  // 2 minutos depois, a carta que errou tem prioridade sobre as novas
  s.relogio.t += 2 * MIN;
  p = await prox();
  assert.equal(p.carta.id, c3);
  assert.deepEqual(p.previsoes, { 1: "1 min", 2: "6 min", 3: "10 min", 4: "4 d" });
  p = await resp(c3, 3);
  // 10 minutos depois, c1 e c3 voltam do aprendizado; Bom forma as duas com 1 dia
  s.relogio.t += 11 * MIN;
  p = await prox();
  assert.equal(p.carta.id, c1);
  assert.deepEqual(p.previsoes, { 1: "1 min", 2: "10 min", 3: "1 d", 4: "4 d" });
  p = await resp(c1, 3);
  assert.deepEqual([p.agendada.estado, p.agendada.intervalo], ["revisao", 1]);
  assert.equal(p.carta.id, c3);
  p = await resp(c3, 3);
  // faz as 3 novas que sobraram com Fácil
  while (p.carta) p = await resp(p.carta.id, 4);
  assert.deepEqual(resumida(p.contagem), { novos: 0, aprendendo: 0, revisar: 0, total: 6 });
  assert.equal(p.proximaEm, null);

  // o progresso é só da Ana, e só da anatomia
  const admin = await s.entrar("admin@teste.com", "admin-senha-1");
  assert.equal((await s.pedir(admin, "GET", "/api/flashcards/proxima?materia=anatomia")).json.contagem.novos, 6);
  assert.equal((await s.pedir(ana, "GET", "/api/flashcards/proxima?materia=fisiologia")).json.contagem.novos, 2);

  // no dia seguinte: vencem as duas cartas de 1 dia; as de 4 dias, não
  s.relogio.t += DIA;
  p = await prox();
  assert.deepEqual(resumida(p.contagem), { novos: 0, aprendendo: 0, revisar: 2, total: 6 });
  assert.equal(p.carta.estado, "revisao");
  assert.deepEqual(p.previsoes, { 1: "10 min", 2: "2 d", 3: "3 d", 4: "4 d" }, "intervalo 1 d, facilidade 2,5: Difícil 2, Bom 3, Fácil 4");
  const revisada = p.carta.id;
  p = await resp(revisada, 3);
  assert.equal(p.agendada.estado, "revisao");
  assert.ok(p.agendada.intervalo >= 2 && p.agendada.intervalo <= 4, "3 dias com a variação do Anki: " + p.agendada.intervalo);
  // erra a outra: vira reaprendizado, conta como lapso
  const errada = p.carta.id;
  p = await resp(errada, 1);
  assert.equal(p.agendada.estado, "reaprendendo");
  const linha = s.db.prepare("select * from estados_card where card_id = ?").get(errada);
  assert.deepEqual([linha.lapsos, linha.intervalo, Math.round(linha.facilidade * 100)], [1, 1, 230]);
  assert.equal(p.carta.id, errada, "sem mais nada na fila, a carta em reaprendizado volta antes do tempo (como no Anki)");

  const est = (await s.pedir(ana, "GET", "/api/flashcards/baralhos")).json.estatisticas;
  assert.equal(est.feitasHoje, 2);
  assert.equal(est.sequencia, 2, "estudou ontem e hoje");
  assert.equal(est.retencao, 50, "uma revisão certa e uma errada");
  assert.equal(est.semana.length, 7);
  assert.equal(est.semana[6].n, 2);

  assert.equal((await s.pedir(ana, "POST", "/api/flashcards/responder", { materia: "anatomia", carta: "nao-existe", resposta: 3 })).status, 404);
  assert.equal((await s.pedir(ana, "POST", "/api/flashcards/responder", { materia: "anatomia", carta: c1, resposta: 9 })).status, 400);
  await s.fechar();
});

test("flashcards: teto de 20 novas por dia; estudo por nota e modo prova não têm teto", async () => {
  const s = await subir();
  const muitas = {};
  for (let i = 0; i < 5; i++) muitas[`03 - Extra/0${i} - Nota ${i}.md`] = nota({ titulo: "Nota extra " + i, cards: 5, corpo: "x ".repeat(60) + "[[Plexo braquial]]" });
  s.importar(pacoteAnatomia(muitas));
  const ana = await s.entrar("ana@teste.com", "ana-senha-123");
  let p = (await s.pedir(ana, "GET", "/api/flashcards/proxima?materia=anatomia")).json;
  assert.deepEqual([p.contagem.novos, p.contagem.total], [20, 31]);
  for (let i = 0; i < 20; i++) p = (await s.pedir(ana, "POST", "/api/flashcards/responder", { materia: "anatomia", carta: p.carta.id, resposta: 4 })).json;
  assert.equal(p.carta, null);
  assert.equal(p.contagem.novos, 0, "as 11 restantes ficam para amanhã");

  // modo prova: só cartas de notas de prova (plexo e isquiático: 4), e sem teto
  const prova = (await s.pedir(ana, "GET", "/api/flashcards/proxima?materia=anatomia&modo=prova")).json;
  assert.equal(prova.contagem.total, 4);
  // estudo dirigido de uma nota que ainda tem cartas novas
  const pendente = s.db.prepare("select f.nota_id from flashcards f left join estados_card e on e.card_id = f.id where e.card_id is null limit 1").get().nota_id;
  const daNota = (await s.pedir(ana, "GET", "/api/flashcards/proxima?materia=anatomia&nota=" + encodeURIComponent(pendente))).json;
  assert.ok(daNota.carta && daNota.carta.nota.id === pendente);
  assert.ok(daNota.contagem.novos > 0);
  // no dia seguinte o teto renova
  s.relogio.t += DIA;
  assert.equal((await s.pedir(ana, "GET", "/api/flashcards/proxima?materia=anatomia")).json.contagem.novos, 11);
  await s.fechar();
});

test("admin: criar e gerir acessos", async () => {
  const s = await subir();
  s.importar(pacoteAnatomia());
  const admin = await s.entrar("admin@teste.com", "admin-senha-1");
  const criado = (await s.pedir(admin, "POST", "/api/admin/usuarios", { nome: "Bia", email: "Bia@Teste.com", acessoTotal: false, materias: ["anatomia"], expiraEm: Date.now() + 30 * DIA })).json;
  assert.match(criado.senha, /^[a-z2-9-]{14}$/, "senha gerada, mostrada uma vez");
  assert.deepEqual([criado.usuario.email, criado.usuario.papel, criado.usuario.acessoTotal, criado.usuario.materias], ["bia@teste.com", "aluno", false, ["anatomia"]]);
  const bia = await s.entrar("bia@teste.com", criado.senha);
  assert.equal((await s.pedir(bia, "GET", "/api/biblioteca")).json.materias.length, 1);
  assert.equal((await s.pedir(admin, "POST", "/api/admin/usuarios", { nome: "Bia 2", email: "bia@teste.com" })).status, 409);
  assert.equal((await s.pedir(admin, "POST", "/api/admin/usuarios", { nome: "X", email: "x@x.com", senha: "123" })).status, 400);

  const lista = (await s.pedir(admin, "GET", "/api/admin/usuarios")).json.usuarios;
  assert.deepEqual(lista.map((u) => u.nome), ["Admin", "Ana", "Bia"]);
  assert.equal(lista.find((u) => u.nome === "Bia").sessoes, 1);
  assert.ok(!JSON.stringify(lista).includes("scrypt"));

  // trocar a senha derruba a sessão
  const nova = (await s.pedir(admin, "PATCH", "/api/admin/usuarios/" + criado.usuario.id, { novaSenha: true })).json.senha;
  assert.equal((await s.pedir(bia, "GET", "/api/auth/me")).json.user, null);
  await s.entrar("bia@teste.com", nova);
  // o admin não se desativa, não se rebaixa nem se apaga
  const eu = lista.find((u) => u.papel === "admin");
  assert.equal((await s.pedir(admin, "PATCH", "/api/admin/usuarios/" + eu.id, { ativo: false })).status, 400);
  assert.equal((await s.pedir(admin, "PATCH", "/api/admin/usuarios/" + eu.id, { papel: "aluno" })).status, 400);
  assert.equal((await s.pedir(admin, "DELETE", "/api/admin/usuarios/" + eu.id)).status, 400);
  assert.equal((await s.pedir(admin, "DELETE", "/api/admin/usuarios/" + criado.usuario.id)).status, 200);
  await assert.rejects(s.entrar("bia@teste.com", nova));
  await s.fechar();
});

test("admin: importar pacote pelo painel (validar antes, erros bloqueiam), exportar e token de API", async () => {
  const s = await subir();
  const admin = await s.entrar("admin@teste.com", "admin-senha-1");
  const zip = s.zipar(pacoteAnatomia());

  const previa = (await s.enviar(admin, "/api/admin/validar", {}, [{ nome: "anatomia.zip", bytes: zip }])).json;
  assert.deepEqual([previa.ok, previa.materiaExiste, previa.resumo.notas, previa.notas.every((n) => n.nova)], [true, false, 4, true]);
  assert.equal(s.db.prepare("select count(*) c from notas").get().c, 0, "validar não grava nada");

  const ruim = await s.enviar(admin, "/api/admin/importar", {}, [{ nome: "ruim.zip", bytes: s.zipar(pacoteAnatomia({ "01 - Membro Superior/09 - Sem resumo.md": "---\nprova: false\n---\ntexto" })) }]);
  assert.equal(ruim.status, 422);
  assert.match(ruim.json.relatorio, /falta 'resumo'/);
  assert.equal(s.db.prepare("select count(*) c from notas").get().c, 0, "pacote com erro não entra nem pela metade");
  assert.equal((await s.enviar(admin, "/api/admin/importar", {}, [{ nome: "x.zip", bytes: Buffer.from("não é zip") }])).status, 400);

  const ok = await s.enviar(admin, "/api/admin/importar", { modo: "mesclar", rascunho: "1" }, [{ nome: "anatomia.zip", bytes: zip }]);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.importado.criadas.length, 4);
  assert.equal(s.db.prepare("select count(*) c from notas where publicada = 0").get().c, 4, "entrou como rascunho");
  const depois = (await s.enviar(admin, "/api/admin/validar", {}, [{ nome: "anatomia.zip", bytes: zip }])).json;
  assert.deepEqual([depois.materiaExiste, depois.notas.some((n) => n.nova)], [true, false]);

  const mats = (await s.pedir(admin, "GET", "/api/admin/materias")).json.materias;
  assert.deepEqual(mats.map((m) => [m.id, m.notas, m.deProva, m.rascunhos, m.flashcards]), [["anatomia", 4, 2, 4, 6]]);

  const exp = await s.pedir(admin, "GET", "/api/admin/materias/anatomia/exportar");
  assert.equal(exp.status, 200);
  assert.match(exp.headers["content-disposition"], /anatomia\.zip/);
  assert.equal(analisarPacote(lerZip(exp.bruto)).resumo.notas, 4);

  // token de API: é como a CLI (ou outra instância do Claude) publica num site hospedado
  const tk = (await s.pedir(admin, "POST", "/api/admin/tokens", { nome: "notebook" })).json;
  assert.match(tk.token, /^snp_/);
  const m = await s.enviar(null, "/api/admin/importar", {}, [{ nome: "f.zip", bytes: s.zipar(pacoteFisiologia()) }], { authorization: "Bearer " + tk.token });
  assert.equal(m.status, 200);
  assert.equal((await s.enviar(null, "/api/admin/importar", {}, [{ nome: "f.zip", bytes: zip }], { authorization: "Bearer snp_errado" })).status, 401);
  assert.ok((await s.pedir(admin, "GET", "/api/admin/tokens")).json.tokens[0].ultimoUso > 0);
  await s.pedir(admin, "DELETE", "/api/admin/tokens/" + tk.id);
  assert.equal((await s.enviar(null, "/api/admin/importar", {}, [{ nome: "f.zip", bytes: zip }], { authorization: "Bearer " + tk.token })).status, 401);
  await s.fechar();
});

test("admin: editar matéria e notas, marcar conteúdo de prova, criar nota e subir PDF direto", async () => {
  const s = await subir();
  s.importar(pacoteAnatomia());
  const admin = await s.entrar("admin@teste.com", "admin-senha-1");
  const ana = await s.entrar("ana@teste.com", "ana-senha-123");

  assert.equal((await s.pedir(admin, "PATCH", "/api/admin/materias/anatomia", { semestre: 3, provaData: "2030-07-01", provaFoco: "Só o plexo.", cor: "#123abc" })).status, 200);
  assert.equal((await s.pedir(admin, "PATCH", "/api/admin/materias/anatomia", { provaData: "amanhã" })).status, 400);
  const prova = (await s.pedir(ana, "GET", "/api/prova/anatomia")).json;
  assert.deepEqual([prova.materia.semestre, prova.materia.provaData, prova.materia.provaFoco], [3, "2030-07-01", "Só o plexo."]);

  // marcar e desmarcar conteúdo de prova direto na lista
  const lista = (await s.pedir(admin, "GET", "/api/admin/materias/anatomia/notas")).json.notas;
  assert.deepEqual(lista.map((n) => [n.titulo, n.prova, n.modulo, n.cards]), [["Mapa - Membro Superior", false, "Membro Superior", 0], ["Plexo braquial", true, "Membro Superior", 2], ["Manguito rotador", false, "Membro Superior", 2], ["Nervo isquiático", true, "Membro Inferior", 2]]);
  await s.pedir(admin, "PATCH", "/api/admin/notas/anatomia/manguito-rotador", { prova: true, prioridade: 1 });
  await s.pedir(admin, "PATCH", "/api/admin/notas/anatomia/nervo-isquiatico", { prova: false });
  assert.deepEqual((await s.pedir(ana, "GET", "/api/prova/anatomia")).json.notas.map((n) => n.titulo), ["Plexo braquial", "Manguito rotador"]);
  // despublicar esconde do aluno na hora
  await s.pedir(admin, "PATCH", "/api/admin/notas/anatomia/manguito-rotador", { publicada: false });
  assert.equal((await s.pedir(ana, "GET", "/api/notas/anatomia/manguito-rotador")).status, 404);
  assert.match(semInvisiveis((await s.pedir(ana, "GET", "/api/notas/anatomia/plexo-braquial")).json.html), /<span class="wl-falta"[^>]*>manguito/, "o link para a nota escondida vira texto");
  await s.pedir(admin, "PATCH", "/api/admin/notas/anatomia/manguito-rotador", { publicada: true });

  // editar o texto: prévia mostra erros e avisos antes de salvar
  const fonte = (await s.pedir(admin, "GET", "/api/admin/notas/anatomia/manguito-rotador")).json.nota;
  assert.match(fonte.md, /\[!flashcard\]/, "o admin edita a fonte completa, com as cartas");
  const previa = (await s.pedir(admin, "POST", "/api/admin/previa", { materia: "anatomia", titulo: "Manguito rotador", prova: true, md: "Texto novo com [[Plexo braquial]] e [[Inexistente]].\n\n> [!flashcard] Só pergunta\n" })).json;
  assert.match(previa.html, /href="\/nota\/anatomia\/plexo-braquial"/);
  assert.ok(previa.erros.some((e) => /flashcard 1/.test(e)));
  assert.ok(previa.avisos.some((a) => /Inexistente/.test(a)) && previa.avisos.some((a) => /essencial/.test(a)));
  assert.equal((await s.pedir(admin, "PUT", "/api/admin/notas/anatomia/manguito-rotador", { ...fonte, md: "> [!flashcard] Só pergunta\n" })).status, 400);

  const cartaAntiga = s.db.prepare("select id from flashcards where nota_id = 'anatomia/manguito-rotador' order by ordem").get().id;
  const novoMd = fonte.md.replace("Supraespinal", "SUPRAESPINAL") + "\n\n> [!flashcard] Carta nova?\n> Sim.\n";
  const salvo = await s.pedir(admin, "PUT", "/api/admin/notas/anatomia/manguito-rotador", { ...fonte, titulo: "Manguito rotador (ombro)", resumo: "Resumo editado.", md: novoMd, modulo: "Ombro" });
  assert.equal(salvo.status, 200);
  const lida = (await s.pedir(ana, "GET", "/api/notas/anatomia/manguito-rotador")).json;
  assert.deepEqual([lida.nota.titulo, lida.nota.resumo, lida.nota.modulo.titulo, lida.cards], ["Manguito rotador (ombro)", "Resumo editado.", "Ombro", 3]);
  assert.match(lida.html, /SUPRAESPINAL/);
  assert.ok(s.db.prepare("select 1 from flashcards where id = ?").get(cartaAntiga), "as cartas que não mudaram continuam as mesmas");
  assert.match(semInvisiveis((await s.pedir(ana, "GET", "/api/notas/anatomia/plexo-braquial")).json.html), /href="\/nota\/anatomia\/manguito-rotador"/, "os links antigos continuam achando a nota renomeada");

  // nota nova pelo painel
  const criada = await s.pedir(admin, "POST", "/api/admin/notas/anatomia", { titulo: "Nervo radial", resumo: "Estende o punho.", modulo: "Ombro", md: "Sai do [[Plexo braquial]].\n\n> [!flashcard] O que o radial faz?\n> Estende.\n", prova: true });
  assert.deepEqual(criada.json, { id: "anatomia/nervo-radial", slug: "nervo-radial" });
  assert.equal((await s.pedir(admin, "POST", "/api/admin/notas/anatomia", { titulo: "Nervo Radial", resumo: "x", md: "" })).status, 409);
  assert.equal((await s.pedir(admin, "POST", "/api/admin/notas/anatomia", { titulo: "Sem resumo", md: "x" })).status, 400);
  assert.ok((await s.pedir(ana, "GET", "/api/notas/anatomia/plexo-braquial")).json.entradas.some((x) => x.titulo === "Nervo radial"));

  // PDF direto
  const semPdf = await s.enviar(admin, "/api/admin/pdf", { materia: "anatomia", titulo: "X" }, [{ nome: "x.pdf", bytes: Buffer.from("isto não é pdf") }]);
  assert.equal(semPdf.status, 400);
  const pdf = await s.enviar(admin, "/api/admin/pdf", { materia: "anatomia", titulo: "Resumão do ombro", modulo: "Ombro", resumo: "PDF do professor.", prova: "1" }, [{ nome: "ombro.pdf", bytes: PDF }]);
  assert.equal(pdf.status, 200);
  const notaPdf = (await s.pedir(ana, "GET", "/api/notas/anatomia/resumao-do-ombro")).json;
  assert.deepEqual([notaPdf.nota.pdf, notaPdf.nota.prova, notaPdf.nota.modulo.titulo], [true, true, "Ombro"]);
  assert.equal((await s.pedir(ana, "GET", "/api/pdf/anatomia/resumao-do-ombro")).status, 200);

  // apagar nota e matéria
  assert.equal((await s.pedir(admin, "DELETE", "/api/admin/notas/anatomia/nervo-radial")).status, 200);
  assert.equal((await s.pedir(ana, "GET", "/api/notas/anatomia/nervo-radial")).status, 404);
  assert.equal((await s.pedir(admin, "DELETE", "/api/admin/materias/anatomia")).status, 200);
  assert.deepEqual((await s.pedir(ana, "GET", "/api/biblioteca")).json.materias, []);
  assert.ok(!fs.existsSync(path.join(s.dataDir, "anexos", "anatomia")), "os arquivos da matéria somem do disco");
  assert.equal(s.db.prepare("select count(*) c from flashcards").get().c, 0);
  await s.fechar();
});

test("cabeçalhos de segurança e rotas desconhecidas", async () => {
  const s = await subir();
  const r = await s.pedir(null, "GET", "/api/saude");
  assert.equal(r.headers["x-content-type-options"], "nosniff");
  assert.match(r.headers["x-robots-tag"], /noindex/);
  assert.equal((await s.pedir(null, "GET", "/api/nao-existe")).status, 404);
  assert.deepEqual((await s.pedir(null, "GET", "/api/config")).json, { nome: "Sinapse", protecao: { desfocar: true } });
  await s.fechar();
});

test("avaliações: cada módulo é da N1 ou da N2, com prova, cartas e filtro próprios", async () => {
  const s = await subir();
  const yml = ["formato: 1", "slug: anatomia", "nome: Anatomia", "semestre: 1", "prova:", "  n1:", "    data: 2030-04-10", "    foco: Membro superior.", "  n2:", "    data: 2030-06-20", "    foco: Membro inferior.", "modulos:", '  - pasta: "02 - Membro Inferior"', "    avaliacao: N2", ""].join("\n");
  s.importar(pacoteAnatomia({ "materia.yml": yml }));
  const ana = await s.entrar("ana@teste.com", "ana-senha-123");
  const admin = await s.entrar("admin@teste.com", "admin-senha-1");
  const modulos = async () => (await s.pedir(ana, "GET", "/api/biblioteca")).json.modulos.map((m) => [m.titulo, m.avaliacao]);
  const prova = async (av) => (await s.pedir(ana, "GET", "/api/prova/anatomia" + (av ? "?av=" + av : ""))).json;

  const bib = (await s.pedir(ana, "GET", "/api/biblioteca")).json;
  assert.deepEqual(await modulos(), [["Membro Superior", "n1"], ["Membro Inferior", "n2"]]);
  assert.deepEqual([bib.materias[0].prova_data, bib.materias[0].n2_data], ["2030-04-10", "2030-06-20"]);

  // modo prova: cada avaliação com as suas notas, a sua data e o seu foco
  const n1 = await prova("n1");
  assert.deepEqual([n1.av, n1.notas.map((n) => n.titulo), n1.materia.provaData, n1.materia.provaFoco], ["n1", ["Plexo braquial"], "2030-04-10", "Membro superior."]);
  assert.deepEqual(n1.avaliacoes, [{ av: "n1", notas: 1, data: "2030-04-10" }, { av: "n2", notas: 1, data: "2030-06-20" }]);
  assert.deepEqual([n1.dicas.length, n1.questoes.length], [1, 1]);
  const n2 = await prova("n2");
  assert.deepEqual([n2.av, n2.notas.map((n) => n.titulo), n2.materia.provaData, n2.materia.provaFoco], ["n2", ["Nervo isquiático"], "2030-06-20", "Membro inferior."]);
  assert.deepEqual([n2.dicas.length, n2.questoes.length], [0, 0]);
  assert.equal((await prova()).av, "n1", "sem escolher, abre a prova marcada mais próxima");

  // flashcards: dá para estudar só as cartas de uma avaliação
  const cartas = async (av) => (await s.pedir(ana, "GET", "/api/flashcards/proxima?materia=anatomia&av=" + av)).json.contagem.total;
  assert.deepEqual([await cartas("n1"), await cartas("n2")], [4, 2]);
  const baralho = (await s.pedir(ana, "GET", "/api/flashcards/baralhos")).json.baralhos[0];
  assert.deepEqual(baralho.avaliacoes, [{ av: "n1", cartas: 4 }, { av: "n2", cartas: 2 }]);

  // um pacote que não fala de avaliação não desfaz a separação
  s.importar(pacoteAnatomia());
  assert.deepEqual(await modulos(), [["Membro Superior", "n1"], ["Membro Inferior", "n2"]]);

  // painel: a matéria inteira para a N2, depois um módulo de volta para a N1
  assert.equal((await s.pedir(admin, "POST", "/api/admin/materias/anatomia/avaliacao", { avaliacao: "n2" })).json.alterados, 2);
  assert.deepEqual(await modulos(), [["Membro Superior", "n2"], ["Membro Inferior", "n2"]]);
  const tudoN2 = await prova("n1");
  assert.deepEqual([tudoN2.av, tudoN2.notas.length, tudoN2.avaliacoes.length], ["n2", 2, 1], "pedir uma avaliação vazia cai na que tem conteúdo");
  assert.equal((await s.pedir(admin, "POST", "/api/admin/materias/anatomia/avaliacao", { avaliacao: "N1", modulo: "membro-superior" })).json.alterados, 1);
  assert.deepEqual(await modulos(), [["Membro Superior", "n1"], ["Membro Inferior", "n2"]]);
  assert.equal((await s.pedir(admin, "POST", "/api/admin/materias/anatomia/avaliacao", { avaliacao: "n3" })).status, 400);
  assert.equal((await s.pedir(admin, "POST", "/api/admin/materias/anatomia/avaliacao", { avaliacao: "n1", modulo: "nao-existe" })).status, 404);
  assert.equal((await s.pedir(ana, "POST", "/api/admin/materias/anatomia/avaliacao", { avaliacao: "n1" })).status, 403);

  // data e foco da N2 pelo painel
  await s.pedir(admin, "PATCH", "/api/admin/materias/anatomia", { n2Data: "2030-07-01", n2Foco: "Só o isquiático." });
  const depois = await prova("n2");
  assert.deepEqual([depois.materia.provaData, depois.materia.provaFoco], ["2030-07-01", "Só o isquiático."]);
  assert.equal((await prova("n1")).materia.provaData, "2030-06-10", "a N1 fica como o último pacote deixou");
  const mat = (await s.pedir(admin, "GET", "/api/admin/materias")).json.materias[0];
  assert.deepEqual([mat.n2Data, mat.modulos.map((m) => m.avaliacao)], ["2030-07-01", ["n1", "n2"]]);

  // a separação sai na exportação e volta na importação
  const exp = await s.pedir(admin, "GET", "/api/admin/materias/anatomia/exportar");
  const volta = analisarPacote(lerZip(exp.bruto));
  assert.deepEqual(volta.modulos.map((m) => m.avaliacao), ["n1", "n2"]);
  assert.deepEqual([volta.materia.provaData, volta.materia.n2Data, volta.materia.n2Foco], ["2030-06-10", "2030-07-01", "Só o isquiático."]);
  await s.fechar();
});

test("avaliações no pacote: padrão da matéria, exceção por módulo e valor inválido", () => {
  const base = "formato: 1\nslug: anatomia\nnome: Anatomia\nsemestre: 1\n";
  const tudoN2 = analisarPacote(pacoteAnatomia({ "materia.yml": base + "avaliacao: n2\nprova:\n  data: 2030-06-20\n  foco: Tudo.\n" }));
  assert.deepEqual(tudoN2.modulos.map((m) => m.avaliacao), ["n2", "n2"]);
  assert.deepEqual([tudoN2.materia.provaData, tudoN2.materia.n2Data, tudoN2.materia.n2Foco], [null, "2030-06-20", "Tudo."], "prova solta vale para a avaliação padrão da matéria");
  const misto = analisarPacote(pacoteAnatomia({ "materia.yml": base + 'avaliacao: n2\nmodulos:\n  - pasta: "01 - Membro Superior"\n    avaliacao: n1\n' }));
  assert.deepEqual(misto.modulos.map((m) => m.avaliacao), ["n1", "n2"]);
  const ruim = analisarPacote(pacoteAnatomia({ "materia.yml": base + 'modulos:\n  - pasta: "01 - Membro Superior"\n    avaliacao: n3\n' }));
  assert.ok(ruim.erros.some((e) => /'avaliacao' inválida/.test(e.msg)), relatorioDe(ruim));
  assert.ok(analisarPacote(pacoteAnatomia({ "materia.yml": base + "avaliacao: final\n" })).erros.some((e) => /'avaliacao' inválida/.test(e.msg)));
});

test("limite diário de cartas novas: cada assinante escolhe o seu", async () => {
  const s = await subir();
  const muitas = {};
  for (let i = 0; i < 5; i++) muitas[`03 - Extra/0${i} - Nota ${i}.md`] = nota({ titulo: "Nota extra " + i, cards: 5, corpo: "x ".repeat(60) + "[[Plexo braquial]]" });
  s.importar(pacoteAnatomia(muitas));
  const ana = await s.entrar("ana@teste.com", "ana-senha-123");
  const admin = await s.entrar("admin@teste.com", "admin-senha-1");
  const fila = async (c) => (await s.pedir(c, "GET", "/api/flashcards/proxima?materia=anatomia")).json.contagem;

  let c = await fila(ana);
  assert.deepEqual([c.novos, c.novasRestantes, c.limite, c.total], [20, 11, 20, 31], "o padrão é o do Anki: 20 novas por dia");
  assert.deepEqual((await s.pedir(ana, "GET", "/api/flashcards/baralhos")).json.limite, { novosPorDia: 20, padrao: 20, minimo: 5, maximo: 500 });

  assert.deepEqual((await s.pedir(ana, "POST", "/api/flashcards/limite", { novosPorDia: 40 })).json, { novosPorDia: 40 });
  c = await fila(ana);
  assert.deepEqual([c.novos, c.novasRestantes, c.limite], [31, 0, 40], "as cartas que estavam para amanhã entram hoje");
  const b = (await s.pedir(ana, "GET", "/api/flashcards/baralhos")).json;
  assert.deepEqual([b.limite.novosPorDia, b.baralhos[0].novos, b.baralhos[0].novasRestantes], [40, 31, 0]);
  assert.equal((await s.pedir(ana, "GET", "/api/auth/me")).json.user.novosPorDia, 40);
  assert.equal((await fila(admin)).novos, 20, "o limite é de cada conta");

  // diminuir também vale, e o que já foi feito hoje conta
  let p = (await s.pedir(ana, "GET", "/api/flashcards/proxima?materia=anatomia")).json;
  for (let i = 0; i < 8; i++) p = (await s.pedir(ana, "POST", "/api/flashcards/responder", { materia: "anatomia", carta: p.carta.id, resposta: 4 })).json;
  await s.pedir(ana, "POST", "/api/flashcards/limite", { novosPorDia: 10 });
  c = await fila(ana);
  assert.deepEqual([c.novos, c.novasRestantes], [2, 21], "10 por dia, 8 já feitas: sobram 2 hoje");

  for (const ruim of [3, 9999, "abc", null]) assert.equal((await s.pedir(ana, "POST", "/api/flashcards/limite", { novosPorDia: ruim })).status, 400, String(ruim));
  assert.equal((await s.pedir(null, "POST", "/api/flashcards/limite", { novosPorDia: 30 })).status, 401);
  await s.fechar();
});

test("senha provisória: quem recebe a senha do administrador cria a própria ao entrar", async () => {
  const s = await subir();
  const admin = await s.entrar("admin@teste.com", "admin-senha-1");
  const criado = (await s.pedir(admin, "POST", "/api/admin/usuarios", { nome: "Bia", email: "bia@teste.com" })).json;
  assert.equal(criado.usuario.senhaProvisoria, true);
  const bia = await s.entrar("bia@teste.com", criado.senha);
  assert.equal((await s.pedir(bia, "GET", "/api/auth/me")).json.user.senhaProvisoria, true);

  assert.equal((await s.pedir(bia, "POST", "/api/auth/senha", { nova: "curta" })).status, 400);
  const igual = await s.pedir(bia, "POST", "/api/auth/senha", { nova: criado.senha });
  assert.equal(igual.status, 400);
  assert.match(igual.json.error, /diferente/);
  // não precisa repetir a provisória: acabou de entrar com ela
  const r = await s.pedir(bia, "POST", "/api/auth/senha", { nova: "minha-senha-nova" });
  assert.deepEqual([r.status, r.json.user.senhaProvisoria], [200, false]);
  await assert.rejects(s.entrar("bia@teste.com", criado.senha), "a provisória deixa de valer");
  const bia2 = await s.entrar("bia@teste.com", "minha-senha-nova");

  // com senha própria, trocar exige a atual
  assert.equal((await s.pedir(bia2, "POST", "/api/auth/senha", { nova: "outra-senha-123" })).status, 401);
  assert.equal((await s.pedir(bia2, "POST", "/api/auth/senha", { atual: "errada", nova: "outra-senha-123" })).status, 401);
  assert.equal((await s.pedir(bia2, "POST", "/api/auth/senha", { atual: "minha-senha-nova", nova: "outra-senha-123" })).status, 200);

  // esqueceu: o administrador gera outra, que volta a ser provisória
  const nova = (await s.pedir(admin, "PATCH", "/api/admin/usuarios/" + criado.usuario.id, { novaSenha: true })).json;
  assert.equal(nova.usuario.senhaProvisoria, true);
  const bia3 = await s.entrar("bia@teste.com", nova.senha);
  assert.equal((await s.pedir(bia3, "POST", "/api/auth/senha", { nova: "terceira-senha-1" })).status, 200);

  // conta com senha própria desde o começo nunca é tratada como provisória
  const ana = await s.entrar("ana@teste.com", "ana-senha-123");
  assert.equal((await s.pedir(ana, "GET", "/api/auth/me")).json.user.senhaProvisoria, false);
  assert.equal((await s.pedir(ana, "POST", "/api/auth/senha", { nova: "sem-a-atual-123" })).status, 401);
  await s.fechar();
});
