import { useEffect, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// As peças repetidas da tela do agente. Moram juntas porque a mesma forma
// aparece em quatro blocos — e quando cada bloco desenhava a sua, o rótulo
// ficava em tamanhos diferentes na mesma coluna.

/**
 * A explicação, guardada atrás de um "i".
 *
 * A tela tinha uma frase embaixo de cada título e de cada campo — quem já
 * sabe o que é "Ritmo" lia tudo de novo a cada visita. A frase continua a um
 * toque (Popover e não Tooltip: no celular não existe passar o mouse).
 */
export function Ajuda({ texto }: { texto?: string | null }) {
  if (!texto) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label="O que é isto"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 text-xs leading-5 text-muted-foreground"
      >
        {texto}
      </PopoverContent>
    </Popover>
  );
}

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
    <div className="flex items-center justify-between gap-4">
      <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
        <span className="truncate">{rotulo}</span>
        <Ajuda texto={dica} />
      </p>
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
          className="h-9 w-20 text-right tabular-nums"
        />
        <span className="text-xs text-muted-foreground">{sufixo}</span>
      </div>
    </div>
  );
}

/** Uma chave liga/desliga; a explicação fica no "i". */
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
    <div className="flex items-center justify-between gap-4">
      <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
        <span className="truncate">{rotulo}</span>
        <Ajuda texto={dica} />
      </p>
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
  //
  // Desde 30/10 a descrição não aparece mais embaixo do título: fica no "i"
  // ao lado dele. O card ficou do tamanho do que ele tem dentro.
  const [aberto, setAberto] = useState(false);
  return (
    <section
      className={cn(
        "rounded-2xl border border-border/70 bg-card p-4 shadow-1 lg:rounded-3xl lg:p-5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            className="min-w-0 text-left lg:pointer-events-none"
          >
            <h2 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{titulo}</h2>
          </button>
          <Ajuda texto={descricao} />
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-label={aberto ? "Fechar" : "Abrir"}
            className="ml-auto lg:hidden"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                aberto && "rotate-180",
              )}
            />
          </button>
        </div>
        {acao}
      </div>
      <div className={cn("mt-4", !aberto && "hidden lg:block")}>{children}</div>
    </section>
  );
}
