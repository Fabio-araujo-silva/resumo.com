// "Explorar ligações": um tópico por vez, sem o mapa inteiro. Não fica no menu.
import { test, expect } from "@playwright/test";
import { ANA, entrar } from "./apoio.mjs";

const ponto = async (page, id) => {
  await page.waitForFunction(() => window.__grafo && window.__grafo.pontos().length > 0);
  await page.waitForTimeout(2500); // espera a simulação assentar
  const pts = await page.evaluate(() => window.__grafo.pontos());
  const p = pts.find((x) => x.id === id);
  if (!p) throw new Error("nó não encontrado: " + id + " em " + pts.map((x) => x.id).join(", "));
  return p;
};
const nosNoGrafo = (page) => page.evaluate(() => window.__grafo.pontos().map((p) => p.id).sort());

test("não há aba no menu; a nota leva ao tópico, que mostra só ele e as notas ligadas", async ({ page }) => {
  await entrar(page, ANA);
  await expect(page.locator(".lateral .nav-item", { hasText: "Notas atômicas" })).toHaveCount(0);

  await page.goto("/nota/anatomia/nervo-isquiatico");
  await page.click("[data-testid=explorar-ligacoes]");
  await expect(page).toHaveURL(/\/notas\?nota=anatomia%2Fnervo-isquiatico$/);
  const painel = page.locator("[data-testid=painel-nota]");
  await expect(painel.locator("h3")).toHaveText("Nervo isquiático");
  await page.waitForFunction(() => window.__grafo && window.__grafo.pontos().length > 0);
  // só o centro e a vizinha: nada do resto da matéria
  expect(await nosNoGrafo(page)).toEqual(["anatomia/nervo-isquiatico", "anatomia/plexo-braquial"]);
  await expect(painel.locator("[data-testid=resumo-grafo]")).toHaveText("1 ligação");

  // clicar na vizinha faz dela o centro, e o grafo muda junto
  const p = await ponto(page, "anatomia/plexo-braquial");
  await page.mouse.click(p.x, p.y);
  await expect(painel.locator("h3")).toHaveText("Plexo braquial");
  // o centro mais exatamente as suas ligações (inclusive de outra matéria), e nada além
  const ligacoes = Number((await painel.locator("[data-testid=resumo-grafo]").innerText()).match(/\d+/)[0]);
  await expect.poll(async () => (await nosNoGrafo(page)).length).toBe(ligacoes + 1);
  const nos = await nosNoGrafo(page);
  for (const id of ["anatomia/plexo-braquial", "anatomia/nervo-isquiatico", "anatomia/manguito-rotador", "fisiologia/potencial-de-acao"]) expect(nos).toContain(id);
  // voltar pelo caminho
  await page.click("[data-testid=voltar-foco]");
  await expect(painel.locator("h3")).toHaveText("Nervo isquiático");
  // seguir pela lista do painel e abrir a nota
  await painel.locator(".lista-ligadas button", { hasText: "Plexo braquial" }).click();
  await expect(painel.locator("h3")).toHaveText("Plexo braquial");
  await painel.locator("a.primario").click();
  await expect(page).toHaveURL(/\/nota\/anatomia\/plexo-braquial$/);
});

test("escolher o tópico na lista, com filtros e busca; dois cliques abrem a nota", async ({ page }) => {
  await entrar(page, ANA);
  await page.goto("/materia/anatomia");
  await page.locator(".heroi-acoes a", { hasText: "Explorar ligações" }).click();
  await expect(page).toHaveURL(/\/notas\?materia=anatomia$/);
  const painel = page.locator("[data-testid=painel-nota]");
  await expect(painel.locator("h3")).toHaveText("Visão geral: Membro Superior"); // começa pela visão geral

  await page.fill('input[aria-label="Procurar um tópico"]', "manguito");
  await expect(page.locator("[data-testid=topicos] li")).toHaveCount(1);
  await page.locator("[data-testid=topicos] button", { hasText: "Manguito rotador" }).click();
  await expect(painel.locator("h3")).toHaveText("Manguito rotador");
  await page.fill('input[aria-label="Procurar um tópico"]', "");

  const p = await ponto(page, "anatomia/plexo-braquial");
  await page.mouse.dblclick(p.x, p.y);
  await expect(page).toHaveURL(/\/nota\/anatomia\/plexo-braquial$/);
});
