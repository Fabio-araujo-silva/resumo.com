// Ouvir a nota. Com o ElevenLabs configurado no servidor, é um player de áudio de verdade: voz
// masculina em português do Brasil, começa a tocar enquanto o áudio ainda está sendo gerado, e pausar,
// continuar, parar, velocidade e a barra de tempo seguem o estado real do <audio>.
// Sem o ElevenLabs, cai na voz do próprio navegador (só tocar e parar: o "pausar" dela falha em
// vários navegadores e era o que deixava o botão preso em "Pausar").
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { Icone } from "./Icone";
import { Ajuda } from "./Ajuda";

type Estado = "parado" | "carregando" | "tocando" | "pausado" | "erro";
type Info = { disponivel: boolean; voz?: { nome: string; detalhe: string; idioma: string } };
let infoCache: Promise<Info> | null = null;
const info = () => (infoCache ||= api.get<Info>("/api/voz").catch(() => ({ disponivel: false })));

const lerPref = (k: string, padrao: string) => {
  try {
    return localStorage.getItem(k) || padrao;
  } catch {
    return padrao;
  }
};
const gravarPref = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};
const relogio = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "–:––");
const VELOCIDADES = [1, 1.25, 1.5, 0.85];

// Voz do navegador: lê em pedaços curtos (algumas vozes cortam falas longas).
function falarNoNavegador(texto: string, aoTerminar: () => void) {
  const pedacos: string[] = [];
  for (const frase of texto.match(/[^.!?]+[.!?]*/g) || []) {
    const f = frase.trim();
    if (!f) continue;
    if (pedacos.length && (pedacos[pedacos.length - 1] + " " + f).length < 200) pedacos[pedacos.length - 1] += " " + f;
    else pedacos.push(f);
  }
  speechSynthesis.cancel();
  const vozes = speechSynthesis.getVoices();
  const voz = vozes.find((v) => /^pt[-_]BR/i.test(v.lang)) || vozes.find((v) => /^pt/i.test(v.lang));
  pedacos.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    u.lang = "pt-BR";
    if (voz) u.voice = voz;
    if (i === pedacos.length - 1) u.onend = aoTerminar;
    u.onerror = aoTerminar;
    speechSynthesis.speak(u);
  });
}

export function PlayerVoz({ notaId, pegarTexto }: { notaId: string; pegarTexto: () => string }) {
  const [disp, setDisp] = useState<Info | null>(null);
  const [estado, setEstado] = useState<Estado>("parado");
  const [velocidade, setVelocidade] = useState(() => Number(lerPref("resumo-velocidade", "1")) || 1);
  const [tempo, setTempo] = useState({ atual: 0, total: NaN });
  const [erro, setErro] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    info().then(setDisp);
  }, []);

  const parar = useCallback(() => {
    const a = audio.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
      audio.current = null;
    }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    setEstado("parado");
    setTempo({ atual: 0, total: NaN });
  }, []);
  useEffect(() => parar, [notaId, parar]); // trocou de nota ou saiu da página: para

  const tocar = useCallback(
    () => {
      setErro("");
      if (!disp?.disponivel) {
        if (!("speechSynthesis" in window)) return;
        setEstado("tocando");
        falarNoNavegador(pegarTexto(), () => setEstado("parado"));
        return;
      }
      parar();
      const a = new Audio(`/api/voz/${notaId}`);
      a.preload = "auto";
      a.playbackRate = velocidade;
      a.addEventListener("waiting", () => setEstado((e) => (e === "pausado" ? e : "carregando")));
      a.addEventListener("playing", () => setEstado("tocando"));
      a.addEventListener("pause", () => setEstado((e) => (a.ended || e === "parado" ? e : "pausado")));
      a.addEventListener("ended", () => {
        setEstado("parado");
        setTempo((t) => ({ ...t, atual: 0 }));
      });
      a.addEventListener("timeupdate", () => setTempo({ atual: a.currentTime, total: a.duration }));
      a.addEventListener("durationchange", () => setTempo({ atual: a.currentTime, total: a.duration }));
      a.addEventListener("error", () => {
        if (audio.current !== a) return;
        // não pede o áudio de novo só para ler o motivo: cada pedido pode gastar créditos
        setErro("Não foi possível tocar a leitura agora. Tente de novo em instantes.");
        setEstado("erro");
      });
      audio.current = a;
      setEstado("carregando");
      a.play().catch(() => {});
    },
    [disp, velocidade, notaId, pegarTexto, parar]
  );

  const alternar = useCallback(() => {
    const a = audio.current;
    if (estado === "parado" || estado === "erro") return tocar();
    if (!disp?.disponivel) return parar(); // voz do navegador: só para
    if (!a) return tocar();
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, [estado, disp, tocar, parar]);

  // atalho "O" da página
  useEffect(() => {
    const t = () => alternar();
    window.addEventListener("resumo:voz-alternar", t);
    return () => window.removeEventListener("resumo:voz-alternar", t);
  }, [alternar]);

  const trocarVelocidade = () => {
    const prox = VELOCIDADES[(VELOCIDADES.indexOf(velocidade) + 1) % VELOCIDADES.length];
    setVelocidade(prox);
    gravarPref("resumo-velocidade", String(prox));
    if (audio.current) audio.current.playbackRate = prox;
  };
  const pular = (s: number) => {
    const a = audio.current;
    if (a) a.currentTime = Math.max(0, Math.min(Number.isFinite(a.duration) ? a.duration : a.currentTime + s, a.currentTime + s));
  };

  if (!disp) return null;
  const temEleven = disp.disponivel;
  const ativo = estado !== "parado" && estado !== "erro";
  const rotulo = estado === "carregando" ? "Carregando…" : estado === "tocando" ? (temEleven ? "Pausar" : "Parar") : estado === "pausado" ? "Continuar" : "Ouvir";
  const pct = Number.isFinite(tempo.total) && tempo.total > 0 ? (tempo.atual / tempo.total) * 100 : 0;

  return (
    <span className={"player-voz" + (ativo ? " ativo" : "")} data-testid="player-voz" data-estado={estado}>
      <button type="button" className={"ferramenta" + (ativo ? " ativa" : "")} onClick={alternar} data-testid="ouvir" title="Ouvir a nota em voz alta (atalho O)">
        <Icone nome={estado === "tocando" && temEleven ? "pausa" : "som"} tam={16} /> {rotulo}
      </button>
      {ativo && temEleven && (
        <>
          <button type="button" className="ferramenta so-texto" onClick={() => pular(-10)} title="Voltar 10 segundos" aria-label="Voltar 10 segundos">−10s</button>
          <span className="voz-tempo" aria-label="Tempo da leitura">
            <span className="voz-trilho"><i style={{ width: pct + "%" }} /></span>
            <small>{relogio(tempo.atual)}{Number.isFinite(tempo.total) ? " / " + relogio(tempo.total) : ""}</small>
          </span>
          <button type="button" className="ferramenta so-texto" onClick={trocarVelocidade} title="Velocidade da leitura" data-testid="velocidade">{String(velocidade).replace(".", ",")}x</button>
        </>
      )}
      {ativo && <button type="button" className="ferramenta so-texto" onClick={parar} data-testid="parar-voz">Parar</button>}
      {erro && <span className="voz-erro" role="alert">{erro}</span>}
      <Ajuda rotulo="Sobre a leitura em voz alta">
        {temEleven ? (
          <>Uma voz masculina, em português do Brasil, lê a nota para você. A leitura começa em poucos segundos e você pode pausar, voltar 10 segundos e mudar a velocidade. Questões e flashcards não são lidos.</>
        ) : (
          <>A voz do seu navegador lê a nota. Questões e flashcards não são lidos.</>
        )}
      </Ajuda>
    </span>
  );
}
