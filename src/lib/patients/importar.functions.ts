/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { normalizeBrazilianPhone, telefoneBrasileiroValido } from "@/lib/atendimentos/phone";
import { foneCanonico } from "../../../supabase/functions/_shared/inteligencia-do-lead.ts";
import { dividirNome } from "./nome";
import type { PacienteLido } from "./importar";

export interface ResultadoDaImportacao {
  criados: number;
  /** O telefone já era de um paciente da clínica, ou repetia dentro da lista. */
  repetidos: number;
  semNome: number;
}

/**
 * Grava a lista de pacientes lida da planilha.
 *
 * Quem já tem ficha com o mesmo telefone não é duplicado: o telefone é a
 * chave do sistema (conversa, agenda, Club). Sem telefone válido a ficha é
 * criada sem ele — melhor ter o nome do que perder a pessoa. Fica na unidade
 * padrão (ou na da própria pessoa, para quem não administra).
 */
export const importarPacientes = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { pacientes: PacienteLido[] }) => {
    const lista = Array.isArray(input?.pacientes) ? input.pacientes : [];
    if (!lista.length) throw new Error("Nenhum paciente para importar.");
    if (lista.length > 3000) throw new Error("Importe até 3.000 pacientes por vez.");
    return {
      pacientes: lista.map((p) => ({
        nome: String(p?.nome ?? "")
          .trim()
          .slice(0, 120),
        telefone: String(p?.telefone ?? "")
          .trim()
          .slice(0, 40),
        email: String(p?.email ?? "")
          .trim()
          .toLowerCase()
          .slice(0, 160),
      })),
    };
  })
  .handler(async ({ data, context }): Promise<ResultadoDaImportacao> => {
    const supabase: any = context.supabase;
    let unitId = context.isAdmin ? null : context.unitId;
    if (!unitId) {
      const { data: unidades } = await supabase
        .from("clinic_units")
        .select("id, is_default")
        .eq("owner_id", context.ownerId)
        .eq("active", true)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1);
      unitId = unidades?.[0]?.id ?? null;
    }
    if (!unitId) throw new Error("Cadastre uma unidade antes de importar pacientes.");

    // Telefones que a clínica já tem (forma canônica: com ou sem o nono dígito).
    const existentes = new Set<string>();
    for (let de = 0; ; de += 1000) {
      const { data: linhas, error } = await supabase
        .from("patients")
        .select("phone")
        .eq("owner_id", context.ownerId)
        .not("phone", "is", null)
        .range(de, de + 999);
      if (error) throw new Error(error.message);
      for (const l of linhas ?? []) {
        const f = foneCanonico(String(l.phone ?? ""));
        if (f) existentes.add(f);
      }
      if (!linhas || linhas.length < 1000) break;
    }

    let repetidos = 0;
    let semNome = 0;
    const novos: any[] = [];
    for (const p of data.pacientes) {
      if (!p.nome) {
        semNome++;
        continue;
      }
      const valido = p.telefone && telefoneBrasileiroValido(p.telefone);
      const fone = valido ? normalizeBrazilianPhone(p.telefone) : null;
      const chave = fone ? foneCanonico(fone) : null;
      if (chave && existentes.has(chave)) {
        repetidos++;
        continue;
      }
      if (chave) existentes.add(chave);
      const partes = dividirNome(p.nome);
      novos.push({
        owner_id: context.ownerId,
        unit_id: unitId,
        name: partes.completo,
        first_name: partes.primeiro || null,
        last_name: partes.sobrenome || null,
        phone: fone,
        email: p.email || null,
        status: "active",
      });
    }
    for (let i = 0; i < novos.length; i += 200) {
      const { error } = await supabase.from("patients").insert(novos.slice(i, i + 200));
      if (error) throw new Error(error.message);
    }
    return { criados: novos.length, repetidos, semNome };
  });
