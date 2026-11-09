import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Circle, Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { PageHeading } from "@/components/layout/PageHeading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Campo } from "@/components/settings/CamposDoConsultorio";
import { Testar } from "@/components/agente-ia/Testar";
import { ConhecimentoDaOferta } from "@/components/agente-ia/ofertas/Conhecimento";
import { MateriaisDaOferta } from "@/components/agente-ia/ofertas/Materiais";
import { PreviaDaIA } from "@/components/agente-ia/ofertas/PreviaDaIA";
import {
  BarraDoTermometro,
  PARA_QUEM_ROTULO,
  SeletorDePosicao,
  TIPO_ROTULO,
  situacaoDaOferta,
} from "@/components/agente-ia/ofertas/comuns";
import { cn } from "@/lib/utils";
import { localDateStr } from "@/lib/date";
import {
  LIMITE_DAS_INSTRUCOES,
  LIMITE_DO_RESUMO,
  definirPosicaoDaOferta,
  encerrarOferta,
  getOfertaDoAgente,
  listarOfertasDoAgente,
  salvarOfertaDoAgente,
  type EntradaDaOferta,
  type ItemDeCampanha,
  type OfertaDaLista,
  type ParaQuem,
  type PosicaoDaOferta,
} from "@/lib/agente-ia/ofertas.functions";

const ABAS_DA_FICHA = [
  { value: "visao", label: "Visão geral" },
  { value: "condicoes", label: "Condições" },
  { value: "conhecimento", label: "Conhecimento" },
  { value: "materiais", label: "Materiais" },
  { value: "instrucoes", label: "Instruções" },
  { value: "testar", label: "Testar" },
  { value: "ia", label: "O que a IA lê" },
] as const;
type Aba = (typeof ABAS_DA_FICHA)[number]["value"];

const searchSchema = z.object({
  aba: z
    .enum(["visao", "condicoes", "conhecimento", "materiais", "instrucoes", "testar", "ia"])
    .optional(),
});

export const Route = createFileRoute("/agente-ia/ofertas/$id")({
  ssr: false,
  validateSearch: searchSchema,
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar a oferta"
      description="Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState title="Oferta não encontrada" notFound semSidebar />
  ),
  component: FichaDaOfertaPage,
});

function paraRascunho(o: OfertaDaLista): EntradaDaOferta {
  return {
    id: o.id,
    nome: o.nome,
    inicio: o.inicio,
    fim: o.fim,
    paraQuem: o.paraQuem,
    resumo: o.resumo,
    comoReconhecer: o.comoReconhecer,
    instrucoes: o.instrucoes,
    itens: o.itens,
    observacoes: o.observacoes,
  };
}

function numero(t: string): number | null {
  const s = t.replace(/\./g, "").replace(",", ".").trim();
  return s === "" || !Number.isFinite(Number(s)) ? null : Number(s);
}

function FichaDaOfertaPage() {
  const { id } = Route.useParams();
  const aba: Aba = Route.useSearch().aba ?? "visao";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const buscar = useServerFn(getOfertaDoAgente);
  const buscarLista = useServerFn(listarOfertasDoAgente);
  const salvar = useServerFn(salvarOfertaDoAgente);
  const mudarPosicao = useServerFn(definirPosicaoDaOferta);
  const encerrar = useServerFn(encerrarOferta);
  const hoje = localDateStr();

  const query = useQuery({
    queryKey: ["agente-oferta", id],
    queryFn: () => buscar({ data: { id } }),
  });
  // Os nomes de todas as ofertas, para a aba Materiais dizer a que oferta um caso já está ligado.
  const listaQuery = useQuery({ queryKey: ["agente-ofertas"], queryFn: () => buscarLista() });
  const nomeDasOfertas = useMemo(
    () => Object.fromEntries((listaQuery.data ?? []).map((o) => [o.id, o.nome])),
    [listaQuery.data],
  );

  const oferta = query.data?.oferta ?? null;
  const [rascunho, setRascunho] = useState<EntradaDaOferta | null>(null);
  const [original, setOriginal] = useState<string>("");
  useEffect(() => {
    if (!oferta) return;
    const r = paraRascunho(oferta);
    setRascunho(r);
    setOriginal(JSON.stringify(r));
  }, [oferta]);
  const mudou = rascunho !== null && JSON.stringify(rascunho) !== original;

  const irPara = (proxima: Aba) =>
    navigate({
      to: "/agente-ia/ofertas/$id",
      params: { id },
      search: { aba: proxima },
      replace: true,
    });
  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["agente-oferta", id] });
    queryClient.invalidateQueries({ queryKey: ["agente-ofertas"] });
    queryClient.invalidateQueries({ queryKey: ["agente-oferta-previa", id] });
  };

  const salvarM = useMutation({
    mutationFn: (r: EntradaDaOferta) => salvar({ data: r }),
    onSuccess: () => {
      invalidar();
      toast.success("Oferta salva. A assistente usa a partir da próxima conversa.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const posicaoM = useMutation({
    mutationFn: (posicao: PosicaoDaOferta) => mudarPosicao({ data: { id, posicao } }),
    onSuccess: () => {
      invalidar();
      queryClient.invalidateQueries({ queryKey: ["agente-modulos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const encerrarM = useMutation({
    mutationFn: () => encerrar({ data: { id } }),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading || !oferta || !rascunho) {
    return (
      <main className="w-full px-4 pb-nav pt-7 sm:px-6 lg:px-10">
        <p className="text-sm text-muted-foreground">Carregando a oferta…</p>
      </main>
    );
  }

  const s = situacaoDaOferta(oferta, hoje);
  const ehPromocao = oferta.tipo === "promocao";
  const publico =
    oferta.modulo === "paciente_modelo"
      ? "paciente_modelo"
      : oferta.modulo === "mentoria"
        ? "mentoria"
        : "atendimento";
  const mudar = (patch: Partial<EntradaDaOferta>) => setRascunho({ ...rascunho, ...patch });
  const mudarItem = (i: number, patch: Partial<ItemDeCampanha>) =>
    mudar({ itens: rascunho.itens.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  return (
    <main className="w-full min-w-0 flex-1 overflow-x-hidden px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-24 lg:pt-9">
      <Link
        to="/agente-ia"
        search={{ aba: "ofertas" }}
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Ofertas
      </Link>
      <PageHeading
        icon={Circle}
        title={oferta.nome}
        subtitle={`${TIPO_ROTULO[oferta.tipo]} · para ${PARA_QUEM_ROTULO[oferta.paraQuem].toLowerCase()}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-1 text-2xs font-semibold", s.cor)}>
              {s.rotulo}
            </span>
            <SeletorDePosicao
              rotulo={`Situação de ${oferta.nome}`}
              posicao={oferta.posicao}
              desabilitado={posicaoM.isPending}
              onMudar={(p) => posicaoM.mutate(p)}
            />
            {ehPromocao && oferta.posicao !== "encerrada" && (
              <Button
                variant="outline"
                className="h-9 rounded-full"
                disabled={encerrarM.isPending}
                onClick={() => {
                  if (confirm(`Encerrar "${oferta.nome}"? A assistente deixa de usá-la.`))
                    encerrarM.mutate();
                }}
              >
                Encerrar
              </Button>
            )}
          </div>
        }
      />

      <div
        role="tablist"
        className="mt-5 flex w-full gap-1 overflow-x-auto rounded-full border border-border/70 bg-card p-1 shadow-1 sm:w-fit"
      >
        {ABAS_DA_FICHA.map((a) => (
          <button
            key={a.value}
            type="button"
            role="tab"
            aria-selected={aba === a.value}
            onClick={() => irPara(a.value)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              aba === a.value
                ? "bg-foreground text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="mt-5 max-w-3xl">
        {aba === "visao" && (
          <div className="grid gap-5">
            <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-1">
              <BarraDoTermometro t={oferta.termometro} />
              <ul className="mt-3 grid gap-1.5">
                {oferta.termometro.itens.map((i) => (
                  <li key={i.id} className="flex items-start gap-2 text-sm">
                    <span
                      className={cn(
                        "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full",
                        i.ok ? "bg-success text-white" : "border border-border text-transparent",
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                    <span className={cn(!i.ok && "text-muted-foreground")}>
                      {i.rotulo}
                      {!i.ok && <span className="text-xs"> · {i.dica}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <Campo rotulo="Nome">
              <Input
                value={rascunho.nome}
                maxLength={80}
                onChange={(e) => mudar({ nome: e.target.value })}
              />
            </Campo>
            <Campo
              rotulo="Resumo curto"
              ajuda="Uma ou duas frases do que é a oferta. Vai em toda conversa, então seja direto."
            >
              <Textarea
                rows={3}
                value={rascunho.resumo ?? ""}
                maxLength={LIMITE_DO_RESUMO}
                onChange={(e) => mudar({ resumo: e.target.value })}
              />
              <span className="mt-1 block text-right text-2xs tabular-nums text-muted-foreground">
                {(rascunho.resumo ?? "").length} / {LIMITE_DO_RESUMO}
              </span>
            </Campo>
            <Campo
              rotulo="Para quem é"
              ajuda="A assistente não oferece uma oferta de profissionais a um paciente, nem o contrário."
            >
              <Select
                value={rascunho.paraQuem}
                onValueChange={(v) => mudar({ paraQuem: v as ParaQuem })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paciente">Pacientes</SelectItem>
                  <SelectItem value="profissional">Profissionais (mentoria, curso)</SelectItem>
                  <SelectItem value="todos">Qualquer pessoa</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
            <Campo
              rotulo="Como reconhecer"
              ajuda="Palavras e situações que mostram que a pessoa quer esta oferta, separadas por vírgula. Ex.: paciente modelo, atendimento feito por aluno."
            >
              <Textarea
                rows={2}
                value={rascunho.comoReconhecer ?? ""}
                onChange={(e) => mudar({ comoReconhecer: e.target.value })}
              />
            </Campo>
          </div>
        )}

        {aba === "condicoes" && (
          <div className="grid gap-5">
            {ehPromocao ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Campo rotulo="Começa em">
                    <Input
                      type="date"
                      value={rascunho.inicio ?? ""}
                      onChange={(e) => mudar({ inicio: e.target.value || null })}
                    />
                  </Campo>
                  <Campo rotulo="Termina em">
                    <Input
                      type="date"
                      value={rascunho.fim ?? ""}
                      onChange={(e) => mudar({ fim: e.target.value || null })}
                    />
                  </Campo>
                </div>
                <div className="grid gap-2">
                  <p className="text-[13px] font-medium">Procedimentos e preços</p>
                  {rascunho.itens.map((i, k) => (
                    <div key={k} className="grid gap-2 rounded-2xl bg-muted/40 p-3">
                      <Input
                        value={i.nome}
                        placeholder="Procedimento"
                        onChange={(e) => mudarItem(k, { nome: e.target.value })}
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <Input
                          inputMode="decimal"
                          placeholder="À vista"
                          defaultValue={i.precoVista ?? ""}
                          onChange={(e) => mudarItem(k, { precoVista: numero(e.target.value) })}
                        />
                        <Input
                          inputMode="numeric"
                          placeholder="Parcelas"
                          defaultValue={i.parcelas ?? ""}
                          onChange={(e) => mudarItem(k, { parcelas: numero(e.target.value) })}
                        />
                        <Input
                          inputMode="decimal"
                          placeholder="Valor da parcela"
                          defaultValue={i.valorParcela ?? ""}
                          onChange={(e) => mudarItem(k, { valorParcela: numero(e.target.value) })}
                        />
                      </div>
                      {rascunho.itens.length > 1 && (
                        <button
                          type="button"
                          className="justify-self-end text-xs text-muted-foreground hover:underline"
                          onClick={() => mudar({ itens: rascunho.itens.filter((_, j) => j !== k) })}
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-self-start gap-1"
                    onClick={() =>
                      mudar({
                        itens: [
                          ...rascunho.itens,
                          { nome: "", precoVista: null, parcelas: null, valorParcela: null },
                        ],
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Procedimento
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-3xl border border-border/70 bg-card p-5 text-sm shadow-1">
                <p className="text-muted-foreground">
                  Datas, vagas, valores, sinal, reservas e regras desta oferta ficam no cadastro das
                  edições.
                </p>
                {oferta.modulo === "paciente_modelo" && (
                  <Button asChild variant="outline" className="mt-3 rounded-full">
                    <Link to="/agente-ia/modulos/paciente-modelo">
                      Gerenciar edições e reservas
                    </Link>
                  </Button>
                )}
              </div>
            )}
            <Campo
              rotulo="Observações para a assistente"
              ajuda="Opcional. Ex.: válido só para pacientes novos."
            >
              <Textarea
                rows={2}
                value={rascunho.observacoes ?? ""}
                onChange={(e) => mudar({ observacoes: e.target.value })}
              />
            </Campo>
          </div>
        )}

        {aba === "conhecimento" && (
          <ConhecimentoDaOferta ofertaId={id} blocos={query.data?.conhecimento ?? []} />
        )}

        {aba === "materiais" && (
          <MateriaisDaOferta
            ofertaId={id}
            casos={query.data?.casos ?? []}
            nomeDasOfertas={nomeDasOfertas}
          />
        )}

        {aba === "instrucoes" && (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              Como conduzir a venda desta oferta, em poucas linhas: o que apresentar primeiro, o que
              evitar, quando oferecer horário. Elas nunca valem mais que os dados cadastrados
              (preço, datas, vagas) nem que as regras de segurança da assistente.
            </p>
            <Campo rotulo="Instruções comerciais">
              <Textarea
                rows={8}
                value={rascunho.instrucoes ?? ""}
                maxLength={LIMITE_DAS_INSTRUCOES}
                onChange={(e) => mudar({ instrucoes: e.target.value })}
              />
              <span className="mt-1 block text-right text-2xs tabular-nums text-muted-foreground">
                {(rascunho.instrucoes ?? "").length} / {LIMITE_DAS_INSTRUCOES}
              </span>
            </Campo>
          </div>
        )}

        {aba === "testar" && (
          <div className="grid gap-3">
            {oferta.posicao === "desligado" && (
              <p className="rounded-2xl bg-warning-soft px-4 py-2.5 text-xs text-warning">
                Esta oferta está desligada. Para testar, ponha em &ldquo;Só no teste&rdquo; ou
                &ldquo;Ligada&rdquo;.
              </p>
            )}
            <Testar semCartao ofertaEmFoco={id} publicoFixo={publico} />
          </div>
        )}

        {aba === "ia" && <PreviaDaIA ofertaId={id} />}
      </div>

      {mudou && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-card/95 px-4 py-3 backdrop-blur sm:px-6 lg:left-[var(--sidebar-w,0px)] lg:px-10">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Alterações não salvas</span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setRascunho(JSON.parse(original) as EntradaDaOferta);
                }}
              >
                Descartar
              </Button>
              <Button
                variant="premium"
                disabled={salvarM.isPending}
                onClick={() => salvarM.mutate(rascunho)}
              >
                Salvar alterações
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
