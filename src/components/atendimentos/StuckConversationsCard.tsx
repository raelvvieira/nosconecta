import { AlertTriangle, Clock } from "lucide-react";
import type { SalesAssistant } from "@/lib/atendimentos/insights.functions";

// Lista as conversas travadas apontadas pela análise diária do CRM
// (GET /api/v1/sales_assistant, seção 11 do manual). `geradoEm === null`
// quer dizer que a análise ainda não rodou pra essa conta — não é erro.
export function StuckConversationsCard({ assistant }: { assistant: SalesAssistant | null }) {
  return (
    <section className="surface-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Conversas travadas
        </h2>
        {assistant?.gargalo && (
          <span className="rounded-full bg-warning-soft px-2.5 py-1 text-2xs font-semibold text-warning">
            Gargalo: {assistant.gargalo.etapa} ({assistant.gargalo.travadas}/{assistant.gargalo.totalNaEtapa})
          </span>
        )}
      </div>

      {!assistant || assistant.geradoEm === null ? (
        <p className="text-sm text-muted-foreground">
          Ainda não analisado hoje — a análise do funil roda automaticamente às 4h.
        </p>
      ) : assistant.travadas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma conversa travada agora. 🎉</p>
      ) : (
        <ul className="space-y-2.5">
          {assistant.travadas.map((t) => (
            <li key={t.conversaId} className="rounded-2xl border border-border bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{t.contato}</p>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {t.paradaHaDias}d parado
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">Etapa: {t.etapa}</p>
              {t.motivo && <p className="mt-1 text-xs text-foreground">{t.motivo}</p>}
              {t.sugestao && <p className="mt-1 text-xs italic text-muted-foreground">Sugestão: {t.sugestao}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
