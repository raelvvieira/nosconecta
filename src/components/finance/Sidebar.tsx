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
import { cn } from "@/lib/utils";

const items = [
  { label: "Visão Geral", icon: LayoutGrid, active: true },
  { label: "Recebimentos", icon: ArrowDownCircle },
  { label: "Pagamentos", icon: ArrowUpCircle },
  { label: "Fluxo de Caixa", icon: Wallet },
  { label: "Comissões", icon: Percent },
  { label: "Conciliação", icon: GitMerge },
  { label: "Relatórios", icon: FileBarChart },
  { label: "Configurações", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="hidden lg:flex w-[240px] shrink-0 flex-col border-r border-border/60 bg-background/60 backdrop-blur-xl">
      <div className="px-6 pt-6 pb-8 flex items-center gap-2">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-violet text-primary-foreground grid place-items-center font-bold text-base shadow-sm">
          O
        </div>
        <span className="font-semibold text-lg tracking-tight">OdontoCare</span>
      </div>

      <nav className="px-3 flex-1">
        <p className="px-3 text-[11px] font-medium tracking-wider text-muted-foreground uppercase mb-2">
          Financeiro
        </p>
        <ul className="space-y-0.5">
          {items.map((it) => (
            <li key={it.label}>
              <button
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors",
                  it.active
                    ? "bg-accent/70 text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <it.icon className="h-4 w-4" strokeWidth={1.75} />
                {it.label}
              </button>
            </li>
          ))}
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
