// Variáveis que uma mensagem de automação pode usar.
//
// O executor (supabase/functions/atendimento-automations) tem uma cópia desta
// mesma tabela — são dois runtimes (Cloudflare Workers e Deno) e Deno não
// importa de `src/`. Mudou aqui, muda lá: a validação do save usa esta lista
// para recusar uma variável que o gatilho não sabe preencher, e o executor usa
// a dele para substituir. Divergir faz o save aceitar algo que sai vazio na
// mensagem do paciente.
import {
  AUTOMATION_EVENTS,
  type AutomationEvent,
} from "@/lib/atendimentos/automation-events";

export interface AutomationVar {
  /** Sem as chaves: "data" vira {{data}}. */
  chave: string;
  rotulo: string;
  exemplo: string;
  /** Gatilhos que conseguem preencher esta variável. */
  gatilhos: AutomationEvent[];
}

// Todo gatilho que chega com agendamento em mãos preenche data, hora,
// procedimento, profissional e unidade — inclusive o lembrete diário e a
// resposta do paciente, que o webhook já liga ao agendamento mais próximo.
const AGENDA: AutomationEvent[] = [
  "appointment.created",
  "appointment.status_changed",
  "appointment.reminder_due",
  "whatsapp.reply_received",
];
const TODOS: AutomationEvent[] = [...AUTOMATION_EVENTS];

export const AUTOMATION_VARS: AutomationVar[] = [
  { chave: "nome", rotulo: "Nome da pessoa", exemplo: "Kauany", gatilhos: TODOS },
  { chave: "data", rotulo: "Data do agendamento", exemplo: "18/09/2026", gatilhos: AGENDA },
  { chave: "hora", rotulo: "Horário", exemplo: "18:00", gatilhos: AGENDA },
  { chave: "procedimento", rotulo: "Procedimento", exemplo: "Limpeza", gatilhos: AGENDA },
  { chave: "profissional", rotulo: "Profissional", exemplo: "Dra. Ana", gatilhos: AGENDA },
  { chave: "unidade", rotulo: "Unidade", exemplo: "NÓS Floripa", gatilhos: AGENDA },
  {
    chave: "endereco",
    rotulo: "Endereço da unidade",
    exemplo: "Rua Bocaiúva, 2468",
    gatilhos: AGENDA,
  },
  {
    chave: "resposta",
    rotulo: "O que o paciente respondeu",
    exemplo: "Sim",
    gatilhos: ["whatsapp.reply_received"],
  },
  {
    chave: "valor",
    rotulo: "Valor",
    exemplo: "R$ 350,00",
    gatilhos: [
      "appointment.created",
      "appointment.status_changed",
      "appointment.reminder_due",
      "receivable.paid",
    ],
  },
];

/** As que o gatilho escolhido consegue preencher. Sem gatilho ainda escolhido,
 *  só as que valem para todos — oferecer {{data}} antes de saber o gatilho
 *  levaria a escrever uma mensagem que o save depois recusa. */
export function varsDoGatilho(trigger: AutomationEvent | null): AutomationVar[] {
  if (trigger) return AUTOMATION_VARS.filter((v) => v.gatilhos.includes(trigger));
  return AUTOMATION_VARS.filter((v) => v.gatilhos.length === TODOS.length);
}

const PADRAO_VAR = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

/** Variáveis usadas no texto que o gatilho NÃO preenche. É o que a validação
 *  do save recusa: melhor barrar na hora de salvar do que mandar
 *  "confirmado para o dia  às " para o paciente. */
export function varsIncompativeis(texto: string, trigger: AutomationEvent | null): string[] {
  const permitidas = new Set(varsDoGatilho(trigger).map((v) => v.chave));
  const usadas = new Set<string>();
  for (const m of texto.matchAll(PADRAO_VAR)) usadas.add(m[1].toLowerCase());
  return [...usadas].filter((u) => !permitidas.has(u));
}
