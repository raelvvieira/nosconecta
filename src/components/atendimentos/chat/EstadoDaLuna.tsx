import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BotOff, ChevronDown, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import {
  devolverParaIa,
  getEstadoDaLunaNaConversa,
  resolverDuvidaDaLuna,
} from "@/lib/agente-ia/agente.functions";
import { useNomeDaAssistente } from "@/components/agente-ia/useNomeDaAssistente";

/**
 * A faixa que diz o que a Luna está fazendo nesta conversa — e deixa agir.
 *
 * ── O que ela conserta ───────────────────────────────────────────────────
 *
 * Duas coisas invisíveis, as duas medidas na auditoria de 15/10.
 *
 * **A Luna calada para sempre.** Quando alguém da clínica responde numa
 * conversa, a sessão ganha `human_took_over_at` e ela não volta a falar ali.
 * São 2.910 mensagens descartadas por esse motivo, em 171 das 291 conversas, e
 * não havia nem como saber que era isso: a conversa simplesmente ficava quieta.
 * A função que desfaz a marca (`devolverParaIa`) existia desde o começo e não
 * era chamada de lugar nenhum do sistema.
 *
 * **A dúvida que ninguém sabia que existia.** Ela disse 50 vezes, em 31
 * conversas, que ia confirmar algo com a equipe. Nenhuma dessas 50 chegou a
 * ninguém — era uma frase no texto e nada mais.
 *
 * ── Por que aqui, em cima do campo de escrever ───────────────────────────
 *
 * Porque é o instante em que a pessoa decide se digita. Dentro do painel do
 * perfil — que fecha, e abaixo de `xl` é gaveta — o estado continuaria
 * invisível para quem só olha a conversa. Em cima do composer ele está no
 * caminho dos olhos de quem vai responder.
 *
 * Fora desses dois estados a faixa não existe: na imensa maioria das conversas
 * a Luna está atendendo normalmente, e uma tarja permanente dizendo "tudo bem"
 * é ruído que se aprende a ignorar — inclusive quando deixa de dizer isso.
 */
export function EstadoDaLuna({ conversationId }: { conversationId: string }) {
  const luna = useNomeDaAssistente();
  const queryClient = useQueryClient();
  const buscar = useServerFn(getEstadoDaLunaNaConversa);
  const devolver = useServerFn(devolverParaIa);
  const resolver = useServerFn(resolverDuvidaDaLuna);

  const estado = useQuery({
    queryKey: ["luna-na-conversa", conversationId],
    queryFn: () => buscar({ data: { conversationId } }),
    staleTime: 15_000,
  });

  const invalidar = () =>
    queryClient.invalidateQueries({ queryKey: ["luna-na-conversa", conversationId] });

  const aoDevolver = useMutation({
    mutationFn: (sessionId: string) => devolver({ data: { sessionId } }),
    onSuccess: async () => {
      await invalidar();
      toast.success(`A ${luna} voltou a atender esta conversa.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const aoResolver = useMutation({
    mutationFn: (sessionId: string) => resolver({ data: { sessionId } }),
    onSuccess: async () => {
      await invalidar();
      toast.success("Dúvida marcada como respondida.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dados = estado.data;
  if (!dados) return null;

  // ── Humano assumiu ──────────────────────────────────────────────────────
  //
  // Vem antes da dúvida porque é o estado mais forte: com a conversa assumida a
  // Luna não fala de jeito nenhum, e a dúvida pendente deixa de ser o que
  // importa. Mostrar as duas faixas juntas dividiria a atenção entre uma ação
  // que resolve e outra que não muda nada enquanto a primeira não acontecer.
  if (dados.humanoAssumiuEm) {
    return (
      <Faixa
        tom="warning"
        icone={<BotOff className="h-4 w-4 shrink-0" strokeWidth={1.75} />}
        titulo={`${luna} pausada`}
        texto={
          dados.agenteLigado
            ? `A equipe respondeu ${quando(dados.humanoAssumiuEm)}; desde então ela não fala aqui.`
            : `A equipe respondeu ${quando(dados.humanoAssumiuEm)}. A ${luna} também está desligada no geral.`
        }
        rotuloDaAcao={aoDevolver.isPending ? "Devolvendo…" : "Devolver"}
        ocupado={aoDevolver.isPending}
        acao={() => aoDevolver.mutate(dados.sessionId)}
      />
    );
  }

  if (dados.duvidaPendente) {
    return (
      <Faixa
        tom="info"
        icone={<HelpCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} />}
        titulo="Dúvida para a equipe"
        texto={`“${dados.duvidaPendente}” — ${quando(dados.duvidaPendenteEm)}. Responda à pessoa e marque como respondida.`}
        rotuloDaAcao={aoResolver.isPending ? "Marcando…" : "Já respondi"}
        ocupado={aoResolver.isPending}
        acao={() => aoResolver.mutate(dados.sessionId)}
      />
    );
  }

  return null;
}

/** A mesma faixa nos dois estados, só o tom muda. Duas marcações diferentes
 *  para a mesma coisa é como elas passam a divergir. */
function Faixa({
  tom,
  icone,
  titulo,
  texto,
  rotuloDaAcao,
  ocupado,
  acao,
}: {
  tom: "warning" | "info";
  icone: React.ReactNode;
  titulo: string;
  texto: string;
  rotuloDaAcao: string;
  ocupado: boolean;
  acao: () => void;
}) {
  const cor =
    tom === "warning"
      ? "border-warning/30 bg-warning-soft text-warning"
      : "border-info/30 bg-info-soft text-info";

  // Um selo de uma linha, e não uma faixa de seis: o texto longo ocupava o
  // espaço da conversa no celular (23/10). A explicação abre num toque.
  const [aberto, setAberto] = useState(false);
  return (
    <div className="border-t border-border px-4 py-2 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className={`flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cor}`}
        >
          {icone}
          <span className="truncate">{titulo}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`}
          />
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={acao}
          className="ml-auto shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-pink transition hover:bg-pink-soft disabled:opacity-60"
        >
          {rotuloDaAcao}
        </button>
      </div>
      {aberto && <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{texto}</p>}
    </div>
  );
}

/** "há 20 minutos", "ontem". Sem biblioteca: é uma frase, não um calendário. */
function quando(iso: string | null): string {
  if (!iso) return "há pouco";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "há pouco";
  const minutos = Math.floor((Date.now() - t) / 60_000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "ontem" : `há ${dias} dias`;
}
