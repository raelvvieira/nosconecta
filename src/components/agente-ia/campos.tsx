import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// As peças repetidas da tela do agente. Moram juntas porque a mesma forma
// aparece em quatro blocos — e quando cada bloco desenhava a sua, o rótulo
// ficava em tamanhos diferentes na mesma coluna.

/** Um número com rótulo, gravado ao sair do campo. */
export function Campo({
  rotulo,
  sufixo,
  valor,
  dica,
  onSalvar,
}: {
  rotulo: string;
  sufixo: string;
  valor: number;
  dica?: string;
  onSalvar: (v: number) => void;
}) {
  const [rascunho, setRascunho] = useState(String(valor));
  useEffect(() => setRascunho(String(valor)), [valor]);
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{rotulo}</p>
        {dica && <p className="mt-0.5 text-xs text-muted-foreground">{dica}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Input
          type="number"
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={() => {
            const n = Number(rascunho);
            // O servidor tem os limites; aqui só evita mandar lixo.
            if (Number.isFinite(n) && n !== valor) onSalvar(n);
            else setRascunho(String(valor));
          }}
          className="w-20 text-right tabular-nums"
        />
        <span className="text-xs text-muted-foreground">{sufixo}</span>
      </div>
    </div>
  );
}

/** Uma chave liga/desliga com explicação embaixo. */
export function Chave({
  rotulo,
  dica,
  ligada,
  onMudar,
}: {
  rotulo: string;
  dica: string;
  ligada: boolean;
  onMudar: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{rotulo}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{dica}</p>
      </div>
      <Switch checked={ligada} onCheckedChange={onMudar} aria-label={rotulo} />
    </div>
  );
}

export function Bloco({
  titulo,
  descricao,
  acao,
  children,
  className,
}: {
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  // No celular cada bloco nasce FECHADO, só o título: a tela inteira aberta
  // eram doze cartões de texto um atrás do outro (varredura de 23/10). Um
  // toque abre. No computador nada muda — o estado só vale abaixo de `lg`.
  const [aberto, setAberto] = useState(false);
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-white/70 p-4 lg:rounded-3xl lg:p-6",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="flex min-w-0 flex-1 items-center gap-2 text-left lg:pointer-events-none"
        >
          <span className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{titulo}</h2>
            {descricao && (
              <p className="mt-1 hidden text-sm text-muted-foreground lg:block">{descricao}</p>
            )}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform lg:hidden",
              aberto && "rotate-180",
            )}
          />
        </button>
        {acao}
      </div>
      <div className={cn("mt-4 lg:mt-5", !aberto && "hidden lg:block")}>{children}</div>
    </section>
  );
}
