// Modelos prontos de automação.
//
// Montar o fluxo de confirmação à mão são seis cards, três condições e três
// mensagens — trabalho suficiente para a pessoa desistir antes de ver a
// automação funcionando uma vez. O modelo entrega o fluxo desenhado e deixa o
// trabalho onde ele tem valor: escrever o texto da clínica.
//
// O que sai daqui é uma automação NORMAL. Depois de criada não há vínculo com
// o modelo, nada é "gerenciado" — cada card é editável e removível como
// qualquer outro. É semente, não template vivo.
import type {
  AutomationEdge,
  AutomationNode,
} from "@/lib/atendimentos/automations.functions";
import type { AutomationEvent } from "@/lib/atendimentos/automation-events";

export interface ModeloDeAutomacao {
  id: string;
  nome: string;
  descricao: string;
  triggerEvent: AutomationEvent;
  nodes: AutomationNode[];
  edges: AutomationEdge[];
}

/** Coluna e linha do canvas. Espaçamento generoso porque um card de condição
 *  com dois ramos ocupa mais altura do que parece no código. */
const X = (coluna: number) => coluna * 320;
const Y = (linha: number) => linha * 190;

const no = (
  id: string,
  type: AutomationNode["type"],
  coluna: number,
  linha: number,
  data: AutomationNode["data"],
): AutomationNode => ({ id, type, position: { x: X(coluna), y: Y(linha) }, data });

const liga = (source: string, target: string, handle?: string): AutomationEdge => ({
  id: `e-${source}-${handle ?? "x"}-${target}`,
  source,
  target,
  sourceHandle: handle ?? null,
});

const LEMBRETE_3_DIAS =
  "Oi {{nome}}! Passando para lembrar da sua consulta em {{data}}, às {{hora}}, " +
  "na {{unidade}}. Qualquer coisa é só chamar por aqui.";

const LEMBRETE_24H =
  "Oi {{nome}}! Sua consulta é amanhã, {{data}} às {{hora}}, na {{unidade}}.\n\n" +
  "Você confirma sua presença? Responda SIM para confirmar ou NÃO se precisar remarcar.";

const LEMBRETE_HOJE =
  "Oi {{nome}}! Sua consulta é hoje às {{hora}}, na {{unidade}} ({{endereco}}). Até já!";

export const MODELOS: ModeloDeAutomacao[] = [
  {
    id: "lembretes",
    nome: "Lembretes de consulta",
    descricao:
      "Avisa 3 dias antes, 1 dia antes (pedindo confirmação) e no dia da consulta.",
    triggerEvent: "appointment.reminder_due",
    nodes: [
      no("trigger", "trigger", 0, 1, {}),
      no("c3", "condition", 1, 1, { field: "daysUntil", operator: "eq", value: "3" }),
      no("m3", "action", 2, 0, { action: { type: "send_whatsapp", message: LEMBRETE_3_DIAS } }),
      no("c1", "condition", 2, 2, { field: "daysUntil", operator: "eq", value: "1" }),
      no("m1", "action", 3, 1, { action: { type: "send_whatsapp", message: LEMBRETE_24H } }),
      no("c0", "condition", 3, 3, { field: "daysUntil", operator: "eq", value: "0" }),
      no("m0", "action", 4, 3, { action: { type: "send_whatsapp", message: LEMBRETE_HOJE } }),
    ],
    edges: [
      liga("trigger", "c3"),
      liga("c3", "m3", "sim"),
      liga("c3", "c1", "nao"),
      liga("c1", "m1", "sim"),
      liga("c1", "c0", "nao"),
      liga("c0", "m0", "sim"),
    ],
  },
  {
    id: "resposta",
    nome: "Resposta de confirmação",
    descricao:
      "Lê o SIM ou NÃO do paciente e marca o agendamento na agenda automaticamente.",
    triggerEvent: "whatsapp.reply_received",
    nodes: [
      no("trigger", "trigger", 0, 1, {}),
      no("csim", "condition", 1, 1, { field: "replyText", operator: "contains", value: "sim" }),
      no("confirmar", "action", 2, 0, {
        action: { type: "set_appointment_status", appointmentStatus: "confirmed" },
      }),
      no("cnao", "condition", 2, 2, {
        field: "replyText",
        operator: "contains",
        value: "nao",
      }),
      // "Não" não cancela: devolve para pendente e chama a equipe. Um "não
      // posso às 14h" viraria cadeira vazia se o cancelamento fosse automático.
      no("pendente", "action", 3, 1, {
        action: { type: "set_appointment_status", appointmentStatus: "pending" },
      }),
      no("aviso", "action", 4, 1, {
        action: {
          type: "send_push",
          pushTitle: "Paciente quer remarcar",
          pushBody: "{{nome}} respondeu: {{resposta}}",
        },
      }),
      no("duvida", "action", 3, 3, {
        action: {
          type: "send_push",
          pushTitle: "Resposta não entendida",
          pushBody: "{{nome}} respondeu: {{resposta}}",
        },
      }),
    ],
    edges: [
      liga("trigger", "csim"),
      liga("csim", "confirmar", "sim"),
      liga("csim", "cnao", "nao"),
      liga("cnao", "pendente", "sim"),
      liga("pendente", "aviso"),
      liga("cnao", "duvida", "nao"),
    ],
  },
];
