import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Send } from "lucide-react";
import {
  POR_COLUNA,
  getFunilDeClientes,
  type ClienteNoFunil,
} from "@/lib/atendimentos/funis.functions";
import type { RegraDeFunil } from "@/lib/atendimentos/funnelRules";
import { Button } from "@/components/ui/button";
import type { ContatoSelecionado } from "@/components/atendimentos/contacts/ContactsTab";
import {
  quantosPodemReceber,
  useDisparoDeColuna,
} from "@/components/atendimentos/pipeline/useDisparoDeColuna";

// O quadro de Clientes.
//
// Sem arrastar, de propósito: a coluna é calculada. As colunas em si vêm das
// REGRAS da clínica, não de uma lista fixa aqui — é a mesma configuração que a
// tela de edição do funil grava, então o quadro nunca discorda dela.

function quando(iso: string | null): string {
  if (!iso) return "sem consulta";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Paciente sem `crm_contact_id` entra como origem "paciente": existe aqui mas
 *  ainda não no CRM, e `prepararAlvos` cria o contato lá na hora do envio. */
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

function Coluna({
  regra,
  clientes,
  onDisparar,
}: {
  regra: RegraDeFunil;
  clientes: ClienteNoFunil[];
  onDisparar: (contatos: ContatoSelecionado[]) => void;
}) {
  const [paginas, setPaginas] = useState(1);
  const visiveis = clientes.slice(0, paginas * POR_COLUNA);
  const podemReceber = quantosPodemReceber(clientes.map(paraContato));

  return (
    <div className="flex w-[280px] shrink-0 flex-col">
      <div className="flex items-center gap-2 px-1 pb-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: regra.cor }} />
        <h3 className="truncate text-sm font-semibold">{regra.nome}</h3>
        <span className="ml-auto text-xs font-semibold text-muted-foreground">
          {clientes.length}
        </span>
      </div>
      <p className="px-1 pb-2 text-3xs leading-snug text-muted-foreground">{regra.explica}</p>

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
        {!clientes.length ? (
          <p className="py-6 text-center text-2xs text-muted-foreground">Vazio</p>
        ) : (
          <>
            {visiveis.map((c) => (
              <Card key={c.patientId} cliente={c} />
            ))}
            {/* Paginação só de PINTURA: os cards já estão todos em mãos, e
                desenhar centenas de uma vez é o que trava a rolagem. */}
            {visiveis.length < clientes.length && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setPaginas((n) => n + 1)}
              >
                Ver mais {Math.min(POR_COLUNA, clientes.length - visiveis.length)}
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
  const buscarFunil = useServerFn(getFunilDeClientes);

  const funil = useQuery({
    queryKey: ["funil-clientes"],
    queryFn: () => buscarFunil(),
    staleTime: 60_000,
  });

  const porEtapa = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const mapa = new Map<string, ClienteNoFunil[]>();
    for (const c of funil.data?.clientes ?? []) {
      if (termo && !c.name.toLowerCase().includes(termo) && !(c.phone ?? "").includes(termo)) {
        continue;
      }
      mapa.set(c.stage, [...(mapa.get(c.stage) ?? []), c]);
    }
    return mapa;
  }, [funil.data, busca]);

  if (funil.data?.indisponivel) {
    return (
      <section className="surface-card mt-4 p-5">
        <p className="text-sm font-medium text-foreground">Funil de clientes ainda não ativado</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Falta aplicar as migrations pendentes no Lovable — é a migration que cria os sinais
          que as regras leem.
        </p>
      </section>
    );
  }

  if (funil.isLoading) {
    return <p className="mt-4 text-sm text-muted-foreground">Carregando clientes…</p>;
  }

  return (
    <>
      <div className="custom-scroll mt-4 flex flex-1 gap-3 overflow-x-auto pb-2">
        {(funil.data?.regras ?? [])
          .filter((r) => r.ativa)
          .map((regra) => (
            <Coluna
              key={regra.id}
              regra={regra}
              clientes={porEtapa.get(regra.id) ?? []}
              onDisparar={abrir}
            />
          ))}
      </div>
      {dialogo}
    </>
  );
}
