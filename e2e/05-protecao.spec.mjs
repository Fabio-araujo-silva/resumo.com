// Proteção do conteúdo para contas de aluno: marca d'água, bloqueios de cópia/impressão, cortina
// quando a janela perde o foco, PDF que não sai como arquivo e uma sessão por conta.
import { test, expect } from "@playwright/test";
import { ADMIN, BIA, entrar } from "./apoio.mjs";

test("marca d'água com o nome e o código da conta, e ela volta se for removida", async ({ page }) => {
  await entrar(page, BIA);
  await page.goto("/nota/anatomia/plexo-braquial");
  const marca = page.locator(".marca-dagua");
  await expect(marca).toHaveCount(1);
  const eu = await page.evaluate(() => fetch("/api/auth/me").then((r) => r.json()));
  await expect(marca).toHaveAttribute("data-conta", eu.user.etiqueta);
  const estilo = await marca.evaluate((e) => ({ fundo: e.style.backgroundImage.slice(0, 22), cliques: getComputedStyle(e).pointerEvents, posicao: getComputedStyle(e).position }));
  expect(estilo).toEqual({ fundo: 'url("data:image/png;ba', cliques: "none", posicao: "fixed" });

  // apagar pelo inspetor não adianta
  await page.evaluate(() => document.querySelector(".marca-dagua").remove());
  await expect(marca).toHaveCount(1);
  // esconder também não
  await page.evaluate(() => (document.querySelector(".marca-dagua").style.display = "none"));
  await expect.poll(() => page.evaluate(() => document.querySelector(".marca-dagua")?.style.display)).not.toBe("none");

  // o texto que chega ao aluno leva a etiqueta invisível da conta
  const nota = await page.evaluate(() => fetch("/api/notas/anatomia/plexo-braquial").then((r) => r.json()));
  expect(/⁠[​‌]{8,}⁠/.test(nota.html)).toBe(true);
});

test("copiar, selecionar, menu de contexto, imprimir e salvar ficam bloqueados", async ({ page }) => {
  await entrar(page, BIA);
  await page.goto("/nota/anatomia/plexo-braquial");
  const texto = page.locator(".leitor .conteudo-nota > .prosa");
  await expect(texto).toBeVisible();
  const r = await page.evaluate(() => {
    const alvo = document.querySelector(".prosa p");
    const barrado = (ev) => !alvo.dispatchEvent(ev);
    const tecla = (o) => barrado(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...o }));
    return {
      selecao: getComputedStyle(document.querySelector(".conteudo")).userSelect,
      contexto: barrado(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
      copiar: barrado(new ClipboardEvent("copy", { bubbles: true, cancelable: true })),
      recortar: barrado(new ClipboardEvent("cut", { bubbles: true, cancelable: true })),
      arrastar: barrado(new DragEvent("dragstart", { bubbles: true, cancelable: true })),
      selecionar: barrado(new Event("selectstart", { bubbles: true, cancelable: true })),
      imprimir: tecla({ key: "p", ctrlKey: true }),
      salvar: tecla({ key: "s", ctrlKey: true }),
      codigoFonte: tecla({ key: "u", ctrlKey: true }),
      inspetor: tecla({ key: "I", ctrlKey: true, shiftKey: true }),
      f12: tecla({ key: "F12" }),
      copiarTecla: tecla({ key: "c", ctrlKey: true }),
      busca: tecla({ key: "f", ctrlKey: true }), // Ctrl+F continua liberado
    };
  });
  expect(r).toEqual({ selecao: "none", contexto: true, copiar: true, recortar: true, arrastar: true, selecionar: true, imprimir: true, salvar: true, codigoFonte: true, inspetor: true, f12: true, copiarTecla: true, busca: false });

  // selecionar com o mouse não seleciona nada
  await texto.locator("p").first().dblclick();
  expect(await page.evaluate(() => String(getSelection()))).toBe("");

  // na impressão, nada do app aparece
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".app")).toBeHidden();
  await expect(texto).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await expect(texto).toBeVisible();
});

test("a tela é coberta quando a janela perde o foco e no PrintScreen", async ({ page }) => {
  await entrar(page, BIA);
  await page.goto("/nota/anatomia/plexo-braquial");
  const cortina = page.locator(".cortina");
  await expect(cortina).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(cortina).toBeVisible();
  expect(await page.locator(".conteudo").evaluate((e) => getComputedStyle(e).filter)).toContain("blur");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(cortina).toBeHidden();

  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keyup", { key: "PrintScreen", bubbles: true })));
  await expect(cortina).toBeVisible();
  await expect(cortina).toBeHidden({ timeout: 6000 });
});

test("figura e PDF só saem com sessão; o PDF nunca trafega como arquivo que abre", async ({ page, browser }) => {
  await entrar(page, BIA);
  const com = async (url) => {
    const r = await page.request.get(url);
    return { status: r.status(), inicio: (await r.body()).subarray(0, 5).toString("latin1"), tipo: r.headers()["content-type"] };
  };
  expect((await com("/api/anexos/anatomia/anexos/plexo.png")).status).toBe(200);
  expect((await com("/api/anexos/anatomia/anexos/pdf/atlas-do-joelho.pdf")).status).toBe(403);
  const pdf = await com("/api/pdf/anatomia/atlas-do-joelho");
  expect(pdf.status).toBe(200);
  expect(pdf.tipo).toContain("application/octet-stream");
  expect(pdf.inicio).not.toBe("%PDF-");

  const anonimo = await browser.newContext();
  for (const url of ["/api/notas/anatomia/plexo-braquial", "/api/anexos/anatomia/anexos/plexo.png", "/api/pdf/anatomia/atlas-do-joelho", "/api/biblioteca", "/api/prova/anatomia"])
    expect((await anonimo.request.get("http://127.0.0.1:4399" + url)).status(), url).toBe(401);
  await anonimo.close();
});

test("o administrador não tem marca d'água nem bloqueios (precisa copiar e colar)", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.goto("/nota/anatomia/plexo-braquial");
  await expect(page.locator(".leitor .conteudo-nota > .prosa")).toBeVisible();
  await expect(page.locator(".marca-dagua")).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".conteudo")).userSelect)).not.toBe("none");
  const nota = await page.evaluate(() => fetch("/api/notas/anatomia/plexo-braquial").then((r) => r.json()));
  expect(/[​‌⁠]/.test(nota.html)).toBe(false);
});

test("uma conta, um aparelho: entrar em outro lugar encerra a sessão anterior", async ({ page, browser }) => {
  await entrar(page, BIA);
  await page.goto("/estante");
  await expect(page.locator(".capa").first()).toBeVisible();

  const outro = await browser.newContext();
  const pagina2 = await outro.newPage();
  await entrar(pagina2, BIA);
  await expect(pagina2.locator(".painel-hoje")).toBeVisible();

  // o primeiro aparelho cai na próxima ação, com o motivo explicado
  await page.locator('.capa[data-materia="anatomia"]').click();
  await page.locator(".cartao-nota").nth(1).click();
  await expect(page.locator(".entrar")).toBeVisible();
  await expect(page.locator(".alerta-info")).toContainText("sessão foi encerrada");
  await outro.close();
});
