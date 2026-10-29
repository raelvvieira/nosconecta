// O plano do consultório decide se a assistente trabalha.
//
// ── As três perguntas ────────────────────────────────────────────────────
//
// 1. O consultório pode usar IA? Plano "Com IA", e situação ativa ou teste
//    dentro do prazo. Básico, suspenso ou teste vencido: a assistente não
//    responde, não retoma conversa, não escreve lição nem relatório.
// 2. Cabe mais uma conversa no mês? A franquia é PROTEÇÃO, não cobrança
//    (decisão de 29/10): segura um caso fora da curva, como um robô
//    conversando com a assistente em loop. Conversa que já foi contada no mês
//    continua até o fim; só conversa NOVA esbarra no limite. Passou da
//    franquia, gasta uma do saldo extra (pacote comprado, que não vence).
//    Sem saldo, a conversa fica para a equipe.
// 3. É hora de avisar? Aos 80% e aos 100%, uma vez por mês cada.
//
// Puro: sem banco, sem relógio próprio. Quem lê do banco e grava é
// `plano-no-banco.ts`. O mesmo arquivo serve ao site (`src/`), que importa
// daqui para não ter duas regras.

export type Plano = "basico" | "ia";
export type Situacao = "teste" | "ativa" | "suspensa";

export interface FichaDoPlano {
  plano: Plano | string | null;
  situacao: Situacao | string | null;
  teste_ate: string | null;
}

export type MotivoSemIa = "plano básico" | "consultório suspenso" | "teste vencido";

/** O consultório pode usar a assistente agora? `null` = pode. */
export function semIaPorque(ficha: FichaDoPlano | null, agora: Date): MotivoSemIa | null {
  // Sem ficha nenhuma: consultório de antes das fichas. Não se desliga a
  // assistente de ninguém por falta de cadastro.
  if (!ficha) return null;
  if (ficha.situacao === "suspensa") return "consultório suspenso";
  if (ficha.situacao === "teste" && testeVencido(ficha.teste_ate, agora)) return "teste vencido";
  if (ficha.plano !== "ia") return "plano básico";
  return null;
}

/** Teste sem data de fim não vence: quem cria com prazo é a plataforma. */
export function testeVencido(testeAte: string | null, agora: Date): boolean {
  if (!testeAte) return false;
  const fim = new Date(testeAte).getTime();
  return Number.isFinite(fim) && fim < agora.getTime();
}

/** O consultório inteiro está parado (teste vencido ou suspenso)? É o que
 *  fecha o sistema na tela "seu teste terminou". Plano básico NÃO para o
 *  sistema: só a assistente. */
export function consultorioParado(ficha: FichaDoPlano | null, agora: Date): boolean {
  if (!ficha) return false;
  if (ficha.situacao === "suspensa") return true;
  return ficha.situacao === "teste" && testeVencido(ficha.teste_ate, agora);
}

export type Franquia = "ja_contada" | "dentro" | "usa_extra" | "estourou";

/** Esta conversa cabe no mês? */
export function cabeNaFranquia(e: {
  /** A conversa já teve resposta da assistente neste mês. */
  jaContada: boolean;
  /** Conversas diferentes que a assistente respondeu neste mês. */
  conversasNoMes: number;
  franquia: number;
  extras: number;
}): Franquia {
  if (e.jaContada) return "ja_contada";
  if (e.conversasNoMes < Math.max(0, e.franquia)) return "dentro";
  if (e.extras > 0) return "usa_extra";
  return "estourou";
}

/**
 * Que aviso dar agora, se algum.
 *
 * `usadas` já conta a conversa que acabou de entrar. `jaAvisado` é o maior
 * nível avisado NESTE mês (0 se nenhum). Cada nível vai uma vez: quem passa de
 * 79% para 100% numa tacada só recebe só o de 100%.
 */
export function avisoDaFranquia(e: {
  usadas: number;
  franquia: number;
  extras: number;
  jaAvisado: number;
}): 80 | 100 | null {
  if (e.franquia <= 0) return null;
  // Com saldo extra sobrando, 100% da franquia não é o fim: o aviso de 100%
  // só vem quando o extra também acabou.
  const acabou = e.usadas >= e.franquia && e.extras <= 0;
  if (acabou && e.jaAvisado < 100) return 100;
  if (e.usadas >= Math.ceil(e.franquia * 0.8) && e.jaAvisado < 80 && !acabou) return 80;
  return null;
}

/** "2026-10": o mês do Brasil, que é o que a franquia conta. */
export function mesDoBrasil(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(agora)
    .slice(0, 7);
}

/** O começo do mês no Brasil (meia-noite de Brasília, UTC-3, sem horário de
 *  verão desde 2019). */
export function comecoDoMesDoBrasil(agora: Date): Date {
  return new Date(`${mesDoBrasil(agora)}-01T03:00:00.000Z`);
}

export function textoDoAviso(nivel: 80 | 100, franquia: number): { title: string; body: string } {
  return nivel === 100
    ? {
        title: "A assistente parou de abrir conversas novas",
        body: `O consultório chegou às ${franquia} conversas do mês. As conversas novas ficam com a equipe até o mês virar ou entrar um pacote extra.`,
      }
    : {
        title: "A assistente já usou 80% das conversas do mês",
        body: `Faltam cerca de ${Math.max(0, franquia - Math.ceil(franquia * 0.8))} conversas novas da franquia de ${franquia}. Se precisar de mais, fale com a gente.`,
      };
}
