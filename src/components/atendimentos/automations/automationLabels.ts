// Vocabulário compartilhado entre a lista e o editor de automações. Mesmos
// rótulos/valores já usados em MetaTriggerSheet.tsx pro mesmo conjunto de
// SYSTEM_EVENTS — não reinventa condição nem status.
import type { AutomationEvent } from "@/lib/atendimentos/automation-events";
import type { AutomationActionType } from "@/lib/atendimentos/automations.functions";

export const TRIGGER_LABEL: Record<AutomationEvent, string> = {
  "patient.created": "Paciente cadastrado",
  "appointment.created": "Agendamento criado",
  "appointment.status_changed": "Status do agendamento mudou",
  "receivable.paid": "Recebimento pago",
  "deal.status_changed": "Negociação perdida",
  "pipeline.stage_changed": "Card mudou de etapa no funil",
  "appointment.reminder_due": "Lembrete de consulta (diário)",
  "whatsapp.reply_received": "Paciente respondeu no WhatsApp",
};

// Curto, pra caber no card do canvas — a versão longa (TRIGGER_LABEL) fica
// pro modal de escolha e pro texto de apoio.
export const TRIGGER_LABEL_SHORT: Record<AutomationEvent, string> = {
  "patient.created": "Paciente cadastrado",
  "appointment.created": "Agendamento criado",
  "appointment.status_changed": "Agendamento mudou de status",
  "receivable.paid": "Recebimento pago",
  "deal.status_changed": "Negociação perdida",
  "pipeline.stage_changed": "Card mudou de etapa",
  "appointment.reminder_due": "Lembrete de consulta",
  "whatsapp.reply_received": "Paciente respondeu",
};

export const DEAL_STATUSES = [{ value: "lost", label: "Perdido" }];

export const APPOINTMENT_STATUSES = [
  // "pending" é o estado inicial de todo agendamento e existe no banco desde
  // sempre (o webhook de entrada já filtra por ele) — só nunca tinha sido
  // exposto aqui. Faz falta na ação de mudar status: devolver para pendente é
  // o destino certo de quem pediu para remarcar.
  { value: "pending", label: "Pendente" },
  { value: "confirmed", label: "Confirmado" },
  { value: "in_progress", label: "Em atendimento" },
  { value: "completed", label: "Concluído" },
  { value: "missed", label: "Faltou" },
  { value: "cancelled", label: "Cancelado" },
];

export const ACTION_LABEL: Record<AutomationActionType, string> = {
  send_whatsapp: "Enviar mensagem de WhatsApp",
  set_appointment_status: "Mudar status do agendamento",
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
  set_appointment_status: "pessoa",
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

/** Por onde a ação sai, quando isso não é óbvio pela tela.
 *
 *  Existe porque a pergunta "essa mensagem usa o motor de campanhas ou o de
 *  disparo?" foi feita olhando este card, e ele não tinha como responder. São
 *  motores diferentes — campanhas passa por `crm-campaigns`, disparo por
 *  `_shared/whatsapp-send.ts` — e a automação usa o SEGUNDO, o mesmo do
 *  disparo por contato selecionado.
 *
 *  Só ações cujo canal é ambíguo entram aqui: mover etapa e observação não
 *  saem por canal nenhum. */
export const ACTION_CANAL: Partial<Record<AutomationActionType, string>> = {
  send_whatsapp: "Sai pelo número conectado em Atendimentos, pelo mesmo caminho do disparo — e conta no limite diário.",
  send_push: "Notificação no aplicativo, para todos os aparelhos da clínica.",
  webhook: "Chamada HTTPS para o endereço configurado.",
  set_appointment_status:
    "Muda o agendamento na Agenda. Não dispara outras automações — evita fluxo que se alimenta sozinho.",
};

export const CONDITION_FIELD_LABEL: Record<string, string> = {
  amount: "Valor do evento",
  hasContact: "Tem paciente vinculado",
  status: "Situação do agendamento",
  stageId: "Etapa do funil",
  dealStatus: "Situação da negociação",
  unitId: "Unidade do agendamento",
  daysUntil: "Faltam quantos dias",
  replyText: "Resposta do paciente",
  tag: "Tag do contato",
};

export const CONDITION_OPERATOR_LABEL: Record<string, string> = {
  gt: "maior que",
  lt: "menor que",
  eq: "é igual a",
  contains: "contém",
  not_contains: "não contém",
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
export const TRIGGERS_SEM_CONTATO_GARANTIDO: AutomationEvent[] = [
  "receivable.paid",
  "pipeline.stage_changed",
];

// ── Status de execução ───────────────────────────────────────────────────────
//
// O executor grava um destes em `automation_runs` a cada tentativa (ver
// atendimento-automations/index.ts). Traduzir aqui, e não na tela, é o que
// permite adicionar um status novo lá e o painel já saber o que dizer — ou,
// não sabendo, mostrar o valor cru em vez de mentir.

export type TomDaExecucao = "ok" | "erro" | "pulado" | "espera" | "caminho";

export const EXECUCAO: Record<string, { tom: TomDaExecucao; titulo: string; explica?: string }> = {
  sent: { tom: "ok", titulo: "Enviada" },
  failed: { tom: "erro", titulo: "Falhou" },
  deferred: { tom: "espera", titulo: "Agendada para depois", explica: "A automação tem uma espera antes desta ação." },
  deferred_outside_window: {
    tom: "espera",
    titulo: "Adiada para a janela de horário",
    explica: "O evento caiu fora do horário configurado; a ação roda na próxima abertura.",
  },
  skipped_outside_window: {
    tom: "pulado",
    titulo: "Fora da janela de horário",
    explica: "O evento caiu fora do horário configurado, e a automação está como \"não enviar\" nesse caso.",
  },
  skipped_no_contact: {
    tom: "pulado",
    titulo: "Sem contato para enviar",
    explica:
      "O evento chegou sem paciente vinculado — é o que acontece quando o nome foi digitado à mão em vez de escolhido da base de pacientes.",
  },
  skipped_daily_limit: {
    tom: "pulado",
    titulo: "Cota diária atingida",
    explica: "O limite de mensagens do dia já tinha sido usado por campanhas, disparos ou outras automações.",
  },
  skipped_missing_var: {
    tom: "pulado",
    titulo: "Faltou dado para a mensagem",
    explica:
      "Uma variável da mensagem ficou sem valor. A mensagem não sai pela metade: \"confirmado para o dia  às \" é pior do que não mandar.",
  },
  skipped_no_rule: {
    tom: "pulado",
    titulo: "Nenhuma automação bateu",
    explica:
      "O evento aconteceu, mas o filtro do acionamento não bateu com ele. Confira as condições do card de acionamento.",
  },
  skipped_no_flow: {
    tom: "erro",
    titulo: "Acionamento sem nada ligado",
    explica: "O card de acionamento não está conectado a nenhum outro card, então não há o que executar.",
  },
  skipped_depth_limit: {
    tom: "pulado",
    titulo: "Encadeamento longo demais",
    explica: "Uma automação disparou outra além do limite de encadeamento.",
  },
};

/** `branch_sim`, `branch_nao`, `branch_a`… não são resultado: são o rastro de
 *  qual caminho o fluxo tomou numa condição ou num randomizador. Aparecem
 *  recuados no painel para não parecerem falha. */
export function ehCaminho(status: string): boolean {
  return status.startsWith("branch_") && status !== "branch_dead_end";
}

export function rotuloDaExecucao(status: string): { tom: TomDaExecucao; titulo: string; explica?: string } {
  // Ramo solto não é rastro de caminho, é o fim do fluxo — aparece alinhado
  // com os outros resultados, porque é ele que precisa de conserto.
  if (status === "branch_dead_end") {
    return {
      tom: "erro",
      titulo: "O caminho terminou sem ação",
      explica: "A condição decidiu por um ramo que não está ligado a nenhum card, então o fluxo parou ali.",
    };
  }
  if (ehCaminho(status)) {
    const ramo = status.slice("branch_".length);
    const nome = ramo === "sim" ? "Sim" : ramo === "nao" ? "Não" : ramo === "nenhum" ? "nenhum ramo" : ramo.toUpperCase();
    return { tom: "caminho", titulo: `Seguiu por "${nome}"` };
  }
  // Status desconhecido mostra o valor cru: inventar um rótulo bonito para algo
  // que não sabemos o que é seria pior do que admitir que não sabemos.
  return EXECUCAO[status] ?? { tom: "pulado", titulo: status };
}
