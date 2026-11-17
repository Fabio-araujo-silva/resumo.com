// O agendador precisa se comportar como o Anki (agendador v2, opções padrão).
import test from "node:test";
import assert from "node:assert/strict";
import { PADRAO, agendar, previsoes, novoEstado, diaDe, inicioDoDia, intervalosRevisao, faixaVariacao, rotuloIntervalo } from "../src/srs.js";

const cfg = { ...PADRAO, variar: false };
const MIN = 60000;
const DIA = 86400000;
const T0 = Date.UTC(2030, 0, 15, 15, 0, 0); // 12h em Brasília
const hoje = diaDe(T0, cfg);
const revisao = (intervalo, facilidade = 2.5, atrasoDias = 0) => ({ estado: "revisao", passo: 0, vence: inicioDoDia(hoje - atrasoDias, cfg), intervalo, facilidade, reps: 5, lapsos: 0 });

test("carta nova: os quatro botões", () => {
  const n = novoEstado();
  const deNovo = agendar(n, 1, T0, cfg);
  assert.equal(deNovo.estado, "aprendendo");
  assert.equal(deNovo.passo, 0);
  assert.equal(deNovo.vence, T0 + 1 * MIN);

  const dificil = agendar(n, 2, T0, cfg);
  assert.equal(dificil.estado, "aprendendo");
  assert.equal(dificil.vence, T0 + 5.5 * MIN, "difícil no 1º passo = média entre 1 e 10 min");

  const bom = agendar(n, 3, T0, cfg);
  assert.equal(bom.passo, 1);
  assert.equal(bom.vence, T0 + 10 * MIN);

  const facil = agendar(n, 4, T0, cfg);
  assert.equal(facil.estado, "revisao");
  assert.equal(facil.intervalo, 4);
  assert.equal(facil.facilidade, 2.5);
  assert.equal(diaDe(facil.vence, cfg), hoje + 4);
});

test("os rótulos dos botões batem com os do Anki para uma carta nova", () => {
  assert.deepEqual(previsoes(novoEstado(), T0, cfg), { 1: "1 min", 2: "6 min", 3: "10 min", 4: "4 d" });
});

test("aprendizado: Bom, Bom forma a carta com intervalo de 1 dia", () => {
  const a = agendar(novoEstado(), 3, T0, cfg);
  const b = agendar(a, 3, T0 + 10 * MIN, cfg);
  assert.equal(b.estado, "revisao");
  assert.equal(b.intervalo, 1);
  assert.equal(diaDe(b.vence, cfg), hoje + 1);
  assert.equal(b.reps, 2);
});

test("aprendizado: De novo volta ao primeiro passo; Difícil repete o passo atual", () => {
  const passo1 = agendar(novoEstado(), 3, T0, cfg);
  const volta = agendar(passo1, 1, T0, cfg);
  assert.equal(volta.passo, 0);
  assert.equal(volta.vence, T0 + 1 * MIN);
  const repete = agendar(passo1, 2, T0, cfg);
  assert.equal(repete.passo, 1);
  assert.equal(repete.vence, T0 + 10 * MIN);
});

test("revisão em dia: Difícil x1,2, Bom x facilidade, Fácil x facilidade x 1,3", () => {
  const e = revisao(10);
  assert.deepEqual(intervalosRevisao(e, 0, cfg), { dificil: 12, bom: 25, facil: 32 });
  const d = agendar(e, 2, T0, cfg);
  assert.equal(d.intervalo, 12);
  assert.ok(Math.abs(d.facilidade - 2.35) < 1e-9);
  const b = agendar(e, 3, T0, cfg);
  assert.equal(b.intervalo, 25);
  assert.equal(b.facilidade, 2.5);
  assert.equal(diaDe(b.vence, cfg), hoje + 25);
  const f = agendar(e, 4, T0, cfg);
  assert.equal(f.intervalo, 32);
  assert.ok(Math.abs(f.facilidade - 2.65) < 1e-9);
});

test("revisão atrasada: Bom soma metade do atraso; Fácil soma o atraso inteiro", () => {
  const e = revisao(10, 2.5, 4);
  const i = intervalosRevisao(e, 4, cfg);
  assert.equal(i.dificil, 12);
  assert.equal(i.bom, 30); // (10 + 2) * 2,5
  assert.equal(i.facil, 45); // (10 + 4) * 2,5 * 1,3 = 45,5
  assert.equal(agendar(e, 3, T0, cfg).intervalo, 30);
});

test("os intervalos sempre crescem: Difícil < Bom < Fácil, mesmo com intervalo de 1 dia", () => {
  const i = intervalosRevisao(revisao(1, 1.3), 0, cfg);
  assert.ok(i.dificil >= 2 && i.bom > i.dificil && i.facil > i.bom, JSON.stringify(i));
});

test("errar uma carta em revisão: lapso, facilidade -0,20, reaprendizado de 10 min e volta com 1 dia", () => {
  const e = revisao(30, 2.5);
  const erro = agendar(e, 1, T0, cfg);
  assert.equal(erro.estado, "reaprendendo");
  assert.equal(erro.lapsos, 1);
  assert.ok(Math.abs(erro.facilidade - 2.3) < 1e-9);
  assert.equal(erro.vence, T0 + 10 * MIN);
  assert.equal(erro.intervalo, 1);
  const volta = agendar(erro, 3, T0 + 10 * MIN, cfg);
  assert.equal(volta.estado, "revisao");
  assert.equal(volta.intervalo, 1);
  assert.ok(Math.abs(volta.facilidade - 2.3) < 1e-9, "reaprender não mexe de novo na facilidade");
});

test("a facilidade nunca cai abaixo de 1,3", () => {
  let e = revisao(5, 1.4);
  e = agendar(e, 1, T0, cfg);
  assert.equal(e.facilidade, 1.3);
  const d = agendar({ ...revisao(5, 1.35) }, 2, T0, cfg);
  assert.equal(d.facilidade, 1.3);
});

test("o dia vira às 4h da manhã no fuso do aluno", () => {
  const t0359 = Date.UTC(2030, 0, 15, 6, 59); // 03:59 em Brasília
  const t0401 = Date.UTC(2030, 0, 15, 7, 1); // 04:01 em Brasília
  assert.equal(diaDe(t0401, cfg) - diaDe(t0359, cfg), 1);
  assert.equal(inicioDoDia(diaDe(t0401, cfg), cfg), Date.UTC(2030, 0, 15, 7, 0));
});

test("variação (fuzz): fica dentro da faixa do Anki e é estável para a mesma revisão", () => {
  assert.deepEqual(faixaVariacao(1), [1, 1]);
  assert.deepEqual(faixaVariacao(2), [2, 3]);
  assert.deepEqual(faixaVariacao(10), [8, 12]);
  assert.deepEqual(faixaVariacao(100), [95, 105]);
  const com = { ...PADRAO, variar: true };
  const e = revisao(10);
  const vistos = new Set();
  for (let i = 0; i < 60; i++) {
    const r = agendar(e, 3, T0, com, "carta" + i);
    assert.ok(r.intervalo >= 22 && r.intervalo <= 28, "fora da faixa: " + r.intervalo);
    vistos.add(r.intervalo);
  }
  assert.ok(vistos.size > 2, "a variação deveria espalhar os intervalos");
  assert.equal(agendar(e, 3, T0, com, "x").intervalo, agendar(e, 3, T0, com, "x").intervalo);
});

test("intervalo máximo e rótulos", () => {
  const e = revisao(30000, 2.5);
  assert.equal(agendar(e, 4, T0, cfg).intervalo, 36500);
  assert.equal(rotuloIntervalo(30 * 1000), "<1 min");
  assert.equal(rotuloIntervalo(25 * DIA), "25 d");
  assert.equal(rotuloIntervalo(45 * DIA), "1,5 mes");
  assert.equal(rotuloIntervalo(730 * DIA), "2 a");
  assert.throws(() => agendar(novoEstado(), 5, T0, cfg));
});
