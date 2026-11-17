// O "?" pequeno ao lado de um rótulo: explica o que aquela coisa é. Abre ao passar o mouse, ao
// focar com o teclado ou ao tocar (no celular), e fecha ao clicar fora ou com Esc.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function Ajuda({ children, rotulo = "O que é isto?", lado = "baixo", testid }: { children: ReactNode; rotulo?: string; lado?: "baixo" | "cima"; testid?: string }) {
  const [aberta, setAberta] = useState(false);
  const [fixa, setFixa] = useState(false); // aberta por clique: só fecha com outro clique
  const caixa = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!aberta) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) {
        setAberta(false);
        setFixa(false);
      }
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberta(false);
        setFixa(false);
      }
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberta]);

  return (
    <span className="ajuda" ref={caixa} onMouseEnter={() => setAberta(true)} onMouseLeave={() => !fixa && setAberta(false)}>
      <button
        type="button"
        className={"ajuda-botao" + (aberta ? " aberta" : "")}
        aria-label={rotulo}
        aria-expanded={aberta}
        aria-describedby={aberta ? id : undefined}
        data-testid={testid}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const abrir = !fixa;
          setFixa(abrir);
          setAberta(abrir);
        }}
        onFocus={() => setAberta(true)}
        onBlur={() => !fixa && setAberta(false)}
      >
        ?
      </button>
      {aberta && (
        <span className={"ajuda-balao " + lado} role="tooltip" id={id} onClick={(e) => e.stopPropagation()}>
          {children}
        </span>
      )}
    </span>
  );
}

// Um rótulo com o "?" ao lado (para títulos de seção e colunas).
export function ComAjuda({ children, ajuda, lado }: { children: ReactNode; ajuda: ReactNode; lado?: "baixo" | "cima" }) {
  return (
    <span className="com-ajuda">
      {children}
      <Ajuda lado={lado}>{ajuda}</Ajuda>
    </span>
  );
}
