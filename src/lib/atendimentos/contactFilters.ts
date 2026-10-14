import { ddd } from "./base-de-contatos";
import { variantesDoNumero } from "./phone";

/** O mínimo que qualquer contato precisa ter pra ser buscado/filtrado/selecionado
 *  — genérico pra caber tanto o contato do CRM quanto o de paciente sem CRM. */
export interface ContatoFiltravel {
  id: string;
  name: string;
  phone: string | null;
}

/**
 * O recorte da base: quem sobra depois da busca e das fichas de DDD.
 *
 * Vive separado da tela porque é o cálculo que decide para quem a mensagem vai.
 * Um erro aqui não aparece como tela torta — aparece como alguém de outro
 * estado recebendo um disparo que era do DDD 48.
 */
/**
 * Quem já esteve na agenda, pelo telefone.
 *
 * `naAgenda` vem do servidor já com as DUAS formas de cada número — a ficha do
 * paciente guarda `5551993967887` e o WhatsApp `555193967887`, e comparar
 * literalmente acha 6 das 49 pessoas. Aqui a comparação é só `has`, porque
 * quem resolveu o nono dígito foi `variantesDoNumero`, a mesma função que o
 * resto do sistema usa para casar paciente com conversa.
 *
 * Sem telefone não dá para afirmar que esteve: fica de fora, que é o lado
 * certo de errar — um disparo "só para clientes" com um estranho dentro é pior
 * do que um cliente a menos.
 */
export function esteveNaAgenda(
  phone: string | null | undefined,
  naAgenda: ReadonlySet<string>,
): boolean {
  if (!phone) return false;
  return variantesDoNumero(phone).some((v) => naAgenda.has(v));
}

export function filtrarContatos<T extends ContatoFiltravel>(
  contatos: T[],
  {
    busca,
    ddds,
    naAgenda,
  }: {
    busca: string;
    ddds: Set<string>;
    /** Ligado, mantém só quem já teve horário marcado. Ausente = não filtra. */
    naAgenda?: ReadonlySet<string> | null;
  },
): T[] {
  const q = busca.trim().toLocaleLowerCase("pt-BR");
  const digitos = busca.replace(/\D/g, "");

  return contatos.filter((c) => {
    // Antes do DDD e da busca: é o corte mais barato e o mais restritivo.
    if (naAgenda && !esteveNaAgenda(c.phone, naAgenda)) return false;
    if (ddds.size > 0) {
      const d = ddd(c.phone);
      // Sem DDD reconhecível, fica de fora de qualquer recorte por DDD. Chutar
      // colocaria alguém que não é de lá dentro do disparo.
      if (!d || !ddds.has(d)) return false;
    }
    if (!q) return true;
    if (c.name.toLocaleLowerCase("pt-BR").includes(q)) return true;
    // Número compara só dígitos: quem digita "98419" procura
    // "+55 (48) 98419-5309", que na tela tem parênteses e traço no meio.
    return Boolean(digitos) && (c.phone ?? "").replace(/\D/g, "").includes(digitos);
  });
}

/** Quantos da base já estiveram na agenda — o número que a ficha mostra. */
export function contarNaAgenda(
  contatos: ContatoFiltravel[],
  naAgenda: ReadonlySet<string>,
): number {
  let n = 0;
  for (const c of contatos) if (esteveNaAgenda(c.phone, naAgenda)) n++;
  return n;
}

/** DDDs presentes na base, com quantos cada um tem, do maior para o menor. */
export function contarPorDdd(contatos: ContatoFiltravel[]): [string, number][] {
  const contagem = new Map<string, number>();
  for (const c of contatos) {
    const d = ddd(c.phone);
    if (d) contagem.set(d, (contagem.get(d) ?? 0) + 1);
  }
  return [...contagem.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * Liga/desliga a seleção do recorte visível.
 *
 * Mexe apenas em quem está na tela: trocar o filtro não pode apagar uma seleção
 * feita com o filtro anterior (marcar o DDD 48, depois o 51, tem de somar), nem
 * arrastar junto quem sumiu da lista.
 */
export function alternarSelecaoDoRecorte(
  selecionados: Set<string>,
  recorte: ContatoFiltravel[],
): Set<string> {
  const todosDentro = recorte.length > 0 && recorte.every((c) => selecionados.has(c.id));
  const next = new Set(selecionados);
  for (const c of recorte) {
    if (todosDentro) next.delete(c.id);
    else next.add(c.id);
  }
  return next;
}
