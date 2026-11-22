// Um escritor de PDF mínimo: uma página, texto em Helvetica, linhas e uma imagem.
//
// Existe no lugar do `pdf-lib`, que QUEBRA ao carregar no Worker da Cloudflare:
// o `tslib` que ele embute é um módulo UMD, e o empacotador o transforma num
// `default` indefinido — "Cannot destructure property '__extends'" na hora do
// import, o que derrubava a função inteira (reproduzido no workerd).
//
// Sem dependências: só strings e bytes.

export type Fonte = "normal" | "negrito";

// Larguras (em milésimos de em) da Helvetica e da Helvetica-Bold, ASCII 32..126.
// Letra acentuada tem a mesma largura da letra base.
const LARGURA_NORMAL = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const LARGURA_NEGRITO = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Largura de um texto, em pontos. */
export function larguraDoTexto(texto: string, fonte: Fonte, tamanho: number): number {
  const tabela = fonte === "negrito" ? LARGURA_NEGRITO : LARGURA_NORMAL;
  let soma = 0;
  for (const c of texto.normalize("NFD").replace(/[̀-ͯ]/g, "")) {
    const cod = c.charCodeAt(0);
    soma += cod >= 32 && cod <= 126 ? tabela[cod - 32] : 556;
  }
  return (soma * tamanho) / 1000;
}

export type Cor = [number, number, number];

const f = (n: number) => (Math.round(n * 100) / 100).toString();
const cor = (c: Cor) => `${f(c[0])} ${f(c[1])} ${f(c[2])}`;

/** Texto → bytes Latin-1 (WinAnsi), escapando ( ) e \. */
function stringPdf(texto: string): string {
  let s = "";
  for (const c of texto) {
    const cod = c.charCodeAt(0);
    if (c === "(" || c === ")" || c === "\\") s += `\\${c}`;
    else if (cod >= 32 && cod <= 255) s += c;
  }
  return `(${s})`;
}

function bytesDeLatin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function base64ParaBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface ImagemCinza {
  largura: number;
  altura: number;
  /** Pixels de 8 bits em tons de cinza, comprimidos com zlib, em base64. */
  flateBase64: string;
}

/** Uma página A4 (ou do tamanho dado), montada de comandos simples. */
export class PaginaPdf {
  private comandos: string[] = [];
  private imagem: { dados: ImagemCinza } | null = null;

  constructor(
    readonly largura = 595.28,
    readonly altura = 841.89,
  ) {}

  texto(t: string, x: number, y: number, tamanho: number, fonte: Fonte, c: Cor) {
    this.comandos.push(
      `BT /${fonte === "negrito" ? "F2" : "F1"} ${f(tamanho)} Tf ${cor(c)} rg ${f(x)} ${f(y)} Td ${stringPdf(t)} Tj ET`,
    );
  }

  linha(x1: number, y1: number, x2: number, y2: number, espessura: number, c: Cor) {
    this.comandos.push(`${cor(c)} RG ${f(espessura)} w ${f(x1)} ${f(y1)} m ${f(x2)} ${f(y2)} l S`);
  }

  desenharImagem(dados: ImagemCinza, x: number, y: number, largura: number, altura: number) {
    this.imagem = { dados };
    this.comandos.push(`q ${f(largura)} 0 0 ${f(altura)} ${f(x)} ${f(y)} cm /Im1 Do Q`);
  }

  /** O arquivo PDF inteiro. */
  gerar(titulo: string, autor: string): Uint8Array {
    const partes: Uint8Array[] = [];
    const offsets: number[] = [];
    let tamanho = 0;
    const adicionar = (b: Uint8Array | string) => {
      const bytes = typeof b === "string" ? bytesDeLatin1(b) : b;
      partes.push(bytes);
      tamanho += bytes.length;
    };
    const objeto = (n: number, corpo: string, stream?: Uint8Array) => {
      offsets[n] = tamanho;
      adicionar(`${n} 0 obj\n${corpo}`);
      if (stream) {
        adicionar("\nstream\n");
        adicionar(stream);
        adicionar("\nendstream");
      }
      adicionar("\nendobj\n");
    };

    const conteudo = bytesDeLatin1(this.comandos.join("\n"));
    adicionar("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
    objeto(1, "<< /Type /Catalog /Pages 2 0 R >>");
    objeto(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    objeto(
      3,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(this.largura)} ${f(this.altura)}] ` +
        `/Resources << /Font << /F1 4 0 R /F2 5 0 R >> ${this.imagem ? "/XObject << /Im1 7 0 R >> " : ""}>> ` +
        `/Contents 6 0 R >>`,
    );
    objeto(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    objeto(
      5,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    );
    objeto(6, `<< /Length ${conteudo.length} >>`, conteudo);
    let ultimo = 6;
    if (this.imagem) {
      const d = this.imagem.dados;
      const flate = base64ParaBytes(d.flateBase64);
      objeto(
        7,
        `<< /Type /XObject /Subtype /Image /Width ${d.largura} /Height ${d.altura} ` +
          `/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${flate.length} >>`,
        flate,
      );
      ultimo = 7;
    }
    const limpo = (s: string) => s.replace(/[^\x20-\x7e]/g, "");
    objeto(
      ultimo + 1,
      `<< /Title ${stringPdf(limpo(titulo))} /Author ${stringPdf(limpo(autor))} /Producer (NOS Conecta) >>`,
    );

    const inicioXref = tamanho;
    const total = ultimo + 2;
    let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let n = 1; n < total; n++) xref += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
    adicionar(xref);
    adicionar(
      `trailer\n<< /Size ${total} /Root 1 0 R /Info ${ultimo + 1} 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`,
    );

    const saida = new Uint8Array(tamanho);
    let pos = 0;
    for (const p of partes) {
      saida.set(p, pos);
      pos += p.length;
    }
    return saida;
  }
}
