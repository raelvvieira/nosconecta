import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ticket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  criarCupom,
  ligarCupom,
  listarCupons,
  type CupomDaPlataforma,
} from "@/lib/plataforma/pagamento.functions";

const ONDE: Record<CupomDaPlataforma["aplicaEm"], string> = {
  tudo: "assinatura e pacote",
  assinatura: "só assinatura",
  pacote: "só pacote",
};

function resumo(c: CupomDaPlataforma): string {
  const quanto =
    c.tipo === "percentual"
      ? `${c.valor}% de desconto`
      : `${(c.valor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de desconto`;
  const partes = [quanto, ONDE[c.aplicaEm]];
  if (c.soPrimeira && c.aplicaEm !== "pacote") partes.push("1ª cobrança da assinatura");
  if (c.validoAte) partes.push(`até ${new Date(c.validoAte).toLocaleDateString("pt-BR")}`);
  partes.push(c.maxUsos ? `${c.usos} de ${c.maxUsos} usos` : `${c.usos} usos`);
  return partes.join(" · ");
}

/**
 * Cupons de desconto. O Checkout do Asaas não tem cupom: o consultório digita
 * na tela de Plano e o checkout já abre com o valor com desconto. O uso só
 * conta quando o pagamento é confirmado.
 */
export function Cupons() {
  const listar = useServerFn(listarCupons);
  const criar = useServerFn(criarCupom);
  const ligar = useServerFn(ligarCupom);
  const qc = useQueryClient();
  const cupons = useQuery({ queryKey: ["plataforma", "cupons"], queryFn: () => listar() });

  const [codigo, setCodigo] = useState("");
  const [tipo, setTipo] = useState<"percentual" | "valor">("percentual");
  const [valor, setValor] = useState("");
  const [aplicaEm, setAplicaEm] = useState<CupomDaPlataforma["aplicaEm"]>("tudo");
  const [soPrimeira, setSoPrimeira] = useState(true);
  const [validoAte, setValidoAte] = useState("");
  const [maxUsos, setMaxUsos] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await criar({
        data: {
          codigo,
          tipo,
          valor: Number(valor.replace(",", ".")),
          aplicaEm,
          soPrimeira,
          // Fim do dia no Brasil: "até 30/11" vale o dia 30 inteiro.
          validoAte: validoAte ? `${validoAte}T23:59:59-03:00` : null,
          maxUsos: maxUsos ? Number(maxUsos) : null,
        },
      });
      await qc.invalidateQueries({ queryKey: ["plataforma", "cupons"] });
      toast.success("Cupom criado.");
      setCodigo("");
      setValor("");
      setValidoAte("");
      setMaxUsos("");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível criar o cupom.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Ticket className="h-4 w-4" /> Cupons
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        O consultório digita o cupom na tela de Plano. O uso só conta quando o pagamento é
        confirmado. O Asaas não cobra menos de R$ 5,00, então nenhum desconto passa disso.
      </p>

      <form className="surface-card mt-3 grid gap-3 p-5 sm:grid-cols-4" onSubmit={enviar}>
        <div>
          <Label htmlFor="cp-codigo">Código</Label>
          <Input
            id="cp-codigo"
            className="mt-1 uppercase"
            placeholder="BEMVINDO"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>Desconto</Label>
          <div className="mt-1 flex gap-2">
            <Select value={tipo} onValueChange={(v) => setTipo(v as "percentual" | "valor")}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentual">%</SelectItem>
                <SelectItem value="valor">R$</SelectItem>
              </SelectContent>
            </Select>
            <Input
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder={tipo === "percentual" ? "20" : "100,00"}
              aria-label="Valor do desconto"
              required
            />
          </div>
        </div>
        <div>
          <Label>Vale para</Label>
          <Select
            value={aplicaEm}
            onValueChange={(v) => setAplicaEm(v as CupomDaPlataforma["aplicaEm"])}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tudo">Assinatura e pacote</SelectItem>
              <SelectItem value="assinatura">Só assinatura</SelectItem>
              <SelectItem value="pacote">Só pacote</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2 pb-2">
          <Switch id="cp-primeira" checked={soPrimeira} onCheckedChange={setSoPrimeira} />
          <Label htmlFor="cp-primeira" className="text-sm font-normal">
            Na assinatura, só a 1ª cobrança
          </Label>
        </div>
        <div>
          <Label htmlFor="cp-validade">Válido até (opcional)</Label>
          <Input
            id="cp-validade"
            type="date"
            className="mt-1"
            value={validoAte}
            onChange={(e) => setValidoAte(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="cp-usos">Máximo de usos (opcional)</Label>
          <Input
            id="cp-usos"
            type="number"
            min={1}
            className="mt-1"
            value={maxUsos}
            onChange={(e) => setMaxUsos(e.target.value)}
          />
        </div>
        <div className="flex items-end sm:col-span-2">
          <Button type="submit" variant="premium" disabled={salvando}>
            Criar cupom
          </Button>
        </div>
      </form>

      {!!cupons.data?.length && (
        <ul className="mt-3 space-y-2">
          {cupons.data.map((c) => (
            <li
              key={c.codigo}
              className="surface-card flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
            >
              <span className="min-w-0">
                <span className="font-mono font-medium">{c.codigo}</span>
                <span className="text-muted-foreground"> · {resumo(c)}</span>
              </span>
              <label className="flex items-center gap-2 text-muted-foreground">
                {c.ativo ? "Ativo" : "Desligado"}
                <Switch
                  checked={c.ativo}
                  onCheckedChange={async (ativo) => {
                    await ligar({ data: { codigo: c.codigo, ativo } });
                    await qc.invalidateQueries({ queryKey: ["plataforma", "cupons"] });
                  }}
                  aria-label={`Ligar o cupom ${c.codigo}`}
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
