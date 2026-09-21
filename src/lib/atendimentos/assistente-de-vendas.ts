// O retrato do funil: quantos em cada etapa, onde trava, quem está esperando.
//
// ── O que isto substitui ─────────────────────────────────────────────────
//
// `GET /api/v1/sales_assistant`, uma análise que o CRM rodava **uma vez por
// dia, às 4h**. Quem abrisse o Dashboard às 15h via o retrato da madrugada, e
// quem abrisse antes da primeira rodada via "ainda não analisado". Aqui a
// conta sai na hora da pergunta.
//
// ── O que mudou no conteúdo ──────────────────────────────────────────────
//
// O CRM devolvia `motivo` e `sugestao` escritos por uma IA dele. Aqui o motivo
// é um fato — quem falou por último e há quanto tempo — e a sugestão não
// existe. Inventar um conselho para parecer com o que havia antes seria
// encher a tela de texto que ninguém pediu e que não se sustenta.
//
// ── Por que módulo puro ──────────────────────────────────────────────────
//
// É uma conta sobre datas, e conta sobre data erra calada: um fuso trocado ou
// um `>=` no lugar de `>` muda quem aparece na lista de "esperando resposta" —
// e quem some dela é justamente quem devia ter sido respondido.

export interface FunnelStageStat {
  etapa: string;
  conversas: number;
  travadas: number;
}

export interface FunnelGargalo {
  etapa: string;
  travadas: number;
  totalNaEtapa: number;
}

export interface StuckConversation {
  conversaId: string;
  contato: string;
  etapa: string;
  paradaHaDias: number;
  motivo: string | null;
  sugestao: string | null;
}

export interface SalesAssistant {
  /** Quando a conta foi feita. Nunca é nulo agora: ela sai na hora. */
  geradoEm: string | null;
  totalConversas: number;
  etapas: FunnelStageStat[];
  gargalo: FunnelGargalo | null;
  travadas: StuckConversation[];
}

/** Uma pessoa no funil, com o que se sabe da conversa dela. */
export interface PessoaNoFunil {
  /** Id da conversa, para a tela poder abrir. Vazio quando não há conversa. */
  conversaId: string;
  contato: string | null;
  etapa: string;
  ultimaMensagemEm: string | null;
  /** `true` quando a última mensagem saiu da clínica. `null` quando não se
   *  sabe — conversa sem mensagem nenhuma no espelho. */
  ultimaFoiDaClinica: boolean | null;
}

/**
 * A partir de quantos dias sem mexer uma pessoa conta como travada.
 *
 * Três dias, e não um: num fim de semana toda conversa ficaria "travada" na
 * segunda de manhã, e uma lista em que todo mundo está em alerta não é alerta.
 */
export const DIAS_PARA_TRAVAR = 3;

/** Dias corridos entre duas datas, sem arredondar para cima. */
function diasEntre(de: Date, ate: Date): number {
  return Math.floor((ate.getTime() - de.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Por que esta pessoa está parada.
 *
 * Fato, não conselho. A diferença que importa para quem atende é quem falou
 * por último: se foi o paciente, alguém da clínica precisa responder; se foi a
 * clínica, a bola está com o paciente e o caso é de retomar o contato.
 */
function motivoDe(pessoa: PessoaNoFunil, dias: number): string {
  if (pessoa.ultimaFoiDaClinica === null) {
    return "Sem nenhuma mensagem trocada.";
  }
  if (pessoa.ultimaFoiDaClinica) {
    return `A clínica falou por último e não houve resposta há ${dias} dias.`;
  }
  return `A pessoa escreveu e está sem resposta há ${dias} dias.`;
}

/**
 * O retrato do funil.
 *
 * `agora` entra por parâmetro — sem isso a conta não seria exercitável, e é
 * justamente a parte que erra calada.
 */
export function analisarFunil(
  pessoas: PessoaNoFunil[],
  agora: Date = new Date(),
  diasParaTravar: number = DIAS_PARA_TRAVAR,
): SalesAssistant {
  const porEtapa = new Map<string, { conversas: number; travadas: number }>();
  const travadas: StuckConversation[] = [];

  for (const pessoa of pessoas) {
    const etapa = pessoa.etapa?.trim() || "Sem etapa";
    const atual = porEtapa.get(etapa) ?? { conversas: 0, travadas: 0 };
    atual.conversas++;

    // Sem data de última mensagem não dá para dizer que está parada há N dias.
    // Chutar zero a esconderia da lista; chutar muito a poria no topo. Fica de
    // fora da contagem de travadas e continua contando na etapa, que é o que
    // se sabe de verdade.
    const desde = pessoa.ultimaMensagemEm ? new Date(pessoa.ultimaMensagemEm) : null;
    const dias = desde && !Number.isNaN(desde.getTime()) ? diasEntre(desde, agora) : null;

    if (dias !== null && dias >= diasParaTravar) {
      atual.travadas++;
      travadas.push({
        conversaId: pessoa.conversaId,
        contato: pessoa.contato?.trim() || "Contato",
        etapa,
        paradaHaDias: dias,
        motivo: motivoDe(pessoa, dias),
        // O CRM escrevia uma sugestão com IA. Aqui não há: um conselho
        // inventado para preencher o espaço é pior do que espaço vazio.
        sugestao: null,
      });
    }
    porEtapa.set(etapa, atual);
  }

  const etapas: FunnelStageStat[] = [...porEtapa.entries()].map(([etapa, n]) => ({
    etapa,
    conversas: n.conversas,
    travadas: n.travadas,
  }));

  // O gargalo é a etapa com MAIS gente parada, e só existe se houver alguém
  // parado. Empate resolve pela maior proporção — entre duas etapas com três
  // travadas cada, a de cinco pessoas aperta mais que a de vinte.
  const comTravadas = etapas.filter((e) => e.travadas > 0);
  const pior = comTravadas.sort(
    (a, b) => b.travadas - a.travadas || b.travadas / b.conversas - a.travadas / a.conversas,
  )[0];

  return {
    geradoEm: agora.toISOString(),
    totalConversas: pessoas.length,
    etapas,
    gargalo: pior
      ? { etapa: pior.etapa, travadas: pior.travadas, totalNaEtapa: pior.conversas }
      : null,
    // Quem está parado há mais tempo primeiro: é a ordem em que alguém
    // realmente atacaria a lista.
    travadas: travadas.sort((a, b) => b.paradaHaDias - a.paradaHaDias),
  };
}
