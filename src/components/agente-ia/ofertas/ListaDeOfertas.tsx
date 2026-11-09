import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  definirPosicaoDaOferta,
  listarOfertasDoAgente,
  salvarOfertaDoAgente,
  type PosicaoDaOferta,
} from "@/lib/agente-ia/ofertas.functions";
import {
  BarraDoTermometro,
  PARA_QUEM_ROTULO,
  SeletorDePosicao,
  TIPO_ROTULO,
  diaMes,
  situacaoDaOferta,
} from "./comuns";

/**
 * A aba Ofertas do Agente de IA: tudo o que a clínica oferece de especial, num
 * lugar só. Cada cartão mostra a situação, quanto a assistente já tem para
 * vender aquela oferta e o liga e desliga; a ficha completa abre ao lado.
 */
export function ListaDeOfertas() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const buscar = useServerFn(listarOfertasDoAgente);
  const mudar = useServerFn(definirPosicaoDaOferta);
  const query = useQuery({ queryKey: ["agente-ofertas"], queryFn: () => buscar() });
  const [criando, setCriando] = useState(false);
  const hoje = localDateStr();

  const posicaoM = useMutation({
    mutationFn: (v: { id: string; posicao: PosicaoDaOferta }) => mudar({ data: v }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agente-ofertas"] });
      queryClient.invalidateQueries({ queryKey: ["agente-modulos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lista = query.data ?? [];
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          O que a clínica oferece de especial: promoções de preço, Paciente Modelo e Mentoria. A
          assistente lê as que estão abertas hoje e decide pelo que a pessoa pede; o anúncio de onde
          ela veio é só uma pista. Abra uma oferta para dar a ela o que precisa para vender.
        </p>
        <Button variant="premium" className="gap-1.5" onClick={() => setCriando(true)}>
          <Plus className="h-4 w-4" />
          Nova promoção
        </Button>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {lista.map((o) => {
          const s = situacaoDaOferta(o, hoje);
          return (
            <article
              key={o.id}
              className={cn(
                "flex flex-col rounded-3xl border bg-card p-5 shadow-1",
                o.posicao === "ligado" ? "border-primary/40" : "border-border/70",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold">{o.nome}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {TIPO_ROTULO[o.tipo]} · para {PARA_QUEM_ROTULO[o.paraQuem].toLowerCase()}
                    {o.inicio && o.fim ? ` · de ${diaMes(o.inicio)} a ${diaMes(o.fim)}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-2xs font-semibold",
                    s.cor,
                  )}
                >
                  {s.rotulo}
                </span>
              </div>

              {o.resumo ? (
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{o.resumo}</p>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground/70">
                  Sem resumo ainda. Ele vai em toda conversa e dá à assistente o que é a oferta.
                </p>
              )}

              <BarraDoTermometro t={o.termometro} className="mt-4" />

              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
                <SeletorDePosicao
                  rotulo={`Situação de ${o.nome}`}
                  posicao={o.posicao}
                  desabilitado={posicaoM.isPending}
                  onMudar={(posicao) => posicaoM.mutate({ id: o.id, posicao })}
                />
                <Button asChild variant="outline" className="h-9 gap-1.5 rounded-full">
                  <Link to="/agente-ia/ofertas/$id" params={{ id: o.id }}>
                    Abrir oferta
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
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

      <Sheet open={criando} onOpenChange={setCriando}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader className="text-left">
            <SheetTitle>Nova promoção</SheetTitle>
            <SheetDescription>
              Só o essencial. Depois, na ficha, você completa o resumo, o conhecimento e os
              materiais.
            </SheetDescription>
          </SheetHeader>
          {criando && (
            <NovaPromocao
              onCriada={(id) => {
                setCriando(false);
                queryClient.invalidateQueries({ queryKey: ["agente-ofertas"] });
                navigate({ to: "/agente-ia/ofertas/$id", params: { id } });
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function NovaPromocao({ onCriada }: { onCriada: (id: string) => void }) {
  const salvar = useServerFn(salvarOfertaDoAgente);
  const hoje = localDateStr();
  const [nome, setNome] = useState("");
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(hoje);
  const [item, setItem] = useState("");
  const [preco, setPreco] = useState("");
  const m = useMutation({
    mutationFn: () =>
      salvar({
        data: {
          nome,
          inicio,
          fim,
          paraQuem: "paciente",
          resumo: null,
          comoReconhecer: null,
          instrucoes: null,
          observacoes: null,
          itens: [
            {
              nome: item,
              precoVista: preco.trim() ? Number(preco.replace(/\./g, "").replace(",", ".")) : null,
              parcelas: null,
              valorParcela: null,
            },
          ],
        },
      }),
    onSuccess: (r) => {
      toast.success("Promoção criada, desligada. Complete a ficha e ligue quando estiver pronta.");
      onCriada(r.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mt-5 grid gap-4">
      <Campo rotulo="Nome">
        <Input
          value={nome}
          placeholder="Ex.: Black Estética"
          onChange={(e) => setNome(e.target.value)}
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Começa em">
          <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </Campo>
        <Campo rotulo="Termina em">
          <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </Campo>
      </div>
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <Campo rotulo="Primeiro procedimento">
          <Input
            value={item}
            placeholder="Toxina botulínica"
            onChange={(e) => setItem(e.target.value)}
          />
        </Campo>
        <Campo rotulo="À vista (R$)">
          <Input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} />
        </Campo>
      </div>
      <Button variant="premium" disabled={m.isPending} onClick={() => m.mutate()}>
        Criar promoção
      </Button>
    </div>
  );
}
