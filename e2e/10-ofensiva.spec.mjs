// Ofensiva: a chama no menu acende quando a pessoa estuda, comemora e mostra o calendário.
import { test, expect } from "@playwright/test";
import { entrar } from "./apoio.mjs";

const EVA = { email: "eva@e2e.com", senha: "eva-senha-123" };

test("a chama acende ao responder um flashcard e o painel mostra o calendário", async ({ page }) => {
  await entrar(page, EVA);
  const chama = page.locator(".lateral [data-testid=chama]");
  await expect(chama.locator("[data-testid=chama-numero]")).toHaveText("0");
  await expect(chama).toHaveClass(/apagada/);
  await expect(page.locator("[data-testid=faixa-ofensiva]")).toContainText("Sem ofensiva ainda");

  await page.goto("/flashcards/anatomia");
  await page.locator("button.mostrar").click();
  await page.locator('.resposta[data-resposta="3"]').click();
  await expect(chama.locator("[data-testid=chama-numero]")).toHaveText("1");
  await expect(chama).toHaveClass(/garantida/);
  await expect(page.locator(".aviso-ok", { hasText: "Ofensiva acesa" })).toBeVisible();

  await chama.click();
  const painel = page.locator("[data-testid=painel-ofensiva]");
  await expect(painel.locator(".ofensiva-numero")).toHaveText("1");
  await expect(page.locator(".ofensiva-frase")).toContainText("Dia garantido");
  await expect(page.locator(".calendario .cal-dia")).toHaveCount(35);
  await expect(page.locator(".calendario .cal-dia.hoje")).toHaveClass(/n1/);
  await page.keyboard.press("Escape");

  await page.goto("/");
  await expect(page.locator("[data-testid=faixa-ofensiva]")).toContainText("1 dia de ofensiva");
});
