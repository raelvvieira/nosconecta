// O que o plano do consultório liga no site. A regra é a mesma das Edge
// Functions: vem de `supabase/functions/_shared/plano-do-consultorio.ts`,
// importada daqui para não existir uma segunda versão.
import type { RecursosDoConsultorio } from "@/lib/auth/niveis-de-acesso";
import {
  consultorioParado,
  semIaPorque,
  testeVencido,
  type FichaDoPlano,
} from "../../../supabase/functions/_shared/plano-do-consultorio";

export { consultorioParado, semIaPorque, testeVencido, type FichaDoPlano };

export interface FichaDoSite extends FichaDoPlano {
  club_ligado: boolean | null;
}

/** Sem ficha (consultório de antes das fichas), tudo continua ligado: não se
 *  tira nada de ninguém por falta de cadastro. */
export function recursosDaFicha(ficha: FichaDoSite | null, agora: Date): RecursosDoConsultorio {
  if (!ficha) return { ia: true, club: true };
  return { ia: semIaPorque(ficha, agora) === null, club: !!ficha.club_ligado };
}

/** A ficha de quem está logado, pela própria sessão (a regra de leitura de
 *  `clinicas` deixa cada consultório ler a sua). `null` se não há ou falhou. */
export async function lerFichaDoSite(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela nova, fora do types.ts do Lovable
  supabase: any,
  ownerId: string,
): Promise<FichaDoSite | null> {
  const { data, error } = await supabase
    .from("clinicas")
    .select("plano, situacao, teste_ate, club_ligado")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) return null;
  return (data as FichaDoSite | null) ?? null;
}
