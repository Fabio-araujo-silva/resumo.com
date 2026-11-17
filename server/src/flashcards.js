// Flashcards: um baralho por matéria, agendado pelo algoritmo do Anki (srs.js). O servidor é quem
// decide a próxima carta e guarda o estado de cada carta para cada aluno.
import { HttpError } from "./util.js";
import { exigirUsuario, materiasLiberadas } from "./auth.js";
import { PADRAO, agendar, previsoes, novoEstado, diaDe, inicioDoDia } from "./srs.js";
import { renderTrecho, renderLinha } from "./markdown.js";
import { criarResolver } from "./importar.js";

export function registrarFlashcards(app, { db, config, agora = () => Date.now() }) {
  const base0 = { ...PADRAO, fusoMin: config.fusoMin };
  let cfg = base0; // trocado a cada pedido pelo limite diário de quem está estudando
  const LIMITE_MIN = 5;
  const LIMITE_MAX = 500;
  const cfgDe = (user) => ({ ...base0, novosPorDia: Math.min(LIMITE_MAX, Math.max(LIMITE_MIN, user.novos_por_dia || PADRAO.novosPorDia)) });

  // filtro: { materia, nota?, prova? }. Monta o trecho SQL comum a todas as consultas da fila.
  function base(user, f) {
    const cond = ["f.materia_id = ?"];
    const args = [f.materia];
    if (user.papel !== "admin") cond.push("n.publicada = 1");
    if (f.nota) {
      cond.push("f.nota_id = ?");
      args.push(f.nota);
    }
    if (f.prova) cond.push("n.prova = 1");
    if (f.av) {
      cond.push("mo.avaliacao = ?");
      args.push(f.av);
    }
    return {
      sql: `from flashcards f join notas n on n.id = f.nota_id join modulos mo on mo.id = n.modulo_id
            left join estados_card e on e.card_id = f.id and e.user_id = ? where ${cond.join(" and ")}`,
      args: [user.id, ...args],
    };
  }

  function contar(user, f, t) {
    const b = base(user, f);
    const hoje = diaDe(t, cfg);
    const fimHoje = inicioDoDia(hoje + 1, cfg) - 1;
    const inicioHoje = inicioDoDia(hoje, cfg);
    const um = (extra, ...a) => db.prepare(`select count(*) c ${b.sql} and ${extra}`).get(...b.args, ...a).c;
    const feitas = db.prepare("select estado_antes, count(*) c from revisoes where user_id = ? and materia_id = ? and em >= ? group by estado_antes").all(user.id, f.materia, inicioHoje);
    const feito = (estado) => feitas.find((x) => x.estado_antes === estado)?.c || 0;
    // estudo dirigido (uma nota, ou modo prova): sem teto diário de cartas novas
    const livre = !!(f.nota || f.prova);
    const novosTotal = um("e.card_id is null");
    const novos = livre ? novosTotal : Math.max(0, Math.min(novosTotal, cfg.novosPorDia - feito("novo")));
    const revisarTotal = um("e.estado = 'revisao' and e.vence <= ?", fimHoje);
    const revisar = Math.max(0, Math.min(revisarTotal, cfg.revisoesPorDia - feito("revisao")));
    const aprendendo = um("e.estado in ('aprendendo', 'reaprendendo')");
    return { novos, aprendendo, revisar, total: um("1 = 1"), fimHoje, novasRestantes: novosTotal - novos };
  }

  function proxima(user, f, t) {
    const b = base(user, f);
    const c = contar(user, f, t);
    const campos = "f.id, f.frente, f.verso, f.explica, f.nota_id, n.titulo nota_titulo, n.resumo nota_resumo, mo.titulo modulo_titulo, e.estado, e.passo, e.vence, e.intervalo, e.facilidade, e.reps, e.lapsos";
    const pegar = (extra, ordem, ...a) => db.prepare(`select ${campos} ${b.sql} and ${extra} order by ${ordem} limit 1`).get(...b.args, ...a);
    let carta = pegar("e.estado in ('aprendendo', 'reaprendendo') and e.vence <= ?", "e.vence", t);
    if (!carta && c.revisar > 0) carta = pegar("e.estado = 'revisao' and e.vence <= ?", "e.vence, f.id", c.fimHoje);
    if (!carta && c.novos > 0) carta = pegar("e.card_id is null", "mo.ordem, mo.titulo, n.ordem, n.titulo, f.ordem");
    if (!carta) carta = pegar("e.estado in ('aprendendo', 'reaprendendo') and e.vence <= ?", "e.vence", t + cfg.aprenderAdianteMin * 60000);
    // novasRestantes: cartas nunca vistas que ficaram para outro dia por causa do limite diário
    const contagem = { novos: c.novos, aprendendo: c.aprendendo, revisar: c.revisar, total: c.total, novasRestantes: c.novasRestantes, limite: cfg.novosPorDia };
    if (!carta) {
      const prox = db.prepare(`select min(e.vence) v ${b.sql} and e.estado in ('aprendendo', 'reaprendendo')`).get(...b.args).v;
      return { carta: null, contagem, proximaEm: prox || null };
    }
    const estado = carta.estado ? { estado: carta.estado, passo: carta.passo, vence: carta.vence, intervalo: carta.intervalo, facilidade: carta.facilidade, reps: carta.reps, lapsos: carta.lapsos } : novoEstado();
    const ctx = { materia: f.materia, resolver: criarResolver(db, f.materia, { pode: (n) => user.papel === "admin" || !!n.publicada }) };
    return {
      carta: {
        id: carta.id,
        frente: renderTrecho(carta.frente, ctx),
        verso: renderTrecho(carta.verso, ctx),
        // o "?" da pergunta: a explicação escrita para a carta e, sempre, de que assunto ela é
        explica: carta.explica ? renderLinha(carta.explica, ctx) : "",
        nota: { id: carta.nota_id, titulo: carta.nota_titulo, resumo: carta.nota_resumo, modulo: carta.modulo_titulo },
        pendente: !!db.prepare("select 1 from pendencias where user_id = ? and nota_id = ?").get(user.id, carta.nota_id),
        estado: estado.estado,
      },
      previsoes: previsoes(estado, t, cfg),
      contagem,
      proximaEm: null,
    };
  }

  function lerFiltro(req, origem) {
    const user = exigirUsuario(req);
    const materia = String(origem.materia || "");
    const lib = materiasLiberadas(db, user);
    if (!materia || !db.prepare("select 1 from materias where id = ?").get(materia) || (lib && !lib.has(materia))) throw new HttpError(404, "matéria não encontrada");
    cfg = cfgDe(user);
    const av = String(origem.av || "").toLowerCase();
    return { user, f: { materia, nota: origem.nota ? String(origem.nota) : null, prova: origem.modo === "prova", av: av === "n1" || av === "n2" ? av : null } };
  }

  app.get("/api/flashcards/baralhos", async (req) => {
    const user = exigirUsuario(req);
    cfg = cfgDe(user);
    const lib = materiasLiberadas(db, user);
    const t = agora();
    const materias = db.prepare("select id, nome, semestre, cor, prova_data from materias order by semestre, nome").all().filter((m) => !lib || lib.has(m.id));
    const baralhos = [];
    for (const m of materias) {
      const c = contar(user, { materia: m.id }, t);
      if (!c.total) continue;
      const estudadas = db.prepare("select count(*) c from estados_card e join flashcards f on f.id = e.card_id where e.user_id = ? and f.materia_id = ?").get(user.id, m.id).c;
      const maduras = db.prepare("select count(*) c from estados_card e join flashcards f on f.id = e.card_id where e.user_id = ? and f.materia_id = ? and e.estado = 'revisao' and e.intervalo >= 21").get(user.id, m.id).c;
      const deProva = db.prepare("select count(*) c from flashcards f join notas n on n.id = f.nota_id where f.materia_id = ? and n.prova = 1 and n.publicada = 1").get(m.id).c;
      // quantas cartas cada avaliação (N1, N2) tem nesta matéria
      const avaliacoes = db
        .prepare("select mo.avaliacao av, count(*) cartas from flashcards f join notas n on n.id = f.nota_id join modulos mo on mo.id = n.modulo_id where f.materia_id = ? and n.publicada = 1 group by mo.avaliacao order by mo.avaliacao")
        .all(m.id);
      baralhos.push({ materia: m.id, nome: m.nome, semestre: m.semestre, cor: m.cor, novos: c.novos, aprendendo: c.aprendendo, revisar: c.revisar, total: c.total, novasRestantes: c.novasRestantes, estudadas, maduras, deProva, avaliacoes });
    }
    // estatísticas gerais
    const hoje = diaDe(t, cfg);
    const inicioHoje = inicioDoDia(hoje, cfg);
    const feitasHoje = db.prepare("select count(*) c from revisoes where user_id = ? and em >= ?").get(user.id, inicioHoje).c;
    const dias = new Set(db.prepare("select em from revisoes where user_id = ? and em >= ?").all(user.id, inicioDoDia(hoje - 400, cfg)).map((r) => diaDe(r.em, cfg)));
    let sequencia = 0;
    for (let d = dias.has(hoje) ? hoje : hoje - 1; dias.has(d); d--) sequencia++;
    const mes = db.prepare("select sum(resposta > 1) certas, count(*) total from revisoes where user_id = ? and estado_antes = 'revisao' and em >= ?").get(user.id, inicioDoDia(hoje - 30, cfg));
    const semana = [];
    for (let d = hoje - 6; d <= hoje; d++)
      semana.push({ dia: new Date(inicioDoDia(d, cfg) + 12 * 3600000).toISOString().slice(0, 10), n: db.prepare("select count(*) c from revisoes where user_id = ? and em >= ? and em < ?").get(user.id, inicioDoDia(d, cfg), inicioDoDia(d + 1, cfg)).c });
    return { baralhos, limite: { novosPorDia: cfg.novosPorDia, padrao: PADRAO.novosPorDia, minimo: LIMITE_MIN, maximo: LIMITE_MAX }, estatisticas: { feitasHoje, sequencia, retencao: mes.total ? Math.round((mes.certas / mes.total) * 100) : null, semana } };
  });

  // O assinante escolhe quantas cartas novas quer por dia (o padrão do Anki é 20).
  app.post("/api/flashcards/limite", async (req) => {
    const user = exigirUsuario(req);
    const n = Math.round(Number((req.body || {}).novosPorDia));
    if (!Number.isFinite(n) || n < LIMITE_MIN || n > LIMITE_MAX) throw new HttpError(400, `escolha um número entre ${LIMITE_MIN} e ${LIMITE_MAX}`);
    db.prepare("update users set novos_por_dia = ? where id = ?").run(n, user.id);
    return { novosPorDia: n };
  });

  app.get("/api/flashcards/proxima", async (req) => {
    const { user, f } = lerFiltro(req, req.query);
    return proxima(user, f, agora());
  });

  app.post("/api/flashcards/responder", async (req) => {
    const corpo = req.body || {};
    const { user, f } = lerFiltro(req, corpo);
    const resposta = Number(corpo.resposta);
    if (![1, 2, 3, 4].includes(resposta)) throw new HttpError(400, "resposta inválida");
    const carta = db.prepare("select f.id, f.materia_id, n.publicada from flashcards f join notas n on n.id = f.nota_id where f.id = ? and f.materia_id = ?").get(String(corpo.carta || ""), f.materia);
    if (!carta || (user.papel !== "admin" && !carta.publicada)) throw new HttpError(404, "carta não encontrada");
    const t = agora();
    const linha = db.prepare("select * from estados_card where user_id = ? and card_id = ?").get(user.id, carta.id);
    const antes = linha ? { estado: linha.estado, passo: linha.passo, vence: linha.vence, intervalo: linha.intervalo, facilidade: linha.facilidade, reps: linha.reps, lapsos: linha.lapsos } : novoEstado();
    const depois = agendar(antes, resposta, t, cfg, user.id + carta.id);
    db.prepare(
      `insert into estados_card (user_id, card_id, estado, passo, vence, intervalo, facilidade, reps, lapsos, atualizado_em) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(user_id, card_id) do update set estado = excluded.estado, passo = excluded.passo, vence = excluded.vence, intervalo = excluded.intervalo,
         facilidade = excluded.facilidade, reps = excluded.reps, lapsos = excluded.lapsos, atualizado_em = excluded.atualizado_em`
    ).run(user.id, carta.id, depois.estado, depois.passo, depois.vence, depois.intervalo, depois.facilidade, depois.reps, depois.lapsos, t);
    db.prepare("insert into revisoes (user_id, card_id, materia_id, resposta, estado_antes, intervalo, facilidade, em) values (?, ?, ?, ?, ?, ?, ?, ?)").run(
      user.id, carta.id, carta.materia_id, resposta, antes.estado, depois.intervalo, depois.facilidade, t
    );
    return { agendada: { estado: depois.estado, intervalo: depois.intervalo, vence: depois.vence }, ...proxima(user, f, t) };
  });
}
