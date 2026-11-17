// Servidor do Sinapse: API (contas, conteúdo, flashcards, admin) + o front-end compilado (web/dist).
import fs from "node:fs";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import compress from "@fastify/compress";
import fastifyStatic from "@fastify/static";
import { carregarConfig } from "./config.js";
import { abrirDb } from "./db.js";
import { HttpError } from "./util.js";
import { registrarAuth, garantirAdmin } from "./auth.js";
import { registrarConteudo } from "./conteudo.js";
import { registrarFlashcards } from "./flashcards.js";
import { registrarAdmin } from "./admin.js";

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

export async function montarApp(sobrepor = {}) {
  const config = { ...carregarConfig(), ...sobrepor };
  const app = Fastify({
    logger: sobrepor.logger ?? { level: config.producao ? "info" : "warn" },
    trustProxy: process.env.TRUST_PROXY === "1",
    bodyLimit: 4 * 1024 * 1024,
  });
  const db = abrirDb(config.dataDir);

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 40, fields: 20 } });
  await app.register(compress, {
    threshold: 1024,
    encodings: ["br", "gzip"],
    brotliOptions: { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } },
    zlibOptions: { level: 5 },
  });

  // Toda escrita na API exige um cabeçalho que formulários de outros sites não conseguem mandar (CSRF).
  app.addHook("onRequest", async (req) => {
    if (req.method === "GET" || req.method === "HEAD" || !req.url.startsWith("/api/")) return;
    if (req.headers["x-sinapse"] !== "1") throw new HttpError(403, "requisição recusada");
  });

  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "same-origin");
    reply.header("x-robots-tag", "noindex, nofollow, noarchive");
    if (!req.url.startsWith("/api/")) {
      reply.header("content-security-policy", CSP);
      reply.header("x-frame-options", "DENY");
    } else if (!reply.getHeader("cache-control")) reply.header("cache-control", "no-store");
    return payload;
  });

  app.setErrorHandler((err, req, reply) => {
    const status = err.statusCode || 500;
    if (status >= 500) req.log.error(err);
    const corpo = { error: status >= 500 && !(err instanceof HttpError) ? "erro interno" : err.message };
    if (err.payload) Object.assign(corpo, err.payload);
    reply.code(status).send(corpo);
  });

  registrarAuth(app, { db, config });
  registrarConteudo(app, { db, config });
  registrarFlashcards(app, { db, config, agora: sobrepor.agora });
  registrarAdmin(app, { db, config });

  app.get("/api/saude", async () => ({ ok: true }));

  // Front-end: arquivos com hash no nome (assets/) ficam em cache; o resto revalida.
  const temWeb = fs.existsSync(config.webDist);
  if (temWeb) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      // rota curinga: um build novo do front vale na hora, sem reiniciar o servidor
      cacheControl: false,
      setHeaders(res, caminho) {
        res.setHeader("cache-control", /[\\/]assets[\\/]/.test(caminho) ? "public, max-age=31536000, immutable" : "no-cache");
      },
    });
  }
  app.setNotFoundHandler((req, reply) => {
    if (temWeb && req.method === "GET" && !req.url.startsWith("/api/")) {
      reply.header("cache-control", "no-cache");
      return reply.sendFile("index.html");
    }
    reply.code(404).send({ error: "não encontrado" });
  });

  app.addHook("onClose", async () => db.close());
  return { app, config, db };
}

async function principal() {
  const { app, config, db } = await montarApp();
  garantirAdmin(db, config);
  await app.listen({ port: config.porta, host: config.host });
  console.log(`${config.nome} em http://localhost:${config.porta} (dados em ${config.dataDir})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  principal().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
