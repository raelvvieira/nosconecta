import { cn } from "@/lib/utils";
import type { OfertaDaLista, PosicaoDaOferta, Termometro } from "@/lib/agente-ia/ofertas.functions";

// As peças que a lista e a ficha das ofertas dividem: o liga e desliga em três
// posições (igual ao dos módulos), o termômetro e os rótulos.

export const POSICOES: { id: PosicaoDaOferta; rotulo: string; ajuda: string }[] = [
  { id: "desligado", rotulo: "Desligada", ajuda: "A assistente não usa esta oferta." },
  {
    id: "teste",
    rotulo: "Só no teste",
    ajuda: "Vale apenas na tela Testar, para você conferir antes de abrir.",
  },
  { id: "ligado", rotulo: "Ligada", ajuda: "A assistente usa nas conversas reais." },
];

export function SeletorDePosicao({
  posicao,
  onMudar,
  desabilitado,
  rotulo,
}: {
  posicao: OfertaDaLista["posicao"];
  onMudar: (p: PosicaoDaOferta) => void;
  desabilitado?: boolean;
  rotulo: string;
}) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className="flex rounded-full border border-border/70 bg-card p-0.5"
    >
      {POSICOES.map((p) => (
        <button
          key={p.id}
          type="button"
          title={p.ajuda}
          disabled={desabilitado}
          aria-pressed={posicao === p.id}
          onClick={() => onMudar(p.id)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            posicao === p.id
              ? "bg-foreground text-white"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {p.rotulo}
        </button>
      ))}
    </div>
  );
}

export function BarraDoTermometro({ t, className }: { t: Termometro; className?: string }) {
  const pct = Math.round((t.feitos / t.total) * 100);
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between text-2xs text-muted-foreground">
        <span>O que a assistente já tem</span>
        <span className="tabular-nums">
          {t.feitos} de {t.total}
        </span>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct >= 80 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-primary/60",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export const TIPO_ROTULO = { promocao: "Promoção de preço", edicao: "Edição com vagas" } as const;

export const PARA_QUEM_ROTULO = {
  paciente: "Pacientes",
  profissional: "Profissionais",
  todos: "Qualquer pessoa",
} as const;

export function situacaoDaOferta(
  o: Pick<OfertaDaLista, "posicao" | "inicio" | "fim">,
  hoje: string,
): { rotulo: string; cor: string } {
  const apagada = "bg-muted text-muted-foreground";
  if (o.posicao === "encerrada") return { rotulo: "Encerrada", cor: apagada };
  if (o.posicao === "desligado") return { rotulo: "Desligada", cor: apagada };
  if (o.posicao === "teste") return { rotulo: "Em teste", cor: "bg-warning-soft text-warning" };
  if (o.inicio && hoje < o.inicio) return { rotulo: "Agendada", cor: "bg-info-soft text-info" };
  if (o.fim && hoje > o.fim) return { rotulo: "Período encerrado", cor: apagada };
  return { rotulo: "Valendo agora", cor: "bg-success-soft text-success" };
}

export function diaMes(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function reais(v: number | null) {
  return v === null ? "sem valor" : `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
}
