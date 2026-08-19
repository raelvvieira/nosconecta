// Vocabulário compartilhado entre a lista e o editor de automações. Mesmos
// rótulos/valores já usados em MetaTriggerSheet.tsx pro mesmo conjunto de
// SYSTEM_EVENTS — não reinventa condição nem status.
import type { SystemEvent } from "@/lib/integrations/meta-capi.functions";
import type { AutomationActionType } from "@/lib/atendimentos/automations.functions";

export const TRIGGER_LABEL: Record<SystemEvent, string> = {
  "patient.created": "Paciente cadastrado",
  "appointment.created": "Agendamento criado",
  "appointment.status_changed": "Status do agendamento mudou",
  "receivable.paid": "Recebimento pago",
  "deal.status_changed": "Negociação perdida",
  "pipeline.stage_changed": "Card mudou de etapa no funil",
};

// Curto, pra caber no card do canvas — a versão longa (TRIGGER_LABEL) fica
// pro modal de escolha e pro texto de apoio.
export const TRIGGER_LABEL_SHORT: Record<SystemEvent, string> = {
  "patient.created": "Paciente cadastrado",
  "appointment.created": "Agendamento criado",
  "appointment.status_changed": "Agendamento mudou de status",
  "receivable.paid": "Recebimento pago",
  "deal.status_changed": "Negociação perdida",
  "pipeline.stage_changed": "Card mudou de etapa",
};

export const DEAL_STATUSES = [{ value: "lost", label: "Perdido" }];

export const APPOINTMENT_STATUSES = [
  { value: "confirmed", label: "Confirmado" },
  { value: "in_progress", label: "Em atendimento" },
  { value: "completed", label: "Concluído" },
  { value: "missed", label: "Faltou" },
  { value: "cancelled", label: "Cancelado" },
];

export const ACTION_LABEL: Record<AutomationActionType, string> = {
  send_whatsapp: "Enviar mensagem de WhatsApp",
  move_pipeline_stage: "Mover para etapa do funil",
  add_deal_note: "Registrar observação na negociação",
  send_push: "Notificar a equipe",
  webhook: "Disparar webhook",
  wait: "Aguardar tempo",
};

/** Sobre quem cada ação age. É a resposta pra "esse gatilho é pra quem?":
 *  a automação sempre trata do contato daquele evento — o que muda é se a
 *  ação recai sobre ele ou sobre a clínica. */
export const ACTION_ESCOPO: Record<AutomationActionType, "pessoa" | "clinica" | "fluxo"> = {
  send_whatsapp: "pessoa",
  move_pipeline_stage: "pessoa",
  add_deal_note: "pessoa",
  send_push: "clinica",
  webhook: "clinica",
  wait: "fluxo",
};

export const ESCOPO_LABEL: Record<"pessoa" | "clinica" | "fluxo", string> = {
  pessoa: "para a pessoa do evento",
  clinica: "para a equipe da clínica",
  fluxo: "pausa o fluxo",
};

export const CONDITION_FIELD_LABEL: Record<string, string> = {
  amount: "Valor do evento",
  hasContact: "Tem paciente vinculado",
  status: "Situação do agendamento",
  stageId: "Etapa do funil",
  dealStatus: "Situação da negociação",
};

export const CONDITION_OPERATOR_LABEL: Record<string, string> = {
  gt: "maior que",
  lt: "menor que",
  eq: "igual a",
};

/** Dias da semana no índice de `getDay()` — 0=domingo. Mesma convenção do
 *  avaliador da janela na Edge Function. */
export const DIAS_SEMANA = [
  { valor: 0, curto: "Dom" },
  { valor: 1, curto: "Seg" },
  { valor: 2, curto: "Ter" },
  { valor: 3, curto: "Qua" },
  { valor: 4, curto: "Qui" },
  { valor: 5, curto: "Sex" },
  { valor: 6, curto: "Sáb" },
];

/** "2 h", "3 d", "45 min" — resumo curto pro card da ação. */
export function duracaoTexto(minutos: number): string {
  if (minutos % (60 * 24) === 0) {
    const d = minutos / (60 * 24);
    return `${d} ${d === 1 ? "dia" : "dias"}`;
  }
  if (minutos % 60 === 0) {
    const h = minutos / 60;
    return `${h} ${h === 1 ? "hora" : "horas"}`;
  }
  return `${minutos} min`;
}

// Gatilhos que podem acontecer sem paciente/contato vinculado — usado pro
// aviso na hora de escolher "Enviar WhatsApp" como ação (ver
// atendimento-automations/index.ts: resolverContatoParaEnvio).
export const TRIGGERS_SEM_CONTATO_GARANTIDO: SystemEvent[] = [
  "receivable.paid",
  "pipeline.stage_changed",
];
