/**
 * Quanto vai no próximo lote, e por que não vai quando não vai.
 *
 * Vive fora da tela porque é a conta que decide quantas mensagens saem. Errar
 * aqui não aparece como layout torto — aparece como gente recebendo duas vezes,
 * ou como uma campanha que trava sem dizer o motivo.
 *
 * O lote é a cota que sobra do dia, não um número fixo de 200. Os dois
 * coincidem no caso comum (limite 200, nada usado), mas amarrar ao 200 mentiria
 * em dois casos reais: quando parte da cota já foi gasta em outro disparo, e
 * quando a clínica sobe o limite na tela de Campanhas. A cota é o teto de
 * verdade — `whatsapp-broadcast/index.ts` recusa a criação quando
 * `usadoHoje + selecionados > limite` —, então é ela que manda.
 */

export type MotivoDeBloqueio = "cota" | "concluido" | "carregando";

export interface EstadoDoLote {
  /** Total do recorte atual (DDD, busca e escopo já aplicados). */
  total: number;
  /** Já enviados ou já na fila — não entram de novo. */
  tratados: number;
  /** Ainda não tratados. É de onde o lote sai. */
  restantes: number;
  /** Quanto sobra da cota de hoje. */
  cotaRestante: number;
  /** Quantos vão agora. `0` significa bloqueado — veja `motivo`. */
  tamanho: number;
  /** Só preenchido quando `tamanho` é 0. */
  motivo: MotivoDeBloqueio | null;
  /** Este lote fecha o recorte — é o "número quebrado" do fim. */
  ultimo: boolean;
  /** 0 a 1, para a barra de progresso. */
  progresso: number;
  rotulo: string;
}

export function calcularLote({
  total,
  restantes,
  limite,
  usadoHoje,
  carregando = false,
}: {
  total: number;
  restantes: number;
  limite: number;
  usadoHoje: number;
  /** A base ainda está chegando: o total é um alvo móvel e o lote esperaria. */
  carregando?: boolean;
}): EstadoDoLote {
  const tratados = Math.max(0, total - restantes);
  const cotaRestante = Math.max(0, limite - usadoHoje);
  const progresso = total > 0 ? tratados / total : 0;
  const base = { total, tratados, restantes, cotaRestante, progresso };

  if (restantes <= 0) {
    return { ...base, tamanho: 0, motivo: "concluido", ultimo: false, rotulo: "Todos já receberam" };
  }
  if (carregando) {
    return { ...base, tamanho: 0, motivo: "carregando", ultimo: false, rotulo: "Aguardando a base carregar" };
  }
  if (cotaRestante <= 0) {
    return { ...base, tamanho: 0, motivo: "cota", ultimo: false, rotulo: "Cota de hoje esgotada" };
  }

  const tamanho = Math.min(cotaRestante, restantes);
  const ultimo = tamanho === restantes;

  // Três frases, porque são três situações diferentes para quem lê:
  // "os 150" (cabe tudo de uma vez), "os últimos 8" (fecha a campanha) e
  // "os próximos 200" (ainda vai ter mais depois deste).
  const rotulo = !ultimo
    ? `Enviar para os próximos ${tamanho}`
    : tratados === 0
      ? `Enviar para os ${tamanho}`
      : `Enviar para os últimos ${tamanho}`;

  return { ...base, tamanho, motivo: null, ultimo, rotulo };
}

/**
 * Quando a cota vira. A Edge Function conta o dia em America/São_Paulo (foi
 * corrigido junto com o corte que estava em UTC), então o texto precisa falar
 * da meia-noite de Brasília, não da meia-noite do relógio de quem lê.
 */
export function horasAteVirarACota(agora = new Date()): number {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(agora);
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? 0);
  return 24 - hora;
}
