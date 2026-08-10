import type { CampaignStatus } from "@/lib/atendimentos/campaigns.functions";

const LABEL: Record<CampaignStatus, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  running: "Em andamento",
  paused: "Pausada",
  completed: "Concluída",
  stopped: "Parada",
};

/**
 * Rótulo do status, ou "—" quando o CRM manda algo que não sabemos traduzir.
 *
 * O mapa antigo vivia na rota com um `?? c.status` no fim, e era daí que saía o
 * "4" que aparecia na tela como se fosse contagem de contatos: o CRM devolve o
 * status como número em algumas respostas e o número cru vazava para o texto.
 * Enquanto o de-para numérico não for confirmado com o Wavy, um travessão é
 * mais honesto que um número que a pessoa vai ler como outra coisa.
 */
export function CAMPAIGN_STATUS_LABEL(status: CampaignStatus | null): string {
  return status ? LABEL[status] : "—";
}

/** A campanha está rodando agora? Só aí faz sentido pausar. */
export function podePausar(status: CampaignStatus | null): boolean {
  return status === "running";
}

/**
 * Só uma campanha pausada pode ser retomada.
 *
 * É a correção da confusão entre "Disparar" e o antigo botão de play: eles
 * apareciam lado a lado em qualquer status, com ícones parecidos, mas
 * `/execute` inicia um envio novo e consome cota diária, enquanto `/resume`
 * destrava uma execução pausada e não passa por limite nenhum.
 */
export function podeRetomar(status: CampaignStatus | null): boolean {
  return status === "paused";
}

/** Cancelar só faz sentido com algo em curso. */
export function podeCancelar(status: CampaignStatus | null): boolean {
  return status === "running" || status === "paused" || status === "scheduled";
}
