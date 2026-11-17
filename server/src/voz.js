// Leitura da nota em voz alta com o ElevenLabs. A chave fica só no servidor (.env); o navegador
// recebe o áudio em streaming ("ao vivo") e começa a tocar antes de a geração terminar.
// Cada nota é gerada uma vez por voz e guardada em DATA_DIR/voz/: ouvir de novo não gasta crédito.
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { HttpError, sha1, criarLimitador } from "./util.js";
import { exigirUsuario, materiasLiberadas } from "./auth.js";
import { analisar, textoPuro } from "./markdown.js";

const MAX_CARACTERES = 6000; // teto por nota (protege os créditos)

// Texto para falar: título, resumo e o corpo, sem flashcards, questões nem marcação.
export function textoParaFalar(nota) {
  const a = analisar(nota.md || "");
  const corpo = textoPuro(a.corpo)
    .replace(/\s*[→⟶]\s*/g, ", depois, ")
    .replace(/\s*×\s*/g, " versus ")
    .replace(/(\d)\s*%/g, "$1 por cento")
    .replace(/\s+/g, " ")
    .trim();
  const texto = `${nota.titulo}. ${nota.resumo} ${corpo}`.trim();
  return texto.length > MAX_CARACTERES ? texto.slice(0, MAX_CARACTERES).replace(/\s+\S*$/, "") + "." : texto;
}

export function registrarVoz(app, { db, config }) {
  const chave = config.elevenlabsChave;
  const vozes = { f: { id: config.vozFeminina, nome: "Sarah" }, m: { id: config.vozMasculina, nome: "Brian" } };
  const limite = criarLimitador(30, 60 * 60 * 1000); // gerações novas por conta por hora
  const pasta = path.join(config.dataDir, "voz");
  const gerando = new Map(); // a mesma nota pedida duas vezes ao mesmo tempo gera uma vez só

  app.get("/api/voz", async () => ({
    disponivel: !!chave,
    vozes: [
      { id: "f", nome: "Feminina", detalhe: vozes.f.nome },
      { id: "m", nome: "Masculina", detalhe: vozes.m.nome },
    ],
  }));

  app.get("/api/voz/:materia/:slug", async (req, reply) => {
    const user = exigirUsuario(req);
    if (!chave) throw new HttpError(503, "a leitura em voz alta não está configurada neste servidor");
    const qual = req.query.voz === "m" ? "m" : "f";
    const n = db.prepare("select * from notas where id = ?").get(req.params.materia + "/" + req.params.slug);
    const lib = materiasLiberadas(db, user);
    if (!n || (user.papel !== "admin" && !n.publicada) || (lib && !lib.has(n.materia_id))) throw new HttpError(404, "nota não encontrada");
    const texto = textoParaFalar(n);
    const arquivo = path.join(pasta, `${sha1(qual + "|" + config.vozModelo + "|" + vozes[qual].id + "|" + texto).slice(0, 24)}.mp3`);

    reply.header("cache-control", "private, max-age=86400");
    if (fs.existsSync(arquivo)) return reply.type("audio/mpeg").send(fs.createReadStream(arquivo));
    if (gerando.has(arquivo)) {
      await gerando.get(arquivo);
      if (fs.existsSync(arquivo)) return reply.type("audio/mpeg").send(fs.createReadStream(arquivo));
    }
    if (user.papel !== "admin" && !limite.checar(user.id)) throw new HttpError(429, "muitas leituras novas em pouco tempo; tente daqui a pouco");

    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vozes[qual].id}/stream?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": chave, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: texto, model_id: config.vozModelo, language_code: "pt", voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.0 } }),
    }).catch(() => null);
    if (!r || !r.ok || !r.body) {
      let detalhe = "";
      try {
        detalhe = (await r?.text())?.slice(0, 200) || "";
      } catch {}
      req.log.warn({ status: r?.status, detalhe }, "elevenlabs recusou");
      throw new HttpError(502, r?.status === 401 ? "a chave do ElevenLabs foi recusada" : r?.status === 429 || /quota/i.test(detalhe) ? "os créditos do ElevenLabs acabaram ou o limite foi atingido" : "o serviço de voz não respondeu");
    }

    // repassa ao navegador enquanto chega e guarda uma cópia no disco
    fs.mkdirSync(pasta, { recursive: true });
    const temp = arquivo + ".parte";
    const disco = fs.createWriteStream(temp);
    const fluxo = Readable.fromWeb(r.body);
    let pronto;
    gerando.set(arquivo, new Promise((ok) => (pronto = ok)));
    fluxo.on("data", (pedaco) => disco.write(pedaco));
    fluxo.on("end", () =>
      disco.end(() => {
        try {
          fs.renameSync(temp, arquivo);
        } catch {}
        gerando.delete(arquivo);
        pronto();
      })
    );
    fluxo.on("error", () => {
      disco.destroy();
      fs.rmSync(temp, { force: true });
      gerando.delete(arquivo);
      pronto();
    });
    return reply.type("audio/mpeg").send(fluxo);
  });
}
