// Ícones de traço (24x24), desenhados aqui mesmo: nada vem de fora.
const D: Record<string, string> = {
  inicio: "M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10M9.5 19.5v-6h5v6",
  estante: "M4 4.5v15M9 4.5v15M4 19.5h16M13 6.5l3.6-1 3.4 13-3.6 1zM4 4.5h5",
  grafo: "M6 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM18 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM8 21.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM18.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8.3 6l7.3.8M6.5 7.5 7.6 16.5M10.3 18.3l6.2-.2M16.6 9.2 9.4 17",
  prova: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 12h.01",
  cartas: "M4 8.5A1.5 1.5 0 0 1 5.5 7h9A1.5 1.5 0 0 1 16 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 18.5zM8 7V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5H16",
  admin: "M12 3l7.5 3v5.5c0 4.6-3.1 8.2-7.5 9.5-4.4-1.3-7.5-4.9-7.5-9.5V6zM9 12l2.2 2.2L15.2 10",
  busca: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4",
  sol: "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  lua: "M20 14.2A8.2 8.2 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z",
  sair: "M14 4.5h4.5v15H14M10 8l-4 4 4 4M6 12h9",
  menu: "M4 7h16M4 12h16M4 17h16",
  fechar: "M6 6l12 12M18 6 6 18",
  direita: "M9 5l7 7-7 7",
  esquerda: "M15 5l-7 7 7 7",
  check: "M5 12.5l4.5 4.5L19 7.5",
  relogio: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2",
  livro: "M5 4.5h10.5A2.5 2.5 0 0 1 18 7v12.5H7.5A2.5 2.5 0 0 1 5 17zM5 17a2.5 2.5 0 0 1 2.5-2.5H18",
  pdf: "M7 3.5h7l4.5 4.5v12.5h-11.5zM14 3.5V8h4.5M9.5 13h5M9.5 16.5h5",
  raio: "M13 2.5 5 13.5h6l-1 8 8-11h-6z",
  usuario: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5c.8-3.6 3.8-5.5 7.5-5.5s6.700 1.900 7.500 5.500",
  usuarios: "M9 11.5a3.5 3.500 0 1 0 0-7 3.500 3.500 0 0 0 0 7ZM2.500 19.500c.600-3 3.100-4.500 6.500-4.500s5.900 1.500 6.500 4.500M16 4.800a3.500 3.500 0 0 1 0 6.400M18 15.300c1.900.600 3.100 2 3.500 4.200",
  cadeado: "M6.500 10.500h11V20h-11zM9 10.500V8a3 3 0 0 1 6 0v2.500",
  upload: "M12 15.500v-11M7.500 8.500 12 4l4.500 4.500M4.500 15v4.500h15V15",
  download: "M12 4v11M7.500 10.500 12 15l4.500-4.500M4.500 15v4.500h15V15",
  robo: "M6 9.500h12V19H6zM12 9.500V6M12 6a1.200 1.200 0 1 0 0-2.400A1.200 1.200 0 0 0 12 6ZM9.500 13.500v1.500M14.500 13.500v1.500M3.500 13v3M20.500 13v3",
  olho: "M2.500 12s3.500-6.500 9.500-6.500S21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12ZM12 14.800a2.800 2.800 0 1 0 0-5.600 2.800 2.800 0 0 0 0 5.600Z",
  lixo: "M4.500 7h15M9.500 7V4.500h5V7M6.500 7l.800 12.500h9.400L17.500 7M10 10.500v6M14 10.500v6",
  lapis: "M4.500 19.500l1-4L16 5l3 3L8.500 18.500zM14 7l3 3",
  mais: "M12 5v14M5 12h14",
  link: "M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1",
  lista: "M8.500 7h11M8.500 12h11M8.500 17h11M4.500 7h.010M4.500 12h.010M4.500 17h.010",
  alerta: "M12 4 2.800 19.500h18.400zM12 10v4.500M12 17h.010",
  chave: "M14.500 13.500a4.500 4.500 0 1 0-4-4L4 16v3.500h3.500V17H10v-2.500h2.200zM16 8h.010",
  pulso: "M2.500 12.500h4l2.500-6 4 12 2.500-8 1.500 2h4.500",
  mapa: "M12 21s6.500-5.400 6.500-10.500a6.500 6.500 0 1 0-13 0C5.500 15.600 12 21 12 21ZM12 13a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5Z",
  grade: "M4.500 4.500h6.500v6.500H4.500zM13 4.500h6.500v6.500H13zM4.500 13h6.500v6.500H4.500zM13 13h6.500v6.500H13z",
  filtro: "M4 5.500h16l-6 7.500v5.500l-4 1.500V13z",
  voltar: "M4.500 9.500h9.500a5 5 0 0 1 0 10H9M8.500 5.500l-4 4 4 4",
  foco: "M4 9V4.500h4.500M20 9V4.500h-4.500M4 15v4.500h4.500M20 15v4.500h-4.500",
  marcador: "M6.500 3.500h11v17l-5.500-4-5.500 4z",
  som: "M4 9.500h3.500L12 5.500v13l-4.500-4H4zM15.500 9a4.500 4.500 0 0 1 0 6M18 6.500a8 8 0 0 1 0 11",
  pausa: "M8 5.500v13M16 5.500v13",
  marcado: "M6.500 3.500h11v17l-5.500-4-5.500 4zM9.500 9.500l2 2 3.500-3.500",
};

export function Icone({ nome, tam = 18, className }: { nome: keyof typeof D | string; tam?: number; className?: string }) {
  return (
    <svg className={"icone" + (className ? " " + className : "")} width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={D[nome] || D.inicio} />
    </svg>
  );
}

// Logotipo: a linha de um batimento que termina num ponto (a sinapse).
export function Logo({ tam = 28 }: { tam?: number }) {
  return (
    <svg className="logo" width={tam} height={tam} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="var(--logo-fundo)" />
      <path d="M9 34h11l5-13 8 26 6-19 4 6h6" fill="none" stroke="var(--acento)" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="54" cy="34" r="3.6" fill="var(--acento)" />
    </svg>
  );
}

// Linha de eletrocardiograma decorativa.
export function Batimento({ className }: { className?: string }) {
  return (
    <svg className={"batimento " + (className || "")} viewBox="0 0 600 60" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 34h120l10-6 10 6h28l8-26 12 46 10-32 8 12h34l10-6 10 6h56l8-26 12 46 10-32 8 12h34l10-6 10 6h172" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
