import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCrmContactsPage, type CrmContact } from "./contacts.functions";

const PAGE_SIZE = 100;
const MAX_PAGES = 50;
// Pedir várias páginas ao mesmo tempo, e não uma atrás da outra, é o que faz
// uma base de milhares de contatos carregar em segundos em vez de dezenas de
// idas e vindas sequenciais.
const CONCORRENCIA = 6;

export interface EstadoContatosIncremental {
  contatos: CrmContact[];
  total: number;
  /** Bateu no teto de páginas antes de acabar a base — a lista não é a base inteira. */
  truncado: boolean;
  /** Ainda tem página em andamento. Os contatos já carregados continuam
   *  disponíveis e filtráveis enquanto isso — não é um bloqueio de tela cheia. */
  carregando: boolean;
  progresso: { feitas: number; totalPaginas: number } | null;
  /** Erro numa página seguinte não apaga o que já carregou — só para de pedir mais. */
  erro: string | null;
}

const ESTADO_INICIAL: EstadoContatosIncremental = {
  contatos: [],
  total: 0,
  truncado: false,
  carregando: false,
  progresso: null,
  erro: null,
};

/**
 * Carrega a base de contatos do CRM aos pedaços, mostrando o que já chegou.
 *
 * Antes, uma única chamada de servidor buscava a base inteira — página por
 * página, uma esperando a outra — antes de devolver qualquer coisa pro
 * front. Numa base de ~4.500 contatos (45 páginas) isso deixava a tela presa
 * em "carregando" por bem mais que "alguns segundos". Aqui a primeira página
 * chega em 1-2s e já é mostrada; o resto entra por trás em lotes paralelos
 * enquanto a pessoa já está vendo, buscando e filtrando por DDD.
 */
export function useContatosIncremental(ativo: boolean): EstadoContatosIncremental {
  const fetchPage = useServerFn(getCrmContactsPage);
  const [estado, setEstado] = useState<EstadoContatosIncremental>(ESTADO_INICIAL);

  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;
    setEstado(ESTADO_INICIAL);

    (async () => {
      setEstado((e) => ({ ...e, carregando: true }));
      try {
        const primeira = await fetchPage({ data: { page: 1 } });
        if (cancelado) return;

        const total = primeira.total;
        let contatos = primeira.contacts;

        if (primeira.contacts.length === 0) {
          setEstado({ contatos, total, truncado: false, carregando: false, progresso: null, erro: null });
          return;
        }

        let totalPaginas = Math.min(Math.ceil(total / PAGE_SIZE) || 1, MAX_PAGES);
        // O total do `meta` já é tratado como confiável noutro ponto do
        // sistema (estimativa de campanha lê só ele). Mas se vier ausente ou
        // menor que uma página já cheia, não dá pra confiar nele pra decidir
        // quando parar — melhor paginar até achar o fim do que truncar por engano.
        if (primeira.contacts.length >= PAGE_SIZE && totalPaginas <= 1) totalPaginas = MAX_PAGES;
        const truncadoPeloTeto = totalPaginas === MAX_PAGES;

        if (primeira.contacts.length < PAGE_SIZE || totalPaginas <= 1) {
          setEstado({ contatos, total, truncado: false, carregando: false, progresso: null, erro: null });
          return;
        }

        setEstado({ contatos, total, truncado: truncadoPeloTeto, carregando: true, progresso: { feitas: 1, totalPaginas }, erro: null });

        const pendentes: number[] = [];
        for (let p = 2; p <= totalPaginas; p++) pendentes.push(p);
        let feitas = 1;

        while (pendentes.length > 0 && !cancelado) {
          const lote = pendentes.splice(0, CONCORRENCIA);
          const respostas = await Promise.all(lote.map((p) => fetchPage({ data: { page: p } })));
          if (cancelado) return;

          let algumaVazia = false;
          for (const r of respostas) {
            contatos = contatos.concat(r.contacts);
            feitas++;
            if (r.contacts.length < PAGE_SIZE) algumaVazia = true;
          }
          const acabou = algumaVazia || pendentes.length === 0;
          setEstado({
            contatos,
            total,
            truncado: truncadoPeloTeto && !acabou ? true : truncadoPeloTeto,
            carregando: !acabou,
            progresso: { feitas, totalPaginas },
            erro: null,
          });
          // Uma página incompleta é o fim real da base, mesmo que o
          // `meta.total` sugerisse mais páginas.
          if (algumaVazia) break;
        }
      } catch (err) {
        if (cancelado) return;
        setEstado((e) => ({ ...e, carregando: false, erro: (err as Error).message }));
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [ativo]);

  return estado;
}
