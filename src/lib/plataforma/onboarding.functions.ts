/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas novas, fora do types.ts do Lovable */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { exigeConfiguracoes } from "@/lib/auth/area.middleware";
import { motivoDaConta, type MotivoDaConta } from "@/lib/auth/erro-do-convite";

/**
 * O começo de um consultório novo: o cadastro aberto (`/comecar`), a ficha
 * que o próprio consultório edita (nome e quem avalia) e os "Primeiros
 * passos" do Início.
 */

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// ── Cadastro aberto ─────────────────────────────────────────────────────

/**
 * Cria a conta de quem quer testar, já confirmada.
 *
 * Sem e-mail de confirmação pelo mesmo motivo do convite: quem chega da
 * página de vendas quer ver o sistema agora, e a caixa de entrada é onde essa
 * vontade acaba. O que a conta ganha é só um consultório VAZIO em teste (ver
 * `criar_clinica`), sem acesso a nada de ninguém: o isolamento é por
 * consultório, e o dela nasce sem dados.
 */
export const criarContaParaTestar = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; senha: string; nome: string; telefone: string }) => {
    const email = String(input.email ?? "")
      .trim()
      .toLowerCase();
    if (!email.includes("@")) throw new Error("E-mail inválido.");
    if (String(input.senha ?? "").length < 8) {
      throw new Error("A senha precisa ter pelo menos 8 caracteres.");
    }
    const nome = String(input.nome ?? "")
      .trim()
      .slice(0, 120);
    if (!nome) throw new Error("Diga seu nome.");
    return {
      email,
      senha: String(input.senha),
      nome,
      telefone: String(input.telefone ?? "")
        .trim()
        .slice(0, 40),
    };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; motivo?: MotivoDaConta }> => {
    const { data: criado, error } = await (
      await admin()
    ).auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { full_name: data.nome, phone: data.telefone },
    });
    if (error || !criado?.user?.id) {
      const motivo = motivoDaConta(error);
      if (motivo === "falhou") console.error("[comecar] conta não criada", error?.message);
      return { ok: false, motivo };
    }
    return { ok: true };
  });

// ── A ficha que o consultório edita ─────────────────────────────────────

export interface MeuConsultorio {
  nome: string;
  responsavelAvaliacao: string;
}

export const getMeuConsultorio = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<MeuConsultorio | null> => {
    const supabase: any = context.supabase;
    const { data } = await supabase
      .from("clinicas")
      .select("nome, responsavel_avaliacao")
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (!data) return null;
    return {
      nome: String(data.nome ?? ""),
      responsavelAvaliacao: String(data.responsavel_avaliacao ?? ""),
    };
  });

/**
 * Nome e quem faz a avaliação. Só esses dois: plano, teste e franquia são da
 * plataforma, e por isso a gravação passa pelo servidor (a tabela não tem
 * regra de escrita para quem está logado).
 */
export const salvarMeuConsultorio = createServerFn({ method: "POST" })
  .middleware([exigeConfiguracoes])
  .inputValidator((input: MeuConsultorio) => {
    const nome = String(input.nome ?? "").trim();
    if (!nome) throw new Error("O consultório precisa de um nome.");
    return {
      nome: nome.slice(0, 120),
      responsavelAvaliacao: String(input.responsavelAvaliacao ?? "")
        .trim()
        .slice(0, 120),
    };
  })
  .handler(async ({ data, context }) => {
    if (!context.isAdmin) throw new Error("Apenas administradores mudam os dados do consultório.");
    const { error } = await (
      await admin()
    )
      .from("clinicas")
      .update({
        nome: data.nome,
        responsavel_avaliacao: data.responsavelAvaliacao || null,
        atualizado_em: new Date().toISOString(),
      })
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Primeiros passos ────────────────────────────────────────────────────

export type PassoId =
  | "consultorio"
  | "unidade"
  | "cadeiras"
  | "procedimentos"
  | "whatsapp"
  | "assistente"
  | "equipe"
  | "pixel";

export interface EstadoDosPassos {
  /** Os passos que valem para este consultório, na ordem, e se estão feitos.
   *  O estado vem dos próprios dados, nunca de uma caixinha marcada. */
  passos: { id: PassoId; feito: boolean; opcional: boolean }[];
  /** Tem plano com IA? Sem ele, o passo da assistente não aparece. */
  comIa: boolean;
}

/** `null` para quem não administra ou para consultório sem ficha (a NÓS de
 *  antes das fichas não vê lista de primeiros passos). */
export const getPrimeirosPassos = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<EstadoDosPassos | null> => {
    if (!context.isAdmin) return null;
    const db = await admin();
    const dono = context.ownerId;
    const contar = (tabela: string, filtro?: (q: any) => any) => {
      let q = db.from(tabela).select("id", { count: "exact", head: true }).eq("owner_id", dono);
      if (filtro) q = filtro(q);
      return q;
    };
    const [ficha, unidades, cadeiras, dentistas, procedimentos, whatsapp, agente, pessoas, pixel] =
      await Promise.all([
        db
          .from("clinicas")
          .select("plano, situacao, teste_ate, responsavel_avaliacao")
          .eq("owner_id", dono)
          .maybeSingle(),
        contar("clinic_units", (q) =>
          q.eq("active", true).not("address", "is", null).neq("address", ""),
        ),
        contar("clinic_chairs", (q) => q.eq("active", true)),
        contar("professionals", (q) => q.eq("active", true)),
        contar("clinic_procedures", (q) => q.eq("active", true)),
        contar("wa_instances", (q) => q.eq("status", "open")),
        db.from("ai_agents").select("enabled").eq("owner_id", dono).maybeSingle(),
        contar("clinic_members", (q) => q.eq("status", "active")),
        db.from("meta_capi_credentials").select("enabled").eq("owner_id", dono).maybeSingle(),
      ]);
    if (!ficha.data) return null;

    const { recursosDaFicha } = await import("@/lib/plataforma/recursos");
    const comIa = recursosDaFicha({ ...ficha.data, club_ligado: false }, new Date()).ia;
    const n = (r: any) => Number(r?.count ?? 0);
    const passos: EstadoDosPassos["passos"] = [
      {
        id: "consultorio",
        feito: !!String(ficha.data.responsavel_avaliacao ?? "").trim(),
        opcional: false,
      },
      { id: "unidade", feito: n(unidades) > 0, opcional: false },
      { id: "cadeiras", feito: n(cadeiras) > 0 && n(dentistas) > 0, opcional: false },
      { id: "procedimentos", feito: n(procedimentos) > 0, opcional: false },
      { id: "whatsapp", feito: n(whatsapp) > 0, opcional: false },
      ...(comIa
        ? [{ id: "assistente" as const, feito: !!agente.data?.enabled, opcional: false }]
        : []),
      { id: "equipe", feito: n(pessoas) > 1, opcional: true },
      { id: "pixel", feito: !!pixel.data?.enabled, opcional: true },
    ];
    return { passos, comIa };
  });
