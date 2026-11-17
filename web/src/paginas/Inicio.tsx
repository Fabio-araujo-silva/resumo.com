// Página inicial: o que fazer agora (revisões, prova mais próxima, continuar a leitura) e as matérias.
import { useEffect, useState } from "react";
import { api, type Baralho, type Estatisticas } from "../lib/api";
import { nomeAv, provasDe } from "../lib/avaliacao";
import { dataCurta, plural, textoProva, useApp } from "../lib/loja";
import { Link } from "../lib/rota";
import { Icone } from "../componentes/Icone";
import { Barra, Carregando, Vazio } from "../componentes/ui";
import { CapaMateria } from "./Estante";
import { Ajuda } from "../componentes/Ajuda";

type Recente = { id: string; titulo: string; materia: string; em: number };

export function Inicio() {
  const { usuario, bib, idx } = useApp();
  const [recentes, setRecentes] = useState<Recente[]>([]);
  const [cartas, setCartas] = useState<{ baralhos: Baralho[]; estatisticas: Estatisticas } | null>(null);

  useEffect(() => {
    api.get<{ recentes: Recente[] }>("/api/recentes").then((r) => setRecentes(r.recentes)).catch(() => {});
    api.get<{ baralhos: Baralho[]; estatisticas: Estatisticas }>("/api/flashcards/baralhos").then(setCartas).catch(() => {});
  }, []);

  if (!bib || !usuario) return <Carregando />;
  const hora = new Date().getHours();
  const saudacao = hora < 5 ? "Boa madrugada" : hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const leitura = bib.notas.filter((n) => !n.mapa);
  const lidas = leitura.filter((n) => idx.lidas.has(n.id)).length;
  const paraHoje = cartas ? cartas.baralhos.reduce((s, b) => s + b.revisar + b.aprendendo + b.novos, 0) : null;
  const melhorBaralho = cartas?.baralhos.slice().sort((a, b) => b.revisar + b.aprendendo + b.novos - (a.revisar + a.aprendendo + a.novos))[0];
  // as provas marcadas (N1 e N2 de cada matéria), da mais próxima para a mais distante
  const provas = bib.materias
    .flatMap((m) => provasDe(m, idx).filter((p) => p.dias !== null && p.dias >= 0).map((p) => ({ m, av: p.av, data: p.data!, dias: p.dias! })))
    .sort((a, b) => a.dias - b.dias);
  const proxima = provas[0];

  if (!bib.materias.length)
    return (
      <div className="pagina">
        <h1 className="titulo-pagina">{saudacao}, {usuario.nome.split(" ")[0]}</h1>
        <Vazio titulo="Ainda não há conteúdo">
          {usuario.papel === "admin" ? (
            <>Comece em <Link para="/admin/importar">Painel › Importar</Link> ou <Link para="/admin/gerar">Gerar com o Claude</Link>.</>
          ) : (
            "Assim que o administrador publicar os resumos, eles aparecem aqui."
          )}
        </Vazio>
      </div>
    );

  return (
    <div className="pagina">
      <header className="cabeca-pagina">
        <div>
          <p className="olho">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="titulo-pagina">{saudacao}, {usuario.nome.split(" ")[0]}</h1>
        </div>
      </header>

      <section className="painel-hoje">
        <Link para={melhorBaralho ? "/flashcards/" + melhorBaralho.materia : "/flashcards"} className="cartao destaque-cartas">
          <span className="rotulo"><Icone nome="cartas" tam={15} /> Flashcards de hoje <Ajuda>Revisões que vencem hoje mais os flashcards novos do seu limite diário, somando todas as matérias.</Ajuda></span>
          <strong className="numerao" data-testid="cartas-hoje">{paraHoje ?? "–"}</strong>
          <span className="sub">
            {cartas ? (paraHoje ? `${plural(cartas.baralhos.reduce((s, b) => s + b.revisar + b.aprendendo, 0), "para revisar", "para revisar")} · ${plural(cartas.baralhos.reduce((s, b) => s + b.novos, 0), "nova", "novas")}` : "Tudo em dia.") : " "}
          </span>
          {cartas && cartas.estatisticas.sequencia > 0 && <span className="sequencia"><Icone nome="raio" tam={14} /> {plural(cartas.estatisticas.sequencia, "dia seguido", "dias seguidos")}</span>}
        </Link>

        {proxima ? (
          <Link para={`/prova/${proxima.m.id}?av=${proxima.av}`} className={"cartao destaque-prova" + (proxima.dias <= 7 ? " urgente" : "")}>
            <span className="rotulo"><Icone nome="prova" tam={15} /> Próxima prova <Ajuda>A prova marcada mais próxima (N1 ou N2) entre as suas matérias. Abre o modo prova com só o conteúdo dela.</Ajuda></span>
            <strong className="numerao">{proxima.dias === 0 ? "hoje" : proxima.dias === 1 ? "amanhã" : proxima.dias + " dias"}</strong>
            <span className="sub">{proxima.m.nome} · {nomeAv(proxima.av)} · {dataCurta(proxima.data)}</span>
            <span className="sequencia">Abrir o modo prova <Icone nome="direita" tam={14} /></span>
          </Link>
        ) : (
          <Link para="/prova" className="cartao destaque-prova">
            <span className="rotulo"><Icone nome="prova" tam={15} /> Modo prova</span>
            <strong className="numerao">{bib.notas.filter((n) => n.prova).length}</strong>
            <span className="sub">notas marcadas como conteúdo de prova</span>
            <span className="sequencia">Ver o essencial <Icone nome="direita" tam={14} /></span>
          </Link>
        )}

        <Link para="/estante" className="cartao destaque-leitura">
          <span className="rotulo"><Icone nome="livro" tam={15} /> Leitura <Ajuda>Quantas notas você já marcou como lidas. As visões gerais dos módulos não contam.</Ajuda></span>
          <strong className="numerao">{lidas}<small>/{leitura.length}</small></strong>
          <span className="sub">notas lidas</span>
          <Barra valor={lidas} total={leitura.length} />
        </Link>
      </section>

      {recentes.length > 0 && (
        <section>
          <h2 className="titulo-secao">Continue de onde parou</h2>
          <div className="lista-recentes">
            {recentes.slice(0, 4).map((r) => {
              const n = idx.nota.get(r.id);
              return (
                <Link key={r.id} para={"/nota/" + r.id} className="recente">
                  <i style={{ background: idx.cor(r.materia) }} />
                  <span>
                    <strong>{r.titulo}</strong>
                    <small>{idx.materia.get(r.materia)?.nome}{n ? " · " + idx.modulo.get(n.modulo)?.titulo : ""}</small>
                  </span>
                  <Icone nome="direita" tam={16} />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="titulo-secao">Suas matérias</h2>
        <div className="capas">
          {bib.materias.map((m) => (
            <CapaMateria key={m.id} materia={m} />
          ))}
        </div>
        {provas.length > 1 && (
          <p className="sub provas-linha">
            Provas: {provas.map((p) => `${p.m.nome} ${nomeAv(p.av)} (${textoProva(p.dias)})`).join(" · ")}
          </p>
        )}
      </section>
    </div>
  );
}
