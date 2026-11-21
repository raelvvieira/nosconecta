// O recibo do atendimento, em PDF.
//
// Roda no Worker (Cloudflare): só `pdf-lib`, que é JavaScript puro. Nada de
// `fs`, `canvas` ou `puppeteer`.
//
// O que não pode acontecer: o PDF sair com caractere que a fonte padrão não
// desenha (a pdf-lib LEVANTA exceção em vez de trocar por "?"), valor por
// extenso errado num documento que o paciente guarda, ou data com fuso e cair
// um dia antes.
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { LOGO_NOS_PNG_BASE64 } from "./recibo-logo";

export interface DadosDoRecibo {
  /** Número do recibo, curto e estável (ver `numeroDoRecibo`). */
  numero: string;
  clinica: string;
  /** Endereço da unidade onde foi o atendimento. */
  local: string | null;
  paciente: string;
  procedimento: string | null;
  profissional: string | null;
  /** Data do atendimento, AAAA-MM-DD. */
  data: string;
  valor: number;
  /** "Pix", "Cartão em 3x"… ou vazio quando ninguém informou. */
  formaDePagamento: string | null;
  /** Data de emissão, AAAA-MM-DD. */
  emitidoEm: string;
}

const UNIDADES = [
  "",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const DEZENAS = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
];
const CENTENAS = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(" e ");
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  // Cada bloco com o valor, para decidir o conectivo: o último bloco entra com
  // "e" quando é menor que 100 ou redondo ("mil e vinte", "mil e quinhentos");
  // fora disso, só espaço ("mil duzentos e trinta").
  const blocos: { texto: string; valor: number }[] = [];
  if (milhoes)
    blocos.push({ texto: milhoes === 1 ? "um milhão" : `${ate999(milhoes)} milhões`, valor: 1000 });
  if (milhares)
    blocos.push({ texto: milhares === 1 ? "mil" : `${ate999(milhares)} mil`, valor: 1000 });
  if (resto) blocos.push({ texto: ate999(resto), valor: resto });
  let saida = blocos[0].texto;
  for (let i = 1; i < blocos.length; i++) {
    const v = blocos[i].valor;
    const ultimo = i === blocos.length - 1;
    const comE = ultimo && (v < 100 || v % 100 === 0);
    saida += `${comE ? " e " : " "}${blocos[i].texto}`;
  }
  return saida;
}

/** "R$ 320,50" → "trezentos e vinte reais e cinquenta centavos". */
export function valorPorExtenso(valor: number): string {
  const centavosTotais = Math.round(Math.max(0, valor) * 100);
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;
  const partesReais = reais
    ? `${inteiroPorExtenso(reais)} ${reais === 1 ? "real" : reais % 1_000_000 === 0 ? "de reais" : "reais"}`
    : "";
  const partesCentavos = centavos
    ? `${inteiroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`
    : "";
  if (!partesReais && !partesCentavos) return "zero real";
  return [partesReais, partesCentavos].filter(Boolean).join(" e ");
}

/** AAAA-MM-DD → "21 de novembro de 2026", sem passar por Date (sem fuso). */
export function dataPorExtenso(iso: string): string {
  const meses = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d) return iso;
  return `${d} de ${meses[m - 1]} de ${a}`;
}

/** Número do recibo: data do atendimento + 6 caracteres do id. Estável — o
 *  mesmo atendimento gera sempre o mesmo número, então reenviar não duplica. */
export function numeroDoRecibo(dataDoAtendimento: string, appointmentId: string): string {
  const sufixo = appointmentId
    .replace(/[^a-z0-9]/gi, "")
    .slice(-6)
    .toUpperCase();
  return `${dataDoAtendimento.replace(/-/g, "")}-${sufixo}`;
}

/** Só o que a fonte padrão (WinAnsi) desenha: troca o resto por equivalentes. */
export function textoSeguro(texto: string): string {
  return texto
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x20-\x7e¡-ÿ]/g, "");
}

const brl = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function base64ParaBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Quebra o texto em linhas que cabem na largura. */
function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) atual = tentativa;
    else {
      if (atual) linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** O PDF do recibo (A4, uma página). */
export async function montarReciboPdf(d: DadosDoRecibo): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Recibo ${d.numero}`);
  pdf.setAuthor(textoSeguro(d.clinica));
  const pagina = pdf.addPage([595.28, 841.89]);
  const { width, height } = pagina.getSize();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const tinta = rgb(0.11, 0.11, 0.12);
  const suave = rgb(0.45, 0.45, 0.48);
  const linha = rgb(0.88, 0.88, 0.9);
  const margem = 56;
  const miolo = width - margem * 2;

  // ── Logo centralizado no topo ──────────────────────────────────────────
  const logo = await pdf.embedPng(base64ParaBytes(LOGO_NOS_PNG_BASE64));
  const larguraLogo = 150;
  const alturaLogo = (logo.height / logo.width) * larguraLogo;
  let y = height - 52 - alturaLogo;
  pagina.drawImage(logo, {
    x: (width - larguraLogo) / 2,
    y,
    width: larguraLogo,
    height: alturaLogo,
  });

  const centro = (texto: string, yy: number, fonte: PDFFont, tamanho: number, cor = tinta) => {
    const t = textoSeguro(texto);
    pagina.drawText(t, {
      x: (width - fonte.widthOfTextAtSize(t, tamanho)) / 2,
      y: yy,
      size: tamanho,
      font: fonte,
      color: cor,
    });
  };

  y -= 34;
  centro("RECIBO", y, negrito, 20);
  y -= 18;
  centro(`Nº ${d.numero}`, y, normal, 10, suave);
  y -= 22;
  pagina.drawLine({
    start: { x: margem, y },
    end: { x: width - margem, y },
    thickness: 0.8,
    color: linha,
  });

  // ── Valor em destaque ──────────────────────────────────────────────────
  y -= 44;
  centro(brl(d.valor), y, negrito, 30);
  y -= 20;
  const extenso = textoSeguro(`(${valorPorExtenso(d.valor)})`);
  const linhasExtenso = quebrar(extenso, normal, 10, miolo);
  for (const l of linhasExtenso) {
    centro(l, y, normal, 10, suave);
    y -= 14;
  }

  // ── Texto do recibo ────────────────────────────────────────────────────
  y -= 18;
  const corpo = textoSeguro(
    `Recebemos de ${d.paciente} a quantia de ${brl(d.valor)} referente a ${
      d.procedimento ? d.procedimento : "atendimento odontologico"
    }, realizado em ${dataPorExtenso(d.data)}${d.local ? `, em ${d.local}` : ""}.`,
  );
  for (const l of quebrar(corpo, normal, 11.5, miolo)) {
    pagina.drawText(l, { x: margem, y, size: 11.5, font: normal, color: tinta });
    y -= 17;
  }

  // ── Detalhes ───────────────────────────────────────────────────────────
  y -= 12;
  const detalhes: [string, string][] = [
    ["Paciente", d.paciente],
    ["Procedimento", d.procedimento ?? "-"],
    ["Profissional", d.profissional ?? "-"],
    ["Data do atendimento", dataPorExtenso(d.data)],
    ["Local", d.local ?? d.clinica],
    ["Forma de pagamento", d.formaDePagamento || "-"],
  ];
  for (const [rotulo, valor] of detalhes) {
    pagina.drawLine({
      start: { x: margem, y: y + 14 },
      end: { x: width - margem, y: y + 14 },
      thickness: 0.5,
      color: linha,
    });
    pagina.drawText(textoSeguro(rotulo), { x: margem, y, size: 9.5, font: normal, color: suave });
    const v = textoSeguro(valor);
    const linhasV = quebrar(v, negrito, 10.5, miolo - 150);
    linhasV.forEach((l, i) =>
      pagina.drawText(l, {
        x: margem + 150,
        y: y - i * 13,
        size: 10.5,
        font: negrito,
        color: tinta,
      }),
    );
    y -= 14 + Math.max(0, linhasV.length - 1) * 13 + 12;
  }
  pagina.drawLine({
    start: { x: margem, y: y + 14 },
    end: { x: width - margem, y: y + 14 },
    thickness: 0.5,
    color: linha,
  });

  // ── Assinatura / emissão ───────────────────────────────────────────────
  y -= 54;
  pagina.drawLine({
    start: { x: width / 2 - 110, y },
    end: { x: width / 2 + 110, y },
    thickness: 0.8,
    color: tinta,
  });
  y -= 14;
  centro(d.clinica, y, negrito, 10.5);
  if (d.local) {
    y -= 13;
    centro(d.local, y, normal, 9, suave);
  }

  centro(`Recibo emitido em ${dataPorExtenso(d.emitidoEm)}`, 44, normal, 8.5, suave);

  return await pdf.save();
}

/** O método gravado no financeiro → o texto do recibo. */
export function rotuloDoMetodo(metodo: unknown, parcelas: unknown): string | null {
  const m = String(metodo ?? "").toLowerCase();
  const n = Number(parcelas);
  if (m === "pix") return "Pix";
  if (m === "cash") return "Dinheiro";
  if (m === "credit") return Number.isFinite(n) && n > 1 ? `Cartão em ${n}x` : "Cartão à vista";
  return null;
}
