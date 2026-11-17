# Imagem de produção do Sinapse. O front é compilado no primeiro estágio; só o resultado vai adiante.
# A geração de resumos com IA precisa do Claude Code, que NÃO está nesta imagem: gere no seu
# computador e publique com `node server/cli.js importar <pasta> --url ... --token ...`.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY web web
RUN npm run build -w web

FROM node:22-bookworm-slim
ENV NODE_ENV=production DATA_DIR=/dados PORT=4310
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --no-audit --no-fund -w server && npm cache clean --force
COPY FORMATO.md ./
COPY server/src server/src
COPY server/cli.js server/cli.js
COPY --from=build /app/web/dist web/dist
RUN useradd --create-home --uid 10001 sinapse && mkdir -p /dados && chown sinapse /dados
USER sinapse
VOLUME /dados
EXPOSE 4310
HEALTHCHECK --interval=60s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4310/api/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/src/index.js"]
