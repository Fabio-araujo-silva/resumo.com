import { test, expect } from "@playwright/test";
import { ANA, entrar } from "./apoio.mjs";

test("sem login ninguém vê nada; senha errada avisa; login leva ao início", async ({ page }) => {
  await page.goto("/nota/anatomia/plexo-braquial");
  await expect(page.locator(".entrar")).toBeVisible();
  await expect(page.locator(".app")).toHaveCount(0);

  await page.fill('input[name="email"]', ANA.email);
  await page.fill('input[name="senha"]', "senha-errada");
  await page.click("button.primario");
  await expect(page.locator(".alerta-erro")).toContainText("login ou senha incorretos");

  await page.fill('input[name="senha"]', ANA.senha);
  await page.click("button.primario");
  // depois de entrar, cai direto na nota que tinha pedido
  await expect(page.locator(".leitor h1")).toHaveText("Plexo braquial");
  await page.goto("/");
  await expect(page.locator(".titulo-pagina")).toContainText("Ana");
  await expect(page.locator(".painel-hoje")).toBeVisible();
  await expect(page.locator(".capa")).toHaveCount(2);
});

test("tema escuro é o padrão; o claro é opcional e fica guardado", async ({ page }) => {
  await entrar(page, ANA);
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "dark");
  const escuro = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.click("[data-testid=alternar-tema]");
  await expect(html).toHaveAttribute("data-theme", "light");
  const claro = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(claro).not.toBe(escuro);
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.click("[data-testid=alternar-tema]");
  await expect(html).toHaveAttribute("data-theme", "dark");
});

test("sair encerra a sessão", async ({ page }) => {
  await entrar(page, ANA);
  await page.click('.lateral button[aria-label="Sair"]');
  await expect(page.locator(".entrar")).toBeVisible();
  await page.goto("/estante");
  await expect(page.locator(".entrar")).toBeVisible();
});
