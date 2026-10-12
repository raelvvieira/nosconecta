/** Tipos compartilhados entre as server functions de disparo e seus ajudantes. */

export interface BroadcastAlvo {
  contactId: string;
  conversationId: string | null;
  name: string | null;
  phone: string | null;
}

export interface BroadcastResumo {
  id: string;
  /** Nome dado no disparo. Nulo nos que vieram antes do campo existir. */
  name: string | null;
  message: string;
  status: "running" | "done" | "cancelled";
  total: number;
  enviados: number;
  falhas: number;
  pendentes: number;
  createdAt: string;
  /** Quando a fila deve terminar, pelo ritmo gravado. */
  terminaEm: string | null;
  /**
   * Quando o PRIMEIRO contato ainda na fila deve sair.
   *
   * É o que distingue "na fila, começa já" de "programada para o dia 20" —
   * duas coisas que o status `running` não separa, porque uma campanha
   * agendada é uma campanha normal com os horários no futuro. Nulo quando não
   * sobrou ninguém pendente.
   */
  proximoEnvioEm: string | null;
  /** Em quantos dias diferentes a fila restante está espalhada. 1 no caso
   *  comum; mais quando a campanha foi dividida por causa do limite diário. */
  diasRestantes: number;
}

/** Ritmo da fila. Espelha `supabase/functions/_shared/ritmo.ts`. */
export interface RitmoDoDisparo {
  minSegundos: number;
  maxSegundos: number;
  pausarACada: number;
  retomarEmMinutos: number;
}

export interface RecentRecipient {
  contactId: string;
  phone: string | null;
  sentAt: string;
  naFila: boolean;
}
