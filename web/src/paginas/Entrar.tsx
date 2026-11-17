import { useState, type FormEvent } from "react";
import { mensagem } from "../lib/api";
import { useApp } from "../lib/loja";
import { Batimento, Icone, Logo } from "../componentes/Icone";

export function Entrar() {
  const { entrar, motivoSaida, config } = useApp();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await entrar(email, senha);
    } catch (err) {
      setErro(mensagem(err));
      setEnviando(false);
    }
  };

  return (
    <div className="entrar">
      <section className="entrar-capa" aria-hidden="true">
        <div className="entrar-capa-topo">
          <Logo tam={40} />
          <span>{config.nome}</span>
        </div>
        <div>
          <p className="olho">Resumos com IA · flashcards · modo prova</p>
          <h1>Cada ideia em uma nota. Todas as notas ligadas.</h1>
          <ul>
            <li><Icone nome="grafo" /> Resumos curtos em notas atômicas, conectadas por matéria</li>
            <li><Icone nome="prova" /> Modo prova: só o que é emergencial</li>
            <li><Icone nome="cartas" /> Flashcards com repetição espaçada, como no Anki</li>
          </ul>
        </div>
        <Batimento />
      </section>
      <section className="entrar-form">
        <form onSubmit={enviar}>
          <div className="entrar-marca-movel">
            <Logo tam={34} />
            <span>{config.nome}</span>
          </div>
          <h2>Entrar</h2>
          <p className="sub">Use o login da sua assinatura.</p>
          {motivoSaida && <div className="alerta alerta-info" role="status">{motivoSaida}</div>}
          {erro && <div className="alerta alerta-erro" role="alert">{erro}</div>}
          <label className="campo">
            <span>Login</span>
            <input name="email" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu e-mail ou usuário" />
          </label>
          <label className="campo">
            <span>Senha</span>
            <input name="senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
          </label>
          <button className="botao primario largo" disabled={enviando}>
            {enviando ? "Entrando…" : "Entrar"}
          </button>
          <p className="entrar-nota">
            <Icone nome="chave" tam={14} /> Esqueceu a senha? Peça uma nova ao administrador: você cria a sua ao entrar.
          </p>
          <p className="entrar-nota">
            <Icone nome="cadeado" tam={14} /> Acesso por assinatura. O conteúdo é pessoal e identificado com a sua conta.
          </p>
        </form>
      </section>
    </div>
  );
}
