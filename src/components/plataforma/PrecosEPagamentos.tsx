import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listarPagamentos,
  listarPrecos,
  salvarPreco,
  type PrecoDaPlataforma,
} from "@/lib/plataforma/pagamento.functions";

function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Os preços que o Checkout do Asaas cobra, e o que entrou. Mudar um preço aqui
 * vale para o próximo checkout aberto; quem já assina segue no valor dele até
 * trocar de plano.
 */
export function PrecosEPagamentos({ nomes }: { nomes: Record<string, string> }) {
  const buscarPrecos = useServerFn(listarPrecos);
  const buscarPagamentos = useServerFn(listarPagamentos);
  const precos = useQuery({ queryKey: ["plataforma", "precos"], queryFn: () => buscarPrecos() });
  const pagamentos = useQuery({
    queryKey: ["plataforma", "pagamentos"],
    queryFn: () => buscarPagamentos(),
  });

  return (
    <section className="mt-10 space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Receipt className="h-4 w-4" /> Preços do Asaas
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          O valor de cada checkout novo. Quem já assina continua no valor dele.
        </p>
        <ul className="mt-3 space-y-2">
          {precos.data?.map((p) => (
            <LinhaDePreco key={p.chave} p={p} />
          ))}
        </ul>
      </div>

      <div>
        <h2 className="text-base font-semibold">Pagamentos recentes</h2>
        {!pagamentos.data?.length ? (
          <p className="mt-2 text-sm text-muted-foreground">Nenhum pagamento ainda.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-white/60">
            {pagamentos.data.map((p, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{nomes[p.ownerId] ?? "Consultório"}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    ·{" "}
                    {p.tipo === "pacote"
                      ? `pacote de ${p.conversas ?? "?"} conversas`
                      : `assinatura ${p.plano === "basico" ? "Básico" : "Com IA"} ${p.ciclo ?? ""}`}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {p.valorCentavos !== null ? reais(p.valorCentavos) : ""} · {p.status} ·{" "}
                  {new Date(p.criadoEm).toLocaleDateString("pt-BR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function LinhaDePreco({ p }: { p: PrecoDaPlataforma }) {
  const salvar = useServerFn(salvarPreco);
  const qc = useQueryClient();
  const [valor, setValor] = useState((p.valorCentavos / 100).toFixed(2).replace(".", ","));
  const [conversas, setConversas] = useState(p.conversas === null ? "" : String(p.conversas));
  const [salvando, setSalvando] = useState(false);

  async function gravar() {
    setSalvando(true);
    try {
      await salvar({
        data: {
          chave: p.chave,
          valorReais: Number(valor.replace(/\./g, "").replace(",", ".")),
          conversas: p.conversas === null ? null : Number(conversas),
        },
      });
      await qc.invalidateQueries({ queryKey: ["plataforma", "precos"] });
      toast.success("Preço salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <li className="surface-card flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <span className="min-w-0 flex-1 font-medium">{p.nome}</span>
      <label className="flex items-center gap-1.5 text-muted-foreground">
        R$
        <Input
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="h-9 w-28"
          aria-label={`Valor de ${p.nome}`}
        />
      </label>
      {p.conversas !== null && (
        <label className="flex items-center gap-1.5 text-muted-foreground">
          conversas
          <Input
            type="number"
            min={1}
            value={conversas}
            onChange={(e) => setConversas(e.target.value)}
            className="h-9 w-24"
            aria-label="Conversas do pacote"
          />
        </label>
      )}
      <Button variant="outline" size="sm" disabled={salvando} onClick={() => void gravar()}>
        Salvar
      </Button>
    </li>
  );
}
