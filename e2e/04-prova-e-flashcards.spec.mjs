// Modo prova e flashcards (com os botões e intervalos do Anki).
import { test, expect } from "@playwright/test";
import { ANA, entrar } from "./apoio.mjs";

test.beforeEach(async ({ page }) => {
  await entrar(page, ANA);
});

test("modo prova: só o emergencial, por prioridade, com dicas e questões", async ({ page }) => {
  await page.goto("/prova");
  const cartao = page.locator('.cartao-prova[data-materia="anatomia"]');
  await expect(cartao).toContainText("dias para a prova");
  await expect(page.locator(".cartao-prova")).toHaveCount(1); // fisiologia não tem conteúdo de prova
  await cartao.click();
  await expect(page).toHaveURL(/\/prova\/anatomia\?av=n1$/);
  await expect(page.locator(".heroi h1")).toHaveText("Anatomia");
  await expect(page.locator(".foco")).toContainText("Plexo braquial e manguito.");

  const fichas = page.locator(".ficha-prova");
  await expect(fichas).toHaveCount(3);
  await expect(fichas.nth(0)).toContainText("Prioridade alta");
  await expect(fichas.nth(2).locator("h3")).toHaveText("Nervo isquiático"); // prioridade média vem depois
  const plexo = page.locator('.ficha-prova[data-nota="anatomia/plexo-braquial"]');
  await expect(plexo.locator(".callout-essencial")).toContainText("Raízes C5 a T1");
  // "já sei" também vale aqui
  await plexo.locator(".callout-essencial .callout-corpo li").first().click();
  await expect(plexo.locator(".sei-conta")).toHaveText("1/2 já sei");
  // marcar como revisada
  await plexo.locator("footer button").click();
  await expect(plexo).toHaveClass(/lida/);

  await page.locator(".abas button", { hasText: "Dicas de prova" }).click();
  await expect(page.locator(".dica-solta").first()).toContainText("Pegadinha");
  await page.locator(".abas button", { hasText: "Teste-se" }).click();
  await expect(page.locator(".questao-solta")).toHaveCount(3);
  await page.locator(".questao-solta").first().locator('.q-alt[data-i="1"]').click();
  await expect(page.locator(".questao-solta").first().locator(".questao")).toHaveClass(/acertou/);

  // cartas só das notas de prova
  await page.locator(".heroi-acoes a", { hasText: "Flashcards da prova" }).click();
  await expect(page).toHaveURL(/\/flashcards\/anatomia\?modo=prova&av=n1$/);
  await expect(page.locator(".estudo-titulo strong")).toHaveText("Cartas da prova N1");
  await expect(page.locator("[data-testid=carta]")).toBeVisible();
});

test("flashcards: baralhos por matéria e sessão de estudo com os quatro botões", async ({ page }) => {
  await page.goto("/flashcards");
  const linha = page.locator('[data-baralho="anatomia"]');
  await expect(linha.locator(".num.novas")).toHaveText("8");
  await expect(linha.locator(".num.revisar")).toHaveText("0");
  await expect(page.locator('[data-baralho="fisiologia"] .num.novas')).toHaveText("2");
  await linha.locator("a.primario").click();
  await expect(page).toHaveURL(/\/flashcards\/anatomia$/);

  const carta = page.locator("[data-testid=carta]");
  const contadores = page.locator("[data-testid=contadores] span");
  await expect(carta).toHaveAttribute("data-estado", "novo");
  await expect(contadores.nth(0)).toHaveText("8");
  await expect(page.locator("[data-testid=verso]")).toHaveCount(0);
  await expect(page.locator(".respostas")).toHaveCount(0);

  // mostra a resposta: aparecem os quatro botões com os intervalos do Anki
  await page.locator("button.mostrar").click();
  await expect(page.locator("[data-testid=verso]")).toBeVisible();
  const botoes = page.locator(".respostas .resposta");
  await expect(botoes).toHaveCount(4);
  await expect(botoes.nth(0)).toContainText("1 min");
  await expect(botoes.nth(0)).toContainText("De novo");
  await expect(botoes.nth(1)).toContainText("6 min");
  await expect(botoes.nth(2)).toContainText("10 min");
  await expect(botoes.nth(3)).toContainText("4 d");
  await expect(botoes.nth(3)).toContainText("Fácil");

  // "Bom" numa carta nova: ela entra em aprendizado
  const primeira = await carta.locator(".carta-frente").innerText();
  await page.locator('.resposta[data-resposta="3"]').click();
  await expect(contadores.nth(0)).toHaveText("7");
  await expect(contadores.nth(1)).toHaveText("1");
  await expect(carta.locator(".carta-frente")).not.toHaveText(primeira);

  // pelo teclado: espaço mostra, 4 = Fácil
  await page.keyboard.press("Space");
  await expect(page.locator("[data-testid=verso]")).toBeVisible();
  await page.keyboard.press("4");
  await expect(contadores.nth(0)).toHaveText("6");

  // termina o baralho: tudo com Fácil (a carta em aprendizado volta no fim, como no Anki)
  for (let i = 0; i < 12; i++) {
    await page.locator("button.mostrar, [data-testid=fim-estudo]").first().waitFor();
    if (await page.locator("[data-testid=fim-estudo]").count()) break;
    await page.locator("button.mostrar").click();
    await page.locator('.resposta[data-resposta="4"]').click();
    await expect(page.locator(".respostas")).toHaveCount(0);
  }
  await expect(page.locator("[data-testid=fim-estudo]")).toContainText("Por agora é isso");
  await expect(contadores.nth(0)).toHaveText("0");

  await page.goto("/flashcards");
  await expect(page.locator('[data-baralho="anatomia"] .num.novas')).toHaveText("0");
  await expect(page.locator('[data-baralho="anatomia"] a', { hasText: "Em dia" })).toBeVisible();
  await expect(page.locator(".estatisticas .numerao").first()).toHaveText("9"); // 8 cartas + a que voltou do aprendizado
  await expect(page.locator(".estatisticas .numerao").nth(1)).toHaveText("1");
  // o menu mostra quantas cartas faltam hoje (nenhuma em anatomia; fisiologia ainda tem novas)
  await page.goto("/");
  await expect(page.locator("[data-testid=cartas-hoje]")).toHaveText("2");
});

test("estudar só as cartas de uma nota", async ({ page }) => {
  await page.goto("/nota/fisiologia/potencial-de-acao");
  await page.locator(".leitor-acoes a", { hasText: "Estudar as 2 cartas" }).click();
  await expect(page).toHaveURL(/\/flashcards\/fisiologia\?nota=/);
  await expect(page.locator(".estudo-titulo strong")).toHaveText("Potencial de ação");
  await expect(page.locator("[data-testid=contadores] span").first()).toHaveText("2");
  await page.locator("button.mostrar").click();
  await page.locator('.resposta[data-resposta="1"]').click(); // De novo: volta em 1 minuto
  await expect(page.locator("[data-testid=contadores] span").nth(1)).toHaveText("1");
});
