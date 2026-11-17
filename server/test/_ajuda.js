// Apoio dos testes: sobe o app num diretório temporário, cria contas e monta pacotes de exemplo.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { montarApp } from "../src/index.js";
import { criarUsuario } from "../src/auth.js";
import { analisarPacote, zipar } from "../src/pacote.js";
import { importarPacote } from "../src/importar.js";

export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
export const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

const texto = (n) => Array.from({ length: n }, (_, i) => "palavra" + i).join(" ");

export function nota({ titulo, resumo = "Uma frase que diz o que a nota ensina.", prova = false, prioridade, corpo, cards = 2, extra = "", props = "" }) {
  const c = corpo ?? `> [!ideia]\n> Ideia central de ${titulo}.\n\n${texto(60)}\n`;
  const fc = Array.from({ length: cards }, (_, i) => `> [!flashcard] Pergunta ${i + 1} sobre ${titulo}?\n> ?? O que a pergunta ${i + 1} quer saber.\n> Resposta ${i + 1}.`).join("\n\n");
  return `---\n${titulo ? `titulo: "${titulo}"\n` : ""}resumo: "${resumo}"\nprova: ${prova}\n${prioridade ? `prioridade: ${prioridade}\n` : ""}${props}---\n\n${c}\n${extra}\n${fc}\n`;
}

// Matéria pequena e completa: 2 módulos, 4 notas ligadas, figura, questão, notas de prova.
export function pacoteAnatomia(mudancas = {}) {
  const arquivos = new Map([
    ["materia.yml", "formato: 1\nslug: anatomia\nnome: Anatomia\nsemestre: 1\nprova:\n  data: 2030-06-10\n  foco: Plexo braquial e manguito.\n"],
    [
      "01 - Membro Superior/00 - Mapa - Membro Superior.md",
      nota({ titulo: "Mapa - Membro Superior", cards: 0, props: "tipo: mapa\n", corpo: "> [!objetivos]\n> Entender o plexo e o manguito.\n\n- [[Plexo braquial]]\n- [[Manguito rotador]]\n" }),
    ],
    [
      "01 - Membro Superior/01 - Plexo braquial.md",
      nota({
        titulo: "Plexo braquial",
        resumo: "Rede nervosa de C5 a T1 que inerva o membro superior.",
        prova: true,
        prioridade: "alta",
        corpo: `> [!ideia]\n> O plexo braquial nasce de **C5 a T1**.\n\n## Troncos\n\n${texto(50)} Veja o [[Manguito rotador|manguito]] e ==grife isto==.\n\n![Esquema do plexo](anexos/plexo.png)\n\n> [!prova] Pegadinha\n> O nervo axilar sai do fascículo posterior.\n\n> [!essencial]\n> - Raízes C5 a T1.\n> - Cinco nervos terminais.\n`,
        extra: "> [!questao] De quais raízes nasce o plexo braquial?\n> - [ ] C1 a C4\n> - [x] C5 a T1\n> - [ ] T2 a T6\n>\n> São as raízes de C5 a T1.\n",
      }),
    ],
    ["01 - Membro Superior/02 - Manguito rotador.md", nota({ titulo: "Manguito rotador", resumo: "Quatro músculos que estabilizam o ombro.", corpo: `> [!ideia]\n> Supraespinal, infraespinal, redondo menor e subescapular.\n\n${texto(55)} Inervação vem do [[Plexo braquial]].\n` })],
    [
      "02 - Membro Inferior/01 - Nervo isquiático.md",
      nota({ titulo: "Nervo isquiático", resumo: "O maior nervo do corpo, de L4 a S3.", prova: true, prioridade: "media", corpo: `> [!ideia]\n> Sai pelo forame isquiático maior.\n\n${texto(50)} Compare com o [[Plexo braquial]].\n\n> [!essencial]\n> - L4 a S3.\n` }),
    ],
    ["anexos/plexo.png", PNG],
  ]);
  for (const [k, v] of Object.entries(mudancas)) {
    if (v === null) arquivos.delete(k);
    else arquivos.set(k, typeof v === "string" ? Buffer.from(v) : v);
  }
  for (const [k, v] of arquivos) if (typeof v === "string") arquivos.set(k, Buffer.from(v));
  return arquivos;
}

export function pacoteFisiologia() {
  return new Map(
    Object.entries({
      "materia.yml": "formato: 1\nslug: fisiologia\nnome: Fisiologia\nsemestre: 2\n",
      "01 - Neuro/01 - Potencial de ação.md": nota({ titulo: "Potencial de ação", resumo: "Despolarização rápida da membrana.", corpo: `> [!ideia]\n> Tudo ou nada.\n\n${texto(50)} Conduzido pelos nervos do [[anatomia/Plexo braquial]].\n` }),
    }).map(([k, v]) => [k, Buffer.from(v)])
  );
}

export async function subir(opcoes = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "resumo-teste-"));
  const relogio = { t: Date.UTC(2030, 0, 15, 15, 0, 0) }; // 12h em Brasília
  const { app, db, config } = await montarApp({ dataDir, logger: false, webDist: path.join(dataDir, "sem-web"), agora: () => relogio.t, elevenlabsChave: "", ...opcoes });
  criarUsuario(db, { email: "admin@teste.com", nome: "Admin", senha: "admin-senha-1", papel: "admin" });
  criarUsuario(db, { email: "ana@teste.com", nome: "Ana", senha: "ana-senha-123", papel: "aluno" });

  const importar = (arquivos, op) => importarPacote(db, dataDir, analisarPacote(arquivos), op);

  async function entrar(email, senha) {
    const r = await app.inject({ method: "POST", url: "/api/auth/login", headers: { "x-resumo": "1" }, payload: { email, senha } });
    if (r.statusCode !== 200) throw new Error("login falhou: " + r.body);
    return String(r.headers["set-cookie"]).split(";")[0];
  }
  // pedido autenticado; devolve { status, json, bruto, headers }
  async function pedir(cookie, metodo, url, corpo, cabecalhos = {}) {
    const r = await app.inject({ method: metodo, url, headers: { ...(cookie ? { cookie } : {}), "x-resumo": "1", ...cabecalhos }, ...(corpo !== undefined ? { payload: corpo } : {}) });
    let json = null;
    try {
      json = r.json();
    } catch {}
    return { status: r.statusCode, json, bruto: r.rawPayload, headers: r.headers };
  }
  function multipart(campos, arquivos) {
    const limite = "----resumo" + Math.random().toString(16).slice(2);
    const partes = [];
    for (const [k, v] of Object.entries(campos)) partes.push(Buffer.from(`--${limite}\r\ncontent-disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    for (const a of arquivos) {
      partes.push(Buffer.from(`--${limite}\r\ncontent-disposition: form-data; name="${a.campo || "arquivo"}"; filename="${a.nome}"\r\ncontent-type: application/octet-stream\r\n\r\n`));
      partes.push(a.bytes, Buffer.from("\r\n"));
    }
    partes.push(Buffer.from(`--${limite}--\r\n`));
    return { corpo: Buffer.concat(partes), cabecalhos: { "content-type": "multipart/form-data; boundary=" + limite } };
  }
  async function enviar(cookie, url, campos, arquivos, extra = {}) {
    const m = multipart(campos, arquivos);
    return pedir(cookie, "POST", url, m.corpo, { ...m.cabecalhos, ...extra });
  }
  async function fechar() {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  return { app, db, config, dataDir, relogio, importar, entrar, pedir, enviar, fechar, zipar };
}

export const semInvisiveis = (s) => String(s).replace(/[​‌⁠]/g, "");
export const MIN = 60000;
export const DIA = 86400000;
