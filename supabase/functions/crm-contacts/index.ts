// Empurra o paciente (fonte da verdade) como contato no CRM — mão única,
// nunca lê de volta. Chamada só internamente por
// src/lib/patients/patients.functions.ts (createPatient/updatePatient),
// nunca diretamente por uma tela.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crmFetch } from "../_shared/crm-auth.ts";
import { unwrap } from "../_shared/crm-client.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function handleUpsert(
  ownerId: string,
  patient: { patientId: string; name: string; phone?: string | null },
) {
  const { data: row, error } = await supabase
    .from("patients")
    .select("crm_contact_id")
    .eq("id", patient.patientId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const body = { name: patient.name, phone_number: patient.phone || undefined };

  if (row?.crm_contact_id) {
    await crmFetch(supabase, ownerId, `/api/v1/contacts/${row.crm_contact_id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return { ok: true, contactId: row.crm_contact_id };
  }

  const res = await crmFetch(supabase, ownerId, "/api/v1/contacts", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const contactId = unwrap(res)?.id ?? null;
  if (contactId) {
    await supabase
      .from("patients")
      .update({ crm_contact_id: String(contactId) })
      .eq("id", patient.patientId)
      .eq("owner_id", ownerId);
  }
  return { ok: true, contactId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const { ownerId, action, patient } = (await req.json()) as {
      ownerId?: string;
      action?: string;
      patient?: { patientId: string; name: string; phone?: string | null };
    };
    if (!ownerId || !action) {
      return new Response(JSON.stringify({ error: "ownerId e action são obrigatórios" }), { status: 400 });
    }
    if (action !== "upsert" || !patient) {
      return new Response(JSON.stringify({ error: "action/patient inválidos" }), { status: 400 });
    }

    const result = await handleUpsert(ownerId, patient);
    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("[crm-contacts]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
