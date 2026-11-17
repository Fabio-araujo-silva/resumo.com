// Ofensiva: dias seguidos estudando, como no Duolingo. Um dia conta quando a pessoa responde pelo
// menos um flashcard ou marca uma nota como lida. O "dia" vira às 4h da manhã no fuso do assinante
// (o mesmo dia dos flashcards), então estudar de madrugada ainda conta para a noite anterior.
import { exigirUsuario } from "./auth.js";
import { PADRAO, diaDe, inicioDoDia } from "./srs.js";

const JANELA = 35; // dias do calendário

export function calcularOfensiva(db, userId, agora, cfg) {
  const hoje = diaDe(agora, cfg);
  const porDia = new Map();
  const somar = (ms, campo) => {
    const d = diaDe(ms, cfg);
    const v = porDia.get(d) || { flashcards: 0, notas: 0 };
    v[campo]++;
    porDia.set(d, v);
  };
  for (const r of db.prepare("select em from revisoes where user_id = ?").all(userId)) somar(r.em, "flashcards");
  for (const r of db.prepare("select lida_em em from leituras where user_id = ?").all(userId)) somar(r.em, "notas");

  const ativo = (d) => porDia.has(d);
  // a ofensiva continua viva até o fim de hoje: se ainda não estudou hoje, conta a partir de ontem
  let atual = 0;
  for (let d = ativo(hoje) ? hoje : hoje - 1; ativo(d); d--) atual++;
  // recorde: a maior sequência de dias seguidos em todo o histórico
  let recorde = 0;
  let corrida = 0;
  let anterior = null;
  for (const d of [...porDia.keys()].sort((a, b) => a - b)) {
    corrida = anterior !== null && d === anterior + 1 ? corrida + 1 : 1;
    recorde = Math.max(recorde, corrida);
    anterior = d;
  }
  const dias = [];
  for (let d = hoje - JANELA + 1; d <= hoje; d++) {
    const v = porDia.get(d) || { flashcards: 0, notas: 0 };
    dias.push({ dia: new Date(inicioDoDia(d, cfg) + 12 * 3600000).toISOString().slice(0, 10), ...v, ativo: ativo(d), hoje: d === hoje });
  }
  return {
    atual,
    recorde: Math.max(recorde, atual),
    hojeFeito: ativo(hoje),
    emRisco: !ativo(hoje) && atual > 0, // estudou ontem, ainda não hoje: perde à meia-noite (às 4h)
    totalDias: porDia.size,
    // quanto falta para a virada do dia (para o aviso "faltam X horas")
    viraEm: inicioDoDia(hoje + 1, cfg),
    dias,
  };
}

export function registrarOfensiva(app, { db, config, agora = () => Date.now() }) {
  const cfg = { ...PADRAO, fusoMin: config.fusoMin };
  app.get("/api/ofensiva", async (req) => {
    const user = exigirUsuario(req);
    return calcularOfensiva(db, user.id, agora(), cfg);
  });
}
