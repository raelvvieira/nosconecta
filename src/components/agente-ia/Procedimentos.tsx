import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  alternarProcedimentoDoAgente,
  getProcedimentosDoAgente,
} from "@/lib/agente-ia/agente.functions";
import { Bloco } from "./campos";

const reais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

/**
 * O que a IA pode citar e precificar.
 *
 * Não é um catálogo novo: é o mesmo `clinic_procedures` da Agenda e do
 * Financeiro, com a marcação do que ela tem permissão de falar. Duas listas de
 * preço divergiriam, e preço errado dito a um paciente é o pior defeito
 * possível aqui.
 *
 * Deixar tudo desligado não quer dizer "nada acontece": quer dizer que ela
 * fica proibida de falar valor e passa toda pergunta de preço adiante.
 */
export function Procedimentos() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(getProcedimentosDoAgente);
  const alternar = useServerFn(alternarProcedimentoDoAgente);

  const query = useQuery({ queryKey: ["agente-ia-procedimentos"], queryFn: () => buscar() });
  const [busca, setBusca] = useState("");
  const [emVoo, setEmVoo] = useState<string | null>(null);

  // `?? []` dentro do render cria um array novo a cada passagem, e o `useMemo`
  // abaixo dependia dele — ou seja, recalculava sempre e não memorizava nada.
  const lista = useMemo(() => query.data ?? [], [query.data]);
  const filtrados = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    if (!q) return lista;
    return lista.filter(
      (p) =>
        p.nome.toLocaleLowerCase("pt-BR").includes(q) ||
        (p.categoria ?? "").toLocaleLowerCase("pt-BR").includes(q),
    );
  }, [lista, busca]);

  const liberados = lista.filter((p) => p.liberado).length;

  const trocar = async (id: string, liberado: boolean) => {
    setEmVoo(id);
    try {
      await alternar({ data: { procedureId: id, liberado } });
      await queryClient.invalidateQueries({ queryKey: ["agente-ia-procedimentos"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setEmVoo(null);
    }
  };

  return (
    <Bloco
      titulo="Preços que ela pode falar"
      descricao="Os procedimentos cujo preço ela pode dizer. Fora da lista, ela passa a pergunta para uma pessoa."
      acao={
        lista.length > 0 ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden shrink-0 rounded-full bg-surface-subtle px-2.5 py-1 text-2xs font-medium tabular-nums text-muted-foreground sm:inline">
              {liberados} de {lista.length}
            </span>
            <div className="relative w-40 shrink-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar"
                className="h-9 pl-9"
              />
            </div>
          </div>
        ) : null
      }
    >
      {query.isPending ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum procedimento cadastrado —{" "}
          <Link to="/configuracoes" className="underline underline-offset-2">
            cadastre em Configurações
          </Link>
          .
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {filtrados.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.nome}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {reais(p.preco)}
                  {p.duracaoMinutos > 0 && ` · ${p.duracaoMinutos} min`}
                  {p.categoria && ` · ${p.categoria}`}
                </p>
              </div>
              {emVoo === p.id ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <Switch
                  checked={p.liberado}
                  onCheckedChange={(v) => void trocar(p.id, v)}
                  aria-label={`Liberar ${p.nome} para o agente`}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </Bloco>
  );
}
