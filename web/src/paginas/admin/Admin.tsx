// Painel do administrador: casca com as abas. Cada aba é um arquivo desta pasta.
import { useApp } from "../../lib/loja";
import { Link } from "../../lib/rota";
import { Icone } from "../../componentes/Icone";
import { Vazio } from "../../componentes/ui";
import { Acessos, Auditoria } from "./Acessos";
import { ConteudoLista, ConteudoMateria, EditorNota } from "./Conteudo";
import { Importar, Gerar } from "./Entrada";

const ABAS = [
  { para: "/admin/acessos", nome: "Acessos", icone: "usuarios" },
  { para: "/admin/conteudo", nome: "Conteúdo", icone: "livro" },
  { para: "/admin/importar", nome: "Importar", icone: "upload" },
  { para: "/admin/gerar", nome: "Gerar com o Claude", icone: "robo" },
  { para: "/admin/auditoria", nome: "Auditoria", icone: "olho" },
];

export function Admin({ caminho }: { caminho: string }) {
  const { usuario } = useApp();
  if (usuario?.papel !== "admin") return <div className="pagina"><Vazio icone="cadeado" titulo="Área do administrador">Sua conta não tem acesso a esta área.</Vazio></div>;
  const partes = caminho.split("/").filter(Boolean).map(decodeURIComponent); // ["admin", aba, ...]
  const aba = partes[1] || "acessos";
  let tela;
  if (aba === "acessos") tela = <Acessos />;
  else if (aba === "conteudo") tela = partes[2] ? <ConteudoMateria id={partes[2]} /> : <ConteudoLista />;
  else if (aba === "nota" && partes[2]) tela = <EditorNota key={partes.slice(2).join("/")} materia={partes[2]} slug={partes[3] === "nova" ? null : partes[3] || null} />;
  else if (aba === "importar") tela = <Importar />;
  else if (aba === "gerar") tela = <Gerar />;
  else if (aba === "auditoria") tela = <Auditoria />;
  else tela = <Vazio titulo="Página não encontrada" />;
  const ativa = aba === "nota" ? "conteudo" : aba;
  return (
    <div className="pagina pagina-admin">
      <header className="cabeca-pagina">
        <div>
          <p className="olho">Administração</p>
          <h1 className="titulo-pagina">Painel</h1>
        </div>
      </header>
      <nav className="abas abas-admin" aria-label="Seções do painel">
        {ABAS.map((a) => (
          <Link key={a.para} para={a.para} className={a.para.endsWith("/" + ativa) ? "ativa" : ""}>
            <Icone nome={a.icone} tam={16} /> {a.nome}
          </Link>
        ))}
      </nav>
      {tela}
    </div>
  );
}
