/**
 * A clínica de demonstração: um consultório à parte (outro owner_id) com dados
 * 100% fictícios, para mostrar o sistema a clientes sem expor nada da NÓS real.
 *
 * Roda quantas vezes quiser: apaga os dados da demo e recria tudo RELATIVO A
 * HOJE (a agenda sempre tem consultas desta semana, o mês sempre tem
 * faturamento). Nunca toca em outro consultório: tudo é filtrado pelo owner_id
 * do login da demo, e o script se recusa a rodar se esse consultório não for a
 * demo.
 *
 *   node scripts/demo/popular-demo.mjs            # cria ou renova
 *   DEMO_SENHA=... node scripts/demo/popular-demo.mjs   # define a senha na criação
 *
 * Telefones: 55 + DDD + 9 0000 00NN — formato válido, número que não existe.
 * Nada é enviado para ninguém: a demo não tem WhatsApp conectado, a assistente
 * fica desligada e o Club fica desligado (ver `club_ligado` abaixo).
 */
import { randomUUID, randomBytes } from "node:crypto";
import { projetoNovo, sql, chavesDoProjeto } from "../migracao/api.mjs";

const EMAIL = process.env.DEMO_EMAIL || "demo@nosconecta-demo.com";
const NOME_DA_CLINICA = "NÓS Odontologia · Demo";
const ref = projetoNovo();
const chaves = await chavesDoProjeto(ref);
const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(chaves.url, chaves.servico, { auth: { persistSession: false } });

// ── Pequenas ferramentas ─────────────────────────────────────────────────
let semente = 20261105;
function aleatorio() {
  semente |= 0;
  semente = (semente + 0x6d2b79f5) | 0;
  let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const inteiro = (a, b) => a + Math.floor(aleatorio() * (b - a + 1));
const sorteia = (lista) => lista[Math.floor(aleatorio() * lista.length)];
const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v === null || v === undefined ? "null" : String(v));
const pad = (n) => String(n).padStart(2, "0");
const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const fmtHora = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const agora = new Date();
const hoje = fmtDia.format(agora);
const horaAgora = fmtHora.format(agora);
function somarDias(dia, n) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const diaDaSemana = (dia) => new Date(`${dia}T12:00:00Z`).getUTCDay();
const instante = (dia, hora) => `${dia}T${hora}:00-03:00`;
async function inserir(tabela, colunas, linhas) {
  for (let i = 0; i < linhas.length; i += 150) {
    const bloco = linhas.slice(i, i + 150);
    await sql(
      ref,
      `INSERT INTO public.${tabela} (${colunas.join(", ")}) VALUES ${bloco.map((l) => `(${l.join(", ")})`).join(",\n")}`,
    );
  }
}

// ── O login ──────────────────────────────────────────────────────────────
let senhaNova = null;
let uid;
const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const existente = (lista?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === EMAIL);
if (existente) {
  uid = existente.id;
  // Com DEMO_SENHA definida, a senha do login passa a ser essa.
  if (process.env.DEMO_SENHA) {
    const { error } = await admin.auth.admin.updateUserById(uid, {
      password: process.env.DEMO_SENHA,
    });
    if (error) throw error;
    senhaNova = process.env.DEMO_SENHA;
  }
} else {
  senhaNova = process.env.DEMO_SENHA || `Demo-${randomBytes(5).toString("base64url")}`;
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: senhaNova,
    email_confirm: true,
    user_metadata: { full_name: "Demonstração NÓS" },
  });
  if (error) throw error;
  uid = data.user.id;
}

// ── O consultório ────────────────────────────────────────────────────────
const [temClinica] = await sql(ref, `select nome from public.clinicas where owner_id = '${uid}'`);
if (!temClinica) {
  await sql(
    ref,
    `DO $$ BEGIN
       PERFORM set_config('request.jwt.claim.sub', '${uid}', true);
       PERFORM set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true);
       PERFORM public.criar_clinica(${q(NOME_DA_CLINICA)}, 'Florianópolis', '5548900000000');
     END $$;`,
  );
} else if (!String(temClinica.nome).includes("Demo")) {
  throw new Error("Esse login não é o de uma clínica de demonstração. Nada foi alterado.");
}
await sql(
  ref,
  `UPDATE public.clinicas SET nome = ${q(NOME_DA_CLINICA)}, plano = 'ia', situacao = 'ativa', teste_ate = null,
     -- O Club fica desligado de propósito: o cadastro público do Club escolhe o primeiro
     -- consultório com Club ligado, e a demo não pode receber cadastro de paciente de verdade.
     club_ligado = false, responsavel_avaliacao = 'Dra. Helena Prado', onboarding_concluido_em = now()
   WHERE owner_id = '${uid}'`,
);
await sql(
  ref,
  `UPDATE public.financial_categories SET grupo_dre = CASE
  WHEN type = 'income' THEN 'receita'
  WHEN translate(lower(name), 'áàâãéêíóôõúç', 'aaaaeeiooouc') ~ '(constru|obra|movei|mobili|equipamento|reforma|instalacao|cadeira)' THEN 'investimento'
  WHEN translate(lower(name), 'áàâãéêíóôõúç', 'aaaaeeiooouc') ~ '(juro|imposto|tarifa|taxa banc|multa|iof)' THEN 'financeiro'
  WHEN translate(lower(name), 'áàâãéêíóôõúç', 'aaaaeeiooouc') ~ '(insumo|laborat|comiss|material de consumo|protese|descart|maquininha|taxa de cart)' THEN 'custo_variavel'
  ELSE 'despesa_fixa' END WHERE owner_id = '${uid}' AND grupo_dre IS NULL`,
);

// ── Limpa o que a demo tinha (só deste owner) ────────────────────────────
for (const t of [
  "appointment_procedures",
  "appointments",
  "financial_transactions",
  "wa_messages",
  "wa_conversations",
  "wa_contacts",
  "patients",
  "professionals",
  "clinic_chairs",
  "clinic_procedures",
  "financial_accounts",
  "automation_rules",
  "gestao_metas",
]) {
  await sql(ref, `DELETE FROM public.${t} WHERE owner_id = '${uid}'`).catch(() => null);
}
await sql(ref, `DELETE FROM public.clinic_units WHERE owner_id = '${uid}' AND is_default = false`);
await sql(ref, `UPDATE public.automation_rules SET active = false WHERE owner_id = '${uid}'`).catch(
  () => null,
);

// ── Unidades, profissionais, salas ───────────────────────────────────────
const [u1] = await sql(
  ref,
  `UPDATE public.clinic_units SET name = 'NÓS Florianópolis', address = 'Av. Beira-Mar Norte, 1000 — Centro, Florianópolis/SC', is_default = true WHERE owner_id = '${uid}' AND is_default RETURNING id`,
);
const unidade1 = u1.id;
const unidade2 = randomUUID();
await sql(
  ref,
  `INSERT INTO public.clinic_units (id, owner_id, name, address, active, is_default) VALUES ('${unidade2}', '${uid}', 'NÓS Porto Alegre', 'Rua dos Andradas, 500 — Centro Histórico, Porto Alegre/RS', true, false)`,
);
await sql(
  ref,
  `INSERT INTO public.clinic_business_hours (owner_id, unit_id, weekday, modo, opens_at, closes_at)
  SELECT '${uid}', '${unidade2}', d, CASE WHEN d BETWEEN 1 AND 5 THEN 'aberto' ELSE 'fechado' END,
         CASE WHEN d BETWEEN 1 AND 5 THEN time '09:00' END, CASE WHEN d BETWEEN 1 AND 5 THEN time '18:00' END
  FROM generate_series(0, 6) d ON CONFLICT DO NOTHING`,
).catch(() => null);

const pros = [
  {
    id: randomUUID(),
    nome: "Dra. Helena Prado",
    esp: "Harmonização Facial",
    unidade: unidade1,
    cor: "#FF7A59",
  },
  {
    id: randomUUID(),
    nome: "Dr. Rafael Moura",
    esp: "Implantodontia",
    unidade: unidade1,
    cor: "#7C5CFF",
  },
  {
    id: randomUUID(),
    nome: "Dra. Camila Duarte",
    esp: "Ortodontia",
    unidade: unidade2,
    cor: "#16A34A",
  },
];
await inserir(
  "professionals",
  ["id", "owner_id", "unit_id", "name", "specialty", "color", "active"],
  pros.map((p) => [q(p.id), q(uid), q(p.unidade), q(p.nome), q(p.esp), q(p.cor), "true"]),
);
const salas = [
  { id: randomUUID(), nome: "Sala 1", unidade: unidade1 },
  { id: randomUUID(), nome: "Sala 2", unidade: unidade1 },
  { id: randomUUID(), nome: "Sala 1", unidade: unidade2 },
];
await inserir(
  "clinic_chairs",
  ["id", "owner_id", "unit_id", "name", "active"],
  salas.map((s) => [q(s.id), q(uid), q(s.unidade), q(s.nome), "true"]),
);

// ── Procedimentos ────────────────────────────────────────────────────────
const catalogo = [
  ["Avaliação inicial", "Consultas", 30, 0, "evaluation"],
  ["Limpeza e profilaxia", "Prevenção", 60, 280, "consultation"],
  ["Clareamento a laser", "Estética", 90, 1200, "procedure"],
  ["Restauração em resina", "Dentística", 60, 420, "procedure"],
  ["Toxina botulínica", "Harmonização", 45, 1350, "procedure"],
  ["Preenchimento labial", "Harmonização", 60, 1800, "procedure"],
  ["Bioestimulador de colágeno", "Harmonização", 60, 2400, "procedure"],
  ["Implante unitário", "Implantodontia", 120, 4800, "procedure"],
  ["Manutenção ortodôntica", "Ortodontia", 30, 230, "return"],
  ["Placa de bruxismo", "Prótese", 45, 950, "procedure"],
  ["Retorno e revisão", "Consultas", 30, 150, "return"],
].map(([nome, cat, min, preco, tipo]) => ({ id: randomUUID(), nome, cat, min, preco, tipo }));
await inserir(
  "clinic_procedures",
  ["id", "owner_id", "name", "category", "duration_minutes", "price", "cost", "active"],
  catalogo.map((p) => [
    q(p.id),
    q(uid),
    q(p.nome),
    q(p.cat),
    num(p.min),
    num(p.preco),
    num(Math.round(p.preco * 0.28)),
    "true",
  ]),
);
const porNome = Object.fromEntries(catalogo.map((p) => [p.nome, p]));
const deHarmonizacao = [
  "Toxina botulínica",
  "Preenchimento labial",
  "Bioestimulador de colágeno",
  "Avaliação inicial",
  "Limpeza e profilaxia",
  "Retorno e revisão",
];
const deImplante = [
  "Implante unitário",
  "Avaliação inicial",
  "Restauração em resina",
  "Clareamento a laser",
  "Placa de bruxismo",
  "Retorno e revisão",
];
const deOrto = [
  "Manutenção ortodôntica",
  "Avaliação inicial",
  "Limpeza e profilaxia",
  "Retorno e revisão",
];
const cardapio = { [pros[0].id]: deHarmonizacao, [pros[1].id]: deImplante, [pros[2].id]: deOrto };

// ── Contas ───────────────────────────────────────────────────────────────
const contaCaixa = randomUUID();
const contaBanco = randomUUID();
await inserir(
  "financial_accounts",
  ["id", "owner_id", "unit_id", "name", "type", "current_balance"],
  [
    [q(contaBanco), q(uid), q(unidade1), q("Conta Corrente"), q("bank"), "38420.50"],
    [q(contaCaixa), q(uid), q(unidade2), q("Caixa Porto Alegre"), q("cash"), "1250.00"],
  ],
);

// ── Pacientes ────────────────────────────────────────────────────────────
const masc = [
  "Lucas",
  "Gabriel",
  "Pedro",
  "Matheus",
  "Rafael",
  "Bruno",
  "Thiago",
  "Felipe",
  "André",
  "Rodrigo",
  "Eduardo",
  "Henrique",
  "Marcelo",
  "Vinícius",
  "Diego",
];
const fem = [
  "Ana",
  "Julia",
  "Mariana",
  "Beatriz",
  "Camila",
  "Larissa",
  "Fernanda",
  "Patrícia",
  "Aline",
  "Renata",
  "Carolina",
  "Isabela",
  "Letícia",
  "Bianca",
  "Vanessa",
  "Tatiana",
  "Priscila",
  "Daniela",
];
const sobrenomes = [
  "Silva",
  "Souza",
  "Oliveira",
  "Santos",
  "Pereira",
  "Costa",
  "Rodrigues",
  "Almeida",
  "Nascimento",
  "Lima",
  "Araújo",
  "Fernandes",
  "Carvalho",
  "Gomes",
  "Martins",
  "Rocha",
  "Ribeiro",
  "Barbosa",
  "Moreira",
  "Teixeira",
  "Cardoso",
  "Mendes",
  "Nunes",
  "Vieira",
];
const tira = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const pacientes = [];
const usados = new Set();
while (pacientes.length < 72) {
  const feminino = aleatorio() < 0.68;
  const primeiro = sorteia(feminino ? fem : masc);
  const ultimo = `${sorteia(sobrenomes)} ${sorteia(sobrenomes)}`.replace(/(\w+) \1/, "$1 Lopes");
  const nome = `${primeiro} ${ultimo}`;
  if (usados.has(nome)) continue;
  usados.add(nome);
  const n = pacientes.length + 1;
  const unidade = aleatorio() < 0.72 ? unidade1 : unidade2;
  const ddd = unidade === unidade1 ? 48 : 51;
  pacientes.push({
    id: randomUUID(),
    nome,
    primeiro,
    ultimo,
    feminino,
    unidade,
    fone: `55${ddd}900000${pad(n)}`.slice(0, 13),
    email: `${tira(primeiro)}.${tira(ultimo.split(" ")[0])}@exemplo.com.br`,
    nasc: `${inteiro(1962, 2004)}-${pad(inteiro(1, 12))}-${pad(inteiro(1, 28))}`,
    cadastro: somarDias(hoje, -inteiro(20, 160)),
  });
}
await inserir(
  "patients",
  [
    "id",
    "owner_id",
    "unit_id",
    "name",
    "first_name",
    "last_name",
    "phone",
    "email",
    "birth_date",
    "gender",
    "city",
    "status",
    "created_at",
  ],
  pacientes.map((p) => [
    q(p.id),
    q(uid),
    q(p.unidade),
    q(p.nome),
    q(p.primeiro),
    q(p.ultimo),
    q(p.fone),
    q(p.email),
    q(p.nasc),
    q(p.feminino ? "female" : "male"),
    q(p.unidade === unidade1 ? "Florianópolis" : "Porto Alegre"),
    q("active"),
    q(instante(p.cadastro, "10:00")),
  ]),
);

// ── Agenda: 75 dias para trás, 14 para frente ────────────────────────────
const agenda = [];
const procsDaConsulta = [];
const receber = [];
const horas = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
for (let d = -75; d <= 14; d++) {
  const dia = somarDias(hoje, d);
  const sem = diaDaSemana(dia);
  if (sem === 0 || sem === 6) continue;
  const ocupados = new Set();
  for (const pro of pros) {
    const quantos = pro.unidade === unidade1 ? inteiro(1, 2) : inteiro(0, 1);
    const sala = salas.find((s) => s.unidade === pro.unidade);
    for (let k = 0; k < quantos; k++) {
      const hora = sorteia(horas);
      if (ocupados.has(`${pro.id}${hora}`)) continue;
      ocupados.add(`${pro.id}${hora}`);
      const paciente = sorteia(pacientes.filter((p) => p.unidade === pro.unidade));
      const proc = porNome[sorteia(cardapio[pro.id])];
      const fim = `${pad(Number(hora.slice(0, 2)) + Math.max(1, Math.round(proc.min / 60)))}:00`;
      let status;
      if (dia < hoje) {
        const r = aleatorio();
        status = r < 0.78 ? "completed" : r < 0.83 ? "missed" : "cancelled";
      } else if (dia === hoje) {
        status = hora < horaAgora ? "completed" : aleatorio() < 0.7 ? "confirmed" : "pending";
      } else {
        status = aleatorio() < 0.65 ? "confirmed" : "pending";
      }
      const preco = proc.preco ? proc.preco + (aleatorio() < 0.25 ? inteiro(-5, 10) * 10 : 0) : 0;
      // Quando foi marcado: dias antes da consulta (nunca no futuro). As do futuro
      // foram marcadas nos últimos dias, no ritmo de ~5 por dia útil.
      let criado = dia > hoje ? somarDias(hoje, -inteiro(0, 9)) : somarDias(dia, -inteiro(1, 12));
      if (criado > hoje) criado = hoje;
      const horaCriacao = `${pad(inteiro(9, 17))}:${pad(inteiro(0, 59))}`;
      const horaDeAgora = criado === hoje && horaCriacao > horaAgora ? "08:30" : horaCriacao;
      let atualizado =
        status === "cancelled"
          ? aleatorio() < 0.4
            ? dia
            : somarDias(dia, -inteiro(1, 3))
          : dia < hoje
            ? dia
            : criado;
      if (atualizado > hoje) atualizado = hoje;
      const id = randomUUID();
      agenda.push({
        id,
        paciente,
        pro,
        sala,
        proc,
        dia,
        hora,
        fim,
        status,
        preco,
        criado: instante(criado, horaDeAgora),
        atualizado: instante(atualizado, "12:00"),
      });
    }
  }
}
await inserir(
  "appointments",
  [
    "id",
    "owner_id",
    "unit_id",
    "patient_id",
    "patient_name",
    "procedure_id",
    "procedure_name",
    "professional_id",
    "professional_name",
    "room_id",
    "room_name",
    "date",
    "start_time",
    "end_time",
    "status",
    "type",
    "expected_revenue",
    "actual_revenue",
    "generate_financial",
    "created_at",
    "updated_at",
  ],
  agenda.map((a) => [
    q(a.id),
    q(uid),
    q(a.pro.unidade),
    q(a.paciente.id),
    q(a.paciente.nome),
    q(a.proc.id),
    q(a.proc.nome),
    q(a.pro.id),
    q(a.pro.nome),
    q(a.sala.id),
    q(a.sala.nome),
    q(a.dia),
    q(a.hora),
    q(a.fim),
    q(a.status),
    q(a.proc.tipo),
    num(a.preco),
    a.status === "completed" ? num(a.preco) : "null",
    "true",
    q(a.criado),
    q(a.atualizado),
  ]),
);
await inserir(
  "appointment_procedures",
  [
    "id",
    "owner_id",
    "unit_id",
    "appointment_id",
    "procedure_id",
    "procedure_name",
    "price",
    "duration_minutes",
    "position",
  ],
  agenda.map((a) => [
    q(randomUUID()),
    q(uid),
    q(a.pro.unidade),
    q(a.id),
    q(a.proc.id),
    q(a.proc.nome),
    num(a.preco),
    num(a.proc.min),
    "0",
  ]),
);

// ── Financeiro: recebimentos dos atendimentos e as contas do mês ─────────
const formas = ["pix", "pix", "pix", "credit", "credit", "debit", "cash"];
for (const a of agenda) {
  if (a.status !== "completed" || !a.preco) continue;
  receber.push([
    q(randomUUID()),
    q(uid),
    q(a.pro.unidade),
    q("receivable"),
    q("paid"),
    q(`${a.proc.nome} — ${a.paciente.nome}`),
    num(a.preco),
    q(a.dia),
    q(a.dia),
    q(a.paciente.id),
    q(a.pro.unidade === unidade1 ? contaBanco : contaCaixa),
    q(sorteia(formas)),
    q("appointment"),
    q(a.id),
  ]);
}
await inserir(
  "financial_transactions",
  [
    "id",
    "owner_id",
    "unit_id",
    "type",
    "status",
    "description",
    "amount",
    "due_date",
    "paid_date",
    "patient_id",
    "account_id",
    "payment_method",
    "source_type",
    "source_id",
  ],
  receber,
);
const categorias = Object.fromEntries(
  (
    await sql(ref, `select id, name from public.financial_categories where owner_id = '${uid}'`)
  ).map((c) => [c.name, c.id]),
);
const contas = [
  ["Aluguel", "Aluguel da sala comercial", 6500, 5, "Imobiliária Central"],
  ["Salários e Pró-labore", "Folha da equipe", 14200, 5, null],
  ["Insumos e materiais", "Compra de insumos odontológicos", 3150, 12, "Dental Brasil"],
  ["Laboratório e terceiros", "Laboratório de prótese", 2100, 15, "Lab Sorriso"],
  ["Energia", "Conta de energia", 780, 10, "Celesc"],
  ["Água", "Conta de água", 210, 10, "Casan"],
  ["Internet e Telefone", "Internet e telefonia", 240, 8, "Operadora Fibra"],
  ["Anúncios", "Anúncios no Instagram", 3500, 20, "Meta"],
  ["Contador", "Honorários contábeis", 900, 10, "Contabilidade Prime"],
  ["Software e Assinaturas", "Sistema de gestão e assinaturas", 450, 3, "NÓS Conecta"],
  ["Impostos", "Simples Nacional", 2850, 20, "Receita Federal"],
];
const despesas = [];
for (let m = -3; m <= 0; m++) {
  const base = new Date(`${hoje.slice(0, 7)}-01T12:00:00Z`);
  base.setUTCMonth(base.getUTCMonth() + m);
  for (const [cat, desc, valor, diaDoMes, fornecedor] of contas) {
    const venc = `${base.toISOString().slice(0, 7)}-${pad(diaDoMes)}`;
    const paga = venc <= hoje;
    const variacao = Math.round(valor * (1 + (aleatorio() - 0.5) * 0.08));
    despesas.push([
      q(randomUUID()),
      q(uid),
      q(unidade1),
      q("payable"),
      q(paga ? "paid" : "pending"),
      q(desc),
      num(variacao),
      q(venc),
      paga ? q(venc) : "null",
      q(contaBanco),
      q(categorias[cat] ?? null),
      q(fornecedor),
      q(sorteia(["pix", "boleto"])),
    ]);
  }
}
await inserir(
  "financial_transactions",
  [
    "id",
    "owner_id",
    "unit_id",
    "type",
    "status",
    "description",
    "amount",
    "due_date",
    "paid_date",
    "account_id",
    "category_id",
    "supplier_name",
    "payment_method",
  ],
  despesas,
);

// ── Prontuário: algumas evoluções ────────────────────────────────────────
const evolucoes = [
  "Paciente relata sensibilidade ao frio. Realizada profilaxia e aplicação de dessensibilizante.",
  "Aplicação de toxina botulínica em terço superior. Orientações pós-procedimento entregues.",
  "Restauração em resina no dente 26, sem intercorrências. Retorno em 6 meses.",
  "Avaliação para implante: exames de imagem solicitados. Plano apresentado e aceito.",
  "Manutenção do aparelho com troca de elásticos. Boa higiene, sem queixas.",
  "Clareamento a laser, 2 sessões. Paciente satisfeita, tom A2 alcançado.",
];
const concluidas = agenda.filter((a) => a.status === "completed").slice(-24);
await inserir(
  "patient_notes",
  [
    "id",
    "patient_id",
    "appointment_id",
    "professional_id",
    "professional_name",
    "body",
    "created_at",
  ],
  concluidas.map((a, i) => [
    q(randomUUID()),
    q(a.paciente.id),
    q(a.id),
    q(a.pro.id),
    q(a.pro.nome),
    q(evolucoes[i % evolucoes.length]),
    q(instante(a.dia, "18:00")),
  ]),
);

// ── Atendimento: conversas de WhatsApp fictícias ─────────────────────────
const abertura = [
  "Oi, tudo bem? Quero saber o valor do clareamento",
  "Boa tarde! Vocês fazem harmonização facial?",
  "Olá, gostaria de agendar uma avaliação",
  "Oi! Vi o anúncio de vocês no Instagram",
  "Bom dia, tem horário essa semana?",
  "Quanto custa o implante?",
  "Queria marcar uma limpeza",
];
const respostaDaClinica = [
  "Olá! Que bom ter você por aqui 😊 Posso te ajudar com isso sim!",
  "Oi! Temos horários nesta semana. Qual período fica melhor pra você?",
  "Claro! A avaliação inicial é sem custo. Quer que eu reserve um horário?",
  "Perfeito! Vou te passar os valores e as formas de pagamento.",
];
const conversas = [];
const mensagens = [];
const contatos = [];
const interessados = pacientes.slice(0, 26);
let idMensagem = 1;
for (const [i, p] of interessados.entries()) {
  const jid = `${p.fone}@s.whatsapp.net`;
  const diasAtras = i < 6 ? 0 : inteiro(1, 28);
  const dia = somarDias(hoje, -diasAtras);
  const hora =
    diasAtras === 0
      ? pad(inteiro(8, Math.max(8, Number(horaAgora.slice(0, 2)) - 1)))
      : pad(inteiro(9, 19));
  const minuto = pad(inteiro(0, 50));
  const t0 = instante(dia, `${hora}:${minuto}`);
  const t1 = instante(dia, `${hora}:${pad(Math.min(59, Number(minuto) + inteiro(1, 8)))}`);
  const semResposta = i % 9 === 4 && diasAtras === 0;
  mensagens.push([q(`demo-${idMensagem++}`), q(uid), q(jid), "false", q(sorteia(abertura)), q(t0)]);
  if (!semResposta)
    mensagens.push([
      q(`demo-${idMensagem++}`),
      q(uid),
      q(jid),
      "true",
      q(sorteia(respostaDaClinica)),
      q(t1),
    ]);
  const ultima = semResposta ? t0 : t1;
  conversas.push([
    q(randomUUID()),
    q(uid),
    q(jid),
    q(jid),
    q("open"),
    semResposta ? "1" : "0",
    q(ultima),
    q(semResposta ? "Quero saber o valor" : "Olá! Posso te ajudar 😊"),
    semResposta ? "false" : "true",
    q(t0),
  ]);
  contatos.push([q(randomUUID()), q(uid), q(jid), q(p.nome), q(p.fone), q(p.id)]);
}
await inserir(
  "wa_contacts",
  ["id", "owner_id", "crm_contact_id", "name", "phone_raw", "patient_id"],
  contatos,
);
await inserir(
  "wa_conversations",
  [
    "id",
    "owner_id",
    "crm_conversation_id",
    "crm_contact_id",
    "status",
    "unread_count",
    "last_message_at",
    "last_message_preview",
    "last_message_from_me",
    "created_at",
  ],
  conversas,
);
await inserir(
  "wa_messages",
  ["id", "owner_id", "crm_message_id", "crm_conversation_id", "from_me", "body", "sent_at"].filter(
    Boolean,
  ),
  mensagens.map(([id, o, c, f, b, s]) => [q(randomUUID()), o, id, c, f, b, s]),
);

// ── Meta de faturamento da Gestão ────────────────────────────────────────
await sql(
  ref,
  `INSERT INTO public.gestao_metas (owner_id, faturamento_mensal) VALUES ('${uid}', 60000) ON CONFLICT (owner_id) DO UPDATE SET faturamento_mensal = 60000`,
);

const [resumo] = await sql(
  ref,
  `select
  (select count(*) from public.patients where owner_id='${uid}')::int pacientes,
  (select count(*) from public.appointments where owner_id='${uid}')::int agendamentos,
  (select count(*) from public.appointments where owner_id='${uid}' and status='completed' and date >= date_trunc('month', current_date))::int concluidos_no_mes,
  (select coalesce(sum(amount),0) from public.financial_transactions where owner_id='${uid}' and type='receivable' and status='paid' and paid_date >= date_trunc('month', current_date))::numeric faturado_no_mes,
  (select count(*) from public.wa_conversations where owner_id='${uid}')::int conversas`,
);
console.log(
  JSON.stringify(
    {
      email: EMAIL,
      senha: senhaNova ?? "(a que já existia; use DEMO_SENHA ao criar)",
      owner: uid,
      resumo,
    },
    null,
    1,
  ),
);
process.exit(0);
