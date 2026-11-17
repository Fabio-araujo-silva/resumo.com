// Roteador mínimo sobre a History API (o servidor devolve o index.html para qualquer caminho).
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
window.addEventListener("popstate", avisar);

export function ir(caminho: string, opcoes: { trocar?: boolean; manterRolagem?: boolean } = {}) {
  if (caminho === location.pathname + location.search) return;
  if (opcoes.trocar) history.replaceState(null, "", caminho);
  else history.pushState(null, "", caminho);
  avisar();
  if (!opcoes.manterRolagem) window.scrollTo(0, 0);
}

const assinar = (f: () => void) => {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
};
export const useCaminho = () => useSyncExternalStore(assinar, () => location.pathname);
export const useBusca = () => useSyncExternalStore(assinar, () => location.search);

// Clique normal navega sem recarregar; Ctrl/Meta/botão do meio seguem o padrão do navegador.
export function cliqueInterno(e: MouseEvent, para: string) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  ir(para);
}

export function Link({ para, onClick, ...resto }: { para: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={para}
      {...resto}
      onClick={(e) => {
        onClick?.(e);
        cliqueInterno(e, para);
      }}
    />
  );
}
