import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Plus, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/finance/format";
import {
  adicionarIndicacao,
  entrarNoClub,
  movimentarCreditos,
  mudarIndicacao,
  verMembro,
} from "@/lib/club/club.functions";

/**
 * O NÓS Club na ficha do paciente.
 *
 * Mostra o que o membro vê de si: nível, progresso, saldo e as indicações.
 * Nada aqui é digitado duas vezes — o nível sai da contagem de indicações
 * confirmadas, e o saldo sai da soma do extrato.
 */
export function NosClub({ patientId }: { patientId: string }) {
  const queryClient = useQueryClient();
  const buscar = useServerFn(verMembro);
  const doEntrar = useServerFn(entrarNoClub);
  const chave = ["club-membro", patientId];

  const membro = useQuery({
    queryKey: chave,
    queryFn: () => buscar({ data: { patientId } }),
    retry: false,
  });
  const invalidar = () => queryClient.invalidateQueries({ queryKey: chave });

  const entrar = useMutation({
    mutationFn: (participa: boolean) => doEntrar({ data: { patientId, participa } }),
    onSuccess: (_r, participa) => {
      toast.success(participa ? "Entrou no NÓS Club." : "Saiu do NÓS Club.");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [indicando, setIndicando] = useState(false);
  const [movimentando, setMovimentando] = useState(false);

  if (membro.isPending) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (membro.isError) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
        <p className="mt-3 text-sm font-medium">O NÓS Club ainda não está pronto</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
          Falta aplicar a atualização do banco. No Lovable, mande{" "}
          <span className="font-medium text-foreground">“Apply pending Supabase migrations”</span>.
        </p>
      </div>
    );
  }

  const m = membro.data!;

  if (!m.participa) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
        <Gift className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
        <p className="mt-3 text-sm font-medium">{m.nome} não participa do NÓS Club</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          No Club, quem indica sobe de nível e acumula créditos para usar em procedimentos.
        </p>
        <Button
          variant="premium"
          className="mt-5"
          disabled={entrar.isPending}
          onClick={() => entrar.mutate(true)}
        >
          <Sparkles className="h-4 w-4" /> Convidar para o Club
        </Button>
        {m.indicacoes.length > 0 ? (
          <p className="mt-3 text-2xs text-muted-foreground">
            Já indicou {m.indicacoes.length} {m.indicacoes.length === 1 ? "pessoa" : "pessoas"} — ao
            entrar, isso conta.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="surface-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-pink">NÓS Club</p>
            <h3 className="mt-0.5 text-2xl font-semibold">{m.nivelNome ?? "Membro"}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {m.confirmadas}{" "}
              {m.confirmadas === 1 ? "indicação confirmada" : "indicações confirmadas"}
              {m.pendentes ? ` · ${m.pendentes} aguardando comparecer` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xs uppercase tracking-wider text-muted-foreground">Saldo</p>
            <p className="text-2xl font-semibold text-success">{formatBRL(m.saldo)}</p>
            <p className="text-2xs text-muted-foreground">
              {formatBRL(m.liberado)} liberados · {formatBRL(m.usado)} usados
            </p>
          </div>
        </div>

        {m.proximoNome ? (
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-primary transition-[width]"
                style={{ width: `${Math.round(m.progresso * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Faltam <strong>{m.faltam}</strong> {m.faltam === 1 ? "indicação" : "indicações"} para{" "}
              {m.proximoNome}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">Chegou ao topo do Club. 🎉</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setIndicando(true)}>
            <Plus className="h-3.5 w-3.5" /> Adicionar indicação
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMovimentando(true)}>
            <Wallet className="h-3.5 w-3.5" /> Movimentar créditos
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={entrar.isPending}
            onClick={() => entrar.mutate(false)}
          >
            Tirar do Club
          </Button>
        </div>
      </section>

      <section>
        <h4 className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
          Indicações
        </h4>
        {m.indicacoes.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nenhuma indicação ainda.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {m.indicacoes.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
              >
                <span className="min-w-0 text-sm">
                  {i.indicadoNome}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(i.criadaEm).toLocaleDateString("pt-BR")}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <EtiquetaDeStatus status={i.status} />
                  {i.status === "pendente" ? (
                    <BotoesDaPendente id={i.id} invalidar={invalidar} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
          Extrato de créditos
        </h4>
        {m.extrato.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nenhum crédito ainda.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {m.extrato.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2"
              >
                <span className="min-w-0 text-sm">
                  {l.descricao}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(l.criadoEm).toLocaleDateString("pt-BR")}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-sm font-semibold tabular-nums",
                    l.valor > 0 ? "text-success" : "text-danger",
                  )}
                >
                  {l.valor > 0 ? "+" : "−"}
                  {formatBRL(Math.abs(l.valor))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SheetDeIndicacao
        aberto={indicando}
        patientId={patientId}
        aoFechar={() => setIndicando(false)}
        aoSalvar={invalidar}
      />
      <SheetDeCreditos
        aberto={movimentando}
        patientId={patientId}
        saldo={m.saldo}
        aoFechar={() => setMovimentando(false)}
        aoSalvar={invalidar}
      />
    </div>
  );
}

function EtiquetaDeStatus({ status }: { status: "pendente" | "confirmada" | "cancelada" }) {
  const texto =
    status === "confirmada" ? "Confirmada" : status === "pendente" ? "Pendente" : "Cancelada";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-2xs font-medium",
        status === "confirmada" && "bg-success-soft text-success",
        status === "pendente" && "bg-warning-soft text-warning",
        status === "cancelada" && "bg-muted text-muted-foreground",
      )}
    >
      {texto}
    </span>
  );
}

/** Confirmar à mão existe para a indicação que não passou pela agenda. O
 *  caminho normal é o atendimento concluído, que confirma sozinho. */
function BotoesDaPendente({ id, invalidar }: { id: string; invalidar: () => void }) {
  const doMudar = useServerFn(mudarIndicacao);
  const mudar = useMutation({
    mutationFn: (status: "confirmada" | "cancelada") => doMudar({ data: { id, status } }),
    onSuccess: (r: { niveis?: string[] }) => {
      toast.success(
        r?.niveis?.length
          ? `Confirmada! Desbloqueou: ${r.niveis.join(", ")}.`
          : "Indicação atualizada.",
      );
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={() => mudar.mutate("confirmada")}
        disabled={mudar.isPending}
        className="rounded-lg px-2 py-1 text-2xs text-success hover:bg-success-soft"
      >
        Confirmar
      </button>
      <button
        type="button"
        onClick={() => mudar.mutate("cancelada")}
        disabled={mudar.isPending}
        className="rounded-lg px-2 py-1 text-2xs text-muted-foreground hover:bg-muted"
      >
        Cancelar
      </button>
    </div>
  );
}

function SheetDeIndicacao({
  aberto,
  patientId,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  patientId: string;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const doAdicionar = useServerFn(adicionarIndicacao);
  const [nome, setNome] = useState("");

  const salvar = useMutation({
    mutationFn: () =>
      doAdicionar({ data: { indicadorId: patientId, indicadoNome: nome, indicadoId: null } }),
    onSuccess: () => {
      toast.success("Indicação registrada. Ela confirma quando a pessoa for atendida.");
      setNome("");
      aoSalvar();
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Adicionar indicação</SheetTitle>
          <SheetDescription>
            Para quem foi indicado e ainda não marcou. Quando a pessoa for atendida, confirme aqui —
            ou marque a indicação no próprio agendamento, que aí ela se confirma sozinha.
          </SheetDescription>
        </SheetHeader>
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <div>
            <Label htmlFor="indicado">Quem foi indicado</Label>
            <Input
              id="indicado"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome da pessoa"
              className="mt-1"
            />
          </div>
          <Button type="submit" variant="premium" className="w-full" disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando…" : "Registrar indicação"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function SheetDeCreditos({
  aberto,
  patientId,
  saldo,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  patientId: string;
  saldo: number;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const doMovimentar = useServerFn(movimentarCreditos);
  const [tipo, setTipo] = useState<"uso" | "boas_vindas" | "ajuste">("uso");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");

  const salvar = useMutation({
    mutationFn: () =>
      doMovimentar({
        data: {
          patientId,
          valor: Number(valor.replace(/\./g, "").replace(",", ".")),
          tipo,
          descricao,
        },
      }),
    onSuccess: () => {
      toast.success("Lançamento registrado.");
      setValor("");
      setDescricao("");
      aoSalvar();
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Movimentar créditos</SheetTitle>
          <SheetDescription>
            Saldo hoje: {formatBRL(saldo)}. Não existe "editar saldo": tudo entra como lançamento, e
            é isso que deixa o extrato explicar de onde veio cada real.
          </SheetDescription>
        </SheetHeader>
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <div>
            <Label>O que é</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uso">Uso em procedimento (sai do saldo)</SelectItem>
                <SelectItem value="boas_vindas">Crédito de boas-vindas (entra)</SelectItem>
                <SelectItem value="ajuste">Ajuste (entra)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="credito-valor">Valor (R$)</Label>
            <Input
              id="credito-valor"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              placeholder="250"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="credito-descricao">Do que se trata</Label>
            <Input
              id="credito-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Bioestimulador · 14/10"
              className="mt-1"
            />
          </div>
          <Button type="submit" variant="premium" className="w-full" disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando…" : "Lançar"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
