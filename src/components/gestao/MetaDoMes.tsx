import { useState } from "react";
import { Pencil, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VisaoDeGestao } from "@/lib/gestao/visao";
import { inteiro, pct, reais } from "@/lib/gestao/formato";
import { cn } from "@/lib/utils";

// A meta de faturamento do mês: quanto já foi, onde deveria estar e onde o mês
// fecha no ritmo de agora. Só existe na Gestão (administrador) — o faturamento
// não aparece para a recepção nem para dentistas.

export function MetaDoMes({
  meta,
  onSalvar,
}: {
  meta: VisaoDeGestao["meta"];
  /** Grava a meta (nulo apaga). Rejeita com a mensagem de erro. */
  onSalvar: (valor: number | null) => Promise<unknown>;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const abrir = () => {
    setTexto(meta.valor ? String(meta.valor) : "");
    setErro(null);
    setEditando(true);
  };
  const salvar = async (valor: number | null) => {
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar(valor);
      setEditando(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };
  const valorDigitado = Number(texto.replace(/\./g, "").replace(",", "."));

  const formulario = (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void salvar(valorDigitado);
      }}
    >
      <span className="text-sm text-muted-foreground">R$</span>
      <Input
        autoFocus
        inputMode="decimal"
        placeholder="60000"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="h-9 w-36"
        aria-label="Meta de faturamento do mês"
      />
      <Button type="submit" variant="premium" size="sm" disabled={salvando || !(valorDigitado > 0)}>
        Salvar
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(false)}>
        Cancelar
      </Button>
      {meta.valor && (
        <button
          type="button"
          onClick={() => void salvar(null)}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-danger hover:underline"
        >
          Remover meta
        </button>
      )}
      {erro && <p className="w-full text-xs text-danger">{erro}</p>}
    </form>
  );

  // Sem meta cadastrada: um convite, não uma tela vazia.
  if (!meta.valor || !meta.andamento) {
    return (
      <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-soft text-violet">
            <Target className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Meta de faturamento do mês</p>
            <p className="text-xs text-muted-foreground">
              Defina quanto a clínica quer faturar e acompanhe o ritmo todo dia.
            </p>
          </div>
        </div>
        {editando ? (
          formulario
        ) : (
          <Button variant="premium" size="sm" onClick={abrir}>
            Definir meta
          </Button>
        )}
      </div>
    );
  }

  const m = meta.andamento;
  const cor = m.atingida || m.noRitmo ? "var(--success)" : "var(--coral)";
  const marca = m.emAndamento && m.meta > 0 ? (m.esperadoAteHoje / m.meta) * 100 : null;
  return (
    <div className="surface-card space-y-4 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Faturado no mês</p>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[28px] font-semibold leading-tight tracking-tight tabular-nums">
            {reais(m.faturado)}
            <span className="text-base font-normal text-muted-foreground">de {reais(m.meta)}</span>
          </p>
        </div>
        {editando ? (
          formulario
        ) : (
          <button
            type="button"
            onClick={abrir}
            className="press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" /> Editar meta
          </button>
        )}
      </div>

      <div>
        <div className="relative h-2.5 overflow-hidden rounded-full bg-muted/70">
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${Math.min(100, m.pct)}%`, background: cor }}
          />
          {marca !== null && (
            <div
              className="absolute inset-y-0 w-0.5 bg-foreground/40"
              style={{ left: `${Math.min(100, marca)}%` }}
              title={`Onde deveria estar hoje: ${reais(m.esperadoAteHoje)}`}
            />
          )}
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-x-4 text-xs text-muted-foreground">
          <span
            className={cn("font-medium", m.atingida || m.noRitmo ? "text-success" : "text-warning")}
          >
            {pct(m.pct)} da meta
            {m.emAndamento && !m.atingida && (m.noRitmo ? " · no ritmo" : " · abaixo do ritmo")}
          </span>
          {marca !== null && <span>Hoje deveria estar em {reais(m.esperadoAteHoje)}</span>}
        </div>
      </div>

      {!m.atingida && (
        <div className="grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Faltam</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">{reais(m.faltam)}</p>
          </div>
          {m.projecao !== null && (
            <div>
              <p className="text-xs text-muted-foreground">Fecha o mês em</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{reais(m.projecao)}</p>
              <p className="text-2xs text-muted-foreground">no ritmo de agora</p>
            </div>
          )}
          {m.atendimentosQueFaltam !== null && m.emAndamento && (
            <div>
              <p className="text-xs text-muted-foreground">Atendimentos que faltam</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">
                {inteiro(m.atendimentosQueFaltam)}
              </p>
              <p className="text-2xs text-muted-foreground">ao ticket médio do mês</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
