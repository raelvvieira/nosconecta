import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/finance/Combobox";
import { formatBRL } from "@/lib/finance/format";
import {
  duracaoEmTexto,
  resumoDosProcedimentos,
  type ProcedimentoDoAgendamento,
} from "@/lib/agenda/procedimentos";
import type { Procedure } from "./types";

/**
 * Os procedimentos da sessão.
 *
 * ── Por que uma lista, e não um campo ───────────────────────────────────
 *
 * A clínica faz mais de um procedimento na mesma sessão — limpeza e
 * restauração. Com um campo só, quem agendava escolhia um e escrevia o resto
 * nas observações, onde nada soma e nada conta: o valor previsto ficava menor
 * que o real e a duração reservada não cabia no que ia ser feito.
 *
 * ── Por que o total fica no cabeçalho ───────────────────────────────────
 *
 * É o ganho escondido do pedido. Hoje ninguém vê quanto a sessão vai custar
 * nem quanto vai durar antes de salvar; a partir daqui, vê — e vê enquanto
 * ainda dá para mudar. Cada linha repete preço e duração porque sem eles o
 * número de cima parece mágica.
 *
 * ── Por que o botão vira campo, e volta ─────────────────────────────────
 *
 * O `Combobox` aberto permanentemente ocuparia a altura de um campo para uma
 * ação que quase sempre acontece uma ou duas vezes. Recolhido, a lista é o
 * que ocupa espaço — que é o que a pessoa está olhando.
 */
export function ProcedimentosDoAgendamento({
  procedimentos,
  catalogo,
  onChange,
}: {
  procedimentos: ProcedimentoDoAgendamento[];
  catalogo: Procedure[];
  onChange: (lista: ProcedimentoDoAgendamento[]) => void;
}) {
  const [adicionando, setAdicionando] = useState(false);

  const resumo = resumoDosProcedimentos(procedimentos);

  // O que já está na lista sai das opções. Escolher duas vezes o mesmo é quase
  // sempre clique duplo, e esconder é mais claro que aceitar e descartar
  // depois — a pessoa vê que já está lá.
  const escolhidos = new Set(procedimentos.map((p) => p.procedureId).filter(Boolean));
  const disponiveis = catalogo.filter((p) => !escolhidos.has(p.id));

  const adicionar = (id: string) => {
    const proc = catalogo.find((p) => p.id === id);
    setAdicionando(false);
    if (!proc) return;
    onChange([
      ...procedimentos,
      { procedureId: proc.id, name: proc.name, price: proc.price, duration: proc.duration },
    ]);
  };

  const remover = (indice: number) => onChange(procedimentos.filter((_, i) => i !== indice));

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-sm text-foreground-secondary">Procedimentos</Label>
        {procedimentos.length > 0 && (
          <span className="text-xs font-medium text-foreground-secondary tabular-nums">
            {formatBRL(resumo.valor)} · {resumo.duracaoTexto}
          </span>
        )}
      </div>

      {procedimentos.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {procedimentos.map((p, i) => (
            <li
              key={`${p.procedureId ?? "livre"}-${i}`}
              className="flex items-center gap-2 bg-white px-3 py-2"
            >
              {/* `min-w-0` + `truncate`: nome comprido corta, não empurra o
                  preço para fora nem quebra a linha em duas. */}
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{p.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatBRL(p.price)} · {duracaoEmTexto(p.duration)}
              </span>
              <button
                type="button"
                onClick={() => remover(i)}
                aria-label={`Remover ${p.name}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adicionando ? (
        <Combobox
          value=""
          onChange={adicionar}
          // Nasce aberto e some ao fechar: quem clicou em "Adicionar" já disse
          // o que queria, e clicar de novo no campo que acabou de aparecer
          // seria um passo inventado. Fechar sem escolher devolve o botão.
          defaultOpen
          onClose={() => setAdicionando(false)}
          options={disponiveis.map((p) => ({ value: p.id, label: p.name }))}
          placeholder="Selecionar..."
          searchPlaceholder="Buscar procedimento..."
          emptyText="Nenhum procedimento encontrado"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdicionando(true)}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm text-foreground-secondary transition-colors hover:border-pink/40 hover:text-pink"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Adicionar procedimento
        </button>
      )}
    </div>
  );
}
