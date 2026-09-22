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

/** Uma das duas maneiras de responder. */
export function BotaoDeModo({
  ativo,
  titulo,
  descricao,
  onClick,
}: {
  ativo: boolean;
  titulo: string;
  descricao: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "press rounded-2xl border p-4 text-left transition",
        ativo
          ? "border-transparent bg-foreground text-white"
          : "border-border bg-white hover:bg-muted",
      )}
    >
      <span className="block text-sm font-semibold">{titulo}</span>
      <span
        className={cn("mt-0.5 block text-xs", ativo ? "text-white/70" : "text-muted-foreground")}
      >
        {descricao}
      </span>
    </button>
  );
}

/** A casca branca de toda seção da página do agente. */
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
  return (
    <section className={cn("rounded-3xl border border-border bg-white/70 p-6", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{titulo}</h2>
          {descricao && <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>}
        </div>
        {acao}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
