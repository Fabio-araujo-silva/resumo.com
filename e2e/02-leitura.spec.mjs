// A leitura: prateleira -> matéria -> nota, e tudo o que é clicável dentro da nota.
import { test, expect } from "@playwright/test";
import { ANA, entrar } from "./apoio.mjs";

test.beforeEach(async ({ page }) => {
  await entrar(page, ANA);
});

test("prateleira: semestres, capas, módulos em fileiras e progresso de leitura", async ({ page }) => {
  await page.goto("/estante");
  await expect(page.locator(".prateleira")).toHaveCount(2);
  await expect(page.locator(".prateleira-rotulo").first()).toContainText("1º semestre");
  await page.locator(".chips .chip", { hasText: "2º" }).click();
  await expect(page.locator(".capa")).toHaveCount(1);
  await expect(page.locator(".capa h3")).toHaveText("Fisiologia");
  await page.locator(".chips .chip", { hasText: "Todos" }).click();

  await page.click('.capa[data-materia="anatomia"]');
  await expect(page).toHaveURL(/\/materia\/anatomia$/);
  await expect(page.locator(".heroi h1")).toHaveText("Anatomia");
  await expect(page.locator(".modulo")).toHaveCount(2);
  await expect(page.locator(".modulo h3").first()).toHaveText("Membro Superior");
  const primeiro = page.locator(".modulo").first();
  await expect(primeiro.locator(".cartao-nota")).toHaveCount(4);
  await expect(primeiro.locator(".cartao-nota.mapa h4")).toContainText("Visão geral");

  // só conteúdo de prova
  await page.locator(".barra-filtros .chip").click();
  await expect(page.locator(".cartao-nota")).toHaveCount(3);
  await page.locator(".barra-filtros .chip").click();

  // ler e marcar: o progresso aparece na matéria
  await page.click('.cartao-nota[data-nota="anatomia/manguito-rotador"]');
  await expect(page.locator(".leitor h1")).toHaveText("Manguito rotador");
  await page.click("[data-testid=marcar-lida]");
  await expect(page.locator("[data-testid=marcar-lida]")).toContainText("Lida");
  await page.goto("/materia/anatomia");
  await expect(page.locator('.cartao-nota.lida[data-nota="anatomia/manguito-rotador"]')).toBeVisible();
  await expect(primeiro.locator(".modulo-progresso")).toContainText("1/3");
});

test("nota: blocos, grifo, figura, questão com correção e ligações", async ({ page }) => {
  await page.goto("/nota/anatomia/plexo-braquial");
  await expect(page.locator(".leitor-resumo")).toContainText("C5 a T1");
  await expect(page.locator(".leitor .selo-prova")).toContainText("prioridade alta");
  await expect(page.locator(".prosa .callout-ideia .callout-rotulo")).toHaveText("Ideia central");
  await expect(page.locator(".prosa mark")).toHaveText("grife isto");
  const img = page.locator(".prosa .fig img");
  await expect(img).toBeVisible();
  expect(await img.evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator(".leitor .conteudo-nota > .prosa")).not.toContainText("Pergunta 1 sobre"); // flashcards ficam fora do texto

  // questão: erra, vê a certa e o comentário
  const q = page.locator(".questao").first();
  await expect(q.locator(".q-coment")).toBeHidden();
  await q.locator('.q-alt[data-i="0"]').click();
  await expect(q.locator('.q-alt[data-i="0"]')).toHaveClass(/errada/);
  await expect(q.locator('.q-alt[data-i="1"]')).toHaveClass(/certa/);
  await expect(q.locator(".q-coment")).toContainText("C5 a T1");

  // conexões na lateral
  await expect(page.locator(".conexoes .mini-grafo")).toBeVisible();
  await expect(page.locator(".conexoes .ligadas").first()).toContainText("Manguito rotador");
  await expect(page.locator(".conexoes .ligadas").nth(1)).toContainText("Nervo isquiático");
  await expect(page.locator(".vizinha").first()).toContainText("Mapa - Membro Superior");
});

test("espiar: clicar num link abre a nota ao lado sem sair da leitura", async ({ page }) => {
  await page.goto("/nota/anatomia/plexo-braquial");
  await page.locator(".leitor .prosa a.wl").first().click();
  const painel = page.locator("[data-testid=espiada]");
  await expect(painel).toHaveAttribute("data-nota", "anatomia/manguito-rotador");
  await expect(painel.locator(".espiada-corpo > h2")).toHaveText("Manguito rotador");
  await expect(painel.locator(".prosa")).toContainText("upraespinal");
  await expect(page).toHaveURL(/plexo-braquial$/);
  // dentro do painel os links continuam; "voltar" desfaz
  await painel.locator(".prosa a.wl").first().click();
  await expect(painel).toHaveAttribute("data-nota", "anatomia/plexo-braquial");
  await painel.locator('button[aria-label="Voltar à nota anterior"]').click();
  await expect(painel).toHaveAttribute("data-nota", "anatomia/manguito-rotador");
  await page.keyboard.press("Escape");
  await expect(painel).toHaveCount(0);

  await page.locator(".leitor .prosa a.wl").first().click();
  await page.locator("[data-testid=espiada] footer button").click();
  await expect(page).toHaveURL(/\/nota\/anatomia\/manguito-rotador$/);
  await expect(page.locator("[data-testid=espiada]")).toHaveCount(0);
  // a trilha lembra de onde veio
  await expect(page.locator("[data-testid=trilha]")).toContainText("Plexo braquial");
});

test("modo Testar-se: termos-chave viram lacunas que abrem com um clique", async ({ page }) => {
  await page.goto("/nota/anatomia/nervo-ulnar");
  await expect(page.locator(".lacuna")).toHaveCount(0);
  await page.click("[data-testid=modo-teste]");
  const total = await page.locator(".leitor .lacuna").count();
  expect(total).toBeGreaterThanOrEqual(5);
  await expect(page.locator("[data-testid=lacunas]")).toHaveText(`0/${total} reveladas`);
  const primeira = page.locator(".leitor .lacuna").first();
  expect(await primeira.evaluate((e) => getComputedStyle(e).color)).toBe("rgba(0, 0, 0, 0)");
  await primeira.click();
  await expect(primeira).toHaveClass(/revelada/);
  await expect(page.locator("[data-testid=lacunas]")).toHaveText(`1/${total} reveladas`);
  await page.locator(".ferramentas button", { hasText: "Revelar tudo" }).click();
  await expect(page.locator("[data-testid=lacunas]")).toHaveText(`${total}/${total} reveladas`);
  // atalho T sai do modo
  await page.locator(".leitor-cabeca h1").click();
  await page.keyboard.press("t");
  await expect(page.locator(".lacuna")).toHaveCount(0);
});

test("tabela, passo a passo, blocos, 'já sei' e placar das questões são clicáveis", async ({ page }) => {
  await page.goto("/nota/anatomia/nervo-ulnar");
  const prosa = page.locator(".leitor .conteudo-nota > .prosa");

  // tabela: esconder a coluna "Sinal" e revelar uma célula
  const tabela = prosa.locator("table.interativa");
  await tabela.locator("thead th").nth(1).click();
  await expect(tabela.locator("td.col-oculta")).toHaveCount(3);
  await tabela.locator("td.col-oculta").first().click();
  await expect(tabela.locator("td.col-oculta")).toHaveCount(2);
  await tabela.locator("thead th").nth(1).click();
  await expect(tabela.locator("td.col-oculta")).toHaveCount(0);

  // passo a passo
  const passos = prosa.locator("ol.passos > li");
  await expect(passos).toHaveCount(4);
  await expect(prosa.locator(".passos-barra b")).toHaveText("0/4");
  await passos.nth(0).click();
  await passos.nth(1).click();
  await expect(passos.nth(0)).toHaveClass(/feito/);
  await expect(prosa.locator(".passos-barra b")).toHaveText("2/4");

  // blocos abrem e fecham; o que foi escrito com "-" começa recolhido
  const dica = prosa.locator(".callout-prova");
  await expect(dica.locator(".callout-corpo")).toBeVisible();
  await dica.locator(".callout-cabeca").click();
  await expect(dica.locator(".callout-corpo")).toBeHidden();
  const caso = prosa.locator('.callout[data-callout="exemplo"]');
  await expect(caso.locator(".callout-corpo")).toBeHidden();
  await caso.locator(".callout-cabeca").click();
  await expect(caso.locator(".callout-corpo")).toContainText("Ciclista");

  // essencial: "já sei" fica guardado
  const essencial = prosa.locator(".callout-essencial");
  await expect(essencial.locator(".sei-conta")).toHaveText("0/2 já sei");
  await essencial.locator(".callout-corpo li").first().click();
  await expect(essencial.locator(".sei-conta")).toHaveText("1/2 já sei");
  await page.reload();
  await expect(page.locator(".leitor .callout-essencial .callout-corpo li").first()).toHaveClass(/sei/);
  await expect(page.locator(".leitor .callout-essencial .sei-conta")).toHaveText("1/2 já sei");

  // placar: uma certa e uma errada
  const qs = page.locator(".leitor .questao");
  await qs.nth(0).locator('.q-alt[data-i="1"]').click();
  await expect(page.locator("[data-testid=placar]")).toHaveCount(0);
  await qs.nth(1).locator('.q-alt[data-i="1"]').click();
  await expect(page.locator("[data-testid=placar]")).toContainText("1 de 2");
  await page.locator("[data-testid=placar] button").click();
  await expect(page.locator(".leitor .q-alt.certa")).toHaveCount(0);
});

test("baralho da nota vira; foco, letra e atalhos funcionam", async ({ page }) => {
  await page.goto("/nota/anatomia/nervo-ulnar");
  const vira = page.locator("[data-testid=vira]");
  await expect(page.locator("[data-testid=baralho-nota] header .sub")).toContainText("1 de 2");
  await expect(vira).not.toHaveClass(/virada/);
  await vira.click();
  await expect(vira).toHaveClass(/virada/);
  await expect(vira.locator(".vira-face.verso")).toContainText("fascículo medial");
  await page.locator('[data-testid=baralho-nota] button[aria-label="Próxima carta"]').click();
  await expect(vira).not.toHaveClass(/virada/);
  await expect(page.locator("[data-testid=baralho-nota] header .sub")).toContainText("2 de 2");

  // tamanho da letra
  const tamanho = () => page.locator(".leitor .conteudo-nota > .prosa").evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  const antes = await tamanho();
  await page.locator('.ferramentas button[aria-label="Aumentar a letra"]').click();
  expect(await tamanho()).toBeGreaterThan(antes);
  await page.locator('.ferramentas button[aria-label="Diminuir a letra"]').click();

  // modo foco esconde o menu e a lateral
  await page.click("[data-testid=modo-foco]");
  await expect(page.locator(".lateral")).toBeHidden();
  await expect(page.locator(".trilho-lateral")).toBeHidden();
  await page.locator(".leitor-cabeca h1").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".lateral")).toBeVisible();

  // ajuda de atalhos e seta para a próxima nota
  await page.locator('.ferramentas button[aria-label="Atalhos de teclado"]').click();
  await expect(page.locator("[data-testid=atalhos]")).toContainText("próxima nota");
  await page.locator(".leitor-cabeca h1").click();
  await page.keyboard.press("ArrowRight");
  await expect(page).not.toHaveURL(/nervo-ulnar$/);
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(/nervo-ulnar$/);
  if (await page.locator("[data-testid=ouvir]").count()) await expect(page.locator("[data-testid=ouvir]")).toContainText("Ouvir");
});

test("nota-mapa: grafo do módulo e links que levam direto à nota", async ({ page }) => {
  await page.goto("/nota/anatomia/mapa-membro-superior");
  await expect(page.locator(".leitor h1")).toHaveText("Membro Superior");
  await expect(page.locator("[data-testid=mapa-modulo] canvas")).toBeVisible();
  await page.locator(".leitor .prosa a.wl", { hasText: "Manguito rotador" }).click();
  await expect(page).toHaveURL(/\/nota\/anatomia\/manguito-rotador$/);
});

test("PDF abre dentro da plataforma, desenhado em canvas", async ({ page }) => {
  await page.goto("/nota/anatomia/atlas-do-joelho");
  await expect(page.locator("[data-testid=pdf-paginas]")).toHaveText("2 páginas");
  const tela = page.locator(".pdf-pagina canvas").first();
  await expect(tela).toBeVisible();
  await expect.poll(() => tela.evaluate((c) => c.width)).toBeGreaterThan(200);
  // a página tem tinta: o texto do PDF foi desenhado
  await expect.poll(() => tela.evaluate((c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let escuros = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 80 && d[i + 3] > 200) escuros++;
    return escuros;
  })).toBeGreaterThan(50);
  await expect(page.locator(".pdf a, .pdf embed, .pdf iframe, .pdf object")).toHaveCount(0);
});

test("busca com Ctrl+K acha por título (sem acento) e dentro do texto", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".painel-hoje")).toBeVisible();
  await page.keyboard.press("Control+k");
  const campo = page.locator(".busca input");
  await campo.fill("isquiatico");
  await expect(page.locator(".busca-item").first()).toContainText("Nervo isquiático");
  await campo.fill("fasciculo posterior");
  await expect(page.locator(".busca-item", { hasText: "no texto" })).toContainText("Plexo braquial");
  await campo.fill("manguito");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/manguito-rotador$/);
  // o botão do menu abre a mesma busca; Esc fecha
  await page.locator(".lateral-busca").click();
  await expect(page.locator(".busca input")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".busca")).toHaveCount(0);
});
