// A Inteligência do Lead: lê as conversas que mudaram e grava em que ponto
// cada uma está, quanto vale e a nota. As regras moram em
// `_shared/inteligencia-do-lead.ts`; aqui só o banco e o modelo.
//
// ── O que roda aqui ─────────────────────────────────────────────────────
//
// De 10 em 10 minutos: as pessoas que mandaram ou receberam mensagem desde a
// última leitura e já estão quietas há alguns minutos. Ler no meio de uma
// troca de mensagens daria uma leitura que muda na mensagem seguinte.
//
// Na primeira vez, as conversas dos últimos 30 dias vão sendo lidas aos
// poucos, `POR_RODADA` por vez, das mais recentes para as mais antigas.
//
// ── O que NÃO acontece aqui ─────────────────────────────────────────────
//
// Nenhuma mensagem é enviada e nada muda na agenda.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chamarModelo } from "../_shared/modelo-de-atendimento.ts";
import { anotarConsumo } from "../_shared/consumo-da-ia.ts";
import { soOSistema } from "../_shared/so-o-sistema.ts";
import { semIaNoConsultorio } from "../_shared/plano-no-banco.ts";
import {
  catalogoDeProcedimentos,
  foneCanonico,
  FORMATO_DA_LEITURA_DO_LEAD,
  instrucaoDaLeitura,
  leituraConferida,
  leituraGuardada,
  notaDoLead,
  perguntaDaLeitura,
  ritmoDaConversa,
  transcricaoNumerada,
  type MensagemDaConversa,
} from "../_shared/inteligencia-do-lead.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Pessoas lidas por rodada, por consultório. Cada uma é uma chamada curta ao
 *  modelo; o que sobrar fica para os próximos 10 minutos. */
const POR_RODADA = 15;
/** Só lê depois de a conversa ficar quieta este tanto. */
const MINUTOS_QUIETA = 5;
/** Conversa mais velha que isto não entra na primeira leitura. */
const DIAS_PARA_TRAS = 30;
/** As últimas mensagens. Com a leitura anterior junto, o começo não se perde. */
const MENSAGENS_LIDAS = 50;

interface Pessoa {
  fone: string;
  crmContactId: string;
  conversas: string[];
  ultima: string;
}

async function lerClinica(agente: {
  owner_id: string;
  api_key: string | null;
  model: string | null;
}) {
  const ownerId = agente.owner_id;
  const agora = Date.now();

  // ── Quem tem coisa nova ─────────────────────────────────────────────
  const { data: conversas, error } = await supabase
    .from("wa_conversations")
    .select("crm_conversation_id, crm_contact_id, last_message_at")
    .eq("owner_id", ownerId)
    .not("crm_conversation_id", "like", "%@g.us")
    .gte("last_message_at", new Date(agora - DIAS_PARA_TRAS * 86_400_000).toISOString())
    .lte("last_message_at", new Date(agora - MINUTOS_QUIETA * 60_000).toISOString())
    .order("last_message_at", { ascending: false })
    .limit(1000);
  if (error) return { ownerId, erro: error.message };
  if (!conversas?.length) return { ownerId, lidas: 0 };

  const idsDeContato = [...new Set(conversas.map((c) => String(c.crm_contact_id ?? "")))].filter(
    (id) => id && !id.endsWith("@lid") && !id.endsWith("@g.us"),
  );
  const telefones = new Map<string, string>();
  for (let i = 0; i < idsDeContato.length; i += 200) {
    const { data } = await supabase
      .from("wa_contacts")
      .select("crm_contact_id, phone_e164, phone_raw")
      .eq("owner_id", ownerId)
      .in("crm_contact_id", idsDeContato.slice(i, i + 200));
    for (const c of data ?? []) {
      const fone = foneCanonico(c.phone_e164 ?? c.phone_raw);
      if (fone) telefones.set(String(c.crm_contact_id), fone);
    }
  }

  // Uma pessoa pode ter mais de uma conversa (a herdada do CRM e a da conexão
  // própria): lidas juntas.
  const pessoas = new Map<string, Pessoa>();
  for (const c of conversas) {
    const fone = telefones.get(String(c.crm_contact_id ?? ""));
    if (!fone) continue;
    const p = pessoas.get(fone);
    if (p) {
      p.conversas.push(String(c.crm_conversation_id));
      if (c.last_message_at > p.ultima) p.ultima = c.last_message_at;
    } else {
      pessoas.set(fone, {
        fone,
        crmContactId: String(c.crm_contact_id),
        conversas: [String(c.crm_conversation_id)],
        ultima: String(c.last_message_at),
      });
    }
  }

  const fones = [...pessoas.keys()];
  const lidas = new Map<
    string,
    { lido_ate: string | null; leitura: unknown; etapa: string; nota: number | null }
  >();
  for (let i = 0; i < fones.length; i += 200) {
    const { data, error: erroLidas } = await supabase
      .from("lead_inteligencia")
      .select("fone, lido_ate, leitura, etapa, nota")
      .eq("owner_id", ownerId)
      .in("fone", fones.slice(i, i + 200));
    if (erroLidas) return { ownerId, erro: erroLidas.message };
    for (const l of data ?? []) lidas.set(String(l.fone), l);
  }

  const pendentes = [...pessoas.values()]
    .filter((p) => {
      const l = lidas.get(p.fone);
      return !l?.lido_ate || new Date(p.ultima).getTime() > new Date(l.lido_ate).getTime();
    })
    .sort((a, b) => (a.ultima < b.ultima ? 1 : -1))
    .slice(0, POR_RODADA);
  if (!pendentes.length) return { ownerId, lidas: 0 };

  // ── O que a instrução precisa saber da clínica ──────────────────────
  const [{ data: ficha }, { data: procs }, { data: unidades }] = await Promise.all([
    supabase.from("clinicas").select("nome").eq("owner_id", ownerId).maybeSingle(),
    supabase
      .from("clinic_procedures")
      .select("id, name, price, price_from")
      .eq("owner_id", ownerId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("clinic_units")
      .select("name, address")
      .eq("owner_id", ownerId)
      .eq("active", true),
  ]);
  const catalogo = catalogoDeProcedimentos(
    (procs ?? []).map((p) => ({
      id: String(p.id),
      nome: String(p.name ?? ""),
      preco: p.price === null ? null : Number(p.price),
      aPartirDe: !!p.price_from,
    })),
  );
  const instrucao = instrucaoDaLeitura({
    clinica: String(ficha?.nome ?? "a clínica"),
    ondeAtende: (unidades ?? []).map((u) =>
      [u.name, u.address].filter((x) => String(x ?? "").trim()).join(" — "),
    ),
    catalogo,
  });

  let gravadas = 0;
  for (const p of pendentes) {
    const { data: linhas, error: erroMsgs } = await supabase
      .from("wa_messages")
      .select("id, from_me, body, is_private, sent_at")
      .eq("owner_id", ownerId)
      .in("crm_conversation_id", p.conversas)
      .order("sent_at", { ascending: false })
      .limit(MENSAGENS_LIDAS);
    if (erroMsgs) {
      console.warn(`[lead] mensagens de ${p.crmContactId}:`, erroMsgs.message);
      continue;
    }
    const msgs: MensagemDaConversa[] = [...(linhas ?? [])]
      .reverse()
      .filter((m) => !m.is_private && String(m.body ?? "").trim())
      .map((m) => ({
        id: String(m.id),
        daClinica: !!m.from_me,
        texto: String(m.body).trim(),
        em: String(m.sent_at ?? ""),
      }));

    const antes = lidas.get(p.fone);
    const anterior = leituraGuardada(antes?.leitura);

    // Sem nada da pessoa (só disparo, só figurinha) não há o que ler: marca
    // como vista para não voltar a cada 10 minutos.
    if (!msgs.some((m) => !m.daClinica)) {
      await supabase.from("lead_inteligencia").upsert(
        {
          owner_id: ownerId,
          fone: p.fone,
          crm_contact_id: p.crmContactId,
          conversation_id: p.conversas[0],
          lido_ate: p.ultima,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "owner_id,fone" },
      );
      continue;
    }

    let texto: string;
    try {
      texto = await chamarModelo({
        chave: agente.api_key,
        modelo: agente.model,
        instrucao,
        pergunta: perguntaDaLeitura(anterior, transcricaoNumerada(msgs)),
        maxTokens: 700,
        formato: FORMATO_DA_LEITURA_DO_LEAD,
        nomeDoFormato: "leitura_do_lead",
        anotarUso: (uso) => void anotarConsumo(supabase, ownerId, "lead", uso),
      });
    } catch (e) {
      // Chave vencida ou modelo fora do ar: para este consultório agora e
      // tenta de novo daqui a 10 minutos.
      console.error(`[lead] modelo falhou em ${ownerId}:`, e instanceof Error ? e.message : e);
      break;
    }

    let bruto: unknown;
    try {
      bruto = JSON.parse(texto);
    } catch {
      console.warn(`[lead] resposta ilegível para ${p.crmContactId}`);
      continue;
    }

    const leitura = leituraConferida(bruto, msgs, catalogo, anterior);
    const ritmo = ritmoDaConversa(msgs);
    const nota = notaDoLead(leitura, ritmo, null).total;

    const { error: erroGravar } = await supabase.from("lead_inteligencia").upsert(
      {
        owner_id: ownerId,
        fone: p.fone,
        crm_contact_id: p.crmContactId,
        conversation_id: p.conversas[0],
        etapa: leitura.etapa,
        nota,
        valor: leitura.valor,
        procedimento_id: leitura.procedimentoId,
        leitura,
        ritmo,
        lido_ate: p.ultima,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "owner_id,fone" },
    );
    if (erroGravar) {
      console.error(`[lead] não gravou ${p.crmContactId}:`, erroGravar.message);
      continue;
    }
    if (!antes || antes.etapa !== leitura.etapa || antes.nota !== nota) {
      await supabase.from("lead_inteligencia_historico").insert({
        owner_id: ownerId,
        fone: p.fone,
        etapa: leitura.etapa,
        nota,
        valor: leitura.valor,
      });
    }
    gravadas++;
  }

  return { ownerId, lidas: gravadas, faltam: Math.max(0, pessoas.size - lidas.size - gravadas) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const barrado = soOSistema(req);
  if (barrado) return barrado;
  try {
    const { data: agentes, error } = await supabase
      .from("ai_agents")
      .select("owner_id, api_key, model");
    if (error) throw new Error(error.message);

    const resultado = [];
    for (const a of agentes ?? []) {
      // Um consultório não derruba os outros.
      try {
        const semIa = await semIaNoConsultorio(supabase, a.owner_id, new Date());
        resultado.push(semIa ? { ownerId: a.owner_id, motivo: semIa } : await lerClinica(a));
      } catch (e) {
        console.error(`[inteligencia-do-lead] falhou em ${a.owner_id}:`, e);
        resultado.push({ ownerId: a.owner_id, motivo: e instanceof Error ? e.message : "falhou" });
      }
    }
    return Response.json({ ok: true, clinicas: resultado });
  } catch (e) {
    console.error("[inteligencia-do-lead]", e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
