# Pacote Sinapse — formato universal de conteúdo (v1)

Todo conteúdo entra no Sinapse como um **pacote**: uma pasta comum (ou o `.zip` dela) com arquivos
Markdown. É o mesmo jeito de escrever do Obsidian/Mathsidian — propriedades YAML no topo, callouts
`> [!tipo]`, links `[[Nota]]` — então a pasta também abre como um cofre.

Quem escreve o pacote pode ser você, ou qualquer instância do Claude. Quem confere é sempre o validador:

    node server/cli.js validar  <pasta>      # confere tudo e lista erros e avisos
    node server/cli.js importar <pasta>      # valida e publica (acrescenta/atualiza; não apaga nada)

Um pacote **com erro não entra**. Avisos não bloqueiam, mas quase sempre apontam algo a melhorar.

## 1. Estrutura da pasta

    tecnica-cirurgica/
    ├── materia.yml
    ├── 01 - História da Cirurgia/          ← cada pasta é um MÓDULO (uma prateleira)
    │   ├── 00 - Mapa - História da Cirurgia.md
    │   ├── 01 - As quatro eras da cirurgia.md   ← cada arquivo é uma NOTA ATÔMICA
    │   └── 02 - Ambroise Paré.md
    ├── 02 - Centro Cirúrgico/
    │   └── ...
    └── anexos/                             ← figuras (png, jpg, webp, gif) e PDFs
        └── atlas-cirurgico.jpg

- O número na frente (`01 - `) só define a ordem; não aparece no site.
- O nome do arquivo (sem o número) é o título da nota, a menos que a propriedade `titulo` diga outro.
- Arquivos e pastas que começam com `_` ou `.` são ignorados (use para rascunhos).
- Para **acrescentar** conteúdo a uma matéria que já existe, mande um pacote com o mesmo `slug` e só
  as notas novas ou alteradas. Nada do que já está no site é apagado.

## 2. `materia.yml`

```yaml
formato: 1
slug: tecnica-cirurgica        # identidade da matéria: minúsculas, números e hífen. Nunca muda.
nome: Técnica Cirúrgica
semestre: 4                    # número inteiro
eixo: Práticas Clínicas, Habilidades e Atitudes Médicas   # opcional
descricao: Do centro cirúrgico aos procedimentos.          # opcional, uma frase
cor: "#1f6f8b"                 # opcional
avaliacao: n1                  # a que avaliação os módulos pertencem: n1 (padrão) ou n2
prova:                         # opcional: data e foco de cada avaliação
  n1:
    data: 2026-10-02
    foco: |
      O que o professor disse que cai na N1, em texto livre.
  n2:
    data: 2026-12-04
    foco: Do módulo 6 em diante.
modulos:                       # opcional: descrição e avaliação de cada módulo
  - pasta: "01 - História da Cirurgia"
    descricao: Dos papiros egípcios à cirurgia robótica.
  - pasta: "09 - Cricotireoidostomia"
    avaliacao: n2              # este módulo cai na N2, mesmo com a matéria sendo n1
```

### Avaliações: N1 e N2

Toda matéria é dividida em duas avaliações. **Cada módulo pertence à N1 ou à N2**; é isso que separa
a prateleira, o modo prova e os flashcards.

- `avaliacao` na raiz diz a avaliação de todos os módulos (sem ela, `n1`).
- `avaliacao` dentro de um item de `modulos` vale só para aquele módulo.
- `prova.n1` e `prova.n2` têm cada uma a sua `data` e o seu `foco`. Um `prova.data`/`prova.foco`
  soltos valem para a avaliação da raiz.
- Um pacote que não fala de avaliação não muda a separação que já existe no site. O administrador
  também pode mover módulos entre N1 e N2 no painel.

## 3. Uma nota atômica

Uma nota ensina **uma ideia**. Se precisa de "e também", são duas notas ligadas por um link.

```markdown
---
titulo: Os três pilares do medo
resumo: Dor, infecção e hemorragia limitaram a cirurgia até o século XIX; vencê-los inaugurou a cirurgia moderna.
prova: true            # esta nota é conteúdo de prova?
prioridade: alta       # alta | media | baixa  (só importa se prova: true)
tags: [historia]
fontes: ["1-HISTÓRIA DA CIRURGIA.pptx"]
---

> [!ideia]
> A cirurgia moderna nasce quando caem, um após o outro, os três obstáculos que a limitaram por milênios.

## Os três pilares

| Pilar | Problema | Como foi vencido |
|---|---|---|
| **Dor** | o paciente acordado impedia cirurgias longas | anestesia: éter (1846), clorofórmio (1847) |
| **Infecção** | mortalidade pós-operatória de até 90% | antissepsia: Semmelweis, Pasteur, Lister |
| **Hemorragia** | choque rápido, sem transfusão | ligadura ([[Ambroise Paré]]), hemostasia de Halsted |

> [!atencao] Frase-chave
> "A modernidade médica começa com a quebra consecutiva destes três pilares."

Antes disso, ==a velocidade do corte importava mais que a precisão==. Veja como a anestesia mudou isso em
[[O triunfo da anestesia]].

> [!essencial]
> - Três pilares: **dor, infecção, hemorragia**.
> - Dor → anestesia (Morton, 1846). Infecção → antissepsia (Lister). Hemorragia → ligadura (Paré).

> [!questao] Qual pilar foi vencido pela demonstração de William Morton em 1846?
> - [ ] Infecção
> - [x] Dor
> - [ ] Hemorragia
> - [ ] Choque
>
> Morton demonstrou o éter como anestésico no Massachusetts General Hospital.

> [!flashcard] Quais são os três pilares do medo da cirurgia pré-moderna?
> Dor, infecção e hemorragia.

> [!flashcard] Qual era a mortalidade pós-operatória da "febre traumática"?
> Até 90%. Operar no hospital era mais letal do que em casa.
```

### Propriedades

| Propriedade | Obrigatória | O que é |
|---|---|---|
| `resumo` | **sim** | Uma frase (até ~200 caracteres) que diz o que a nota ensina. Aparece nos cartões, na busca e ao passar o mouse num link. |
| `titulo` | não | Padrão: o nome do arquivo. Único dentro da matéria. |
| `prova` | não | `true` se é conteúdo de prova. Padrão `false`. |
| `prioridade` | não | `alta`, `media` ou `baixa`: a ordem no modo prova. |
| `tags` | não | Lista livre. |
| `fontes` | não | De quais materiais a nota saiu. |
| `tipo` | não | `mapa` para a nota-índice de um módulo (ver 3.5). |
| `pdf` | não | Caminho de um PDF em `anexos/` para ler dentro da nota. |
| `id` | não | Fixa a identidade da nota. Só use ao editar uma nota exportada do site. |

### 3.1 Blocos (callouts)

Escreva `> [!tipo] Título opcional` e continue o bloco nas linhas seguintes, todas começando com `>`.

| Tipo | Aparece como | Para quê |
|---|---|---|
| `ideia` | Ideia central | A frase que resume a nota. Abra a nota com ele. |
| `definicao` | Definição | O que um termo significa. |
| `prova` | Dica de prova | Como o assunto costuma ser cobrado; pegadinhas. |
| `atencao` | Atenção | Erro comum, risco, contraindicação. |
| `pratica` | Na prática | Como isso aparece no hospital. |
| `mnemonico` | Mnemônico | Macete para decorar. |
| `exemplo` | Exemplo | Caso ou exemplo curto. |
| `objetivos` | O que você vai aprender | Só em notas `tipo: mapa`. |
| `essencial` | Essencial para a prova | **O mínimo que precisa estar na cabeça.** É o bloco que o modo prova mostra. |
| `flashcard` | (vira carta) | Pergunta na linha do `[!flashcard]`, resposta embaixo. Não aparece no texto. |
| `questao` | Teste-se | Enunciado na linha do `[!questao]`; alternativas `- [ ]` e a correta `- [x]`; depois de uma linha `>` vazia, o comentário. Sem alternativas, vira questão aberta (o corpo é a resposta). |

### 3.2 Texto

- `**negrito**` para termos; `==destaque==` para o que é para grifar (use pouco: no máximo 2 ou 3 por nota).
- Tabelas Markdown para comparar coisas (é o que mais ajuda a estudar).
- `##` e `###` para seções. Não use `#` (o título vem das propriedades).
- Figuras: `![legenda que explica a figura](anexos/arquivo.jpg)`, com o arquivo dentro de `anexos/`.
- Não use HTML: ele aparece como texto.

### 3.3 Links: é o que faz as notas serem atômicas

- `[[Título da outra nota]]` ou `[[Título da outra nota|texto que aparece]]`.
- O link acha a nota pelo título, sem ligar para maiúsculas e acentos. Primeiro procura na mesma
  matéria; depois nas outras. Para forçar outra matéria: `[[anatomia/Plexo braquial]]`.
- **Toda nota deve ligar para pelo menos uma outra e ser ligada por alguma.** Ligue quando uma nota
  usa um conceito que outra explica — no meio da frase, não numa lista no fim.
- Link para nota que ainda não existe aparece como texto e vira link sozinho quando a nota for criada.

### 3.4 O que vira interativo no leitor

Nada disto precisa de marcação extra: o leitor transforma o que você escreveu.

| Você escreve | O aluno ganha |
|---|---|
| `**negrito**` e `==grifo==` | Lacunas do modo **Testar-se**: o termo some e volta com um clique. Ponha em negrito só o que é para lembrar (um termo, um número), nunca a frase inteira. |
| Tabela | Clicar no título de uma coluna a esconde para se testar. A primeira coluna é a chave e fica sempre visível: ponha nela o que se pergunta ("Pilar", "Artéria"), e nas outras o que se responde. |
| Lista numerada com 3 itens ou mais | Passo a passo com cada passo marcável. Use para técnicas e sequências. |
| Lista dentro de `[!essencial]` | Cada item vira um "já sei" que fica guardado. Escreva um fato por item. |
| `> [!tipo]- Título` (com o hífen) | O bloco começa recolhido. Bom para o gabarito de um caso clínico. |
| `[[Outra nota]]` | Passar o mouse mostra o resumo; clicar abre a nota ao lado, sem sair da leitura. |
| `[!flashcard]` | Além do baralho com repetição espaçada, as cartas da nota viram no fim da leitura. |
| Duas ou mais `[!questao]` | Placar de acertos da nota. |

Dentro de uma tabela, o link com apelido precisa da barra escapada: `[[Título\|texto]]`.

### 3.5 Nota-mapa do módulo

Cada módulo começa com uma nota `tipo: mapa` (arquivo `00 - Mapa - <módulo>.md`): um bloco
`[!objetivos]` com o que se aprende ali e uma lista curta ligando para cada nota do módulo, na ordem
de estudo. Ela não precisa de flashcards. No leitor, ela ganha sozinha o grafo do módulo.

## 4. Regras de qualidade (o validador cobra)

| Regra | Limite |
|---|---|
| Tamanho da nota | ideal 150–450 palavras; **aviso** acima de 650; **erro** acima de 1300 |
| `resumo` | obrigatório |
| Título | único na matéria |
| Flashcards | 2 a 6 por nota; pergunta e resposta preenchidas; resposta curta (aviso acima de 60 palavras) |
| Questão de múltipla escolha | 2+ alternativas, exatamente uma `- [x]` |
| Nota com `prova: true` | precisa de um bloco `[!essencial]` |
| Figuras | o arquivo precisa estar em `anexos/`; até 4 MB |
| Links | aviso se a nota não liga nem é ligada por ninguém |

## 5. Como escrever um bom resumo (o padrão do Sinapse)

O resumo existe para **quem vai fazer prova**: curto, organizado e fiel ao material.

1. **Fidelidade.** Só entra o que está no material-fonte. Explicações extras só para dar sentido ao
   que o material já diz. Nada de inventar número, dose, data ou nome.
2. **Curto.** O material tem 30 slides sobre um tema; a nota tem o que sobra depois de cortar
   repetição, floreio e curiosidade. Prefira tabela e lista a parágrafo.
3. **Atômico.** Uma ideia por nota, título que diz a ideia ("Os três pilares do medo", não "Aula 1 — parte 3").
4. **Anatomia de uma nota:** `[!ideia]` → 1 a 3 seções curtas (tabela/lista, com `[!definicao]`,
   `[!prova]`, `[!atencao]`, `[!pratica]` onde couber) → `[!essencial]` (se for de prova) → 1 `[!questao]`
   → 2 a 6 `[!flashcard]`.
5. **Conteúdo de prova.** Marque `prova: true` no que o dono da matéria disse que cai (e no que o
   material destaca como "cai em prova"). `prioridade: alta` para o que é certo de cair. O bloco
   `[!essencial]` é uma cola honesta: 3 a 6 itens que, sozinhos, salvam a questão.
6. **Flashcards** cobram uma coisa só, com resposta que cabe numa linha. Bons: "Quem introduziu a
   ligadura de vasos?" Ruins: "Fale sobre Ambroise Paré."
7. **Português do Brasil, direto.** Sem "nesta nota veremos"; comece pelo conteúdo.

## 6. PDF pronto, sem virar nota

Um resumo que já existe em PDF pode entrar como está: no painel (Admin › Importar › PDF direto), ou
dentro de um pacote, de dois jeitos:

- solte o `.pdf` dentro da pasta de um módulo: ele vira uma nota de leitura com o nome do arquivo;
- ou crie uma nota `.md` com a propriedade `pdf: anexos/arquivo.pdf` (assim ela pode ter resumo,
  flashcards e marcação de prova).

O PDF é lido dentro da plataforma, página a página, sem botão de baixar.
