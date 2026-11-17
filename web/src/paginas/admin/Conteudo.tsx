// Conteúdo: matérias, notas (com a marcação de "conteúdo de prova") e o editor de uma nota.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, mensagem } from "../../lib/api";
import { quando, useApp } from "../../lib/loja";
import { Link, ir } from "../../lib/rota";
import { ConteudoNota } from "../../componentes/ConteudoNota";
import { Icone } from "../../componentes/Icone";
import { Carregando, Selo, Vazio } from "../../componentes/ui";

type MateriaAdmin = { id: string; nome: string; semestre: number; eixo: string; descricao: string; cor: string; provaData: string | null; provaFoco: string; atualizadoEm: number; notas: number; deProva: number; rascunhos: number; flashcards: number };
type NotaAdmin = { id: string; slug: string; titulo: string; resumo: string; prova: boolean; prioridade: number; publicada: boolean; minutos: number; pdf: boolean; modulo: string; cards: number; atualizado_em: number };

export function ConteudoLista() {
  const { avisar, recarregar } = useApp();
  const [lista, setLista] = useState<MateriaAdmin[] | null>(null);
  const [nova, setNova] = useState({ nome: "", semestre: "" });
  const carregar = useCallback(() => api.get<{ materias: MateriaAdmin[] }>("/api/admin/materias").then((r) => setLista(r.materias)).catch((e) => avisar(mensagem(e), "erro")), [avisar]);
  useEffect(() => {
    carregar();
  }, [carregar]);
  const criar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api.post<{ id: string }>("/api/admin/materias", { nome: nova.nome, semestre: Number(nova.semestre) });
      await recarregar();
      ir("/admin/conteudo/" + r.id);
    } catch (err) {
      avisar(mensagem(err), "erro");
    }
  };
  if (!lista) return <Carregando />;
  return (
    <section>
      {!lista.length && <Vazio titulo="Nenhuma matéria ainda">Importe um pacote, gere um resumo com o Claude ou crie uma matéria vazia abaixo.</Vazio>}
      <div className="grade-materias-admin">
        {lista.map((m) => (
          <Link key={m.id} para={"/admin/conteudo/" + m.id} className="cartao cartao-materia-admin" data-materia={m.id}>
            <span className="rotulo">{m.semestre}º semestre</span>
            <h3>{m.nome}</h3>
            <div className="selos">
              <Selo tipo="neutro">{m.notas} notas</Selo>
              <Selo tipo="prova">{m.deProva} de prova</Selo>
              <Selo tipo="neutro">{m.flashcards} cartas</Selo>
              {m.rascunhos > 0 && <Selo tipo="rascunho">{m.rascunhos} rascunho(s)</Selo>}
            </div>
            <small>{m.provaData ? "Prova em " + m.provaData.split("-").reverse().join("/") : "Sem data de prova"} · atualizada {quando(m.atualizadoEm)}</small>
          </Link>
        ))}
      </div>
      <form className="cartao form-linha" onSubmit={criar}>
        <strong>Nova matéria</strong>
        <input required placeholder="Nome" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} aria-label="Nome da matéria" />
        <input required type="number" min={1} max={14} placeholder="Semestre" value={nova.semestre} onChange={(e) => setNova({ ...nova, semestre: e.target.value })} aria-label="Semestre" />
        <button className="botao fantasma"><Icone nome="mais" tam={16} /> Criar</button>
      </form>
    </section>
  );
}

export function ConteudoMateria({ id }: { id: string }) {
  const { avisar, recarregar } = useApp();
  const [m, setM] = useState<MateriaAdmin | null | undefined>(undefined);
  const [notas, setNotas] = useState<NotaAdmin[]>([]);
  const [f, setF] = useState({ nome: "", semestre: "", eixo: "", descricao: "", cor: "", provaData: "", provaFoco: "" });

  const carregar = useCallback(async () => {
    try {
      const [ms, ns] = await Promise.all([api.get<{ materias: MateriaAdmin[] }>("/api/admin/materias"), api.get<{ notas: NotaAdmin[] }>(`/api/admin/materias/${id}/notas`)]);
      const achada = ms.materias.find((x) => x.id === id) || null;
      setM(achada);
      setNotas(ns.notas);
      if (achada) setF({ nome: achada.nome, semestre: String(achada.semestre), eixo: achada.eixo, descricao: achada.descricao, cor: achada.cor, provaData: achada.provaData || "", provaFoco: achada.provaFoco });
    } catch (e) {
      avisar(mensagem(e), "erro");
    }
  }, [id, avisar]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const depois = async (texto?: string) => {
    if (texto) avisar(texto, "ok");
    await Promise.all([carregar(), recarregar()]);
  };
  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.patch("/api/admin/materias/" + id, { ...f, semestre: Number(f.semestre), provaData: f.provaData || null });
      depois("Matéria salva.");
    } catch (err) {
      avisar(mensagem(err), "erro");
    }
  };
  const ajustar = async (n: NotaAdmin, corpo: Record<string, unknown>) => {
    setNotas((l) => l.map((x) => (x.id === n.id ? { ...x, ...corpo } : x)));
    try {
      await api.patch("/api/admin/notas/" + n.id, corpo);
      depois();
    } catch (err) {
      avisar(mensagem(err), "erro");
      carregar();
    }
  };
  const apagarNota = async (n: NotaAdmin) => {
    if (!confirm(`Apagar a nota "${n.titulo}"? Os flashcards dela e o progresso dos alunos nessas cartas somem junto.`)) return;
    try {
      await api.del("/api/admin/notas/" + n.id);
      depois("Nota apagada.");
    } catch (err) {
      avisar(mensagem(err), "erro");
    }
  };
  const apagarMateria = async () => {
    if (prompt(`Isto apaga a matéria inteira (${notas.length} notas, flashcards e progresso dos alunos). Para confirmar, digite: ${id}`) !== id) return;
    try {
      await api.del("/api/admin/materias/" + id);
      await recarregar();
      avisar("Matéria apagada.", "ok");
      ir("/admin/conteudo");
    } catch (err) {
      avisar(mensagem(err), "erro");
    }
  };

  if (m === undefined) return <Carregando />;
  if (m === null) return <Vazio titulo="Matéria não encontrada" />;
  const modulos = [...new Set(notas.map((n) => n.modulo))];
  return (
    <section className="admin-materia">
      <Link para="/admin/conteudo" className="voltar"><Icone nome="esquerda" tam={15} /> Todas as matérias</Link>
      <div className="colunas-admin">
        <form className="cartao form-coluna" onSubmit={salvar}>
          <h2 className="titulo-secao">{m.nome}</h2>
          <div className="grade-2">
            <label className="campo"><span>Nome</span><input required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></label>
            <label className="campo"><span>Semestre</span><input required type="number" min={1} max={14} value={f.semestre} onChange={(e) => setF({ ...f, semestre: e.target.value })} /></label>
          </div>
          <label className="campo"><span>Eixo (opcional)</span><input value={f.eixo} onChange={(e) => setF({ ...f, eixo: e.target.value })} /></label>
          <label className="campo"><span>Descrição (uma frase)</span><input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></label>
          <label className="campo campo-cor"><span>Cor</span><input type="color" value={f.cor || "#1f6f8b"} onChange={(e) => setF({ ...f, cor: e.target.value })} /></label>
          <div><button className="botao primario">Salvar matéria</button></div>
        </form>
        <form className="cartao form-coluna cartao-prova-admin" onSubmit={salvar}>
          <h2 className="titulo-secao"><Icone nome="prova" tam={17} /> Prova</h2>
          <label className="campo"><span>Data da prova</span><input type="date" name="provaData" value={f.provaData} onChange={(e) => setF({ ...f, provaData: e.target.value })} /></label>
          <label className="campo">
            <span>O que cai (aparece no topo do modo prova)</span>
            <textarea rows={4} name="provaFoco" value={f.provaFoco} onChange={(e) => setF({ ...f, provaFoco: e.target.value })} placeholder="Ex.: capítulos 3 a 6; instrumentais; posições cirúrgicas…" />
          </label>
          <p className="sub">Marque na lista abaixo quais notas são conteúdo de prova: são elas que entram no modo prova e nas "cartas da prova".</p>
          <div><button className="botao primario">Salvar prova</button></div>
        </form>
      </div>

      <div className="barra-acoes">
        <h2 className="titulo-secao">Notas ({notas.length})</h2>
        <div className="linha-botoes">
          {m.rascunhos > 0 && (
            <button type="button" className="botao primario" onClick={() => api.post(`/api/admin/materias/${id}/publicar`).then(() => depois("Rascunhos publicados.")).catch((e) => avisar(mensagem(e), "erro"))}>
              <Icone nome="check" tam={16} /> Publicar {m.rascunhos} rascunho(s)
            </button>
          )}
          <Link para={`/admin/nota/${id}/nova`} className="botao fantasma"><Icone nome="mais" tam={16} /> Nova nota</Link>
          <a href={`/api/admin/materias/${id}/exportar`} className="botao fantasma" download><Icone nome="download" tam={16} /> Exportar pacote</a>
        </div>
      </div>
      {!notas.length && <Vazio titulo="Esta matéria ainda não tem notas">Importe um pacote, gere com o Claude ou crie a primeira nota.</Vazio>}
      {modulos.map((mod) => (
        <div className="tabela-rolagem" key={mod}>
          <table className="tabela-admin tabela-notas">
            <thead>
              <tr><th>{mod}</th><th title="É conteúdo de prova?">Prova</th><th>Prioridade</th><th>Publicada</th><th>Cartas</th><th /></tr>
            </thead>
            <tbody>
              {notas.filter((n) => n.modulo === mod).map((n) => (
                <tr key={n.id} className={n.publicada ? "" : "apagado"} data-nota={n.id}>
                  <td>
                    <Link para={"/admin/nota/" + n.id}><strong>{n.titulo}</strong></Link> {n.pdf && <Selo tipo="pdf">PDF</Selo>} {!n.publicada && <Selo tipo="rascunho">rascunho</Selo>}
                    <small>{n.resumo}</small>
                  </td>
                  <td><input type="checkbox" checked={n.prova} onChange={(e) => ajustar(n, { prova: e.target.checked })} aria-label={"Conteúdo de prova: " + n.titulo} /></td>
                  <td>
                    <select value={n.prioridade} disabled={!n.prova} onChange={(e) => ajustar(n, { prioridade: Number(e.target.value) })} aria-label={"Prioridade de " + n.titulo}>
                      <option value={1}>Alta</option>
                      <option value={2}>Média</option>
                      <option value={3}>Baixa</option>
                    </select>
                  </td>
                  <td><input type="checkbox" checked={n.publicada} onChange={(e) => ajustar(n, { publicada: e.target.checked })} aria-label={"Publicada: " + n.titulo} /></td>
                  <td>{n.cards}</td>
                  <td className="acoes">
                    <Link para={"/nota/" + n.id} className="botao-icone" title="Ver como aluno" aria-label={"Ver " + n.titulo}><Icone nome="olho" tam={16} /></Link>
                    <Link para={"/admin/nota/" + n.id} className="botao-icone" title="Editar" aria-label={"Editar " + n.titulo}><Icone nome="lapis" tam={16} /></Link>
                    <button type="button" className="botao-icone perigo" title="Apagar" aria-label={"Apagar " + n.titulo} onClick={() => apagarNota(n)}><Icone nome="lixo" tam={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <div className="zona-perigo">
        <span><strong>Apagar a matéria</strong><small>Remove todas as notas, figuras, flashcards e o progresso dos alunos nela.</small></span>
        <button type="button" className="botao perigo" onClick={apagarMateria}><Icone nome="lixo" tam={16} /> Apagar matéria</button>
      </div>
    </section>
  );
}

type Previa = { html: string; erros: string[]; avisos: string[]; palavras: number; flashcards: number; questoes: number };
const MODELO = `> [!ideia]
> A frase que resume esta nota.

## Seção

Texto curto, com **termos** em negrito e um link para [[Outra nota]].

> [!prova]
> Como isso costuma ser cobrado.

> [!essencial]
> - O mínimo que precisa estar na cabeça.

> [!questao] Enunciado da questão?
> - [ ] Alternativa errada
> - [x] Alternativa certa
>
> Comentário da resposta.

> [!flashcard] Pergunta?
> Resposta curta.
`;

export function EditorNota({ materia, slug }: { materia: string; slug: string | null }) {
  const { avisar, recarregar, idx } = useApp();
  const [carregando, setCarregando] = useState(!!slug);
  const [f, setF] = useState({ titulo: "", resumo: "", modulo: "", tags: "", prova: false, prioridade: 2, publicada: true, md: slug ? "" : MODELO, pdf: null as string | null, ordem: 999 });
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [modulos, setModulos] = useState<string[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    api.get<{ notas: NotaAdmin[] }>(`/api/admin/materias/${materia}/notas`).then((r) => setModulos([...new Set(r.notas.map((n) => n.modulo))])).catch(() => {});
    if (!slug) return;
    api
      .get<{ nota: { titulo: string; resumo: string; md: string; prova: boolean; prioridade: number; tags: string[]; modulo: string; publicada: boolean; pdf: string | null; ordem: number } }>(`/api/admin/notas/${materia}/${slug}`)
      .then(({ nota }) => {
        setF({ titulo: nota.titulo, resumo: nota.resumo, modulo: nota.modulo, tags: nota.tags.join(", "), prova: nota.prova, prioridade: nota.prioridade, publicada: nota.publicada, md: nota.md, pdf: nota.pdf, ordem: nota.ordem });
        setCarregando(false);
      })
      .catch((e) => avisar(mensagem(e), "erro"));
  }, [materia, slug, avisar]);

  const tags = f.tags.split(",").map((t) => t.trim()).filter(Boolean);
  useEffect(() => {
    if (carregando) return;
    const n = ++seq.current;
    const t = setTimeout(() => {
      api
        .post<Previa>("/api/admin/previa", { materia, titulo: f.titulo, md: f.md, prova: f.prova, tags, pdf: f.pdf })
        .then((r) => n === seq.current && setPrevia(r))
        .catch(() => {});
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.md, f.titulo, f.prova, f.tags, carregando, materia]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      const corpo = { titulo: f.titulo, resumo: f.resumo, modulo: f.modulo, tags, prova: f.prova, prioridade: f.prioridade, publicada: f.publicada, md: f.md, ordem: f.ordem };
      const r = slug ? await api.put<{ id: string }>(`/api/admin/notas/${materia}/${slug}`, corpo) : await api.post<{ id: string }>(`/api/admin/notas/${materia}`, corpo);
      await recarregar();
      avisar("Nota salva.", "ok");
      if (!slug) ir("/admin/nota/" + r.id, { trocar: true });
    } catch (err) {
      avisar(mensagem(err), "erro");
    }
    setSalvando(false);
  };

  if (carregando) return <Carregando />;
  return (
    <form className="editor" onSubmit={salvar}>
      <div className="barra-acoes">
        <Link para={"/admin/conteudo/" + materia} className="voltar"><Icone nome="esquerda" tam={15} /> {idx.materia.get(materia)?.nome || "Matéria"}</Link>
        <div className="linha-botoes">
          {slug && <Link para={`/nota/${materia}/${slug}`} className="botao fantasma"><Icone nome="olho" tam={16} /> Ver como aluno</Link>}
          <button className="botao primario" disabled={salvando || !!previa?.erros.length} data-testid="salvar-nota">{salvando ? "Salvando…" : "Salvar nota"}</button>
        </div>
      </div>
      <div className="editor-props cartao">
        <label className="campo campo-largo"><span>Título</span><input name="titulo" required value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></label>
        <label className="campo campo-largo"><span>Resumo (uma frase: aparece nos cartões e na busca)</span><input name="resumo" required value={f.resumo} onChange={(e) => setF({ ...f, resumo: e.target.value })} /></label>
        <label className="campo">
          <span>Módulo</span>
          <input name="modulo" list="modulos-existentes" required value={f.modulo} onChange={(e) => setF({ ...f, modulo: e.target.value })} placeholder="Ex.: Instrumentais Cirúrgicos" />
          <datalist id="modulos-existentes">{modulos.map((m) => <option key={m} value={m} />)}</datalist>
        </label>
        <label className="campo"><span>Tags (separadas por vírgula)</span><input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></label>
        <label className="marcar marcar-prova"><input type="checkbox" name="prova" checked={f.prova} onChange={(e) => setF({ ...f, prova: e.target.checked })} /> Conteúdo de prova</label>
        <label className="campo campo-curto">
          <span>Prioridade</span>
          <select value={f.prioridade} disabled={!f.prova} onChange={(e) => setF({ ...f, prioridade: Number(e.target.value) })}>
            <option value={1}>Alta</option>
            <option value={2}>Média</option>
            <option value={3}>Baixa</option>
          </select>
        </label>
        <label className="marcar"><input type="checkbox" checked={f.publicada} onChange={(e) => setF({ ...f, publicada: e.target.checked })} /> Publicada (visível para os alunos)</label>
      </div>
      <div className="editor-colunas">
        <div className="editor-fonte">
          <div className="editor-rotulo">
            <span>Texto (Markdown)</span>
            {previa && <small>{previa.palavras} palavras · {previa.flashcards} flashcard(s) · {previa.questoes} questão(ões)</small>}
          </div>
          <textarea name="md" value={f.md} onChange={(e) => setF({ ...f, md: e.target.value })} spellCheck={false} aria-label="Texto da nota em Markdown" />
          <details className="cola">
            <summary>Como escrever</summary>
            <p><code>&gt; [!ideia]</code> <code>&gt; [!definicao] Título</code> <code>&gt; [!prova]</code> <code>&gt; [!atencao]</code> <code>&gt; [!pratica]</code> <code>&gt; [!mnemonico]</code> <code>&gt; [!essencial]</code></p>
            <p><code>[[Título de outra nota]]</code> liga notas · <code>==texto==</code> grifa · <code>![legenda](anexos/figura.jpg)</code> põe figura</p>
            <p><code>&gt; [!flashcard] Pergunta?</code> e a resposta na linha de baixo · <code>&gt; [!questao] Enunciado</code> com <code>- [ ]</code> e <code>- [x]</code></p>
          </details>
        </div>
        <div className="editor-previa">
          <div className="editor-rotulo"><span>Como o aluno vai ver</span></div>
          {previa?.erros.map((e, i) => <div key={"e" + i} className="alerta alerta-erro">{e}</div>)}
          {previa?.avisos.map((a, i) => <div key={"a" + i} className="alerta alerta-info">{a}</div>)}
          <div className="leitor leitor-previa">
            <h1>{f.titulo || "Sem título"}</h1>
            {f.resumo && <p className="leitor-resumo">{f.resumo}</p>}
            {previa ? <ConteudoNota html={previa.html} /> : <Carregando texto="Gerando a prévia…" />}
          </div>
        </div>
      </div>
    </form>
  );
}
