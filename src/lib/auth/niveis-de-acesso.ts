// Quem vê o quê.
//
// ── Por que este arquivo nasceu ─────────────────────────────────────────
//
// Os níveis já existiam no cadastro — "Recepção", "Dentista", "Financeiro" —
// e as caixinhas de permissão eram gravadas em `clinic_members.permissions`.
// Nenhuma linha do app LIA qualquer uma das duas coisas. Quem não era
// administrador via o mesmo menu de quem era: Financeiro, Agente de IA,
// Configurações, tudo. O único limite real era a unidade, que a RLS aplica.
//
// Ou seja: escolher o nível de alguém não mudava nada, e ninguém tinha como
// saber disso pela tela. Este arquivo é onde o nível passa a significar.
//
// ── Por que o mapa mora em código, e não no banco ───────────────────────
//
// `permissions` é uma lista livre numa coluna jsonb: nada garante que o que
// está lá corresponde a uma área que existe. Uma área renomeada ou removida
// deixaria linhas apontando para o nada, e o erro seria invisível — a pessoa
// simplesmente não veria uma página, sem ninguém entender por quê.
//
// Aqui o conjunto é fechado e o TypeScript cobra: área nova obriga a decidir
// quem a vê, nível novo obriga a listar as áreas dele.
//
// A coluna `permissions` continua no banco e não é mais lida nem escrita —
// ver o COMMENT que a migration de 20/10 deixou nela.

/** Os níveis, como a clínica os definiu em 20/10. */
export type NivelDeAcesso = "admin" | "reception" | "dentist" | "finance";

/** Cada módulo do app. É por área que o nível decide, não por rota: o
 *  Financeiro tem quatro páginas e nenhuma delas faz sentido sozinha. */
export type AreaDoApp =
  | "inicio"
  | "agenda"
  | "pacientes"
  | "atendimentos"
  | "financeiro"
  | "agente_ia"
  | "club"
  | "configuracoes";

export interface NivelNaTela {
  valor: NivelDeAcesso;
  rotulo: string;
  /** Uma linha, para quem está escolhendo o nível de alguém. */
  resumo: string;
}

/** Na ordem em que aparecem para quem convida. */
export const NIVEIS: readonly NivelNaTela[] = [
  {
    valor: "admin",
    rotulo: "Administrador",
    resumo: "Vê e faz tudo, inclusive convidar gente e mexer nas configurações.",
  },
  {
    valor: "reception",
    rotulo: "Recepção",
    resumo: "Agenda, pacientes e as conversas do WhatsApp. Não vê o financeiro.",
  },
  {
    valor: "dentist",
    rotulo: "Dentista",
    resumo: "Agenda e pacientes. Não vê o financeiro nem as conversas.",
  },
  {
    valor: "finance",
    rotulo: "Financeiro",
    resumo: "Só o financeiro: recebimentos, pagamentos e planejamento.",
  },
];

/**
 * O que cada nível enxerga. Decidido com a clínica em 20/10.
 *
 * `inicio` está em todos de propósito: é a tela onde a pessoa cai ao entrar, e
 * um nível sem nenhuma página seria uma conta que abre e não mostra nada.
 */
export const AREAS_DO_NIVEL: Record<NivelDeAcesso, readonly AreaDoApp[]> = {
  admin: [
    "inicio",
    "agenda",
    "pacientes",
    "atendimentos",
    "financeiro",
    "agente_ia",
    "club",
    "configuracoes",
  ],
  // A recepção entra no Club porque é ela que registra indicação e confere
  // saldo no balcão — o programa morre se depender de administrador.
  reception: ["inicio", "agenda", "pacientes", "atendimentos", "club"],
  dentist: ["inicio", "agenda", "pacientes"],
  finance: ["inicio", "financeiro"],
};

/** O nível vê esta área? Nível desconhecido não vê nada além do Início —
 *  um papel que o banco tem e o código não conhece é um erro, e errar para o
 *  lado de mostrar demais é o que este arquivo existe para impedir. */
export function podeVerArea(
  nivel: NivelDeAcesso | null | undefined,
  area: AreaDoApp,
  recursos?: RecursosDoConsultorio | null,
): boolean {
  const areas = AREAS_DO_NIVEL[nivel as NivelDeAcesso];
  if (!areas) return area === "inicio";
  if (!areas.includes(area)) return false;
  // O nível diz o que a PESSOA vê; o plano diz o que o CONSULTÓRIO tem. Sem
  // recursos informados (carregando, ou quem chama não sabe), vale só o nível.
  if (recursos && area === "agente_ia" && !recursos.ia) return false;
  if (recursos && area === "club" && !recursos.club) return false;
  return true;
}

/** O que o plano do consultório liga. Ver `src/lib/plataforma/recursos.ts`. */
export interface RecursosDoConsultorio {
  /** A assistente (Agente de IA): plano "Com IA" dentro do prazo. */
  ia: boolean;
  /** O Club do paciente: só onde a plataforma ligou (a NÓS). */
  club: boolean;
}

/**
 * De que área é uma rota.
 *
 * Prefixo e não igualdade: `/pacientes/<id>` é pacientes, e
 * `/configuracoes/dias-de-viagem` é configurações. A ordem importa —
 * `/atendimentos/chat` precisa casar antes de qualquer regra mais curta.
 *
 * Rota desconhecida devolve `null`, e `null` quer dizer "não é área de
 * módulo": a tela de login, o convite, a página de conta não aprovada. Elas
 * não passam por nível nenhum.
 */
export function areaDaRota(pathname: string): AreaDoApp | null {
  const p = String(pathname ?? "").split("?")[0];
  if (p === "/" || p === "/inicio") return "inicio";
  if (p === "/agenda" || p.startsWith("/agenda/")) return "agenda";
  if (p === "/pacientes" || p.startsWith("/pacientes/")) return "pacientes";
  if (p === "/atendimentos" || p.startsWith("/atendimentos/")) return "atendimentos";
  if (p === "/agente-ia" || p.startsWith("/agente-ia/")) return "agente_ia";
  if (p === "/nos-club" || p.startsWith("/nos-club/")) return "club";
  // Aparência é preferência da PESSOA, não da clínica: todo nível escolhe a
  // própria cor, inclusive quem não vê o resto de Configurações.
  if (p === "/configuracoes/aparencia") return "inicio";
  if (p === "/configuracoes" || p.startsWith("/configuracoes/")) return "configuracoes";
  if (
    p === "/financeiro" ||
    p === "/recebimentos" ||
    p === "/pagamentos" ||
    p === "/planejamento" ||
    p.startsWith("/financeiro/")
  ) {
    return "financeiro";
  }
  return null;
}

/** Esta pessoa pode abrir esta rota? Rota fora dos módulos (login, convite)
 *  passa sempre — quem barra ali é a autenticação, não o nível. */
export function podeAbrir(
  nivel: NivelDeAcesso | null | undefined,
  pathname: string,
  recursos?: RecursosDoConsultorio | null,
): boolean {
  const area = areaDaRota(pathname);
  if (!area) return true;
  return podeVerArea(nivel, area, recursos);
}

/**
 * Para onde mandar quem abriu uma página que não é dele.
 *
 * O Início serve a todos os níveis, então é sempre uma resposta válida — e é
 * melhor que a tela de erro: quem clicou num link antigo quer continuar
 * trabalhando, não ler um aviso.
 */
export const ROTA_INICIAL = "/inicio";
