import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Janelas de "recebeu recentemente", em dias.
 *
 *  15 e 30 entraram junto com o envio em lotes: respeitando a cota diária, uma
 *  base de 800 contatos leva 4 ou 5 dias, e com a janela em 1 dia quem recebeu
 *  na segunda voltaria a ser oferecido na quarta. A janela precisa poder cobrir
 *  a campanha inteira. */
export const JANELAS = [1, 3, 7, 15, 30];

/**
 * Os filtros da base de contatos.
 *
 * O desenho anterior era três blocos que não conversavam: duas caixas de
 * largura cheia, cada uma com uma frase de explicação e uma contagem embutidas,
 * mais as fichas de DDD soltas embaixo. Para saber "o que estou vendo" era
 * preciso ler duas frases longas e somar de cabeça.
 *
 * Agora são estados, não sentenças: duas pílulas que ligam e desligam, o
 * seletor de janela preso à pílula que ele modifica (antes vivia na borda
 * oposta da caixa), e UMA linha de prestação de contas no fim, somando todo
 * mundo que ficou de fora. A explicação não sumiu — mudou para um lugar só,
 * que é o que a diferencia de minimalismo.
 */
export function FiltrosDeContatos({
  busca,
  onBusca,
  separavel,
  soDoNumeroAtual,
  onSoDoNumeroAtual,
  omitidosPorNumero,
  temRecentes,
  ocultarRecentes,
  onOcultarRecentes,
  janelaDias,
  onJanelaDias,
  omitidosPorRecente,
  semTelefone,
  visiveis,
  base,
}: {
  busca: string;
  onBusca: (v: string) => void;
  /** Dá para separar por caixa de WhatsApp? Sem isso o filtro seria invenção. */
  separavel: boolean;
  soDoNumeroAtual: boolean;
  onSoDoNumeroAtual: (v: boolean) => void;
  omitidosPorNumero: number;
  temRecentes: boolean;
  ocultarRecentes: boolean;
  onOcultarRecentes: (v: boolean) => void;
  janelaDias: number;
  onJanelaDias: (v: number) => void;
  omitidosPorRecente: number;
  semTelefone: number;
  /** Quantos sobraram depois de tudo. */
  visiveis: number;
  /** Quantos existiam antes de qualquer filtro. */
  base: number;
}) {
  // Uma frase por motivo de exclusão, juntadas no fim. Número que some sem
  // explicação é pior do que número errado — mas a explicação cabe numa linha
  // só, em vez de uma dentro de cada controle.
  const excluidos: string[] = [];
  if (separavel && soDoNumeroAtual && omitidosPorNumero > 0) {
    excluidos.push(`${omitidosPorNumero} de outro número`);
  }
  if (ocultarRecentes && omitidosPorRecente > 0) {
    excluidos.push(`${omitidosPorRecente} com disparo recente`);
  }
  if (semTelefone > 0) {
    excluidos.push(`${semTelefone} sem telefone`);
  }

  return (
    <div className="mt-5 space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-busca-contato=""
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar por nome ou número"
          className="h-12 rounded-xl bg-white pl-11 shadow-soft"
        />
      </div>

      {(separavel || temRecentes) && (
        <div className="flex flex-wrap items-center gap-2">
          {separavel && (
            <PilulaDeFiltro
              data-so-numero-atual=""
              ativa={soDoNumeroAtual}
              onClick={() => onSoDoNumeroAtual(!soDoNumeroAtual)}
            >
              Número conectado
            </PilulaDeFiltro>
          )}

          {temRecentes && (
            // A pílula e o seletor de janela num invólucro só: são o mesmo
            // controle, e separá-los foi o que tornava a versão anterior
            // difícil de ler. O seletor só existe quando a pílula está ligada —
            // escolher "30 dias" com o filtro desligado não faz nada.
            <div className="flex items-center gap-1.5">
              <PilulaDeFiltro
                data-ocultar-recentes=""
                ativa={ocultarRecentes}
                onClick={() => onOcultarRecentes(!ocultarRecentes)}
              >
                Sem disparo recente
              </PilulaDeFiltro>
              {ocultarRecentes && (
                <Select value={String(janelaDias)} onValueChange={(v) => onJanelaDias(Number(v))}>
                  <SelectTrigger
                    data-janela-recentes=""
                    className="h-11 w-[104px] shrink-0 rounded-full border-border bg-white text-sm"
                    aria-label="Em quantos dias considerar um disparo recente"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JANELAS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d === 1 ? "1 dia" : `${d} dias`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>
      )}

      {/* A linha que fecha a conta. Só aparece quando há o que explicar. */}
      {excluidos.length > 0 && (
        <p data-contas-do-filtro="" className="px-1 text-2xs leading-4 text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{visiveis}</span> de {base}{" "}
          contatos · fora: {excluidos.join(", ")}.
        </p>
      )}
    </div>
  );
}

/**
 * Pílula de estado: ligada é preenchida e com marca, desligada é contorno.
 *
 * Alvo de 44px e resposta no toque, não na soltura (`press` reage a
 * `:active`) — sem isso o controle parece morto no celular, que é onde a
 * clínica monta o disparo.
 */
function PilulaDeFiltro({
  ativa,
  onClick,
  children,
  ...rest
}: {
  ativa: boolean;
  onClick: () => void;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ativa}
      onClick={onClick}
      className={cn(
        "press inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2",
        ativa
          ? "border-coral bg-coral-soft text-coral"
          : "border-border bg-white text-foreground-secondary",
      )}
      {...rest}
    >
      <span
        aria-hidden
        className={cn(
          "grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors",
          ativa ? "border-coral bg-coral text-white" : "border-border bg-transparent",
        )}
      >
        {ativa && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      {children}
    </button>
  );
}
