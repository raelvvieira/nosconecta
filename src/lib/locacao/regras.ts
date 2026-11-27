// Regras puras da locação de salas. Horários são "AAAA-MM-DDTHH:mm" na hora
// local da clínica (sem fuso), o mesmo jeito da agenda.

export type CategoriaDaSala = "estetica" | "odontologia" | "outra";

/** Sem coluna própria no cadastro das salas, a categoria sai do nome:
 *  "Maca de Estética", "Cadeira Odontológica". */
export function categoriaDaSala(nome: string | null | undefined): CategoriaDaSala {
  const n = String(nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (n.includes("odont") || n.includes("dent")) return "odontologia";
  if (n.includes("estet") || n.includes("maca")) return "estetica";
  return "outra";
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Minutos desde uma origem fixa; `null` se o texto não é um horário. */
export function emMinutos(t: string): number | null {
  const m = ISO.exec(String(t ?? ""));
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000;
}

export function horasEntre(inicio: string, fim: string): number {
  const a = emMinutos(inicio);
  const b = emMinutos(fim);
  if (a == null || b == null) return 0;
  return Math.round(((b - a) / 60) * 100) / 100;
}

/** Dois intervalos [inicio, fim) se sobrepõem? Encostar não é sobrepor. */
export function sobrepoe(
  a: { inicio: string; fim: string },
  b: { inicio: string; fim: string },
): boolean {
  const [a1, a2, b1, b2] = [
    emMinutos(a.inicio),
    emMinutos(a.fim),
    emMinutos(b.inicio),
    emMinutos(b.fim),
  ];
  if (a1 == null || a2 == null || b1 == null || b2 == null) return false;
  return a1 < b2 && b1 < a2;
}

/** O que impede este pedido, ou `null` se está bem. */
export function recusaDoPedido(inicio: string, fim: string, agora: string): string | null {
  const a = emMinutos(inicio);
  const b = emMinutos(fim);
  const n = emMinutos(agora);
  if (a == null || b == null || n == null) return "Horário inválido.";
  if (b <= a) return "O fim precisa ser depois do início.";
  if (a % 30 !== 0 || b % 30 !== 0) return "Os horários vão de 30 em 30 minutos.";
  if (a < n) return "Esse horário já passou.";
  if (inicio.slice(0, 10) !== fim.slice(0, 10)) return "A reserva precisa ser dentro de um dia.";
  if ((b - a) / 60 > 12) return "A reserva pode ter no máximo 12 horas.";
  return null;
}

/** O locatário pode cancelar até 24 horas antes do início. */
export function podeCancelar(inicio: string, agora: string): boolean {
  const a = emMinutos(inicio);
  const n = emMinutos(agora);
  if (a == null || n == null) return false;
  return a - n >= 24 * 60;
}

/** Horas realmente usadas × valor da hora, em reais com 2 casas. */
export function totalDaLocacao(horas: number, valorHora: number): number {
  if (!(horas > 0) || !(valorHora >= 0)) return 0;
  return Math.round(horas * valorHora * 100) / 100;
}

export const VALOR_HORA_PADRAO = 50;

const primeiroNome = (n: string) =>
  String(n ?? "")
    .trim()
    .split(/\s+/)[0] || "";
const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/**
 * O aviso ao paciente do locatário. Diz QUEM atende (o nome no cadastro de
 * quem está locando) e de onde vem a mensagem — o paciente recebe de um número
 * que não é o do profissional dele, então a frase precisa explicar.
 */
export function mensagemDeConfirmacao(d: {
  paciente: string;
  locatario: string;
  consultorio: string;
  unidade: string | null;
  inicio: string;
  fim: string;
}): string {
  const quando = `${dataBr(d.inicio)} às ${d.inicio.slice(11, 16)}`;
  const onde = d.unidade ? `${d.consultorio} - ${d.unidade}` : d.consultorio;
  return [
    `Olá, ${primeiroNome(d.paciente)}! Seu atendimento está confirmado para ${quando}, em ${onde}.`,
    `Quem vai te atender: ${d.locatario}.`,
    `Esta mensagem é enviada pelo WhatsApp do ${d.consultorio}, onde ${primeiroNome(d.locatario)} atende. Qualquer dúvida, é só responder por aqui.`,
  ].join("\n\n");
}
