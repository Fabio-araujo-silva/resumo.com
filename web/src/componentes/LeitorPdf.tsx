// Leitor de PDF embutido: as páginas são desenhadas em <canvas> (sem camada de texto, sem botão de
// baixar, sem abrir em outra aba). O arquivo chega embaralhado e só existe aberto na memória.
import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import urlTrabalhador from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { baixarPdf, mensagem } from "../lib/api";
import { Carregando } from "./ui";

pdfjs.GlobalWorkerOptions.workerSrc = urlTrabalhador;
type Doc = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;

function Pagina({ doc, numero, zoom }: { doc: Doc; numero: number; zoom: number }) {
  const tela = useRef<HTMLCanvasElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const [proporcao, setProporcao] = useState(1.414);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setVisivel(true), { rootMargin: "600px 0px" });
    if (caixa.current) obs.observe(caixa.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visivel) return;
    let cancelado = false;
    let tarefa: { cancel: () => void; promise: Promise<unknown> } | null = null;
    (async () => {
      const pagina = await doc.getPage(numero);
      if (cancelado || !tela.current || !caixa.current) return;
      const base = pagina.getViewport({ scale: 1 });
      setProporcao(base.height / base.width);
      const largura = caixa.current.clientWidth;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const vp = pagina.getViewport({ scale: (largura / base.width) * dpr });
      const c = tela.current;
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      const g = c.getContext("2d");
      if (!g) return;
      tarefa = pagina.render({ canvasContext: g, viewport: vp });
      await tarefa.promise.catch(() => {});
    })();
    return () => {
      cancelado = true;
      tarefa?.cancel();
    };
  }, [doc, numero, visivel, zoom]);

  return (
    <div className="pdf-pagina" ref={caixa} style={{ aspectRatio: `1 / ${proporcao}` }} data-pagina={numero}>
      <canvas ref={tela} />
      <span className="pdf-num">{numero}</span>
    </div>
  );
}

export default function LeitorPdf({ notaId }: { notaId: string }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [erro, setErro] = useState("");
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let vivo = true;
    let aberto: Doc | null = null;
    setDoc(null);
    setErro("");
    baixarPdf(notaId)
      .then((bytes) => pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise)
      .then((d) => {
        aberto = d;
        if (vivo) setDoc(d);
        else d.destroy();
      })
      .catch((e) => vivo && setErro(mensagem(e)));
    return () => {
      vivo = false;
      aberto?.destroy();
    };
  }, [notaId]);

  if (erro) return <div className="pdf-erro">{erro}</div>;
  if (!doc) return <Carregando texto="Abrindo o PDF…" />;
  return (
    <div className="pdf">
      <div className="pdf-barra">
        <span data-testid="pdf-paginas">{doc.numPages} {doc.numPages === 1 ? "página" : "páginas"}</span>
        <div>
          <button type="button" className="botao pequeno fantasma" onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))} aria-label="Diminuir">−</button>
          <span className="pdf-zoom">{Math.round(zoom * 100)}%</span>
          <button type="button" className="botao pequeno fantasma" onClick={() => setZoom((z) => Math.min(2.4, z + 0.2))} aria-label="Aumentar">+</button>
        </div>
      </div>
      <div className="pdf-rolagem">
        <div className="pdf-paginas" style={{ width: zoom * 100 + "%" }}>
          {Array.from({ length: doc.numPages }, (_, i) => (
            <Pagina key={i} doc={doc} numero={i + 1} zoom={zoom} />
          ))}
        </div>
      </div>
    </div>
  );
}
