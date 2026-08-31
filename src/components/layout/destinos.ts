import {
  ArrowDownCircle,
  ArrowUpCircle,
  Bot,
  BookOpen,
  CalendarDays,
  Home,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  Megaphone,
  MessageCircle,
  Percent,
  Settings,
  MessageSquare,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Users,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";

// Onde cada destino do app é declarado UMA vez.
//
// Antes, o menu lateral, a barra do celular e a gaveta "Mais" declaravam a
// mesma coisa cada um por conta própria — e divergiram: a Agenda aparecia com
// `Calendar` na lista de módulos e `CalendarDays` no submenu, então o ícone
// trocava de desenho só de entrar no módulo. Com um mapa só isso deixa de ser
// possível: não há dois lugares para discordar.

/** Rotas de verdade que o menu alcança. União única em vez de uma por lista —
 *  é o que permite um componente de item só, tipado, para as três superfícies. */
export type RotaDoMenu =
  | "/inicio"
  | "/agenda"
  | "/pacientes"
  | "/atendimentos"
  | "/agente-ia"
  | "/agente-ia/manual"
  | "/agente-ia/atendimento"
  | "/agente-ia/procedimentos"
  | "/configuracoes"
  | "/financeiro"
  | "/recebimentos"
  | "/pagamentos"
  | "/planejamento"
  | "/atendimentos/chat"
  | "/atendimentos/pipeline"
  | "/atendimentos/campanhas"
  | "/atendimentos/automacoes";

export interface Destino {
  label: string;
  icon: LucideIcon;
  to: RotaDoMenu;
  placeholder?: false;
}

/** Item de menu para rota que ainda NÃO existe (hoje só Comissões). Fica
 *  visível e apagado, como sinal de "vem aí", e nunca vira link.
 *
 *  O tipo é separado de propósito: `to` aqui é `string`, fora da união de rotas
 *  reais, então o roteador recusa em tempo de compilação qualquer tentativa de
 *  navegar para ele. Foi exatamente isso que o TypeScript apontou ao unificar
 *  os menus — o item existia no menu e a rota não existia em lugar nenhum. */
export interface DestinoFuturo {
  label: string;
  icon: LucideIcon;
  to: string;
  placeholder: true;
}

export type ItemDoMenu = Destino | DestinoFuturo;

export const MODULOS: Destino[] = [
  { label: "Início", icon: Home, to: "/inicio" },
  { label: "Agenda", icon: CalendarDays, to: "/agenda" },
  { label: "Pacientes", icon: Users, to: "/pacientes" },
  { label: "Atendimentos", icon: MessageCircle, to: "/atendimentos" },
  { label: "Agente de IA", icon: Sparkles, to: "/agente-ia" },
  { label: "Financeiro", icon: Wallet, to: "/financeiro" },
  { label: "Configurações", icon: Settings, to: "/configuracoes" },
];

export const ITENS_FINANCEIRO: ItemDoMenu[] = [
  { label: "Visão Geral", icon: LayoutGrid, to: "/financeiro" },
  { label: "Recebimentos", icon: ArrowDownCircle, to: "/recebimentos" },
  { label: "Pagamentos", icon: ArrowUpCircle, to: "/pagamentos" },
  { label: "Planejamento", icon: TrendingUp, to: "/planejamento" },
  { label: "Comissões", icon: Percent, to: "/comissoes", placeholder: true },
];

/** O agente e as duas coisas que uma pessoa configura nele: o manual que ele
 *  aprendeu e o recorte do catálogo que ele pode citar.
 *
 *  Procedimentos aparece aqui, e NÃO como módulo próprio, porque não é um
 *  catálogo novo: é o mesmo `clinic_procedures` da Agenda e do Financeiro, com
 *  a marcação do que o agente tem permissão de precificar. Um segundo catálogo
 *  divergiria do primeiro, e preço errado dito a um paciente é o pior defeito
 *  possível aqui. */
export const ITENS_AGENTE_IA: Destino[] = [
  { label: "Agente", icon: Sparkles, to: "/agente-ia" },
  { label: "Manual", icon: BookOpen, to: "/agente-ia/manual" },
  { label: "Atendimento", icon: MessageSquare, to: "/agente-ia/atendimento" },
  { label: "Procedimentos", icon: Stethoscope, to: "/agente-ia/procedimentos" },
];

export const ITENS_ATENDIMENTOS: Destino[] = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/atendimentos" },
  { label: "Chat", icon: MessageCircle, to: "/atendimentos/chat" },
  { label: "Pipeline", icon: Workflow, to: "/atendimentos/pipeline" },
  { label: "Campanhas", icon: Megaphone, to: "/atendimentos/campanhas" },
  { label: "Automação", icon: Bot, to: "/atendimentos/automacoes" },
];

/** Submenu SÓ para módulo com mais de uma página.
 *
 *  A Agenda tinha um submenu de um item — entrar nela trocava a lista de
 *  módulos por "‹ Módulos" + "AGENDA" + um link para a própria Agenda. Isso
 *  empurrava o rótulo da seção uma linha para baixo e não entregava navegação
 *  nenhuma em troca. Módulo de página única agora mantém a lista de módulos na
 *  tela e só move o destaque. */
export const SUBMENUS: Record<string, { titulo: string; itens: ItemDoMenu[] }> = {
  financeiro: { titulo: "Financeiro", itens: ITENS_FINANCEIRO },
  atendimentos: { titulo: "Atendimentos", itens: ITENS_ATENDIMENTOS },
  "agente-ia": { titulo: "Agente de IA", itens: ITENS_AGENTE_IA },
};

/** Grupos da gaveta "Mais" do celular. Deriva das mesmas listas acima, então
 *  não tem como um item existir aqui com outro ícone — ou nem existir. */
export const GRUPOS_DO_MAIS: { label: string; itens: ItemDoMenu[] }[] = [
  { label: "Módulos", itens: MODULOS.filter((m) => m.to !== "/atendimentos" && m.to !== "/financeiro" && m.to !== "/agente-ia") },
  { label: "Atendimentos", itens: ITENS_ATENDIMENTOS },
  { label: "Agente de IA", itens: ITENS_AGENTE_IA },
  { label: "Financeiro", itens: ITENS_FINANCEIRO.filter((i) => i.placeholder !== true) },
];

/** Ações da barra inferior na Agenda — a FORMA, sem os handlers.
 *
 *  A página registrava rótulo, ícone e ação juntos, em tempo de execução. Só
 *  que a barra é desenhada durante o carregamento, quando a página ainda não
 *  montou: a lista chegava vazia e sobrava só o "+", encostado na borda. Como
 *  esse par nunca muda, a forma mora aqui e a página registra apenas o que de
 *  fato é dela — o que acontece ao tocar. */
export const ACOES_DA_AGENDA: { id: "compromisso" | "calendario"; label: string; icon: LucideIcon }[] = [
  { id: "compromisso", label: "Compromisso", icon: Lock },
  { id: "calendario", label: "Calendário", icon: CalendarDays },
];

/** Só os itens navegáveis de uma lista — descarta os placeholders e, de
 *  quebra, estreita o tipo para `Destino`, que é o que o <Link> aceita. */
export const navegaveis = (itens: ItemDoMenu[]): Destino[] =>
  itens.filter((i): i is Destino => i.placeholder !== true);
