// Visão de notas atômicas: o grafo, os filtros e a lista.
import { test, expect } from "@playwright/test";
import { ANA, entrar } from "./apoio.mjs";

const ponto = async (page, id) => {
  await page.waitForFunction(() => window.__grafo && window.__grafo.pontos().length > 0);
  await page.waitForTimeout(4500); // espera a simulação assentar
  const pts = await page.evaluate(() => window.__grafo.pontos());
  const p = pts.find((x) => x.id === id);
  if (!p) throw new Error("nó não encontrado: " + id + " em " + pts.map((x) => x.id).join(", "));
  return p;
};

test("grafo: clicar numa nota mostra o que ela é e a que se liga; abrir leva à leitura", async ({ page }) => {
  await entrar(page, ANA);
  await page.goto("/notas");
  await expect(page.locator(".grafo canvas")).toBeVisible();
  await expect(page.locator("[data-testid=resumo-grafo]")).toHaveText(/7 notas · \d+ ligações/);
  // o canvas tem desenho
  const pintados = await page.locator(".grafo canvas").evaluate((c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  expect(pintados).toBeGreaterThan(300);

  const p = await ponto(page, "anatomia/nervo-isquiatico");
  await page.mouse.click(p.x, p.y);
  const painel = page.locator("[data-testid=painel-nota]");
  await expect(painel.locator("h3")).toHaveText("Nervo isquiático");
  await expect(painel).toContainText("O maior nervo do corpo");
  await expect(painel.locator(".lista-ligadas")).toContainText("Plexo braquial");
  // pular para a nota ligada sem sair do grafo
  await painel.locator(".lista-ligadas button", { hasText: "Plexo braquial" }).click();
  await expect(painel.locator("h3")).toHaveText("Plexo braquial");
  await painel.locator("a.primario").click();
  await expect(page).toHaveURL(/\/nota\/anatomia\/plexo-braquial$/);
});

test("grafo: dois cliques abrem a nota", async ({ page }) => {
  await entrar(page, ANA);
  await page.goto("/notas");
  const p = await ponto(page, "anatomia/manguito-rotador");
  await page.mouse.dblclick(p.x, p.y);
  await expect(page).toHaveURL(/\/nota\/anatomia\/manguito-rotador$/);
});

test("filtros por semestre, matéria e prova; modo lista", async ({ page }) => {
  await entrar(page, ANA);
  await page.goto("/notas");
  const resumo = page.locator("[data-testid=resumo-grafo]");
  await expect(resumo).toHaveText(/^7 notas/);
  await page.locator(".filtros .chip", { hasText: "Fisiologia" }).click();
  await expect(resumo).toHaveText(/^1 nota ·/);
  await page.locator(".filtros .chip", { hasText: "Todas as matérias" }).click();
  await page.locator(".filtros .chip", { hasText: /^1º$/ }).click();
  await expect(resumo).toHaveText(/^6 notas/);
  await page.locator(".filtros .chip", { hasText: "Só prova" }).click();
  await expect(resumo).toHaveText(/^4 notas/); // 3 de prova + o mapa do módulo
  await page.locator(".filtros .chip", { hasText: "Só prova" }).click();

  // realce pela busca
  await page.fill(".campo-busca input", "isqui");
  await expect(page.locator(".campo-busca small")).toHaveText("1");

  await page.locator(".alternador button", { hasText: "Lista" }).click();
  await expect(page.locator(".lista-notas li")).toHaveCount(1);
  await page.fill(".campo-busca input", "");
  await expect(page.locator(".lista-notas li")).toHaveCount(6);
  await page.locator(".lista-notas a", { hasText: "Nervo ulnar" }).click();
  await expect(page).toHaveURL(/\/nota\/anatomia\/nervo-ulnar$/);

  // vindo da matéria, o grafo já abre filtrado
  await page.goto("/notas?materia=fisiologia");
  await expect(page.locator("[data-testid=resumo-grafo]")).toHaveText(/^1 nota ·/);
});
