import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import {
  adicionarAoMeuProntuario,
  arquivarMeuPaciente,
  listarMeuProntuario,
  cancelarMinhaLocacao,
  listarMeusPacientes,
  minhasLocacoes,
  ocupacaoDasSalas,
  pedirLocacao,
  salasDoLocatario,
  salvarMeuPaciente,
  type PacienteDoLocatario,
} from "@/lib/locacao/locacao.functions";
import { sobrepoe, type CategoriaDaSala } from "@/lib/locacao/regras";
import { clinicNowStamp, clinicTodayStr } from "@/lib/date";
import { cn } from "@/lib/utils";

// A única página do locatário. Ele vê, por sala e por horário, só "livre",
// "ocupado" ou "meu" — nunca quem ocupa nem por quê.

export const Route = createFileRoute("/minhas-locacoes")({
  ssr: false,
  head: () => ({ meta: [{ title: "Locação de salas · NÓS Conecta" }] }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState error={error} title="Não foi possível carregar as salas" />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound />,
  component: MinhasLocacoes,
});

const PASSO = 30;
const ABRE = 7 * 60;
const FECHA = 21 * 60;
const SLOTS = Array.from({ length: (FECHA - ABRE) / PASSO }, (_, i) => ABRE + i * PASSO);
const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const ROTULO_STATUS: Record<string, string> = {
  pending: "Aguardando aprovação",
  approved: "Aprovada",
  rejected: "Recusada",
  cancelled: "Cancelada",
  completed: "Concluída",
};

const FILTROS: { id: "todas" | CategoriaDaSala; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "estetica", rotulo: "Estética" },
  { id: "odontologia", rotulo: "Odontologia" },
];

function MinhasLocacoes() {
  const qc = useQueryClient();
  const getSalas = useServerFn(salasDoLocatario);
  const getOcupacao = useServerFn(ocupacaoDasSalas);
  const getMinhas = useServerFn(minhasLocacoes);
  const doPedir = useServerFn(pedirLocacao);
  const doCancelar = useServerFn(cancelarMinhaLocacao);
  const getPacientes = useServerFn(listarMeusPacientes);
  const doSalvarPaciente = useServerFn(salvarMeuPaciente);
  const doArquivar = useServerFn(arquivarMeuPaciente);

  const [dia, setDia] = useState(clinicTodayStr());
  const [filtro, setFiltro] = useState<"todas" | CategoriaDaSala>("todas");
  const [sel, setSel] = useState<{ roomId: string; a: number; b: number | null } | null>(null);
  const [obs, setObs] = useState("");
  const [pacienteId, setPacienteId] = useState("");
  const [edit, setEdit] = useState<Partial<PacienteDoLocatario> | null>(null);
  const [abertoPront, setAbertoPront] = useState<string | null>(null);

  const salasQ = useQuery({ queryKey: ["loc-salas"], queryFn: () => getSalas(), retry: false });
  const ocupQ = useQuery({
    queryKey: ["loc-ocupacao", dia],
    queryFn: () => getOcupacao({ data: { de: dia, ate: dia } }),
    retry: false,
  });
  const pacientesQ = useQuery({
    queryKey: ["loc-pacientes"],
    queryFn: () => getPacientes(),
    retry: false,
  });
  const minhasQ = useQuery({ queryKey: ["loc-minhas"], queryFn: () => getMinhas(), retry: false });

  // Próximas primeiro (da mais perto para a mais longe), depois as anteriores.
  const minhasOrdenadas = useMemo(() => {
    const agora = clinicNowStamp();
    const lista = minhasQ.data ?? [];
    const prox = lista
      .filter((l) => l.fim >= agora && (l.status === "pending" || l.status === "approved"))
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
    const resto = lista
      .filter((l) => !prox.includes(l))
      .sort((a, b) => b.inicio.localeCompare(a.inicio));
    return [...prox, ...resto];
  }, [minhasQ.data]);

  const salas = (salasQ.data?.salas ?? []).filter(
    (s) => filtro === "todas" || s.categoria === filtro,
  );

  const ocupado = (roomId: string, min: number) =>
    (ocupQ.data ?? []).find(
      (b) =>
        b.roomId === roomId &&
        sobrepoe(
          { inicio: `${dia}T${hhmm(min)}`, fim: `${dia}T${hhmm(min + PASSO)}` },
          { inicio: b.inicio, fim: b.fim },
        ),
    );

  const fim = sel ? (sel.b ?? sel.a) + PASSO : 0;
  const livreNaFaixa = useMemo(() => {
    if (!sel) return false;
    for (let m = sel.a; m < fim; m += PASSO) if (ocupado(sel.roomId, m)) return false;
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, ocupQ.data, dia]);

  const pedir = useMutation({
    mutationFn: () =>
      doPedir({
        data: {
          roomId: sel!.roomId,
          inicio: `${dia}T${hhmm(sel!.a)}`,
          fim: `${dia}T${hhmm(fim)}`,
          observacao: obs,
          pacienteId: pacienteId || null,
        },
      }),
    onSuccess: () => {
      toast.success("Pedido enviado. A clínica vai confirmar o horário.");
      setSel(null);
      setObs("");
      setPacienteId("");
      qc.invalidateQueries({ queryKey: ["loc-ocupacao"] });
      qc.invalidateQueries({ queryKey: ["loc-minhas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const salvarPaciente = useMutation({
    mutationFn: () =>
      doSalvarPaciente({
        data: {
          id: edit?.id,
          nome: edit?.nome ?? "",
          telefone: edit?.telefone ?? null,
          email: edit?.email ?? null,
          nascimento: edit?.nascimento ?? null,
          observacao: edit?.observacao ?? null,
        },
      }),
    onSuccess: () => {
      toast.success("Paciente salvo.");
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["loc-pacientes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const arquivar = useMutation({
    mutationFn: (id: string) => doArquivar({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loc-pacientes"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelar = useMutation({
    mutationFn: (id: string) => doCancelar({ data: { id } }),
    onSuccess: () => {
      toast.success("Reserva cancelada.");
      qc.invalidateQueries({ queryKey: ["loc-ocupacao"] });
      qc.invalidateQueries({ queryKey: ["loc-minhas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function clicar(roomId: string, min: number) {
    if (ocupado(roomId, min)) return;
    if (!sel || sel.roomId !== roomId || sel.b !== null || min < sel.a) {
      setSel({ roomId, a: min, b: null });
    } else {
      setSel({ roomId, a: sel.a, b: min });
    }
  }

  return (
    <div className="app-bg min-h-dvh px-4 py-6 md:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Locação de salas</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {salasQ.data?.unidade ? `${salasQ.data.unidade} · ` : ""}
              {salasQ.data
                ? `R$ ${salasQ.data.valorHora.toFixed(2).replace(".", ",")} por hora`
                : ""}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/auth";
            }}
          >
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </header>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={dia}
            min={clinicTodayStr()}
            onChange={(e) => {
              setDia(e.target.value || clinicTodayStr());
              setSel(null);
            }}
            className="w-auto"
          />
          <div
            className="flex rounded-full border border-border/70 bg-card p-0.5 shadow-1"
            role="group"
          >
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  filtro === f.id ? "bg-gradient-primary text-white" : "text-muted-foreground",
                )}
              >
                {f.rotulo}
              </button>
            ))}
          </div>
        </div>

        {salasQ.isError ? (
          <p className="mt-6 text-sm text-destructive">{(salasQ.error as Error).message}</p>
        ) : salasQ.isPending ? (
          <p className="mt-6 text-sm text-muted-foreground">Carregando…</p>
        ) : salas.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">Nenhuma sala neste filtro.</p>
        ) : (
          <div className="mt-5 space-y-4">
            {salas.map((s) => (
              <section
                key={s.id}
                className="rounded-2xl border border-border/70 bg-card p-4 shadow-1"
              >
                <h2 className="text-sm font-semibold">{s.nome}</h2>
                <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                  {SLOTS.map((m) => {
                    const b = ocupado(s.id, m);
                    const dentro =
                      sel && sel.roomId === s.id && m >= sel.a && m < (sel.b ?? sel.a) + PASSO;
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={!!b}
                        onClick={() => clicar(s.id, m)}
                        className={cn(
                          "rounded-lg px-1 py-1.5 text-2xs font-medium tabular-nums",
                          b?.de === "mine"
                            ? "bg-violet-soft text-violet"
                            : b
                              ? "cursor-not-allowed bg-muted text-muted-foreground/60 line-through"
                              : dentro
                                ? "bg-gradient-primary text-white"
                                : "bg-success-soft text-success hover:opacity-80",
                        )}
                        aria-label={`${hhmm(m)} ${b ? (b.de === "mine" ? "sua reserva" : "ocupado") : "livre"}`}
                      >
                        {hhmm(m)}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            <p className="text-xs text-muted-foreground">
              Verde: livre · Cinza: ocupado · Roxo: sua reserva. Toque no horário de início e depois
              no último horário que quer usar.
            </p>
          </div>
        )}

        {sel && (
          <div className="sticky bottom-3 mt-4 rounded-2xl border border-border/70 bg-card p-4 shadow-2">
            <p className="text-sm font-medium">
              {salasQ.data?.salas.find((x) => x.id === sel.roomId)?.nome} ·{" "}
              {dia.split("-").reverse().join("/")} · {hhmm(sel.a)} às {hhmm(fim)}
            </p>
            {!livreNaFaixa && (
              <p className="mt-1 text-xs text-destructive">Há horário ocupado nessa faixa.</p>
            )}
            <select
              value={pacienteId}
              onChange={(e) => setPacienteId(e.target.value)}
              className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              aria-label="Paciente"
            >
              <option value="">Paciente (opcional)</option>
              {(pacientesQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <Input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Observação (opcional)"
              className="mt-2"
              maxLength={300}
            />
            <div className="mt-3 flex gap-2">
              <Button
                variant="premium"
                disabled={!livreNaFaixa || pedir.isPending}
                onClick={() => pedir.mutate()}
              >
                {pedir.isPending ? "Enviando…" : "Pedir este horário"}
              </Button>
              <Button variant="outline" onClick={() => setSel(null)}>
                Limpar
              </Button>
            </div>
          </div>
        )}

        <section className="mt-8">
          <h2 className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
            Minha agenda
          </h2>
          <div className="mt-2 space-y-2">
            {minhasOrdenadas.length === 0 && (
              <p className="text-sm text-muted-foreground">Você ainda não tem reservas.</p>
            )}
            {minhasOrdenadas.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3"
              >
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">{l.sala}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.inicio.slice(0, 10).split("-").reverse().join("/")} · {l.inicio.slice(11)} às{" "}
                    {l.fim.slice(11)} · {ROTULO_STATUS[l.status]}
                    {l.paciente ? ` · ${l.paciente}` : ""}
                  </p>
                </div>
                {l.podeCancelar && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={cancelar.isPending}
                    onClick={() => cancelar.mutate(l.id)}
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            O cancelamento é possível até 24 horas antes do horário.
          </p>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
              Meus pacientes
            </h2>
            <Button size="sm" variant="outline" onClick={() => setEdit({})}>
              Adicionar paciente
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Estes pacientes são seus. A clínica também os vê, com a origem "Locatário".
          </p>
          {edit && (
            <form
              className="mt-3 space-y-2 rounded-2xl border border-border/70 bg-card p-4"
              onSubmit={(e) => {
                e.preventDefault();
                salvarPaciente.mutate();
              }}
            >
              <Input
                value={edit.nome ?? ""}
                onChange={(e) => setEdit({ ...edit, nome: e.target.value })}
                placeholder="Nome do paciente"
                maxLength={120}
                required
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input
                  value={edit.telefone ?? ""}
                  onChange={(e) => setEdit({ ...edit, telefone: e.target.value })}
                  placeholder="WhatsApp (com DDD)"
                  inputMode="tel"
                />
                <Input
                  value={edit.email ?? ""}
                  onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                  placeholder="E-mail"
                  type="email"
                />
              </div>
              <Input
                type="date"
                value={edit.nascimento ?? ""}
                onChange={(e) => setEdit({ ...edit, nascimento: e.target.value || null })}
                aria-label="Nascimento"
                className="sm:w-56"
              />
              <Input
                value={edit.observacao ?? ""}
                onChange={(e) => setEdit({ ...edit, observacao: e.target.value })}
                placeholder="Observação (opcional)"
                maxLength={500}
              />
              <div className="flex gap-2">
                <Button type="submit" variant="premium" disabled={salvarPaciente.isPending}>
                  {salvarPaciente.isPending ? "Salvando…" : "Salvar"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEdit(null)}>
                  Cancelar
                </Button>
              </div>
            </form>
          )}
          <div className="mt-2 space-y-2">
            {(pacientesQ.data ?? []).length === 0 && !edit && (
              <p className="text-sm text-muted-foreground">Nenhum paciente cadastrado ainda.</p>
            )}
            {(pacientesQ.data ?? []).map((p) => (
              <div key={p.id}>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3">
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-medium">{p.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[p.telefone, p.email].filter(Boolean).join(" · ") || "Sem contato"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAbertoPront(abertoPront === p.id ? null : p.id)}
                    >
                      Prontuário
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEdit(p)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={arquivar.isPending}
                      onClick={() => arquivar.mutate(p.id)}
                    >
                      Remover
                    </Button>
                  </div>
                </div>
                {abertoPront === p.id && <ProntuarioDoPaciente pacienteId={p.id} />}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function ProntuarioDoPaciente({ pacienteId }: { pacienteId: string }) {
  const qc = useQueryClient();
  const listar = useServerFn(listarMeuProntuario);
  const adicionar = useServerFn(adicionarAoMeuProntuario);
  const [texto, setTexto] = useState("");
  const q = useQuery({
    queryKey: ["loc-prontuario", pacienteId],
    queryFn: () => listar({ data: { pacienteId } }),
    retry: false,
  });
  const salvar = useMutation({
    mutationFn: () => adicionar({ data: { pacienteId, texto } }),
    onSuccess: () => {
      setTexto("");
      qc.invalidateQueries({ queryKey: ["loc-prontuario", pacienteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mt-1 space-y-2 rounded-xl border border-border/70 bg-muted/40 p-3">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Novo registro do atendimento (queixa, conduta, observações…)"
        rows={3}
        maxLength={5000}
        className="w-full rounded-lg border border-border bg-background p-2 text-sm"
      />
      <Button
        size="sm"
        variant="premium"
        disabled={!texto.trim() || salvar.isPending}
        onClick={() => salvar.mutate()}
      >
        {salvar.isPending ? "Salvando…" : "Adicionar ao prontuário"}
      </Button>
      <div className="space-y-2">
        {(q.data ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum registro ainda.</p>
        )}
        {(q.data ?? []).map((r) => (
          <div key={r.id} className="rounded-lg bg-card p-2 text-sm">
            <p className="text-2xs text-muted-foreground">
              {r.data.split("-").reverse().join("/")}
            </p>
            <p className="whitespace-pre-wrap">{r.texto}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
