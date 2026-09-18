import type { LucideIcon } from "lucide-react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "danger" | "violet" | "warning";

const toneStyles: Record<Tone, { iconBg: string; iconText: string; chip: string }> = {
  success: {
    iconBg: "bg-success-soft",
    iconText: "text-success",
    chip: "bg-success-soft text-success",
  },
  danger: { iconBg: "bg-danger-soft", iconText: "text-danger", chip: "bg-danger-soft text-danger" },
  violet: { iconBg: "bg-violet-soft", iconText: "text-violet", chip: "bg-violet-soft text-violet" },
  warning: {
    iconBg: "bg-warning-soft",
    iconText: "text-warning",
    chip: "bg-warning-soft text-warning",
  },
};

/**
 * O indicador. Duas formas, uma por tamanho de tela:
 *
 * • Celular — célula sem moldura dentro do `GrupoDeKpis`: o NÚMERO primeiro,
 *   o rótulo embaixo. É o número que se procura; o rótulo é o que confirma.
 *   Some o quadrado colorido do ícone — o maior consumidor de espaço, e nada
 *   que o rótulo já não diga. A cor fica onde carrega sentido: no número
 *   (`corNoValor`) e na variação.
 *
 * • `md` para cima — o cartão de sempre, intocado: ícone, rótulo, número e
 *   legenda. Lá o espaço sobra e o ícone ajuda a varrer a tela com o olho.
 *
 * `footer` é a legenda do cartão (desktop); `nota` é a linha equivalente da
 * célula do celular, onde cabe bem menos. Passar só `footer` significa
 * "isto é contexto de desktop, no celular não faz falta".
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  deltaPct,
  footer,
  nota,
  highlight,
  corNoValor,
  className,
}: {
  label: React.ReactNode;
  value: string;
  icon: LucideIcon;
  tone: Tone;
  deltaPct?: number;
  footer?: React.ReactNode;
  nota?: React.ReactNode;
  highlight?: boolean;
  corNoValor?: boolean;
  className?: string;
}) {
  const styles = toneStyles[tone];
  const positive = deltaPct !== undefined && deltaPct >= 0;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col px-4 py-3.5 transition-shadow md:p-6",
        // Destaque por ELEVAÇÃO, não por tinta: era um degradê violeta por
        // baixo do cartão, que é decoração — e a marca do sistema é
        // rosa-coral, então o realce puxava para uma cor que não é dela.
        // Subir um degrau de raio e de sombra diz "leia este primeiro" sem
        // gastar cor nenhuma.
        highlight ? "md:feature-card md:hover:shadow-3" : "md:surface-card md:hover:shadow-2",
        className,
      )}
    >
      {/* ── Celular: número, rótulo, nota ── */}
      <div className="flex min-w-0 flex-col md:hidden">
        {/* O número NÃO trunca: valor cortado é número errado. Em 360px
            "R$ 125.430,00" não cabe em meia tela a 20px, então ele quebra em
            duas linhas — como já fazia antes — e o tamanho desce um degrau,
            com o peso segurando a hierarquia no lugar do tamanho. */}
        <p
          className={cn(
            "text-lg font-semibold leading-tight tracking-tight tabular-nums",
            corNoValor && styles.iconText,
          )}
        >
          {value}
        </p>
        {/* A variação fica na linha do rótulo, não na do número: ao lado do
            valor ela roubava justamente a largura que falta. */}
        <div className="mt-1 flex min-w-0 items-start gap-1.5">
          {/* O rótulo quebra em até duas linhas em vez de truncar: cortado
              ("Recebido no perí…") ele deixa de dizer o que é o número. */}
          <p className="min-w-0 line-clamp-2 text-2xs leading-tight text-muted-foreground">
            {label}
          </p>
          {deltaPct !== undefined && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-0.5 text-2xs font-semibold leading-none",
                positive ? "text-success" : "text-danger",
              )}
            >
              {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(deltaPct).toFixed(0)}%
            </span>
          )}
        </div>
        {/* A nota também quebra em vez de truncar: ela costuma carregar um
            valor, e valor pela metade é pior do que uma linha a mais. */}
        {nota && (
          <p className="mt-0.5 line-clamp-2 text-2xs leading-tight text-foreground-subtle">
            {nota}
          </p>
        )}
      </div>

      {/* ── md para cima: o cartão de sempre ── */}
      <div className="hidden md:flex md:flex-col md:gap-5">
        <div className="flex items-start gap-4">
          <div
            className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-lg", styles.iconBg)}
          >
            <Icon className={cn("h-5 w-5", styles.iconText)} strokeWidth={2} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          {deltaPct !== undefined ? (
            <div
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium",
                positive ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
              )}
            >
              {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(deltaPct).toFixed(0)}%
            </div>
          ) : (
            <span />
          )}
          {footer}
        </div>
      </div>
    </div>
  );
}
