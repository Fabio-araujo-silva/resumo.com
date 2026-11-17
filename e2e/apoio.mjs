// Apoio dos testes de navegador: contas, login e arquivos de exemplo.
import { zipSync, strToU8 } from "fflate";

export const ADMIN = { email: "admin@e2e.com", senha: "admin-senha-1", nome: "Admin" };
export const ANA = { email: "ana@e2e.com", senha: "ana-senha-123", nome: "Ana Souza" };
export const BIA = { email: "bia@e2e.com", senha: "bia-senha-123", nome: "Bia Lima" };
export const DUDA = { email: "duda@e2e.com", senha: "duda-senha-123", nome: "Duda Reis" };

export async function entrar(pagina, conta) {
  await pagina.goto("/");
  await pagina.fill('input[name="email"]', conta.email);
  await pagina.fill('input[name="senha"]', conta.senha);
  await pagina.click("button.primario");
  await pagina.waitForSelector(".app");
}

// PDF mínimo e válido (com tabela xref), uma frase por página.
export function pdfDeTeste(paginas = ["Pagina um", "Pagina dois"]) {
  const corpos = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const filhos = [];
  for (const texto of paginas) {
    const fluxo = `BT /F1 22 Tf 30 150 Td (${texto.replace(/[()\\]/g, "")}) Tj ET`;
    const nPagina = corpos.length + 1;
    filhos.push(`${nPagina} 0 R`);
    corpos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 3 0 R >> >> /Contents ${nPagina + 1} 0 R >>`);
    corpos.push(`<< /Length ${fluxo.length} >>\nstream\n${fluxo}\nendstream`);
  }
  corpos[1] = `<< /Type /Pages /Kids [${filhos.join(" ")}] /Count ${paginas.length} >>`;
  let pdf = "%PDF-1.4\n";
  const posicoes = [];
  corpos.forEach((c, i) => {
    posicoes.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${c}\nendobj\n`;
  });
  const inicioXref = pdf.length;
  pdf += `xref\n0 ${corpos.length + 1}\n0000000000 65535 f \n` + posicoes.map((p) => String(p).padStart(10, "0") + " 00000 n \n").join("");
  pdf += `trailer\n<< /Size ${corpos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

const palavras = (n) => Array.from({ length: n }, (_, i) => "termo" + i).join(" ");

// Nota com tudo o que o leitor torna interativo: tabela, passo a passo, blocos, essencial, questões.
export const NOTA_INTERATIVA = `---
titulo: "Nervo ulnar"
resumo: "Do fascículo medial ao dedo mínimo: trajeto, lesão e exame."
prova: true
prioridade: alta
---

> [!ideia]
> O **nervo ulnar** nasce do **fascículo medial** e passa atrás do epicôndilo medial. Veja o [[Plexo braquial]].

## Trajeto e lesão

| Local | Sinal | Causa comum |
|---|---|---|
| Cotovelo | **garra ulnar** | fratura do epicôndilo |
| Punho | atrofia hipotenar | compressão no canal de Guyon |
| Mão | sinal de Froment | paralisia do adutor do polegar |

${palavras(30)} e ==túnel cubital== no fim.

## Exame

1. Inspecionar a mão em repouso.
2. Testar a adução do polegar.
3. Pesquisar o sinal de Froment.
4. Comparar com o lado oposto.

> [!prova] Pegadinha clássica
> A garra é pior na lesão **distal**.

> [!exemplo]- Caso da aula
> Ciclista com parestesia no quinto dedo.

> [!essencial]
> - Raiz: C8 e T1.
> - Passa atrás do epicôndilo medial.

> [!questao] De qual fascículo nasce o nervo ulnar?
> - [ ] Lateral
> - [x] Medial
> - [ ] Posterior
>
> Nasce do fascículo medial.

> [!questao] Qual sinal testa o adutor do polegar?
> - [x] Froment
> - [ ] Tinel
>
> O sinal de Froment.

> [!flashcard] De onde nasce o nervo ulnar?
> Do fascículo medial.

> [!flashcard] Qual sinal indica paralisia do adutor do polegar?
> Sinal de Froment.
`;

// Pacote de uma matéria nova, para o teste de importação pelo painel.
export function zipBioquimica({ comErro = false } = {}) {
  const nota = (titulo, extra) =>
    `---\n${comErro && titulo === "Glicólise" ? "" : `resumo: "Resumo de ${titulo}."\n`}prova: ${titulo === "Glicólise"}\n---\n\n> [!ideia]\n> Ideia de ${titulo}.\n\n${palavras(50)} ${extra}\n\n> [!essencial]\n> - Ponto essencial de ${titulo}.\n\n> [!flashcard] O que é ${titulo}?\n> Uma via metabólica.\n`;
  return Buffer.from(
    zipSync({
      "bioquimica/materia.yml": strToU8("formato: 1\nslug: bioquimica\nnome: Bioquímica\nsemestre: 2\n"),
      "bioquimica/01 - Metabolismo/01 - Glicólise.md": strToU8(nota("Glicólise", "Segue para o [[Ciclo de Krebs]].")),
      "bioquimica/01 - Metabolismo/02 - Ciclo de Krebs.md": strToU8(nota("Ciclo de Krebs", "Vem da [[Glicólise]].")),
    })
  );
}
