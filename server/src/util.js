// Utilidades pequenas usadas pelo servidor e pela CLI.
import crypto from "node:crypto";

export class HttpError extends Error {
  constructor(statusCode, message, payload) {
    super(message);
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

export const semAcento = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

// "Eras da Cirurgia" -> "eras-da-cirurgia". É a identidade estável de matérias, módulos e notas.
export function slug(s) {
  return (
    semAcento(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/g, "") || "nota"
  );
}

export const sha1 = (s) => crypto.createHash("sha1").update(s).digest("hex");
export const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
export const novoId = () => crypto.randomBytes(9).toString("base64url");

export const contarPalavras = (texto) => (String(texto).match(/[\p{L}\p{N}]+/gu) || []).length;

export function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Limite simples de eventos por chave numa janela de tempo (em memória).
export function criarLimitador(max, janelaMs) {
  const hits = new Map();
  return {
    checar(chave) {
      const agora = Date.now();
      const h = hits.get(chave);
      if (!h || agora - h.inicio > janelaMs) {
        hits.set(chave, { inicio: agora, n: 1 });
        return true;
      }
      h.n++;
      return h.n <= max;
    },
    zerar(chave) {
      hits.delete(chave);
    },
  };
}

const MIMES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};
export const mimeDe = (caminho) => MIMES[String(caminho).toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || ""] || null;
export const EXT_IMAGEM = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
