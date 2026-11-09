import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Campo } from "@/components/settings/CamposDoConsultorio";
import { cn } from "@/lib/utils";
import { localDateStr } from "@/lib/date";
import {
  LIMITE_DAS_INSTRUCOES,
  excluirOferta,
  listarOfertas,
  salvarOferta,
  type EstadoDaOferta,
  type ItemDeCampanha,
  type Oferta,
  type ParaQuem,
} from "@/lib/settings/ofertas.functions";

export const Route = createFileRoute("/configuracoes/ofertas")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ofertas · Configurações · NÓS Conecta" },
      {
        name: "description",
        content: "O que a clínica oferece de especial: promoções, Paciente Modelo e Mentoria.",
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar as ofertas"
      description="Houve uma falha ao buscar os dados. Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />
  ),
  component: OfertasPage,
});

type Rascunho = Omit<Oferta, "id" | "modulo"> & { id: string | null; modulo: Oferta["modulo"] };

const ESTADOS: { valor: EstadoDaOferta; rotulo: string }[] = [
  { valor: "rascunho", rotulo: "Rascunho (a assistente não usa)" },
  { valor: "teste", rotulo: "Em teste (só na tela Testar)" },
  { valor: "ligado", rotulo: "Ligada" },
  { valor: "encerrada", rotulo: "Encerrada" },
];

const PARA_QUEM: { valor: ParaQuem; rotulo: string }[] = [
  { valor: "paciente", rotulo: "Pacientes" },
  { valor: "profissional", rotulo: "Profissionais (mentoria, curso)" },
  { valor: "todos", rotulo: "Qualquer pessoa" },
];

function diaMes(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
function reais(v: number | null) {
  return v === null ? "sem valor" : `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
}

function situacao(o: Oferta, hoje: string): { rotulo: string; cor: string } {
  const apagada = "bg-muted text-muted-foreground";
  if (o.estado === "encerrada") return { rotulo: "Encerrada", cor: apagada };
  if (o.estado === "rascunho") return { rotulo: "Rascunho", cor: apagada };
  if (o.estado === "teste")
    return {
      rotulo: "Em teste",
      cor: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    };
  if (o.inicio && hoje < o.inicio)
    return {
      rotulo: "Agendada",
      cor: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
    };
  if (o.fim && hoje > o.fim) return { rotulo: "Encerrada", cor: apagada };
  return {
    rotulo: "Valendo agora",
    cor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  };
}

const TIPO_ROTULO = { promocao: "Promoção de preço", edicao: "Edição com vagas" } as const;

function OfertasPage() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(listarOfertas);
  const doSalvar = useServerFn(salvarOferta);
  const doExcluir = useServerFn(excluirOferta);
  const query = useQuery({ queryKey: ["ofertas"], queryFn: () => buscar() });
  const [editando, setEditando] = useState<Rascunho | null>(null);
  const hoje = localDateStr();

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["ofertas"] });
  const salvarM = useMutation({
    mutationFn: (r: Rascunho) => doSalvar({ data: r }),
    onSuccess: () => {
      invalidar();
      setEditando(null);
      toast.success("Oferta salva. A assistente usa a partir da próxima conversa.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const excluirM = useMutation({
    mutationFn: (id: string) => doExcluir({ data: { id } }),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  const nova = (): Rascunho => ({
    id: null,
    tipo: "promocao",
    nome: "",
    estado: "ligado",
    inicio: hoje,
    fim: hoje,
    paraQuem: "paciente",
    comoReconhecer: null,
    instrucoes: null,
    itens: [{ nome: "", precoVista: null, parcelas: null, valorParcela: null }],
    observacoes: null,
    modulo: null,
  });

  const lista = query.data ?? [];
  return (
    <main className="w-full px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Ofertas</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            O que a clínica oferece de especial: promoções de preço, Paciente Modelo e Mentoria. A
            assistente lê as que estão abertas hoje e decide pelo que a pessoa pede; o anúncio de
            onde ela veio é só uma pista.
          </p>
        </div>
        <Button variant="premium" className="gap-1.5" onClick={() => setEditando(nova())}>
          <Plus className="h-4 w-4" />
          Nova promoção
        </Button>
      </header>

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        {lista.map((o) => {
          const s = situacao(o, hoje);
          return (
            <article
              key={o.id}
              className="rounded-3xl border border-border/70 bg-card p-5 shadow-1"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold">{o.nome}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {TIPO_ROTULO[o.tipo]}
                    {o.inicio && o.fim ? ` · de ${diaMes(o.inicio)} a ${diaMes(o.fim)}` : ""}
                  </p>
                </div>
                <span className={cn("rounded-full px-2.5 py-0.5 text-2xs font-semibold", s.cor)}>
                  {s.rotulo}
                </span>
              </div>
              {o.tipo === "promocao" ? (
                <ul className="mt-3 grid gap-1 text-sm">
                  {o.itens.map((i, k) => (
                    <li key={k} className="flex justify-between gap-3">
                      <span className="truncate">{i.nome}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {reais(i.precoVista)}
                        {i.parcelas && i.valorParcela !== null
                          ? ` · ${i.parcelas}x ${reais(i.valorParcela)}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Datas, vagas, valores e sinal ficam no cadastro das edições.
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-end gap-1">
                {o.tipo === "edicao" && o.modulo === "paciente_modelo" && (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/agente-ia/modulos/paciente-modelo">Gerenciar edições</Link>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={() => setEditando({ ...o })}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </Button>
                {o.tipo === "promocao" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-muted-foreground hover:text-danger"
                    disabled={excluirM.isPending}
                    onClick={() => {
                      if (confirm(`Excluir a oferta "${o.nome}"?`)) excluirM.mutate(o.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </article>
          );
        })}
        {!lista.length && !query.isLoading && (
          <p className="rounded-3xl border border-dashed border-border p-6 text-sm text-muted-foreground lg:col-span-2">
            Nenhuma oferta ainda. Crie uma promoção para a assistente oferecer um preço especial
            durante um período, como uma Black Friday.
          </p>
        )}
      </div>

      <Sheet open={editando !== null} onOpenChange={(o) => !o && setEditando(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="text-left">
            <SheetTitle>{editando?.id ? "Editar oferta" : "Nova promoção"}</SheetTitle>
            <SheetDescription>
              A assistente cita o nome da oferta e os valores, sem inventar urgência.
            </SheetDescription>
          </SheetHeader>
          {editando && (
            <FormDaOferta
              r={editando}
              mudar={setEditando}
              salvando={salvarM.isPending}
              onSalvar={() => salvarM.mutate(editando)}
            />
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}

function numero(t: string): number | null {
  const s = t.replace(/\./g, "").replace(",", ".").trim();
  return s === "" || !Number.isFinite(Number(s)) ? null : Number(s);
}

function FormDaOferta({
  r,
  mudar,
  salvando,
  onSalvar,
}: {
  r: Rascunho;
  mudar: (r: Rascunho) => void;
  salvando: boolean;
  onSalvar: () => void;
}) {
  const promocao = r.tipo === "promocao";
  // O liga/desliga do Paciente Modelo mora na gestão dele.
  const estadoNoModulo = r.tipo === "edicao" && r.modulo === "paciente_modelo";
  const mudarItem = (i: number, patch: Partial<ItemDeCampanha>) =>
    mudar({ ...r, itens: r.itens.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <div className="mt-5 grid gap-4">
      <Campo rotulo="Nome">
        <Input
          value={r.nome}
          placeholder="Ex.: Black Estética"
          onChange={(e) => mudar({ ...r, nome: e.target.value })}
        />
      </Campo>

      {!estadoNoModulo && (
        <Campo rotulo="Situação">
          <Select
            value={r.estado}
            onValueChange={(v) => mudar({ ...r, estado: v as EstadoDaOferta })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTADOS.map((e) => (
                <SelectItem key={e.valor} value={e.valor}>
                  {e.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
      )}
      {estadoNoModulo && (
        <p className="rounded-2xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          O liga e desliga do Paciente Modelo fica em Gerenciar edições, junto das datas, vagas e do
          sinal.
        </p>
      )}

      {promocao && (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Começa em">
            <Input
              type="date"
              value={r.inicio ?? ""}
              onChange={(e) => mudar({ ...r, inicio: e.target.value || null })}
            />
          </Campo>
          <Campo rotulo="Termina em">
            <Input
              type="date"
              value={r.fim ?? ""}
              onChange={(e) => mudar({ ...r, fim: e.target.value || null })}
            />
          </Campo>
        </div>
      )}

      <Campo
        rotulo="Para quem é"
        ajuda="A assistente não oferece uma oferta de profissionais a um paciente, nem o contrário."
      >
        <Select value={r.paraQuem} onValueChange={(v) => mudar({ ...r, paraQuem: v as ParaQuem })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PARA_QUEM.map((e) => (
              <SelectItem key={e.valor} value={e.valor}>
                {e.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Campo>

      <Campo
        rotulo="Como reconhecer"
        ajuda="Palavras e situações que mostram que a pessoa quer esta oferta, separadas por vírgula. Ex.: paciente modelo, atendimento feito por aluno."
      >
        <Textarea
          rows={2}
          value={r.comoReconhecer ?? ""}
          onChange={(e) => mudar({ ...r, comoReconhecer: e.target.value })}
        />
      </Campo>

      {promocao && (
        <div className="grid gap-2">
          <p className="text-[13px] font-medium">Procedimentos e preços</p>
          {r.itens.map((i, k) => (
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
              {r.itens.length > 1 && (
                <button
                  type="button"
                  className="justify-self-end text-xs text-muted-foreground hover:underline"
                  onClick={() => mudar({ ...r, itens: r.itens.filter((_, j) => j !== k) })}
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
                ...r,
                itens: [
                  ...r.itens,
                  { nome: "", precoVista: null, parcelas: null, valorParcela: null },
                ],
              })
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Procedimento
          </Button>
        </div>
      )}

      <Campo
        rotulo="Instruções comerciais"
        ajuda={`Como conduzir esta oferta, em poucas linhas (até ${LIMITE_DAS_INSTRUCOES} caracteres). Nunca vale mais que os dados cadastrados nem que as regras de segurança da assistente.`}
      >
        <Textarea
          rows={4}
          maxLength={LIMITE_DAS_INSTRUCOES}
          value={r.instrucoes ?? ""}
          onChange={(e) => mudar({ ...r, instrucoes: e.target.value })}
        />
      </Campo>

      <Campo
        rotulo="Observações para a assistente"
        ajuda="Opcional. Ex.: válido só para pacientes novos."
      >
        <Textarea
          rows={2}
          value={r.observacoes ?? ""}
          onChange={(e) => mudar({ ...r, observacoes: e.target.value })}
        />
      </Campo>
      <Button variant="premium" disabled={salvando} onClick={onSalvar}>
        Salvar oferta
      </Button>
    </div>
  );
}
