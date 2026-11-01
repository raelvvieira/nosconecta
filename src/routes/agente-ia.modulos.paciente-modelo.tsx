import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Eye,
  MessageCircle,
  Plus,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { PageHeading } from "@/components/layout/PageHeading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/finance/format";
import { Ajuda, Bloco } from "@/components/agente-ia/campos";
import {
  STATUS_DA_EDICAO,
  STATUS_DA_RESERVA,
  avisoDaChavePix,
  confirmarSinal,
  criarReservaManual,
  duplicarEdicao,
  excluirEdicao,
  getEdicoes,
  getModulos,
  getPreviaDaSecao,
  getReservas,
  getUnidadesParaEdicao,
  horariosDaPratica,
  mudarStatusDaReserva,
  salvarConfigDoModulo,
  salvarEdicao,
  salvarOfertas,
  type ConfigDoModulo,
  type EdicaoDaTela,
  type ReservaDaTela,
  type StatusDaEdicao,
  type StatusDaReserva,
} from "@/lib/agente-ia/modulos.functions";

// O módulo Paciente Modelo HOF: edições, ofertas, reservas e regras.
//
// É aqui que a próxima mentoria é cadastrada. A Luna lê isto a cada resposta
// (ver `_shared/modulo-paciente-modelo.ts`); ninguém precisa mexer no manual.

const ABAS = [
  { value: "edicoes", label: "Edições" },
  { value: "ofertas", label: "Ofertas e valores" },
  { value: "reservas", label: "Reservas" },
  { value: "regras", label: "Regras e FAQ" },
] as const;
type Aba = (typeof ABAS)[number]["value"];

const searchSchema = z.object({
  aba: z.enum(["edicoes", "ofertas", "reservas", "regras"]).optional(),
});

export const Route = createFileRoute("/agente-ia/modulos/paciente-modelo")({
  validateSearch: searchSchema,
  errorComponent: ({ error }) => (
    <ResponsiveRouteState error={error} title="Não foi possível carregar o módulo" semSidebar />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />
  ),
  component: PaginaDoModulo,
});

function diaCurto(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const ROTULO_DO_STATUS = Object.fromEntries(
  STATUS_DA_EDICAO.map((s) => [s.id, s.rotulo]),
) as Record<StatusDaEdicao, string>;

const COR_DO_STATUS: Record<StatusDaEdicao, string> = {
  rascunho: "bg-muted text-muted-foreground",
  publicada: "bg-info-soft text-info",
  inscricoes_abertas: "bg-success-soft text-success",
  esgotada: "bg-warning-soft text-warning",
  encerrada: "bg-muted text-muted-foreground",
  cancelada: "bg-muted text-muted-foreground",
};

const somaDe = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

function PaginaDoModulo() {
  const aba: Aba = Route.useSearch().aba ?? "edicoes";
  const navigate = useNavigate();
  const irPara = (a: Aba) =>
    navigate({ to: "/agente-ia/modulos/paciente-modelo", search: { aba: a }, replace: true });
  const buscarPrevia = useServerFn(getPreviaDaSecao);
  const [previa, setPrevia] = useState<string | null>(null);

  return (
    <main className="custom-scroll min-w-0 flex-1 overflow-y-auto px-4 py-6 pb-nav md:px-6 md:py-8 lg:px-10 lg:pb-8">
      <Link
        to="/agente-ia"
        search={{ aba: "modulos" }}
        className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Módulos
      </Link>
      <PageHeading
        icon={Sparkles}
        title="Paciente Modelo HOF"
        subtitle="Captação, venda e reserva de vagas nas práticas da mentoria."
        actions={
          <Button
            variant="outline"
            className="h-10 gap-2 rounded-full"
            onClick={async () => {
              try {
                setPrevia(await buscarPrevia());
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Não deu para montar a prévia.");
              }
            }}
          >
            <Eye className="h-4 w-4" />
            Ver o que a Luna lê
          </Button>
        }
      />

      <div
        role="tablist"
        className="mt-5 flex w-full gap-1 overflow-x-auto rounded-full border border-border/70 bg-card p-1 shadow-1 sm:w-fit"
      >
        {ABAS.map((a) => (
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

      <div className="mt-5">
        {aba === "edicoes" && <Edicoes />}
        {aba === "ofertas" && <Ofertas />}
        {aba === "reservas" && <Reservas />}
        {aba === "regras" && <Regras />}
      </div>

      <Dialog open={previa !== null} onOpenChange={(v) => !v && setPrevia(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>O que a Luna lê numa conversa de paciente modelo</DialogTitle>
          </DialogHeader>
          <pre className="custom-scroll max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-xl bg-surface-subtle p-4 text-xs leading-5">
            {previa}
          </pre>
        </DialogContent>
      </Dialog>
    </main>
  );
}

// ── Edições ─────────────────────────────────────────────────────────────────

interface PraticaNoForm {
  id: string | null;
  data: string;
  horaInicio: string;
  horaFim: string;
  duracaoMin: number;
  vagas: number;
  observacao: string;
  ocupadas: number;
}

interface EdicaoNoForm {
  id: string | null;
  nome: string;
  cidade: string;
  unitId: string;
  endereco: string;
  inicio: string;
  fim: string;
  status: StatusDaEdicao;
  observacoes: string;
  orientacoesChegada: string;
  praticas: PraticaNoForm[];
}

const NOVA: EdicaoNoForm = {
  id: null,
  nome: "",
  cidade: "",
  unitId: "",
  endereco: "",
  inicio: "",
  fim: "",
  status: "rascunho",
  observacoes: "",
  orientacoesChegada: "",
  praticas: [],
};

function paraForm(e: EdicaoDaTela): EdicaoNoForm {
  return {
    id: e.id,
    nome: e.nome,
    cidade: e.cidade ?? "",
    unitId: e.unitId ?? "",
    endereco: e.endereco ?? "",
    inicio: e.inicio ?? "",
    fim: e.fim ?? "",
    status: e.status,
    observacoes: e.observacoes ?? "",
    orientacoesChegada: e.orientacoesChegada ?? "",
    praticas: e.praticas.map((p) => ({
      id: p.id,
      data: p.data,
      horaInicio: p.horaInicio ?? "",
      horaFim: p.horaFim ?? "",
      duracaoMin: p.duracaoMin,
      vagas: p.vagas,
      observacao: p.observacao ?? "",
      ocupadas: somaDe(p.ocupadas),
    })),
  };
}

function useEdicoes() {
  const buscar = useServerFn(getEdicoes);
  return useQuery({ queryKey: ["mentoria-edicoes"], queryFn: () => buscar() });
}

function Edicoes() {
  const queryClient = useQueryClient();
  const edicoes = useEdicoes();
  const buscarUnidades = useServerFn(getUnidadesParaEdicao);
  const unidades = useQuery({ queryKey: ["unidades-edicao"], queryFn: () => buscarUnidades() });
  const salvar = useServerFn(salvarEdicao);
  const excluir = useServerFn(excluirEdicao);
  const duplicar = useServerFn(duplicarEdicao);
  const [form, setForm] = useState<EdicaoNoForm | null>(null);

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["mentoria-edicoes"] });
    queryClient.invalidateQueries({ queryKey: ["agente-modulos"] });
  };
  const gravar = useMutation({
    mutationFn: (f: EdicaoNoForm) =>
      salvar({
        data: {
          id: f.id,
          nome: f.nome,
          cidade: f.cidade,
          unitId: f.unitId || null,
          endereco: f.endereco,
          inicio: f.inicio || null,
          fim: f.fim || null,
          status: f.status,
          observacoes: f.observacoes,
          orientacoesChegada: f.orientacoesChegada,
          praticas: f.praticas.map((p) => ({
            id: p.id,
            data: p.data,
            horaInicio: p.horaInicio || null,
            horaFim: p.horaFim || null,
            duracaoMin: p.duracaoMin,
            vagas: p.vagas,
            observacao: p.observacao,
          })),
        },
      }),
    onSuccess: () => {
      invalidar();
      setForm(null);
      toast.success("Edição salva.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const apagar = useMutation({
    mutationFn: (id: string) => excluir({ data: { id } }),
    onSuccess: () => {
      invalidar();
      setForm(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const copiar = useMutation({
    mutationFn: (id: string) => duplicar({ data: { id } }),
    onSuccess: () => {
      invalidar();
      toast.success("Cópia criada como rascunho, com as mesmas ofertas.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          A Luna oferece só a edição com <strong>Inscrições abertas</strong> e só os dias de prática
          com vaga.
        </p>
        <Button
          variant="premium"
          className="gap-2 rounded-full"
          onClick={() => setForm({ ...NOVA })}
        >
          <Plus className="h-4 w-4" />
          Nova edição
        </Button>
      </div>

      {edicoes.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !edicoes.data?.length ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhuma edição cadastrada.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {edicoes.data.map((e) => {
            const vagas = e.praticas.reduce(
              (s, p) => s + p.vagas * Math.max(1, horariosDaPratica(p).length),
              0,
            );
            const ocupadas = e.praticas.reduce((s, p) => s + somaDe(p.ocupadas), 0);
            return (
              <section
                key={e.id}
                className="rounded-3xl border border-border/70 bg-card p-5 shadow-1"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold tracking-tight">{e.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.cidade ?? "Sem cidade"} · curso {diaCurto(e.inicio)} a {diaCurto(e.fim)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-2xs font-medium",
                      COR_DO_STATUS[e.status],
                    )}
                  >
                    {ROTULO_DO_STATUS[e.status]}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {e.praticas.length ? (
                    e.praticas.map((p) => (
                      <span
                        key={p.id}
                        className="rounded-full bg-surface-subtle px-2.5 py-1 text-2xs tabular-nums"
                      >
                        {diaCurto(p.data).slice(0, 5)} · {horariosDaPratica(p).length} horários ·{" "}
                        {somaDe(p.ocupadas)} reservas
                      </span>
                    ))
                  ) : (
                    <span className="text-2xs text-warning">Sem dias de prática cadastrados</span>
                  )}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {e.ofertas.length} ofertas · {ocupadas} de {vagas} vagas ocupadas
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={() => copiar.mutate(e.id)}
                      disabled={copiar.isPending}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Duplicar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => setForm(paraForm(e))}
                    >
                      Editar
                    </Button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(v) => !v && setForm(null)}>
        <DialogContent className="custom-scroll max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar edição" : "Nova edição da mentoria"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid gap-4">
              <Campo rotulo="Nome da edição">
                <Input
                  value={form.nome}
                  placeholder="Dezembro 2026 · Porto Alegre"
                  onChange={(ev) => setForm({ ...form, nome: ev.target.value })}
                />
              </Campo>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="Cidade">
                  <Input
                    value={form.cidade}
                    placeholder="Porto Alegre"
                    onChange={(ev) => setForm({ ...form, cidade: ev.target.value })}
                  />
                </Campo>
                <Campo rotulo="Status">
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v as StatusDaEdicao })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_DA_EDICAO.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Campo>
              </div>
              <Campo
                rotulo="Local"
                ajuda="Escolha a unidade e o endereço dela vem sozinho. Se a prática for em outro lugar, escolha Endereço avulso e escreva."
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    value={form.unitId || "avulso"}
                    onValueChange={(v) => {
                      const anterior = (unidades.data ?? []).find((u) => u.id === form.unitId);
                      const nova = (unidades.data ?? []).find((u) => u.id === v);
                      // O endereço acompanha a unidade, a não ser que alguém tenha
                      // escrito outro à mão.
                      const escritoAMao =
                        form.endereco.trim() !== "" &&
                        form.endereco.trim() !== (anterior?.endereco ?? "").trim();
                      setForm({
                        ...form,
                        unitId: v === "avulso" ? "" : v,
                        endereco: escritoAMao ? form.endereco : (nova?.endereco ?? ""),
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="avulso">Endereço avulso</SelectItem>
                      {(unidades.data ?? []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={form.endereco}
                    placeholder="Rua, número, sala e cidade"
                    onChange={(ev) => setForm({ ...form, endereco: ev.target.value })}
                  />
                </div>
              </Campo>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="Início da mentoria">
                  <Input
                    type="date"
                    value={form.inicio}
                    onChange={(ev) => setForm({ ...form, inicio: ev.target.value })}
                  />
                </Campo>
                <Campo rotulo="Fim da mentoria">
                  <Input
                    type="date"
                    value={form.fim}
                    onChange={(ev) => setForm({ ...form, fim: ev.target.value })}
                  />
                </Campo>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium">Dias de prática com pacientes</p>
                    <Ajuda texto="Só estes dias são oferecidos pela Luna, separados das datas do curso. Os horários saem do início ao fim, no passo da duração do atendimento; cada horário recebe o número de pacientes indicado. Reserva com sinal pendente (no prazo), em análise ou confirmada ocupa o horário." />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1"
                    onClick={() =>
                      setForm({
                        ...form,
                        praticas: [
                          ...form.praticas,
                          {
                            id: null,
                            data: form.fim || "",
                            horaInicio: "09:00",
                            horaFim: "18:00",
                            duracaoMin: 60,
                            vagas: 1,
                            observacao: "",
                            ocupadas: 0,
                          },
                        ],
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Dia
                  </Button>
                </div>
                <div className="mt-2 grid gap-2">
                  {form.praticas.length > 0 && (
                    <div className="grid grid-cols-[1.3fr_1fr_1fr_0.9fr_0.9fr_auto] gap-2 px-1 text-3xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      <span>Dia</span>
                      <span>Início</span>
                      <span>Fim</span>
                      <span>Min. cada</span>
                      <span>Por horário</span>
                      <span className="w-9" />
                    </div>
                  )}
                  {form.praticas.map((p, i) => {
                    const mudar = (patch: Partial<PraticaNoForm>) =>
                      setForm({
                        ...form,
                        praticas: form.praticas.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                      });
                    return (
                      <div
                        key={p.id ?? `novo-${i}`}
                        className="grid grid-cols-[1.3fr_1fr_1fr_0.9fr_0.9fr_auto] items-center gap-2"
                      >
                        <Input
                          type="date"
                          value={p.data}
                          onChange={(ev) => mudar({ data: ev.target.value })}
                        />
                        <Input
                          type="time"
                          value={p.horaInicio}
                          onChange={(ev) => mudar({ horaInicio: ev.target.value })}
                        />
                        <Input
                          type="time"
                          value={p.horaFim}
                          onChange={(ev) => mudar({ horaFim: ev.target.value })}
                        />
                        <Input
                          type="number"
                          min={10}
                          step={5}
                          value={p.duracaoMin}
                          aria-label="Minutos de cada atendimento"
                          onChange={(ev) => mudar({ duracaoMin: Number(ev.target.value) })}
                        />
                        <Input
                          type="number"
                          min={0}
                          value={p.vagas}
                          aria-label="Pacientes por horário"
                          onChange={(ev) => mudar({ vagas: Number(ev.target.value) })}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          disabled={p.ocupadas > 0}
                          title={p.ocupadas > 0 ? "Este dia tem reservas" : "Remover"}
                          onClick={() =>
                            setForm({ ...form, praticas: form.praticas.filter((_, j) => j !== i) })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                  {!form.praticas.length && (
                    <p className="text-xs text-muted-foreground">Nenhum dia ainda.</p>
                  )}
                </div>
              </div>

              <Campo
                rotulo="Observações para a Luna"
                ajuda="O que ela pode dizer sobre esta edição além do cadastro. Curto: datas, valores e regras já vêm dos campos."
              >
                <Textarea
                  rows={3}
                  value={form.observacoes}
                  onChange={(ev) => setForm({ ...form, observacoes: ev.target.value })}
                />
              </Campo>
              <Campo
                rotulo="Orientações de chegada"
                ajuda="Vai na mensagem de confirmação da reserva: como chegar, onde estacionar, o que levar."
              >
                <Textarea
                  rows={2}
                  value={form.orientacoesChegada}
                  onChange={(ev) => setForm({ ...form, orientacoesChegada: ev.target.value })}
                />
              </Campo>

              <div className="flex items-center justify-between gap-2 pt-2">
                {form.id ? (
                  <Button
                    variant="ghost"
                    className="gap-1.5 text-danger"
                    onClick={() => form.id && apagar.mutate(form.id)}
                    disabled={apagar.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  variant="premium"
                  onClick={() => gravar.mutate(form)}
                  disabled={gravar.isPending}
                >
                  Salvar edição
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Campo({
  rotulo,
  ajuda,
  children,
}: {
  rotulo: string;
  ajuda?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-sm font-medium">{rotulo}</span>
        <Ajuda texto={ajuda} />
      </div>
      {children}
    </div>
  );
}

// ── Ofertas ─────────────────────────────────────────────────────────────────

interface OfertaNoForm {
  id: string | null;
  nome: string;
  descricao: string;
  ml: string;
  precoVista: string;
  precoParcelado: string;
  parcelasMax: string;
  tipo: "procedimento" | "combo";
  destaque: boolean;
}

function SeletorDeEdicao({
  edicoes,
  valor,
  onMudar,
}: {
  edicoes: EdicaoDaTela[];
  valor: string;
  onMudar: (v: string) => void;
}) {
  return (
    <Select value={valor} onValueChange={onMudar}>
      <SelectTrigger className="w-72">
        <SelectValue placeholder="Escolha a edição" />
      </SelectTrigger>
      <SelectContent>
        {edicoes.map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {e.nome} · {ROTULO_DO_STATUS[e.status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Ofertas() {
  const queryClient = useQueryClient();
  const edicoes = useEdicoes();
  const salvar = useServerFn(salvarOfertas);
  const [edicaoId, setEdicaoId] = useState("");
  const [linhas, setLinhas] = useState<OfertaNoForm[]>([]);

  const lista = useMemo(() => edicoes.data ?? [], [edicoes.data]);
  useEffect(() => {
    if (!edicaoId && lista.length) {
      const preferida =
        lista.find((e) => e.status === "inscricoes_abertas") ??
        lista.find((e) => e.status === "rascunho") ??
        lista[0];
      setEdicaoId(preferida.id);
    }
  }, [lista, edicaoId]);
  const edicao = lista.find((e) => e.id === edicaoId);
  useEffect(() => {
    setLinhas(
      (edicao?.ofertas ?? []).map((o) => ({
        id: o.id,
        nome: o.nome,
        descricao: o.descricao ?? "",
        ml: o.ml === null ? "" : String(o.ml),
        precoVista: String(o.precoVista),
        precoParcelado: o.precoParcelado === null ? "" : String(o.precoParcelado),
        parcelasMax: o.parcelasMax === null ? "" : String(o.parcelasMax),
        tipo: o.tipo,
        destaque: o.destaque,
      })),
    );
  }, [edicao]);

  const gravar = useMutation({
    mutationFn: () =>
      salvar({
        data: {
          edicaoId,
          ofertas: linhas.map((l) => ({
            id: l.id,
            nome: l.nome,
            descricao: l.descricao,
            ml: l.ml === "" ? null : Number(l.ml.replace(",", ".")),
            precoVista: Number(l.precoVista.replace(",", ".")),
            precoParcelado:
              l.precoParcelado === "" ? null : Number(l.precoParcelado.replace(",", ".")),
            parcelasMax: l.parcelasMax === "" ? null : Number(l.parcelasMax),
            tipo: l.tipo,
            destaque: l.destaque,
          })),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mentoria-edicoes"] });
      toast.success("Ofertas salvas.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!lista.length) {
    return <p className="text-sm text-muted-foreground">Cadastre uma edição primeiro.</p>;
  }
  const mudar = (i: number, patch: Partial<OfertaNoForm>) =>
    setLinhas(linhas.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <Bloco
      titulo="Ofertas desta edição"
      descricao="Os valores de paciente modelo são da turma, não da tabela da clínica. A Luna só cita o que está aqui, com o ml e o parcelamento de cada linha."
      acao={<SeletorDeEdicao edicoes={lista} valor={edicaoId} onMudar={setEdicaoId} />}
    >
      <div className="custom-scroll overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="text-left text-3xs uppercase tracking-[0.06em] text-muted-foreground">
              <th className="pb-2 font-semibold">Nome</th>
              <th className="pb-2 font-semibold">ml</th>
              <th className="pb-2 font-semibold">À vista</th>
              <th className="pb-2 font-semibold">Parcelado</th>
              <th className="pb-2 font-semibold">Parcelas</th>
              <th className="pb-2 font-semibold">Tipo</th>
              <th className="pb-2 text-center font-semibold">Destaque</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={l.id ?? `n${i}`} className="border-t border-border/60">
                <td className="py-1.5 pr-2">
                  <Input value={l.nome} onChange={(e) => mudar(i, { nome: e.target.value })} />
                </td>
                <td className="w-20 py-1.5 pr-2">
                  <Input
                    value={l.ml}
                    inputMode="decimal"
                    onChange={(e) => mudar(i, { ml: e.target.value })}
                  />
                </td>
                <td className="w-28 py-1.5 pr-2">
                  <Input
                    value={l.precoVista}
                    inputMode="decimal"
                    onChange={(e) => mudar(i, { precoVista: e.target.value })}
                  />
                </td>
                <td className="w-28 py-1.5 pr-2">
                  <Input
                    value={l.precoParcelado}
                    inputMode="decimal"
                    onChange={(e) => mudar(i, { precoParcelado: e.target.value })}
                  />
                </td>
                <td className="w-20 py-1.5 pr-2">
                  <Input
                    value={l.parcelasMax}
                    inputMode="numeric"
                    onChange={(e) => mudar(i, { parcelasMax: e.target.value })}
                  />
                </td>
                <td className="w-36 py-1.5 pr-2">
                  <Select
                    value={l.tipo}
                    onValueChange={(v) => mudar(i, { tipo: v as OfertaNoForm["tipo"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="procedimento">Procedimento</SelectItem>
                      <SelectItem value="combo">Combo</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="py-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => mudar(i, { destaque: !l.destaque })}
                    aria-label="Destaque"
                    className={cn(
                      "rounded-full p-1.5",
                      l.destaque ? "text-warning" : "text-muted-foreground/50",
                    )}
                  >
                    <Star className="h-4 w-4" fill={l.destaque ? "currentColor" : "none"} />
                  </button>
                </td>
                <td className="py-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() =>
            setLinhas([
              ...linhas,
              {
                id: null,
                nome: "",
                descricao: "",
                ml: "",
                precoVista: "",
                precoParcelado: "",
                parcelasMax: "4",
                tipo: "procedimento",
                destaque: false,
              },
            ])
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Oferta
        </Button>
        <Button
          variant="premium"
          onClick={() => gravar.mutate()}
          disabled={gravar.isPending || !edicaoId}
        >
          Salvar ofertas
        </Button>
      </div>
    </Bloco>
  );
}

// ── Reservas ────────────────────────────────────────────────────────────────

const COLUNAS: StatusDaReserva[] = [
  "interesse",
  "sinal_pendente",
  "pagamento_em_analise",
  "confirmada",
  "compareceu",
  "faltou",
  "cancelada",
];
const ROTULO_DA_RESERVA = Object.fromEntries(
  STATUS_DA_RESERVA.map((s) => [s.id, s.rotulo]),
) as Record<StatusDaReserva, string>;

function haQuanto(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return "agora";
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function Reservas() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(getReservas);
  const confirmar = useServerFn(confirmarSinal);
  const mudar = useServerFn(mudarStatusDaReserva);
  const criar = useServerFn(criarReservaManual);
  const edicoes = useEdicoes();
  const reservas = useQuery({
    queryKey: ["mentoria-reservas"],
    queryFn: () => buscar(),
    refetchInterval: 60_000,
  });
  const [nova, setNova] = useState<{
    edicaoId: string;
    nome: string;
    fone: string;
    praticaId: string;
    hora: string;
    ofertaId: string;
  } | null>(null);

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["mentoria-reservas"] });
    queryClient.invalidateQueries({ queryKey: ["mentoria-edicoes"] });
    queryClient.invalidateQueries({ queryKey: ["agente-modulos"] });
  };
  const confirmarSinalM = useMutation({
    mutationFn: (id: string) => confirmar({ data: { reservaId: id } }),
    onSuccess: (r) => {
      invalidar();
      toast.success(
        r.avisou
          ? "Sinal confirmado: horário na Agenda e a pessoa avisada no WhatsApp."
          : "Sinal confirmado e horário na Agenda. Não deu para avisar no WhatsApp: avise pela conversa.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mudarM = useMutation({
    mutationFn: (v: { reservaId: string; status: StatusDaReserva }) => mudar({ data: v }),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });
  const criarM = useMutation({
    mutationFn: () =>
      criar({
        data: {
          edicaoId: nova!.edicaoId,
          nome: nova!.nome,
          fone: nova!.fone,
          praticaId: nova!.praticaId || null,
          hora: nova!.hora || null,
          ofertaId: nova!.ofertaId || null,
        },
      }),
    onSuccess: () => {
      invalidar();
      setNova(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const porStatus = useMemo(() => {
    const m = new Map<StatusDaReserva, ReservaDaTela[]>();
    for (const r of reservas.data ?? []) {
      const s = r.status === "dia_escolhido" ? "sinal_pendente" : r.status;
      m.set(s, [...(m.get(s) ?? []), r]);
    }
    return m;
  }, [reservas.data]);
  const edicaoDaNova = (edicoes.data ?? []).find((e) => e.id === nova?.edicaoId);
  const praticaDaNova = edicaoDaNova?.praticas.find((p) => p.id === nova?.praticaId);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          A Luna cria a reserva com <strong>sinal pendente</strong> quando a pessoa escolhe o
          horário e diz o nome. Quando ela diz que pagou, vai para{" "}
          <strong>pagamento em análise</strong>: confira o comprovante e confirme o sinal.
        </p>
        <Button
          variant="outline"
          className="shrink-0 gap-1.5 rounded-full"
          disabled={!edicoes.data?.length}
          onClick={() =>
            setNova({
              edicaoId:
                (edicoes.data ?? []).find((e) => e.status === "inscricoes_abertas")?.id ??
                edicoes.data?.[0]?.id ??
                "",
              nome: "",
              fone: "",
              praticaId: "",
              hora: "",
              ofertaId: "",
            })
          }
        >
          <Plus className="h-4 w-4" />
          Reserva manual
        </Button>
      </div>

      <div className="custom-scroll -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
        {COLUNAS.map((c) => {
          const itens = porStatus.get(c) ?? [];
          return (
            <section key={c} className="w-72 shrink-0 rounded-3xl bg-surface-subtle/70 p-3">
              <p className="mb-2 flex items-center justify-between px-1 text-xs font-semibold">
                {ROTULO_DA_RESERVA[c]}
                <span className="tabular-nums text-muted-foreground">{itens.length}</span>
              </p>
              <div className="grid gap-2">
                {itens.map((r) => (
                  <article
                    key={r.id}
                    className="rounded-2xl border border-border/70 bg-card p-3 shadow-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-[13px] font-semibold">{r.nome || r.fone}</p>
                      <span className="shrink-0 text-3xs text-muted-foreground">
                        {haQuanto(r.atualizadoEm)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-2xs text-muted-foreground">
                      {r.dia ? diaCurto(r.dia).slice(0, 5) : "Sem dia"}
                      {r.hora ? ` às ${r.hora}` : ""}
                      {r.oferta ? ` · ${r.oferta}` : ""}
                    </p>
                    {r.pagamentoInformadoEm && r.status === "pagamento_em_analise" && (
                      <p className="mt-1 text-2xs font-medium text-amber-700 dark:text-amber-400">
                        Disse que pagou há {haQuanto(r.pagamentoInformadoEm)}. Confira o
                        comprovante.
                      </p>
                    )}
                    <p className="mt-0.5 text-2xs text-muted-foreground">
                      {r.edicaoNome}
                      {r.sinalValor ? ` · sinal ${formatBRL(r.sinalValor)}` : ""}
                      {r.criadoPor === "luna" ? " · pela Luna" : ""}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {r.conversationId && (
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-2xs"
                        >
                          <Link
                            to="/atendimentos/chat"
                            search={{ conversationId: r.conversationId }}
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            Conversa
                          </Link>
                        </Button>
                      )}
                      {(r.status === "sinal_pendente" ||
                        r.status === "pagamento_em_analise" ||
                        r.status === "dia_escolhido") && (
                        <Button
                          size="sm"
                          variant="premium"
                          className="h-7 gap-1 px-2.5 text-2xs"
                          disabled={confirmarSinalM.isPending || !r.dia}
                          onClick={() => confirmarSinalM.mutate(r.id)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Confirmar sinal
                        </Button>
                      )}
                      <Select
                        value=""
                        onValueChange={(v) =>
                          mudarM.mutate({ reservaId: r.id, status: v as StatusDaReserva })
                        }
                      >
                        <SelectTrigger className="h-7 w-auto gap-1 px-2 text-2xs">
                          <SelectValue placeholder="Mover" />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_DA_RESERVA.filter(
                            (s) =>
                              s.id !== r.status &&
                              s.id !== "confirmada" &&
                              s.id !== "dia_escolhido",
                          ).map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.rotulo}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </article>
                ))}
                {!itens.length && (
                  <p className="px-1 py-3 text-2xs text-muted-foreground">Nada aqui.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Dialog open={nova !== null} onOpenChange={(v) => !v && setNova(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reserva manual</DialogTitle>
          </DialogHeader>
          {nova && (
            <div className="grid gap-3">
              <Campo rotulo="Edição">
                <SeletorDeEdicao
                  edicoes={edicoes.data ?? []}
                  valor={nova.edicaoId}
                  onMudar={(v) =>
                    setNova({ ...nova, edicaoId: v, praticaId: "", hora: "", ofertaId: "" })
                  }
                />
              </Campo>
              <Campo rotulo="Nome completo">
                <Input
                  value={nova.nome}
                  onChange={(e) => setNova({ ...nova, nome: e.target.value })}
                />
              </Campo>
              <Campo rotulo="WhatsApp">
                <Input
                  value={nova.fone}
                  inputMode="tel"
                  placeholder="(51) 99999-9999"
                  onChange={(e) => setNova({ ...nova, fone: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Dia de prática">
                <Select
                  value={nova.praticaId}
                  onValueChange={(v) => setNova({ ...nova, praticaId: v, hora: "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Ainda não escolheu" />
                  </SelectTrigger>
                  <SelectContent>
                    {(edicaoDaNova?.praticas ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {diaCurto(p.data)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
              {praticaDaNova && (
                <Campo rotulo="Horário">
                  <Select value={nova.hora} onValueChange={(v) => setNova({ ...nova, hora: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha o horário" />
                    </SelectTrigger>
                    <SelectContent>
                      {horariosDaPratica(praticaDaNova).map((h) => {
                        const livres = praticaDaNova.vagas - (praticaDaNova.ocupadas[h] ?? 0);
                        return (
                          <SelectItem key={h} value={h} disabled={livres <= 0}>
                            {h} ·{" "}
                            {livres > 0 ? `${livres} ${livres === 1 ? "vaga" : "vagas"}` : "lotado"}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </Campo>
              )}
              <Campo rotulo="Oferta">
                <Select
                  value={nova.ofertaId}
                  onValueChange={(v) => setNova({ ...nova, ofertaId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Decide na avaliação" />
                  </SelectTrigger>
                  <SelectContent>
                    {(edicaoDaNova?.ofertas ?? []).map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.nome} · {formatBRL(o.precoVista)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
              <Button variant="premium" onClick={() => criarM.mutate()} disabled={criarM.isPending}>
                Criar reserva
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Regras e FAQ ────────────────────────────────────────────────────────────

function Regras() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(getModulos);
  const salvar = useServerFn(salvarConfigDoModulo);
  const query = useQuery({ queryKey: ["agente-modulos"], queryFn: () => buscar() });
  const estado = query.data?.modulos.find((m) => m.modulo === "paciente_modelo");
  const [c, setC] = useState<ConfigDoModulo | null>(null);
  const [manual, setManual] = useState("");
  const [versao, setVersao] = useState("");
  useEffect(() => {
    if (estado) {
      setC(estado.config);
      setManual(estado.manual);
      setVersao(estado.manualVersao ?? "");
    }
  }, [estado]);

  const gravar = useMutation({
    mutationFn: () =>
      salvar({
        data: { modulo: "paciente_modelo", config: c, manual, manualVersao: versao },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agente-modulos"] });
      toast.success("Regras salvas. A Luna usa na próxima resposta.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!c) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const politica = (k: keyof ConfigDoModulo["politicas"], v: string) =>
    setC({ ...c, politicas: { ...c.politicas, [k]: v } });
  const bloqueios = estado?.bloqueios ?? [];
  const formas = new Set(c.pagamento.formas);
  const alternarForma = (f: string) => {
    const n = new Set(formas);
    if (n.has(f)) n.delete(f);
    else n.add(f);
    setC({ ...c, pagamento: { ...c.pagamento, formas: [...n] } });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
      <div className="grid gap-4">
        <Bloco
          titulo="Sinal de reserva"
          descricao="O que a Luna diz quando a pessoa quer reservar. A reserva só fica garantida depois que a equipe confirma o comprovante."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Valor do sinal (R$)">
              <Input
                inputMode="decimal"
                value={String(c.sinal.valor)}
                onChange={(e) =>
                  setC({
                    ...c,
                    sinal: { ...c.sinal, valor: Number(e.target.value.replace(",", ".")) || 0 },
                  })
                }
              />
            </Campo>
            <Campo
              rotulo="Prazo para pagar (horas)"
              ajuda="Depois disso a vaga volta a ficar livre."
            >
              <Input
                inputMode="numeric"
                value={String(c.sinal.prazoHoras)}
                onChange={(e) =>
                  setC({ ...c, sinal: { ...c.sinal, prazoHoras: Number(e.target.value) || 0 } })
                }
              />
            </Campo>
          </div>
          <div className="mt-3 grid gap-3">
            <Campo rotulo="O sinal é abatido do valor do procedimento?">
              <Select
                value={c.sinal.abatido}
                onValueChange={(v) =>
                  setC({
                    ...c,
                    sinal: { ...c.sinal, abatido: v as ConfigDoModulo["sinal"]["abatido"] },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sim">Sim, é abatido</SelectItem>
                  <SelectItem value="nao">Não, é cobrado à parte</SelectItem>
                  <SelectItem value="indefinido">Ainda não definido (Luna não cobra)</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                rotulo="Chave Pix do sinal"
                ajuda="A chave que a Luna manda para a pessoa pagar o sinal. Celular, e-mail, CPF, CNPJ ou aleatória. Vazio: a Luna não cobra."
              >
                <Input
                  placeholder="48 99999-9999"
                  value={c.pix.chave}
                  onChange={(e) => setC({ ...c, pix: { ...c.pix, chave: e.target.value } })}
                />
              </Campo>
              <Campo
                rotulo="Em nome de"
                ajuda="O nome que aparece no banco na hora do Pix. A Luna diz para a pessoa conferir."
              >
                <Input
                  placeholder="Nome de quem recebe"
                  value={c.pix.titular}
                  onChange={(e) => setC({ ...c, pix: { ...c.pix, titular: e.target.value } })}
                />
              </Campo>
            </div>
            {avisoDaChavePix(c.pix.chave) && (
              <p className="text-2xs font-medium text-amber-700 dark:text-amber-400">
                {avisoDaChavePix(c.pix.chave)}
              </p>
            )}
          </div>
          {bloqueios.length > 0 && (
            <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-2xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <p className="font-semibold">A Luna ainda não cobra o sinal porque:</p>
              <ul className="mt-1 list-disc pl-4">
                {bloqueios.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}
        </Bloco>

        <Bloco
          titulo="Políticas"
          descricao="O que acontece com o sinal em cada caso. A Luna repete do jeito que está aqui; sem a política de falta ela não cobra."
        >
          <div className="grid gap-3">
            <Campo rotulo="Contraindicação na avaliação">
              <Textarea
                rows={2}
                value={c.politicas.contraindicacao}
                placeholder="Ex.: o sinal é devolvido integralmente."
                onChange={(e) => politica("contraindicacao", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Falta no dia">
              <Textarea
                rows={2}
                value={c.politicas.falta}
                onChange={(e) => politica("falta", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Cancelamento com antecedência">
              <Textarea
                rows={2}
                value={c.politicas.cancelamento}
                onChange={(e) => politica("cancelamento", e.target.value)}
              />
            </Campo>
            <Campo rotulo="Remarcação">
              <Textarea
                rows={2}
                value={c.politicas.remarcacao}
                onChange={(e) => politica("remarcacao", e.target.value)}
              />
            </Campo>
          </div>
        </Bloco>

        <Bloco
          titulo="Pagamento do procedimento"
          descricao="Como o procedimento é pago no dia da prática."
        >
          <div className="grid gap-2 text-sm">
            {[
              ["pix", "Pix"],
              ["dinheiro", "Dinheiro"],
              ["cartao", "Cartão à vista"],
              ["cartao_parcelado", "Cartão parcelado"],
            ].map(([id, rotulo]) => (
              <label key={id} className="flex items-center justify-between">
                {rotulo}
                <Switch checked={formas.has(id)} onCheckedChange={() => alternarForma(id)} />
              </label>
            ))}
            <label className="flex items-center justify-between">
              Boleto
              <Switch
                checked={c.pagamento.boleto}
                onCheckedChange={(v) => setC({ ...c, pagamento: { ...c.pagamento, boleto: v } })}
              />
            </label>
            <Campo rotulo="Parcelas no máximo">
              <Input
                className="w-24"
                inputMode="numeric"
                value={String(c.pagamento.parcelasMax)}
                onChange={(e) =>
                  setC({
                    ...c,
                    pagamento: { ...c.pagamento, parcelasMax: Number(e.target.value) || 1 },
                  })
                }
              />
            </Campo>
          </div>
        </Bloco>

        <Bloco
          titulo="Respostas aprovadas"
          descricao="O que a Luna repete sempre igual. Vazio: ela diz que vai confirmar e encaminha a dúvida."
        >
          <div className="grid gap-3">
            <Campo
              rotulo="Credenciais da responsável"
              ajuda="Nome e registro vêm do cadastro de profissionais. Aqui, só o que faltar."
            >
              <Textarea
                rows={2}
                value={c.credenciais}
                placeholder="Especialização e registro, em uma frase."
                onChange={(e) => setC({ ...c, credenciais: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Fotos">
              <Textarea
                rows={2}
                value={c.fotos}
                onChange={(e) => setC({ ...c, fotos: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Instagram de quem atende">
              <div className="grid gap-2">
                {c.instagram.map((ig, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      className="w-40"
                      placeholder="Dra. Mariane"
                      value={ig.nome}
                      onChange={(e) =>
                        setC({
                          ...c,
                          instagram: c.instagram.map((x, j) =>
                            j === i ? { ...x, nome: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <Input
                      inputMode="url"
                      placeholder="https://www.instagram.com/..."
                      value={ig.url}
                      onChange={(e) =>
                        setC({
                          ...c,
                          instagram: c.instagram.map((x, j) =>
                            j === i ? { ...x, url: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() =>
                        setC({ ...c, instagram: c.instagram.filter((_, j) => j !== i) })
                      }
                    >
                      Remover
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-self-start gap-1"
                  onClick={() => setC({ ...c, instagram: [...c.instagram, { nome: "", url: "" }] })}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Instagram
                </Button>
              </div>
            </Campo>
            <Campo rotulo="Retorno (dias depois)">
              <Input
                className="w-24"
                inputMode="numeric"
                value={c.retornoDias === null ? "" : String(c.retornoDias)}
                onChange={(e) =>
                  setC({ ...c, retornoDias: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
            </Campo>
            <label className="flex items-center justify-between text-sm">
              Oferecer a lista de interesse quando não há vaga
              <Switch
                checked={c.listaDeInteresse}
                onCheckedChange={(v) => setC({ ...c, listaDeInteresse: v })}
              />
            </label>
          </div>
        </Bloco>
      </div>

      <div className="grid gap-4">
        <Bloco
          titulo="Perguntas frequentes"
          descricao="Pergunta e resposta, do jeito que a Luna deve responder."
        >
          <div className="grid gap-3">
            {c.faq.map((f, i) => (
              <div key={i} className="grid gap-1.5 rounded-2xl bg-surface-subtle/60 p-3">
                <Input
                  value={f.pergunta}
                  placeholder="Pergunta"
                  onChange={(e) =>
                    setC({
                      ...c,
                      faq: c.faq.map((x, j) => (j === i ? { ...x, pergunta: e.target.value } : x)),
                    })
                  }
                />
                <Textarea
                  rows={2}
                  value={f.resposta}
                  placeholder="Resposta"
                  onChange={(e) =>
                    setC({
                      ...c,
                      faq: c.faq.map((x, j) => (j === i ? { ...x, resposta: e.target.value } : x)),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 justify-self-end text-2xs"
                  onClick={() => setC({ ...c, faq: c.faq.filter((_, j) => j !== i) })}
                >
                  Remover
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="justify-self-start gap-1"
              onClick={() => setC({ ...c, faq: [...c.faq, { pergunta: "", resposta: "" }] })}
            >
              <Plus className="h-3.5 w-3.5" />
              Pergunta
            </Button>
          </div>
        </Bloco>

        <Bloco
          titulo="Manual do módulo"
          descricao="A MD especializada de paciente modelo. Entra só nas conversas de paciente modelo, por cima do manual da Luna; os dados do CRM entram depois dela."
        >
          <div className="grid gap-3">
            <Campo rotulo="Versão">
              <Input
                className="w-40"
                placeholder="HOF V1"
                value={versao}
                onChange={(e) => setVersao(e.target.value)}
              />
            </Campo>
            <Textarea
              rows={14}
              className="font-mono text-2xs"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
            />
            <p className="text-2xs text-muted-foreground">
              {manual.length.toLocaleString("pt-BR")} caracteres
              {estado?.manualEm
                ? ` · salvo em ${new Date(estado.manualEm).toLocaleString("pt-BR")}`
                : ""}
            </p>
          </div>
        </Bloco>

        <Button
          variant="premium"
          className="justify-self-end"
          onClick={() => gravar.mutate()}
          disabled={gravar.isPending}
        >
          Salvar regras
        </Button>
      </div>
    </div>
  );
}
