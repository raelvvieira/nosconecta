import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { PageHeading } from "@/components/layout/PageHeading";
import { Switch } from "@/components/ui/switch";
import {
  aprenderAgora,
  getAtendimento,
  getEstadoDoAgente,
  getPainelDoFunil,
  salvarConfiguracaoDoAgente,
} from "@/lib/agente-ia/agente.functions";
import { PainelDoFunil } from "@/components/agente-ia/PainelDoFunil";
import { ChaveDaIa } from "@/components/agente-ia/ChaveDaIa";
import { ManualDaLuna } from "@/components/agente-ia/ManualDaLuna";
import { ComQuemFala } from "@/components/agente-ia/ComQuemFala";
import { Ritmo } from "@/components/agente-ia/Ritmo";
import { Testar } from "@/components/agente-ia/Testar";
import { Procedimentos } from "@/components/agente-ia/Procedimentos";
import { LicoesDaLuna } from "@/components/agente-ia/LicoesDaLuna";
import { ConsumoDaIa } from "@/components/agente-ia/ConsumoDaIa";
import { OQueAprendeu } from "@/components/agente-ia/OQueAprendeu";

export const Route = createFileRoute("/agente-ia/")({
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar o agente"
      description="Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />
  ),
  component: AgentePage,
});

/**
 * A página do Agente de IA — tudo sobre ele, num lugar só.
 *
 * ── Por que deixou de ter submenu ──────────────────────────────────────
 *
 * Era dividida em quatro: Agente, Aprendizado, Atendimento e Procedimentos.
 * Parecia organizado e escondia coisa. O caso concreto: a chave da IA morava
 * em "Atendimento", DENTRO do modo Inteligência — então uma clínica em modo
 * frase fixa, que é o padrão, não tinha onde cadastrá-la. Para achar o campo
 * era preciso adivinhar a aba e depois mudar o comportamento do agente só
 * para digitar uma senha.
 *
 * Agora é uma página só, na ordem em que as perguntas aparecem: primeiro o que
 * liga a IA (a chave), depois o que MANDA nela (o manual escrito pela clínica),
 * depois com quem ela fala e em que ritmo, o que ela pode citar, e por último o
 * que se LÊ — a matéria-prima do manual e as lições de cada conversa.
 *
 * ── E o que saiu em 28/09 ──────────────────────────────────────────────
 *
 * Três blocos, quando ela foi ligada de verdade: o modo "frase fixa" (existia
 * para provar o caminho antes de envolver o modelo), as "regras de
 * comportamento" (gravavam numa tabela que nenhum código lê) e a barra de
 * progresso do aprendizado com as fontes do funil (o aprendido deixou de ser a
 * instrução quando o manual da clínica entrou, então a barra media o que já não
 * decide nada). Tela que promete e não faz é pior que a ausência dela.
 *
 * Cada bloco mora no seu arquivo em `src/components/agente-ia/` — a página só
 * compõe. Foi o que evitou um arquivo de mil e trezentas linhas ao juntar as
 * quatro telas.
 */
function AgentePage() {
  const queryClient = useQueryClient();
  const buscarEstado = useServerFn(getEstadoDoAgente);
  const buscarPainel = useServerFn(getPainelDoFunil);
  const buscarAtendimento = useServerFn(getAtendimento);
  const salvar = useServerFn(salvarConfiguracaoDoAgente);
  const aprender = useServerFn(aprenderAgora);

  const estadoQuery = useQuery({ queryKey: ["agente-ia"], queryFn: () => buscarEstado() });
  const painelQuery = useQuery({ queryKey: ["agente-ia-painel"], queryFn: () => buscarPainel() });
  const atendimentoQuery = useQuery({
    queryKey: ["agente-ia-atendimento"],
    queryFn: () => buscarAtendimento(),
  });
  const estado = estadoQuery.data;

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["agente-ia"] });

  const ligarDesligar = useMutation({
    mutationFn: (ligado: boolean) => salvar({ data: { ligado } }),
    onSuccess: (_r, ligado) => {
      invalidar();
      toast.success(ligado ? "Agente ativado" : "Agente pausado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rodarCiclo = useMutation({
    mutationFn: () => aprender(),
    onSuccess: (r) => {
      invalidar();
      queryClient.invalidateQueries({ queryKey: ["agente-ia-painel"] });
      if (r.aprendeu) toast.success(`Leu ${r.novas} conversa(s) e atualizou o aprendizado.`);
      else toast.info(r.motivo ?? "Nada novo para aprender.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const config = atendimentoQuery.data;
  const disjuntorAberto =
    config?.circuitoAbertoAte && new Date(config.circuitoAbertoAte) > new Date();

  return (
    <main className="w-full min-w-0 flex-1 px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-10 lg:pt-9">
      <PageHeading
        className="pr-16 lg:pr-0"
        icon={Sparkles}
        title="Agente de IA"
        subtitle="Atende pelo manual que a clínica escreveu, e só quem chega pelos anúncios."
        actions={
          estado && (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-white/70 px-4 py-2.5">
              <span className="text-sm font-medium">{estado.ligado ? "Ativo" : "Pausado"}</span>
              <Switch
                checked={estado.ligado}
                disabled={ligarDesligar.isPending}
                onCheckedChange={(v) => ligarDesligar.mutate(v)}
                aria-label="Ativar o agente"
              />
            </div>
          )
        }
      />

      {estadoQuery.isPending ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {disjuntorAberto && (
            <p className="flex items-center gap-2.5 rounded-2xl bg-warning-soft px-4 py-3 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              Pausado automaticamente após falhas seguidas. Volta sozinho em instantes.
            </p>
          )}

          {/* ── 1. A chave ──────────────────────────────────────────────────
              Primeiro de tudo porque é o que destrava o resto: sem ela a IA
              não responde e as sugestões não aparecem no chat. */}
          <ChaveDaIa />

          {/* ── 2. O manual ─────────────────────────────────────────────────
              Antes do aprendizado de propósito. Este texto é o que a clínica
              escreveu e o que de fato manda na conversa; o aprendizado abaixo é
              o que a IA extraiu lendo as conversas, e hoje serve de matéria para
              melhorar o manual, não de instrução paralela. Na ordem inversa,
              alguém editaria o aprendizado achando que muda o comportamento. */}
          <ManualDaLuna />

          {/* ── 3. Como ela atende ──────────────────────────────────────────
              Com quem ela fala e em que ritmo de um lado; o teste do outro.

              O modo "frase fixa" saiu daqui: ele existia para provar o caminho
              (vínculo, entrega, autenticação) antes de envolver o modelo. Com
              ela atendendo de verdade, o botão só serviria para calar a
              inteligência e mandar a mesma frase a todo mundo que vem do
              anúncio.

              As "regras de comportamento" saíram pelo motivo oposto: elas nunca
              funcionaram. Gravavam linhas numa tabela que NENHUM código lê, e
              duas das quatro (follow-up por silêncio, mover no funil) são ações
              que o motor ainda não tem. Uma tela que promete e não faz é pior
              que a ausência dela: alguém escreve a regra e confia. */}
          <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
            <div className="grid gap-4">
              <ComQuemFala />
              <Ritmo />
            </div>
            <div className="grid gap-4">
              <Testar />
            </div>
          </div>

          {/* ── 4. O que ela pode citar ─────────────────────────────────── */}
          <Procedimentos />

          {/* ── 5. A matéria-prima do manual ─────────────────────────────
              O que ela extraiu lendo as conversas reais. Desde que o manual
              escrito pela clínica entrou, isto NÃO manda mais na conversa:
              `montarInstrucao` usa o texto da clínica e ignora o aprendido.
              Fica porque é de onde saem as frases para melhorar o manual —
              e o próprio bloco diz isso, para ninguém editar aqui achando
              que muda o comportamento dela. */}
          <OQueAprendeu
            aprender={() => rodarCiclo.mutate()}
            aprendendo={rodarCiclo.isPending}
            aprendidoEm={estado?.aprendidoEm ?? null}
            conversasLidas={Number(estado?.vendas ?? 0) + Number(estado?.conversas ?? 0)}
          />

          {/* ── 5b. O que ela aprendeu com o RESULTADO ───────────────────
              Depois do manual aprendido, e não junto: um vem de ler as
              conversas da clínica, o outro de ver o que aconteceu com as
              conversas dela. Misturar os dois faria parecer que o manual já
              foi corrigido pelas lições — e ninguém corrigiu. */}
          <LicoesDaLuna />

          {/* ── 5c. O que isso custa ──────────────────────────────────────
              Depois das lições e antes do funil: é a última pergunta que se
              faz sobre um agente que já se entendeu. Em cima da tela ele
              roubaria a atenção de quem veio configurar o comportamento. */}
          <ConsumoDaIa />

          {/* ── 6. O funil ─────────────────────────────────────────────── */}
          <PainelDoFunil painel={painelQuery.data} carregando={painelQuery.isPending} />
        </div>
      )}
    </main>
  );
}
