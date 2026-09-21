import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCrmContacts, type CrmContact } from "./contacts.functions";

export interface EstadoContatosIncremental {
  contatos: CrmContact[];
  total: number;
  /** Bateu num teto antes de acabar a base. Hoje nunca: a leitura é local e
   *  vai até o fim. Continua no tipo porque a tela mostra o aviso. */
  truncado: boolean;
  carregando: boolean;
  /** Progresso parcial. Hoje sempre `null` — não há mais etapas para mostrar. */
  progresso: { feitas: number; totalPaginas: number } | null;
  erro: string | null;
}

/**
 * A base de contatos da tela de disparo.
 *
 * ── O que este arquivo já foi ───────────────────────────────────────────
 *
 * Cento e oitenta linhas de paginação: seis páginas do CRM pedidas ao mesmo
 * tempo, um `Set` de vistos para o caso de um contato mudar de página no meio
 * da leitura (o CRM reordenava por atividade, e disparar é o que mexe nessa
 * ordem), um teto de cinquenta páginas, e a diferença entre "acabou a base" e
 * "acabou a paciência" tendo de ser adivinhada pelo tamanho da última página.
 *
 * Nada disso existe mais. A base vem do nosso banco numa consulta, então o
 * hook virou o que ele sempre quis ser: os contatos, ou o erro.
 *
 * O formato de saída ficou igual de propósito — a tela lê `carregando`,
 * `progresso` e `truncado`, e trocar a base de lugar já é mudança bastante
 * para uma vez só.
 */
export function useContatosIncremental(ativo: boolean): EstadoContatosIncremental {
  const buscar = useServerFn(getCrmContacts);

  const consulta = useQuery({
    queryKey: ["base-de-contatos"],
    queryFn: () => buscar(),
    enabled: ativo,
    staleTime: 60_000,
  });

  return {
    contatos: consulta.data?.contacts ?? [],
    total: consulta.data?.total ?? 0,
    truncado: false,
    carregando: consulta.isFetching,
    progresso: null,
    erro: consulta.error ? (consulta.error as Error).message : null,
  };
}
