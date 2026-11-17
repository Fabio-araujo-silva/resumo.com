// npm run dev: sobe o servidor (porta 4310, reinicia ao salvar) e o Vite (porta 5310, com proxy pra /api).
import { spawn } from "node:child_process";

const win = process.platform === "win32";
const procs = [
  spawn(process.execPath, ["--watch", "server/src/index.js"], { stdio: "inherit", env: process.env }),
  spawn(win ? "npm.cmd" : "npm", ["run", "dev", "-w", "web"], { stdio: "inherit", shell: win }),
];
const parar = () => procs.forEach((p) => p.kill());
process.on("SIGINT", parar);
process.on("SIGTERM", parar);
procs.forEach((p) => p.on("exit", (codigo) => codigo && parar()));
