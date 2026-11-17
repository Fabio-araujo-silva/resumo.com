// Configuração por variáveis de ambiente (veja .env.example na raiz).
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.resolve(aqui, "..", "..");

export function carregarConfig(env = process.env) {
  return {
    porta: Number(env.PORT || 4310),
    host: env.HOST || "0.0.0.0",
    dataDir: path.resolve(env.DATA_DIR || path.join(RAIZ, "dados")),
    webDist: path.resolve(env.WEB_DIST || path.join(RAIZ, "web", "dist")),
    producao: env.NODE_ENV === "production",
    nome: env.NOME_PLATAFORMA || "Sinapse",
    diasSessao: Number(env.DIAS_SESSAO || 14),
    // Quantos dispositivos um aluno pode manter logados ao mesmo tempo. 1 = entrar em outro lugar
    // derruba o anterior (desestimula emprestar a conta).
    maxSessoes: Number(env.MAX_SESSOES || 1),
    // Teto de notas abertas por aluno (freia quem tenta copiar tudo de uma vez).
    leiturasPor10Min: Number(env.LEITURAS_POR_10MIN || 60),
    leiturasPorDia: Number(env.LEITURAS_POR_DIA || 400),
    // Fuso dos alunos em minutos em relação ao UTC (Brasília = -180). Define a "virada do dia" dos flashcards.
    fusoMin: Number(env.FUSO_MIN ?? -180),
    // Admin criado na primeira subida se ainda não existir nenhum.
    adminEmail: env.ADMIN_EMAIL || "",
    adminSenha: env.ADMIN_SENHA || "",
    adminNome: env.ADMIN_NOME || "Admin",
    // Geração de resumos com o Claude Code local.
    claudeBin: env.CLAUDE_BIN || "claude",
    claudeArgs: env.CLAUDE_ARGS ? JSON.parse(env.CLAUDE_ARGS) : null,
    claudeModelo: env.CLAUDE_MODELO || "",
    claudeTimeoutMin: Number(env.CLAUDE_TIMEOUT_MIN || 60),
    maxUploadMb: Number(env.MAX_UPLOAD_MB || 200),
    // Borra o conteúdo quando a janela perde o foco (atrapalha ferramentas de captura). DESFOCAR=0 desliga.
    desfocar: env.DESFOCAR !== "0",
  };
}
