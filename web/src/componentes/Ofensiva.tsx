// Ofensiva: dias seguidos estudando. A chama no menu mostra o número; clicar abre o painel com o
// calendário, o recorde e o que falta para garantir o dia.
import { useEffect, useState } from "react";
import { plural, useApp } from "../lib/loja";
import { ir } from "../lib/rota";
import type { Ofensiva } from "../lib/api";
import { Icone } from "./Icone";
import { Modal } from "./ui";
import { Ajuda } from "./Ajuda";

const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

function faltam(viraEm: number) {
  const min = Math.max(0, Math.round((viraEm - Date.now()) / 60000));
  if (min >= 60) return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
  return `${min} min`;
}

export function estadoOfensiva(o: Ofensiva | null) {
  if (!o) return { classe: "", frase: "" };
  if (o.hojeFeito) return { classe: "garantida", frase: "Dia garantido. Volte amanhã para manter a chama." };
  if (o.emRisco) return { classe: "risco", frase: `Estude hoje para não perder: faltam ${faltam(o.viraEm)}.` };
  return { classe: "apagada", frase: "Responda um flashcard ou leia uma nota para acender a chama." };
}

// A chama com o número (menu lateral e topo do celular).
export function ChamaOfensiva({ compacta }: { compacta?: boolean }) {
  const { ofensiva } = useApp();
  const [aberta, setAberta] = useState(false);
  if (!ofensiva) return null;
  const e = estadoOfensiva(ofensiva);
  return (
    <>
      <button
        type="button"
        className={"chama " + e.classe + (compacta ? " compacta" : "")}
        onClick={() => setAberta(true)}
        title={`Ofensiva: ${plural(ofensiva.atual, "dia seguido", "dias seguidos")}. ${e.frase}`}
        data-testid="chama"
        aria-label={`Ofensiva de ${ofensiva.atual} dias`}
      >
        <Icone nome="fogo" tam={compacta ? 18 : 17} />
        <b data-testid="chama-numero">{ofensiva.atual}</b>
        {!compacta && <span>{ofensiva.atual === 1 ? "dia de ofensiva" : "dias de ofensiva"}</span>}
      </button>
      {aberta && <PainelOfensiva aoFechar={() => setAberta(false)} />}
    </>
  );
}

export function PainelOfensiva({ aoFechar }: { aoFechar: () => void }) {
  const { ofensiva: o } = useApp();
  const [, tique] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tique((n) => n + 1), 30000); // atualiza o "faltam X"
    return () => clearInterval(t);
  }, []);
  if (!o) return null;
  const e = estadoOfensiva(o);
  // o calendário começa num domingo, para as colunas baterem com os dias da semana
  const primeiro = new Date(o.dias[0].dia + "T12:00:00").getDay();
  return (
    <Modal titulo="Ofensiva" aoFechar={aoFechar}>
      <div className={"ofensiva-topo " + e.classe} data-testid="painel-ofensiva">
        <span className="ofensiva-chama"><Icone nome="fogo" tam={44} /></span>
        <div>
          <strong className="ofensiva-numero">{o.atual}</strong>
          <span>{o.atual === 1 ? "dia seguido" : "dias seguidos"}</span>
        </div>
      </div>
      <p className={"ofensiva-frase " + e.classe}>{e.frase}</p>
      <div className="ofensiva-dados">
        <span><b>{o.recorde}</b> recorde</span>
        <span><b>{o.totalDias}</b> {o.totalDias === 1 ? "dia estudado" : "dias estudados"} no total</span>
      </div>
      <div className="calendario" aria-label="Últimos 35 dias">
        {SEMANA.map((d, i) => <span key={"c" + i} className="cal-cabeca">{d}</span>)}
        {Array.from({ length: primeiro }, (_, i) => <span key={"v" + i} />)}
        {o.dias.map((d) => {
          const total = d.flashcards + d.notas;
          const forte = total >= 20 ? 3 : total >= 5 ? 2 : total > 0 ? 1 : 0;
          return (
            <span
              key={d.dia}
              className={"cal-dia n" + forte + (d.hoje ? " hoje" : "")}
              title={`${d.dia.split("-").reverse().join("/")}: ${total ? `${plural(d.flashcards, "flashcard", "flashcards")}, ${plural(d.notas, "nota lida", "notas lidas")}` : "sem estudo"}`}
            >
              {d.ativo && <Icone nome="fogo" tam={11} />}
            </span>
          );
        })}
      </div>
      <p className="sub ofensiva-como">
        <strong>Como conta:</strong> o dia vale quando você responde pelo menos um flashcard ou marca uma nota como lida. O dia vira às 4h da manhã, então estudar de madrugada ainda conta para a noite anterior.
        <Ajuda lado="cima">A cor do quadrado mostra o quanto você estudou no dia: mais escuro, mais flashcards e notas.</Ajuda>
      </p>
      {!o.hojeFeito && (
        <div className="linha-botoes">
          <button type="button" className="botao primario" onClick={() => { aoFechar(); ir("/flashcards"); }}><Icone nome="cartas" tam={16} /> Estudar flashcards agora</button>
          <button type="button" className="botao fantasma" onClick={() => { aoFechar(); ir("/estante"); }}>Ler uma nota</button>
        </div>
      )}
    </Modal>
  );
}
