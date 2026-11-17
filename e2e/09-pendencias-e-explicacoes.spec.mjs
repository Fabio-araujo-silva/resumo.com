// Flashcards com "?" que explica a pergunta, assunto que leva ao conteúdo (com confirmação),
// pendências para estudar depois e o player de leitura.
import { test, expect } from "@playwright/test";
import { DUDA, entrar } from "./apoio.mjs";

test.beforeEach(async ({ page }) => {
  await entrar(page, DUDA);
});

test("o ? ao lado da pergunta explica o que ela quer e mostra o assunto", async ({ page }) => {
  await page.goto("/flashcards/anatomia");
  const carta = page.locator("[data-testid=carta]");
  await expect(carta.locator("[data-testid=assunto]")).toHaveText("Plexo braquial");
  await carta.locator("[data-testid=explica]").click();
  const balao = carta.locator(".ajuda-balao");
  await expect(balao).toContainText("O que a pergunta 1 quer saber");
  await expect(balao).toContainText("Assunto");
  await expect(balao).toContainText("Membro Superior");
  await page.keyboard.press("Escape");
  await expect(balao).toHaveCount(0);
  // a legenda dos números
  await page.locator('.contadores-caixa button[aria-label="O que são esses números?"]').click();
  await expect(page.locator(".contadores-caixa .ajuda-balao")).toContainText("revisões que vencem hoje");
});

test("clicar no assunto pede confirmação antes de sair do estudo", async ({ page }) => {
  await page.goto("/flashcards/anatomia");
  await page.click("[data-testid=assunto]");
  const modal = page.locator(".modal");
  await expect(modal).toContainText("Ir para o conteúdo?");
  await expect(modal).toContainText("Plexo braquial");
  // desistir: continua no estudo
  await modal.locator("button", { hasText: "Continuar estudando" }).click();
  await expect(modal).toHaveCount(0);
  await expect(page).toHaveURL(/\/flashcards\/anatomia$/);
  // confirmar: vai para a nota
  await page.click("[data-testid=assunto]");
  await page.locator("[data-testid=confirmar-ir] button", { hasText: "Abrir a nota" }).click();
  await expect(page).toHaveURL(/\/nota\/anatomia\/plexo-braquial$/);
});

test("pendências: separar pelo flashcard e pela nota, ver na aba e dar baixa", async ({ page }) => {
  await page.goto("/flashcards/anatomia");
  const botao = page.locator("[data-testid=pendencia-carta]");
  await expect(botao).toContainText("Estudar depois");
  await botao.click();
  await expect(botao).toContainText("Nas pendências");
  await expect(page.locator("[data-testid=conta-pendencias]")).toHaveText("1");

  // pela confirmação do assunto também dá para guardar sem sair
  await page.locator("button.mostrar").click();
  await page.locator('.resposta[data-resposta="4"]').click();
  await expect(page.locator("[data-testid=assunto]")).toHaveText("Plexo braquial"); // segundo flashcard da mesma nota
  await page.locator('.resposta, button.mostrar').first().waitFor();
  await page.locator("button.mostrar").click();
  await page.locator('.resposta[data-resposta="4"]').click();
  await expect(page.locator("[data-testid=assunto]")).not.toHaveText("Plexo braquial");
  await page.click("[data-testid=assunto]");
  await page.locator(".modal .link-botao", { hasText: "Guarde nas pendências" }).click();
  await expect(page.locator("[data-testid=conta-pendencias]")).toHaveText("2");

  // pela nota
  await page.goto("/nota/fisiologia/potencial-de-acao");
  await page.click("[data-testid=adicionar-pendencia]");
  await expect(page.locator("[data-testid=faixa-pendente]")).toBeVisible();
  await expect(page.locator("[data-testid=conta-pendencias]")).toHaveText("3");

  // a aba
  await page.locator(".lateral .nav-item", { hasText: "Pendências" }).click();
  await expect(page).toHaveURL(/\/pendencias$/);
  const lista = page.locator("[data-testid=pendencias] li");
  await expect(lista).toHaveCount(3);
  await expect(page.locator(".grupo-pendencias")).toHaveCount(2); // anatomia e fisiologia
  await page.locator('[data-testid=pendencias] li[data-nota="anatomia/plexo-braquial"] button', { hasText: "Dei baixa" }).click();
  await expect(lista).toHaveCount(2);
  await expect(page.locator("[data-testid=conta-pendencias]")).toHaveText("2");
  // a baixa também marca a nota como lida
  await page.goto("/nota/anatomia/plexo-braquial");
  await expect(page.locator("[data-testid=marcar-lida]")).toContainText("Lida");

  // dar baixa pela própria nota
  await page.goto("/nota/fisiologia/potencial-de-acao");
  await page.locator("[data-testid=faixa-pendente] button", { hasText: "Dei baixa" }).click();
  await expect(page.locator("[data-testid=faixa-pendente]")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-testid=faixa-pendente]")).toHaveCount(0);
  await expect(page.locator("[data-testid=conta-pendencias]")).toHaveText("1");
});

test("player de leitura: tocar e parar sem travar (voz do navegador quando não há ElevenLabs)", async ({ page }) => {
  await page.goto("/nota/anatomia/nervo-ulnar");
  const player = page.locator("[data-testid=player-voz]");
  await expect(player).toBeVisible();
  const ouvir = page.locator("[data-testid=ouvir]");
  await expect(ouvir).toContainText("Ouvir");
  await ouvir.click();
  await expect(player).toHaveAttribute("data-estado", "tocando");
  await expect(ouvir).toContainText("Parar"); // a voz do navegador não promete "pausar"
  await ouvir.click();
  await expect(player).toHaveAttribute("data-estado", "parado");
  await expect(ouvir).toContainText("Ouvir");
});
