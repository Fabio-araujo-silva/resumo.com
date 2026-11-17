import { useState, type FormEvent } from "react";
import { api, mensagem } from "../lib/api";
import { useApp } from "../lib/loja";
import { Link } from "../lib/rota";
import { Icone } from "../componentes/Icone";

export function Conta() {
  const { usuario, tema, alternarTema, sair, avisar } = useApp();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [erro, setErro] = useState("");
  if (!usuario) return null;
  const admin = usuario.papel === "admin";

  const trocar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    try {
      await api.post("/api/auth/senha", { atual, nova });
      setAtual("");
      setNova("");
      avisar("Senha trocada. Os outros aparelhos foram desconectados.", "ok");
    } catch (err) {
      setErro(mensagem(err));
    }
  };

  return (
    <div className="pagina pagina-estreita">
      <header className="cabeca-pagina">
        <div>
          <p className="olho">Conta</p>
          <h1 className="titulo-pagina">{usuario.nome}</h1>
          <p className="sub">{usuario.email} · {admin ? "Administrador" : "Aluno"}{usuario.expiraEm ? ` · acesso até ${new Date(usuario.expiraEm).toLocaleDateString("pt-BR")}` : ""}</p>
        </div>
      </header>

      {admin && (
        <Link para="/admin" className="cartao cartao-linha">
          <Icone nome="admin" />
          <span><strong>Painel do administrador</strong><small>Acessos, conteúdo, importação e geração de resumos</small></span>
          <Icone nome="direita" tam={16} />
        </Link>
      )}

      <section className="cartao">
        <h2 className="titulo-secao">Aparência</h2>
        <div className="linha-opcao">
          <span><strong>Tema {tema === "dark" ? "escuro" : "claro"}</strong><small>O escuro é o padrão; o claro é opcional.</small></span>
          <button type="button" className="botao fantasma" onClick={alternarTema}>
            <Icone nome={tema === "dark" ? "sol" : "lua"} tam={16} /> Usar tema {tema === "dark" ? "claro" : "escuro"}
          </button>
        </div>
      </section>

      <section className="cartao">
        <h2 className="titulo-secao">Trocar senha</h2>
        <form onSubmit={trocar} className="form-coluna">
          {erro && <div className="alerta alerta-erro" role="alert">{erro}</div>}
          <label className="campo"><span>Senha atual</span><input type="password" autoComplete="current-password" required value={atual} onChange={(e) => setAtual(e.target.value)} /></label>
          <label className="campo"><span>Senha nova (8 caracteres ou mais)</span><input type="password" autoComplete="new-password" required minLength={8} value={nova} onChange={(e) => setNova(e.target.value)} /></label>
          <div><button className="botao primario">Trocar senha</button></div>
        </form>
      </section>

      {!admin && (
        <section className="cartao">
          <h2 className="titulo-secao"><Icone nome="cadeado" tam={16} /> Seu acesso é pessoal</h2>
          <ul className="lista-simples">
            <li>O conteúdo aparece com o seu nome e o código <code>{usuario.etiqueta}</code> em marca d'água, visível e invisível.</li>
            <li>A conta fica aberta em um aparelho por vez: entrar em outro encerra a sessão anterior.</li>
            <li>Copiar, imprimir e baixar estão desativados. Se um trecho aparecer fora daqui, ele aponta para a conta de onde saiu.</li>
          </ul>
        </section>
      )}

      <button type="button" className="botao fantasma" onClick={sair}><Icone nome="sair" tam={16} /> Sair</button>
    </div>
  );
}
