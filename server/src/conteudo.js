// O que o aluno lê: biblioteca (matérias, módulos, notas e ligações), a nota, o modo prova, a busca,
// figuras e PDFs. Nada disto é arquivo estático: tudo passa por aqui, com sessão conferida.
import fs from "node:fs";
import crypto from "node:crypto";
import { HttpError, semAcento } from "./util.js";
import { exigirUsuario, materiasLiberadas, etiquetaDe } from "./auth.js";
import { analisar, renderNota, renderTrecho, htmlQuestao, extrairCallouts, marcarHtml } from "./markdown.js";
import { conteudo, criarResolver, arquivoAnexo } from "./importar.js";

// minúsculas e sem acento, caractere a caractere (mantém o tamanho, para recortar o trecho no original)
const dobrar = (s) => [...String(s)].map((c) => semAcento(c).toLowerCase()[0] || c).join("");

export function registrarConteudo(app, { db, config }) {
  // visão de quem pede: admin vê rascunhos; aluno só o publicado das matérias liberadas
  function visao(user) {
    const admin = user.papel === "admin";
    const lib = materiasLiberadas(db, user);
    return {
      admin,
      lib,
      chave: admin ? "adm" : lib ? null : "pub", // null = não dá para compartilhar cache
      podeMateria: (id) => !lib || lib.has(id),
      podeNota: (n) => (admin || !!n.publicada) && (!lib || lib.has(n.materia_id)),
    };
  }

  const cache = new Map();
  function comCache(chave, fazer) {
    if (!chave) return fazer();
    const k = conteudo.versao + "|" + chave;
    if (cache.has(k)) return cache.get(k);
    if (cache.size > 800) cache.clear();
    const v = fazer();
    cache.set(k, v);
    return v;
  }

  const q = {
    nota: db.prepare("select * from notas where id = ?"),
    materia: db.prepare("select * from materias where id = ?"),
    modulo: db.prepare("select * from modulos where id = ?"),
    lida: db.prepare("select 1 from leituras where user_id = ? and nota_id = ?"),
    lidas: db.prepare("select nota_id from leituras where user_id = ?"),
    sequencia: db.prepare("select n.id, n.titulo, n.publicada, n.materia_id from notas n join modulos mo on mo.id = n.modulo_id where n.materia_id = ? order by mo.ordem, mo.titulo, n.ordem, n.titulo"),
    saidas: db.prepare("select n.id, n.titulo, n.resumo, n.materia_id, n.publicada from links l join notas n on n.id = l.destino where l.origem = ? order by n.titulo"),
    entradas: db.prepare("select n.id, n.titulo, n.resumo, n.materia_id, n.publicada from links l join notas n on n.id = l.origem where l.destino = ? order by n.titulo"),
    nCards: db.prepare("select count(*) c from flashcards where nota_id = ?"),
    acessoRecente: db.prepare("select 1 from acessos where user_id = ? and nota_id = ? and em > ?"),
    acessosDistintos: db.prepare("select count(distinct nota_id) c from acessos where user_id = ? and tipo = 'nota' and em > ?"),
    registrar: db.prepare("insert into acessos (user_id, nota_id, tipo, em, ip) values (?, ?, ?, ?, ?)"),
  };

  function exigirNota(req) {
    const user = exigirUsuario(req);
    const v = visao(user);
    const n = q.nota.get(req.params.materia + "/" + req.params.slug);
    if (!n || !v.podeNota(n)) throw new HttpError(404, "nota não encontrada");
    return { user, v, n };
  }

  // Freio contra cópia em massa: um aluno não abre dezenas de notas novas em poucos minutos.
  function registrarAcesso(user, notaId, ip, tipo = "nota") {
    const agora = Date.now();
    if (q.acessoRecente.get(user.id, notaId, agora - 600000)) return;
    if (user.papel !== "admin" && tipo === "nota") {
      if (q.acessosDistintos.get(user.id, agora - 600000).c >= config.leiturasPor10Min || q.acessosDistintos.get(user.id, agora - 86400000).c >= config.leiturasPorDia) {
        q.registrar.run(user.id, notaId, "bloqueio", agora, ip);
        throw new HttpError(429, "Você abriu muitas notas em pouco tempo. Respire, revise o que já leu e volte daqui a alguns minutos.");
      }
    }
    q.registrar.run(user.id, notaId, tipo, agora, ip);
  }

  app.get("/api/biblioteca", async (req) => {
    const user = exigirUsuario(req);
    const v = visao(user);
    const lidas = new Set(q.lidas.all(user.id).map((r) => r.nota_id));
    const base = comCache(v.chave && "bib:" + v.chave, () => {
      const notas = db
        .prepare(
          `select n.id, n.materia_id, n.modulo_id, n.titulo, n.resumo, n.prova, n.prioridade, n.tags, n.minutos, n.pdf, n.publicada
           from notas n join modulos mo on mo.id = n.modulo_id order by mo.ordem, mo.titulo, n.ordem, n.titulo`
        )
        .all()
        .filter(v.podeNota);
      const visiveis = new Set(notas.map((n) => n.id));
      const comNota = new Set(notas.map((n) => n.modulo_id));
      const nCards = new Map(db.prepare("select nota_id, count(*) c from flashcards group by nota_id").all().map((r) => [r.nota_id, r.c]));
      return {
        materias: db
          .prepare("select id, nome, semestre, eixo, descricao, cor, prova_data, n2_data from materias order by semestre, nome")
          .all()
          .filter((m) => v.podeMateria(m.id) && (v.admin || notas.some((n) => n.materia_id === m.id))),
        modulos: db
          .prepare("select id, materia_id, titulo, descricao, ordem, avaliacao from modulos order by ordem, titulo")
          .all()
          .filter((m) => comNota.has(m.id)),
        notas: notas.map((n) => {
          const tags = JSON.parse(n.tags);
          return { id: n.id, materia: n.materia_id, modulo: n.modulo_id, titulo: n.titulo, resumo: n.resumo, prova: !!n.prova, prioridade: n.prioridade, tags, minutos: n.minutos, pdf: !!n.pdf, mapa: tags.includes("mapa"), rascunho: !n.publicada, cards: nCards.get(n.id) || 0 };
        }),
        links: db
          .prepare("select origem, destino from links")
          .all()
          .filter((l) => visiveis.has(l.origem) && visiveis.has(l.destino))
          .map((l) => [l.origem, l.destino]),
      };
    });
    return { ...base, lidas: [...lidas], versao: conteudo.versao };
  });

  app.get("/api/recentes", async (req) => {
    const user = exigirUsuario(req);
    const v = visao(user);
    const linhas = db
      .prepare(
        `select a.nota_id id, max(a.em) em, n.titulo, n.materia_id, n.publicada from acessos a join notas n on n.id = a.nota_id
         where a.user_id = ? and a.tipo = 'nota' group by a.nota_id order by em desc limit 8`
      )
      .all(user.id);
    return { recentes: linhas.filter(v.podeNota).map((r) => ({ id: r.id, titulo: r.titulo, materia: r.materia_id, em: r.em })) };
  });

  app.get("/api/notas/:materia/:slug", async (req) => {
    const { user, v, n } = exigirNota(req);
    registrarAcesso(user, n.id, req.ip);
    const pronta = comCache(v.chave && "nota:" + v.chave + ":" + n.id, () => {
      const a = analisar(n.md);
      const resolver = criarResolver(db, n.materia_id, { pode: v.podeNota });
      const r = renderNota(a.corpo, a.questoes, { materia: n.materia_id, resolver, titulo: n.titulo });
      // as cartas da nota vão junto: o leitor mostra um baralho de virar no fim da leitura
      const cartas = a.flashcards.map((f) => ({ frente: renderTrecho(f.frente, { materia: n.materia_id, resolver }), verso: renderTrecho(f.verso, { materia: n.materia_id, resolver }) }));
      return { html: r.html, titulos: r.titulos, questoes: a.questoes.length, cartas };
    });
    const m = q.materia.get(n.materia_id);
    const mod = q.modulo.get(n.modulo_id);
    const seq = q.sequencia.all(n.materia_id).filter(v.podeNota);
    const i = seq.findIndex((x) => x.id === n.id);
    const curto = (x) => x && { id: x.id, titulo: x.titulo };
    const ligada = (x) => ({ id: x.id, titulo: x.titulo, resumo: x.resumo, materia: x.materia_id });
    const tags = JSON.parse(n.tags);
    return {
      nota: {
        id: n.id, titulo: n.titulo, resumo: n.resumo, prova: !!n.prova, prioridade: n.prioridade, tags, fontes: JSON.parse(n.fontes), minutos: n.minutos,
        pdf: !!n.pdf, mapa: tags.includes("mapa"), rascunho: !n.publicada, atualizadoEm: n.atualizado_em, lida: !!q.lida.get(user.id, n.id),
        materia: { id: m.id, nome: m.nome, cor: m.cor, semestre: m.semestre },
        modulo: { id: mod.id, titulo: mod.titulo },
      },
      html: user.papel === "admin" ? pronta.html : marcarHtml(pronta.html, etiquetaDe(user.id)),
      titulos: pronta.titulos,
      questoes: pronta.questoes,
      saidas: q.saidas.all(n.id).filter(v.podeNota).map(ligada),
      entradas: q.entradas.all(n.id).filter(v.podeNota).map(ligada),
      anterior: curto(seq[i - 1]),
      proxima: curto(seq[i + 1]),
      cards: q.nCards.get(n.id).c,
      cartas: pronta.cartas,
    };
  });

  app.post("/api/notas/:materia/:slug/lida", async (req) => {
    const { user, n } = exigirNota(req);
    if (req.body && req.body.lida === false) db.prepare("delete from leituras where user_id = ? and nota_id = ?").run(user.id, n.id);
    else db.prepare("insert or ignore into leituras (user_id, nota_id, lida_em) values (?, ?, ?)").run(user.id, n.id, Date.now());
    return { ok: true };
  });

  // Modo prova: o que é emergencial numa matéria, pronto para ler de uma vez.
  app.get("/api/prova/:materia", async (req) => {
    const user = exigirUsuario(req);
    const v = visao(user);
    const m = q.materia.get(req.params.materia);
    if (!m || !v.podeMateria(m.id)) throw new HttpError(404, "matéria não encontrada");
    const lidas = new Set(q.lidas.all(user.id).map((r) => r.nota_id));
    const pronto = comCache(v.chave && "prova:" + v.chave + ":" + m.id, () => {
      const notas = db
        .prepare("select n.*, mo.titulo modulo, mo.avaliacao from notas n join modulos mo on mo.id = n.modulo_id where n.materia_id = ? and n.prova = 1 order by n.prioridade, mo.ordem, mo.titulo, n.ordem, n.titulo")
        .all(m.id)
        .filter(v.podeNota);
      const resolver = criarResolver(db, m.id, { pode: v.podeNota });
      const ctx = { materia: m.id, resolver };
      const dicas = [];
      const questoes = [];
      const lista = notas.map((n) => {
        const a = analisar(n.md);
        const ref = { id: n.id, titulo: n.titulo };
        for (const d of extrairCallouts(a.corpo, ["prova", "dica"])) dicas.push({ av: n.avaliacao, nota: ref, titulo: d.titulo, html: renderTrecho(d.md, ctx) });
        for (const qt of a.questoes) questoes.push({ av: n.avaliacao, nota: ref, html: htmlQuestao(qt, ctx) });
        return {
          id: n.id, titulo: n.titulo, resumo: n.resumo, modulo: n.modulo, av: n.avaliacao, prioridade: n.prioridade, minutos: n.minutos,
          // sai como o próprio bloco "essencial" (o leitor transforma os itens em "já sei")
          essencial: extrairCallouts(a.corpo, ["essencial"]).map((e) => renderTrecho([`> [!essencial] ${e.titulo}`, ...e.md.split("\n").map((l) => "> " + l)].join("\n"), ctx)),
        };
      });
      return { notas: lista, dicas, questoes };
    });
    if (pronto.notas.length) registrarAcesso(user, "prova:" + m.id, req.ip, "prova");
    const marca = (h) => (user.papel === "admin" ? h : marcarHtml(h, etiquetaDe(user.id)));
    // cada avaliação (N1, N2) tem suas notas, sua data e seu foco
    const prova = { n1: { data: m.prova_data, foco: m.prova_foco }, n2: { data: m.n2_data, foco: m.n2_foco } };
    const avaliacoes = ["n1", "n2"].map((av) => ({ av, notas: pronto.notas.filter((n) => n.av === av).length, data: prova[av].data })).filter((a) => a.notas);
    const hoje = new Date().toISOString().slice(0, 10);
    // sem escolha: a avaliação com prova marcada mais próxima; senão, a primeira que tem conteúdo
    const pedida = String(req.query.av || "").toLowerCase();
    const proxima = avaliacoes.filter((a) => a.data && a.data >= hoje).sort((a, b) => a.data.localeCompare(b.data))[0];
    const av = avaliacoes.some((a) => a.av === pedida) ? pedida : (proxima || avaliacoes[0] || { av: "n1" }).av;
    return {
      materia: { id: m.id, nome: m.nome, cor: m.cor, semestre: m.semestre, provaData: prova[av].data, provaFoco: prova[av].foco },
      av,
      avaliacoes,
      notas: pronto.notas.filter((n) => n.av === av).map((n) => ({ ...n, essencial: n.essencial.map(marca), lida: lidas.has(n.id) })),
      dicas: pronto.dicas.filter((d) => d.av === av),
      questoes: pronto.questoes.filter((q) => q.av === av),
    };
  });

  app.get("/api/busca", async (req) => {
    const user = exigirUsuario(req);
    const v = visao(user);
    const termos = dobrar(String(req.query.q || "").trim()).split(/\s+/).filter((t) => t.length >= 2).slice(0, 6);
    if (!termos.length) return { resultados: [] };
    const base = comCache("busca", () =>
      db.prepare("select id, materia_id, publicada, titulo, resumo, texto from notas").all().map((n) => ({ ...n, alvo: dobrar(n.titulo + " \n " + n.resumo + " \n " + n.texto), cab: (n.titulo + " \n " + n.resumo + " \n ").length }))
    );
    const achados = [];
    for (const n of base) {
      if (!v.podeNota(n) || !termos.every((t) => n.alvo.includes(t))) continue;
      const noTitulo = termos.every((t) => dobrar(n.titulo).includes(t));
      const pos = n.alvo.indexOf(termos[0], n.cab);
      let trecho = n.resumo;
      if (pos >= 0) {
        const ini = Math.max(0, pos - n.cab - 60);
        trecho = (ini > 0 ? "…" : "") + n.texto.slice(ini, ini + 170).trim() + "…";
      }
      achados.push({ id: n.id, titulo: n.titulo, materia: n.materia_id, trecho, peso: noTitulo ? 0 : 1 });
    }
    achados.sort((a, b) => a.peso - b.peso || a.titulo.localeCompare(b.titulo, "pt"));
    return { resultados: achados.slice(0, 30).map(({ peso, ...r }) => r) };
  });

  app.get("/api/anexos/:materia/*", async (req, reply) => {
    const user = exigirUsuario(req);
    const v = visao(user);
    const caminho = req.params["*"];
    const linha = db.prepare("select mime from anexos where materia_id = ? and caminho = ?").get(req.params.materia, caminho);
    if (!linha || !v.podeMateria(req.params.materia)) throw new HttpError(404, "não encontrado");
    if (linha.mime === "application/pdf") throw new HttpError(403, "PDFs só abrem dentro do leitor");
    const arq = arquivoAnexo(config.dataDir, req.params.materia, caminho);
    if (!arq || !fs.existsSync(arq)) throw new HttpError(404, "não encontrado");
    reply.header("cache-control", "private, max-age=86400");
    reply.header("content-disposition", "inline");
    return reply.type(linha.mime).send(fs.readFileSync(arq));
  });

  // PDF de uma nota: sai embaralhado (XOR com uma chave da sessão). O leitor desembaralha na memória
  // e desenha as páginas num canvas; quem salvar a resposta da rede fica com um arquivo que não abre.
  app.get("/api/pdf/:materia/:slug", async (req, reply) => {
    const { user, n } = exigirNota(req);
    if (!n.pdf) throw new HttpError(404, "esta nota não tem PDF");
    const arq = arquivoAnexo(config.dataDir, n.materia_id, n.pdf);
    if (!arq || !fs.existsSync(arq)) throw new HttpError(404, "arquivo não encontrado");
    registrarAcesso(user, n.id, req.ip);
    const chave = crypto.createHash("sha256").update((req.sessaoHash || user.id) + "|" + n.id + "|" + Date.now()).digest();
    const bytes = fs.readFileSync(arq);
    for (let i = 0; i < bytes.length; i++) bytes[i] ^= chave[i % 32];
    reply.header("x-chave", chave.toString("hex"));
    return reply.type("application/octet-stream").send(bytes);
  });
}
