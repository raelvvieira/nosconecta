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
};

// Gatilhos que podem acontecer sem paciente/contato vinculado — usado pro
// aviso na hora de escolher "Enviar WhatsApp" como ação (ver
// atendimento-automations/index.ts: resolverContatoParaEnvio).
export const TRIGGERS_SEM_CONTATO_GARANTIDO: SystemEvent[] = [
  "receivable.paid",
  "pipeline.stage_changed",
];
