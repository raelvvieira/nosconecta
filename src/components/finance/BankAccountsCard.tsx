import { Landmark, Banknote, Zap } from "lucide-react";
import { formatBRL } from "@/lib/finance/format";

const iconFor = (type: string) => {
  switch (type) {
    case "pix":
      return { Icon: Zap, bg: "bg-success-soft", color: "text-success" };
    case "cash":
      return { Icon: Banknote, bg: "bg-info-soft", color: "text-info" };
    default:
      return { Icon: Landmark, bg: "bg-danger-soft", color: "text-danger" };
  }
};

export interface BankAccountItem {
  id: string;
  name: string;
  type: string;
  last_digits: string | null;
  current_balance: number;
}

export function BankAccountsCard({
  accounts,
  total,
}: {
  accounts: BankAccountItem[];
  total: number;
}) {
  return (
    <section className="surface-card p-6 flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold">Contas Bancárias</h2>
        <button className="text-xs text-primary hover:underline font-medium">Gerenciar contas</button>
      </div>

      <ul className="space-y-4 flex-1">
        {accounts.map((acc) => {
          const { Icon, bg, color } = iconFor(acc.type);
          return (
            <li key={acc.id} className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl grid place-items-center ${bg}`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{acc.name}</p>
                {acc.last_digits && (
                  <p className="text-xs text-muted-foreground tabular-nums">•••• {acc.last_digits}</p>
                )}
              </div>
              <p className="text-sm font-semibold tabular-nums">{formatBRL(acc.current_balance)}</p>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 pt-4 border-t border-border/60 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Total disponível</span>
        <span className="text-base font-semibold tabular-nums">{formatBRL(total)}</span>
      </div>
    </section>
  );
}
