// Testes de navegador (ponta a ponta). Usam o Chrome instalado na máquina e um servidor de teste
// próprio (e2e/servidor.mjs) com banco temporário. Rode com: npm run test:e2e
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4399",
    channel: "chrome",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    viewport: { width: 1366, height: 860 },
    trace: "retain-on-failure",
  },
  webServer: { command: "node e2e/servidor.mjs", url: "http://127.0.0.1:4399/api/saude", reuseExistingServer: false, timeout: 30000 },
  projects: [
    { name: "computador", testIgnore: /celular/ },
    { name: "celular", testMatch: /celular/, use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
