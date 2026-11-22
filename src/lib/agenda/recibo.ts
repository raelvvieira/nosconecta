// O recibo do atendimento, em PDF.
//
// Roda no Worker (Cloudflare) com o escritor de PDF mínimo de `pdf-minimo.ts`.
// Nada de `fs`, `canvas`, `puppeteer` — e nada de `pdf-lib`, que não carrega no
// Worker (ver o comentário em `pdf-minimo.ts`).
//
// O que não pode acontecer: o PDF sair com caractere que a fonte padrão não
// desenha (o caractere simplesmente não sai), valor por
// extenso errado num documento que o paciente guarda, ou data com fuso e cair
// um dia antes.
import { PaginaPdf, larguraDoTexto, type Cor, type Fonte } from "./pdf-minimo";
import { LOGO_NOS } from "./recibo-logo";

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
  /**
   * `completo` (padrão): o total do atendimento, com o sinal discriminado quando
   * houve. `sinal`: só o que foi pago de sinal — `valor` é a soma dos sinais.
   */
  tipo?: "sinal" | "completo";
  /**
   * Quando o atendimento foi pago em mais de uma forma: cada parte com o seu
   * valor ("R$ 600,00 - Pix", "R$ 640,00 - Cartão em 3x"). Com uma forma só,
   * fica vazio e vale `formaDePagamento`.
   */
  pagamentos?: { valor: number; forma: string | null }[];
  /** O que foi feito, item a item, com a quantidade quando informada. */
  itens?: { nome: string; quantidade: string | null }[];
  /** Os sinais pagos, para discriminar no recibo. */
  sinais?: { valor: number; data: string; forma: string | null }[];
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

/** Quebra o texto em linhas que cabem na largura. */
function quebrar(texto: string, fonte: Fonte, tamanho: number, largura: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (larguraDoTexto(tentativa, fonte, tamanho) <= largura) atual = tentativa;
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
  const pagina = new PaginaPdf();
  const { largura: width, altura: height } = pagina;
  const tinta: Cor = [0.11, 0.11, 0.12];
  const suave: Cor = [0.45, 0.45, 0.48];
  const linha: Cor = [0.88, 0.88, 0.9];
  const margem = 56;
  const miolo = width - margem * 2;

  const centro = (texto: string, yy: number, fonte: Fonte, tamanho: number, cor = tinta) => {
    const t = textoSeguro(texto);
    pagina.texto(t, (width - larguraDoTexto(t, fonte, tamanho)) / 2, yy, tamanho, fonte, cor);
  };
  const regua = (yy: number, espessura = 0.5) =>
    pagina.linha(margem, yy, width - margem, yy, espessura, linha);

  // ── Logo centralizado no topo ──────────────────────────────────────────
  const larguraLogo = 150;
  const alturaLogo = (LOGO_NOS.altura / LOGO_NOS.largura) * larguraLogo;
  let y = height - 52 - alturaLogo;
  pagina.desenharImagem(LOGO_NOS, (width - larguraLogo) / 2, y, larguraLogo, alturaLogo);

  y -= 34;
  const ehSinal = d.tipo === "sinal";
  const sinais = d.sinais ?? [];
  centro(ehSinal ? "RECIBO DE SINAL" : "RECIBO", y, "negrito", 20);
  y -= 18;
  centro(`Nº ${d.numero}`, y, "normal", 10, suave);
  y -= 22;
  regua(y, 0.8);

  // ── Valor em destaque ──────────────────────────────────────────────────
  y -= 44;
  centro(brl(d.valor), y, "negrito", 30);
  y -= 20;
  const extenso = textoSeguro(`(${valorPorExtenso(d.valor)})`);
  for (const l of quebrar(extenso, "normal", 10, miolo)) {
    centro(l, y, "normal", 10, suave);
    y -= 14;
  }

  // ── Texto do recibo ────────────────────────────────────────────────────
  y -= 18;
  const corpo = textoSeguro(
    ehSinal
      ? `Recebemos de ${d.paciente} a quantia de ${brl(d.valor)} como sinal de reserva de horário, referente a ${
          d.procedimento ? d.procedimento : "atendimento odontológico"
        }, agendado para ${dataPorExtenso(d.data)}${d.local ? `, em ${d.local}` : ""}. O valor será descontado do total do atendimento.`
      : `Recebemos de ${d.paciente} a quantia de ${brl(d.valor)} referente a ${
          d.procedimento ? d.procedimento : "atendimento odontológico"
        }, realizado em ${dataPorExtenso(d.data)}${d.local ? `, em ${d.local}` : ""}.`,
  );
  for (const l of quebrar(corpo, "normal", 11.5, miolo)) {
    pagina.texto(l, margem, y, 11.5, "normal", tinta);
    y -= 17;
  }

  // ── Detalhes ───────────────────────────────────────────────────────────
  y -= 12;
  const somaSinais = sinais.reduce((acc, s) => acc + Math.round(s.valor * 100), 0) / 100;
  const itens = (d.itens ?? []).filter((i) => i.nome.trim());
  const detalhes: [string, string | string[]][] = [
    ["Paciente", d.paciente],
    itens.length > 0
      ? [
          itens.length > 1 ? "Procedimentos" : "Procedimento",
          itens.map((i) => (i.quantidade ? `${i.nome} - ${i.quantidade}` : i.nome)),
        ]
      : ["Procedimento", d.procedimento ?? "-"],
    ["Profissional", d.profissional ?? "-"],
    [ehSinal ? "Atendimento agendado para" : "Data do atendimento", dataPorExtenso(d.data)],
    ["Local", d.local ?? d.clinica],
  ];
  // Pago em duas formas: uma linha por forma, com o valor de cada uma.
  const partes = (d.pagamentos ?? []).filter((p) => p.valor > 0);
  const linhasDasPartes = partes.map((p) => `${brl(p.valor)}${p.forma ? ` - ${p.forma}` : ""}`);
  if (!ehSinal && sinais.length > 0) {
    // A composição do total: o que foi pago no atendimento e o que foi pago antes.
    detalhes.push([
      "Pago no atendimento",
      partes.length > 1
        ? linhasDasPartes
        : `${brl(Math.max(0, Math.round((d.valor - somaSinais) * 100) / 100))}${d.formaDePagamento ? ` - ${d.formaDePagamento}` : ""}`,
    ]);
    for (const s of sinais)
      detalhes.push([
        "Sinal",
        `${brl(s.valor)} - pago em ${dataPorExtenso(s.data)}${s.forma ? ` (${s.forma})` : ""}`,
      ]);
    detalhes.push(["Total", brl(d.valor)]);
  } else if (!ehSinal && partes.length > 1) {
    detalhes.push(["Formas de pagamento", linhasDasPartes]);
    detalhes.push(["Total", brl(d.valor)]);
  } else {
    detalhes.push(["Forma de pagamento", d.formaDePagamento || "-"]);
  }
  for (const [rotulo, valor] of detalhes) {
    regua(y + 14);
    pagina.texto(textoSeguro(rotulo), margem, y, 9.5, "normal", suave);
    const linhasV = (Array.isArray(valor) ? valor : [valor]).flatMap((v) =>
      quebrar(textoSeguro(v), "negrito", 10.5, miolo - 150),
    );
    linhasV.forEach((l, i) => pagina.texto(l, margem + 150, y - i * 13, 10.5, "negrito", tinta));
    y -= 14 + Math.max(0, linhasV.length - 1) * 13 + 12;
  }
  regua(y + 14);

  // ── Assinatura / emissão ───────────────────────────────────────────────
  y -= 54;
  pagina.linha(width / 2 - 110, y, width / 2 + 110, y, 0.8, tinta);
  y -= 14;
  centro(d.clinica, y, "negrito", 10.5);
  if (d.local) {
    y -= 13;
    centro(d.local, y, "normal", 9, suave);
  }

  centro(`Recibo emitido em ${dataPorExtenso(d.emitidoEm)}`, 44, "normal", 8.5, suave);

  return pagina.gerar(`Recibo ${d.numero}`, textoSeguro(d.clinica));
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
