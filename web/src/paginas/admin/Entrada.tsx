// Entrada de conteúdo: importar um pacote (.zip), subir um PDF pronto, tokens de API, e a geração
// de resumos com o Claude Code local a partir dos materiais da matéria.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, ErroApi, mensagem } from "../../lib/api";
import { quando, useApp } from "../../lib/loja";
import { Link } from "../../lib/rota";
import { Icone } from "../../componentes/Icone";
import { Carregando, Selo } from "../../componentes/ui";

type Item = { onde: string; msg: string };
type Validacao = {
  ok: boolean; erros: Item[]; avisos: Item[]; materia: { slug: string; nome: string; semestre: number }; materiaExiste: boolean;
  resumo: { modulos: number; notas: number; notasDeProva: number; flashcards: number; questoes: number; anexos: number; palavras: number };
  notas: { titulo: string; modulo: string; prova: boolean; palavras: number; flashcards: number; nova: boolean }[];
};
type Importado = { criadas: string[]; atualizadas: string[]; removidas: string[]; iguais: number; flashcards: number; materia: string };

function Problemas({ erros, avisos }: { erros: Item[]; avisos: Item[] }) {
  if (!erros.length && !avisos.length) return null;
  return (
    <ul className="problemas">
      {erros.map((e, i) => <li key={"e" + i} className="erro"><b>Erro</b> <code>{e.onde}</code> {e.msg}</li>)}
      {avisos.map((a, i) => <li key={"a" + i} className="aviso-item"><b>Aviso</b> <code>{a.onde}</code> {a.msg}</li>)}
    </ul>
  );
}

function ImportarPacote() {
  const { avisar, recarregar } = useApp();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [v, setV] = useState<Validacao | null>(null);
  const [feito, setFeito] = useState<Importado | null>(null);
  const [modo, setModo] = useState("mesclar");
  const [rascunho, setRascunho] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [sobre, setSobre] = useState(false);

  const escolher = async (f: File | null) => {
    setArquivo(f);
    setV(null);
    setFeito(null);
    if (!f) return;
    setOcupado(true);
    try {
      const form = new FormData();
      form.append("arquivo", f);
      setV(await api.post<Validacao>("/api/admin/validar", form));
    } catch (e) {
      avisar(mensagem(e), "erro");
      setArquivo(null);
    }
    setOcupado(false);
  };
  const importar = async () => {
    if (!arquivo) return;
    if (modo === "substituir" && !confirm("Substituir apaga da matéria as notas que não estão neste pacote. Continuar?")) return;
    setOcupado(true);
    try {
      const form = new FormData();
      form.append("modo", modo);
      form.append("rascunho", rascunho ? "1" : "0");
      form.append("arquivo", arquivo);
      const r = await api.post<{ importado: Importado }>("/api/admin/importar", form);
      setFeito(r.importado);
      setV(null);
      setArquivo(null);
      await recarregar();
    } catch (e) {
      const d = e instanceof ErroApi ? (e.dados as { erros?: Item[]; avisos?: Item[] }) : {};
      if (d.erros && v) setV({ ...v, ok: false, erros: d.erros, avisos: d.avisos || [] });
      avisar(mensagem(e), "erro");
    }
    setOcupado(false);
  };

  return (
    <section className="cartao">
      <h2 className="titulo-secao"><Icone nome="upload" tam={17} /> Pacote de resumos (.zip)</h2>
      <p className="sub">O pacote é uma pasta de notas em Markdown (o formato universal do Sinapse, descrito em <code>FORMATO.md</code>) compactada em .zip. É o que o Claude produz.</p>
      <label
        className={"soltar" + (sobre ? " sobre" : "")}
        onDragOver={(e) => { e.preventDefault(); setSobre(true); }}
        onDragLeave={() => setSobre(false)}
        onDrop={(e) => { e.preventDefault(); setSobre(false); escolher(e.dataTransfer.files[0] || null); }}
      >
        <input type="file" accept=".zip,application/zip" onChange={(e) => escolher(e.target.files?.[0] || null)} data-testid="arquivo-pacote" />
        <Icone nome="upload" tam={26} />
        <strong>{arquivo ? arquivo.name : "Solte o .zip aqui ou clique para escolher"}</strong>
        <small>Nada é publicado antes de você conferir o relatório.</small>
      </label>
      {ocupado && <Carregando texto="Conferindo o pacote…" />}

      {v && (
        <div className="relatorio" data-testid="relatorio">
          <div className={"alerta " + (v.ok ? "alerta-ok" : "alerta-erro")}>
            {v.ok ? <>Pacote válido{v.avisos.length ? ` com ${v.avisos.length} aviso(s)` : ""}.</> : <>Pacote com {v.erros.length} erro(s): corrija e envie de novo.</>}
          </div>
          <div className="relatorio-topo">
            <div>
              <span className="rotulo">{v.materiaExiste ? "Vai acrescentar a" : "Vai criar a matéria"}</span>
              <strong>{v.materia.nome || "?"}</strong> <small>{v.materia.semestre || "?"}º semestre · <code>{v.materia.slug}</code></small>
            </div>
            <div className="selos">
              <Selo tipo="neutro">{v.resumo.modulos} módulos</Selo>
              <Selo tipo="neutro">{v.resumo.notas} notas</Selo>
              <Selo tipo="prova">{v.resumo.notasDeProva} de prova</Selo>
              <Selo tipo="neutro">{v.resumo.flashcards} flashcards</Selo>
              <Selo tipo="neutro">{v.resumo.questoes} questões</Selo>
            </div>
          </div>
          <Problemas erros={v.erros} avisos={v.avisos} />
          <details>
            <summary>Notas do pacote ({v.notas.length})</summary>
            <ul className="lista-compacta">
              {v.notas.map((n) => (
                <li key={n.titulo}><span>{n.titulo} {n.prova && <Selo tipo="prova">prova</Selo>}</span><small>{n.nova ? "nova" : "atualiza"} · {n.palavras} palavras · {n.flashcards} cartas</small></li>
              ))}
            </ul>
          </details>
          {v.ok && (
            <div className="opcoes-importar">
              <label className="marcar"><input type="radio" name="modo" checked={modo === "mesclar"} onChange={() => setModo("mesclar")} /> <span><strong>Acrescentar e atualizar</strong> <small>nada do que já existe é apagado</small></span></label>
              <label className="marcar"><input type="radio" name="modo" checked={modo === "substituir"} onChange={() => setModo("substituir")} /> <span><strong>Substituir a matéria</strong> <small>notas fora do pacote são apagadas</small></span></label>
              <label className="marcar"><input type="checkbox" checked={rascunho} onChange={(e) => setRascunho(e.target.checked)} /> <span><strong>Entrar como rascunho</strong> <small>só você vê até publicar</small></span></label>
              <button type="button" className="botao primario" onClick={importar} disabled={ocupado} data-testid="confirmar-importar"><Icone nome="check" tam={16} /> Publicar pacote</button>
            </div>
          )}
        </div>
      )}
      {feito && (
        <div className="alerta alerta-ok" data-testid="importado">
          Pronto: {feito.criadas.length} nota(s) nova(s), {feito.atualizadas.length} atualizada(s), {feito.removidas.length} removida(s), {feito.flashcards} flashcard(s). <Link para={"/materia/" + feito.materia}>Abrir a matéria</Link> · <Link para={"/admin/conteudo/" + feito.materia}>marcar conteúdo de prova</Link>
        </div>
      )}
    </section>
  );
}

function PdfDireto() {
  const { bib, avisar, recarregar, idx } = useApp();
  const [f, setF] = useState({ materia: "", modulo: "", titulo: "", resumo: "", prova: false });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [feito, setFeito] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!arquivo) return;
    setOcupado(true);
    try {
      const form = new FormData();
      form.append("materia", f.materia);
      form.append("modulo", f.modulo);
      form.append("titulo", f.titulo);
      form.append("resumo", f.resumo);
      form.append("prova", f.prova ? "1" : "0");
      form.append("arquivo", arquivo);
      const r = await api.post<{ id: string }>("/api/admin/pdf", form);
      setFeito(r.id);
      setArquivo(null);
      if (campo.current) campo.current.value = "";
      setF({ ...f, titulo: "", resumo: "" });
      await recarregar();
    } catch (err) {
      avisar(mensagem(err), "erro");
    }
    setOcupado(false);
  };
  const modulos = f.materia ? (idx.modulosDe.get(f.materia) || []).map((m) => m.titulo) : [];
  return (
    <section className="cartao">
      <h2 className="titulo-secao"><Icone nome="pdf" tam={17} /> PDF direto</h2>
      <p className="sub">Para um resumo que já existe em PDF. Ele vira uma nota de leitura: abre dentro da plataforma, página a página, sem botão de baixar.</p>
      {!bib?.materias.length ? (
        <p className="sub">Crie uma matéria em <Link para="/admin/conteudo">Conteúdo</Link> antes de subir um PDF.</p>
      ) : (
        <form onSubmit={enviar} className="form-coluna">
          <div className="grade-2">
            <label className="campo">
              <span>Matéria</span>
              <select name="materia" required value={f.materia} onChange={(e) => setF({ ...f, materia: e.target.value })}>
                <option value="">Escolha…</option>
                {bib.materias.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>Módulo</span>
              <input name="modulo" required list="modulos-pdf" value={f.modulo} onChange={(e) => setF({ ...f, modulo: e.target.value })} placeholder="Existente ou novo" />
              <datalist id="modulos-pdf">{modulos.map((m) => <option key={m} value={m} />)}</datalist>
            </label>
          </div>
          <label className="campo"><span>Título</span><input name="titulo" required value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></label>
          <label className="campo"><span>Resumo (uma frase)</span><input name="resumo" value={f.resumo} onChange={(e) => setF({ ...f, resumo: e.target.value })} /></label>
          <label className="campo"><span>Arquivo PDF</span><input ref={campo} type="file" accept="application/pdf,.pdf" required onChange={(e) => setArquivo(e.target.files?.[0] || null)} data-testid="arquivo-pdf" /></label>
          <label className="marcar"><input type="checkbox" checked={f.prova} onChange={(e) => setF({ ...f, prova: e.target.checked })} /> Conteúdo de prova</label>
          <div><button className="botao primario" disabled={ocupado || !arquivo}>{ocupado ? "Enviando…" : "Publicar PDF"}</button></div>
          {feito && <div className="alerta alerta-ok" data-testid="pdf-publicado">PDF publicado. <Link para={"/nota/" + feito}>Abrir no leitor</Link></div>}
        </form>
      )}
    </section>
  );
}

function Tokens() {
  const { avisar } = useApp();
  const [tokens, setTokens] = useState<{ id: string; nome: string; criadoEm: number; ultimoUso: number | null }[]>([]);
  const [novo, setNovo] = useState<string | null>(null);
  const carregar = useCallback(() => api.get<{ tokens: typeof tokens }>("/api/admin/tokens").then((r) => setTokens(r.tokens)).catch(() => {}), []);
  useEffect(() => {
    carregar();
  }, [carregar]);
  const criar = async () => {
    const nome = prompt("Nome do token (ex.: notebook, Claude):");
    if (!nome) return;
    try {
      const r = await api.post<{ token: string }>("/api/admin/tokens", { nome });
      setNovo(r.token);
      carregar();
    } catch (e) {
      avisar(mensagem(e), "erro");
    }
  };
  return (
    <section className="cartao">
      <h2 className="titulo-secao"><Icone nome="chave" tam={17} /> Tokens de API</h2>
      <p className="sub">Para publicar de fora do navegador: outra instância do Claude, ou a linha de comando no seu computador mandando para o site hospedado.</p>
      <pre className="credenciais">node server/cli.js importar &lt;pasta-do-pacote&gt; --url {location.origin} --token SEU_TOKEN</pre>
      {novo && <div className="alerta alerta-ok">Token criado. Copie agora; ele não aparece de novo:<pre className="credenciais" data-testid="token-novo">{novo}</pre></div>}
      <ul className="lista-compacta">
        {tokens.map((t) => (
          <li key={t.id}>
            <span><strong>{t.nome}</strong></span>
            <small>criado {quando(t.criadoEm)} · {t.ultimoUso ? "usado " + quando(t.ultimoUso) : "nunca usado"}</small>
            <button type="button" className="botao-icone perigo" aria-label={"Revogar " + t.nome} title="Revogar" onClick={() => api.del("/api/admin/tokens/" + t.id).then(carregar)}><Icone nome="lixo" tam={15} /></button>
          </li>
        ))}
      </ul>
      <button type="button" className="botao fantasma" onClick={criar}><Icone nome="mais" tam={16} /> Criar token</button>
    </section>
  );
}

export function Importar() {
  return (
    <div className="pilha">
      <ImportarPacote />
      <div className="colunas-admin">
        <PdfDireto />
        <Tokens />
      </div>
    </div>
  );
}

// ---------- geração com o Claude ----------
type Geracao = {
  id: string; materia: string; status: string; criadoEm: number; terminouEm: number | null; log?: string;
  pedido: { nome: string; semestre: number; conteudosProva: string; instrucoes: string; rascunho: boolean; materiais: string[] };
  resultado: { erro?: string; resumo?: { notas: number; flashcards: number; notasDeProva: number; modulos: number }; importado?: Importado; avisos?: number } | null;
};
const ROTULO: Record<string, string> = { preparando: "Preparando", gerando: "O Claude está escrevendo", validando: "Validando", corrigindo: "O Claude está corrigindo", importando: "Publicando", concluida: "Concluída", erro: "Falhou", cancelada: "Cancelada" };
const rodando = (s: string) => !["concluida", "erro", "cancelada"].includes(s);

export function Gerar() {
  const { bib, avisar, recarregar } = useApp();
  const [claude, setClaude] = useState<{ disponivel: boolean; versao: string | null; bin: string } | null>(null);
  const [lista, setLista] = useState<Geracao[]>([]);
  const [aberta, setAberta] = useState<Geracao | null>(null);
  const [f, setF] = useState({ materia: "", nome: "", semestre: "", conteudosProva: "", instrucoes: "", rascunho: true });
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const fimLog = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  const listar = useCallback(() => api.get<{ geracoes: Geracao[] }>("/api/admin/geracoes").then((r) => setLista(r.geracoes)).catch(() => {}), []);
  useEffect(() => {
    api.get<typeof claude>("/api/admin/claude").then(setClaude).catch(() => {});
    listar();
  }, [listar]);

  // acompanha a geração aberta enquanto ela roda
  const idAberta = aberta?.id;
  const statusAberta = aberta?.status;
  useEffect(() => {
    if (!idAberta || !statusAberta || !rodando(statusAberta)) return;
    const t = setInterval(async () => {
      try {
        const r = await api.get<{ geracao: Geracao }>("/api/admin/geracoes/" + idAberta);
        setAberta(r.geracao);
        if (!rodando(r.geracao.status)) {
          listar();
          recarregar();
          avisar(r.geracao.status === "concluida" ? "Resumo gerado e publicado." : "A geração não terminou: veja o registro.", r.geracao.status === "concluida" ? "ok" : "erro");
        }
      } catch {}
    }, 1500);
    return () => clearInterval(t);
  }, [idAberta, statusAberta, listar, recarregar, avisar]);
  useEffect(() => {
    fimLog.current?.scrollIntoView({ block: "nearest" });
  }, [aberta?.log]);

  const abrir = (id: string) => api.get<{ geracao: Geracao }>("/api/admin/geracoes/" + id).then((r) => setAberta(r.geracao)).catch((e) => avisar(mensagem(e), "erro"));
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!arquivos.length) return avisar("Adicione pelo menos um material.", "erro");
    setEnviando(true);
    try {
      const form = new FormData();
      if (f.materia) form.append("materia", f.materia);
      else {
        form.append("nome", f.nome);
        form.append("semestre", f.semestre);
      }
      form.append("conteudosProva", f.conteudosProva);
      form.append("instrucoes", f.instrucoes);
      form.append("rascunho", f.rascunho ? "1" : "0");
      for (const a of arquivos) form.append("materiais", a);
      const r = await api.post<{ id: string }>("/api/admin/geracoes", form);
      setArquivos([]);
      if (campo.current) campo.current.value = "";
      await listar();
      await abrir(r.id);
    } catch (err) {
      avisar(mensagem(err), "erro");
    }
    setEnviando(false);
  };
  const tamanho = arquivos.reduce((s, a) => s + a.size, 0);

  return (
    <div className="colunas-admin colunas-gerar">
      <section className="cartao">
        <h2 className="titulo-secao"><Icone nome="robo" tam={17} /> Novo resumo a partir dos materiais</h2>
        <p className="sub">Você entrega os PDFs e slides da matéria e diz o que cai na prova. O servidor abre uma instância do Claude Code neste computador, ela escreve o resumo no padrão do Sinapse, o validador confere e o resultado entra no site.</p>
        {claude && (
          <div className={"alerta " + (claude.disponivel ? "alerta-ok" : "alerta-erro")} data-testid="claude-status">
            {claude.disponivel ? <>Claude Code encontrado: <code>{claude.versao}</code></> : <>Não encontrei o Claude Code (<code>{claude.bin}</code>) no computador onde o servidor roda. Rode o Sinapse na sua máquina, ou gere pela linha de comando e envie com um token.</>}
          </div>
        )}
        <form onSubmit={enviar} className="form-coluna">
          <label className="campo">
            <span>Matéria</span>
            <select name="materia" value={f.materia} onChange={(e) => setF({ ...f, materia: e.target.value })}>
              <option value="">Nova matéria…</option>
              {bib?.materias.map((m) => <option key={m.id} value={m.id}>{m.nome} (acrescentar)</option>)}
            </select>
          </label>
          {!f.materia && (
            <div className="grade-2">
              <label className="campo"><span>Nome da matéria</span><input name="nome" required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></label>
              <label className="campo"><span>Semestre</span><input name="semestre" required type="number" min={1} max={14} value={f.semestre} onChange={(e) => setF({ ...f, semestre: e.target.value })} /></label>
            </div>
          )}
          <label className="campo">
            <span>Materiais (PDF, PPTX, DOCX, TXT): quantos quiser</span>
            <input ref={campo} type="file" multiple accept=".pdf,.pptx,.docx,.txt,.md" onChange={(e) => setArquivos([...(e.target.files || [])])} data-testid="arquivos-materiais" />
          </label>
          {arquivos.length > 0 && (
            <ul className="lista-compacta">
              {arquivos.map((a) => <li key={a.name}><span>{a.name}</span><small>{(a.size / 1048576).toFixed(1)} MB</small></li>)}
              <li><span><strong>{arquivos.length} arquivo(s)</strong></span><small>{(tamanho / 1048576).toFixed(1)} MB</small></li>
            </ul>
          )}
          <label className="campo">
            <span><Icone nome="prova" tam={14} /> Conteúdos de prova</span>
            <textarea name="conteudosProva" rows={3} value={f.conteudosProva} onChange={(e) => setF({ ...f, conteudosProva: e.target.value })} placeholder="O que o professor disse que cai. Essas notas saem marcadas como prova, com o bloco 'essencial'." />
          </label>
          <label className="campo">
            <span>Instruções extras (opcional)</span>
            <textarea name="instrucoes" rows={2} value={f.instrucoes} onChange={(e) => setF({ ...f, instrucoes: e.target.value })} placeholder="Ex.: ignore a aula 3; dê ênfase às tabelas de classificação." />
          </label>
          <label className="marcar"><input type="checkbox" checked={f.rascunho} onChange={(e) => setF({ ...f, rascunho: e.target.checked })} /> <span><strong>Revisar antes de publicar</strong> <small>entra como rascunho; você publica em Conteúdo</small></span></label>
          <div><button className="botao primario" disabled={enviando || claude?.disponivel === false} data-testid="iniciar-geracao"><Icone nome="robo" tam={16} /> {enviando ? "Enviando materiais…" : "Gerar resumo"}</button></div>
        </form>
      </section>

      <section className="pilha">
        {aberta && (
          <div className="cartao geracao-aberta" data-testid="geracao" data-status={aberta.status}>
            <div className="barra-acoes">
              <h2 className="titulo-secao">{aberta.pedido.nome}</h2>
              <span className={"estado estado-" + aberta.status}>{rodando(aberta.status) && <i className="pulso-carga" />}{ROTULO[aberta.status] || aberta.status}</span>
            </div>
            <p className="sub">{aberta.pedido.materiais.length} material(is) · iniciada {quando(aberta.criadoEm)}</p>
            <pre className="log" data-testid="log-geracao">{aberta.log || "Aguardando…"}<div ref={fimLog} /></pre>
            {aberta.resultado?.resumo && (
              <div className="alerta alerta-ok">
                {aberta.resultado.resumo.modulos} módulo(s), {aberta.resultado.resumo.notas} nota(s) ({aberta.resultado.resumo.notasDeProva} de prova), {aberta.resultado.resumo.flashcards} flashcard(s){aberta.pedido.rascunho ? ", como rascunho" : ""}. <Link para={"/admin/conteudo/" + aberta.materia}>Revisar e publicar</Link>
              </div>
            )}
            {rodando(aberta.status) && <button type="button" className="botao fantasma" onClick={() => api.post(`/api/admin/geracoes/${aberta.id}/cancelar`).catch((e) => avisar(mensagem(e), "erro"))}>Cancelar</button>}
          </div>
        )}
        <div className="cartao">
          <h2 className="titulo-secao">Gerações</h2>
          {!lista.length && <p className="sub">Nenhuma geração ainda.</p>}
          <ul className="lista-compacta lista-geracoes">
            {lista.map((g) => (
              <li key={g.id}>
                <button type="button" onClick={() => abrir(g.id)}>
                  <span><strong>{g.pedido.nome}</strong> <small>{g.pedido.materiais.length} material(is) · {quando(g.criadoEm)}</small></span>
                  <span className={"estado estado-" + g.status}>{ROTULO[g.status] || g.status}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
