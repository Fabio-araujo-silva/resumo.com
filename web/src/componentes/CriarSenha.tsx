// Primeiro acesso com senha gerada pelo administrador (ou depois de uma senha nova): antes de usar a
// plataforma, a pessoa cria a própria senha. A provisória circulou por mensagem e deixa de valer.
import { useState, type FormEvent } from "react";
import { api, mensagem, type Usuario } from "../lib/api";
import { useApp } from "../lib/loja";
import { Icone } from "./Icone";

export function CriarSenha() {
  const { usuario, definirUsuario, sair, avisar } = useApp();
  const [nova, setNova] = useState("");
  const [repetir, setRepetir] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  if (!usuario?.senhaProvisoria) return null;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    if (nova.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
    if (nova !== repetir) return setErro("As duas senhas não são iguais.");
    setEnviando(true);
    try {
      const r = await api.post<{ user: Usuario }>("/api/auth/senha", { nova });
      definirUsuario(r.user);
      avisar("Senha criada. A provisória não funciona mais.", "ok");
    } catch (err) {
      setErro(mensagem(err));
      setEnviando(false);
    }
  };

  return (
    <div className="modal-fundo criar-senha-fundo">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Crie a sua senha" data-testid="criar-senha">
        <header>
          <h2><Icone nome="chave" /> Crie a sua senha</h2>
        </header>
        <form className="modal-corpo" onSubmit={enviar}>
          <p className="sub">Olá, {usuario.nome.split(" ")[0]}. Você entrou com uma senha provisória. Escolha agora a sua: ela substitui a provisória, que deixa de funcionar.</p>
          {erro && <div className="alerta alerta-erro" role="alert">{erro}</div>}
          <label className="campo">
            <span>Senha nova (8 caracteres ou mais)</span>
            <input name="nova" type="password" autoComplete="new-password" autoFocus required minLength={8} value={nova} onChange={(e) => setNova(e.target.value)} />
          </label>
          <label className="campo">
            <span>Repita a senha</span>
            <input name="repetir" type="password" autoComplete="new-password" required value={repetir} onChange={(e) => setRepetir(e.target.value)} />
          </label>
          <div className="linha-botoes">
            <button className="botao primario" disabled={enviando}>{enviando ? "Salvando…" : "Salvar minha senha"}</button>
            <button type="button" className="botao fantasma" onClick={sair}>Sair</button>
          </div>
        </form>
      </div>
    </div>
  );
}
