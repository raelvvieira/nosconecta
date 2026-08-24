import { Link, useRouterState, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  Armchair,
  Bell,
  Tag as TagIcon,
  BriefcaseMedical,
  Building2,
  MessageCircle,
  Share2,
  ShieldCheck,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSettings, type SettingsData, type SettingsSection } from "@/lib/settings/settings.functions";

type SettingsFetcher = () => Promise<SettingsData>;
export const settingsQuery = (fetcher: SettingsFetcher) =>
  queryOptions({ queryKey: ["settings"], queryFn: () => fetcher(), staleTime: 15_000 });

type PageSection = SettingsSection | "members";
type NavItem =
  | { kind: "section"; value: PageSection; label: string; description: string; icon: LucideIcon; adminOnly?: boolean }
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
        value: "professionals",
        label: "Profissionais",
        description: "Equipe clínica e comissões",
        icon: Stethoscope,
      },
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
        kind: "section",
        value: "members",
        label: "Usuários e permissões",
        description: "Acessos da equipe",
        icon: ShieldCheck,
        adminOnly: true,
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
  const visible = (item: NavItem) => item.kind !== "section" || !item.adminOnly || !!counts?.isAdmin;

  const activeSection: PageSection = search.section ?? "professionals";
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
      {/* Mobile: tira horizontal. Antes o menu era `hidden lg:block` e os
          cards do topo eram a única navegação no celular — sem eles, o menu
          precisa aparecer aqui. */}
      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ALL_ITEMS.filter(visible).map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <Link
              key={item.kind === "section" ? item.value : item.to}
              to={item.kind === "section" ? "/configuracoes" : item.to}
              search={item.kind === "section" ? { section: item.value } : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-transparent bg-foreground text-white"
                  : "border-border bg-white/65 text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

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
