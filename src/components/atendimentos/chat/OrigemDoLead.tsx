import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  Globe,
  Instagram,
  MessageCircle,
  Phone,
  Tag,
  Users,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  definirOrigemDoLead,
  type ConversationRow,
} from "@/lib/atendimentos/atendimentos.functions";
import { ORIGENS, rotuloDaOrigem, type OrigemDoLead } from "@/lib/atendimentos/origem-do-lead";
import { cn } from "@/lib/utils";

/**
 * O símbolo de cada origem, desenhado aqui (sem imagem externa).
 *
 * Meta é o infinito azul, WhatsApp o balão verde — as duas que a recepção mais
 * vê. As demais seguem o mesmo molde: um círculo de cor própria com o glifo
 * branco, para a lista ler de relance sem virar um arco-íris.
 */
function Simbolo({ tipo }: { tipo: OrigemDoLead }) {
  const base = "grid h-full w-full place-items-center rounded-full text-white";
  switch (tipo) {
    case "meta_ads":
      return (
        <span className={base} style={{ backgroundColor: "#0866FF" }}>
          <svg viewBox="0 0 24 24" className="h-[70%] w-[70%]" fill="none" aria-hidden>
            <path
              d="M5.5 12c0-2.4 1.3-4.5 3.1-4.5 2.7 0 3.6 9 6.8 9 1.8 0 3.1-2.1 3.1-4.5S17.2 7.5 15.4 7.5c-3.2 0-4.1 9-6.8 9-1.8 0-3.1-2.1-3.1-4.5Z"
              stroke="white"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      );
    case "organico":
      return (
        <span className={base} style={{ backgroundColor: "#25D366" }}>
          <span className="relative grid h-[68%] w-[68%] place-items-center">
            <MessageCircle className="absolute inset-0 h-full w-full" strokeWidth={2.4} />
            <Phone className="h-[42%] w-[42%]" strokeWidth={2.8} />
          </span>
        </span>
      );
    case "google_ads":
      return (
        <span
          className={cn(base, "border border-border bg-white font-bold")}
          style={{ color: "#4285F4", fontSize: "0.7em", lineHeight: 1 }}
        >
          G
        </span>
      );
    case "instagram":
      return (
        <span
          className={base}
          style={{ background: "linear-gradient(135deg,#feda75,#d62976 55%,#4f5bd5)" }}
        >
          <Instagram className="h-[62%] w-[62%]" strokeWidth={2.4} />
        </span>
      );
    case "indicacao":
      return (
        <span className={base} style={{ backgroundColor: "#7c6af2" }}>
          <Users className="h-[60%] w-[60%]" strokeWidth={2.4} />
        </span>
      );
    case "site":
      return (
        <span className={base} style={{ backgroundColor: "#475569" }}>
          <Globe className="h-[62%] w-[62%]" strokeWidth={2.4} />
        </span>
      );
    default:
      return (
        <span className={base} style={{ backgroundColor: "#94a3b8" }}>
          <Tag className="h-[58%] w-[58%]" strokeWidth={2.4} />
        </span>
      );
  }
}

/** A bolinha que fica no canto da foto de perfil, na lista de conversas. */
export function SeloDeOrigem({ tipo, manual }: { tipo: OrigemDoLead; manual?: boolean }) {
  return (
    <span
      role="img"
      aria-label={`Origem: ${rotuloDaOrigem(tipo)}${manual ? "" : " (estimada)"}`}
      title={`${rotuloDaOrigem(tipo)}${manual ? "" : " · estimada"}`}
      className="absolute -bottom-0.5 -right-0.5 h-[18px] w-[18px] rounded-full bg-white p-px shadow-sm ring-2 ring-background"
    >
      <Simbolo tipo={tipo} />
    </span>
  );
}

/** Mini símbolo para os itens do menu. */
function SimboloPequeno({ tipo }: { tipo: OrigemDoLead }) {
  return (
    <span className="h-[18px] w-[18px] shrink-0">
      <Simbolo tipo={tipo} />
    </span>
  );
}

/**
 * "Origem do lead" no cabeçalho da conversa, ao lado da Tag.
 *
 * Mostra a origem atual; escolher outra grava para a PESSOA (vale em todas as
 * conversas do mesmo número) e "Voltar à estimativa" devolve ao que o WhatsApp
 * provou.
 */
export function SeletorDeOrigem({
  conversa,
  className,
}: {
  conversa: Pick<ConversationRow, "id" | "phone" | "origem">;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const definir = useServerFn(definirOrigemDoLead);
  const mutacao = useMutation({
    mutationFn: (origem: OrigemDoLead | null) =>
      definir({ data: { phone: conversa.phone, conversationId: conversa.id, origem } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
    onError: (e: Error) => toast.error(e.message || "Não foi possível salvar a origem"),
  });
  const { tipo, manual } = conversa.origem;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Origem do lead: ${rotuloDaOrigem(tipo)}${manual ? "" : " (estimada)"}`}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-white text-xs font-semibold max-lg:w-9 max-lg:justify-center lg:px-3",
            className,
          )}
        >
          <SimboloPequeno tipo={tipo} />
          <span className="max-lg:hidden">{rotuloDaOrigem(tipo)}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground max-lg:hidden" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <p className="px-2 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
          Origem do lead
        </p>
        {ORIGENS.map((o) => (
          <DropdownMenuItem key={o.id} onClick={() => mutacao.mutate(o.id)} className="gap-2.5">
            <SimboloPequeno tipo={o.id} />
            <span className="flex-1">{o.rotulo}</span>
            {manual && tipo === o.id && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!manual}
          onClick={() => mutacao.mutate(null)}
          className="text-muted-foreground"
        >
          {manual ? "Voltar à estimativa" : "Estimada pelo WhatsApp"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
