// O Recovery Engine do lado da tela: os presets de cada trilha e os nomes em
// português.
//
// A REGRA (o que é uma configuração válida, como o calendário é calculado) mora
// num lugar só, `supabase/functions/_shared/recuperacao.ts`, e é importada
// daqui em vez de copiada. Ela não usa nada do Deno, então o Vite a empacota
// para a tela igual a qualquer outro módulo; e a prévia que a tela mostra é
// calculada pela MESMA função que o motor usa para agendar.
import {
  INTENSIDADES,
  MECANISMOS,
  TRILHAS,
  normalizarConfig,
  type ConfigDeRecuperacao,
  type EtapaConfig,
  type Intensidade,
  type Mecanismo,
  type Trilha,
  type TrilhaConfig,
} from "../../../supabase/functions/_shared/recuperacao";

export {
  INTENSIDADES,
  MECANISMOS,
  TRILHAS,
  normalizarConfig,
  type ConfigDeRecuperacao,
  type EtapaConfig,
  type Intensidade,
  type Mecanismo,
  type Trilha,
  type TrilhaConfig,
};
export {
  instanteLocal,
  janelaAberta,
  planejarSequencia,
  partesLocais,
} from "../../../supabase/functions/_shared/recuperacao";

export const NOME_DA_TRILHA: Record<Trilha, { nome: string; quando: string }> = {
  INITIAL_NO_RESPONSE: {
    nome: "Nunca respondeu",
    quando: "A Luna respondeu a primeira mensagem e a pessoa não voltou.",
  },
  ACTIVE_CONVERSATION_DROP: {
    nome: "Parou no meio da conversa",
    quando: "Vocês estavam conversando e a pessoa sumiu.",
  },
  PRICE_SILENCE: { nome: "Sumiu depois do preço", quando: "Recebeu o valor e parou de responder." },
  SCHEDULE_IGNORED: {
    nome: "Não escolheu horário",
    quando: "Recebeu opções de horário e não escolheu nenhuma.",
  },
  SAID_WILL_THINK: { nome: "Disse que vai pensar", quando: "Pediu um tempo para decidir." },
  PROMISED_CALLBACK: {
    nome: "Combinou um retorno",
    quando: "Pediu para ser chamada num dia específico.",
  },
  AWAITING_DATA: {
    nome: "Falta um dado",
    quando: "Escolheu o horário e falta uma informação para concluir.",
  },
  AWAITING_RESERVATION: {
    nome: "Falta concluir a reserva",
    quando: "Mostrou interesse na reserva de paciente modelo e não concluiu.",
  },
  STOP: { nome: "Pediu para parar", quando: "Recusou contato. Nunca recebe retomada." },
};

export const NOME_DO_MECANISMO: Record<Mecanismo, string> = {
  PRESENCE_CHECK: "Chamar a atenção",
  PATTERN_INTERRUPT: "Quebra de padrão",
  OPEN_LOOP: "Retomar a pergunta aberta",
  SOCIAL_PROOF: "Caso real (prova social)",
  USEFUL_INFORMATION: "Informação útil",
  OBJECTION_ISOLATION: "Descobrir o que travou",
  FRICTION_REDUCTION: "Facilitar a decisão",
  SCHEDULE_OPPORTUNITY: "Oferecer horário",
  SOCIAL_ACCOUNTABILITY: "Lembrar o combinado",
  BREAKUP: "Despedida",
};

export const NOME_DA_INTENSIDADE: Record<Intensidade, string> = {
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
  PAUSED: "Pausada até a data",
  STOP: "Parada",
};

const min = (minutos: number, mecanismo: Mecanismo, condicional = false): EtapaConfig => ({
  momento: { tipo: "minutos", minutos },
  mecanismo,
  ativa: true,
  condicional,
});
const dia = (dias: number, hora: string, mecanismo: Mecanismo): EtapaConfig => ({
  momento: { tipo: "dia", dias, hora },
  mecanismo,
  ativa: true,
  condicional: false,
});

/**
 * Os presets aprovados em 28/10.
 *
 * A trilha principal é a cadência pedida: 20, 45, 165 e 345 minutos contados
 * da resposta da Luna, e a despedida no dia seguinte. As outras seguem a
 * intensidade que o manual dá a cada uma (Parte D). Tudo editável na tela.
 */
export const PRESETS: Record<Trilha, TrilhaConfig> = {
  INITIAL_NO_RESPONSE: {
    ligada: true,
    intensidade: "HIGH",
    etapas: [
      min(20, "PRESENCE_CHECK"),
      min(45, "PATTERN_INTERRUPT"),
      min(165, "SOCIAL_PROOF"),
      min(345, "FRICTION_REDUCTION", true),
      dia(1, "16:00", "BREAKUP"),
    ],
  },
  ACTIVE_CONVERSATION_DROP: {
    ligada: true,
    intensidade: "MEDIUM",
    etapas: [min(40, "OPEN_LOOP"), min(180, "USEFUL_INFORMATION"), dia(1, "16:00", "BREAKUP")],
  },
  PRICE_SILENCE: {
    ligada: true,
    intensidade: "MEDIUM",
    etapas: [
      min(60, "OBJECTION_ISOLATION"),
      min(240, "USEFUL_INFORMATION"),
      dia(1, "16:00", "BREAKUP"),
    ],
  },
  SCHEDULE_IGNORED: {
    ligada: true,
    intensidade: "MEDIUM",
    etapas: [min(25, "PRESENCE_CHECK"), min(105, "FRICTION_REDUCTION"), dia(1, "16:00", "BREAKUP")],
  },
  SAID_WILL_THINK: {
    ligada: true,
    intensidade: "LOW",
    etapas: [dia(1, "11:00", "USEFUL_INFORMATION"), dia(4, "16:00", "BREAKUP")],
  },
  PROMISED_CALLBACK: {
    ligada: true,
    intensidade: "PAUSED",
    etapas: [
      {
        momento: { tipo: "retorno", hora: "10:00" },
        mecanismo: "SOCIAL_ACCOUNTABILITY",
        ativa: true,
        condicional: false,
      },
    ],
  },
  AWAITING_DATA: {
    ligada: true,
    intensidade: "MEDIUM",
    etapas: [min(30, "OPEN_LOOP"), dia(1, "11:00", "FRICTION_REDUCTION")],
  },
  AWAITING_RESERVATION: {
    ligada: true,
    intensidade: "MEDIUM",
    etapas: [min(60, "OPEN_LOOP"), dia(1, "11:00", "USEFUL_INFORMATION")],
  },
  STOP: { ligada: false, intensidade: "STOP", etapas: [] },
};

/** A configuração completa de partida: tudo DESLIGADO, com os presets. */
export function configInicial(): ConfigDeRecuperacao {
  return {
    ligado: false,
    ligadoDesde: null,
    fuso: "America/Sao_Paulo",
    janelaInicio: 9,
    janelaFim: 19,
    horaDaRetomada: "10:00",
    toleranciaMinutos: 10,
    trilhas: structuredClone(PRESETS),
  };
}

/** O que está salvo, ou a configuração de partida quando ainda não há nada. */
export function configDaTela(salva: unknown): ConfigDeRecuperacao {
  return normalizarConfig(salva) ?? configInicial();
}
