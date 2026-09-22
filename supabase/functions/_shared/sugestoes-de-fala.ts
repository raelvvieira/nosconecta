// O que dizer agora, nesta conversa.
//
// ── O que isto é, e o que NÃO é ────────────────────────────────────────
//
// Não é o agente. O agente responde sozinho, por quem ele pode atender, com a
// IA ligada. Isto aqui é uma sugestão para uma PESSOA: aparece no painel da
// conversa, ela lê, decide, e o texto só sai se ela mandar.
//
// Por isso funciona com a IA desligada, não passa por `decidirSeResponde`, não
// grava sessão e não grava `ai_agent_messages`. Sugerir não é atender.
//
// ── Por que as falas saem prontas ──────────────────────────────────────
//
// "Explore a dor do paciente" não ajuda ninguém às onze da manhã com sete
// conversas abertas. O que ajuda é a frase, escrita na voz da clínica, pronta
// para colar. É isso que o manual aprendido serve para saber.
import {
  montarInstrucao,
  tabelaDePrecos,
  type ManualDeVendas,
  type ProcedimentoDoAgente,
  REGRAS_DE_REPASSE,
} from "./instrucao-do-agente.ts";
import type { FalaDaConversa } from "./historico-da-conversa.ts";

/** Três: cabe no painel sem rolagem e dá escolha de verdade. Uma sugestão só
 *  vira ordem; cinco vira lista para ler no lugar de atender. */
export const QUANTAS_SUGESTOES = 3;

export interface EntradaDeSugestao {
  clinica: string;
  manual: ManualDeVendas;
  procedimentos: ProcedimentoDoAgente[];
  historico: FalaDaConversa[];
  ehPaciente: boolean;
  nomeDoContato: string | null;
}

/**
 * O formato exigido da resposta.
 *
 * `etapa_atual` fica FORA da lista de propósito: o card mostra uma etapa no
 * cabeçalho, e pedir a etapa dentro de cada sugestão deixaria o modelo
 * devolver três etapas atuais diferentes para a mesma conversa.
 */
export const FORMATO_DAS_SUGESTOES = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["etapa_atual", "porque_essa_etapa", "sugestoes"],
    properties: {
      etapa_atual: { type: "string" },
      porque_essa_etapa: { type: "string" },
      sugestoes: {
        type: "array",
        minItems: 1,
        maxItems: QUANTAS_SUGESTOES,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["fala", "porque"],
          properties: {
            /** O texto pronto para mandar ao paciente. */
            fala: { type: "string" },
            /** Por que agora — aparece em letra menor sob a fala. */
            porque: { type: "string" },
          },
        },
      },
    },
  },
};

/**
 * O prompt. Puro: mesma entrada, mesmo texto.
 *
 * ── Por que a instrução do agente entra CITADA ────────────────────────
 *
 * `montarInstrucao` é escrita em segunda pessoa, para o agente que responde
 * ("você atende pacientes por WhatsApp"). Reaproveitá-la como instrução do
 * sistema faria o modelo responder COMO agente — e o card mostraria uma
 * mensagem dirigida à clínica em vez de ao paciente.
 *
 * Então ela entra como bloco citado, e a pergunta é feita SOBRE ela. Mais
 * barato que um segundo renderizador de manual, e mantém uma verdade só: o
 * método que o agente segue é o mesmo que a sugestão propõe.
 */
export function promptDeSugestao(e: EntradaDeSugestao): string {
  const conversa = e.historico
    .map((f) => `${f.deQuem === "clinica" ? "CLÍNICA" : "PESSOA"}: ${f.texto}`)
    .join("\n");

  const quem = e.ehPaciente
    ? "Esta pessoa JÁ É PACIENTE da clínica. Ela não é um lead: não ofereça " +
      "avaliação como se fosse a primeira vez, e trate o histórico dela como " +
      "algo que a clínica conhece."
    : "Esta pessoa AINDA NÃO É PACIENTE. O objetivo da conversa é chegar " +
      "naturalmente a uma consulta marcada.";

  // `null` para a linha que pode não existir, e filtro só de `null`. Com
  // string vazia, o filtro comeria TODAS as linhas em branco e o prompt
  // chegaria ao modelo como um bloco só.
  const linhas: (string | null)[] = [
    `Você está ajudando alguém da recepção de ${e.clinica} a responder uma`,
    "conversa de WhatsApp que está acontecendo agora.",
    "",
    "Este é o método desta clínica, aprendido das conversas reais dela:",
    "",
    "<<<",
    montarInstrucao({ clinica: e.clinica, manual: e.manual, procedimentos: e.procedimentos }),
    ">>>",
    "",
    // A tabela já vem dentro de `montarInstrucao`, mas repetir aqui é de
    // propósito: a fala sugerida vai ser COLADA literalmente, e preço
    // inventado numa frase pronta chega ao paciente sem ninguém conferir.
    tabelaDePrecos(e.procedimentos),
    "",
    quem,
    e.nomeDoContato ? `A pessoa se chama ${e.nomeDoContato}.` : null,
    "",
    "A conversa até agora:",
    "",
    conversa,
    "",
    "Sua tarefa:",
    "1. Diga em que ETAPA do método esta conversa está agora.",
    `2. Escreva até ${QUANTAS_SUGESTOES} mensagens que a recepção poderia mandar`,
    "   AGORA para conduzir a conversa ao próximo passo.",
    "",
    "Regras:",
    "- Cada fala é o texto PRONTO para enviar ao paciente, na voz da clínica.",
    "  Não escreva orientação para a recepção ('pergunte sobre a dor') — escreva",
    "  a mensagem em si.",
    "- Escreva como alguém daqui escreveria: pt-BR, curto, sem parecer robô.",
    "- Nunca invente preço, horário, disponibilidade, prazo ou nome de",
    "  profissional. Se não estiver acima, não existe.",
    "- Nunca dê orientação clínica, diagnóstico ou conduta.",
    "- As falas devem ser DIFERENTES entre si — três jeitos de seguir, não a",
    "  mesma frase reescrita.",
    "",
    // As regras de repasse entram invertidas. Sem isto, a sugestão contornaria
    // um "quero falar com uma pessoa" — e contornar esse pedido é exatamente o
    // que `instrucao-do-agente.ts` explica que não pode sair do manual.
    "Se a conversa estiver em qualquer uma destas situações, a ÚNICA sugestão",
    "deve ser chamar uma pessoa da equipe, e diga isso claramente:",
    ...REGRAS_DE_REPASSE.map((r) => `- ${r}`),
  ];

  return linhas.filter((l): l is string => l !== null).join("\n");
}
