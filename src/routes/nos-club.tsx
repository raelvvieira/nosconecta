import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Gift,
  Pencil,
  Plus,
  QrCode,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Sidebar } from "@/components/finance/Sidebar";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { PageHeading } from "@/components/layout/PageHeading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatBRL } from "@/lib/finance/format";
import { painelDoClub, salvarNivel } from "@/lib/club/club.functions";
import type { NivelDoClub } from "@/lib/club/niveis-do-club";

export const Route = createFileRoute("/nos-club")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "NÓS Club · NÓS Conecta" },
      {
        name: "description",
        content: "Quem indica, quanto já desbloqueou e como o programa está andando.",
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState error={error} title="Não foi possível carregar o NÓS Club" />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound />,
  component: NosClubPage,
});

const CHAVE = ["club-painel"];

function NosClubPage() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(painelDoClub);
  const painel = useQuery({ queryKey: CHAVE, queryFn: () => buscar(), retry: false });
  const [editando, setEditando] = useState<NivelDoClub | "novo" | null>(null);

  return (
    <div className="min-h-dvh app-bg lg:flex">
      <Sidebar />
      <main className="w-full px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
        <PageHeading
          className="pr-16 lg:pr-0"
          icon={Sparkles}
          kicker="Relacionamento"
          title="NÓS Club"
          subtitle="Quem indica sobe de nível e acumula créditos. A indicação se confirma sozinha quando o indicado é atendido."
        />

        {painel.isError ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
            <Gift className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium">O NÓS Club ainda não está pronto</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
              Falta aplicar a atualização do banco. No Lovable, mande{" "}
              <span className="font-medium text-foreground">
                “Apply pending Supabase migrations”
              </span>{" "}
              e recarregue esta página.
            </p>
          </div>
        ) : painel.isPending ? (
          <p className="mt-8 text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi icone={Users} rotulo="Membros" valor={String(painel.data.membros)} />
              <Kpi
                icone={TrendingUp}
                rotulo="Indicações no mês"
                valor={String(painel.data.indicacoesNoMes)}
                nota={`${painel.data.confirmadasNoMes} confirmadas · ${painel.data.pendentes} pendentes`}
              />
              <Kpi
                icone={Gift}
                rotulo="Créditos liberados"
                valor={formatBRL(painel.data.liberado)}
                nota={`${formatBRL(painel.data.usado)} já usados`}
              />
              <Kpi
                icone={Wallet}
                rotulo="Saldo em aberto"
                valor={formatBRL(painel.data.saldoEmAberto)}
                nota="o que a clínica ainda deve em créditos"
              />
            </div>

            <CartaoComQr />

            <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section className="surface-card p-5">
                <h2 className="text-sm font-semibold">Quem mais indica</h2>
                {painel.data.ranking.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Ninguém no Club ainda. Abra a ficha de um paciente, aba Club, e convide.
                  </p>
                ) : (
                  <ol className="mt-3 space-y-1.5">
                    {painel.data.ranking.map((m, i) => (
                      <li key={m.patientId}>
                        <Link
                          to="/pacientes/$patientId"
                          params={{ patientId: m.patientId }}
                          search={{ aba: "club" }}
                          className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-muted/50"
                        >
                          <span className="min-w-0 truncate text-sm">
                            <span className="mr-2 text-muted-foreground tabular-nums">
                              {i + 1}.
                            </span>
                            {m.nome}
                            {m.nivelNome ? (
                              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
                                {m.nivelNome}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-sm tabular-nums">
                            {m.confirmadas}
                            {m.pendentes ? (
                              <span className="ml-1 text-2xs text-warning">
                                +{m.pendentes} pend.
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section className="surface-card p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">A régua do Club</h2>
                  <Button variant="outline" size="sm" onClick={() => setEditando("novo")}>
                    <Plus className="h-3.5 w-3.5" /> Nível
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Mudar aqui vale para todo mundo na hora — o nível é sempre calculado das
                  indicações confirmadas.
                </p>
                <ul className="mt-3 space-y-1.5">
                  {painel.data.regua.map((n) => {
                    const quantos =
                      painel.data.porNivel.find((p) => p.nome === n.nome)?.quantos ?? 0;
                    return (
                      <li
                        key={n.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
                      >
                        <span className="min-w-0">
                          <span className="text-sm font-medium">{n.nome}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {n.indicacoes} {n.indicacoes === 1 ? "indicação" : "indicações"} ·{" "}
                            {formatBRL(n.credito)}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {quantos}
                          </span>
                          <button
                            type="button"
                            aria-label={`Editar ${n.nome}`}
                            onClick={() => setEditando(n)}
                            className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          </>
        )}
      </main>

      <SheetDoNivel
        nivel={editando}
        aoFechar={() => setEditando(null)}
        aoSalvar={() => queryClient.invalidateQueries({ queryKey: CHAVE })}
      />
    </div>
  );
}

/**
 * O QR Code do cartão físico.
 *
 * ── Por que ele é um só, para sempre ──────────────────────────────────────
 *
 * O cartão é de plástico: o que for impresso nele não muda mais. Então o QR
 * aponta para `/club` e nada além — sem id de paciente, sem token, sem nada
 * que precise ser diferente por pessoa. Quem lê cai no login do Club e a
 * própria conta diz quem é.
 *
 * O desenho é gerado AQUI, no navegador, e não por um serviço de QR na
 * internet: um endereço de terceiro impresso em mil cartões é uma dependência
 * que não dá para corrigir depois.
 */
function CartaoComQr() {
  const [svg, setSvg] = useState<string | null>(null);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/club`;

  useEffect(() => {
    if (!url) return;
    let vivo = true;
    // Import sob demanda: a biblioteca do QR só é baixada por quem abre esta
    // página, e não por todo mundo que entra no sistema.
    import("qrcode").then(async (QRCode) => {
      const desenho = await QRCode.toString(url, {
        type: "svg",
        // Correção alta: um cartão vive no fundo da bolsa, e o QR precisa ler
        // mesmo riscado.
        errorCorrectionLevel: "H",
        margin: 1,
        width: 512,
        color: { dark: "#17151c", light: "#ffffff" },
      });
      if (vivo) setSvg(desenho);
    });
    return () => {
      vivo = false;
    };
  }, [url]);

  const baixar = () => {
    if (!svg) return;
    const arquivo = new Blob([svg], { type: "image/svg+xml" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(arquivo);
    link.download = "nos-club-qrcode.svg";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <section className="surface-card mt-7 flex flex-wrap items-center gap-5 p-5">
      <div
        className="h-32 w-32 shrink-0 rounded-2xl bg-white p-2 ring-1 ring-border [&>svg]:h-full [&>svg]:w-full"
        // O SVG vem da biblioteca de QR, com uma URL montada aqui — não há
        // texto de usuário nenhum neste caminho.
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      />
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <QrCode className="h-4 w-4 text-pink" /> O QR Code do cartão
        </h2>
        <p className="mt-1 max-w-prose text-xs leading-5 text-muted-foreground">
          É o mesmo para todos os cartões e não muda nunca — quem lê cai na área do Club e entra com
          o próprio e-mail. Baixe em SVG e mande para a gráfica; SVG não perde qualidade em nenhum
          tamanho.
        </p>
        <p className="mt-2 break-all rounded-lg bg-muted px-2.5 py-1.5 text-2xs text-muted-foreground">
          {url}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!svg} onClick={baixar}>
            <Download className="h-3.5 w-3.5" /> Baixar para a gráfica
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/club" target="_blank" rel="noreferrer">
              Ver como o paciente vê
            </a>
          </Button>
        </div>
        <p className="mt-2 text-2xs text-muted-foreground">
          Para a pessoa entrar, o e-mail dela precisa estar na ficha — é por ele que o sistema
          encontra o cadastro.
        </p>
      </div>
    </section>
  );
}

function Kpi({
  icone: Icone,
  rotulo,
  valor,
  nota,
}: {
  icone: typeof Users;
  rotulo: string;
  valor: string;
  nota?: string;
}) {
  return (
    <div className="surface-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icone className="h-4 w-4" strokeWidth={1.75} />
        <span className="text-2xs uppercase tracking-wider">{rotulo}</span>
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">{valor}</p>
      {nota ? <p className="mt-0.5 text-2xs text-muted-foreground">{nota}</p> : null}
    </div>
  );
}

function SheetDoNivel({
  nivel,
  aoFechar,
  aoSalvar,
}: {
  nivel: NivelDoClub | "novo" | null;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const doSalvar = useServerFn(salvarNivel);
  const editando = nivel && nivel !== "novo" ? nivel : null;
  const [carregado, setCarregado] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [indicacoes, setIndicacoes] = useState("");
  const [credito, setCredito] = useState("");

  const chave = nivel === "novo" ? "novo" : (editando?.id ?? null);
  if (nivel && carregado !== chave) {
    setCarregado(chave);
    setNome(editando?.nome ?? "");
    setIndicacoes(editando ? String(editando.indicacoes) : "");
    setCredito(editando ? String(editando.credito) : "");
  }

  const salvar = useMutation({
    mutationFn: () =>
      doSalvar({
        data: {
          id: editando?.id ?? null,
          nome,
          indicacoes: Number(indicacoes),
          credito: Number(credito.replace(/\./g, "").replace(",", ".")),
        },
      }),
    onSuccess: () => {
      toast.success("Régua atualizada.");
      aoSalvar();
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={!!nivel} onOpenChange={(o) => !o && aoFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{editando ? `Nível ${editando.nome}` : "Novo nível"}</SheetTitle>
          <SheetDescription>
            Quantas indicações confirmadas ele exige, e quanto desbloqueia uma única vez.
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
            <Label htmlFor="nivel-nome">Nome</Label>
            <Input
              id="nivel-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Gold"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="nivel-indicacoes">Indicações confirmadas</Label>
            <Input
              id="nivel-indicacoes"
              value={indicacoes}
              onChange={(e) => setIndicacoes(e.target.value)}
              inputMode="numeric"
              placeholder="10"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="nivel-credito">Crédito desbloqueado (R$)</Label>
            <Input
              id="nivel-credito"
              value={credito}
              onChange={(e) => setCredito(e.target.value)}
              inputMode="decimal"
              placeholder="1000"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Quem já recebeu o crédito deste nível não recebe de novo, mesmo que a régua mude.
            </p>
          </div>
          <Button type="submit" variant="premium" className="w-full" disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando…" : "Salvar nível"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
