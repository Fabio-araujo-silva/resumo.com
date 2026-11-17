// Servidor dos testes de navegador: banco temporário, contas fixas, duas matérias de exemplo e um
// "Claude" de mentira para a geração. Sobe na porta 4399 servindo o front compilado (web/dist).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { montarApp } from "../server/src/index.js";
import { criarUsuario } from "../server/src/auth.js";
import { analisarPacote, relatorio } from "../server/src/pacote.js";
import { importarPacote } from "../server/src/importar.js";
import { pacoteAnatomia, pacoteFisiologia } from "../server/test/_ajuda.js";
import { ADMIN, ANA, BIA, DUDA, NOTA_INTERATIVA, pdfDeTeste } from "./apoio.mjs";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "resumo-e2e-"));
const { app, db } = await montarApp({
  dataDir,
  logger: false,
  claudeBin: process.execPath,
  claudeArgs: [path.join(aqui, "..", "server", "test", "claude-de-mentira.mjs")],
  claudeTimeoutMin: 1,
  leiturasPor10Min: 1000,
  leiturasPorDia: 5000,
  elevenlabsChave: "",
});

criarUsuario(db, { ...ADMIN, papel: "admin" });
for (const conta of [ANA, BIA, DUDA, { email: "eva@e2e.com", senha: "eva-senha-123", nome: "Eva Mota" }]) criarUsuario(db, conta);

const anatomia = analisarPacote(
  pacoteAnatomia({
    "01 - Membro Superior/03 - Nervo ulnar.md": NOTA_INTERATIVA,
    "02 - Membro Inferior/05 - Atlas do joelho.pdf": pdfDeTeste(),
  })
);
if (!anatomia.ok) throw new Error(relatorio(anatomia));
importarPacote(db, dataDir, anatomia);
importarPacote(db, dataDir, analisarPacote(pacoteFisiologia()));

await app.listen({ port: 4399, host: "127.0.0.1" });
console.log("resumo.com (testes) em http://127.0.0.1:4399 — dados em " + dataDir);
const sair = async () => {
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(0);
};
process.on("SIGINT", sair);
process.on("SIGTERM", sair);
