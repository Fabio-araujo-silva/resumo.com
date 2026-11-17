// Avaliações (N1 e N2) como estrutura de base de toda matéria, e o limite diário de cartas novas
// que cada assinante ajusta sozinho.
import { test, expect } from "@playwright/test";
import { ADMIN, ANA, BIA, entrar } from "./apoio.mjs";

test("painel: mover um módulo para a N2 e dar data e foco à prova da N2", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.goto("/admin/conteudo/anatomia");
  await expect(page.locator(".titulo-av")).toHaveCount(1); // por padrão tudo é N1
  await page.locator('select[aria-label="Avaliação do módulo Membro Inferior"]').selectOption("n2");
  await expect(page.locator(".aviso-ok", { hasText: "Módulo movido para a N2" })).toBeVisible();
  await expect(page.locator(".titulo-av")).toHaveCount(2);
  await expect(page.locator('[data-modulo-av="n2"]')).toContainText("Membro Inferior");

  await page.fill('input[name="n2Data"]', "2031-08-20");
  await page.fill('textarea[name="n2Foco"]', "Nervo isquiático e joelho.");
  await page.locator("button", { hasText: "Salvar prova" }).click();
  await expect(page.locator(".aviso-ok", { hasText: "Matéria salva" })).toBeVisible();
});

test("assinante: a matéria aparece separada em N1 e N2, com prova e cartas de cada uma", async ({ page }) => {
  await entrar(page, ANA);
  await expect(page.locator('.capa[data-materia="anatomia"] .capa-av')).toHaveText("N1 · N2");

  await page.goto("/materia/anatomia");
  await expect(page.locator(".avaliacao")).toHaveCount(2);
  const n2 = page.locator('.avaliacao[data-avaliacao="n2"]');
  await expect(n2.locator(".avaliacao-sigla")).toHaveText("N2");
  await expect(n2.locator(".modulo h3")).toHaveText("Membro Inferior");
  await expect(n2.locator(".avaliacao-cabeca")).toContainText("20/08/2031");
  await expect(page.locator('.avaliacao[data-avaliacao="n1"] .modulo h3')).toHaveText("Membro Superior");
  await page.locator('.barra-filtros .chip[data-av="n2"]').click();
  await expect(page.locator(".avaliacao")).toHaveCount(1);
  await expect(page.locator(".modulo")).toHaveCount(1);

  // modo prova da N2 direto da matéria
  await n2.locator("a", { hasText: "Modo prova N2" }).click();
  await expect(page).toHaveURL(/\/prova\/anatomia\?av=n2$/);
  await expect(page.locator(".heroi .olho")).toContainText("N2");
  await expect(page.locator(".heroi-prova")).toContainText("20/08/2031");
  await expect(page.locator(".foco")).toContainText("Nervo isquiático e joelho.");
  await expect(page.locator('.ficha-prova[data-nota="anatomia/nervo-isquiatico"]')).toBeVisible();
  await expect(page.locator('.ficha-prova[data-nota="anatomia/plexo-braquial"]')).toHaveCount(0);
  // trocar para a N1 sem sair
  await page.locator('.alternador-av button[data-av="n1"]').click();
  await expect(page).toHaveURL(/av=n1$/);
  await expect(page.locator('.ficha-prova[data-nota="anatomia/plexo-braquial"]')).toBeVisible();
  await expect(page.locator('.ficha-prova[data-nota="anatomia/nervo-isquiatico"]')).toHaveCount(0);
  await expect(page.locator(".foco")).toContainText("Plexo braquial e manguito.");

  // lista do modo prova: uma entrada por avaliação
  await page.goto("/prova");
  await expect(page.locator('.cartao-prova[data-materia="anatomia"]')).toHaveCount(2);
  await expect(page.locator('.cartao-prova[data-materia="anatomia"][data-av="n2"]')).toContainText("20/08/2031");

  // grafo e flashcards filtram por avaliação
  await page.goto("/notas?materia=anatomia");
  await expect(page.locator("[data-testid=topicos]")).toContainText("Plexo braquial");
  await page.locator('.explorar-topicos .chip[data-av="n2"]').click();
  await expect(page.locator("[data-testid=topicos]")).toContainText("Nervo isquiático");
  await expect(page.locator("[data-testid=topicos]")).not.toContainText("Plexo braquial");
  await page.goto("/flashcards");
  await page.locator('[data-baralho="anatomia"] a[data-av="n2"]').click();
  await expect(page).toHaveURL(/\/flashcards\/anatomia\?av=n2$/);
  await expect(page.locator(".estudo-titulo strong")).toHaveText("Flashcards da N2");
});

test("limite diário de cartas novas: o assinante aumenta sozinho, na tela de baralhos e no fim do estudo", async ({ page }) => {
  await entrar(page, BIA);
  await page.goto("/flashcards");
  const valor = page.locator("[data-testid=limite-valor]");
  await expect(valor).toHaveText("20");
  await page.locator('[data-testid=limite-diario] button[aria-label="Aumentar 10"]').click();
  await expect(valor).toHaveText("30");
  await page.locator("[data-testid=limite-diario] .chip", { hasText: /^60$/ }).click();
  await expect(valor).toHaveText("60");
  await page.reload();
  await expect(page.locator("[data-testid=limite-valor]")).toHaveText("60"); // fica guardado na conta

  // com um limite baixo, o baralho para cedo e oferece liberar mais
  const r = await page.request.post("/api/flashcards/limite", { headers: { "x-resumo": "1" }, data: { novosPorDia: 5 } });
  expect(r.status()).toBe(200);
  await page.goto("/flashcards");
  await expect(page.locator('[data-baralho="anatomia"] .num.novas')).toHaveText("5");
  await expect(page.locator('[data-baralho="anatomia"] .baralho-nome small')).toContainText("novos esperando");
  await expect(page.locator("[data-testid=limite-diario]")).toContainText("esperando");
  await page.goto("/flashcards/anatomia");
  for (let i = 0; i < 5; i++) {
    await page.locator("button.mostrar").click();
    await page.locator('.resposta[data-resposta="4"]').click();
    await expect(page.locator(".respostas")).toHaveCount(0);
  }
  const liberar = page.locator("[data-testid=liberar-novas]");
  await expect(liberar).toContainText("Seu limite é de 5 por dia");
  await liberar.locator("button", { hasText: "Estudar mais 10 hoje" }).click();
  await expect(page.locator("[data-testid=carta]")).toHaveAttribute("data-estado", "novo");
  await expect(page.locator("[data-testid=fim-estudo]")).toHaveCount(0);
});

test("painel: a matéria inteira de volta para a N1", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.goto("/admin/conteudo/anatomia");
  await page.click("[data-testid=tudo-n1]");
  await expect(page.locator(".aviso-ok", { hasText: "Toda a matéria agora é N1" })).toBeVisible();
  await expect(page.locator(".titulo-av")).toHaveCount(1);
  await page.goto("/materia/anatomia");
  await expect(page.locator(".avaliacao")).toHaveCount(1);
});
