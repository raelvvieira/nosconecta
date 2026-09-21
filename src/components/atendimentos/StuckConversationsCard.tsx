import { AlertTriangle, Clock } from "lucide-react";
import type { SalesAssistant } from "@/lib/atendimentos/insights.functions";

// Quem está no funil sem mexer há três dias ou mais.
//
// Isto já foi a "análise diária" do CRM: rodava às 4h e quem abrisse a tela às
// 15h via o retrato da madrugada. Hoje a conta sai na hora da pergunta
// (`assistente-de-vendas.ts`), então não existe mais o estado de "ainda não
// analisado" — ou há gente parada, ou não há.
//
// `assistant` nulo é a consulta ainda carregando.
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
            Gargalo: {assistant.gargalo.etapa} ({assistant.gargalo.travadas}/
            {assistant.gargalo.totalNaEtapa})
          </span>
        )}
      </div>

      {!assistant ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : assistant.totalConversas === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ninguém no funil ainda. Coloque alguém a partir de uma conversa para acompanhar por aqui.
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
              {t.sugestao && (
                <p className="mt-1 text-xs italic text-muted-foreground">Sugestão: {t.sugestao}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
