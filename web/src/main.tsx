import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "./estilos/base.css";
import "./estilos/paginas.css";
import "./estilos/leitor.css";
import "./estilos/interativo.css";
import "./estilos/admin.css";
import { Provedor } from "./lib/loja";
import { App } from "./App";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <Provedor>
      <App />
    </Provedor>
  </StrictMode>
);
