import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { getSugestoesDaConversa } from "@/lib/agente-ia/agente.functions";
import { CardDoPainel } from "./CardDoPainel";
import { cn } from "@/lib/utils";

/**
 * O que dizer agora, no painel da conversa.
 *
 * ── Por que a chave da consulta é a última mensagem ────────────────────
 *
 * A thread refaz a busca de mensagens a cada 5–20 s. Se a sugestão seguisse
 * esse ritmo, cada conversa aberta viraria uma chamada ao modelo a cada poucos
 * segundos — e o que a clínica paga não é a tela, é a chamada.
 *
 * Com o id da última mensagem na chave e `staleTime: Infinity`, a sugestão não
 * segue o relógio: segue a CONVERSA. Mensagem nova, chave nova, exatamente uma
 * chamada. Conversa parada, acerto de cache, custo zero — mesmo que alguém
 * deixe a tela aberta a tarde inteira.
 *
 * Nunca definir `refetchInterval` aqui.
 *
 * ── Por que o verde é só das sugestões ─────────────────────────────────
 *
 * A casca fica `surface-card`, igual aos outros oito cards do painel. Um card
 * inteiro verde no meio de oito brancos lê como alerta, não como ajuda. O
 * verde pertence ao que dá para acionar.
 */
export function CardDeSugestoes({
  conversationId,
  chaveDasMensagens,
  onUsar,
  onArrastar,
}: {
  conversationId: string;
  /** O id da última mensagem da conversa. `null` desabilita: sugerir sem
   *  histórico é inventar abertura, e abertura já é o manual do Agente. */
  chaveDasMensagens: string | null;
  onUsar: (texto: string) => void;
  /** Começa o arraste do card para a conversa. Ausente = só o botão. */
  onArrastar?: (e: React.PointerEvent, texto: string) => void;
}) {
  const buscar = useServerFn(getSugestoesDaConversa);

  const query = useQuery({
    queryKey: ["sugestoes-da-conversa", conversationId, chaveDasMensagens],
    queryFn: () => buscar({ data: { conversationId } }),
    enabled: Boolean(conversationId && chaveDasMensagens),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    // Recusa do modelo não merece três tentativas — nem a conta que vem com
    // elas.
    retry: false,
  });

  const dados = query.data;
  const sugestoes = dados?.sugestoes ?? [];

  // Sem chave, sem histórico ou recusa: o card some. Um aviso em toda conversa
  // aberta seria ruído sobre algo que ninguém pediu — e a clínica que nunca
  // configurou chave não fez nada errado.
  if (!query.isPending && !sugestoes.length) return null;
  if (!chaveDasMensagens) return null;

  return (
    <CardDoPainel
      icone={Sparkles}
      titulo="O que dizer agora"
      acao={
        dados?.etapaAtual ? (
          <span
            className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success"
            title={dados.porqueEssaEtapa ?? undefined}
          >
            {dados.etapaAtual}
          </span>
        ) : null
      }
    >
      {query.isPending ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lendo a conversa…
        </div>
      ) : (
        <ul className="space-y-2.5">
          {sugestoes.map((s, i) => (
            <li
              key={i}
              onPointerDown={onArrastar ? (e) => onArrastar(e, s.fala) : undefined}
              className={cn(
                "rounded-2xl bg-success-soft p-3.5 ring-1 ring-success/15",
                "transition-transform",
                // `touch-none` só aqui, nunca no painel: com ele no contêiner,
                // a lista de cards para de rolar no celular.
                onArrastar && "cursor-grab touch-none active:scale-[0.99]",
              )}
            >
              <p className="text-sm leading-6">{s.fala}</p>
              {s.porque && <p className="mt-1.5 text-xs text-success/80">{s.porque}</p>}
              <button
                type="button"
                // O clique não pode virar arraste nem o arraste virar clique:
                // o gesto começa no `li`, e parar a propagação aqui deixa o
                // botão ser botão.
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onUsar(s.fala)}
                className="mt-2.5 text-xs font-medium text-success underline-offset-4 hover:underline"
              >
                Usar esta
              </button>
            </li>
          ))}
        </ul>
      )}
    </CardDoPainel>
  );
}
