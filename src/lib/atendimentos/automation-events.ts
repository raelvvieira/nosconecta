// Eventos que uma automação pode ouvir.
//
// Módulo próprio, e não uma seção de automations.functions.ts, por causa de
// ciclo de import: `automation-vars.ts` precisa desta união para dizer quais
// variáveis cada gatilho preenche, e `automations.functions.ts` importa
// `varsIncompativeis` de lá. Com a união aqui, ninguém importa ninguém de volta.
import { SYSTEM_EVENTS } from "@/lib/integrations/meta-capi.functions";

/**
 * Os dois eventos que existem SÓ para automação.
 *
 * Não entram em `SYSTEM_EVENTS` de propósito: aquela lista também alimenta a
 * tela de gatilhos da Meta CAPI (`MetaTriggerSheet.tsx`), e a Edge Function de
 * lá não sabe o que fazer com eles — apareceriam como opção e não fariam nada.
 */
export const AUTOMATION_ONLY_EVENTS = [
  /** Emitido pela varredura diária: agendamento a N dias daqui. */
  "appointment.reminder_due",
  /** Emitido pelo webhook de entrada quando o paciente responde no WhatsApp. */
  "whatsapp.reply_received",
] as const;

export const AUTOMATION_EVENTS = [...SYSTEM_EVENTS, ...AUTOMATION_ONLY_EVENTS] as const;
export type AutomationEvent = (typeof AUTOMATION_EVENTS)[number];

/** Gatilhos cujo contexto carrega um agendamento — e portanto unidade, data e
 *  a possibilidade de mudar o status dele. */
export const GATILHOS_COM_AGENDAMENTO: AutomationEvent[] = [
  "appointment.created",
  "appointment.status_changed",
  "appointment.reminder_due",
  // A resposta é ligada ao agendamento futuro mais próximo pelo webhook, então
  // este gatilho também chega com agendamento em mãos.
  "whatsapp.reply_received",
];

/** Só a varredura diária sabe quantos dias faltam para a consulta. */
export const GATILHOS_COM_CONTAGEM: AutomationEvent[] = ["appointment.reminder_due"];

/** Só a resposta do paciente carrega texto para comparar. */
export const GATILHOS_COM_RESPOSTA: AutomationEvent[] = ["whatsapp.reply_received"];
