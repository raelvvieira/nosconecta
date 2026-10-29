import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Copy, Loader2, Plus, Ticket, X } from "lucide-react";
import { toast } from "sonner";
import { Sidebar } from "@/components/finance/Sidebar";
import { PageHeading } from "@/components/layout/PageHeading";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  criarConviteDeConsultorio,
  lancarPacote,
  listarConsultorios,
  listarConvitesDeConsultorio,
  revogarConviteDeConsultorio,
  salvarConsultorio,
  type Consultorio,
  type Plano,
  type Situacao,
} from "@/lib/plataforma/plataforma.functions";

/**
 * O painel da plataforma: todos os consultórios, num lugar.
 *
 * Só quem está em `plataforma_admins` abre: as funções do servidor recusam os
 * outros, e a tela mostra o aviso de erro. O custo da IA só aparece aqui.
 */
export const Route = createFileRoute("/plataforma")({
  ssr: false,
  head: () => ({ meta: [{ title: "Consultórios · NÓS Conecta" }] }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível abrir o painel"
      description="Tente novamente em instantes."
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState title="Página não encontrada" description="" notFound />
  ),
  component: PaginaDaPlataforma,
});

const NOME_DO_PLANO: Record<Plano, string> = { basico: "Básico", ia: "Com IA" };
const NOME_DA_SITUACAO: Record<Situacao, string> = {
  teste: "Em teste",
  ativa: "Ativa",
  suspensa: "Suspensa",
};

function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function diasAte(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function linkDoConvite(token: string): string {
  return `${window.location.origin}/convite-consultorio/${token}`;
}

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Link copiado.");
  } catch {
    toast.error("Não deu para copiar. Selecione o link e copie à mão.");
  }
}

function PaginaDaPlataforma() {
  const buscar = useServerFn(listarConsultorios);
  const lista = useQuery({ queryKey: ["plataforma", "consultorios"], queryFn: () => buscar() });
  const [editando, setEditando] = useState<Consultorio | null>(null);
  const [pacoteDe, setPacoteDe] = useState<Consultorio | null>(null);

  return (
    <div className="min-h-dvh app-bg lg:flex">
      <Sidebar />
      <main className="w-full px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
        <PageHeading
          icon={Building2}
          kicker="Plataforma"
          title="Consultórios"
          subtitle="Plano, teste, conversas e custo da IA de cada consultório."
        />

        <section className="mt-6 space-y-3">
          {lista.isPending && (
            <div className="surface-card flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          )}
          {lista.isError && (
            <div className="surface-card p-6 text-sm text-destructive">
              {lista.error instanceof Error ? lista.error.message : "Falhou."}
            </div>
          )}
          {lista.data?.consultorios.map((c) => (
            <CartaoDoConsultorio
              key={c.ownerId}
              c={c}
              dolar={lista.data?.dolar ?? null}
              onEditar={() => setEditando(c)}
              onPacote={() => setPacoteDe(c)}
            />
          ))}
        </section>

        <Convites />
      </main>

      {editando && <EditarConsultorio c={editando} onFechar={() => setEditando(null)} />}
      {pacoteDe && <LancarPacote c={pacoteDe} onFechar={() => setPacoteDe(null)} />}
    </div>
  );
}

function CartaoDoConsultorio({
  c,
  dolar,
  onEditar,
  onPacote,
}: {
  c: Consultorio;
  dolar: number | null;
  onEditar: () => void;
  onPacote: () => void;
}) {
  const dias = c.situacao === "teste" ? diasAte(c.testeAte) : null;
  const limite = c.franquia + c.extras;
  const uso = limite > 0 ? Math.min(100, Math.round((c.conversasNoMes / limite) * 100)) : 0;
  const custo =
    c.custoNoMesUsd === null
      ? "sem preço do modelo"
      : `US$ ${c.custoNoMesUsd.toFixed(2)}${dolar ? ` · R$ ${(c.custoNoMesUsd * dolar).toFixed(2)}` : ""}`;

  return (
    <article className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{c.nome}</h2>
          <p className="text-sm text-muted-foreground">
            {[c.cidade, c.pessoas === 1 ? "1 pessoa" : `${c.pessoas} pessoas`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs font-medium">
          <span className="rounded-full bg-surface-muted px-2.5 py-1">
            {NOME_DO_PLANO[c.plano]}
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-1",
              c.situacao === "suspensa"
                ? "bg-destructive/10 text-destructive"
                : c.situacao === "teste"
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            )}
          >
            {NOME_DA_SITUACAO[c.situacao]}
            {dias !== null && (dias >= 0 ? ` · ${dias} dia(s)` : " · vencido")}
          </span>
          {c.clubLigado && <span className="rounded-full bg-surface-muted px-2.5 py-1">Club</span>}
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">WhatsApp</dt>
          <dd className="font-medium">
            {c.whatsappStatus === "open"
              ? (c.whatsappNumero ?? "conectado")
              : c.whatsappStatus
                ? "desconectado"
                : "não conectado"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Conversas no mês</dt>
          <dd className="font-medium">
            {c.conversasNoMes} de {c.franquia}
            {c.extras > 0 && ` + ${c.extras} extras`}
          </dd>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div
              className={cn("h-full rounded-full", uso >= 80 ? "bg-amber-500" : "bg-coral")}
              style={{ width: `${uso}%` }}
            />
          </div>
        </div>
        <div>
          <dt className="text-muted-foreground">Custo da IA no mês</dt>
          <dd className="font-medium">{custo}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onEditar}>
          Editar
        </Button>
        <Button variant="outline" size="sm" onClick={onPacote}>
          <Plus className="mr-1 h-4 w-4" /> Pacote de conversas
        </Button>
      </div>
    </article>
  );
}

function EditarConsultorio({ c, onFechar }: { c: Consultorio; onFechar: () => void }) {
  const salvar = useServerFn(salvarConsultorio);
  const qc = useQueryClient();
  const [nome, setNome] = useState(c.nome);
  const [plano, setPlano] = useState<Plano>(c.plano);
  const [situacao, setSituacao] = useState<Situacao>(c.situacao);
  const [testeAte, setTesteAte] = useState(c.testeAte ? c.testeAte.slice(0, 10) : "");
  const [responsavel, setResponsavel] = useState(c.responsavelAvaliacao);
  const [club, setClub] = useState(c.clubLigado);
  const [franquia, setFranquia] = useState(String(c.franquia));
  const [salvando, setSalvando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await salvar({
        data: {
          ownerId: c.ownerId,
          nome,
          plano,
          situacao,
          // Fim do dia no Brasil: "teste até 15/11" vale o dia 15 inteiro.
          testeAte: testeAte ? `${testeAte}T23:59:59-03:00` : null,
          responsavelAvaliacao: responsavel,
          clubLigado: club,
          franquia: Number(franquia),
        },
      });
      await qc.invalidateQueries({ queryKey: ["plataforma"] });
      toast.success("Consultório salvo.");
      onFechar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{c.nome}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={enviar}>
          <div>
            <Label htmlFor="p-nome">Nome do consultório</Label>
            <Input
              id="p-nome"
              className="mt-1"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Plano</Label>
              <Select value={plano} onValueChange={(v) => setPlano(v as Plano)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ia">Com IA</SelectItem>
                  <SelectItem value="basico">Básico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Situação</Label>
              <Select value={situacao} onValueChange={(v) => setSituacao(v as Situacao)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="teste">Em teste</SelectItem>
                  <SelectItem value="ativa">Ativa</SelectItem>
                  <SelectItem value="suspensa">Suspensa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {situacao === "teste" && (
            <div>
              <Label htmlFor="p-teste">Teste até</Label>
              <Input
                id="p-teste"
                type="date"
                className="mt-1"
                value={testeAte}
                onChange={(e) => setTesteAte(e.target.value)}
              />
            </div>
          )}
          <div>
            <Label htmlFor="p-resp">Quem faz a avaliação</Label>
            <Input
              id="p-resp"
              className="mt-1"
              placeholder="Ex.: Dra. Ana"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="p-franquia">Conversas da assistente por mês</Label>
            <Input
              id="p-franquia"
              type="number"
              min={0}
              className="mt-1"
              value={franquia}
              onChange={(e) => setFranquia(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="p-club">Club do paciente</Label>
            <Switch id="p-club" checked={club} onCheckedChange={setClub} />
          </div>
          <DialogFooter>
            <Button type="submit" variant="premium" disabled={salvando}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LancarPacote({ c, onFechar }: { c: Consultorio; onFechar: () => void }) {
  const lancar = useServerFn(lancarPacote);
  const qc = useQueryClient();
  const [conversas, setConversas] = useState("500");
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const r = await lancar({
        data: {
          ownerId: c.ownerId,
          conversas: Number(conversas),
          valorReais: valor.trim() ? Number(valor.replace(",", ".")) : null,
          obs,
        },
      });
      await qc.invalidateQueries({ queryKey: ["plataforma"] });
      toast.success(`Pacote lançado. Saldo extra: ${r.extras} conversas.`);
      onFechar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível lançar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Pacote de conversas · {c.nome}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={enviar}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pc-qtd">Conversas</Label>
              <Input
                id="pc-qtd"
                type="number"
                min={1}
                className="mt-1"
                value={conversas}
                onChange={(e) => setConversas(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="pc-valor">Valor pago (R$)</Label>
              <Input
                id="pc-valor"
                inputMode="decimal"
                className="mt-1"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="pc-obs">Observação</Label>
            <Input
              id="pc-obs"
              className="mt-1"
              placeholder="Ex.: Pix de 30/10"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            O saldo extra não vence no fim do mês. Hoje: {c.extras} conversas.
          </p>
          <DialogFooter>
            <Button type="submit" variant="premium" disabled={salvando}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lançar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Convites() {
  const listar = useServerFn(listarConvitesDeConsultorio);
  const criar = useServerFn(criarConviteDeConsultorio);
  const revogar = useServerFn(revogarConviteDeConsultorio);
  const qc = useQueryClient();
  const convites = useQuery({ queryKey: ["plataforma", "convites"], queryFn: () => listar() });
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [plano, setPlano] = useState<Plano>("ia");
  const [dias, setDias] = useState("14");
  const [criando, setCriando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCriando(true);
    try {
      const { token } = await criar({
        data: { nomeConsultorio: nome, email, plano, diasDeTeste: Number(dias) },
      });
      await qc.invalidateQueries({ queryKey: ["plataforma", "convites"] });
      await copiar(linkDoConvite(token));
      setNome("");
      setEmail("");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível criar o convite.");
    } finally {
      setCriando(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Ticket className="h-4 w-4" /> Convidar um consultório novo
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Quem abrir o link cria a própria conta e vira dono do consultório, já com o plano e o teste
        definidos aqui. O link vale 14 dias e serve para um consultório só.
      </p>

      <form
        className="surface-card mt-3 grid gap-3 p-5 sm:grid-cols-[2fr_2fr_1fr_1fr_auto]"
        onSubmit={enviar}
      >
        <div>
          <Label htmlFor="c-nome">Consultório</Label>
          <Input
            id="c-nome"
            className="mt-1"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="c-email">E-mail do dono (opcional)</Label>
          <Input
            id="c-email"
            type="email"
            className="mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Label>Plano</Label>
          <Select value={plano} onValueChange={(v) => setPlano(v as Plano)}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ia">Com IA</SelectItem>
              <SelectItem value="basico">Básico</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="c-dias">Dias de teste</Label>
          <Input
            id="c-dias"
            type="number"
            min={0}
            className="mt-1"
            value={dias}
            onChange={(e) => setDias(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" variant="premium" disabled={criando} className="w-full">
            {criando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar link
          </Button>
        </div>
      </form>

      {!!convites.data?.length && (
        <ul className="mt-3 space-y-2">
          {convites.data.map((c) => (
            <li
              key={c.id}
              className="surface-card flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium">{c.nomeConsultorio}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {NOME_DO_PLANO[c.plano]} · {c.diasDeTeste} dias de teste · vence{" "}
                  {dataCurta(c.expiraEm)}
                </span>
              </span>
              <span className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => copiar(linkDoConvite(c.token))}>
                  <Copy className="mr-1 h-4 w-4" /> Copiar link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Cancelar convite"
                  onClick={async () => {
                    await revogar({ data: { id: c.id } });
                    await qc.invalidateQueries({ queryKey: ["plataforma", "convites"] });
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
