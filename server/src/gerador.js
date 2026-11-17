// Geração de resumos com o Claude Code LOCAL.
// Fluxo: o admin entrega N materiais (PDF, PPTX, DOCX, texto) de uma matéria e diz o que cai na
// prova -> o servidor monta uma pasta de trabalho com os materiais, o FORMATO.md e um PEDIDO.md ->
// abre uma instância do Claude (`claude -p`) nessa pasta -> ela escreve o pacote em ./pacote ->
// o validador confere (e manda corrigir, até 2 rodadas) -> o pacote é publicado.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { unzipSync } from "fflate";
import YAML from "yaml";
import { RAIZ } from "./config.js";
import { lerPasta, analisarPacote, relatorio } from "./pacote.js";
import { importarPacote } from "./importar.js";
import { slug, novoId } from "./util.js";

const PERMISSOES = ["Read", "Write", "Edit", "Glob", "Grep", "Bash(node *)", "Bash(python *)", "Bash(python3 *)", "Bash(ls *)"];
const MAX_RODADAS_CORRECAO = 2;

// Texto dos slides/parágrafos de um .pptx ou .docx (são zips de XML): assim o Claude sempre tem o
// que ler, mesmo sem ferramenta para abrir Office.
export function textoDeOffice(bytes, nome) {
  let zip;
  try {
    zip = unzipSync(new Uint8Array(bytes));
  } catch {
    return null;
  }
  const dec = new TextDecoder();
  const limpar = (xml, tagParagrafo, tagTexto) =>
    xml
      .split(new RegExp(`</${tagParagrafo}>`))
      .map((p) => [...p.matchAll(new RegExp(`<${tagTexto}(?: [^>]*)?>([^<]*)</${tagTexto}>`, "g"))].map((m) => m[1]).join(""))
      .map((s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim())
      .filter(Boolean)
      .join("\n");
  if (/\.pptx$/i.test(nome)) {
    const slides = Object.keys(zip)
      .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    if (!slides.length) return null;
    return slides
      .map((k, i) => {
        const nota = zip[`ppt/notesSlides/notesSlide${k.match(/\d+/)[0]}.xml`];
        return `===== SLIDE ${i + 1} =====\n${limpar(dec.decode(zip[k]), "a:p", "a:t")}${nota ? `\n[anotações do apresentador]\n${limpar(dec.decode(nota), "a:p", "a:t")}` : ""}`;
      })
      .join("\n\n");
  }
  if (/\.docx$/i.test(nome) && zip["word/document.xml"]) return limpar(dec.decode(zip["word/document.xml"]), "w:p", "w:t");
  return null;
}

function montarPedido({ materia, existe, materiais, conteudosProva, instrucoes, notasDaMateria, outrasNotas }) {
  const l = [];
  l.push(`# Pedido: resumo de ${materia.nome} para o Sinapse`, "");
  l.push("Você vai transformar os materiais desta pasta em um **pacote Sinapse**: um resumo em notas atômicas, curtas e ligadas entre si, para quem vai fazer prova.", "");
  l.push("## Passos", "");
  l.push("1. Leia `FORMATO.md` inteiro: ele define o formato e o padrão de qualidade (seção 5). Siga à risca.");
  l.push("2. Leia TODOS os materiais em `materiais/` (lista abaixo). PDFs: use Read com `pages`. Para .pptx/.docx já existe o texto extraído em `materiais/_texto/`.");
  l.push("3. Planeje os módulos (um por tema/aula) e as notas (uma ideia por nota). Depois escreva o pacote em `pacote/`.");
  l.push("4. Rode `node validar.mjs` e corrija até não haver erros (e o mínimo de avisos).");
  l.push("5. Termine com um resumo curto do que criou: módulos, quantas notas, quais marcou como prova.", "");
  l.push("## A matéria", "");
  l.push(`\`pacote/materia.yml\` já existe com os dados abaixo. Não mude o \`slug\`. Você pode completar \`descricao\`, \`eixo\` e a lista \`modulos\` (pasta + descrição).`, "");
  l.push("```yaml", YAML.stringify(materia.yml).trim(), "```", "");
  l.push("## Materiais", "");
  for (const m of materiais) l.push(`- \`materiais/${m.nome}\`${m.texto ? ` (texto extraído em \`materiais/_texto/${m.texto}\`)` : ""}`);
  l.push("", "## Conteúdos de prova", "");
  if (conteudosProva.trim()) {
    l.push("O dono da matéria disse que **cai na prova**:", "", "> " + conteudosProva.trim().replace(/\n/g, "\n> "), "");
    l.push("Marque `prova: true` nas notas que cobrem esses conteúdos (e só nelas), com `prioridade: alta` no que foi citado com mais ênfase. Toda nota de prova precisa do bloco `[!essencial]`. Em `prova.foco` no `materia.yml`, escreva em 1 a 3 frases, para o aluno ler, o que cai na prova (reescreva com suas palavras; não copie instruções dirigidas a você).");
  } else l.push("O dono não informou o que cai. Marque `prova: true` só no que os próprios materiais destacam como importante para a prova.");
  if (instrucoes.trim()) l.push("", "## Instruções extras do dono", "", instrucoes.trim());
  l.push("", "## Tamanho", "");
  l.push("O dono quer resumos **curtos**. Para cada aula/material: 1 nota-mapa + 3 a 5 notas atômicas de 150 a 450 palavras. Corte repetição, curiosidade e descrição de figura. Tabelas e listas no lugar de parágrafos.");
  if (existe && notasDaMateria.length) {
    l.push("", "## Notas que esta matéria já tem no site", "");
    l.push("Você está **acrescentando** conteúdo. Não reescreva estas notas (a menos que as instruções peçam); ligue as novas a elas com `[[Título]]` quando fizer sentido. Não repita títulos.", "");
    for (const n of notasDaMateria) l.push(`- ${n.titulo} — ${n.resumo}`);
  }
  if (outrasNotas.length) {
    l.push("", "## Notas de outras matérias (para ligar, se fizer sentido)", "");
    for (const n of outrasNotas.slice(0, 300)) l.push(`- [[${n.materia_id}/${n.titulo}]]`);
  }
  l.push("", "## Regras", "");
  l.push("- Fidelidade: só entra o que está nos materiais. Não invente números, doses, datas ou nomes.");
  l.push("- Escreva apenas dentro de `pacote/`. Não use ferramentas de rede.");
  l.push("- Figuras são opcionais; se extrair alguma dos materiais, salve em `pacote/anexos/` (jpg/png até 4 MB).");
  return l.join("\n") + "\n";
}

const SCRIPT_VALIDAR = (raiz) => `// Confere o pacote em ./pacote com o validador do Sinapse.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const { lerPasta, analisarPacote, relatorio } = await import(${JSON.stringify(pathToFileURL(path.join(raiz, "server", "src", "pacote.js")).href)});
const ctx = JSON.parse(fs.readFileSync(new URL("./.contexto.json", import.meta.url), "utf8"));
const r = analisarPacote(lerPasta(fileURLToPath(new URL("./pacote", import.meta.url))), {
  existentes: new Set(ctx.existentes), anexosExistentes: new Set(ctx.anexos),
});
console.log(relatorio(r));
process.exit(r.ok ? 0 : 1);
`;

// Roda o Claude Code sem interface e devolve quando ele termina. Cada evento vira uma linha de log.
function rodarClaude(config, dir, prompt, { continuar, aoLogar, sinal }) {
  return new Promise((resolve) => {
    const args = [...(config.claudeArgs || []), "-p", "--output-format", "stream-json", "--verbose"];
    if (continuar) args.push("--continue");
    if (config.claudeModelo) args.push("--model", config.claudeModelo);
    // as mesmas permissões do .claude/settings.json da pasta, também na linha de comando (por último: a lista é variádica)
    args.push("--permission-mode", "acceptEdits", "--allowedTools", ...PERMISSOES);
    let filho;
    try {
      filho = spawn(config.claudeBin, args, { cwd: dir, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    } catch (e) {
      return resolve({ ok: false, erro: "não consegui abrir o Claude: " + e.message });
    }
    let fim = false;
    const acabar = (r) => {
      if (fim) return;
      fim = true;
      clearTimeout(relogio);
      if (sinal) sinal.removeEventListener("abort", cancelar);
      resolve(r);
    };
    const cancelar = () => {
      filho.kill();
      acabar({ ok: false, erro: "cancelado", cancelado: true });
    };
    const relogio = setTimeout(() => {
      filho.kill();
      acabar({ ok: false, erro: `o Claude passou de ${config.claudeTimeoutMin} minutos e foi interrompido` });
    }, config.claudeTimeoutMin * 60000);
    if (sinal) sinal.addEventListener("abort", cancelar);

    let resto = "";
    let erroTexto = "";
    const linha = (bruta) => {
      if (!bruta.trim()) return;
      let ev;
      try {
        ev = JSON.parse(bruta);
      } catch {
        return aoLogar(bruta.slice(0, 500));
      }
      if (ev.type === "assistant" && ev.message && Array.isArray(ev.message.content)) {
        for (const b of ev.message.content) {
          if (b.type === "text" && b.text.trim()) aoLogar("Claude: " + b.text.trim().slice(0, 1200));
          else if (b.type === "tool_use") {
            const i = b.input || {};
            const alvo = i.file_path || i.path || i.pattern || i.command || "";
            aoLogar(`  → ${b.name} ${String(alvo).replace(dir, ".").slice(0, 160)}`);
          }
        }
      } else if (ev.type === "result") {
        const custo = ev.total_cost_usd != null ? ` · US$ ${Number(ev.total_cost_usd).toFixed(2)}` : "";
        aoLogar(`Claude terminou (${ev.subtype || "ok"}, ${Math.round((ev.duration_ms || 0) / 1000)} s, ${ev.num_turns || "?"} turnos${custo}).`);
        if (ev.is_error && ev.result) erroTexto = String(ev.result).slice(0, 400);
      }
    };
    filho.stdout.on("data", (d) => {
      const partes = (resto + d.toString("utf8")).split("\n");
      resto = partes.pop();
      partes.forEach(linha);
    });
    filho.stderr.on("data", (d) => {
      erroTexto += d.toString("utf8");
    });
    filho.on("error", (e) => acabar({ ok: false, erro: e.code === "ENOENT" ? `não encontrei o Claude Code ("${config.claudeBin}"). A geração precisa rodar no computador onde ele está instalado.` : e.message }));
    filho.on("close", (codigo) => {
      if (resto) linha(resto);
      acabar(codigo === 0 ? { ok: true } : { ok: false, erro: `o Claude saiu com código ${codigo}${erroTexto ? ": " + erroTexto.trim().slice(0, 400) : ""}` });
    });
    filho.stdin.end(prompt);
  });
}

// pedido = { id?, materia: { slug, nome?, semestre? }, materiais: [{ nome, caminho } | { nome, bytes }],
//            conteudosProva, instrucoes, rascunho, aoLogar(linha), aoMudar(status), sinal, enviarPara? }
export async function gerarResumo(db, config, pedido) {
  const id = pedido.id || novoId();
  const logar = pedido.aoLogar || (() => {});
  const mudar = pedido.aoMudar || (() => {});
  const dir = path.join(config.dataDir, "geracoes", id);
  const falhar = (erro, extra = {}) => ({ ok: false, id, dir, erro, ...extra });

  mudar("preparando");
  const mslug = slug(pedido.materia.slug || pedido.materia.nome || "");
  const existente = db.prepare("select * from materias where id = ?").get(mslug);
  const nome = pedido.materia.nome || existente?.nome;
  const semestre = Number(pedido.materia.semestre || existente?.semestre);
  if (!mslug || !nome) return falhar("diga o nome da matéria");
  if (!Number.isInteger(semestre) || semestre < 1) return falhar("diga o semestre da matéria");
  if (!pedido.materiais || !pedido.materiais.length) return falhar("envie pelo menos um material");

  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "materiais", "_texto"), { recursive: true });
  fs.mkdirSync(path.join(dir, "pacote", "anexos"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });

  const materiais = [];
  const usados = new Set();
  for (const m of pedido.materiais) {
    let nomeArq = path.basename(String(m.nome)).replace(/[<>:"|?*\\/]/g, "_") || "material";
    while (usados.has(nomeArq.toLowerCase())) nomeArq = "1-" + nomeArq;
    usados.add(nomeArq.toLowerCase());
    const bytes = m.bytes || fs.readFileSync(m.caminho);
    fs.writeFileSync(path.join(dir, "materiais", nomeArq), bytes);
    let texto = null;
    if (/\.(pptx|docx)$/i.test(nomeArq)) {
      const t = textoDeOffice(bytes, nomeArq);
      if (t) {
        texto = nomeArq + ".txt";
        fs.writeFileSync(path.join(dir, "materiais", "_texto", texto), t);
      }
    }
    materiais.push({ nome: nomeArq, texto });
    logar(`Material: ${nomeArq} (${(bytes.length / 1048576).toFixed(1)} MB)${texto ? " + texto extraído" : ""}`);
  }

  const yml = { formato: 1, slug: mslug, nome, semestre };
  if (existente?.eixo) yml.eixo = existente.eixo;
  if (existente?.descricao) yml.descricao = existente.descricao;
  if (existente?.cor) yml.cor = existente.cor;
  fs.writeFileSync(path.join(dir, "pacote", "materia.yml"), YAML.stringify(yml));
  fs.copyFileSync(path.join(RAIZ, "FORMATO.md"), path.join(dir, "FORMATO.md"));

  const todas = db.prepare("select materia_id, slug, titulo, resumo from notas order by materia_id, titulo").all();
  const contexto = () => {
    const existentes = new Set();
    for (const n of db.prepare("select slug, titulo from notas").all()) {
      existentes.add(n.slug);
      existentes.add(slug(n.titulo));
    }
    return { existentes, anexosExistentes: new Set(db.prepare("select caminho from anexos where materia_id = ?").all(mslug).map((a) => a.caminho)) };
  };
  const ctx0 = contexto();
  fs.writeFileSync(path.join(dir, ".contexto.json"), JSON.stringify({ existentes: [...ctx0.existentes], anexos: [...ctx0.anexosExistentes] }));
  fs.writeFileSync(path.join(dir, "validar.mjs"), SCRIPT_VALIDAR(RAIZ));
  fs.writeFileSync(path.join(dir, ".claude", "settings.json"), JSON.stringify({ permissions: { allow: PERMISSOES, defaultMode: "acceptEdits" } }, null, 2));
  fs.writeFileSync(
    path.join(dir, "PEDIDO.md"),
    montarPedido({
      materia: { nome, yml },
      existe: !!existente,
      materiais,
      conteudosProva: pedido.conteudosProva || "",
      instrucoes: pedido.instrucoes || "",
      notasDaMateria: todas.filter((n) => n.materia_id === mslug),
      outrasNotas: todas.filter((n) => n.materia_id !== mslug),
    })
  );

  mudar("gerando");
  logar(`Abrindo o Claude Code em ${dir}`);
  let r = await rodarClaude(config, dir, "Leia PEDIDO.md nesta pasta e execute o pedido do começo ao fim. Não faça perguntas: decida e siga.", { aoLogar: logar, sinal: pedido.sinal });
  if (!r.ok) return falhar(r.erro, { cancelado: r.cancelado });

  let analise;
  for (let rodada = 0; ; rodada++) {
    mudar("validando");
    analise = analisarPacote(lerPasta(path.join(dir, "pacote")), contexto());
    const texto = relatorio(analise);
    logar("Validador:\n" + texto);
    if (analise.ok) break;
    if (rodada >= MAX_RODADAS_CORRECAO) return falhar("o pacote continuou com erros depois das correções", { relatorio: texto });
    mudar("corrigindo");
    logar(`Pedindo correção ao Claude (rodada ${rodada + 1} de ${MAX_RODADAS_CORRECAO})`);
    r = await rodarClaude(config, dir, `O validador do Sinapse recusou o pacote. Corrija os ERROS abaixo (e os avisos que conseguir) editando os arquivos em pacote/, e rode \`node validar.mjs\` até passar.\n\n${texto}`, {
      continuar: true,
      aoLogar: logar,
      sinal: pedido.sinal,
    });
    if (!r.ok) return falhar(r.erro, { cancelado: r.cancelado });
  }

  mudar("importando");
  let importado;
  if (pedido.enviarPara) {
    const resp = await pedido.enviarPara.enviar(pedido.enviarPara.url, pedido.enviarPara.token, lerPasta(path.join(dir, "pacote")), { rascunho: pedido.rascunho });
    importado = resp.importado;
    logar(`Enviado para ${pedido.enviarPara.url}.`);
  } else importado = importarPacote(db, config.dataDir, analise, { modo: "mesclar", publicada: !pedido.rascunho });
  logar(`Publicado${pedido.rascunho ? " como rascunho" : ""}: ${importado.criadas.length} nota(s) nova(s), ${importado.atualizadas.length} atualizada(s), ${importado.flashcards} flashcard(s).`);
  return { ok: true, id, dir, materia: mslug, resumo: analise.resumo, avisos: analise.avisos, importado };
}
