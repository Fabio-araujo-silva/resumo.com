// Chamadas à API. Toda escrita leva o cabeçalho anti-CSRF; 401 avisa o app que a sessão caiu.

export type Usuario = { id: string; email: string; nome: string; papel: "admin" | "aluno"; acessoTotal: boolean; expiraEm: number | null; etiqueta: string; novosPorDia: number; senhaProvisoria: boolean };
export type Materia = { id: string; nome: string; semestre: number; eixo: string; descricao: string; cor: string; prova_data: string | null; n2_data: string | null };
export type Modulo = { id: string; materia_id: string; titulo: string; descricao: string; ordem: number; avaliacao: "n1" | "n2" };
export type NotaMeta = {
  id: string; materia: string; modulo: string; titulo: string; resumo: string; prova: boolean; prioridade: number;
  tags: string[]; minutos: number; pdf: boolean; mapa: boolean; rascunho: boolean; cards: number;
};
export type Biblioteca = { materias: Materia[]; modulos: Modulo[]; notas: NotaMeta[]; links: [string, string][]; lidas: string[]; versao: number };
export type Ligada = { id: string; titulo: string; resumo: string; materia: string };
export type NotaCompleta = {
  nota: {
    id: string; titulo: string; resumo: string; prova: boolean; prioridade: number; tags: string[]; fontes: string[]; minutos: number; pdf: boolean; mapa: boolean;
    rascunho: boolean; atualizadoEm: number; lida: boolean; materia: { id: string; nome: string; cor: string; semestre: number }; modulo: { id: string; titulo: string };
  };
  html: string; titulos: { id: string; texto: string; nivel: number }[]; questoes: number; saidas: Ligada[]; entradas: Ligada[];
  anterior: { id: string; titulo: string } | null; proxima: { id: string; titulo: string } | null; cards: number;
  cartas: { frente: string; verso: string }[];
};
export type Contagem = { novos: number; aprendendo: number; revisar: number; total: number; novasRestantes: number; limite: number };
export type Rodada = {
  carta: { id: string; frente: string; verso: string; nota: { id: string; titulo: string }; estado: string } | null;
  previsoes?: Record<string, string>; contagem: Contagem; proximaEm: number | null;
  agendada?: { estado: string; intervalo: number; vence: number };
};
export type Baralho = { materia: string; nome: string; semestre: number; cor: string; novos: number; aprendendo: number; revisar: number; total: number; estudadas: number; maduras: number; deProva: number; novasRestantes: number; avaliacoes: { av: "n1" | "n2"; cartas: number }[] };
export type LimiteCartas = { novosPorDia: number; padrao: number; minimo: number; maximo: number };
export type Estatisticas = { feitasHoje: number; sequencia: number; retencao: number | null; semana: { dia: string; n: number }[] };
export type ProvaDados = {
  materia: { id: string; nome: string; cor: string; semestre: number; provaData: string | null; provaFoco: string };
  av: "n1" | "n2";
  avaliacoes: { av: "n1" | "n2"; notas: number; data: string | null }[];
  notas: { id: string; titulo: string; resumo: string; modulo: string; prioridade: number; minutos: number; essencial: string[]; lida: boolean }[];
  dicas: { nota: { id: string; titulo: string }; titulo: string; html: string }[];
  questoes: { nota: { id: string; titulo: string }; html: string }[];
};

export class ErroApi extends Error {
  status: number;
  dados: Record<string, unknown>;
  constructor(status: number, mensagem: string, dados: Record<string, unknown> = {}) {
    super(mensagem);
    this.status = status;
    this.dados = dados;
  }
}

let aoCairSessao: () => void = () => {};
export const definirAoCairSessao = (f: () => void) => {
  aoCairSessao = f;
};

async function pedir<T>(metodo: string, url: string, corpo?: unknown): Promise<T> {
  const cab: Record<string, string> = { "x-sinapse": "1" };
  let body: BodyInit | undefined;
  if (corpo instanceof FormData) body = corpo;
  else if (corpo !== undefined) {
    cab["content-type"] = "application/json";
    body = JSON.stringify(corpo);
  }
  let r: Response;
  try {
    r = await fetch(url, { method: metodo, headers: cab, body, credentials: "same-origin" });
  } catch {
    throw new ErroApi(0, "Sem conexão com o servidor.");
  }
  let dados: Record<string, unknown> = {};
  try {
    dados = await r.json();
  } catch {}
  if (!r.ok) {
    if (r.status === 401 && !url.startsWith("/api/auth/")) aoCairSessao();
    throw new ErroApi(r.status, String(dados.error || "Algo deu errado."), dados);
  }
  return dados as T;
}

export const api = {
  get: <T>(url: string) => pedir<T>("GET", url),
  post: <T>(url: string, corpo?: unknown) => pedir<T>("POST", url, corpo ?? {}),
  put: <T>(url: string, corpo?: unknown) => pedir<T>("PUT", url, corpo ?? {}),
  patch: <T>(url: string, corpo?: unknown) => pedir<T>("PATCH", url, corpo ?? {}),
  del: <T>(url: string) => pedir<T>("DELETE", url),
};

// PDF de uma nota: chega embaralhado; desembaralha na memória (nunca vira arquivo).
export async function baixarPdf(notaId: string): Promise<Uint8Array> {
  const r = await fetch("/api/pdf/" + notaId, { credentials: "same-origin" });
  if (!r.ok) {
    if (r.status === 401) aoCairSessao();
    let msg = "Não foi possível abrir o PDF.";
    try {
      msg = (await r.json()).error || msg;
    } catch {}
    throw new ErroApi(r.status, msg);
  }
  const hex = r.headers.get("x-chave") || "";
  const chave = new Uint8Array((hex.match(/../g) || []).map((h) => parseInt(h, 16)));
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (chave.length) for (let i = 0; i < bytes.length; i++) bytes[i] ^= chave[i % chave.length];
  return bytes;
}

export const mensagem = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado.");
