// No celular: abas embaixo, nada estoura a largura da tela, leitura e estudo funcionam com toque.
import { test, expect } from "@playwright/test";
import { DUDA, entrar } from "./apoio.mjs";

const semEstouro = async (page, onde) => {
  const d = await page.evaluate(() => ({ pagina: document.documentElement.scrollWidth, tela: window.innerWidth }));
  expect(d.pagina, "largura em " + onde).toBeLessThanOrEqual(d.tela + 1);
};

test("navegação pelas abas de baixo e páginas que cabem na tela", async ({ page }) => {
  await entrar(page, DUDA);
  await expect(page.locator(".abas-baixo")).toBeVisible();
  await expect(page.locator(".lateral")).toBeHidden();
  await semEstouro(page, "início");

  await page.locator(".abas-baixo a", { hasText: "Prateleira" }).tap();
  await expect(page.locator(".capa").first()).toBeVisible();
  await semEstouro(page, "prateleira");
  await page.locator('.capa[data-materia="anatomia"]').tap();
  await expect(page.locator(".modulo").first()).toBeVisible();
  await semEstouro(page, "matéria");
  // as fichas do módulo rolam de lado dentro da fileira, não a página
  const trilho = page.locator(".trilho").first();
  expect(await trilho.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);

  await page.locator('.cartao-nota[data-nota="anatomia/nervo-ulnar"]').tap();
  await expect(page.locator(".leitor h1")).toHaveText("Nervo ulnar");
  await semEstouro(page, "nota");
  // a tabela larga rola dentro da própria caixa
  expect(await page.locator(".leitor .tabela").first().evaluate((e) => e.scrollWidth >= e.clientWidth)).toBe(true);

  for (const [aba, seletor] of [["Prova", ".cartao-prova"], ["Flashcards", ".tabela-baralhos"], ["Pendências", ".pagina"]]) {
    await page.locator(".abas-baixo a", { hasText: aba }).tap();
    await expect(page.locator(seletor).first()).toBeVisible();
    await semEstouro(page, aba);
  }
});

test("espiar abre como painel de baixo; lacunas e cartas respondem ao toque", async ({ page }) => {
  await entrar(page, DUDA);
  await page.goto("/nota/anatomia/nervo-ulnar");
  await page.locator(".leitor .conteudo-nota > .prosa a.wl").first().tap();
  const painel = page.locator("[data-testid=espiada]");
  await expect(painel.locator(".espiada-corpo > h2")).toHaveText("Plexo braquial");
  const caixa = await painel.boundingBox();
  expect(caixa.width).toBeGreaterThan(380);
  expect(caixa.y).toBeGreaterThan(60); // sobe de baixo, sem cobrir a tela toda
  await painel.locator('button[aria-label="Fechar"]').tap();
  await expect(painel).toHaveCount(0);

  await page.locator("[data-testid=modo-teste]").tap();
  const lacuna = page.locator(".leitor .lacuna").first();
  await lacuna.tap();
  await expect(lacuna).toHaveClass(/revelada/);
  await page.locator("[data-testid=modo-teste]").tap();

  await page.locator("[data-testid=vira]").tap();
  await expect(page.locator("[data-testid=vira]")).toHaveClass(/virada/);

  await page.goto("/flashcards/anatomia");
  await page.locator("button.mostrar").tap();
  await expect(page.locator(".respostas .resposta")).toHaveCount(4);
  await page.locator('.resposta[data-resposta="3"]').tap();
  await expect(page.locator("[data-testid=contadores] span").nth(1)).toHaveText("1");
  await semEstouro(page, "estudo");
});
