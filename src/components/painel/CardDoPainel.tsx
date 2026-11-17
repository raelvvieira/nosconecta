import { useEffect, useId, useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { diaParaLer } from "@/lib/date";

/**
 * Quais seções recolhíveis estão abertas, lembradas neste navegador.
 *
 * Guardado por `chave` (uma por seção, a mesma em todas as conversas): quem
 * deixou "Notas" aberta quer vê-la aberta na próxima conversa também. Toda
 * leitura e escrita está em try/catch: aba anônima ou armazenamento bloqueado
 * não podem derrubar o painel, só fazê-lo esquecer.
 */
const ARMAZEM_DAS_SECOES = "painel-do-contato:secoes";

function secoesLembradas(): Record<string, boolean> {
  try {
    const v = JSON.parse(localStorage.getItem(ARMAZEM_DAS_SECOES) ?? "{}");
    return v && typeof v === "object" ? (v as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function useSecaoAberta(chave: string | undefined, padrao: boolean) {
  const [aberto, setAberto] = useState(padrao);
  // Depois de montar, e não no estado inicial: o servidor não tem
  // `localStorage`, e começar diferente do que ele renderizou quebra a hidratação.
  useEffect(() => {
    if (!chave) return;
    const lembrado = secoesLembradas()[chave];
    if (typeof lembrado === "boolean") setAberto(lembrado);
  }, [chave]);
  const alternar = () => {
    const novo = !aberto;
    setAberto(novo);
    if (!chave) return;
    try {
      localStorage.setItem(
        ARMAZEM_DAS_SECOES,
        JSON.stringify({ ...secoesLembradas(), [chave]: novo }),
      );
    } catch {
      /* sem armazenamento: vale só nesta tela */
    }
  };
  return [aberto, alternar] as const;
}

/**
 * A casca de um card do painel do contato.
 *
 * Existe porque o painel tem nove seções: escritas à mão, elas divergiriam em
 * padding, raio e tamanho de título — foi o que aconteceu com os cabeçalhos de
 * página antes do `PageHeading`. Aqui o ajuste acontece num lugar só.
 *
 * O ícone fica em cinza, e não em coral: nove ícones coloridos numa coluna
 * estreita viram uma listra, e nenhum deles chama atenção para nada. O coral do
 * painel é reservado para o que exige ação.
 *
 * ── Recolhível ────────────────────────────────────────────────────────────
 *
 * Com `recolhivel`, o cabeçalho vira um botão que abre e fecha o conteúdo, e
 * a seção fechada ainda diz o essencial numa linha (`resumo`): "Próx. 21/11
 * 14:00", "R$ 300 em atraso". Nove cards abertos numa coluna estreita obrigam a
 * rolar para achar o que se procura; fechados, cabem todos na tela e o
 * resumo basta para quase todo olhar. O que é perigo (alergia, atraso) tem de
 * aparecer no resumo, porque fechar não pode esconder aviso.
 */
export function CardDoPainel({
  icone: Icone,
  titulo,
  acao,
  resumo,
  recolhivel = false,
  chave,
  abertoPorPadrao = false,
  children,
  className,
}: {
  icone: LucideIcon;
  titulo: string;
  /** Link ou botão à direita do título — "Ver ficha", "Abrir", etc. */
  acao?: React.ReactNode;
  /** Só com `recolhivel`: o que a seção diz de si mesma enquanto fechada. */
  resumo?: React.ReactNode;
  recolhivel?: boolean;
  /** Só com `recolhivel`: identifica a seção para lembrar se ficou aberta. */
  chave?: string;
  abertoPorPadrao?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [aberto, alternar] = useSecaoAberta(chave, abertoPorPadrao);
  const idDoCorpo = useId();

  if (!recolhivel) {
    return (
      <section className={cn("surface-card p-5", className)}>
        <div className="flex items-center justify-between gap-3">
          {/* O título não quebra e não encolhe; quem cede espaço é a ação ao
              lado. Antes, uma etiqueta longa ("Triagem de segurança: a pessoa
              relatou…") espremia "O que dizer agora" numa palavra por linha. */}
          <h3 className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold">
            <Icone className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            {titulo}
          </h3>
          {acao && <div className="flex min-w-0 justify-end">{acao}</div>}
        </div>
        <div className="mt-3.5">{children}</div>
      </section>
    );
  }

  return (
    <section className={cn("surface-card", className)}>
      <div className="flex items-center gap-2 pr-4">
        <button
          type="button"
          onClick={alternar}
          aria-expanded={aberto}
          aria-controls={idDoCorpo}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl py-4 pl-5 pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Icone className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <span className="shrink-0 whitespace-nowrap text-sm font-semibold">{titulo}</span>
          <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
            {!aberto && resumo}
          </span>
        </button>
        {acao && <div className="flex shrink-0 justify-end">{acao}</div>}
        {/* O chevron é um botão à parte, depois da ação: assim fica sempre na
            ponta direita, igual em todos os cards, e a ação ("Abrir") não o
            empurra para o meio. Fica fora da ordem do teclado porque o botão do
            título já faz o mesmo trabalho. */}
        <button
          type="button"
          onClick={alternar}
          tabIndex={-1}
          aria-hidden="true"
          className="grid h-8 w-6 shrink-0 place-items-center rounded-full"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
              aberto && "rotate-180",
            )}
          />
        </button>
      </div>
      {/* A altura anima por `grid-template-rows` (0fr → 1fr): é a forma de
          animar "altura automática" sem medir nada em JavaScript. Fechado, o
          conteúdo fica `invisible`, e assim sai da ordem de tabulação sem
          desmontar — o rascunho de uma nota não se perde ao recolher. */}
      <div
        id={idDoCorpo}
        className={cn(
          "grid transition-[grid-template-rows,visibility] duration-200 motion-reduce:transition-none",
          aberto ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-5 pb-5">{children}</div>
        </div>
      </div>
    </section>
  );
}

/**
 * Uma linha rótulo → valor.
 *
 * `valor` nulo vira travessão, nunca some e nunca vira zero. Uma linha ausente
 * faria a lista mudar de tamanho conforme o cadastro, e quem lê não saberia se
 * o campo não existe ou se está vazio — que são coisas diferentes na hora de
 * decidir se pede o dado ao paciente.
 */
export function LinhaDoPainel({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-xs text-muted-foreground">{rotulo}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right",
          valor ? "text-foreground" : "text-muted-foreground",
        )}
        title={valor ?? undefined}
      >
        {valor ?? "—"}
      </span>
    </div>
  );
}

/** Um número grande com rótulo — para o card de financeiro. */
export function NumeroDoPainel({
  rotulo,
  valor,
  tom = "normal",
}: {
  rotulo: string;
  valor: string | null;
  tom?: "normal" | "atraso";
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-2xs text-muted-foreground">{rotulo}</p>
      <p
        className={cn(
          "mt-0.5 truncate text-base font-semibold",
          !valor && "text-muted-foreground",
          valor && tom === "atraso" && "text-danger",
        )}
      >
        {valor ?? "—"}
      </p>
    </div>
  );
}

/**
 * Uma consulta — a próxima ou a última.
 *
 * Mora aqui, e não dentro do painel do chat onde nasceu, porque o resumo do
 * paciente na agenda mostra exatamente as mesmas duas linhas. Duas cópias
 * divergiriam no formato da data, que é justamente onde este projeto já
 * tropeçou antes (ver `dia` abaixo).
 */
export function CardDeConsulta({
  rotulo,
  c,
  destaque,
}: {
  rotulo: string;
  c: { date: string; time: string; procedure: string; professional: string };
  destaque?: boolean;
}) {
  return (
    <div className={cn("rounded-2xl px-4 py-3", destaque ? "bg-coral-soft" : "bg-muted/60")}>
      <p className={cn("text-2xs", destaque ? "text-coral" : "text-muted-foreground")}>{rotulo}</p>
      <p className="mt-0.5 text-sm font-semibold">
        {diaParaLer(c.date)} · {c.time}
      </p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {c.procedure}
        {c.professional && ` · ${c.professional}`}
      </p>
    </div>
  );
}
