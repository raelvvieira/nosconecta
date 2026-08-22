import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Plus, Users, UserX } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { CardDeRegra } from "@/components/atendimentos/automations/CardDeRegra";
import {
  CONDICOES,
  type Condicao,
  type RegraDeFunil,
} from "@/lib/atendimentos/funnelRules";
import { getRegrasDosFunis, salvarRegrasDoFunil } from "@/lib/atendimentos/funis.functions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// O fluxo que move o contato entre as etapas de um funil.
//
// Ele aparece na página de Automações e é editável, mas NÃO é uma linha de
// `automation_rules`: o motor de automações é orientado a evento e nunca
// executaria uma classificação de funil. Gravar aqui mexe em
// `clinic_funnel_rules`, que é o que o Pipeline realmente lê — então editar
// muda o quadro de verdade, em vez de mexer numa cópia decorativa.

const searchSchema = z.object({});

const FUNIS = {
  clientes: {
    titulo: "Movimentação do funil de Clientes",
    entrada: "Todo paciente da base",
    icone: Users,
    condicoes: [
      "nunca_teve_consulta",
      "tem_orcamento_aberto",
      "tem_tratamento_pendente",
      "tratamento_pendente_ha_dias",
      "sem_consulta_ha_dias",
    ] as Condicao[],
  },
  perdidos: {
    titulo: "Movimentação do funil de Perdidos",
    entrada: "Toda negociação marcada como perdida",
    icone: UserX,
    condicoes: [
      "motivo_definitivo",
      "respondeu_apos_disparo",
      "recebeu_disparo_apos_perda",
      "perdido_ha_menos_de_dias",
    ] as Condicao[],
  },
} as const;

type Funil = keyof typeof FUNIS;

export const Route = createFileRoute("/atendimentos/automacoes/funil/$funil")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Movimentação do funil · Automação · NÓS Conecta" }] }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      title="Não foi possível carregar as regras"
      description="Houve uma falha ao buscar a movimentação deste funil."
      error={error}
      semSidebar
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState
      notFound
      title="Funil não encontrado"
      description="Só existem dois: Clientes e Perdidos."
      semSidebar
    />
  ),
  component: FunilPage,
});

let contador = 0;
const novoId = () => `r${Date.now().toString(36)}${(contador++).toString(36)}`;

/** Regra que nunca vai ser alcançada porque uma anterior já cobre o mesmo caso.
 *  Não bloqueia — só avisa, porque montar aos poucos é legítimo. */
function avisos(regras: RegraDeFunil[]): string[] {
  const lista: string[] = [];
  const ativas = regras.filter((r) => r.ativa);
  const vistas = new Set<string>();
  for (const r of ativas) {
    const chave = `${r.condicao}:${r.valor ?? ""}`;
    if (vistas.has(chave)) {
      lista.push(`"${r.nome}" testa exatamente o mesmo que uma etapa acima — nunca vai receber ninguém.`);
    }
    vistas.add(chave);
    if (CONDICOES[r.condicao as Condicao]?.parametro && !r.valor) {
      lista.push(`"${r.nome}" está sem prazo — vai se comportar como se fosse zero.`);
    }
  }
  const indiceSempre = ativas.findIndex((r) => r.condicao === "sempre");
  if (indiceSempre >= 0 && indiceSempre < ativas.length - 1) {
    lista.push(
      `As etapas depois de "${ativas[indiceSempre].nome}" nunca vão receber ninguém: ela captura todo mundo que chegou até ali.`,
    );
  }
  return [...new Set(lista)];
}

function FunilPage() {
  const { funil } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const buscar = useServerFn(getRegrasDosFunis);
  const salvar = useServerFn(salvarRegrasDoFunil);

  const chave = (funil === "perdidos" ? "perdidos" : "clientes") as Funil;
  const meta = FUNIS[chave];
  const Icone = meta.icone;

  const regrasQuery = useQuery({
    queryKey: ["regras-dos-funis"],
    queryFn: () => buscar(),
    staleTime: 60_000,
    // Hidratar uma vez: com refetch no foco, trocar de aba apagaria a edição
    // em andamento. Mesmo cuidado do editor de automações.
    refetchOnWindowFocus: false,
  });

  const [regras, setRegras] = useState<RegraDeFunil[]>([]);
  const [sujo, setSujo] = useState(false);
  const hidratado = regrasQuery.data !== undefined;

  useEffect(() => {
    if (!regrasQuery.data) return;
    setRegras(regrasQuery.data[chave]);
    setSujo(false);
  }, [regrasQuery.data, chave]);

  const mexer = (proximas: RegraDeFunil[]) => {
    setRegras(proximas);
    setSujo(true);
  };

  const trocar = (de: number, para: number) => {
    if (para < 0 || para >= regras.length) return;
    // A regra "todos os demais" fica presa no fim: ela é o que garante que todo
    // card tem coluna, e no meio da lista engoliria as de baixo.
    if (regras[de].condicao === "sempre" || regras[para].condicao === "sempre") return;
    const proximas = [...regras];
    [proximas[de], proximas[para]] = [proximas[para], proximas[de]];
    mexer(proximas);
  };

  const adicionar = (condicao: Condicao) => {
    const nova: RegraDeFunil = {
      id: novoId(),
      nome: "Nova etapa",
      cor: "#FF7A59",
      condicao,
      valor: CONDICOES[condicao].parametro ? 30 : undefined,
      ativa: true,
      explica: "",
    };
    // Entra ANTES da regra "todos os demais" — depois dela nunca receberia
    // ninguém.
    const fim = regras.findIndex((r) => r.condicao === "sempre");
    const corte = fim >= 0 ? fim : regras.length;
    mexer([...regras.slice(0, corte), nova, ...regras.slice(corte)]);
  };

  const salvarMutation = useMutation({
    mutationFn: () => salvar({ data: { funil: chave, regras } }),
    onSuccess: () => {
      toast.success("Movimentação salva");
      setSujo(false);
      for (const aviso of avisos(regras)) toast.warning(aviso, { duration: 8000 });
      queryClient.invalidateQueries({ queryKey: ["regras-dos-funis"] });
      queryClient.invalidateQueries({ queryKey: ["funil-clientes"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disponiveis = useMemo(
    () => meta.condicoes.filter((c) => !regras.some((r) => r.ativa && r.condicao === c)),
    [meta.condicoes, regras],
  );

  return (
    <main className="w-full px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="ghost" size="icon" className="mt-0.5 shrink-0">
            <Link to="/atendimentos/automacoes" aria-label="Voltar para Automação">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 text-xl font-semibold md:text-2xl">
              <Icone className="h-[1.1em] w-[1.1em] shrink-0 text-pink" strokeWidth={1.75} />
              {meta.titulo}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              A primeira condição que combinar decide a etapa. As de baixo só são consultadas
              quando as de cima não combinam.
            </p>
          </div>
        </div>
        <Button
          variant="premium"
          disabled={!sujo || salvarMutation.isPending}
          onClick={() => salvarMutation.mutate()}
        >
          {sujo ? "Salvar" : "Salvo"}
        </Button>
      </header>

      {!hidratado ? (
        <p className="mt-6 text-sm text-muted-foreground">Carregando regras…</p>
      ) : (
        <div className="mt-6 max-w-[720px]">
          <div className="surface-card px-4 py-3">
            <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Entra no fluxo
            </p>
            <p className="mt-0.5 text-sm font-medium text-foreground">{meta.entrada}</p>
          </div>

          {regras.map((regra, i) => (
            <div key={regra.id}>
              <div className="flex items-center gap-2 py-1.5 pl-5">
                <span className="h-4 w-px bg-border" />
                <span className="text-2xs text-muted-foreground">
                  {i === 0 ? "então" : "senão"}
                </span>
              </div>
              <CardDeRegra
                regra={regra}
                ehUltima={regra.condicao === "sempre"}
                primeira={i === 0}
                onMudar={(r) => mexer(regras.map((x, j) => (j === i ? r : x)))}
                onSubir={() => trocar(i, i - 1)}
                onDescer={() => trocar(i, i + 1)}
                onRemover={() => mexer(regras.filter((_, j) => j !== i))}
              />
            </div>
          ))}

          {disponiveis.length > 0 && (
            <div className="mt-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Adicionar etapa
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {disponiveis.map((c) => (
                    <DropdownMenuItem key={c} onClick={() => adicionar(c)}>
                      {CONDICOES[c].rotulo}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <p className="mt-2 text-2xs text-muted-foreground">
                Só aparecem as condições que o sistema consegue calcular sozinho — e que ainda
                não estão em uso neste fluxo.
              </p>
            </div>
          )}

          <p className="mt-6 text-2xs leading-snug text-muted-foreground">
            Esta movimentação não dispara mensagem: ela só decide em que coluna cada pessoa
            aparece no Pipeline. Para mandar mensagem quando alguém muda de etapa, use uma
            automação com gatilho.
          </p>
        </div>
      )}
    </main>
  );
}
