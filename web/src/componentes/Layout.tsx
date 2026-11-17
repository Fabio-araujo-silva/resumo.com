// Moldura do app: menu lateral no computador, barra de abas embaixo no celular.
import { useEffect, useState, type ReactNode } from "react";
import { api, type Baralho } from "../lib/api";
import { useApp } from "../lib/loja";
import { Link, useCaminho } from "../lib/rota";
import { Icone, Logo } from "./Icone";
import { Busca } from "./Busca";
import { Espiada } from "./Espiada";
import { ChamaOfensiva } from "./Ofensiva";

const ITENS = [
  { para: "/", nome: "Início", curto: "Início", icone: "inicio", ativo: (c: string) => c === "/" },
  { para: "/estante", nome: "Prateleira", curto: "Prateleira", icone: "estante", ativo: (c: string) => c.startsWith("/estante") || c.startsWith("/materia") || c.startsWith("/nota") },
  { para: "/prova", nome: "Modo prova", curto: "Prova", icone: "prova", ativo: (c: string) => c.startsWith("/prova") },
  { para: "/flashcards", nome: "Flashcards", curto: "Flashcards", icone: "cartas", ativo: (c: string) => c.startsWith("/flashcards") },
  { para: "/pendencias", nome: "Pendências", curto: "Pendências", icone: "marcador", ativo: (c: string) => c.startsWith("/pendencias") },
];

export function Layout({ children }: { children: ReactNode }) {
  const { usuario, config, sair, tema, alternarTema, pendencias } = useApp();
  const caminho = useCaminho();
  const [busca, setBusca] = useState(false);
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBusca(true);
      }
    };
    document.addEventListener("keydown", t);
    return () => document.removeEventListener("keydown", t);
  }, []);

  // cartas para hoje (o número ao lado de "Flashcards")
  useEffect(() => {
    let vivo = true;
    const ler = () =>
      api
        .get<{ baralhos: Baralho[] }>("/api/flashcards/baralhos")
        .then((r) => vivo && setPendentes(r.baralhos.reduce((s, b) => s + b.revisar + b.aprendendo, 0)))
        .catch(() => {});
    ler();
    window.addEventListener("resumo:estudou", ler);
    return () => {
      vivo = false;
      window.removeEventListener("resumo:estudou", ler);
    };
  }, []);

  if (!usuario) return null;
  const admin = usuario.papel === "admin";
  return (
    <div className="app">
      <aside className="lateral">
        <Link para="/" className="marca">
          <Logo />
          <span>{config.nome}</span>
        </Link>
        <ChamaOfensiva />
        <button type="button" className="lateral-busca" onClick={() => setBusca(true)}>
          <Icone nome="busca" tam={16} />
          <span>Buscar</span>
          <kbd>Ctrl K</kbd>
        </button>
        <nav aria-label="Principal">
          {ITENS.map((i) => (
            <Link key={i.para} para={i.para} className={"nav-item" + (i.ativo(caminho) ? " ativo" : "")} aria-current={i.ativo(caminho) ? "page" : undefined}>
              <Icone nome={i.icone} />
              <span>{i.nome}</span>
              {i.para === "/flashcards" && pendentes > 0 && <b className="nav-conta" title="Flashcards para revisar hoje">{pendentes}</b>}
              {i.para === "/pendencias" && pendencias.length > 0 && <b className="nav-conta nav-conta-pend" title="Conteúdos separados para estudar depois" data-testid="conta-pendencias">{pendencias.length}</b>}
            </Link>
          ))}
          {admin && (
            <>
              <div className="nav-rotulo">Administração</div>
              <Link para="/admin" className={"nav-item" + (caminho.startsWith("/admin") ? " ativo" : "")}>
                <Icone nome="admin" />
                <span>Painel</span>
              </Link>
            </>
          )}
        </nav>
        <div className="lateral-pe">
          <Link para="/conta" className={"conta-chip" + (caminho === "/conta" ? " ativo" : "")}>
            <span className="avatar">{usuario.nome.slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{usuario.nome}</strong>
              <small>Conta e senha</small>
            </span>
          </Link>
          <div className="lateral-acoes">
            <button type="button" className="botao-icone" onClick={alternarTema} title={tema === "dark" ? "Tema claro" : "Tema escuro"} aria-label="Alternar tema" data-testid="alternar-tema">
              <Icone nome={tema === "dark" ? "sol" : "lua"} />
            </button>
            <button type="button" className="botao-icone" onClick={sair} title="Sair" aria-label="Sair">
              <Icone nome="sair" />
            </button>
          </div>
        </div>
      </aside>

      <header className="topo-movel">
        <Link para="/" className="marca">
          <Logo tam={26} />
          <span>{config.nome}</span>
        </Link>
        <div>
          <ChamaOfensiva compacta />
          <button type="button" className="botao-icone" onClick={() => setBusca(true)} aria-label="Buscar">
            <Icone nome="busca" />
          </button>
          <button type="button" className="botao-icone" onClick={alternarTema} aria-label="Alternar tema">
            <Icone nome={tema === "dark" ? "sol" : "lua"} />
          </button>
          <Link para="/conta" className="botao-icone" aria-label="Conta">
            <Icone nome="usuario" />
          </Link>
        </div>
      </header>

      <main className="conteudo" id="conteudo">
        {children}
      </main>

      <nav className="abas-baixo" aria-label="Principal">
        {ITENS.map((i) => (
          <Link key={i.para} para={i.para} className={i.ativo(caminho) ? "ativo" : ""}>
            <Icone nome={i.icone} tam={20} />
            <span>{i.curto}</span>
            {i.para === "/flashcards" && pendentes > 0 && <b>{pendentes}</b>}
            {i.para === "/pendencias" && pendencias.length > 0 && <b className="pend">{pendencias.length}</b>}
          </Link>
        ))}
      </nav>
      {busca && <Busca aoFechar={() => setBusca(false)} />}
      <Espiada />
    </div>
  );
}
