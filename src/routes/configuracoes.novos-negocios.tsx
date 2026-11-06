import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import {
  criarConviteDeConsultorio,
  listarConvitesDeConsultorio,
  revogarConviteDeConsultorio,
  souDaPlataforma,
  type Plano,
} from "@/lib/plataforma/plataforma.functions";

/**
 * Gerar o link para um negócio novo.
 *
 * Quem abre o link cria a própria conta (nome do negócio, e-mail, senha), sem
 * e-mail nem SMS de confirmação, e no primeiro acesso cai no guia de
 * configuração. Por padrão o link é GRATUITO para sempre (sem prazo de teste);
 * o plano e o prazo podem ser trocados antes de gerar. Só quem administra a
 * plataforma vê esta tela.
 */
export const Route = createFileRoute("/configuracoes/novos-negocios")({
  ssr: false,
  head: () => ({ meta: [{ title: "Novos negócios · NÓS Conecta" }] }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState error={error} title="Não foi possível abrir esta tela" semSidebar />
  ),
  component: NovosNegocios,
});

const linkDoConvite = (token: string) => `${window.location.origin}/convite-consultorio/${token}`;

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Link copiado.");
  } catch {
    toast.error("Não deu para copiar. Selecione o link e copie à mão.");
  }
}

function NovosNegocios() {
  const verSePlataforma = useServerFn(souDaPlataforma);
  const eu = useQuery({ queryKey: ["sou-da-plataforma"], queryFn: () => verSePlataforma() });
  const listar = useServerFn(listarConvitesDeConsultorio);
  const criar = useServerFn(criarConviteDeConsultorio);
  const revogar = useServerFn(revogarConviteDeConsultorio);
  const qc = useQueryClient();
  const links = useQuery({ queryKey: ["plataforma", "convites"], queryFn: () => listar() });
  const [plano, setPlano] = useState<Plano>("ia");
  const [gratis, setGratis] = useState(true);
  const [gerando, setGerando] = useState(false);

  if (eu.data === false) {
    return (
      <p className="surface-card p-6 text-sm text-muted-foreground">
        Esta área é só de quem administra a plataforma.
      </p>
    );
  }

  async function gerar() {
    setGerando(true);
    try {
      const { token } = await criar({
        data: { nomeConsultorio: "", plano, diasDeTeste: gratis ? 0 : 14 },
      });
      await qc.invalidateQueries({ queryKey: ["plataforma", "convites"] });
      await copiar(linkDoConvite(token));
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível gerar o link.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <section className="surface-card space-y-4 p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Link2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Gerar link para um novo negócio</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Quem abrir o link cria a própria conta em um minuto: nome do negócio, e-mail e senha.
              Sem e-mail de confirmação. No primeiro acesso, o sistema guia a configuração. Cada
              link serve para um negócio só e vale 14 dias.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["ia", "basico"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlano(p)}
              className={
                "rounded-full border px-3 py-1.5 text-xs transition-colors " +
                (plano === p
                  ? "border-foreground bg-foreground font-medium text-background"
                  : "border-border text-muted-foreground hover:text-foreground")
              }
            >
              {p === "ia" ? "Com assistente de IA" : "Básico"}
            </button>
          ))}
          <label className="ml-1 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={gratis}
              onChange={(e) => setGratis(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            Uso gratuito (sem prazo de teste)
          </label>
        </div>

        <Button variant="premium" onClick={() => void gerar()} disabled={gerando}>
          {gerando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Gerar e copiar link
        </Button>
      </section>

      {!!links.data?.length && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Links ainda não usados</h3>
          <ul className="space-y-2">
            {links.data.map((c) => (
              <li
                key={c.id}
                className="surface-card flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <span className="min-w-0 text-muted-foreground">
                  {c.plano === "ia" ? "Com IA" : "Básico"} ·{" "}
                  {c.diasDeTeste > 0 ? `${c.diasDeTeste} dias de teste` : "gratuito"} · vence{" "}
                  {new Date(c.expiraEm).toLocaleDateString("pt-BR")}
                </span>
                <span className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void copiar(linkDoConvite(c.token))}
                  >
                    <Copy className="mr-1 h-4 w-4" /> Copiar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Cancelar link"
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
        </section>
      )}
    </div>
  );
}
