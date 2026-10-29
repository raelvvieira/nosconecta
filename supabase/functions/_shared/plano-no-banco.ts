// O plano do consultório, lido e gravado no banco. As regras moram em
// `plano-do-consultorio.ts`; aqui só a leitura, a baixa do saldo extra e o
// aviso.
import {
  avisoDaFranquia,
  cabeNaFranquia,
  comecoDoMesDoBrasil,
  mesDoBrasil,
  semIaPorque,
  textoDoAviso,
  type FichaDoPlano,
} from "./plano-do-consultorio.ts";
import { pushToOwner } from "./push.ts";

interface FichaCompleta extends FichaDoPlano {
  franquia_conversas_mes: number;
  conversas_extras: number;
  aviso_franquia_mes: string | null;
  aviso_franquia_nivel: number | null;
}

/**
 * A ficha, ou `null` quando não há (ou quando a leitura falha).
 *
 * Falhar aberto é de propósito: um erro de leitura aqui não pode calar a
 * assistente da NÓS no meio de uma conversa. Quem barra consultório sem
 * plano é a ficha existir e dizer que não pode.
 */
export async function lerFicha(supabase: any, ownerId: string): Promise<FichaCompleta | null> {
  const { data, error } = await supabase
    .from("clinicas")
    .select(
      "plano, situacao, teste_ate, pago_ate, franquia_conversas_mes, conversas_extras, aviso_franquia_mes, aviso_franquia_nivel",
    )
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) {
    console.warn("[plano] ficha não lida:", error.message);
    return null;
  }
  return (data as FichaCompleta | null) ?? null;
}

/** Para as rotinas (retomada, lições, relatório): só plano e situação.
 *  `null` = pode; senão, o motivo. */
export async function semIaNoConsultorio(
  supabase: any,
  ownerId: string,
  agora: Date,
): Promise<string | null> {
  return semIaPorque(await lerFicha(supabase, ownerId), agora);
}

/**
 * A assistente pode responder nesta conversa agora?
 *
 * Plano e situação primeiro; depois a franquia, que só pesa para conversa
 * que ainda não foi contada no mês. Quando a conversa entra pelo saldo extra,
 * a baixa de uma unidade acontece aqui, com trava: duas conversas ao mesmo
 * tempo não gastam o mesmo saldo.
 */
export async function podeAtender(
  supabase: any,
  ownerId: string,
  sessaoId: string,
  agora: Date,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const ficha = await lerFicha(supabase, ownerId);
  const semIa = semIaPorque(ficha, agora);
  if (semIa) return { ok: false, motivo: semIa };
  if (!ficha) return { ok: true };

  const desde = comecoDoMesDoBrasil(agora).toISOString();
  const { data: jaRespondida } = await supabase
    .from("ai_agent_messages")
    .select("id")
    .eq("session_id", sessaoId)
    .eq("direction", "saida")
    .gte("created_at", desde)
    .limit(1);
  const jaContada = (jaRespondida ?? []).length > 0;
  if (jaContada) return { ok: true };

  const { data: contagem, error } = await supabase.rpc("conversas_do_mes", {
    _owner: ownerId,
    _desde: desde,
  });
  if (error) {
    console.warn("[plano] contagem do mês falhou:", error.message);
    return { ok: true };
  }
  const conversasNoMes = Number(contagem ?? 0);
  const franquia = Number(ficha.franquia_conversas_mes ?? 0);
  let extras = Number(ficha.conversas_extras ?? 0);

  let caso = cabeNaFranquia({ jaContada, conversasNoMes, franquia, extras });
  if (caso === "usa_extra") {
    const { data: baixa } = await supabase
      .from("clinicas")
      .update({ conversas_extras: extras - 1, atualizado_em: agora.toISOString() })
      .eq("owner_id", ownerId)
      .eq("conversas_extras", extras)
      .select("conversas_extras");
    if ((baixa ?? []).length) extras -= 1;
    else caso = "estourou";
  }

  await talvezAvisar(supabase, ownerId, ficha, {
    usadas: caso === "estourou" ? conversasNoMes : conversasNoMes + 1,
    franquia,
    extras,
    agora,
  });

  return caso === "estourou" ? { ok: false, motivo: "franquia do mês" } : { ok: true };
}

async function talvezAvisar(
  supabase: any,
  ownerId: string,
  ficha: FichaCompleta,
  e: { usadas: number; franquia: number; extras: number; agora: Date },
): Promise<void> {
  const mes = mesDoBrasil(e.agora);
  const jaAvisado = ficha.aviso_franquia_mes === mes ? Number(ficha.aviso_franquia_nivel ?? 0) : 0;
  const nivel = avisoDaFranquia({
    usadas: e.usadas,
    franquia: e.franquia,
    extras: e.extras,
    jaAvisado,
  });
  if (!nivel) return;

  // Marca antes de avisar, com trava: só quem conseguiu marcar avisa. Duas
  // conversas cruzando a linha juntas mandam um aviso só.
  const { data: marcou } = await supabase
    .from("clinicas")
    .update({ aviso_franquia_mes: mes, aviso_franquia_nivel: nivel })
    .eq("owner_id", ownerId)
    .or(`aviso_franquia_mes.is.null,aviso_franquia_mes.neq.${mes},aviso_franquia_nivel.lt.${nivel}`)
    .select("owner_id");
  if (!(marcou ?? []).length) return;

  try {
    await pushToOwner(
      supabase,
      ownerId,
      "luna_franquia",
      { ...textoDoAviso(nivel, e.franquia), url: "/agente-ia" },
      {},
    );
  } catch (erro) {
    console.warn("[plano] aviso da franquia falhou:", erro);
  }
}
