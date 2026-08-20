import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Loader2, MinusCircle } from "lucide-react";
import { getWhatsappInstance } from "@/lib/atendimentos/atendimentos.functions";
import { getAutomationEngineStatus } from "@/lib/atendimentos/automations.functions";
import { cn } from "@/lib/utils";

// O que precisa estar de pé para esta automação funcionar — respondido ANTES
// do teste.
//
// Sem isto, descobrir que o WhatsApp está desconectado ou que a função nunca
// foi publicada só acontecia depois de provocar o gatilho e não receber nada.
// E os dois casos produzem o mesmo sintoma de "não aconteceu nada", o que
// tornava impossível saber qual dos dois era.

type Estado = "ok" | "erro" | "aviso" | "carregando";

function Item({
  estado,
  titulo,
  detalhe,
  acao,
}: {
  estado: Estado;
  titulo: string;
  detalhe?: string | null;
  acao?: React.ReactNode;
}) {
  const Icone =
    estado === "ok" ? CheckCircle2 : estado === "carregando" ? Loader2 : estado === "aviso" ? MinusCircle : AlertCircle;
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5">
      <Icone
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          estado === "ok" && "text-success",
          estado === "erro" && "text-danger",
          estado === "aviso" && "text-warning",
          estado === "carregando" && "animate-spin text-muted-foreground",
        )}
        strokeWidth={2}
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">{titulo}</p>
        {detalhe && <p className="mt-0.5 text-2xs text-muted-foreground">{detalhe}</p>}
      </div>
      {acao}
    </div>
  );
}

const LINK =
  "shrink-0 text-2xs font-semibold text-pink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded";

export function PainelProntidao({ mandaWhatsapp }: { mandaWhatsapp: boolean }) {
  const buscarInstancia = useServerFn(getWhatsappInstance);
  const buscarMotor = useServerFn(getAutomationEngineStatus);

  const instancia = useQuery({
    queryKey: ["whatsapp-instance"],
    queryFn: () => buscarInstancia({}),
    staleTime: 30_000,
    // Só interessa quando o fluxo de fato manda mensagem. Automação que só
    // move etapa ou dispara webhook não depende do WhatsApp.
    enabled: mandaWhatsapp,
  });

  const motor = useQuery({
    queryKey: ["automation-engine"],
    queryFn: () => buscarMotor({}),
    staleTime: 60_000,
  });

  const conectado = instancia.data?.status === "open";

  return (
    <div className="surface-card divide-y divide-border overflow-hidden">
      <p className="px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        Para esta automação funcionar
      </p>

      {mandaWhatsapp && (
        <Item
          estado={instancia.isLoading ? "carregando" : conectado ? "ok" : "erro"}
          titulo={conectado ? "WhatsApp conectado" : "WhatsApp não está conectado"}
          detalhe={
            instancia.isLoading
              ? null
              : conectado
                ? instancia.data?.phoneNumber ?? null
                : "Sem um número conectado, a mensagem não tem por onde sair."
          }
          acao={
            !instancia.isLoading && !conectado ? (
              <Link to="/atendimentos" className={LINK}>
                Conectar
              </Link>
            ) : null
          }
        />
      )}

      <Item
        estado={
          motor.isLoading
            ? "carregando"
            : motor.data?.estado === "ok"
              ? "ok"
              : motor.data?.estado === "indeterminado"
                ? "aviso"
                : "erro"
        }
        titulo={
          motor.isLoading
            ? "Verificando o motor de automações…"
            : motor.data?.estado === "ok"
              ? "Motor de automações publicado"
              : motor.data?.estado === "ausente"
                ? "Motor de automações não publicado"
                : motor.data?.estado === "desatualizado"
                  ? "Motor de automações desatualizado"
                  : "Não deu para verificar o motor"
        }
        detalhe={
          motor.isLoading
            ? null
            : motor.data?.estado === "ok"
              ? null
              : // A frase diz o que fazer, não só o que está errado: este é um
                // passo manual no Lovable, e sem nomeá-lo a pessoa fica sem saída.
                (motor.data?.detalhe ?? null) +
                  (motor.data?.estado === "ausente" || motor.data?.estado === "desatualizado"
                    ? ' Publique com "Deploy the atendimento-automations edge function" no Lovable.'
                    : "")
        }
      />
    </div>
  );
}
