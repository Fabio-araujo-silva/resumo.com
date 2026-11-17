// Painel do administrador: acessos, conteúdo e marcação de prova, editor, importação de pacote,
// PDF direto, geração com o Claude (aqui, um Claude de mentira), auditoria e tokens.
import { test, expect } from "@playwright/test";
import { ADMIN, ANA, entrar, pdfDeTeste, zipBioquimica } from "./apoio.mjs";

test.beforeEach(async ({ page }) => {
  await entrar(page, ADMIN);
});

test("aluno não entra no painel", async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await entrar(p, ANA);
  await expect(p.locator(".lateral .nav-item", { hasText: "Painel" })).toHaveCount(0);
  await p.goto("/admin/acessos");
  await expect(p.locator(".vazio")).toContainText("Área do administrador");
  expect((await p.request.get("/api/admin/usuarios")).status()).toBe(403);
  await ctx.close();
});

test("acessos: criar um login, a pessoa entra; desativar derruba; senha nova", async ({ page, browser }) => {
  await page.goto("/admin");
  const tabela = page.locator("[data-testid=tabela-usuarios]");
  await expect(tabela.locator("tbody tr")).toHaveCount(4);

  await page.locator("button", { hasText: "Novo acesso" }).click();
  await page.fill('.modal input[name="nome"]', "Carla Dias");
  await page.fill('.modal input[name="email"]', "Carla@E2E.com");
  // só anatomia
  await page.locator(".modal .marcar", { hasText: "Todas" }).locator("input").uncheck();
  await page.locator(".modal .lista-marcar .marcar", { hasText: "Anatomia" }).locator("input").check();
  await page.locator(".modal button.primario").click();

  const cred = await page.locator("[data-testid=credenciais]").innerText();
  expect(cred).toContain("Login: carla@e2e.com");
  const senha = cred.match(/Senha: (\S+)/)[1];
  expect(senha).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await page.locator(".modal button", { hasText: "Fechar" }).click();
  const linha = tabela.locator('tr[data-usuario="carla@e2e.com"]');
  await expect(linha).toContainText("Carla Dias");
  await expect(linha).toContainText("Anatomia");

  // a Carla entra e só vê a matéria liberada
  const ctx = await browser.newContext();
  const carla = await ctx.newPage();
  await entrar(carla, { email: "carla@e2e.com", senha });
  await expect(carla.locator(".capa")).toHaveCount(1);
  await expect(carla.locator(".capa h3")).toHaveText("Anatomia");
  // a senha que o administrador mandou é provisória: ela precisa criar a dela antes de usar
  const criar = carla.locator("[data-testid=criar-senha]");
  await expect(criar).toContainText("senha provisória");
  await criar.locator('input[name="nova"]').fill("carla-senha-1");
  await criar.locator('input[name="repetir"]').fill("carla-senha-2");
  await criar.locator("button.primario").click();
  await expect(criar.locator(".alerta-erro")).toContainText("não são iguais");
  await criar.locator('input[name="repetir"]').fill("carla-senha-1");
  await criar.locator("button.primario").click();
  await expect(criar).toHaveCount(0);
  await expect(linha).toContainText("senha provisória");
  await page.reload();
  await expect(tabela.locator('tr[data-usuario="carla@e2e.com"]')).not.toContainText("senha provisória");
  const dela = "carla-senha-1";

  // desativar: a sessão dela cai e o login é recusado
  await linha.locator('button[aria-label="Desativar Carla Dias"]').click();
  await expect(linha).toContainText("desativado");
  await carla.goto("/estante");
  await expect(carla.locator(".entrar")).toBeVisible();
  await carla.fill('input[name="email"]', "carla@e2e.com");
  await carla.fill('input[name="senha"]', dela);
  await carla.click("button.primario");
  await expect(carla.locator(".alerta-erro")).toContainText("desativado");

  // reativar e gerar senha nova: a antiga deixa de valer
  await linha.locator('button[aria-label="Reativar Carla Dias"]').click();
  await expect(linha).not.toContainText("desativado");
  page.once("dialog", (d) => d.accept());
  await linha.locator('button[aria-label="Gerar senha nova para Carla Dias"]').click();
  const nova = (await page.locator("[data-testid=credenciais]").innerText()).match(/Senha: (\S+)/)[1];
  expect(nova).not.toBe(senha);
  await carla.fill('input[name="senha"]', dela);
  await carla.click("button.primario");
  await expect(carla.locator(".alerta-erro")).toContainText("incorretos");
  await carla.fill('input[name="senha"]', nova);
  await carla.click("button.primario");
  await expect(carla.locator(".app")).toBeVisible();
  await expect(carla.locator("[data-testid=criar-senha]")).toBeVisible(); // senha nova do administrador: provisória de novo
  await ctx.close();
});

test("conteúdo: data e foco da prova, marcar nota como prova, despublicar", async ({ page }) => {
  await page.goto("/admin/conteudo");
  await page.locator('.cartao-materia-admin[data-materia="fisiologia"]').click();
  await expect(page.locator(".admin-materia .titulo-secao").first()).toHaveText("Fisiologia");

  await page.fill('input[name="provaData"]', "2031-03-15");
  await page.fill('textarea[name="provaFoco"]', "Potencial de ação e sinapse.");
  await page.locator("button", { hasText: "Salvar prova" }).click();
  await expect(page.locator(".aviso-ok", { hasText: "Matéria salva" })).toBeVisible();

  const linha = page.locator('tr[data-nota="fisiologia/potencial-de-acao"]');
  await linha.locator('input[aria-label^="Conteúdo de prova"]').check();
  await linha.locator("select").selectOption("1");
  await page.waitForLoadState("networkidle");
  // agora a matéria aparece no modo prova, com data e foco
  await page.goto("/prova");
  const cartao = page.locator('.cartao-prova[data-materia="fisiologia"]');
  await expect(cartao).toContainText("15/03/2031");
  await cartao.click();
  await expect(page.locator(".foco")).toContainText("Potencial de ação e sinapse.");
  await expect(page.locator(".ficha-prova")).toHaveCount(1);
  await expect(page.locator(".ficha-prova")).toContainText("Prioridade alta");

  // despublicar esconde do aluno
  await page.goto("/admin/conteudo/fisiologia");
  await page.locator('tr[data-nota="fisiologia/potencial-de-acao"] input[aria-label^="Publicada"]').uncheck();
  await expect(page.locator('tr[data-nota="fisiologia/potencial-de-acao"]')).toContainText("rascunho");
  await page.waitForLoadState("networkidle");
  const aluno = await page.context().browser().newContext();
  const pa = await aluno.newPage();
  await entrar(pa, ANA);
  await expect(pa.locator(".capa")).toHaveCount(1);
  await aluno.close();
  await page.locator('tr[data-nota="fisiologia/potencial-de-acao"] input[aria-label^="Publicada"]').check();
  await page.waitForLoadState("networkidle");
});

test("editor: prévia ao vivo, erro bloqueia, salvar reflete no leitor; criar nota nova", async ({ page }) => {
  await page.goto("/admin/nota/anatomia/manguito-rotador");
  const fonte = page.locator('textarea[name="md"]');
  await expect(fonte).toHaveValue(/\[!flashcard\]/);
  await expect(page.locator(".editor-previa .prosa")).toContainText("Supraespinal");

  // erro de formato aparece na prévia e trava o botão
  const original = await fonte.inputValue();
  await fonte.fill(original + "\n\n> [!flashcard] Carta sem resposta\n");
  await expect(page.locator(".editor-previa .alerta-erro")).toContainText("flashcard");
  await expect(page.locator("[data-testid=salvar-nota]")).toBeDisabled();

  await fonte.fill(original.replace("Supraespinal", "SUPRA-ESPINAL") + "\n\n> [!definicao] Bursa\n> Bolsa que reduz o atrito.\n");
  await expect(page.locator(".editor-previa .prosa")).toContainText("SUPRA-ESPINAL");
  await expect(page.locator(".editor-previa .callout-def")).toContainText("Bolsa que reduz o atrito.");
  await expect(page.locator("[data-testid=salvar-nota]")).toBeEnabled();
  await page.click("[data-testid=salvar-nota]");
  await expect(page.locator(".aviso-ok", { hasText: "Nota salva" })).toBeVisible();
  await page.goto("/nota/anatomia/manguito-rotador");
  await expect(page.locator(".leitor .conteudo-nota > .prosa")).toContainText("SUPRA-ESPINAL");
  await expect(page.locator(".leitor .selo-acao")).toContainText("Editar");

  // nota nova
  await page.goto("/admin/nota/anatomia/nova");
  await page.fill('input[name="titulo"]', "Nervo mediano");
  await page.fill('input[name="resumo"]', "Passa pelo túnel do carpo.");
  await page.fill('input[name="modulo"]', "Membro Superior");
  await page.locator('input[name="prova"]').check();
  await page.fill('textarea[name="md"]', "> [!ideia]\n> O mediano passa pelo túnel do carpo. Vem do [[Plexo braquial]].\n\n> [!essencial]\n> - Túnel do carpo.\n\n> [!flashcard] Por onde passa o nervo mediano?\n> Pelo túnel do carpo.\n");
  await expect(page.locator(".editor-previa .prosa a.wl")).toHaveText("Plexo braquial");
  await page.click("[data-testid=salvar-nota]");
  await expect(page).toHaveURL(/\/admin\/nota\/anatomia\/nervo-mediano$/);
  await page.goto("/prova/anatomia");
  await expect(page.locator('.ficha-prova[data-nota="anatomia/nervo-mediano"]')).toContainText("Túnel do carpo.");
  await page.goto("/nota/anatomia/plexo-braquial");
  await expect(page.locator(".conexoes")).toContainText("Nervo mediano");
});

test("importar pacote: erro é recusado com explicação; pacote válido cria a matéria", async ({ page }) => {
  await page.goto("/admin/importar");
  const campo = page.locator("[data-testid=arquivo-pacote]");

  await campo.setInputFiles({ name: "ruim.zip", mimeType: "application/zip", buffer: zipBioquimica({ comErro: true }) });
  const rel = page.locator("[data-testid=relatorio]");
  await expect(rel.locator(".alerta-erro")).toContainText("1 erro");
  await expect(rel.locator(".problemas .erro")).toContainText("falta 'resumo'");
  await expect(page.locator("[data-testid=confirmar-importar]")).toHaveCount(0);

  await campo.setInputFiles({ name: "bioquimica.zip", mimeType: "application/zip", buffer: zipBioquimica() });
  await expect(rel.locator(".alerta-ok")).toContainText("Pacote válido");
  await expect(rel).toContainText("Vai criar a matéria");
  await expect(rel).toContainText("Bioquímica");
  await expect(rel).toContainText("2 notas");
  await expect(rel).toContainText("2 flashcards");
  await page.click("[data-testid=confirmar-importar]");
  await expect(page.locator("[data-testid=importado]")).toContainText("2 nota(s) nova(s)");

  await page.goto("/estante");
  await expect(page.locator('.capa[data-materia="bioquimica"] h3')).toHaveText("Bioquímica");
  await page.goto("/nota/bioquimica/glicolise");
  await expect(page.locator(".leitor h1")).toHaveText("Glicólise");
  await expect(page.locator(".leitor .conteudo-nota > .prosa a.wl")).toHaveText("Ciclo de Krebs");

  // mandar de novo: agora "vai acrescentar" e nada é novo
  await page.goto("/admin/importar");
  await campo.setInputFiles({ name: "bioquimica.zip", mimeType: "application/zip", buffer: zipBioquimica() });
  await expect(rel).toContainText("Vai acrescentar a");
  // o pacote sai de volta inteiro pela exportação
  const exp = await page.request.get("/api/admin/materias/bioquimica/exportar");
  expect(exp.status()).toBe(200);
  expect(exp.headers()["content-type"]).toContain("zip");
});

test("PDF direto vira nota de leitura", async ({ page }) => {
  await page.goto("/admin/importar");
  await page.selectOption('select[name="materia"]', "anatomia");
  await page.fill('input[name="modulo"]', "Membro Inferior");
  await page.fill('.cartao:has([data-testid=arquivo-pdf]) input[name="titulo"]', "Resumão do quadril");
  await page.fill('.cartao:has([data-testid=arquivo-pdf]) input[name="resumo"]', "PDF do professor.");
  await page.locator("[data-testid=arquivo-pdf]").setInputFiles({ name: "quadril.pdf", mimeType: "application/pdf", buffer: pdfDeTeste(["Quadril", "Femur", "Bacia"]) });
  await page.locator("button", { hasText: "Publicar PDF" }).click();
  await page.locator("[data-testid=pdf-publicado] a").click();
  await expect(page).toHaveURL(/\/nota\/anatomia\/resumao-do-quadril$/);
  await expect(page.locator("[data-testid=pdf-paginas]")).toHaveText("3 páginas");
  await expect(page.locator(".pdf-pagina")).toHaveCount(3);
});

test("gerar com o Claude: envia materiais, acompanha o registro, revisa e publica", async ({ page }) => {
  await page.goto("/admin/gerar");
  await expect(page.locator("[data-testid=claude-status]")).toContainText("Claude Code encontrado");
  await page.fill('input[name="nome"]', "Neurociência");
  await page.fill('input[name="semestre"]', "3");
  await page.locator("[data-testid=arquivos-materiais]").setInputFiles([
    { name: "aula 1.pdf", mimeType: "application/pdf", buffer: pdfDeTeste(["Neuronio"]) },
    { name: "aula 2.pdf", mimeType: "application/pdf", buffer: pdfDeTeste(["Sinapse"]) },
  ]);
  await expect(page.locator(".lista-compacta").first()).toContainText("2 arquivo(s)");
  await page.fill('textarea[name="conteudosProva"]', "Neurônio e sinapse química");
  await page.click("[data-testid=iniciar-geracao]");

  const g = page.locator("[data-testid=geracao]");
  await expect(g).toHaveAttribute("data-status", "concluida", { timeout: 30000 });
  const log = page.locator("[data-testid=log-geracao]");
  await expect(log).toContainText("Material: aula 1.pdf");
  await expect(log).toContainText("Abrindo o Claude Code");
  await expect(log).toContainText("falta 'resumo'"); // o validador recusou a primeira versão...
  await expect(log).toContainText("Pedindo correção ao Claude"); // ...e o Claude corrigiu
  await expect(log).toContainText("Publicado como rascunho: 2 nota(s) nova(s)");
  await expect(page.locator(".lista-geracoes")).toContainText("Concluída");

  // entrou como rascunho: o aluno ainda não vê
  const ctx = await page.context().browser().newContext();
  const aluno = await ctx.newPage();
  await entrar(aluno, ANA);
  await expect(aluno.locator('.capa[data-materia="neurociencia"]')).toHaveCount(0);

  await g.locator("a", { hasText: "Revisar e publicar" }).click();
  await expect(page).toHaveURL(/\/admin\/conteudo\/neurociencia$/);
  await expect(page.locator(".tabela-notas tbody tr")).toHaveCount(2);
  await expect(page.locator('tr[data-nota="neurociencia/neuronio"] input[aria-label^="Conteúdo de prova"]')).toBeChecked();
  await page.locator("button", { hasText: "Publicar 2 rascunho(s)" }).click();
  await expect(page.locator(".aviso-ok", { hasText: "Rascunhos publicados" })).toBeVisible();

  await aluno.reload();
  await expect(aluno.locator('.capa[data-materia="neurociencia"]')).toBeVisible();
  await aluno.goto("/nota/neurociencia/neuronio");
  await expect(aluno.locator(".leitor .conteudo-nota > .prosa")).toContainText("O neurônio conduz o impulso.");
  await ctx.close();
});

test("auditoria: quem abriu o quê e de quem é um trecho vazado; tokens de API", async ({ page, browser }) => {
  // a Ana abre uma nota e "vaza" um trecho
  const ctx = await browser.newContext();
  const ana = await ctx.newPage();
  await entrar(ana, ANA);
  const nota = await ana.evaluate(() => fetch("/api/notas/anatomia/nervo-isquiatico").then((r) => r.json()));
  const eu = await ana.evaluate(() => fetch("/api/auth/me").then((r) => r.json()));
  await ctx.close();

  await page.goto("/admin/auditoria");
  await expect(page.locator(".tabela-admin tbody tr", { hasText: "Ana Souza" })).toBeVisible();
  await expect(page.locator(".lista-acessos")).toContainText("Nervo isquiático");

  await page.fill('textarea[aria-label="Trecho vazado"]', nota.html.slice(0, 500));
  await page.locator("button", { hasText: "Rastrear" }).click();
  await expect(page.locator("[data-testid=rastro]")).toContainText("Ana Souza (ana@e2e.com)");
  await page.fill('textarea[aria-label="Trecho vazado"]', "texto digitado sem marca");
  await page.locator("button", { hasText: "Rastrear" }).click();
  await expect(page.locator("[data-testid=rastro]")).toContainText("Nenhuma etiqueta");
  // o código que aparece na marca d'água de um print também identifica
  await page.fill('textarea[aria-label="Trecho vazado"]', "print com o codigo " + eu.user.etiqueta);
  await page.locator("button", { hasText: "Rastrear" }).click();
  await expect(page.locator("[data-testid=rastro]")).toContainText("Ana Souza");

  await page.goto("/admin/importar");
  page.once("dialog", (d) => d.accept("notebook"));
  await page.locator("button", { hasText: "Criar token" }).click();
  const token = await page.locator("[data-testid=token-novo]").innerText();
  expect(token).toMatch(/^snp_/);
  const semCookie = await browser.newContext();
  const r = await semCookie.request.get("http://127.0.0.1:4399/api/admin/materias", { headers: { authorization: "Bearer " + token } });
  expect(r.status()).toBe(200);
  await semCookie.close();
});
