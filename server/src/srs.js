// Agendador de flashcards: o mesmo algoritmo do Anki (SM-2 modificado, agendador v2), com os
// valores padrão do Anki. Funções puras: recebem o estado da carta e devolvem o novo.
//
// Estados: "novo" -> "aprendendo" (passos em minutos) -> "revisao" (intervalos em dias)
//          "revisao" + De novo -> "reaprendendo" -> "revisao"
// Respostas: 1 De novo · 2 Difícil · 3 Bom · 4 Fácil

export const PADRAO = {
  passos: [1, 10], // minutos (cartas novas)
  passosReaprender: [10], // minutos (depois de errar uma carta em revisão)
  intervaloGraduacao: 1, // dias, ao terminar os passos com "Bom"
  intervaloFacil: 4, // dias, ao apertar "Fácil" numa carta nova
  facilidadeInicial: 2.5,
  facilidadeMinima: 1.3,
  bonusFacil: 1.3,
  fatorDificil: 1.2,
  modificador: 1,
  novoIntervaloLapso: 0, // fração do intervalo que sobra depois de errar (0 = volta ao mínimo)
  intervaloMinimo: 1,
  intervaloMaximo: 36500,
  novosPorDia: 20,
  revisoesPorDia: 200,
  horaVirada: 4, // o "dia" do Anki vira às 4h da manhã
  aprenderAdianteMin: 20,
  fusoMin: -180, // Brasília
  variar: true, // pequena variação aleatória no intervalo (o "fuzz" do Anki)
};

const MIN = 60000;
const DIA = 86400000;

export const diaDe = (ms, cfg = PADRAO) => Math.floor((ms + cfg.fusoMin * MIN - cfg.horaVirada * 3600000) / DIA);
export const inicioDoDia = (dia, cfg = PADRAO) => dia * DIA - cfg.fusoMin * MIN + cfg.horaVirada * 3600000;
export const novoEstado = () => ({ estado: "novo", passo: 0, vence: 0, intervalo: 0, facilidade: PADRAO.facilidadeInicial, reps: 0, lapsos: 0 });

// "Difícil" durante o aprendizado: no primeiro passo, a média entre ele e o seguinte (1 e 10 min -> 5,5 min);
// com um passo só, 1,5x; nos demais passos, repete o passo.
function atrasoDificil(passos, passo) {
  if (passo > 0) return passos[passo];
  if (passos.length > 1) return (passos[0] + passos[1]) / 2;
  return Math.min(passos[0] * 1.5, passos[0] + 1440);
}

// Faixa de variação do Anki para um intervalo em dias.
export function faixaVariacao(ivl) {
  if (ivl < 2) return [1, 1];
  if (ivl === 2) return [2, 3];
  let f;
  if (ivl < 7) f = Math.floor(ivl * 0.25);
  else if (ivl < 30) f = Math.max(2, Math.floor(ivl * 0.15));
  else f = Math.max(4, Math.floor(ivl * 0.05));
  f = Math.max(f, 1);
  return [ivl - f, ivl + f];
}

// número em [0, 1) derivado de um texto: a variação de uma carta é sempre a mesma para a mesma revisão
function acaso(semente) {
  let h = 2166136261;
  for (let i = 0; i < semente.length; i++) {
    h ^= semente.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

// Intervalos (em dias) de Difícil / Bom / Fácil para uma carta em revisão, antes da variação.
export function intervalosRevisao(e, atraso, cfg = PADRAO) {
  const ivl = Math.max(1, e.intervalo);
  const teto = (v) => Math.min(v, cfg.intervaloMaximo);
  const ajustar = (v, anterior) => Math.max(Math.floor(v * cfg.modificador), anterior + 1, 1);
  const dificil = ajustar(ivl * cfg.fatorDificil, cfg.fatorDificil > 1 ? ivl : 0);
  const bom = ajustar((ivl + Math.floor(atraso / 2)) * e.facilidade, dificil);
  const facil = ajustar((ivl + atraso) * e.facilidade * cfg.bonusFacil, bom);
  return { dificil: teto(dificil), bom: teto(bom), facil: teto(facil) };
}

export function agendar(e, resposta, agora, cfg = PADRAO, semente = "") {
  if (![1, 2, 3, 4].includes(resposta)) throw new Error("resposta inválida");
  const hoje = diaDe(agora, cfg);
  const n = { ...e, reps: e.reps + 1 };
  const graduar = (dias) => {
    n.estado = "revisao";
    n.passo = 0;
    n.intervalo = Math.min(Math.max(cfg.intervaloMinimo, dias), cfg.intervaloMaximo);
    n.vence = inicioDoDia(hoje + n.intervalo, cfg);
  };

  if (e.estado !== "revisao") {
    const reaprendendo = e.estado === "reaprendendo";
    const passos = reaprendendo ? cfg.passosReaprender : cfg.passos;
    if (e.estado === "novo") n.facilidade = cfg.facilidadeInicial;
    const ficar = (i, minutos) => {
      n.estado = reaprendendo ? "reaprendendo" : "aprendendo";
      n.passo = i;
      n.vence = agora + Math.round(minutos * MIN);
    };
    const formar = () => graduar(reaprendendo ? e.intervalo : cfg.intervaloGraduacao);
    if (!passos.length) {
      if (resposta === 4) graduar(reaprendendo ? e.intervalo + 1 : cfg.intervaloFacil);
      else formar();
      return n;
    }
    const passo = e.estado === "novo" ? 0 : Math.min(e.passo, passos.length - 1);
    if (resposta === 1) ficar(0, passos[0]);
    else if (resposta === 2) ficar(passo, atrasoDificil(passos, passo));
    else if (resposta === 3) {
      if (passo + 1 < passos.length) ficar(passo + 1, passos[passo + 1]);
      else formar();
    } else graduar(reaprendendo ? e.intervalo + 1 : cfg.intervaloFacil);
    return n;
  }

  // carta em revisão
  const atraso = Math.max(0, hoje - diaDe(e.vence, cfg));
  if (resposta === 1) {
    n.lapsos = e.lapsos + 1;
    n.facilidade = Math.max(cfg.facilidadeMinima, e.facilidade - 0.2);
    n.intervalo = Math.min(Math.max(cfg.intervaloMinimo, Math.floor(Math.max(1, e.intervalo) * cfg.novoIntervaloLapso)), cfg.intervaloMaximo);
    if (cfg.passosReaprender.length) {
      n.estado = "reaprendendo";
      n.passo = 0;
      n.vence = agora + cfg.passosReaprender[0] * MIN;
    } else n.vence = inicioDoDia(hoje + n.intervalo, cfg);
    return n;
  }
  const ivls = intervalosRevisao(e, atraso, cfg);
  let dias = resposta === 2 ? ivls.dificil : resposta === 3 ? ivls.bom : ivls.facil;
  if (resposta === 2) n.facilidade = Math.max(cfg.facilidadeMinima, e.facilidade - 0.15);
  if (resposta === 4) n.facilidade = e.facilidade + 0.15;
  if (cfg.variar) {
    const [min, max] = faixaVariacao(dias);
    // a variação nunca derruba o intervalo para baixo do que a resposta anterior daria
    const piso = resposta === 2 ? Math.max(1, e.intervalo) + 1 : resposta === 3 ? ivls.dificil + 1 : ivls.bom + 1;
    dias = Math.max(piso, min + Math.floor(acaso(semente + ":" + e.reps) * (max - min + 1)));
  }
  n.estado = "revisao";
  n.passo = 0;
  n.intervalo = Math.min(dias, cfg.intervaloMaximo);
  n.vence = inicioDoDia(hoje + n.intervalo, cfg);
  return n;
}

// Texto do botão: daqui a quanto tempo a carta volta.
export function rotuloIntervalo(ms) {
  const min = ms / MIN;
  if (min < 1) return "<1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h)} h`;
  const d = h / 24;
  if (d < 31) return `${Math.round(d)} d`;
  const virgula = (x) => (Math.round(x * 10) / 10).toString().replace(".", ",");
  if (d < 365) return `${virgula(d / 30)} mes`;
  return `${virgula(d / 365)} a`;
}

// O que cada botão vai fazer com a carta agora (sem variação: é o que o Anki mostra em cima do botão).
export function previsoes(e, agora, cfg = PADRAO) {
  const seca = { ...cfg, variar: false };
  const r = {};
  for (const resposta of [1, 2, 3, 4]) {
    const n = agendar(e, resposta, agora, seca);
    r[resposta] = n.estado === "revisao" ? rotuloIntervalo(n.intervalo * DIA) : rotuloIntervalo(n.vence - agora);
  }
  return r;
}
