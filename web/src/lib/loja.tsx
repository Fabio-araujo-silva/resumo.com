// Estado global do app: quem está logado, a biblioteca (matérias, notas e ligações), tema e avisos.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, definirAoCairSessao, mensagem, type Biblioteca, type Materia, type Modulo, type NotaMeta, type Usuario } from "./api";

export const PALETA = ["#2fc4b2", "#5aa7e8", "#f0b85a", "#f47c72", "#b79cf2", "#4fcf8e", "#e88fc0", "#7fd0e6", "#d6a86a", "#9fb4ff", "#c3d96a", "#ff9d6e"];

export type Indice = {
  materia: Map<string, Materia>;
  modulo: Map<string, Modulo>;
  nota: Map<string, NotaMeta>;
  modulosDe: Map<string, Modulo[]>;
  notasDoModulo: Map<string, NotaMeta[]>;
  notasDaMateria: Map<string, NotaMeta[]>;
  saidas: Map<string, string[]>;
  entradas: Map<string, string[]>;
  lidas: Set<string>;
  semestres: number[];
  cor: (materiaId: string) => string;
};
type Aviso = { id: number; texto: string; tipo: "ok" | "erro" | "info" };
type Config = { nome: string; protecao: { desfocar: boolean } };
type App = {
  usuario: Usuario | null | undefined; // undefined = ainda carregando
  config: Config;
  motivoSaida: string;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  definirUsuario: (u: Usuario) => void;
  bib: Biblioteca | null;
  idx: Indice;
  recarregar: () => Promise<void>;
  marcarLida: (id: string, lida: boolean) => void;
  tema: "dark" | "light";
  alternarTema: () => void;
  avisos: Aviso[];
  avisar: (texto: string, tipo?: Aviso["tipo"]) => void;
};

const Ctx = createContext<App | null>(null);
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("fora do Provedor");
  return c;
};

function montarIndice(bib: Biblioteca | null): Indice {
  const vazio = <K, V>() => new Map<K, V>();
  const idx: Indice = { materia: vazio(), modulo: vazio(), nota: vazio(), modulosDe: vazio(), notasDoModulo: vazio(), notasDaMateria: vazio(), saidas: vazio(), entradas: vazio(), lidas: new Set(bib?.lidas), semestres: [], cor: () => PALETA[0] };
  if (!bib) return idx;
  const empurrar = <V,>(m: Map<string, V[]>, k: string, v: V) => {
    const l = m.get(k);
    if (l) l.push(v);
    else m.set(k, [v]);
  };
  bib.materias.forEach((m) => idx.materia.set(m.id, m));
  for (const m of bib.modulos) {
    idx.modulo.set(m.id, m);
    empurrar(idx.modulosDe, m.materia_id, m);
  }
  for (const n of bib.notas) {
    idx.nota.set(n.id, n);
    empurrar(idx.notasDoModulo, n.modulo, n);
    empurrar(idx.notasDaMateria, n.materia, n);
  }
  for (const [o, d] of bib.links) {
    empurrar(idx.saidas, o, d);
    empurrar(idx.entradas, d, o);
  }
  idx.semestres = [...new Set(bib.materias.map((m) => m.semestre))].sort((a, b) => a - b);
  const ordem = new Map(bib.materias.map((m, i) => [m.id, i]));
  idx.cor = (id) => idx.materia.get(id)?.cor || PALETA[(ordem.get(id) ?? 0) % PALETA.length];
  return idx;
}

export function Provedor({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);
  const [config, setConfig] = useState<Config>({ nome: "Sinapse", protecao: { desfocar: true } });
  const [bib, setBib] = useState<Biblioteca | null>(null);
  const [motivoSaida, setMotivoSaida] = useState("");
  const [tema, setTema] = useState<"dark" | "light">(() => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"));
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const seq = useRef(0);
  const logado = useRef(false);

  const avisar = useCallback((texto: string, tipo: Aviso["tipo"] = "info") => {
    const id = ++seq.current;
    setAvisos((a) => [...a.slice(-3), { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === "erro" ? 6500 : 3800);
  }, []);

  const recarregar = useCallback(async () => {
    try {
      setBib(await api.get<Biblioteca>("/api/biblioteca"));
    } catch (e) {
      avisar(mensagem(e), "erro");
    }
  }, [avisar]);

  useEffect(() => {
    definirAoCairSessao(() => {
      if (!logado.current) return;
      logado.current = false;
      setUsuario(null);
      setBib(null);
      setMotivoSaida("Sua sessão foi encerrada. Se você entrou em outro aparelho, é isso: cada conta fica aberta em um lugar só.");
    });
    api.get<Config>("/api/config").then(setConfig).catch(() => {});
    api
      .get<{ user: Usuario | null }>("/api/auth/me")
      .then((r) => {
        logado.current = !!r.user;
        setUsuario(r.user);
      })
      .catch(() => setUsuario(null));
  }, []);

  useEffect(() => {
    if (usuario) recarregar();
  }, [usuario, recarregar]);

  const entrar = useCallback(async (email: string, senha: string) => {
    const r = await api.post<{ user: Usuario }>("/api/auth/login", { email, senha });
    logado.current = true;
    setMotivoSaida("");
    setUsuario(r.user);
  }, []);

  const sair = useCallback(async () => {
    logado.current = false;
    await api.post("/api/auth/logout").catch(() => {});
    setUsuario(null);
    setBib(null);
    setMotivoSaida("");
  }, []);

  const marcarLida = useCallback(
    (id: string, lida: boolean) => {
      setBib((b) => (b ? { ...b, lidas: lida ? [...new Set([...b.lidas, id])] : b.lidas.filter((x) => x !== id) } : b));
      api.post("/api/notas/" + id + "/lida", { lida }).catch((e) => avisar(mensagem(e), "erro"));
    },
    [avisar]
  );

  const alternarTema = useCallback(() => {
    setTema((t) => {
      const novo = t === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", novo);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", novo === "dark" ? "#0a1116" : "#f3f6f8");
      try {
        localStorage.setItem("sinapse-tema", novo);
      } catch {}
      return novo;
    });
  }, []);

  const idx = useMemo(() => montarIndice(bib), [bib]);
  const valor: App = { usuario, config, motivoSaida, entrar, sair, definirUsuario: setUsuario, bib, idx, recarregar, marcarLida, tema, alternarTema, avisos, avisar };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

// ---------- utilidades de apresentação ----------
export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function diasAte(dataIso: string | null): number | null {
  if (!dataIso) return null;
  const [a, m, d] = dataIso.split("-").map(Number);
  const alvo = new Date(a, m - 1, d).getTime();
  const hoje = new Date();
  return Math.round((alvo - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()) / 86400000);
}
export function textoProva(dias: number | null): string {
  if (dias === null) return "";
  if (dias < 0) return "prova já passou";
  if (dias === 0) return "prova hoje";
  if (dias === 1) return "prova amanhã";
  return `prova em ${dias} dias`;
}
export const dataCurta = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};
export function quando(ms: number | null | undefined): string {
  if (!ms) return "nunca";
  const dif = Date.now() - ms;
  if (dif < 60000) return "agora";
  if (dif < 3600000) return `há ${Math.round(dif / 60000)} min`;
  if (dif < 86400000) return `há ${Math.round(dif / 3600000)} h`;
  if (dif < 30 * 86400000) return `há ${Math.round(dif / 86400000)} d`;
  return new Date(ms).toLocaleDateString("pt-BR");
}
