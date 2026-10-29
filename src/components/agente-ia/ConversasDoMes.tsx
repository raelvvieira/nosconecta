import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { minhaFranquia } from "@/lib/plataforma/plataforma.functions";
import { Bloco } from "./campos";

/**
 * Quantas conversas a assistente já abriu no mês, de quantas cabem.
 *
 * A franquia é proteção, não cobrança (decisão de 29/10): quase ninguém chega
 * perto. Por isso o cartão é discreto, e só ganha cor perto do limite. Nada de
 * dinheiro nem token aqui: isso só a plataforma vê.
 */
export function ConversasDoMes() {
  const buscar = useServerFn(minhaFranquia);
  const { data } = useQuery({
    queryKey: ["minha-franquia"],
    queryFn: () => buscar(),
    staleTime: 60_000,
  });
  if (!data || data.franquia <= 0) return null;

  const pct = Math.min(100, Math.round((data.usadas / data.franquia) * 100));
  const passou = data.usadas >= data.franquia;
  return (
    <Bloco
      titulo="Conversas da assistente este mês"
      descricao="Cada conversa nova que ela atende conta uma vez no mês, não importa quantas mensagens tenha."
    >
      <div className="flex items-center gap-2 text-sm">
        <MessagesSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span>
          <strong>{data.usadas}</strong> de {data.franquia}
          {data.extras > 0 && ` · ${data.extras} extras disponíveis`}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div
          className={cn(
            "h-full rounded-full",
            passou && data.extras <= 0 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-coral",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {passou && data.extras <= 0 && (
        <p className="mt-2 text-xs leading-5 text-danger">
          O limite do mês chegou: as conversas novas ficam com a equipe até o mês virar. Fale com a
          gente se precisar de mais.
        </p>
      )}
    </Bloco>
  );
}
