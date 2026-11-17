// Markdown das notas atômicas e o formato de pacote (leitura, validação, importação, exportação).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { analisar, renderNota, renderTrecho, extrairCallouts, textoPuro, marcarHtml, lerEtiquetas, htmlQuestao } from "../src/markdown.js";
import { analisarPacote, lerZip, lerPasta, zipar, tirarPrefixo, separarPropriedades, relatorio } from "../src/pacote.js";
import { importarPacote, exportarPacote, criarResolver } from "../src/importar.js";
import { abrirDb } from "../src/db.js";
import { slug } from "../src/util.js";
import { pacoteAnatomia, pacoteFisiologia, nota, PNG, PDF } from "./_ajuda.js";

const resolver = (alvo) => (slug(alvo) === "plexo-braquial" ? { id: "anatomia/plexo-braquial", titulo: "Plexo braquial" } : null);

test("analisar: tira flashcards do texto, troca questões por marcadores e lista links e figuras", () => {
  const a = analisar(
    [
      "Texto com [[Plexo braquial|plexo]] e [[Outra nota#secao]].",
      "",
      "![legenda](anexos/a%20b.png)",
      "",
      "> [!flashcard] Pergunta um?",
      "> Resposta **um**.",
      "",
      "> [!FLASHCARD]",
      "> Frente em bloco",
      "> ---",
      "> Verso em bloco",
      "",
      "> [!questao] Qual é?",
      "> - [ ] errada",
      "> - [x] certa",
      ">",
      "> Porque sim.",
      "",
      "> [!questão] Explique o reflexo.",
      "> É um arco curto.",
      "",
      "```",
      "> [!flashcard] dentro de código não conta",
      "```",
    ].join("\n")
  );
  assert.equal(a.flashcards.length, 2);
  assert.deepEqual(
    a.flashcards.map((f) => [f.frente, f.verso]),
    [
      ["Pergunta um?", "Resposta **um**."],
      ["Frente em bloco", "Verso em bloco"],
    ]
  );
  assert.equal(a.questoes.length, 2);
  assert.equal(a.questoes[0].enunciado, "Qual é?");
  assert.deepEqual(a.questoes[0].alternativas, [{ texto: "errada", correta: false }, { texto: "certa", correta: true }]);
  assert.equal(a.questoes[0].comentario, "Porque sim.");
  assert.deepEqual(a.questoes[1].alternativas, []);
  assert.equal(a.questoes[1].comentario, "É um arco curto.");
  assert.ok(!a.corpo.includes("Pergunta um"));
  assert.ok(a.corpo.includes("@@QUESTAO0@@") && a.corpo.includes("@@QUESTAO1@@"));
  assert.ok(a.corpo.includes("dentro de código não conta"));
  assert.deepEqual(a.alvos, ["Plexo braquial", "Outra nota"]);
  assert.deepEqual(a.imagens, ["anexos/a b.png"]);
});

test("render: callouts, destaque, links resolvidos e não resolvidos, figura, tabela e âncoras", () => {
  const a = analisar("# Minha nota\n\n> [!definicao] Plexo\n> Rede de nervos.\n\n## Seção *um*\n\nVeja [[Plexo braquial]] e [[Não existe]]. ==grife==\n\n![Esquema](anexos/x.png)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<script>alert(1)</script>\n");
  const r = renderNota(a.corpo, a.questoes, { materia: "anatomia", resolver, titulo: "Minha nota" });
  assert.ok(!r.html.includes("<h1") && !r.html.includes("Minha nota"), "o título repetido some");
  assert.match(r.html, /<div class="callout callout-def" data-callout="definicao"><div class="callout-cabeca"><span class="callout-rotulo">Definição<\/span><span class="callout-titulo">Plexo<\/span>/);
  assert.match(r.html, /<h2 id="s-secao-um">/);
  assert.match(r.html, /<a class="wl" href="\/nota\/anatomia\/plexo-braquial" data-nota="anatomia\/plexo-braquial">Plexo braquial<\/a>/);
  assert.match(r.html, /<span class="wl-falta"[^>]*>Não existe<\/span>/);
  assert.match(r.html, /<mark>grife<\/mark>/);
  assert.match(r.html, /<img src="\/api\/anexos\/anatomia\/anexos\/x\.png" alt="Esquema" loading="lazy" draggable="false"><span class="fig-leg">Esquema<\/span>/);
  assert.match(r.html, /<div class="tabela"><table>/);
  assert.ok(!r.html.includes("<script>"), "HTML cru nunca vira tag");
  assert.deepEqual(r.links, ["anatomia/plexo-braquial"]);
  assert.deepEqual(r.titulos, [{ id: "s-secao-um", texto: "Seção um", nivel: 2 }]);
});

test("render: bloco com '-' depois do tipo começa recolhido", () => {
  const fechado = renderNota("> [!exemplo]- Caso clínico\n> Texto do caso.", [], {}).html;
  assert.match(fechado, /<div class="callout callout-nota dobrado" data-callout="exemplo">/);
  assert.match(fechado, /<span class="callout-titulo">Caso clínico<\/span>/);
  const aberto = renderNota("> [!exemplo]+ Caso clínico\n> Texto do caso.", [], {}).html;
  assert.ok(!aberto.includes("dobrado"));
});

test("render: figura com caminho perigoso não vira <img>", () => {
  for (const ruim of ["../segredo.png", "/etc/passwd", "https://exemplo.com/x.png"]) {
    const r = renderNota(`![x](${ruim})`, [], { materia: "anatomia" });
    assert.ok(!r.html.includes("<img"), ruim);
  }
});

test("questão vira quiz no lugar do marcador", () => {
  const a = analisar("Antes.\n\n> [!questao] Qual?\n> - [ ] A\n> - [x] B\n>\n> Comentário.\n\nDepois.");
  const r = renderNota(a.corpo, a.questoes, {});
  assert.match(r.html, /<div class="questao" data-correta="1">/);
  assert.equal((r.html.match(/class="q-alt"/g) || []).length, 2);
  assert.match(r.html, /<div class="q-coment" hidden><p>Comentário\.<\/p><\/div>/);
  assert.ok(!r.html.includes("@@QUESTAO"));
  assert.match(htmlQuestao({ enunciado: "Explique.", alternativas: [], comentario: "Resposta." }), /questao-aberta[\s\S]*q-revelar/);
});

test("callouts do modo prova são extraídos; texto puro serve para a busca", () => {
  const corpo = "> [!essencial] Guarde\n> - um\n> - dois\n\nTexto.\n\n> [!prova]\n> Cai sempre.\n";
  const b = extrairCallouts(corpo, ["essencial", "prova"]);
  assert.deepEqual(b.map((x) => [x.tipo, x.titulo, x.md]), [["essencial", "Guarde", "- um\n- dois"], ["prova", "", "Cai sempre."]]);
  assert.match(renderTrecho(b[0].md), /<ul>\s*<li>um<\/li>/);
  assert.equal(textoPuro("## Título\n\n> [!prova] Dica\n> **Negrito** e [[Nota|apelido]] e ==marca==.\n\n| a | b |\n|---|---|\n"), "Título Dica Negrito e apelido e marca . a b");
});

test("marca d'água invisível: vai no HTML e é lida de volta de um trecho copiado", () => {
  const html = "<p>um</p><p>dois</p><ul><li>três</li></ul>";
  const marcado = marcarHtml(html, "0a1b2c3d4e");
  assert.notEqual(marcado, html);
  assert.equal(marcado.replace(/[​‌⁠]/g, ""), html, "só entram caracteres invisíveis");
  assert.deepEqual(lerEtiquetas("texto colado: um" + marcado.match(/[⁠][​‌]+[⁠]/)[0] + " dois"), ["0a1b2c3d4e"]);
  assert.deepEqual(lerEtiquetas("sem marca"), []);
});

test("utilidades do pacote: prefixo numérico e propriedades", () => {
  assert.deepEqual(tirarPrefixo("03 - Instrumentais"), { ordem: 3, titulo: "Instrumentais" });
  assert.deepEqual(tirarPrefixo("12. Tórax"), { ordem: 12, titulo: "Tórax" });
  assert.deepEqual(tirarPrefixo("Sem número"), { ordem: null, titulo: "Sem número" });
  assert.deepEqual(separarPropriedades("---\nresumo: oi\nprova: true\n---\ncorpo"), { props: { resumo: "oi", prova: true }, corpo: "corpo", erro: null });
  assert.match(separarPropriedades("---\nresumo: [a\n---\ncorpo").erro, /YAML inválido/);
});

test("pacote válido: matéria, módulos na ordem, notas, contagens", () => {
  const r = analisarPacote(pacoteAnatomia());
  assert.equal(r.ok, true, relatorio(r));
  assert.deepEqual(r.materia, { slug: "anatomia", nome: "Anatomia", semestre: 1, eixo: "", descricao: "", cor: "", avaliacao: "n1", provaData: "2030-06-10", provaFoco: "Plexo braquial e manguito.", n2Data: null, n2Foco: null });
  assert.deepEqual(r.modulos.map((m) => m.avaliacao), ["n1", "n1"], "sem dizer nada, tudo é N1");
  assert.deepEqual(r.modulos.map((m) => [m.slug, m.titulo, m.ordem]), [["membro-superior", "Membro Superior", 1], ["membro-inferior", "Membro Inferior", 2]]);
  assert.deepEqual(r.notas.map((n) => n.slug), ["mapa-membro-superior", "plexo-braquial", "manguito-rotador", "nervo-isquiatico"]);
  assert.deepEqual(r.resumo, { modulos: 2, notas: 4, notasDeProva: 2, flashcards: 6, questoes: 1, anexos: 1, palavras: r.resumo.palavras });
  const plexo = r.notas.find((n) => n.slug === "plexo-braquial");
  assert.equal(plexo.prova, true);
  assert.equal(plexo.prioridade, 1);
  assert.ok(r.notas[0].tags.includes("mapa"));
  assert.deepEqual(r.avisos, []);
});

test("validador: cada regra quebrada vira um erro que diz o que consertar", () => {
  const casos = [
    [{ "materia.yml": null }, /falta o arquivo materia\.yml/],
    [{ "materia.yml": "slug: Anatomia Humana\nnome: A\nsemestre: 1\n" }, /'slug' inválido/],
    [{ "materia.yml": "slug: anatomia\nnome: A\nsemestre: primeiro\n" }, /'semestre' precisa ser/],
    [{ "materia.yml": "slug: anatomia\nnome: A\nsemestre: 1\ncor: azul\n" }, /'cor' inválida/],
    [{ "01 - Membro Superior/09 - Sem resumo.md": "---\nprova: false\n---\ntexto\n" }, /falta 'resumo'/],
    [{ "01 - Membro Superior/09 - X.md": nota({ titulo: "X", props: "prova: talvez\n" }).replace("prova: false\n", "") }, /'prova' precisa ser true ou false/],
    [{ "01 - Membro Superior/09 - X.md": nota({ titulo: "X", prioridade: "urgente" }) }, /'prioridade' precisa ser/],
    [{ "01 - Membro Superior/09 - Plexo.md": nota({ titulo: "Plexo Braquial" }) }, /título repetido/],
    [{ "01 - Membro Superior/09 - X.md": nota({ titulo: "X", cards: 0, extra: "> [!flashcard] Só a pergunta\n" }) }, /flashcard 1: precisa de pergunta/],
    [{ "01 - Membro Superior/09 - X.md": nota({ titulo: "X", cards: 0, extra: "> [!flashcard] Igual?\n> a\n\n> [!flashcard] Igual?\n> b\n" }) }, /mesma pergunta/],
    [{ "01 - Membro Superior/09 - X.md": nota({ titulo: "X", extra: "> [!questao] Q?\n> - [x] a\n> - [x] b\n" }) }, /exatamente uma alternativa correta/],
    [{ "01 - Membro Superior/09 - X.md": nota({ titulo: "X", extra: "> [!questao] Q?\n> - [x] a\n" }) }, /pelo menos 2 alternativas/],
    [{ "01 - Membro Superior/09 - X.md": nota({ titulo: "X", extra: "![f](anexos/nao-tem.png)\n" }) }, /ausente do pacote/],
    [{ "01 - Membro Superior/09 - X.md": nota({ titulo: "X", extra: "![f](../fora.png)\n" }) }, /caminho inválido/],
    [{ "01 - Membro Superior/09 - X.md": nota({ titulo: "X", corpo: Array.from({ length: 1400 }, (_, i) => "p" + i).join(" ") }) }, /nota grande demais/],
    [{ "anexos/plexo.png": Buffer.alloc(5 * 1024 * 1024) }, /arquivo grande demais/],
  ];
  for (const [mudanca, esperado] of casos) {
    const r = analisarPacote(pacoteAnatomia(mudanca));
    assert.equal(r.ok, false, String(esperado));
    assert.ok(r.erros.some((e) => esperado.test(e.msg)), `${esperado} não apareceu em: ${relatorio(r)}`);
  }
});

test("validador: avisos não bloqueiam, mas apontam o que melhorar", () => {
  const r = analisarPacote(
    pacoteAnatomia({
      "02 - Membro Inferior/02 - Longa.md": nota({ titulo: "Longa", corpo: Array.from({ length: 700 }, (_, i) => "p" + i).join(" ") }),
      "02 - Membro Inferior/03 - Sem cartas.md": nota({ titulo: "Sem cartas", cards: 0, prova: true, corpo: "> [!inventado]\n> x\n\n" + Array.from({ length: 60 }, (_, i) => "p" + i).join(" ") + " [[Nota fantasma]]" }),
      "anexos/sobrando.png": PNG,
      "notas.txt": "lixo",
    })
  );
  assert.equal(r.ok, true, relatorio(r));
  const tem = (re) => assert.ok(r.avisos.some((a) => re.test(a.msg)), `${re} não apareceu em: ${relatorio(r)}`);
  tem(/nota longa \(700 palavras\)/);
  tem(/nota sem nenhum flashcard/);
  tem(/sem bloco \[!essencial\]/);
  tem(/callout desconhecido: \[!inventado\]/);
  tem(/link para nota que não existe: \[\[Nota fantasma\]\]/);
  tem(/nota isolada/);
  tem(/anexo não usado/);
  tem(/arquivo ignorado/);
  // um link para nota que já está no site não gera aviso
  const r2 = analisarPacote(pacoteAnatomia({ "02 - Membro Inferior/03 - Y.md": nota({ titulo: "Y", corpo: "x ".repeat(60) + "[[Nota fantasma]] [[Plexo braquial]]" }) }), { existentes: new Set(["nota-fantasma"]) });
  assert.ok(!r2.avisos.some((a) => /Nota fantasma/.test(a.msg)));
});

test("zip: com ou sem pasta raiz, e pasta no disco, dão o mesmo pacote", () => {
  const original = pacoteAnatomia();
  const direto = analisarPacote(lerZip(zipar(original)));
  const comRaiz = analisarPacote(lerZip(zipar(new Map([...original].map(([k, v]) => ["anatomia-pacote/" + k, v])))));
  assert.equal(direto.ok && comRaiz.ok, true);
  assert.deepEqual(comRaiz.notas.map((n) => n.slug), direto.notas.map((n) => n.slug));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sinapse-pasta-"));
  for (const [k, v] of original) {
    fs.mkdirSync(path.dirname(path.join(dir, k)), { recursive: true });
    fs.writeFileSync(path.join(dir, k), v);
  }
  assert.deepEqual(analisarPacote(lerPasta(dir)).notas.map((n) => n.slug), direto.notas.map((n) => n.slug));
  fs.rmSync(dir, { recursive: true, force: true });
  assert.throws(() => lerZip(Buffer.from("isto não é zip")), /não é um \.zip válido/);
});

test("importar: grava tudo, mescla sem apagar, substitui quando pedido, e mantém o progresso dos flashcards", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sinapse-imp-"));
  const db = abrirDb(dataDir);
  const rel = importarPacote(db, dataDir, analisarPacote(pacoteAnatomia()));
  assert.deepEqual([rel.criadas.length, rel.atualizadas.length, rel.flashcards], [4, 0, 6]);
  assert.equal(db.prepare("select count(*) c from notas").get().c, 4);
  assert.equal(db.prepare("select count(*) c from modulos").get().c, 2);
  assert.ok(fs.existsSync(path.join(dataDir, "anexos", "anatomia", "anexos", "plexo.png")));
  // ligações: mapa -> plexo, mapa -> manguito, plexo <-> manguito, isquiático -> plexo
  const links = db.prepare("select origem, destino from links order by origem, destino").all().map((l) => l.origem.split("/")[1] + ">" + l.destino.split("/")[1]);
  assert.deepEqual(links, ["manguito-rotador>plexo-braquial", "mapa-membro-superior>manguito-rotador", "mapa-membro-superior>plexo-braquial", "nervo-isquiatico>plexo-braquial", "plexo-braquial>manguito-rotador"]);

  // o aluno já estudou uma carta
  db.prepare("insert into users (id, email, nome, senha_hash, criado_em) values ('u1', 'u@u', 'U', 'x', 1)").run();
  const carta = db.prepare("select id from flashcards where nota_id = 'anatomia/manguito-rotador' order by ordem").get();
  db.prepare("insert into estados_card (user_id, card_id, estado, vence, intervalo, atualizado_em) values ('u1', ?, 'revisao', 1, 9, 1)").run(carta.id);

  // reimportar igual não muda nada
  const igual = importarPacote(db, dataDir, analisarPacote(pacoteAnatomia()));
  assert.deepEqual([igual.criadas.length, igual.atualizadas.length, igual.iguais], [0, 0, 4]);

  // pacote só com uma nota nova e uma alterada: o resto fica
  const parcial = new Map([
    ["materia.yml", Buffer.from("slug: anatomia\nnome: Anatomia\nsemestre: 1\n")],
    ["01 - Membro Superior/02 - Manguito rotador.md", Buffer.from(nota({ titulo: "Manguito rotador", resumo: "Novo resumo.", corpo: "> [!ideia]\n> Mudou.\n\n" + "x ".repeat(60) + "[[Plexo braquial]]", cards: 1 }))],
    ["01 - Membro Superior/03 - Nervo axilar.md", Buffer.from(nota({ titulo: "Nervo axilar", corpo: "y ".repeat(60) + "[[Plexo braquial]]" }))],
  ]);
  const mescla = importarPacote(db, dataDir, analisarPacote(parcial, { existentes: new Set(["plexo-braquial"]) }));
  assert.deepEqual([mescla.criadas, mescla.atualizadas, mescla.removidas], [["Nervo axilar"], ["Manguito rotador"], []]);
  assert.equal(db.prepare("select count(*) c from notas").get().c, 5);
  assert.equal(db.prepare("select prova_data from materias where id = 'anatomia'").get().prova_data, "2030-06-10", "o que o pacote não diz, fica como estava");
  assert.equal(db.prepare("select intervalo from estados_card where card_id = ?").get(carta.id).intervalo, 9, "a carta que continuou existindo mantém o progresso");
  assert.equal(db.prepare("select count(*) c from flashcards where nota_id = 'anatomia/manguito-rotador'").get().c, 1, "a carta que saiu da nota some");

  // substituir: a matéria fica igual ao pacote
  const subst = importarPacote(db, dataDir, analisarPacote(pacoteAnatomia()), { modo: "substituir" });
  assert.deepEqual(subst.removidas, ["Nervo axilar"]);
  assert.equal(db.prepare("select count(*) c from notas").get().c, 4);

  // rascunho: notas novas entram escondidas
  importarPacote(db, dataDir, analisarPacote(pacoteFisiologia()), { publicada: false });
  assert.equal(db.prepare("select publicada from notas where id = 'fisiologia/potencial-de-acao'").get().publicada, 0);
  // link entre matérias: [[anatomia/Plexo braquial]]
  assert.ok(db.prepare("select 1 from links where origem = 'fisiologia/potencial-de-acao' and destino = 'anatomia/plexo-braquial'").get());
  assert.equal(criarResolver(db, "fisiologia")("Manguito rotador").id, "anatomia/manguito-rotador", "sem a nota na própria matéria, procura nas outras");
  assert.equal(criarResolver(db, "anatomia", { pode: (n) => !!n.publicada })("fisiologia/Potencial de ação"), null, "rascunho não é alvo de link para aluno");
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("exportar e importar de volta devolve a mesma matéria (ida e volta sem perda)", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sinapse-exp-"));
  const db = abrirDb(dataDir);
  importarPacote(db, dataDir, analisarPacote(pacoteAnatomia()));
  const foto = () => JSON.stringify(db.prepare("select id, modulo_id, titulo, resumo, md, prova, prioridade, tags, ordem from notas order by id").all().map((n) => ({ ...n, ordem: 0 })));
  const antes = foto();
  const cartas = db.prepare("select id from flashcards order by id").all();
  const exportado = exportarPacote(db, dataDir, "anatomia");
  assert.ok(exportado.has("materia.yml") && exportado.has("anexos/plexo.png"));
  assert.ok([...exportado.keys()].some((k) => k === "01 - Membro Superior/02 - Plexo braquial.md"), [...exportado.keys()].join());
  const volta = analisarPacote(lerZip(zipar(exportado)));
  assert.equal(volta.ok, true, relatorio(volta));
  const rel = importarPacote(db, dataDir, volta, { modo: "substituir" });
  assert.deepEqual([rel.criadas.length, rel.removidas.length], [0, 0]);
  assert.equal(foto(), antes);
  assert.deepEqual(db.prepare("select id from flashcards order by id").all(), cartas);
  assert.equal(exportarPacote(db, dataDir, "nao-existe"), null);
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("PDF dentro do pacote: solto num módulo ou apontado pela propriedade pdf", () => {
  const r = analisarPacote(
    pacoteAnatomia({
      "02 - Membro Inferior/05 - Resumo do joelho.pdf": PDF,
      "02 - Membro Inferior/06 - Quadril.md": nota({ titulo: "Quadril", props: "pdf: anexos/quadril.pdf\n", corpo: "Leia o PDF. [[Nervo isquiático]]" }),
      "anexos/quadril.pdf": PDF,
    })
  );
  assert.equal(r.ok, true, relatorio(r));
  const joelho = r.notas.find((n) => n.slug === "resumo-do-joelho");
  assert.equal(joelho.pdf, "anexos/pdf/resumo-do-joelho.pdf");
  assert.equal(r.notas.find((n) => n.slug === "quadril").pdf, "anexos/quadril.pdf");
  assert.ok(r.anexos.some((a) => a.caminho === "anexos/pdf/resumo-do-joelho.pdf" && a.mime === "application/pdf"));
  const ruim = analisarPacote(pacoteAnatomia({ "02 - Membro Inferior/06 - Quadril.md": nota({ titulo: "Quadril", props: "pdf: anexos/sumiu.pdf\n" }) }));
  assert.ok(ruim.erros.some((e) => /ausente do pacote/.test(e.msg)));
});
