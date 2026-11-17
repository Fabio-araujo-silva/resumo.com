// Tira capturas das telas principais (para conferir o visual e para a documentação).
//   node scripts/telas.mjs <pasta-de-saida>
// Precisa do servidor no ar e de duas contas (variáveis de ambiente):
//   URL=http://localhost:4310 ADMIN=admin@... ADMIN_SENHA=... ALUNO=... ALUNO_SENHA=...
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const url = process.env.URL || "http://localhost:4310";
const saida = path.resolve(process.argv[2] || "telas");
const so = (process.argv[3] || "").split(",").filter(Boolean); // nomes de telas para refazer só algumas
fs.mkdirSync(saida, { recursive: true });

const navegador = await chromium.launch({ channel: "chrome" });
const erros = [];

async function sessao(email, senha, opcoes = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...opcoes });
  const pagina = await ctx.newPage();
  pagina.on("console", (m) => m.type() === "error" && erros.push(`[console] ${pagina.url()} ${m.text()}`));
  pagina.on("pageerror", (e) => erros.push(`[erro] ${pagina.url()} ${e.message}`));
  await pagina.goto(url + "/");
  await pagina.fill('input[name="email"]', email);
  await pagina.fill('input[name="senha"]', senha);
  await pagina.click("button.primario");
  await pagina.waitForSelector(".app");
  return { ctx, pagina };
}

async function foto(pagina, nome, caminho, { espera, antes, inteira = false, tema } = {}) {
  if (caminho) await pagina.goto(url + caminho);
  if (tema) await pagina.evaluate((t) => document.documentElement.setAttribute("data-theme", t), tema);
  if (espera) await pagina.waitForSelector(espera, { timeout: 15000 });
  if (so.length && !so.includes(nome)) return; // navega mesmo assim: as telas seguintes dependem desta
  if (antes) await antes(pagina);
  await pagina.waitForTimeout(700);
  await pagina.screenshot({ path: path.join(saida, nome + ".png"), fullPage: inteira });
  console.log("ok", nome);
}

const primeira = async (pagina, seletor) => (await pagina.locator(seletor).first().getAttribute("href")) || "/";

// ---------- tela de entrada ----------
{
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await foto(p, "01-entrar", "/", { espera: ".entrar" });
  await ctx.close();
}

// ---------- aluno ----------
if (process.env.ALUNO) {
  const { ctx, pagina } = await sessao(process.env.ALUNO, process.env.ALUNO_SENHA);
  await foto(pagina, "02-inicio", "/", { espera: ".painel-hoje" });
  await foto(pagina, "03-prateleira", "/estante", { espera: ".capa" });
  const materia = await primeira(pagina, ".capa");
  await foto(pagina, "04-materia", materia, { espera: ".modulo" });
  await foto(pagina, "05-notas-grafo", "/notas", { espera: ".grafo canvas", antes: async (p) => {
    await p.waitForTimeout(2500);
    const pts = await p.evaluate(() => window.__grafo.pontos());
    const alvo = pts.find((x) => !/mapa/.test(x.id)) || pts[0];
    await p.mouse.click(alvo.x, alvo.y);
  } });
  await pagina.goto(url + materia);
  await pagina.waitForSelector(".cartao-nota:not(.mapa)");
  const nota = await primeira(pagina, ".cartao-nota:not(.mapa)");
  await foto(pagina, "06-nota", nota, { espera: ".prosa" });
  await foto(pagina, "07-nota-inteira", nota, { espera: ".prosa", inteira: true });
  await foto(pagina, "15-modo-teste", nota, { espera: ".prosa", antes: async (p) => {
    await p.click("[data-testid=modo-teste]");
    await p.locator(".leitor .lacuna").nth(1).click();
  } });
  await foto(pagina, "16-espiar", nota, { espera: ".prosa", antes: async (p) => {
    await p.locator(".leitor .conteudo-nota > .prosa a.wl").first().click();
    await p.waitForSelector("[data-testid=espiada] .prosa");
  } });
  await pagina.goto(url + materia);
  await pagina.waitForSelector(".cartao-nota.mapa");
  await foto(pagina, "17-mapa-do-modulo", await primeira(pagina, ".cartao-nota.mapa"), { espera: "[data-testid=mapa-modulo] canvas", antes: (p) => p.waitForTimeout(3500) });
  await foto(pagina, "08-prova", "/prova", { espera: ".cartao-prova" });
  await foto(pagina, "09-prova-materia", await primeira(pagina, ".cartao-prova"), { espera: ".ficha-prova" });
  await foto(pagina, "10-flashcards", "/flashcards", { espera: ".tabela-baralhos" });
  await foto(pagina, "11-estudo", (await primeira(pagina, ".baralho-acoes a.primario")) || "/flashcards", { espera: "[data-testid=carta]", antes: async (p) => {
    await p.click("button.mostrar");
    await p.waitForSelector("[data-testid=verso]");
  } });
  await foto(pagina, "12-nota-claro", nota, { espera: ".prosa", tema: "light" });
  await foto(pagina, "13-prateleira-claro", "/estante", { espera: ".capa", tema: "light" });
  await foto(pagina, "14-grafo-claro", "/notas", { espera: ".grafo canvas", tema: "light", antes: (p) => p.waitForTimeout(2500) });
  await ctx.close();

  // celular
  const cel = await sessao(process.env.ALUNO, process.env.ALUNO_SENHA, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await foto(cel.pagina, "20-celular-inicio", "/", { espera: ".painel-hoje" });
  await foto(cel.pagina, "21-celular-materia", materia, { espera: ".modulo" });
  await foto(cel.pagina, "22-celular-nota", nota, { espera: ".prosa" });
  await foto(cel.pagina, "23-celular-grafo", "/notas", { espera: ".grafo canvas", antes: (p) => p.waitForTimeout(2500) });
  await foto(cel.pagina, "24-celular-estudo", "/flashcards", { espera: ".tabela-baralhos" });
  await cel.ctx.close();
}

// ---------- administrador ----------
if (process.env.ADMIN) {
  const { ctx, pagina } = await sessao(process.env.ADMIN, process.env.ADMIN_SENHA);
  await foto(pagina, "30-admin-acessos", "/admin/acessos", { espera: "[data-testid=tabela-usuarios]" });
  await foto(pagina, "31-admin-conteudo", "/admin/conteudo", { espera: ".cartao-materia-admin" });
  const materia = await primeira(pagina, ".cartao-materia-admin");
  await foto(pagina, "32-admin-materia", materia, { espera: ".tabela-notas" });
  await foto(pagina, "33-admin-editor", await primeira(pagina, ".tabela-notas tbody tr:nth-child(2) td a"), { espera: ".editor-previa .prosa" });
  await foto(pagina, "34-admin-importar", "/admin/importar", { espera: ".soltar" });
  await foto(pagina, "35-admin-gerar", "/admin/gerar", { espera: "[data-testid=claude-status]" });
  await foto(pagina, "36-admin-auditoria", "/admin/auditoria", { espera: ".lista-acessos" });
  await ctx.close();
}

await navegador.close();
if (erros.length) {
  console.log("\nErros no navegador:");
  for (const e of [...new Set(erros)]) console.log("  " + e);
  process.exitCode = 1;
}
