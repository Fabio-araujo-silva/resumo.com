// Avaliações: a estrutura de base de toda matéria. Cada módulo (subconteúdo) pertence à N1 ou à
// N2, e cada avaliação tem a sua data de prova.
import type { Materia } from "./api";
import { diasAte, type Indice } from "./loja";

export type Av = "n1" | "n2";
export const AVS: Av[] = ["n1", "n2"];
export const nomeAv = (av: string) => av.toUpperCase();

export type ProvaDaMateria = { av: Av; data: string | null; dias: number | null };

// As avaliações que têm módulos nesta matéria, com a data de cada prova.
export function provasDe(m: Materia, idx: Indice): ProvaDaMateria[] {
  const usadas = new Set((idx.modulosDe.get(m.id) || []).map((x) => x.avaliacao));
  return AVS.filter((av) => usadas.has(av)).map((av) => {
    const data = av === "n1" ? m.prova_data : m.n2_data;
    return { av, data, dias: diasAte(data) };
  });
}

// A próxima prova marcada (hoje ou no futuro) da matéria.
export function proximaProva(m: Materia, idx: Indice): ProvaDaMateria | null {
  return (
    provasDe(m, idx)
      .filter((p) => p.dias !== null && p.dias >= 0)
      .sort((a, b) => a.dias! - b.dias!)[0] || null
  );
}
