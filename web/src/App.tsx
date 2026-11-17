import { useEffect } from "react";
import { useApp } from "./lib/loja";
import { ir, useCaminho } from "./lib/rota";
import { ativarProtecao, MarcaDagua } from "./lib/protecao";
import { Layout } from "./componentes/Layout";
import { Avisos, Vazio } from "./componentes/ui";
import { Icone, Logo } from "./componentes/Icone";
import { Entrar } from "./paginas/Entrar";
import { Inicio } from "./paginas/Inicio";
import { Estante, PaginaMateria } from "./paginas/Estante";
import { Notas } from "./paginas/Notas";
import { PaginaNota } from "./paginas/Nota";
import { ProvaLista, ProvaMateria } from "./paginas/Prova";
import { Baralhos, Estudo } from "./paginas/Flashcards";
import { Conta } from "./paginas/Conta";
import { Admin } from "./paginas/admin/Admin";

function Tela({ caminho }: { caminho: string }) {
  const p = caminho.split("/").filter(Boolean).map((x) => {
    try {
      return decodeURIComponent(x);
    } catch {
      return x;
    }
  });
  if (!p.length) return <Inicio />;
  if (p[0] === "estante") return <Estante />;
  if (p[0] === "materia" && p[1]) return <PaginaMateria id={p[1]} />;
  if (p[0] === "notas") return <Notas />;
  if (p[0] === "nota" && p[1] && p[2]) return <PaginaNota key={p[1] + "/" + p[2]} id={p[1] + "/" + p[2]} />;
  if (p[0] === "prova") return p[1] ? <ProvaMateria id={p[1]} /> : <ProvaLista />;
  if (p[0] === "flashcards") return p[1] ? <Estudo materia={p[1]} /> : <Baralhos />;
  if (p[0] === "conta") return <Conta />;
  if (p[0] === "admin") return <Admin caminho={caminho} />;
  return (
    <div className="pagina">
      <Vazio titulo="Página não encontrada">O endereço não existe. Volte para o início pelo menu.</Vazio>
    </div>
  );
}

export function App() {
  const { usuario, tema, config, avisos } = useApp();
  const caminho = useCaminho();
  const aluno = !!usuario && usuario.papel !== "admin";

  useEffect(() => {
    document.title = config.nome;
  }, [config.nome]);
  useEffect(() => {
    if (usuario && caminho === "/entrar") ir("/", { trocar: true });
  }, [usuario, caminho]);
  // proteção do conteúdo: só para contas de aluno (o admin precisa copiar, colar e inspecionar)
  useEffect(() => {
    if (!aluno) return;
    return ativarProtecao(config.protecao.desfocar);
  }, [aluno, config.protecao.desfocar]);

  if (usuario === undefined)
    return (
      <div className="abertura">
        <Logo tam={52} />
      </div>
    );
  if (!usuario)
    return (
      <>
        <Entrar />
        <Avisos avisos={avisos} />
      </>
    );
  return (
    <>
      <Layout>
        <Tela caminho={caminho} />
      </Layout>
      {aluno && (
        <>
          <MarcaDagua usuario={usuario} tema={tema} />
          <div className="cortina" aria-hidden="true">
            <Icone nome="cadeado" tam={30} />
            <strong>Conteúdo oculto</strong>
            <span>Volte para esta janela para continuar lendo.</span>
          </div>
        </>
      )}
      <Avisos avisos={avisos} />
    </>
  );
}
