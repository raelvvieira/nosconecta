import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Copy, Link2, Stethoscope, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { NIVEIS, type NivelDeAcesso } from "@/lib/auth/niveis-de-acesso";
import { getSettings, saveSetting, type UnitSetting } from "@/lib/settings/settings.functions";
import {
  criarConvite,
  definirSituacao,
  excluirPessoa,
  listarConvites,
  listarPessoal,
  revogarConvite,
  salvarAcesso,
  vincularFicha,
  type ConviteAberto,
  type PessoaDaClinica,
} from "@/lib/settings/pessoal.functions";

const searchSchema = z.object({});

export const Route = createFileRoute("/configuracoes/pessoal")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Pessoal · Configurações · NÓS Conecta" },
      { name: "description", content: "Quem trabalha na clínica e o que cada um acessa." },
    ],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar as pessoas"
      description="Houve uma falha ao buscar a equipe. Tente novamente em instantes."
      semSidebar
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState title="Página não encontrada" notFound semSidebar />
  ),
  component: PessoalPage,
});

const CHAVE = ["pessoal"];
const CHAVE_CONVITES = ["convites"];
const SEM_PESSOAS: PessoaDaClinica[] = [];
const SEM_CONVITES: ConviteAberto[] = [];

const rotuloDoNivel = (n: NivelDeAcesso | null) =>
  NIVEIS.find((x) => x.valor === n)?.rotulo ?? "Sem acesso";

function PessoalPage() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(listarPessoal);
  const buscarConvites = useServerFn(listarConvites);
  const buscarSettings = useServerFn(getSettings);

  const pessoasQuery = useQuery({ queryKey: CHAVE, queryFn: () => buscar(), retry: false });
  const convitesQuery = useQuery({
    queryKey: CHAVE_CONVITES,
    queryFn: () => buscarConvites(),
    retry: false,
  });
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: () => buscarSettings() });

  const pessoas = pessoasQuery.data ?? SEM_PESSOAS;
  const convites = convitesQuery.data ?? SEM_CONVITES;
  const unidades = settingsQuery.data?.units ?? [];

  const [convidando, setConvidando] = useState(false);
  const [editando, setEditando] = useState<PessoaDaClinica | null>(null);
  const [ficha, setFicha] = useState<PessoaDaClinica | null>(null);

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: CHAVE });
    queryClient.invalidateQueries({ queryKey: CHAVE_CONVITES });
  };

  const comAcesso = pessoas.filter((p) => p.situacao !== "sem_acesso");
  const semAcesso = pessoas.filter((p) => p.situacao === "sem_acesso");

  return (
    <>
      <main className="w-full px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 text-2xl font-semibold md:text-3xl">
              <Users className="h-[1.1em] w-[1.1em] shrink-0 text-pink" strokeWidth={1.75} />
              Pessoal
            </h1>
            <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
              Todo mundo que trabalha na clínica em um lugar só: quem entra no sistema, com qual
              nível e em quais unidades, e quem atende pacientes na agenda.
            </p>
          </div>
          <Button variant="premium" onClick={() => setConvidando(true)}>
            <UserPlus className="h-4 w-4" /> Convidar pessoa
          </Button>
        </header>

        {pessoasQuery.isError ? (
          <TelaDeMigrationPendente erro={(pessoasQuery.error as Error)?.message} />
        ) : pessoasQuery.isPending ? (
          <p className="mt-8 text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <>
            {convites.length > 0 ? (
              <section className="mt-7">
                <h2 className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                  Convites abertos
                </h2>
                <div className="mt-2 space-y-2">
                  {convites.map((c) => (
                    <LinhaDoConvite key={c.id} convite={c} invalidar={invalidar} />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="mt-7">
              <h2 className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                Com acesso ao sistema
              </h2>
              <div className="mt-2 space-y-2">
                {comAcesso.map((p) => (
                  <CartaoDaPessoa
                    key={p.chave}
                    pessoa={p}
                    unidades={unidades}
                    invalidar={invalidar}
                    onEditarAcesso={() => setEditando(p)}
                    onEditarFicha={() => setFicha(p)}
                  />
                ))}
                {comAcesso.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ninguém com acesso ainda.</p>
                ) : null}
              </div>
            </section>

            {semAcesso.length > 0 ? (
              <section className="mt-7">
                <h2 className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                  Atendem, mas não usam o sistema
                </h2>
                <p className="mt-1 max-w-prose text-xs text-muted-foreground">
                  Têm ficha na agenda e nenhum login. Para dar acesso a uma destas pessoas, mande um
                  convite — depois é só ligar a ficha dela no cadastro que nascer.
                </p>
                <div className="mt-2 space-y-2">
                  {semAcesso.map((p) => (
                    <CartaoDaPessoa
                      key={p.chave}
                      pessoa={p}
                      unidades={unidades}
                      invalidar={invalidar}
                      onEditarAcesso={() => setEditando(p)}
                      onEditarFicha={() => setFicha(p)}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>

      <SheetDeConvite
        aberto={convidando}
        aoFechar={() => setConvidando(false)}
        aoCriar={invalidar}
      />
      <SheetDeAcesso
        pessoa={editando}
        unidades={unidades}
        aoFechar={() => setEditando(null)}
        aoSalvar={invalidar}
      />
      <SheetDaFicha
        pessoa={ficha}
        unidades={unidades}
        aoFechar={() => setFicha(null)}
        aoSalvar={invalidar}
      />
    </>
  );
}

function TelaDeMigrationPendente({ erro }: { erro?: string }) {
  return (
    <div className="mt-8 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <Users className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
      <p className="mt-3 text-sm font-medium">Esta tela ainda não está pronta para uso</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
        Ela depende de uma atualização do banco que ainda não foi aplicada. No Lovable, mande{" "}
        <span className="font-medium text-foreground">“Apply pending Supabase migrations”</span> e
        recarregue esta página.
      </p>
      <p className="mx-auto mt-3 max-w-md break-words text-2xs text-muted-foreground/70">{erro}</p>
    </div>
  );
}

function CartaoDaPessoa({
  pessoa,
  unidades,
  invalidar,
  onEditarAcesso,
  onEditarFicha,
}: {
  pessoa: PessoaDaClinica;
  unidades: UnitSetting[];
  invalidar: () => void;
  onEditarAcesso: () => void;
  onEditarFicha: () => void;
}) {
  const doSituacao = useServerFn(definirSituacao);
  const doExcluir = useServerFn(excluirPessoa);
  const [confirmando, setConfirmando] = useState(false);

  const situacao = useMutation({
    mutationFn: (desativado: boolean) =>
      doSituacao({ data: { memberId: pessoa.memberId!, desativado } }),
    onSuccess: (_r, desativado) => {
      toast.success(desativado ? "Acesso desativado." : "Acesso reativado.");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: () =>
      doExcluir({
        data: { memberId: pessoa.memberId, professionalId: pessoa.professionalId },
      }),
    onSuccess: (r) => {
      // O aviso diz o que de fato aconteceu com a ficha, e não um "pronto"
      // genérico: desativar em vez de apagar é uma decisão do servidor, e
      // quem clicou precisa saber que ela foi tomada.
      toast.success(
        r.fichaMantida
          ? "Acesso excluído. A ficha clínica foi desativada em vez de apagada — ela tem histórico na agenda."
          : "Pessoa excluída do sistema.",
      );
      setConfirmando(false);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nomesDasUnidades = pessoa.unidadeIds
    .map((id) => unidades.find((u) => u.id === id)?.name?.trim())
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="rounded-2xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{pessoa.nome || "Sem nome"}</h3>
            <Etiqueta tom={pessoa.situacao === "ativo" ? "ok" : "neutro"}>
              {rotuloDoNivel(pessoa.nivel)}
            </Etiqueta>
            {pessoa.situacao === "desativado" ? <Etiqueta tom="alerta">Desativado</Etiqueta> : null}
            {pessoa.professionalId ? (
              <Etiqueta tom="neutro">
                <Stethoscope className="mr-1 inline h-3 w-3" />
                Atende
              </Etiqueta>
            ) : null}
            {/* O sinal que faltava: uma linha "ativa" sem login nenhum é um
                cadastro que nunca virou conta. Foi uma dessas que escondeu a
                dona da clínica sem acesso desde setembro. */}
            {pessoa.memberId && !pessoa.temLogin ? (
              <Etiqueta tom="alerta">Sem login</Etiqueta>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[pessoa.email, pessoa.telefone].filter(Boolean).join(" · ") || "sem contato"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {nomesDasUnidades || (pessoa.nivel === "admin" ? "Todas as unidades" : "Sem unidade")}
            {pessoa.especialidade ? ` · ${pessoa.especialidade}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-1.5">
          {pessoa.memberId ? (
            <Button variant="outline" size="sm" onClick={onEditarAcesso}>
              Acesso
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={onEditarFicha}>
            Ficha clínica
          </Button>
          {pessoa.memberId && pessoa.temLogin ? (
            <Button
              variant="outline"
              size="sm"
              disabled={situacao.isPending}
              onClick={() => situacao.mutate(pessoa.situacao === "ativo")}
            >
              {pessoa.situacao === "ativo" ? (
                <>
                  <Ban className="h-3.5 w-3.5" /> Desativar
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" /> Reativar
                </>
              )}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="text-danger hover:bg-danger-soft hover:text-danger"
            onClick={() => setConfirmando(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {pessoa.nome} do sistema?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                {pessoa.memberId ? (
                  <p>
                    O acesso é apagado: nível, unidades e a permissão de entrar. Se essa pessoa
                    tiver login, ela continua conseguindo digitar a senha, mas não entra mais na
                    clínica.
                  </p>
                ) : null}
                {pessoa.professionalId ? (
                  <p>
                    A ficha clínica some da agenda. Se houver consulta, lançamento ou prontuário
                    ligado a ela, a ficha é <strong>desativada</strong> em vez de apagada — apagar
                    desligaria esse histórico de quem atendeu, sem erro nenhum e sem volta.
                  </p>
                ) : null}
                <p>Não dá para desfazer.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              disabled={excluir.isPending}
              onClick={(e) => {
                e.preventDefault();
                excluir.mutate();
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}

function Etiqueta({
  tom,
  children,
}: {
  tom: "ok" | "alerta" | "neutro";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-2xs font-medium",
        tom === "ok" && "bg-success-soft text-success",
        tom === "alerta" && "bg-warning-soft text-warning",
        tom === "neutro" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function LinhaDoConvite({ convite, invalidar }: { convite: ConviteAberto; invalidar: () => void }) {
  const doRevogar = useServerFn(revogarConvite);
  const revogar = useMutation({
    mutationFn: () => doRevogar({ data: { id: convite.id } }),
    onSuccess: () => {
      toast.success("Convite cancelado.");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm">
          <Link2 className="mr-1.5 inline h-3.5 w-3.5 text-muted-foreground" />
          {convite.convidadoNome || "Convite"} · {rotuloDoNivel(convite.nivel)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Vale até {new Date(convite.expiraEm).toLocaleDateString("pt-BR")}
        </p>
      </div>
      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" onClick={() => copiarLink(convite.token)}>
          <Copy className="h-3.5 w-3.5" /> Copiar link
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={revogar.isPending}
          onClick={() => revogar.mutate()}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function linkDoConvite(token: string): string {
  const base = typeof window === "undefined" ? "" : window.location.origin;
  return `${base}/convite/${token}`;
}

async function copiarLink(token: string) {
  const url = linkDoConvite(token);
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado. Mande para a pessoa.");
  } catch {
    // Área de transferência bloqueada (acontece em navegador sem HTTPS ou com
    // permissão negada): o link vai na tela para copiar à mão em vez de a
    // ação falhar em silêncio.
    toast.message("Copie o link:", { description: url, duration: 20000 });
  }
}

function SheetDeConvite({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: () => void;
}) {
  const doCriar = useServerFn(criarConvite);
  const [nivel, setNivel] = useState<NivelDeAcesso>("reception");
  const [nome, setNome] = useState("");
  const [token, setToken] = useState<string | null>(null);

  const criar = useMutation({
    mutationFn: () => doCriar({ data: { nivel, nome } }),
    onSuccess: (r) => {
      setToken(r.token);
      aoCriar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fechar = () => {
    setToken(null);
    setNome("");
    setNivel("reception");
    aoFechar();
  };

  const escolhido = NIVEIS.find((n) => n.valor === nivel);

  return (
    <Sheet open={aberto} onOpenChange={(o) => !o && fechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Convidar pessoa</SheetTitle>
          <SheetDescription>
            O nível é escolhido agora, por você. Quem receber o link preenche os próprios dados e já
            entra nesse nível — sem fila de aprovação.
          </SheetDescription>
        </SheetHeader>

        {token ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm">Link pronto. Ele vale por 7 dias e serve para uma pessoa só.</p>
            <p className="break-all rounded-xl bg-muted px-3 py-2 text-xs">
              {linkDoConvite(token)}
            </p>
            <Button variant="premium" className="w-full" onClick={() => copiarLink(token)}>
              <Copy className="h-4 w-4" /> Copiar link
            </Button>
            <Button variant="outline" className="w-full" onClick={fechar}>
              Fechar
            </Button>
          </div>
        ) : (
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              criar.mutate();
            }}
          >
            <div>
              <Label htmlFor="convite-nome">Nome (opcional)</Label>
              <Input
                id="convite-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Para você lembrar de quem é o convite"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Nível de acesso</Label>
              <Select value={nivel} onValueChange={(v) => setNivel(v as NivelDeAcesso)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NIVEIS.map((n) => (
                    <SelectItem key={n.valor} value={n.valor}>
                      {n.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {escolhido ? (
                <p className="mt-1.5 text-xs text-muted-foreground">{escolhido.resumo}</p>
              ) : null}
            </div>

            <p className="rounded-xl bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
              A pessoa escolhe as unidades em que atende na hora de se cadastrar. Você pode mudar
              isso depois, aqui mesmo.
            </p>

            <Button type="submit" variant="premium" className="w-full" disabled={criar.isPending}>
              {criar.isPending ? "Gerando…" : "Gerar link"}
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SheetDeAcesso({
  pessoa,
  unidades,
  aoFechar,
  aoSalvar,
}: {
  pessoa: PessoaDaClinica | null;
  unidades: UnitSetting[];
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const doSalvar = useServerFn(salvarAcesso);
  const [nivel, setNivel] = useState<NivelDeAcesso>("reception");
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [carregado, setCarregado] = useState<string | null>(null);

  // Sincroniza com a pessoa aberta sem efeito: comparar a chave durante a
  // renderização evita o quadro em que o formulário mostra os dados de quem
  // foi aberto antes.
  if (pessoa && carregado !== pessoa.chave) {
    setCarregado(pessoa.chave);
    setNivel((pessoa.nivel ?? "reception") as NivelDeAcesso);
    setMarcadas(pessoa.unidadeIds);
  }

  const salvar = useMutation({
    mutationFn: () =>
      doSalvar({ data: { memberId: pessoa!.memberId!, nivel, unidadeIds: marcadas } }),
    onSuccess: () => {
      toast.success("Acesso atualizado.");
      aoSalvar();
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const escolhido = NIVEIS.find((n) => n.valor === nivel);

  return (
    <Sheet open={!!pessoa} onOpenChange={(o) => !o && aoFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Acesso de {pessoa?.nome}</SheetTitle>
          <SheetDescription>O que esta pessoa vê, e em quais unidades.</SheetDescription>
        </SheetHeader>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <div>
            <Label>Nível</Label>
            <Select value={nivel} onValueChange={(v) => setNivel(v as NivelDeAcesso)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NIVEIS.map((n) => (
                  <SelectItem key={n.valor} value={n.valor}>
                    {n.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {escolhido ? (
              <p className="mt-1.5 text-xs text-muted-foreground">{escolhido.resumo}</p>
            ) : null}
          </div>

          {nivel === "admin" ? (
            <p className="rounded-xl bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
              Administrador enxerga todas as unidades.
            </p>
          ) : (
            <div>
              <Label>Unidades em que atende</Label>
              <div className="mt-2 space-y-2">
                {unidades.map((u) => (
                  <label key={u.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{u.name}</span>
                    <Switch
                      checked={marcadas.includes(u.id)}
                      onCheckedChange={(v) =>
                        setMarcadas((atual) =>
                          v ? [...new Set([...atual, u.id])] : atual.filter((x) => x !== u.id),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                A primeira marcada vale como unidade padrão dos cadastros que ela criar.
              </p>
            </div>
          )}

          <Button type="submit" variant="premium" className="w-full" disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando…" : "Salvar acesso"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function SheetDaFicha({
  pessoa,
  unidades,
  aoFechar,
  aoSalvar,
}: {
  pessoa: PessoaDaClinica | null;
  unidades: UnitSetting[];
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const doSalvarSetting = useServerFn(saveSetting);
  const doVincular = useServerFn(vincularFicha);
  const [carregado, setCarregado] = useState<string | null>(null);
  const [especialidade, setEspecialidade] = useState("");
  const [registro, setRegistro] = useState("");
  const [comissao, setComissao] = useState("0");
  const [cor, setCor] = useState("#8B5CF6");

  if (pessoa && carregado !== pessoa.chave) {
    setCarregado(pessoa.chave);
    setEspecialidade(pessoa.especialidade);
    setRegistro(pessoa.registro);
    setComissao(String(pessoa.comissaoPct ?? 0));
    setCor(pessoa.cor);
  }

  const unidadePadrao = useMemo(
    () => pessoa?.unidadeIds[0] ?? unidades[0]?.id ?? null,
    [pessoa, unidades],
  );

  const salvar = useMutation({
    mutationFn: async () => {
      // Ficha nova ganha o id aqui para poder ser ligada à pessoa na sequência
      // — `saveSetting` aceita o id de quem chama e só gera um quando não vem.
      const id = pessoa!.professionalId ?? crypto.randomUUID();
      await doSalvarSetting({
        data: {
          section: "professionals",
          item: {
            id,
            name: pessoa!.nome,
            specialty: especialidade,
            registrationNumber: registro,
            phone: pessoa!.telefone ?? "",
            email: pessoa!.email,
            commissionPct: Number(comissao.replace(",", ".")) || 0,
            color: cor,
            active: true,
            unitId: unidadePadrao,
          },
        },
      });
      if (pessoa!.memberId && !pessoa!.professionalId) {
        await doVincular({ data: { memberId: pessoa!.memberId, professionalId: id } });
      }
    },
    onSuccess: () => {
      toast.success("Ficha clínica salva.");
      aoSalvar();
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nova = pessoa && !pessoa.professionalId;

  return (
    <Sheet open={!!pessoa} onOpenChange={(o) => !o && aoFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Ficha clínica de {pessoa?.nome}</SheetTitle>
          <SheetDescription>
            {nova
              ? "Criar a ficha faz esta pessoa aparecer na agenda, com cor própria."
              : "É esta ficha que a agenda usa para marcar consultas no nome dela."}
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
            <Label htmlFor="ficha-especialidade">Especialidade</Label>
            <Input
              id="ficha-especialidade"
              value={especialidade}
              onChange={(e) => setEspecialidade(e.target.value)}
              placeholder="Cirurgiã"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="ficha-registro">Registro (CRO)</Label>
            <Input
              id="ficha-registro"
              value={registro}
              onChange={(e) => setRegistro(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="ficha-comissao">Comissão (%)</Label>
            <Input
              id="ficha-comissao"
              value={comissao}
              onChange={(e) => setComissao(e.target.value)}
              inputMode="decimal"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="ficha-cor">Cor na agenda</Label>
            <Input
              id="ficha-cor"
              type="color"
              value={cor}
              onChange={(e) => setCor(e.target.value)}
              className="mt-1 h-10 w-20 p-1"
            />
          </div>

          <Button type="submit" variant="premium" className="w-full" disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando…" : nova ? "Criar ficha" : "Salvar ficha"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
