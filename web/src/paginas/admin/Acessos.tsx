// Acessos (logins dos amigos) e auditoria (quem abriu o quê, bloqueios, rastreio de vazamento).
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, mensagem } from "../../lib/api";
import { quando, useApp } from "../../lib/loja";
import { Icone } from "../../componentes/Icone";
import { Carregando, Modal, Selo } from "../../componentes/ui";

type UsuarioAdmin = {
  id: string; email: string; nome: string; papel: "admin" | "aluno"; ativo: boolean; expiraEm: number | null; acessoTotal: boolean; criadoEm: number;
  ultimoAcesso: number | null; etiqueta: string; materias: string[]; sessoes: number; lidas: number; revisoes: number;
};
type Form = { nome: string; email: string; papel: "admin" | "aluno"; validade: string; acessoTotal: boolean; materias: string[] };
const paraData = (ms: number | null) => (ms ? new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) : "");
const deData = (s: string) => (s ? new Date(s + "T23:59:59").getTime() : null);

function Credenciais({ login, senha, aoFechar }: { login: string; senha: string; aoFechar: () => void }) {
  const texto = `Login: ${login}\nSenha: ${senha}\nSite: ${location.origin}`;
  const [copiado, setCopiado] = useState(false);
  return (
    <Modal titulo="Acesso pronto" aoFechar={aoFechar}>
      <p>Mande estes dados para a pessoa. <strong>A senha só aparece agora</strong>; depois, só gerando outra.</p>
      <pre className="credenciais" data-testid="credenciais">{texto}</pre>
      <div className="linha-botoes">
        <button type="button" className="botao primario" onClick={() => navigator.clipboard.writeText(texto).then(() => setCopiado(true))}>
          <Icone nome={copiado ? "check" : "link"} tam={16} /> {copiado ? "Copiado" : "Copiar"}
        </button>
        <button type="button" className="botao fantasma" onClick={aoFechar}>Fechar</button>
      </div>
    </Modal>
  );
}

function FormUsuario({ inicial, aoSalvar, aoFechar }: { inicial: UsuarioAdmin | null; aoSalvar: (r: { usuario: UsuarioAdmin; senha: string | null }) => void; aoFechar: () => void }) {
  const { bib } = useApp();
  const [f, setF] = useState<Form>(() => ({
    nome: inicial?.nome || "", email: inicial?.email || "", papel: inicial?.papel || "aluno", validade: paraData(inicial?.expiraEm ?? null),
    acessoTotal: inicial ? inicial.acessoTotal : true, materias: inicial?.materias || [],
  }));
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    const corpo = { nome: f.nome, papel: f.papel, expiraEm: deData(f.validade), acessoTotal: f.acessoTotal, materias: f.materias };
    try {
      aoSalvar(inicial ? await api.patch("/api/admin/usuarios/" + inicial.id, corpo) : await api.post("/api/admin/usuarios", { ...corpo, email: f.email }));
    } catch (err) {
      setErro(mensagem(err));
      setSalvando(false);
    }
  };
  const alternar = (id: string) => setF((x) => ({ ...x, materias: x.materias.includes(id) ? x.materias.filter((m) => m !== id) : [...x.materias, id] }));
  return (
    <Modal titulo={inicial ? "Editar acesso" : "Novo acesso"} aoFechar={aoFechar}>
      <form onSubmit={enviar} className="form-coluna">
        {erro && <div className="alerta alerta-erro" role="alert">{erro}</div>}
        <label className="campo"><span>Nome</span><input name="nome" required autoFocus value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></label>
        <label className="campo">
          <span>Login (e-mail ou nome de usuário)</span>
          <input name="email" required disabled={!!inicial} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="amigo@email.com" />
        </label>
        <div className="grade-2">
          <label className="campo">
            <span>Tipo</span>
            <select value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value as Form["papel"] })}>
              <option value="aluno">Aluno</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
          <label className="campo"><span>Assinatura válida até (opcional)</span><input type="date" value={f.validade} onChange={(e) => setF({ ...f, validade: e.target.value })} /></label>
        </div>
        {f.papel === "aluno" && (
          <fieldset className="campo">
            <legend>Matérias liberadas</legend>
            <label className="marcar"><input type="checkbox" checked={f.acessoTotal} onChange={(e) => setF({ ...f, acessoTotal: e.target.checked })} /> Todas (inclusive as que forem criadas depois)</label>
            {!f.acessoTotal && (
              <div className="lista-marcar">
                {bib?.materias.map((m) => (
                  <label key={m.id} className="marcar"><input type="checkbox" checked={f.materias.includes(m.id)} onChange={() => alternar(m.id)} /> {m.nome} <small>{m.semestre}º</small></label>
                ))}
                {!bib?.materias.length && <small>Ainda não há matérias.</small>}
              </div>
            )}
          </fieldset>
        )}
        {!inicial && <p className="sub">A senha é gerada automaticamente e mostrada em seguida.</p>}
        <div className="linha-botoes">
          <button className="botao primario" disabled={salvando}>{inicial ? "Salvar" : "Criar acesso"}</button>
          <button type="button" className="botao fantasma" onClick={aoFechar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

export function Acessos() {
  const { usuario: eu, avisar, idx } = useApp();
  const [lista, setLista] = useState<UsuarioAdmin[] | null>(null);
  const [form, setForm] = useState<{ aberto: boolean; alvo: UsuarioAdmin | null }>({ aberto: false, alvo: null });
  const [cred, setCred] = useState<{ login: string; senha: string } | null>(null);

  const carregar = useCallback(() => api.get<{ usuarios: UsuarioAdmin[] }>("/api/admin/usuarios").then((r) => setLista(r.usuarios)).catch((e) => avisar(mensagem(e), "erro")), [avisar]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const mudar = async (u: UsuarioAdmin, corpo: Record<string, unknown>, ok: string) => {
    try {
      const r = await api.patch<{ senha: string | null }>("/api/admin/usuarios/" + u.id, corpo);
      if (r.senha) setCred({ login: u.email, senha: r.senha });
      else avisar(ok, "ok");
      carregar();
    } catch (e) {
      avisar(mensagem(e), "erro");
    }
  };
  const apagar = async (u: UsuarioAdmin) => {
    if (!confirm(`Apagar o acesso de ${u.nome}? O progresso de leitura e de flashcards dessa conta será perdido.`)) return;
    try {
      await api.del("/api/admin/usuarios/" + u.id);
      avisar("Acesso apagado.", "ok");
      carregar();
    } catch (e) {
      avisar(mensagem(e), "erro");
    }
  };

  if (!lista) return <Carregando />;
  const agora = Date.now();
  return (
    <section>
      <div className="barra-acoes">
        <p className="sub">{lista.filter((u) => u.papel === "aluno").length} assinante(s), {lista.filter((u) => u.papel === "admin").length} administrador(es). Só quem está nesta lista entra na plataforma.</p>
        <button type="button" className="botao primario" onClick={() => setForm({ aberto: true, alvo: null })}><Icone nome="mais" tam={16} /> Novo acesso</button>
      </div>
      <div className="tabela-rolagem">
        <table className="tabela-admin" data-testid="tabela-usuarios">
          <thead>
            <tr><th>Pessoa</th><th>Situação</th><th>Matérias</th><th>Uso</th><th>Último acesso</th><th /></tr>
          </thead>
          <tbody>
            {lista.map((u) => {
              const vencido = !!u.expiraEm && u.expiraEm < agora;
              return (
                <tr key={u.id} className={!u.ativo || vencido ? "apagado" : ""} data-usuario={u.email}>
                  <td>
                    <strong>{u.nome}</strong> {u.papel === "admin" && <Selo tipo="mapa">admin</Selo>}
                    <small>{u.email} · código <code>{u.etiqueta}</code></small>
                  </td>
                  <td>
                    {!u.ativo ? <Selo tipo="rascunho">desativado</Selo> : vencido ? <Selo tipo="rascunho">vencido</Selo> : <Selo tipo="neutro">ativo</Selo>}
                    {u.expiraEm && !vencido && <small>até {new Date(u.expiraEm).toLocaleDateString("pt-BR")}</small>}
                    {u.sessoes > 0 && <small>{u.sessoes} sessão(ões) aberta(s)</small>}
                  </td>
                  <td>{u.papel === "admin" || u.acessoTotal ? "Todas" : u.materias.length ? u.materias.map((m) => idx.materia.get(m)?.nome || m).join(", ") : <em>nenhuma</em>}</td>
                  <td><small>{u.lidas} nota(s) lida(s)</small><small>{u.revisoes} revisão(ões)</small></td>
                  <td>{quando(u.ultimoAcesso)}</td>
                  <td className="acoes">
                    <button type="button" className="botao-icone" title="Editar" aria-label={"Editar " + u.nome} onClick={() => setForm({ aberto: true, alvo: u })}><Icone nome="lapis" tam={16} /></button>
                    <button type="button" className="botao-icone" title="Gerar senha nova" aria-label={"Gerar senha nova para " + u.nome} onClick={() => confirm(`Gerar uma senha nova para ${u.nome}? A atual deixa de funcionar e os aparelhos conectados caem.`) && mudar(u, { novaSenha: true }, "")}><Icone nome="chave" tam={16} /></button>
                    {u.id !== eu?.id && (
                      <>
                        <button type="button" className="botao-icone" title={u.ativo ? "Desativar acesso" : "Reativar acesso"} aria-label={(u.ativo ? "Desativar " : "Reativar ") + u.nome} onClick={() => mudar(u, { ativo: !u.ativo }, u.ativo ? "Acesso desativado. A pessoa foi desconectada." : "Acesso reativado.")}>
                          <Icone nome={u.ativo ? "cadeado" : "check"} tam={16} />
                        </button>
                        {u.sessoes > 0 && <button type="button" className="botao-icone" title="Desconectar de todos os aparelhos" aria-label={"Desconectar " + u.nome} onClick={() => mudar(u, { encerrarSessoes: true }, "Sessões encerradas.")}><Icone nome="sair" tam={16} /></button>}
                        <button type="button" className="botao-icone perigo" title="Apagar" aria-label={"Apagar " + u.nome} onClick={() => apagar(u)}><Icone nome="lixo" tam={16} /></button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {form.aberto && (
        <FormUsuario
          inicial={form.alvo}
          aoFechar={() => setForm({ aberto: false, alvo: null })}
          aoSalvar={(r) => {
            setForm({ aberto: false, alvo: null });
            if (r.senha) setCred({ login: r.usuario.email, senha: r.senha });
            else avisar("Acesso atualizado.", "ok");
            carregar();
          }}
        />
      )}
      {cred && <Credenciais {...cred} aoFechar={() => setCred(null)} />}
    </section>
  );
}

type Aud = {
  porUsuario: { id: string; nome: string; email: string; ultimo_acesso: number | null; dia: number; semana: number; bloqueios: number }[];
  recentes: { em: number; tipo: string; ip: string | null; nota_id: string; nome: string; titulo: string | null }[];
};

export function Auditoria() {
  const { avisar } = useApp();
  const [dados, setDados] = useState<Aud | null>(null);
  const [texto, setTexto] = useState("");
  const [rastro, setRastro] = useState<{ etiquetas: string[]; usuarios: { nome: string; email: string }[] } | null>(null);
  useEffect(() => {
    api.get<Aud>("/api/admin/acessos").then(setDados).catch((e) => avisar(mensagem(e), "erro"));
  }, [avisar]);
  const rastrear = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setRastro(await api.post("/api/admin/rastrear", { texto }));
    } catch (err) {
      avisar(mensagem(err), "erro");
    }
  };
  if (!dados) return <Carregando />;
  return (
    <div className="colunas-admin">
      <section>
        <h2 className="titulo-secao">Uso por conta</h2>
        <p className="sub">Notas abertas. "Bloqueios" conta quantas vezes a conta bateu no teto de notas por tempo (sinal de cópia em massa).</p>
        <div className="tabela-rolagem">
          <table className="tabela-admin">
            <thead><tr><th>Conta</th><th>24 h</th><th>7 dias</th><th>Bloqueios (7 d)</th><th>Último acesso</th></tr></thead>
            <tbody>
              {dados.porUsuario.map((u) => (
                <tr key={u.id} className={u.bloqueios ? "alerta-linha" : ""}>
                  <td><strong>{u.nome}</strong><small>{u.email}</small></td>
                  <td>{u.dia}</td>
                  <td>{u.semana}</td>
                  <td>{u.bloqueios ? <Selo tipo="rascunho">{u.bloqueios}</Selo> : "0"}</td>
                  <td>{quando(u.ultimo_acesso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="titulo-secao">Rastrear um vazamento</h2>
        <p className="sub">Cole aqui o texto que apareceu fora da plataforma (ou digite o código que aparece na marca d'água de um print). As etiquetas invisíveis dizem de qual conta saiu.</p>
        <form onSubmit={rastrear} className="form-coluna">
          <textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cole o trecho ou o código da conta…" aria-label="Trecho vazado" />
          <div><button className="botao primario" disabled={!texto.trim()}><Icone nome="busca" tam={16} /> Rastrear</button></div>
        </form>
        {rastro && (
          <div className={"alerta " + (rastro.usuarios.length ? "alerta-erro" : "alerta-info")} data-testid="rastro">
            {rastro.usuarios.length ? <>Saiu da conta de: <strong>{rastro.usuarios.map((u) => `${u.nome} (${u.email})`).join(", ")}</strong></> : "Nenhuma etiqueta encontrada neste trecho (texto digitado à mão ou foto perdem a etiqueta invisível; em fotos, procure o código na marca d'água)."}
          </div>
        )}
      </section>
      <section>
        <h2 className="titulo-secao">Últimos acessos</h2>
        <ul className="lista-acessos">
          {dados.recentes.map((a, i) => (
            <li key={i} className={a.tipo === "bloqueio" ? "bloqueio" : ""}>
              <span><strong>{a.nome}</strong> {a.tipo === "bloqueio" ? "bateu no teto ao abrir" : a.tipo === "prova" ? "abriu o modo prova de" : "abriu"} <em>{a.titulo || a.nota_id.replace(/^prova:/, "")}</em></span>
              <small>{quando(a.em)}{a.ip ? " · " + a.ip : ""}</small>
            </li>
          ))}
          {!dados.recentes.length && <li><small>Nenhum acesso ainda.</small></li>}
        </ul>
      </section>
    </div>
  );
}
