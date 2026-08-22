import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { CONDICOES, type Condicao, type RegraDeFunil } from "@/lib/atendimentos/funnelRules";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// Um degrau da cadeia de decisão do funil.
//
// O card é lido como uma frase: "Se <condição>, a pessoa fica em <etapa>".
// Quando não casa, a decisão desce para o card seguinte — que é o que a seta
// "senão" entre os cards representa.

const CORES = ["#8B5CF6", "#F59E0B", "#EF4444", "#0EA5E9", "#22C55E", "#94A3B8", "#FF7A59"];

export function CardDeRegra({
  regra,
  ehUltima,
  primeira,
  onMudar,
  onSubir,
  onDescer,
  onRemover,
}: {
  regra: RegraDeFunil;
  /** A regra "todos os demais". Não se remove nem se desliga: é ela que
   *  garante que todo card tem coluna. */
  ehUltima: boolean;
  primeira: boolean;
  onMudar: (r: RegraDeFunil) => void;
  onSubir: () => void;
  onDescer: () => void;
  onRemover: () => void;
}) {
  const meta = CONDICOES[regra.condicao as Condicao];
  const apagada = !regra.ativa && !ehUltima;

  return (
    <div
      className={cn(
        "surface-card p-4 transition-opacity",
        apagada && "opacity-55",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-1 h-3 w-3 shrink-0 rounded-full"
          style={{ background: regra.cor }}
          aria-hidden
        />

        <div className="min-w-0 flex-1 space-y-2.5">
          <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {ehUltima ? "Todos os demais" : "Se"}
          </p>

          {!ehUltima && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-foreground">{meta?.rotulo ?? regra.condicao}</span>
              {meta?.parametro && (
                <>
                  <Input
                    value={String(regra.valor ?? "")}
                    onChange={(e) =>
                      onMudar({ ...regra, valor: Number(e.target.value.replace(/\D/g, "")) || 0 })
                    }
                    inputMode="numeric"
                    className="h-8 w-20 text-center"
                    aria-label={`${meta.rotulo} — ${meta.parametro}`}
                  />
                  <span className="text-sm text-muted-foreground">{meta.parametro}</span>
                </>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              fica em
            </span>
            <Input
              value={regra.nome}
              onChange={(e) => onMudar({ ...regra, nome: e.target.value })}
              className="h-8 w-44"
              aria-label="Nome da etapa"
            />
            <div className="flex items-center gap-1">
              {CORES.map((cor) => (
                <button
                  key={cor}
                  type="button"
                  onClick={() => onMudar({ ...regra, cor })}
                  aria-label={`Cor ${cor}`}
                  className={cn(
                    "h-5 w-5 rounded-full border-2 transition-transform",
                    regra.cor === cor ? "border-foreground scale-110" : "border-transparent",
                  )}
                  style={{ background: cor }}
                />
              ))}
            </div>
          </div>

          <Input
            value={regra.explica}
            onChange={(e) => onMudar({ ...regra, explica: e.target.value })}
            placeholder="Explicação que aparece embaixo do nome da coluna"
            className="h-8 text-2xs"
            aria-label="Explicação da etapa"
          />
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {!ehUltima && (
            <Switch
              checked={regra.ativa}
              onCheckedChange={(ativa) => onMudar({ ...regra, ativa })}
              aria-label={`${regra.ativa ? "Desligar" : "Ligar"} a etapa ${regra.nome}`}
            />
          )}
          <div className="flex items-center gap-0.5">
            {/* Setas em vez de arrastar: em lista ordenada e curta, seta é mais
                precisa, funciona no toque e é alcançável por teclado. E aqui a
                ordem É a regra, não a posição no espaço. */}
            <button
              type="button"
              onClick={onSubir}
              disabled={primeira}
              aria-label={`Subir ${regra.nome}`}
              className="press grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-surface-subtle disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDescer}
              disabled={ehUltima}
              aria-label={`Descer ${regra.nome}`}
              className="press grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-surface-subtle disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            {!ehUltima && (
              <button
                type="button"
                onClick={onRemover}
                aria-label={`Remover ${regra.nome}`}
                className="press grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
