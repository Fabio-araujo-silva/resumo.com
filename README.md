# resumo.com

Plataforma de **assinatura** de resumos de estudo feitos com IA, em **notas atômicas** ligadas entre si,
com **modo prova** e **flashcards** de repetição espaçada. O administrador libera os acessos (com
validade, se quiser), sobe os materiais de uma matéria e a IA devolve o resumo já no padrão da
plataforma. O assinante lê tudo dentro do site: nada é baixado.

Feita para medicina (o visual, o vocabulário e o modo prova partem daí), mas serve para qualquer curso.

## O que o assinante encontra

- **Notas atômicas.** Cada nota ensina uma ideia e liga para as outras. Em cada nota, o painel de
  conexões e o mapa do módulo mostram as ligações; **Explorar ligações** mostra um tópico por vez,
  com só as notas ligadas a ele, e deixa seguir o fio clicando de nota em nota.
- **Prateleira.** A mesma biblioteca em ordem de estudo: semestre → matéria → avaliação (N1 e N2) →
  módulos em fileiras → notas, com o progresso de leitura.
- **N1 e N2.** Toda matéria é dividida em duas avaliações: cada módulo pertence a uma delas, e cada
  uma tem a sua data, o seu modo prova e as suas cartas.
- **Leitura interativa.** Tudo na nota é clicável:
  - **Testar-se:** os termos em negrito e os grifos viram lacunas que abrem com um clique;
  - tabelas com **colunas que se escondem** para testar a memória;
  - **passo a passo** com cada passo marcável;
  - blocos (definição, dica de prova, atenção, na prática...) que abrem e fecham;
  - **"já sei"** em cada item do bloco essencial, guardado no aparelho;
  - **espiar:** clicar num link abre a outra nota ao lado, sem sair da leitura;
  - questões com correção na hora e placar; cartas da nota que viram; figuras que ampliam;
  - mapa do módulo como grafo; modo foco; tamanho da letra; atalhos de teclado;
  - **ouvir a nota** com uma voz masculina do ElevenLabs, expressiva e em português do Brasil, em streaming (pausar, voltar
    10 s, velocidade). Cada nota é gerada uma vez e guardada.
- **Ofensiva.** Dias seguidos estudando (um flashcard respondido ou uma nota lida vale o dia), com
  recorde, calendário e aviso quando o dia está em risco.
- **Pendências.** Um flashcard que pegou você, ou uma nota que quer rever: "Estudar depois" guarda o
  assunto na aba Pendências; "Dei baixa" tira da lista (e marca a nota como lida).
- **Modo prova.** Só o conteúdo emergencial de cada matéria: o bloco essencial de cada nota de prova
  (por prioridade), as dicas de prova, as questões e as cartas da prova, com a contagem de dias.
- **Flashcards.** Um baralho por matéria, agendado com o **algoritmo do Anki** (SM-2, agendador v2,
  valores padrão): passos de 1 e 10 min, De novo / Difícil / Bom / Fácil, facilidade, lapsos,
  um **?** ao lado de cada pergunta que explica o que ela quer saber, e o assunto do flashcard
  clicável (abre a nota, com confirmação antes de sair do estudo),
  virada do dia às 4h. O assinante escolhe quantas cartas novas quer por dia (20 por padrão) e pode
  liberar mais na hora em que o baralho acaba.
- **Leitor de PDF embutido** para resumos que já existem em PDF.
- **Tema escuro** (padrão) e **claro**. Funciona no celular.

## O que o administrador faz

- **Acessos:** cria logins (a senha é gerada e mostrada uma vez), define validade da assinatura,
  libera todas as matérias ou só algumas, desativa, troca senha, derruba sessões. A senha que o
  administrador entrega é provisória: no primeiro acesso a pessoa cria a própria (e troca quando
  quiser em Conta).
- **Conteúdo:** edita matérias e notas (editor com prévia ao vivo), marca o que é **conteúdo de prova**
  e a prioridade, separa os módulos entre N1 e N2, define a data e o foco de cada prova, publica ou
  esconde notas.
- **Importar:** sobe um pacote `.zip` (confere antes de publicar) ou um PDF pronto.
- **Gerar com IA:** entrega os PDFs/slides da matéria, diz o que cai na prova, e a plataforma abre uma
  instância do Claude Code no computador, que escreve o resumo no padrão, valida e publica.
- **Auditoria:** quem abriu o quê, bloqueios por excesso de leitura e rastreio de trecho vazado.

## Rodar

Precisa de **Node 22.13 ou mais novo**. Não há dependência nativa (o banco é o SQLite embutido do Node).
Chaves e ajustes locais vão num arquivo `.env` na raiz (fora do git; veja `.env.example`). Para a
leitura em voz alta, ponha lá `ELEVENLABS_API_KEY`.

    npm install
    npm run build      # compila o front (web/dist)
    npm start          # http://localhost:4310

Na primeira subida, se não existir administrador, um é criado com senha aleatória. O login e a senha
aparecem no terminal e em `dados/PRIMEIRO-ACESSO.txt`. Para escolher: `ADMIN_EMAIL` e `ADMIN_SENHA`
(veja `.env.example`), ou:

    node server/cli.js criar-admin --email voce@exemplo.com --senha "uma-senha-boa"

Para desenvolver (servidor com recarga + Vite em http://localhost:5310):

    npm run dev

Tudo o que importa fica em `dados/` (banco, figuras e PDFs). Backup = copiar essa pasta.

Para abrir em outro aparelho da mesma rede, use o IP do computador no lugar de `localhost`
(por exemplo `http://192.168.0.5:4310`); o servidor já escuta em todas as interfaces.

## Como o conteúdo entra

Todo conteúdo é um **pacote resumo.com**: uma pasta de arquivos Markdown, no mesmo jeito de escrever do
Obsidian (propriedades YAML, blocos `> [!tipo]`, links `[[Nota]]`). A especificação completa, com o
padrão de qualidade dos resumos, está em [`FORMATO.md`](FORMATO.md). É o formato universal: qualquer
pessoa ou qualquer instância de IA que o siga consegue publicar.

    node server/cli.js validar  <pasta>     # confere e lista erros e avisos
    node server/cli.js importar <pasta>     # valida e publica (acrescenta e atualiza; não apaga)
    node server/cli.js importar <pasta> --url https://seu-site --token rsm_...   # publica num site hospedado
    node server/cli.js exportar <materia> <destino.zip>
    node server/cli.js listar

Três caminhos:

1. **Gerar com IA** (painel › Gerar, ou `node server/cli.js gerar --materia <slug> --nome "Nome"
   --semestre N --prova "o que cai" arquivo1.pdf arquivo2.pptx ...`). O servidor monta uma pasta de
   trabalho com os materiais, o `FORMATO.md` e um pedido; abre o Claude Code (`claude -p`) nela;
   valida o que ele escreveu (e manda corrigir, até duas vezes); publica. Precisa do Claude Code
   instalado na máquina onde o comando roda. Com o site hospedado em outro lugar, gere no seu
   computador e mande com `--url` e `--token`.
2. **Pacote pronto** (painel › Importar): o `.zip` da pasta.
3. **PDF direto** (painel › Importar): o PDF vira uma nota de leitura.

## Proteção do conteúdo

O conteúdo só existe atrás do login: nenhuma nota, figura ou PDF é arquivo público. Para contas de
assinante:

- **marca d'água** em toda a tela com nome, login, código da conta e data (se for removida pelo
  inspetor, ela volta), e uma **etiqueta invisível** no texto de cada nota;
- seleção, cópia, arrastar, menu do botão direito, imprimir e salvar página **bloqueados**;
- a tela é **coberta** quando a janela perde o foco e quando a tecla PrintScreen é usada;
- o PDF trafega **embaralhado** e é desenhado em canvas (sem botão de baixar, sem abrir em outra aba);
- **uma sessão por conta**: entrar em outro aparelho derruba o anterior;
- **teto de notas abertas** por tempo, registro de acessos e, no painel, **rastreio**: cole um trecho
  vazado (ou o código da marca d'água de um print) e veja de qual conta saiu.

O limite, com honestidade: nenhum site consegue impedir uma captura de tela do sistema operacional ou
uma foto com o celular. O que a plataforma faz é dar trabalho, tirar os caminhos fáceis e garantir que
todo vazamento carregue o nome de quem vazou.

## Testes

    npm test            # servidor: agendador do Anki, formato de pacote, API, gerador, voz (52 testes)
    npm run test:e2e    # navegador: leitura, grafo, prova, flashcards, proteção, painel, pendências, celular (41 cenários)

Os testes de navegador usam o Chrome instalado e um servidor próprio com banco temporário. A geração
com IA é testada com um Claude de mentira (`server/test/claude-de-mentira.mjs`), que segue o mesmo
protocolo do de verdade.

## Estrutura

    server/   API (Fastify) e CLI
      src/markdown.js    Markdown das notas -> HTML (blocos, links, grifo, questões, etiqueta invisível)
      src/pacote.js      leitura e validação do pacote
      src/importar.js    gravação no banco, exportação, índice de links
      src/srs.js         agendador de flashcards (Anki)
      src/gerador.js     geração de resumos com o Claude Code local
      src/conteudo.js    biblioteca, nota, modo prova, busca, figuras, PDF
      src/flashcards.js  fila de estudo
      src/admin.js       painel
      src/voz.js         leitura da nota com o ElevenLabs (streaming e cache)
      src/auth.js        contas, sessões, tokens de API
    web/      front-end (React + Vite + TypeScript)
    e2e/      testes de navegador (Playwright)
    FORMATO.md   o formato universal de conteúdo

## Colocar no ar

Qualquer servidor com Node serve: `npm ci && npm run build && NODE_ENV=production npm start`, atrás de
um proxy com HTTPS. Há um `Dockerfile` e um `docker-compose.yml` (com Caddy para o HTTPS) de ponto de
partida; **eles ainda não foram executados num servidor de verdade**. Em produção, defina
`TRUST_PROXY=1` e guarde o volume `dados`.
