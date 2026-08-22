import { useQueries, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ETAPAS_DO_CLIENTE,
  POR_COLUNA,
  getColunaDoFunil,
  getContagemDoFunil,
  type ClienteNoFunil,
  type EtapaDoCliente,
} from "@/lib/atendimentos/funis.functions";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContatoSelecionado } from "@/components/atendimentos/contacts/ContactsTab";
import {
  quantosPodemReceber,
  useDisparoDeColuna,
} from "@/components/atendimentos/pipeline/useDisparoDeColuna";

// O quadro de Clientes.
//
// Sem arrastar, de propósito: a coluna é calculada a partir de orçamento,
// tratamento e última consulta. Um funil que depende de alguém lembrar de mover
// o card envelhece parado — este não tem como.

const ETAPA: Record<EtapaDoCliente, { titulo: string; cor: string; explica: string }> = {
  novo: {
    titulo: "Novo",
    cor: "#8B5CF6",
    explica: "Ainda sem consulta concluída",
  },
  orcamento_aberto: {
    titulo: "Orçamento aberto",
    cor: "#F59E0B",
    explica: "Apresentado e ainda sem resposta",
  },
  tratamento_parado: {
    titulo: "Tratamento parado",
    cor: "#EF4444",
    explica: "Aprovado, mas sem consulta há mais de 60 dias",
  },
  em_tratamento: {
    titulo: "Em tratamento",
    cor: "#0EA5E9",
    explica: "Aprovado e em andamento",
  },
  inativo: {
    titulo: "Inativo",
    cor: "#94A3B8",
    explica: "Sem consulta há mais de 6 meses",
  },
  manutencao: {
    titulo: "Manutenção",
    cor: "#22C55E",
    explica: "Em dia, sem pendência",
  },
};

function quando(iso: string | null): string {
  if (!iso) return "sem consulta";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function Card({ cliente }: { cliente: ClienteNoFunil }) {
  return (
    <Link
      to="/pacientes/$patientId"
      params={{ patientId: cliente.patientId }}
      className="press surface-card block px-3 py-2.5 transition-colors hover:border-coral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <p className="truncate text-sm font-semibold text-foreground">{cliente.name}</p>
      <p className="mt-0.5 truncate text-2xs text-muted-foreground">
        Última consulta: {quando(cliente.ultimaConsulta)}
      </p>
    </Link>
  );
}

/** Cliente do funil no formato que o disparo entende.
 *
 *  Paciente sem `crm_contact_id` entra como origem "paciente": ele existe aqui
 *  mas ainda não no CRM, e `prepararAlvos` cria o contato lá na hora do envio. */
function paraContato(c: ClienteNoFunil): ContatoSelecionado {
  return {
    id: c.crmContactId ?? c.patientId,
    name: c.name,
    phone: c.phone,
    origem: c.crmContactId ? "crm" : "paciente",
    patientId: c.patientId,
    conversationId: null,
  };
}

function Coluna({
  stage,
  total,
  busca,
  onDisparar,
}: {
  stage: EtapaDoCliente;
  total: number;
  busca: string;
  onDisparar: (contatos: ContatoSelecionado[]) => void;
}) {
  const buscarColuna = useServerFn(getColunaDoFunil);
  const [paginas, setPaginas] = useState(1);
  const meta = ETAPA[stage];

  // Uma consulta por página já carregada: assim "ver mais" ACRESCENTA em vez de
  // refazer tudo, e voltar para a tela não recomeça da primeira página.
  const consultas = useQueries({
    queries: Array.from({ length: paginas }, (_, i) => ({
      queryKey: ["funil-clientes", stage, busca, i],
      queryFn: () =>
        buscarColuna({ data: { stage, q: busca || undefined, offset: i * POR_COLUNA } }),
      staleTime: 30_000,
    })),
  });

  const clientes = consultas.flatMap((c) => c.data ?? []);
  const carregando = consultas.some((c) => c.isLoading);
  // Com busca ativa o total da coluna é o que se achou, não o total da base —
  // mostrar 148 num quadro com 3 cards na tela seria mentira.
  const rotuloTotal = busca ? clientes.length : total;
  const temMais = !busca && clientes.length < total;
  const podemReceber = quantosPodemReceber(clientes.map(paraContato));

  return (
    <div className="flex w-[280px] shrink-0 flex-col">
      <div className="flex items-center gap-2 px-1 pb-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.cor }} />
        <h3 className="truncate text-sm font-semibold">{meta.titulo}</h3>
        <span className="ml-auto text-xs font-semibold text-muted-foreground">{rotuloTotal}</span>
      </div>
      <p className="px-1 pb-2 text-3xs leading-snug text-muted-foreground">{meta.explica}</p>

      {/* O botão dispara para o que ESTÁ carregado na coluna, e o número diz
          exatamente isso — prometer o total da coluna e mandar só a primeira
          página seria pior do que não ter o botão. */}
      {podemReceber > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="mb-2 h-8 w-full gap-1.5 text-2xs"
          onClick={() => onDisparar(clientes.map(paraContato))}
        >
          <Send className="h-3 w-3" />
          Disparar para {podemReceber}
        </Button>
      )}

      <div className="custom-scroll flex-1 space-y-2 overflow-y-auto overflow-x-hidden rounded-2xl bg-surface-subtle p-2">
        {carregando && !clientes.length ? (
          <p className="py-6 text-center text-2xs text-muted-foreground">Carregando…</p>
        ) : !clientes.length ? (
          <p className="py-6 text-center text-2xs text-muted-foreground">Vazio</p>
        ) : (
          <>
            {clientes.map((c) => (
              <Card key={c.patientId} cliente={c} />
            ))}
            {temMais && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setPaginas((n) => n + 1)}
              >
                Ver mais {Math.min(POR_COLUNA, total - clientes.length)}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function QuadroDeClientes({ busca }: { busca: string }) {
  const { abrir, dialogo } = useDisparoDeColuna();
  const buscarContagem = useServerFn(getContagemDoFunil);
  const contagem = useQuery({
    queryKey: ["funil-clientes", "contagem"],
    queryFn: () => buscarContagem(),
    staleTime: 60_000,
  });

  if (contagem.data?.indisponivel) {
    return (
      <section className="surface-card mt-4 p-5">
        <p className="text-sm font-medium text-foreground">Funil de clientes ainda não ativado</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Falta aplicar as migrations pendentes no Lovable — é a migration que cria o cálculo
          das etapas.
        </p>
      </section>
    );
  }

  return (
    <>
      <div className="custom-scroll mt-4 flex flex-1 gap-3 overflow-x-auto pb-2">
        {ETAPAS_DO_CLIENTE.map((stage) => (
          <Coluna
            key={stage}
            stage={stage}
            total={contagem.data?.contagem[stage] ?? 0}
            busca={busca}
            onDisparar={abrir}
          />
        ))}
      </div>
      {dialogo}
    </>
  );
}
