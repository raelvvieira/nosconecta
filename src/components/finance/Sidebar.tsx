import {
  LayoutGrid,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  Percent,
  GitMerge,
  FileBarChart,
  Settings,
  Sun,
  LogOut,
} from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const items = [
  { label: "Visão Geral", icon: LayoutGrid, to: "/" },
  { label: "Recebimentos", icon: ArrowDownCircle, to: "/recebimentos" },
  { label: "Pagamentos", icon: ArrowUpCircle, to: "/pagamentos" },
  { label: "Fluxo de Caixa", icon: Wallet, to: "/fluxo-de-caixa" },
  { label: "Comissões", icon: Percent, to: "/comissoes" },
  { label: "Conciliação", icon: GitMerge, to: "/conciliacao" },
  { label: "Relatórios", icon: FileBarChart, to: "/relatorios" },
  { label: "Configurações", icon: Settings, to: "/configuracoes" },
] as const;

export function Sidebar() {
  const { pathname } = useLocation();
  return (
    <aside className="hidden lg:flex w-[240px] shrink-0 flex-col border-r border-border/60 bg-background/60 backdrop-blur-xl">
      <div className="px-6 pt-6 pb-8 flex items-center gap-2">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-violet text-primary-foreground grid place-items-center font-bold text-base shadow-sm">
          N
        </div>
        <span className="font-semibold text-lg tracking-tight">NÓS Conecta</span>
      </div>

      <nav className="px-3 flex-1">
        <p className="px-3 text-[11px] font-medium tracking-wider text-muted-foreground uppercase mb-2">
          Financeiro
        </p>
        <ul className="space-y-0.5">
          {items.map((it) => {
            const active = pathname === it.to || (it.to !== "/" && pathname.startsWith(it.to));
            const isReal = it.to === "/" || it.to === "/pagamentos";
            const className = cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors text-left",
              active
                ? "bg-accent/70 text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            );
            return (
              <li key={it.label}>
                {isReal ? (
                  <Link to={it.to} className={className}>
                    <it.icon className="h-4 w-4" strokeWidth={1.75} />
                    {it.label}
                  </Link>
                ) : (
                  <button type="button" className={className} disabled>
                    <it.icon className="h-4 w-4" strokeWidth={1.75} />
                    {it.label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-3 border-t border-border/60 space-y-2">
        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/40">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-info to-violet text-white grid place-items-center text-xs font-semibold">
            G
          </div>
          <div className="leading-tight">
            <p className="text-sm font-medium">Dr. Guilherme</p>
            <p className="text-xs text-muted-foreground">Administrador</p>
          </div>
        </div>
        <div className="flex items-center gap-1 px-2">
          <button className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted/60">
            <Sun className="h-4 w-4" />
          </button>
          <button className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted/60">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
