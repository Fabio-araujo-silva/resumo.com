// Faz o papel do `claude -p` nos testes: lê o PEDIDO.md da pasta e escreve um pacote em ./pacote.
// Na primeira chamada escreve uma nota com erro (sem resumo); chamado de novo com --continue, corrige.
// MODO=teimoso nunca corrige; MODO=quebrado sai com erro; MODO=lento demora.
import fs from "node:fs";

const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("9.9.9 (Claude de mentira)");
  process.exit(0);
}
const continuar = args.includes("--continue");
const modo = process.env.MODO || "";
let prompt = "";
for await (const pedaco of process.stdin) prompt += pedaco;
fs.appendFileSync("chamadas.log", JSON.stringify({ args, prompt: prompt.slice(0, 200) }) + "\n");

const diz = (obj) => console.log(JSON.stringify(obj));
diz({ type: "system", subtype: "init" });
if (modo === "quebrado") {
  console.error("credenciais inválidas");
  process.exit(3);
}
if (modo === "lento") await new Promise((r) => setTimeout(r, 60000));

const pedido = fs.readFileSync("PEDIDO.md", "utf8");
const formato = fs.existsSync("FORMATO.md");
const settings = JSON.parse(fs.readFileSync(".claude/settings.json", "utf8"));
diz({ type: "assistant", message: { content: [{ type: "text", text: `Li o pedido (${pedido.length} caracteres), FORMATO.md ${formato ? "presente" : "AUSENTE"}, permissões: ${settings.permissions.allow.length}.` }, { type: "tool_use", name: "Read", input: { file_path: "PEDIDO.md" } }] } });

const temProva = /cai na prova/.test(pedido);
const pasta = "pacote/01 - Sistema Nervoso";
fs.mkdirSync(pasta, { recursive: true });
const corpo = (extra) => `> [!ideia]\n> O neurônio conduz o impulso.\n\n${"palavra ".repeat(60)}${extra}\n\n> [!essencial]\n> - Tudo ou nada.\n\n> [!flashcard] O que é sinapse?\n> A junção entre dois neurônios.\n`;
const resumoOk = continuar && modo !== "teimoso";
fs.writeFileSync(`${pasta}/01 - Neurônio.md`, `---\n${resumoOk ? "resumo: A célula que conduz o impulso nervoso.\n" : ""}prova: ${temProva}\n---\n\n${corpo("Veja [[Sinapse química]].")}`);
fs.writeFileSync(`${pasta}/02 - Sinapse química.md`, `---\nresumo: Onde um neurônio fala com o outro.\nprova: false\n---\n\n${corpo("Volte ao [[Neurônio]].").replace("O que é sinapse?", "O que libera a vesícula?")}`);
diz({ type: "assistant", message: { content: [{ type: "tool_use", name: "Write", input: { file_path: `${pasta}/01 - Neurônio.md` } }] } });
diz({ type: "result", subtype: "success", duration_ms: 1234, num_turns: 3, total_cost_usd: 0.42, is_error: false });
