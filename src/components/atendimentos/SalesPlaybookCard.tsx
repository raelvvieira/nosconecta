import { Bot } from "lucide-react";
import type { SalesPlaybook } from "@/lib/atendimentos/insights.functions";

// Status do agente de IA de vendas (GET /api/v1/sales_playbook, seção 12 do
// manual). Só leitura — ativar o agente é feito pelo operador do Wavy, fora
// de escopo aqui.
export function SalesPlaybookCard({ playbook }: { playbook: SalesPlaybook | null }) {
  const p = playbook;

  return (
    <section className="surface-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Bot className="h-4 w-4 text-violet" />
          Agente de IA
        </h2>
        {p && (
          <span
            className={`rounded-full px-2.5 py-1 text-2xs font-semibold ${
              p.ativo ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"
            }`}
          >
            {p.ativo ? "Ativo" : "Inativo"}
          </span>
        )}
      </div>

      {!p ? (
        <p className="text-sm text-muted-foreground">Sem dados do agente de IA no momento.</p>
      ) : p.pronto ? (
        <p className="text-sm text-muted-foreground">
          Pronto pra atender sozinho no WhatsApp — aprendeu com {p.vendasAprendidas} venda(s).
          {!p.ativo && " Ative pelo painel do Wavy quando quiser."}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Ainda aprendendo — {p.vendasAprendidas} de {p.vendasAprendidas + p.faltamVendas} venda(s) necessárias.
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-primary"
              style={{
                width: `${Math.min(100, (p.vendasAprendidas / Math.max(1, p.vendasAprendidas + p.faltamVendas)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
