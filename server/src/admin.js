// Painel do administrador: acessos (logins), matérias, notas, importação de pacotes, PDF direto,
// geração com o Claude local, auditoria e tokens de API.
import crypto from "node:crypto";
import { HttpError, slug, sha256, novoId, contarPalavras, mimeDe } from "./util.js";
import { exigirAdmin, criarUsuario, hashSenha, gerarSenha, etiquetaDe } from "./auth.js";
import { lerZip, analisarPacote, relatorio, zipar, LIMITES } from "./pacote.js";
import { importarPacote, exportarPacote, gravarNota, gravarModulo, gravarAnexo, apagarNota, apagarMateria, reindexarLinks, criarResolver, conteudo } from "./importar.js";
import { analisar, renderNota, lerEtiquetas, CALLOUTS } from "./markdown.js";
import { gerarResumo } from "./gerador.js";

export function registrarAdmin(app, { db, config }) {
  const emAndamento = new Map(); // id da geração -> AbortController

  // gerações que estavam rodando quando o servidor caiu
  db.prepare("update geracoes set status = 'erro', log = log || ?, terminou_em = ? where status not in ('concluida', 'erro', 'cancelada')").run("\nO servidor reiniciou durante a geração.", Date.now());

  async function lerMultipart(req) {
    if (!req.isMultipart()) throw new HttpError(400, "envie como formulário com arquivo");
    const campos = {};
    const arquivos = [];
    for await (const parte of req.parts()) {
      if (parte.type === "file") arquivos.push({ campo: parte.fieldname, nome: parte.filename, bytes: await parte.toBuffer() });
      else campos[parte.fieldname] = parte.value;
    }
    return { campos, arquivos };
  }

  function contextoPacote(materiaId) {
    const existentes = new Set();
    for (const n of db.prepare("select slug, titulo from notas").all()) {
      existentes.add(n.slug);
      existentes.add(slug(n.titulo));
    }
    return { existentes, anexosExistentes: new Set(db.prepare("select caminho from anexos where materia_id = ?").all(materiaId || "").map((a) => a.caminho)) };
  }
  function analisarZip(bytes) {
    let arquivos;
    try {
      arquivos = lerZip(bytes);
    } catch (e) {
      throw new HttpError(400, e.message);
    }
    const previa = analisarPacote(arquivos);
    return analisarPacote(arquivos, contextoPacote(previa.materia.slug));
  }

  // ---------- usuários ----------
  const linhaUsuario = (u) => ({
    id: u.id, email: u.email, nome: u.nome, papel: u.papel, ativo: !!u.ativo, expiraEm: u.expira_em, acessoTotal: !!u.acesso_total, criadoEm: u.criado_em, ultimoAcesso: u.ultimo_acesso,
    etiqueta: etiquetaDe(u.id),
    materias: db.prepare("select materia_id from user_materias where user_id = ?").all(u.id).map((r) => r.materia_id),
    sessoes: db.prepare("select count(*) c from sessoes where user_id = ? and expira_em > ?").get(u.id, Date.now()).c,
    lidas: db.prepare("select count(*) c from leituras where user_id = ?").get(u.id).c,
    revisoes: db.prepare("select count(*) c from revisoes where user_id = ?").get(u.id).c,
  });

  app.get("/api/admin/usuarios", async (req) => {
    exigirAdmin(req);
    return { usuarios: db.prepare("select * from users order by papel, nome").all().map(linhaUsuario) };
  });

  app.post("/api/admin/usuarios", async (req) => {
    exigirAdmin(req);
    const b = req.body || {};
    const senha = b.senha ? String(b.senha) : gerarSenha();
    const id = criarUsuario(db, { email: b.email, nome: b.nome, senha, papel: b.papel === "admin" ? "admin" : "aluno", expiraEm: b.expiraEm ? Number(b.expiraEm) : null, acessoTotal: b.acessoTotal !== false, materias: Array.isArray(b.materias) ? b.materias : [] });
    return { usuario: linhaUsuario(db.prepare("select * from users where id = ?").get(id)), senha };
  });

  app.patch("/api/admin/usuarios/:id", async (req) => {
    const eu = exigirAdmin(req);
    const u = db.prepare("select * from users where id = ?").get(req.params.id);
    if (!u) throw new HttpError(404, "usuário não encontrado");
    const b = req.body || {};
    const adminsAtivos = db.prepare("select count(*) c from users where papel = 'admin' and ativo = 1").get().c;
    const perdeAdmin = u.papel === "admin" && u.ativo && ((b.papel && b.papel !== "admin") || b.ativo === false);
    if (perdeAdmin && (u.id === eu.id || adminsAtivos <= 1)) throw new HttpError(400, "não dá para tirar o acesso do único administrador (ou o seu próprio)");
    if (b.nome != null) db.prepare("update users set nome = ? where id = ?").run(String(b.nome).trim().slice(0, 80) || u.nome, u.id);
    if (b.papel === "admin" || b.papel === "aluno") db.prepare("update users set papel = ? where id = ?").run(b.papel, u.id);
    if (b.ativo != null) db.prepare("update users set ativo = ? where id = ?").run(b.ativo ? 1 : 0, u.id);
    if ("expiraEm" in b) db.prepare("update users set expira_em = ? where id = ?").run(b.expiraEm ? Number(b.expiraEm) : null, u.id);
    if (b.acessoTotal != null) db.prepare("update users set acesso_total = ? where id = ?").run(b.acessoTotal ? 1 : 0, u.id);
    if (Array.isArray(b.materias)) {
      db.prepare("delete from user_materias where user_id = ?").run(u.id);
      const ins = db.prepare("insert or ignore into user_materias (user_id, materia_id) values (?, ?)");
      for (const m of b.materias) ins.run(u.id, String(m));
    }
    let senha = null;
    if (b.novaSenha) {
      senha = b.novaSenha === true ? gerarSenha() : String(b.novaSenha);
      if (senha.length < 8) throw new HttpError(400, "a senha precisa ter pelo menos 8 caracteres");
      db.prepare("update users set senha_hash = ? where id = ?").run(hashSenha(senha), u.id);
    }
    // desativar, trocar senha ou pedir: derruba as sessões abertas
    if (b.ativo === false || b.novaSenha || b.encerrarSessoes) db.prepare("delete from sessoes where user_id = ? and token_hash != ?").run(u.id, u.id === eu.id ? req.sessaoHash || "" : "");
    return { usuario: linhaUsuario(db.prepare("select * from users where id = ?").get(u.id)), senha };
  });

  app.delete("/api/admin/usuarios/:id", async (req) => {
    const eu = exigirAdmin(req);
    if (req.params.id === eu.id) throw new HttpError(400, "você não pode apagar a própria conta");
    const r = db.prepare("delete from users where id = ?").run(req.params.id);
    if (!r.changes) throw new HttpError(404, "usuário não encontrado");
    return { ok: true };
  });

  // ---------- matérias ----------
  app.get("/api/admin/materias", async (req) => {
    exigirAdmin(req);
    const materias = db.prepare("select * from materias order by semestre, nome").all().map((m) => ({
      id: m.id, nome: m.nome, semestre: m.semestre, eixo: m.eixo, descricao: m.descricao, cor: m.cor, provaData: m.prova_data, provaFoco: m.prova_foco, atualizadoEm: m.atualizado_em,
      ...db.prepare("select count(*) notas, coalesce(sum(prova), 0) deProva, coalesce(sum(publicada = 0), 0) rascunhos from notas where materia_id = ?").get(m.id),
      flashcards: db.prepare("select count(*) c from flashcards where materia_id = ?").get(m.id).c,
    }));
    return { materias };
  });

  app.post("/api/admin/materias", async (req) => {
    exigirAdmin(req);
    const b = req.body || {};
    const id = slug(b.slug || b.nome || "");
    const semestre = Number(b.semestre);
    if (!String(b.nome || "").trim() || id === "nota") throw new HttpError(400, "diga o nome da matéria");
    if (!Number.isInteger(semestre) || semestre < 1 || semestre > 14) throw new HttpError(400, "semestre inválido");
    if (db.prepare("select 1 from materias where id = ?").get(id)) throw new HttpError(409, "já existe uma matéria com esse nome");
    const agora = Date.now();
    db.prepare("insert into materias (id, nome, semestre, eixo, descricao, cor, criado_em, atualizado_em) values (?, ?, ?, ?, ?, ?, ?, ?)").run(id, String(b.nome).trim(), semestre, String(b.eixo || ""), String(b.descricao || ""), String(b.cor || ""), agora, agora);
    conteudo.versao++;
    return { id };
  });

  app.patch("/api/admin/materias/:id", async (req) => {
    exigirAdmin(req);
    const m = db.prepare("select * from materias where id = ?").get(req.params.id);
    if (!m) throw new HttpError(404, "matéria não encontrada");
    const b = req.body || {};
    const semestre = b.semestre != null ? Number(b.semestre) : m.semestre;
    if (!Number.isInteger(semestre) || semestre < 1 || semestre > 14) throw new HttpError(400, "semestre inválido");
    const cor = b.cor != null ? String(b.cor).trim() : m.cor;
    if (cor && !/^#[0-9a-f]{6}$/i.test(cor)) throw new HttpError(400, "cor inválida");
    const data = "provaData" in b ? (b.provaData ? String(b.provaData) : null) : m.prova_data;
    if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new HttpError(400, "data da prova inválida");
    db.prepare("update materias set nome = ?, semestre = ?, eixo = ?, descricao = ?, cor = ?, prova_data = ?, prova_foco = ?, atualizado_em = ? where id = ?").run(
      String(b.nome ?? m.nome).trim() || m.nome, semestre, String(b.eixo ?? m.eixo), String(b.descricao ?? m.descricao), cor, data, String(b.provaFoco ?? m.prova_foco), Date.now(), m.id
    );
    conteudo.versao++;
    return { ok: true };
  });

  app.delete("/api/admin/materias/:id", async (req) => {
    exigirAdmin(req);
    if (!apagarMateria(db, config.dataDir, req.params.id)) throw new HttpError(404, "matéria não encontrada");
    return { ok: true };
  });

  app.post("/api/admin/materias/:id/publicar", async (req) => {
    exigirAdmin(req);
    const r = db.prepare("update notas set publicada = 1 where materia_id = ? and publicada = 0").run(req.params.id);
    conteudo.versao++;
    return { publicadas: r.changes };
  });

  app.get("/api/admin/materias/:id/exportar", async (req, reply) => {
    exigirAdmin(req);
    const arquivos = exportarPacote(db, config.dataDir, req.params.id);
    if (!arquivos) throw new HttpError(404, "matéria não encontrada");
    reply.header("content-disposition", `attachment; filename="${req.params.id}.zip"`);
    return reply.type("application/zip").send(zipar(arquivos));
  });

  // ---------- notas ----------
  app.get("/api/admin/materias/:id/notas", async (req) => {
    exigirAdmin(req);
    const notas = db
      .prepare(
        `select n.id, n.slug, n.titulo, n.resumo, n.prova, n.prioridade, n.publicada, n.minutos, n.pdf, n.ordem, n.atualizado_em, mo.titulo modulo, mo.id modulo_id,
           (select count(*) from flashcards f where f.nota_id = n.id) cards
         from notas n join modulos mo on mo.id = n.modulo_id where n.materia_id = ? order by mo.ordem, mo.titulo, n.ordem, n.titulo`
      )
      .all(req.params.id);
    return { notas: notas.map((n) => ({ ...n, prova: !!n.prova, publicada: !!n.publicada, pdf: !!n.pdf })) };
  });

  const notaAdmin = (materia, s) => {
    const n = db.prepare("select n.*, mo.titulo modulo from notas n join modulos mo on mo.id = n.modulo_id where n.id = ?").get(materia + "/" + s);
    if (!n) throw new HttpError(404, "nota não encontrada");
    return n;
  };

  app.get("/api/admin/notas/:materia/:slug", async (req) => {
    exigirAdmin(req);
    const n = notaAdmin(req.params.materia, req.params.slug);
    return { nota: { id: n.id, slug: n.slug, titulo: n.titulo, resumo: n.resumo, md: n.md, prova: !!n.prova, prioridade: n.prioridade, tags: JSON.parse(n.tags), fontes: JSON.parse(n.fontes), ordem: n.ordem, modulo: n.modulo, publicada: !!n.publicada, pdf: n.pdf } };
  });

  // Confere o corpo de uma nota do mesmo jeito que o validador de pacotes.
  function conferirCorpo(md, { prova, mapa, pdf }) {
    const a = analisar(md);
    const erros = [];
    const avisos = [];
    const palavras = contarPalavras(a.corpo);
    if (palavras > LIMITES.palavrasErro) erros.push(`nota grande demais (${palavras} palavras; máximo ${LIMITES.palavrasErro})`);
    else if (palavras > LIMITES.palavrasAviso) avisos.push(`nota longa (${palavras} palavras); o ideal é até ${LIMITES.palavrasAviso}`);
    a.flashcards.forEach((f, i) => {
      if (!f.frente || !f.verso) erros.push(`flashcard ${i + 1}: precisa de pergunta e resposta`);
    });
    if (new Set(a.flashcards.map((f) => slug(f.frente))).size !== a.flashcards.length) erros.push("há flashcards com a mesma pergunta");
    a.questoes.forEach((qt, i) => {
      if (!qt.enunciado) erros.push(`questão ${i + 1}: falta o enunciado`);
      if (qt.alternativas.length && qt.alternativas.filter((x) => x.correta).length !== 1) erros.push(`questão ${i + 1}: marque exatamente uma alternativa com "- [x]"`);
      if (qt.alternativas.length === 1) erros.push(`questão ${i + 1}: precisa de pelo menos 2 alternativas`);
    });
    for (const t of new Set(a.tipos)) if (!CALLOUTS[t] && t !== "flashcard" && t !== "questao") avisos.push(`callout desconhecido: [!${t}]`);
    if (!pdf && !mapa && !a.flashcards.length) avisos.push("nota sem flashcards");
    if (prova && !pdf && !a.tipos.includes("essencial")) avisos.push("nota de prova sem bloco [!essencial]");
    return { a, erros, avisos, palavras };
  }

  app.post("/api/admin/previa", async (req) => {
    exigirAdmin(req);
    const b = req.body || {};
    const materia = String(b.materia || "");
    const tags = Array.isArray(b.tags) ? b.tags : [];
    const { a, erros, avisos, palavras } = conferirCorpo(String(b.md || ""), { prova: !!b.prova, mapa: tags.includes("mapa"), pdf: !!b.pdf });
    const resolver = criarResolver(db, materia);
    const r = renderNota(a.corpo, a.questoes, { materia, resolver, titulo: b.titulo });
    for (const alvo of a.alvos) if (!resolver(alvo)) avisos.push(`link para nota que não existe: [[${alvo}]]`);
    return { html: r.html, erros, avisos, palavras, flashcards: a.flashcards.length, questoes: a.questoes.length };
  });

  function salvarNota(materiaId, slugNota, b, criando) {
    const m = db.prepare("select id from materias where id = ?").get(materiaId);
    if (!m) throw new HttpError(404, "matéria não encontrada");
    const titulo = String(b.titulo || "").trim();
    const resumo = String(b.resumo || "").trim();
    if (!titulo) throw new HttpError(400, "a nota precisa de título");
    if (!resumo) throw new HttpError(400, "a nota precisa de resumo (uma frase)");
    const tags = (Array.isArray(b.tags) ? b.tags : []).map((t) => String(t).trim()).filter(Boolean);
    const { erros } = conferirCorpo(String(b.md || ""), { prova: !!b.prova, mapa: tags.includes("mapa"), pdf: !!b.pdf });
    if (erros.length) throw new HttpError(400, erros[0], { erros });
    const tituloModulo = String(b.modulo || "").trim() || "Geral";
    // título igual (ou slug igual) ao de outra nota da matéria confundiria os [[links]]
    const s = criando ? slug(titulo) : slugNota;
    const choque = db.prepare("select id from notas where materia_id = ? and id != ? and (slug = ? or slug = ?)").get(materiaId, materiaId + "/" + s, s, slug(titulo));
    if (choque || (criando && db.prepare("select 1 from notas where id = ?").get(materiaId + "/" + s))) throw new HttpError(409, "já existe uma nota com esse título nesta matéria");
    const modExistente = db.prepare("select id, ordem, slug from modulos where materia_id = ? and slug = ?").get(materiaId, slug(tituloModulo));
    const ordemMod = modExistente ? modExistente.ordem : (db.prepare("select coalesce(max(ordem), 0) o from modulos where materia_id = ?").get(materiaId).o || 0) + 1;
    const moduloId = gravarModulo(db, materiaId, { slug: slug(tituloModulo), titulo: tituloModulo, ordem: ordemMod });
    const r = gravarNota(db, materiaId, moduloId, { slug: s, titulo, resumo, md: String(b.md || ""), prova: !!b.prova, prioridade: [1, 2, 3].includes(Number(b.prioridade)) ? Number(b.prioridade) : 2, tags, fontes: Array.isArray(b.fontes) ? b.fontes : [], ordem: Number.isFinite(Number(b.ordem)) ? Number(b.ordem) : 999, pdf: b.pdf || null }, { publicada: b.publicada !== false });
    if (b.publicada != null) db.prepare("update notas set publicada = ? where id = ?").run(b.publicada ? 1 : 0, r.id);
    db.prepare("delete from modulos where materia_id = ? and id not in (select distinct modulo_id from notas where materia_id = ?)").run(materiaId, materiaId);
    reindexarLinks(db);
    return { id: r.id, slug: s };
  }

  app.post("/api/admin/notas/:materia", async (req) => {
    exigirAdmin(req);
    return salvarNota(req.params.materia, null, req.body || {}, true);
  });

  app.put("/api/admin/notas/:materia/:slug", async (req) => {
    exigirAdmin(req);
    const n = notaAdmin(req.params.materia, req.params.slug);
    return salvarNota(req.params.materia, n.slug, { pdf: n.pdf, ...(req.body || {}) }, false);
  });

  // ajustes rápidos da lista: prova, prioridade, publicada
  app.patch("/api/admin/notas/:materia/:slug", async (req) => {
    exigirAdmin(req);
    const n = notaAdmin(req.params.materia, req.params.slug);
    const b = req.body || {};
    if (b.prova != null) db.prepare("update notas set prova = ? where id = ?").run(b.prova ? 1 : 0, n.id);
    if ([1, 2, 3].includes(Number(b.prioridade))) db.prepare("update notas set prioridade = ? where id = ?").run(Number(b.prioridade), n.id);
    if (b.publicada != null) db.prepare("update notas set publicada = ? where id = ?").run(b.publicada ? 1 : 0, n.id);
    db.prepare("update notas set atualizado_em = ? where id = ?").run(Date.now(), n.id);
    conteudo.versao++;
    return { ok: true };
  });

  app.delete("/api/admin/notas/:materia/:slug", async (req) => {
    exigirAdmin(req);
    if (!apagarNota(db, req.params.materia + "/" + req.params.slug)) throw new HttpError(404, "nota não encontrada");
    return { ok: true };
  });

  // ---------- importação ----------
  app.post("/api/admin/validar", async (req) => {
    exigirAdmin(req);
    const { arquivos } = await lerMultipart(req);
    if (!arquivos.length) throw new HttpError(400, "envie o .zip do pacote");
    const r = analisarZip(arquivos[0].bytes);
    const jaExistem = new Set(db.prepare("select slug from notas where materia_id = ?").all(r.materia.slug).map((n) => n.slug));
    return {
      ok: r.ok, erros: r.erros, avisos: r.avisos, materia: r.materia, resumo: r.resumo, relatorio: relatorio(r),
      materiaExiste: !!db.prepare("select 1 from materias where id = ?").get(r.materia.slug),
      notas: r.notas.map((n) => ({ titulo: n.titulo, modulo: n.modulo, prova: n.prova, palavras: n.palavras || 0, flashcards: n.nFlashcards || 0, nova: !jaExistem.has(n.slug) })),
    };
  });

  app.post("/api/admin/importar", async (req) => {
    exigirAdmin(req);
    const { campos, arquivos } = await lerMultipart(req);
    if (!arquivos.length) throw new HttpError(400, "envie o .zip do pacote");
    const r = analisarZip(arquivos[0].bytes);
    if (!r.ok) throw new HttpError(422, "o pacote tem erros e não foi importado", { erros: r.erros, avisos: r.avisos, relatorio: relatorio(r) });
    const importado = importarPacote(db, config.dataDir, r, { modo: campos.modo === "substituir" ? "substituir" : "mesclar", publicada: campos.rascunho !== "1" });
    return { ok: true, importado, avisos: r.avisos, resumo: r.resumo, relatorio: relatorio(r) };
  });

  // Resumo que já existe em PDF: entra como uma nota de leitura, sem passar pelo formato de pacote.
  app.post("/api/admin/pdf", async (req) => {
    exigirAdmin(req);
    const { campos, arquivos } = await lerMultipart(req);
    const arq = arquivos[0];
    if (!arq || mimeDe(arq.nome) !== "application/pdf" || arq.bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new HttpError(400, "envie um arquivo PDF");
    const materia = String(campos.materia || "");
    if (!db.prepare("select 1 from materias where id = ?").get(materia)) throw new HttpError(404, "matéria não encontrada");
    const titulo = String(campos.titulo || arq.nome.replace(/\.pdf$/i, "")).trim();
    const caminho = "anexos/pdf/" + slug(titulo) + "-" + crypto.randomBytes(3).toString("hex") + ".pdf";
    gravarAnexo(db, config.dataDir, materia, caminho, arq.bytes, "application/pdf");
    const r = salvarNota(materia, null, { titulo, resumo: String(campos.resumo || "").trim() || "Resumo em PDF.", modulo: campos.modulo, md: String(campos.md || ""), prova: campos.prova === "1", prioridade: Number(campos.prioridade) || 2, pdf: caminho }, true);
    return { ok: true, ...r };
  });

  // ---------- geração com o Claude ----------
  const linhaGeracao = (g, comLog) => ({ id: g.id, materia: g.materia_id, status: g.status, criadoEm: g.criado_em, terminouEm: g.terminou_em, pedido: JSON.parse(g.pedido), resultado: g.resultado ? JSON.parse(g.resultado) : null, ...(comLog ? { log: g.log } : {}) });

  app.get("/api/admin/geracoes", async (req) => {
    exigirAdmin(req);
    return { geracoes: db.prepare("select * from geracoes order by criado_em desc limit 30").all().map((g) => linhaGeracao(g, false)) };
  });

  app.get("/api/admin/geracoes/:id", async (req) => {
    exigirAdmin(req);
    const g = db.prepare("select * from geracoes where id = ?").get(req.params.id);
    if (!g) throw new HttpError(404, "geração não encontrada");
    return { geracao: linhaGeracao(g, true) };
  });

  app.post("/api/admin/geracoes", async (req) => {
    exigirAdmin(req);
    const { campos, arquivos } = await lerMultipart(req);
    if (!arquivos.length) throw new HttpError(400, "envie pelo menos um material (PDF, PPTX, DOCX ou texto)");
    const ruim = arquivos.find((a) => !/\.(pdf|pptx|docx|txt|md)$/i.test(a.nome));
    if (ruim) throw new HttpError(400, `tipo de material não aceito: ${ruim.nome} (use PDF, PPTX, DOCX, TXT ou MD)`);
    const existente = campos.materia ? db.prepare("select * from materias where id = ?").get(String(campos.materia)) : null;
    const nome = existente ? existente.nome : String(campos.nome || "").trim();
    const semestre = existente ? existente.semestre : Number(campos.semestre);
    if (!nome) throw new HttpError(400, "escolha uma matéria ou diga o nome da nova");
    if (!Number.isInteger(semestre) || semestre < 1 || semestre > 14) throw new HttpError(400, "diga o semestre da matéria (1 a 14)");
    const mslug = existente ? existente.id : slug(nome);
    if ([...emAndamento.keys()].length >= 2) throw new HttpError(429, "já há duas gerações rodando; espere uma terminar");
    const id = novoId();
    const pedido = { nome, semestre, conteudosProva: String(campos.conteudosProva || ""), instrucoes: String(campos.instrucoes || ""), rascunho: campos.rascunho === "1", materiais: arquivos.map((a) => a.nome) };
    db.prepare("insert into geracoes (id, materia_id, status, pedido, log, criado_em) values (?, ?, 'preparando', ?, '', ?)").run(id, mslug, JSON.stringify(pedido), Date.now());
    const controle = new AbortController();
    emAndamento.set(id, controle);
    const logar = db.prepare("update geracoes set log = log || ? where id = ?");
    const mudar = db.prepare("update geracoes set status = ? where id = ?");
    gerarResumo(db, config, {
      id, materia: { slug: mslug, nome, semestre }, materiais: arquivos.map((a) => ({ nome: a.nome, bytes: a.bytes })),
      conteudosProva: pedido.conteudosProva, instrucoes: pedido.instrucoes, rascunho: pedido.rascunho, sinal: controle.signal,
      aoLogar: (linha) => logar.run(`[${new Date().toLocaleTimeString("pt-BR", { hour12: false })}] ${linha}\n`, id),
      aoMudar: (status) => mudar.run(status, id),
    })
      .catch((e) => ({ ok: false, erro: e.message }))
      .then((r) => {
        emAndamento.delete(id);
        const status = r.ok ? "concluida" : r.cancelado ? "cancelada" : "erro";
        if (!r.ok) logar.run(`\n${r.cancelado ? "Geração cancelada." : "ERRO: " + r.erro}\n`, id);
        db.prepare("update geracoes set status = ?, resultado = ?, terminou_em = ? where id = ?").run(status, JSON.stringify(r.ok ? { resumo: r.resumo, importado: r.importado, avisos: r.avisos.length } : { erro: r.erro }), Date.now(), id);
      });
    return { id };
  });

  app.post("/api/admin/geracoes/:id/cancelar", async (req) => {
    exigirAdmin(req);
    const c = emAndamento.get(req.params.id);
    if (!c) throw new HttpError(404, "esta geração não está rodando");
    c.abort();
    return { ok: true };
  });

  app.get("/api/admin/claude", async (req) => {
    exigirAdmin(req);
    // o Claude Code está instalado onde o servidor roda?
    const { spawnSync } = await import("node:child_process");
    let versao = null;
    try {
      const r = spawnSync(config.claudeBin, [...(config.claudeArgs || []), "--version"], { encoding: "utf8", timeout: 15000, windowsHide: true });
      if (r.status === 0) versao = String(r.stdout || "").trim().split("\n")[0];
    } catch {}
    return { disponivel: !!versao, versao, bin: config.claudeBin };
  });

  // ---------- auditoria ----------
  app.get("/api/admin/acessos", async (req) => {
    exigirAdmin(req);
    const agora = Date.now();
    const porUsuario = db
      .prepare(
        `select u.id, u.nome, u.email, u.ultimo_acesso,
           (select count(*) from acessos a where a.user_id = u.id and a.tipo = 'nota' and a.em > ?) dia,
           (select count(*) from acessos a where a.user_id = u.id and a.tipo = 'nota' and a.em > ?) semana,
           (select count(*) from acessos a where a.user_id = u.id and a.tipo = 'bloqueio' and a.em > ?) bloqueios
         from users u order by dia desc, u.nome`
      )
      .all(agora - 86400000, agora - 7 * 86400000, agora - 7 * 86400000);
    const recentes = db
      .prepare(
        `select a.em, a.tipo, a.ip, a.nota_id, u.nome, n.titulo from acessos a join users u on u.id = a.user_id left join notas n on n.id = a.nota_id
         order by a.em desc limit 120`
      )
      .all();
    return { porUsuario, recentes };
  });

  // Colou um trecho que vazou? As etiquetas invisíveis dizem de qual conta ele saiu.
  app.post("/api/admin/rastrear", async (req) => {
    exigirAdmin(req);
    const etiquetas = lerEtiquetas(String((req.body || {}).texto || ""));
    const usuarios = db.prepare("select id, nome, email from users").all();
    const achados = usuarios.filter((u) => etiquetas.includes(etiquetaDe(u.id)) || String((req.body || {}).texto || "").includes(etiquetaDe(u.id)));
    return { etiquetas, usuarios: achados.map((u) => ({ id: u.id, nome: u.nome, email: u.email })) };
  });

  // ---------- tokens de API ----------
  app.get("/api/admin/tokens", async (req) => {
    exigirAdmin(req);
    return { tokens: db.prepare("select id, nome, criado_em criadoEm, ultimo_uso ultimoUso from tokens_api order by criado_em desc").all() };
  });
  app.post("/api/admin/tokens", async (req) => {
    const eu = exigirAdmin(req);
    const token = "snp_" + crypto.randomBytes(24).toString("base64url");
    const id = novoId();
    db.prepare("insert into tokens_api (id, nome, token_hash, user_id, criado_em) values (?, ?, ?, ?, ?)").run(id, String((req.body || {}).nome || "token").slice(0, 60), sha256(token), eu.id, Date.now());
    return { id, token };
  });
  app.delete("/api/admin/tokens/:id", async (req) => {
    exigirAdmin(req);
    db.prepare("delete from tokens_api where id = ?").run(req.params.id);
    return { ok: true };
  });
}
