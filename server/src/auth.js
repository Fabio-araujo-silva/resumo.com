// Contas e sessões. Não existe cadastro público: só o admin cria logins.
// Senha com scrypt (node:crypto); a sessão é um token aleatório num cookie httpOnly, guardado no
// banco só como hash. Tokens de API (para a CLI publicar num site hospedado) funcionam igual.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { HttpError, sha256, novoId, criarLimitador } from "./util.js";

const COOKIE = "resumo_sessao";
const COOKIE_ANTIGO = "sinapse_sessao"; // de antes da troca de nome: continua valendo até expirar
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, sal, 64, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, sal.toString("base64"), hash.toString("base64")].join("$");
}

export function conferirSenha(senha, guardada) {
  const [tipo, N, r, p, sal, hash] = String(guardada).split("$");
  if (tipo !== "scrypt") return false;
  const esperado = Buffer.from(hash, "base64");
  const obtido = crypto.scryptSync(senha, Buffer.from(sal, "base64"), esperado.length, { N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem });
  return crypto.timingSafeEqual(esperado, obtido);
}

// Senha fácil de ditar por mensagem: 4 blocos de letras/números sem caracteres ambíguos.
export function gerarSenha() {
  const alfabeto = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(12);
  let s = "";
  for (let i = 0; i < 12; i++) s += alfabeto[bytes[i] % alfabeto.length] + (i % 4 === 3 && i < 11 ? "-" : "");
  return s;
}

export const normLogin = (e) => String(e || "").trim().toLowerCase();

export function criarUsuario(db, { email, nome, senha, papel = "aluno", expiraEm = null, acessoTotal = true, materias = [], provisoria = false }) {
  const login = normLogin(email);
  if (!/^[^\s]{3,120}$/.test(login)) throw new HttpError(400, "login inválido (3 a 120 caracteres, sem espaços)");
  if (typeof senha !== "string" || senha.length < 8) throw new HttpError(400, "a senha precisa ter pelo menos 8 caracteres");
  if (!["admin", "aluno"].includes(papel)) throw new HttpError(400, "papel inválido");
  if (db.prepare("select 1 from users where email = ?").get(login)) throw new HttpError(409, "já existe uma conta com esse login");
  const id = novoId();
  db.prepare("insert into users (id, email, nome, senha_hash, papel, ativo, expira_em, acesso_total, criado_em, senha_provisoria) values (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)").run(
    id, login, String(nome || "").trim().slice(0, 80) || login.split("@")[0], hashSenha(senha), papel, expiraEm, acessoTotal ? 1 : 0, Date.now(), provisoria ? 1 : 0
  );
  const ins = db.prepare("insert or ignore into user_materias (user_id, materia_id) values (?, ?)");
  for (const m of materias) ins.run(id, String(m));
  return id;
}

// Na primeira subida, garante que existe um admin (das variáveis de ambiente, ou um gerado na hora).
export function garantirAdmin(db, config, log = console.log) {
  if (db.prepare("select 1 from users where papel = 'admin'").get()) return null;
  const email = config.adminEmail || "admin@resumo.local";
  const senha = config.adminSenha || gerarSenha();
  criarUsuario(db, { email, nome: config.adminNome, senha, papel: "admin", provisoria: !config.adminSenha });
  if (!config.adminSenha) {
    const aviso = `Primeiro acesso do resumo.com\nlogin: ${email}\nsenha: ${senha}\n\nTroque a senha em Conta depois de entrar e apague este arquivo.\n`;
    try {
      fs.writeFileSync(path.join(config.dataDir, "PRIMEIRO-ACESSO.txt"), aviso);
    } catch {}
    log(`\n  Admin criado -> login: ${email}  senha: ${senha}\n  (também em ${path.join(config.dataDir, "PRIMEIRO-ACESSO.txt")})\n`);
  }
  return { email, senha };
}

const publico = (u) =>
  u && { id: u.id, email: u.email, nome: u.nome, papel: u.papel, acessoTotal: !!u.acesso_total, expiraEm: u.expira_em, etiqueta: etiquetaDe(u.id), novosPorDia: u.novos_por_dia, senhaProvisoria: !!u.senha_provisoria };
// Etiqueta curta e estável de cada conta: vai na marca d'água visível e na invisível.
export const etiquetaDe = (userId) => sha256("resumo:" + userId).slice(0, 10);

export function registrarAuth(app, { db, config }) {
  const limiteLogin = criarLimitador(10, 15 * 60 * 1000);
  const q = {
    porEmail: db.prepare("select * from users where email = ?"),
    porId: db.prepare("select * from users where id = ?"),
    criarSessao: db.prepare("insert into sessoes (token_hash, user_id, criado_em, expira_em, ip, ua) values (?, ?, ?, ?, ?, ?)"),
    sessao: db.prepare("select user_id, expira_em from sessoes where token_hash = ?"),
    apagarSessao: db.prepare("delete from sessoes where token_hash = ?"),
    apagarVencidas: db.prepare("delete from sessoes where expira_em < ?"),
    sessoesDoUsuario: db.prepare("select token_hash from sessoes where user_id = ? order by criado_em desc"),
    tokenApi: db.prepare("select * from tokens_api where token_hash = ?"),
    usoToken: db.prepare("update tokens_api set ultimo_uso = ? where id = ?"),
    acesso: db.prepare("update users set ultimo_acesso = ? where id = ?"),
  };

  const valido = (u) => u && u.ativo && (!u.expira_em || u.expira_em > Date.now());

  function abrirSessao(req, reply, user) {
    const token = crypto.randomBytes(32).toString("base64url");
    const agora = Date.now();
    const expira = agora + config.diasSessao * 86400000;
    q.criarSessao.run(sha256(token), user.id, agora, expira, req.ip, String(req.headers["user-agent"] || "").slice(0, 200));
    // Aluno: só N dispositivos ao mesmo tempo. Os mais antigos caem.
    if (user.papel !== "admin") {
      const todas = q.sessoesDoUsuario.all(user.id);
      for (const s of todas.slice(Math.max(1, config.maxSessoes))) q.apagarSessao.run(s.token_hash);
    }
    reply.setCookie(COOKIE, token, { path: "/", httpOnly: true, sameSite: "lax", secure: config.producao, expires: new Date(expira) });
  }

  app.decorateRequest("user", null);
  app.decorateRequest("sessaoHash", null);
  app.addHook("onRequest", async (req) => {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith("Bearer ")) {
      const t = q.tokenApi.get(sha256(auth.slice(7).trim()));
      const u = t && q.porId.get(t.user_id);
      if (valido(u) && u.papel === "admin") {
        req.user = u;
        req.viaToken = true;
        q.usoToken.run(Date.now(), t.id);
      }
      return;
    }
    const token = req.cookies[COOKIE] || req.cookies[COOKIE_ANTIGO];
    if (!token) return;
    const hash = sha256(token);
    const s = q.sessao.get(hash);
    if (!s || s.expira_em < Date.now()) return;
    const u = q.porId.get(s.user_id);
    if (!valido(u)) return;
    req.user = u;
    req.sessaoHash = hash;
  });
  setInterval(() => q.apagarVencidas.run(Date.now()), 3600000).unref();

  app.get("/api/config", async () => ({ nome: config.nome, protecao: { desfocar: !!config.desfocar } }));

  app.post("/api/auth/login", async (req, reply) => {
    const { email, senha } = req.body || {};
    const login = normLogin(email);
    const chave = req.ip + "|" + login;
    if (!limiteLogin.checar(chave)) throw new HttpError(429, "muitas tentativas; espere alguns minutos");
    const u = q.porEmail.get(login);
    if (!u || typeof senha !== "string" || !conferirSenha(senha, u.senha_hash)) throw new HttpError(401, "login ou senha incorretos");
    if (!u.ativo) throw new HttpError(403, "este acesso foi desativado; fale com o administrador");
    if (u.expira_em && u.expira_em <= Date.now()) throw new HttpError(403, "este acesso venceu; fale com o administrador");
    limiteLogin.zerar(chave);
    abrirSessao(req, reply, u);
    q.acesso.run(Date.now(), u.id);
    return { user: publico(u) };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    if (req.sessaoHash) q.apagarSessao.run(req.sessaoHash);
    reply.clearCookie(COOKIE, { path: "/" });
    reply.clearCookie(COOKIE_ANTIGO, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req) => ({ user: publico(req.user) }));

  app.post("/api/auth/senha", async (req) => {
    const user = exigirUsuario(req);
    const { atual, nova } = req.body || {};
    // quem entrou com senha provisória acabou de prová-la no login: não precisa digitá-la de novo
    if (!user.senha_provisoria && (typeof atual !== "string" || !conferirSenha(atual, user.senha_hash))) throw new HttpError(401, "senha atual incorreta");
    if (typeof nova !== "string" || nova.length < 8) throw new HttpError(400, "a senha nova precisa ter pelo menos 8 caracteres");
    if (conferirSenha(nova, user.senha_hash)) throw new HttpError(400, "escolha uma senha diferente da atual");
    db.prepare("update users set senha_hash = ?, senha_provisoria = 0 where id = ?").run(hashSenha(nova), user.id);
    db.prepare("delete from sessoes where user_id = ? and token_hash != ?").run(user.id, req.sessaoHash || "");
    return { ok: true, user: publico(q.porId.get(user.id)) };
  });
}

export function exigirUsuario(req) {
  if (!req.user) throw new HttpError(401, "entre na sua conta");
  return req.user;
}
export function exigirAdmin(req) {
  const u = exigirUsuario(req);
  if (u.papel !== "admin") throw new HttpError(403, "só o administrador pode fazer isso");
  return u;
}

// Matérias que a conta enxerga: null = todas.
export function materiasLiberadas(db, user) {
  if (user.papel === "admin" || user.acesso_total) return null;
  return new Set(db.prepare("select materia_id from user_materias where user_id = ?").all(user.id).map((r) => r.materia_id));
}
export function exigirMateria(db, user, materiaId) {
  const lib = materiasLiberadas(db, user);
  if (lib && !lib.has(materiaId)) throw new HttpError(404, "não encontrado");
}
