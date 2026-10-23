import { Link, useLocation, useRouterState, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  Armchair,
  Bell,
  CalendarRange,
  Tag as TagIcon,
  BriefcaseMedical,
  Building2,
  Images,
  MessageCircle,
  Receipt,
  Share2,
  Users,
  Wallet,
  type LucideIcon,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSettings,
  type SettingsData,
  type SettingsSection,
} from "@/lib/settings/settings.functions";

type SettingsFetcher = () => Promise<SettingsData>;
export const settingsQuery = (fetcher: SettingsFetcher) =>
  queryOptions({ queryKey: ["settings"], queryFn: () => fetcher(), staleTime: 15_000 });

type PageSection = SettingsSection | "members";
type NavItem =
  | {
      kind: "section";
      value: PageSection;
      label: string;
      description: string;
      icon: LucideIcon;
      adminOnly?: boolean;
    }
  | { kind: "link"; to: string; label: string; description: string; icon: LucideIcon };

// Fonte única da navegação de Configurações. Antes existiam duas listas
// paralelas (um grid de cards no topo e um menu lateral embaixo) que
// iteravam o mesmo array e chamavam a mesma ação — clicar num ou no outro
// fazia exatamente a mesma coisa, e o grid ainda deixava metade de uma linha
// vazia. Agora é só esta.
const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Cadastros",
    items: [
      {
        kind: "section",
        value: "chairs",
        label: "Cadeiras",
        description: "Consultórios e recursos",
        icon: Armchair,
      },
      {
        kind: "section",
        value: "procedures",
        label: "Procedimentos",
        description: "Duração, preço e custo",
        icon: BriefcaseMedical,
      },
      {
        // Rota própria: a CRUD genérica grava campos de texto, e um caso é uma
        // IMAGEM — upload para o bucket, miniatura por URL assinada e uma
        // grade para olhar. Nada disso cabe na lista genérica desta tela.
        kind: "link",
        to: "/configuracoes/casos",
        label: "Biblioteca de casos",
        description: "Antes e depois que a Luna pode enviar",
        icon: Images,
      },
      {
        // Rota própria pelo mesmo motivo das tags: a CRUD genérica grava três
        // campos numa tabela, e conta tem tipo, dígitos e — o que importa —
        // uma lista de cartões dentro, cada um com dois dias de ciclo.
        kind: "link",
        to: "/configuracoes/contas",
        label: "Contas e cartões",
        description: "Bancos e faturas de cartão de crédito",
        icon: Wallet,
      },
      {
        kind: "link",
        to: "/configuracoes/grupo-do-financeiro",
        label: "Grupo do financeiro",
        description: "Lançar despesa escrevendo no WhatsApp",
        icon: Receipt,
      },
      {
        // Rota própria, e não `section`, porque a CRUD genérica desta tela
        // grava três campos numa tabela e nada mais. As tags precisam da
        // contagem de uso, da paleta de cores e da recusa de nome repetido —
        // que já vivem em `tags.functions.ts`. Encaixá-las na CRUD genérica
        // significaria uma segunda implementação das mesmas regras.
        kind: "link",
        to: "/configuracoes/tags",
        label: "Tags",
        description: "Etiquetas de contatos e pacientes",
        icon: TagIcon,
      },
    ],
  },
  {
    label: "Acesso",
    items: [
      {
        kind: "section",
        value: "units",
        label: "Unidades",
        description: "Filiais e endereços",
        icon: Building2,
        adminOnly: true,
      },
      {
        // Uma área só para as pessoas. Eram duas — "Profissionais" nos
        // cadastros e "Usuários e permissões" aqui —, e a mesma pessoa
        // aparecia nas duas sem nada dizendo que era a mesma. Rota própria
        // porque a CRUD genérica desta tela grava campos de texto numa tabela,
        // e aqui são duas tabelas, as unidades de cada pessoa e os convites.
        kind: "link",
        to: "/configuracoes/pessoal",
        label: "Pessoal",
        description: "Quem trabalha aqui e o que cada um acessa",
        icon: Users,
      },
      {
        // Ao lado de Unidades, e não em Cadastros: é sobre QUANDO cada unidade
        // atende, e quem mexe nisso é quem mexe nas unidades. Rota própria
        // porque a CRUD genérica grava campos de texto numa tabela, e aqui são
        // duas (o modo na unidade, as datas na outra) com uma lista dentro.
        kind: "link",
        to: "/configuracoes/dias-de-viagem",
        label: "Dias de viagem",
        description: "Quando a outra unidade atende",
        icon: CalendarRange,
      },
    ],
  },
  {
    label: "Preferências",
    items: [
      {
        kind: "link",
        to: "/configuracoes/aparencia",
        label: "Aparência",
        description: "A cor do seu sistema",
        icon: Palette,
      },
    ],
  },
  {
    label: "Conexões",
    items: [
      {
        kind: "link",
        to: "/configuracoes/notificacoes",
        label: "Notificações",
        description: "E-mail, SMS e WhatsApp",
        icon: Bell,
      },
      {
        kind: "link",
        to: "/atendimentos",
        label: "WhatsApp",
        description: "Conectar e gerenciar conversas",
        icon: MessageCircle,
      },
      {
        kind: "link",
        to: "/configuracoes/integracoes",
        label: "Integrações",
        description: "Meta Pixel e Conversions API",
        icon: Share2,
      },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((group) => group.items);

export function SettingsNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useSearch({ strict: false }) as { section?: PageSection };
  const fetchSettings = useServerFn(getSettings);
  const settingsResult = useQuery(settingsQuery(fetchSettings as unknown as SettingsFetcher));
  const counts = settingsResult.data;
  // Unidades e Usuários e permissões só administram — enquanto ainda não se
  // sabe (`counts` carregando), fica escondido por padrão em vez de piscar.
  const visible = (item: NavItem) =>
    item.kind !== "section" || !item.adminOnly || !!counts?.isAdmin;

  const activeSection: PageSection = search.section ?? "professionals";
  const { searchStr } = useLocation();
  const menuNoCelular =
    pathname === "/configuracoes" && !String(searchStr ?? "").includes("section=");
  const isActive = (item: NavItem) =>
    item.kind === "section"
      ? pathname === "/configuracoes" && activeSection === item.value
      : pathname === item.to;

  const detail = (item: NavItem) => {
    if (item.kind !== "section" || !counts || item.value === "members") return item.description;
    const total = counts[item.value].length;
    return total ? `${total} cadastrados` : item.description;
  };

  return (
    <>
      {/* Celular. Na raiz, a lista de áreas em grupos — o menu é a página.
          Numa área, só uma linha de volta: "‹ Configurações". */}
      {menuNoCelular ? (
        <nav className="space-y-5 lg:hidden">
          {GROUPS.map((group) => {
            const itens = group.items.filter(visible);
            if (!itens.length) return null;
            return (
              <div key={group.label}>
                <p className="mb-1.5 px-1 text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                  {group.label}
                </p>
                <div className="surface-card divide-y divide-border overflow-hidden">
                  {itens.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.kind === "section" ? item.value : item.to}
                        to={item.kind === "section" ? "/configuracoes" : item.to}
                        search={item.kind === "section" ? { section: item.value } : undefined}
                        className="press flex items-center gap-3 px-4 py-3.5 active:bg-muted/40"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface text-foreground-secondary">
                          <Icon className="h-4 w-4" strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{item.label}</span>
                          <span className="block truncate text-2xs text-muted-foreground">
                            {detail(item)}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      ) : (
        <Link
          to="/configuracoes"
          className="press -mt-2 flex items-center gap-1 self-start text-sm font-medium text-pink lg:hidden"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2} /> Configurações
        </Link>
      )}

      <aside className="surface-card hidden overflow-hidden p-2 lg:sticky lg:top-8 lg:block">
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-1 last:mb-0">
            <p className="px-3 pb-1 pt-3 text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
              {group.label}
            </p>
            {group.items.filter(visible).map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.kind === "section" ? item.value : item.to}
                  to={item.kind === "section" ? "/configuracoes" : item.to}
                  search={item.kind === "section" ? { section: item.value } : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors",
                    active
                      ? "bg-foreground text-white"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.label}</span>
                    <span
                      className={cn(
                        "mt-0.5 block truncate text-2xs",
                        active ? "text-white/65" : "text-muted-foreground",
                      )}
                    >
                      {detail(item)}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </aside>
    </>
  );
}
