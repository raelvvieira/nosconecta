// Contatos do CRM. Duas mãos, agora:
//
// `upsert` empurra o paciente (fonte da verdade) como contato — chamada só
// internamente por src/lib/patients/patients.functions.ts, nunca por uma tela.
//
// `list` lê a base de contatos inteira, paginada. Existe porque não havia
// nenhuma forma de ver quem está sincronizado: `/api/v1/contacts` era chamado
// uma única vez no sistema todo, com `pageSize=1`, só para ler o total em
// `meta.pagination.total` (crm-campaigns/index.ts). Nada é espelhado em tabela
// local — o cache é o do TanStack Query no front, como no resto do módulo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crmFetch } from "../_shared/crm-auth.ts";
import { unwrap } from "../_shared/crm-client.ts";
import { normalizeBrazilianPhone } from "../_shared/phone.ts";
import { parearResolvePhones } from "../_shared/resolve-phones.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Só dígitos — "+55 (48) 98419-5309" e "5548984195309" precisam bater mesmo
 *  vindo de lugares que formatam diferente (o CRM de um jeito na criação, de
 *  outro na listagem; o cadastro de paciente de outro ainda). Comparar as
 *  strings cruas era o que fazia a busca por telefone nunca achar nada,
 *  mesmo com o contato certo na página certa. */
const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/**
 * Forma exata como o CRM grava um celular brasileiro — regra confirmada
 * pelo time do CRM (18/08), não é escolha do CRM e sim como o WhatsApp
 * identifica esses números:
 *   DDD < 31   -> mantém o 9   (ex.: 11 São Paulo -> +5511987654321)
 *   DDD >= 31  -> remove o 9   (ex.: 51 Porto Alegre -> +555193967887)
 * (Substitui a heurística anterior de "sempre remove passando de 12
 * dígitos", que era inespecífica de DDD e por isso quebrava exatamente os
 * DDDs < 31 — o próprio time do CRM avisou pra não tentar reconstruir esse
 * número na mão; o motivo é este: não dá pra acertar sem saber a regra.)
 *
 * `resolve_phones` já aplica essa regra nos dois lados sozinho — por isso
 * `resolverTelefoneNoCrm` não precisa disto. Só os dois caminhos de reserva
 * abaixo (`buscarContatoPorTelefoneViaFiltro`, com `/contacts/filter`
 * `starts_with`, que compara prefixo literal, e `buscarContatoPorTelefone`,
 * que compara o telefone da varredura paginada) precisam da forma exata
 * gravada pra bater.
 */
function formaGravadaPeloCrm(digits: string): string {
  const comNono = digits.match(/^55(\d{2})9(\d{8})$/);
  if (!comNono) return digits; // não é celular BR de 13 dígitos com 9 — nada a ajustar
  const ddd = Number(comNono[1]);
  return ddd >= 31 ? `55${comNono[1]}${comNono[2]}` : digits;
}

/**
 * Pergunta direto ao CRM "existe contato com este telefone?" — resolve
 * ANTES de tentar criar, em vez de criar às cegas e só reagir ao 422
 * depois (jeito antigo, ainda de propósito no catch de `handleUpsert` como
 * rede de segurança). Recomendação do time do CRM (15/08): aceita telefone
 * em qualquer formatação, tira máscara e completa o "55" sozinho — por
 * isso resolve também o caso de telefone salvo sem código do país (ver
 * `normalizeBrazilianPhone`, aplicado de qualquer forma antes de mandar,
 * por garantia).
 */
async function resolverTelefoneNoCrm(ownerId: string, phone: string): Promise<string | null> {
  const alvo = normalizeBrazilianPhone(phone);
  if (!alvo) return null;
  try {
    const res = await crmFetch(supabase, ownerId, "/api/v1/audiences/resolve_phones", {
      method: "POST",
      body: JSON.stringify({ phones: [alvo] }),
    });
    const data = unwrap(res);
    const contactId = data?.contact_ids?.[0];
    return contactId ? String(contactId) : null;
  } catch {
    return null; // endpoint novo — quem chama decide o que tentar depois
  }
}

/**
 * Quantos telefones vão numa chamada de `resolve_phones`. O endpoint aceita
 * 5000; o teto aqui é menor de propósito, porque o limite que aperta primeiro
 * não é o do CRM e sim os 30s de `rawFetch` — um lote grande demais estoura o
 * tempo e derruba a resolução inteira, enquanto três lotes de 1000 não.
 */
const TELEFONES_POR_LOTE = 1000;

/**
 * Resolve VÁRIOS telefones numa chamada, devolvendo `telefone → contactId`.
 *
 * Só passou a ser possível quando o CRM começou a devolver `results` pareando
 * telefone e id (25/08) — antes era um telefone por requisição, e o porquê está
 * em `_shared/resolve-phones.ts`, junto da leitura da resposta.
 *
 * Um lote que não dê para parear devolve o que já tiver: quem chama termina o
 * resto um a um.
 */
async function resolverTelefonesEmLote(
  ownerId: string,
  telefones: string[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const alvos = [...new Set(telefones.map(normalizeBrazilianPhone).filter(Boolean))];
  if (!alvos.length) return mapa;

  for (let i = 0; i < alvos.length; i += TELEFONES_POR_LOTE) {
    const lote = alvos.slice(i, i + TELEFONES_POR_LOTE);
    try {
      const res = await crmFetch(supabase, ownerId, "/api/v1/audiences/resolve_phones", {
        method: "POST",
        body: JSON.stringify({ phones: lote }),
      });
      const pareado = parearResolvePhones(unwrap(res));
      // `null` = resposta sem `results` (CRM na versão antiga). Para aqui em
      // vez de tentar ler as listas soltas: quem chama resolve um a um, que é
      // lento mas nunca troca as pessoas.
      if (!pareado) return mapa;
      for (const [telefone, id] of pareado) mapa.set(telefone, id);
    } catch {
      return mapa; // endpoint indisponível — quem chama decide o que tentar depois
    }
  }
  return mapa;
}

/**
 * Acha, na paginação já usada por `handleList`, o contato cujo telefone bate
 * com o pedido — usada só quando criar um contato novo falha porque o
 * telefone já existe (ver `handleUpsert`). Não existe endpoint de busca por
 * telefone confirmado com o CRM; isto reaproveita o único jeito já testado
 * de enxergar a base (a mesma listagem paginada da tela de contatos).
 *
 * Mesmo padrão de `handleList` (páginas concorrentes, teto de tempo) — a
 * primeira versão disto varria página por página, esperando cada uma antes
 * de pedir a próxima, e numa base grande isso estourava o timeout de 15s de
 * alguma página no meio do caminho, derrubando o disparo inteiro com um erro
 * confuso. Uma página que falha ou demora agora só é ignorada — o disparo
 * original (telefone já existe) é o que sobe se a busca não achar nada a
 * tempo, que é um erro que pelo menos explica o que houve.
 */
async function buscarContatoPorTelefone(ownerId: string, phone: string): Promise<string | null> {
  const alvo = formaGravadaPeloCrm(soDigitos(phone));
  const inicio = Date.now();
  const pendentes: number[] = [];
  for (let p = 1; p <= MAX_PAGES; p++) pendentes.push(p);

  while (pendentes.length > 0) {
    if (Date.now() - inicio > PRAZO_MS) return null;
    const lote = pendentes.splice(0, CONCORRENCIA);
    const respostas = await Promise.all(
      lote.map((p) => buscarPagina(ownerId, p).catch(() => null)),
    );
    let algumaVazia = false;
    for (const res of respostas) {
      if (!res) continue; // página que falhou/demorou — ignora, não interrompe a busca
      const contatos = unwrap(res);
      if (!Array.isArray(contatos)) continue;
      if (contatos.length < PAGE_SIZE) algumaVazia = true;
      const achado = contatos.find((row: any) => soDigitos(row?.phone_number ?? row?.phone) === alvo);
      if (achado?.id) return String(achado.id);
    }
    if (algumaVazia) return null; // uma página incompleta é o fim real da base
  }
  return null;
}

/**
 * Pergunta direto ao CRM "existe alguém com este telefone?", em vez de
 * varrer a base paginada procurando (ver `buscarContatoPorTelefone`, que
 * fica como último recurso caso este endpoint não devolva nada — ele é novo
 * e ainda não testado à exaustão). `starts_with` com o telefone completo em
 * vez de `equal_to`/`eq` porque só o operador `starts_with` foi confirmado
 * funcionando pelo time do CRM (15/08); pra um telefone de tamanho fixo,
 * "começa com o número inteiro" equivale a "é igual".
 */
async function buscarContatoPorTelefoneViaFiltro(ownerId: string, phone: string): Promise<string | null> {
  const alvo = formaGravadaPeloCrm(soDigitos(phone));
  if (!alvo) return null;
  try {
    const res = await crmFetch(supabase, ownerId, "/api/v1/contacts/filter", {
      method: "POST",
      body: JSON.stringify({
        payload: [
          {
            attribute_key: "phone_number",
            filter_operator: "starts_with",
            values: [alvo],
            query_operator: null,
          },
        ],
      }),
    });
    const contatos = unwrap(res);
    if (!Array.isArray(contatos)) return null;
    const achado = contatos.find((row: any) => soDigitos(row?.phone_number ?? row?.phone) === alvo);
    return achado?.id ? String(achado.id) : null;
  } catch {
    return null; // endpoint novo, sem garantia — cai pra varredura paginada
  }
}

async function handleUpsert(
  ownerId: string,
  patient: { patientId: string; name: string; phone?: string | null },
  /**
   * `jaConsultado` = "o CRM já respondeu que não conhece este telefone".
   *
   * Só quem acabou de perguntar pode afirmar isso. Serve para o passo 3 de
   * `handleResolveBatch`, que chega aqui com a resposta do lote na mão: sem
   * isto, cada pessoa nova custava uma consulta individual para reconfirmar o
   * que o lote tinha acabado de dizer — numa seleção de 200 contatos novos,
   * 200 idas ao CRM que só repetiam uma resposta conhecida.
   *
   * A rede de segurança do 422 continua inteira: a corrida (alguém criar o
   * mesmo contato nesse meio-tempo) segue possível, e é lá que ela é tratada.
   */
  opcoes: { jaConsultado?: boolean } = {},
) {
  const { data: row, error } = await supabase
    .from("patients")
    .select("crm_contact_id")
    .eq("id", patient.patientId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  // Normalizado aqui como última garantia, mesmo que patients.phone já
  // devesse vir certo do lado de quem grava (patientInput, etc.) — telefone
  // sem o "55" do Brasil faz o CRM interpretar o DDD como código de outro
  // país e criar um contato pro qual o WhatsApp nunca entrega.
  const phone = patient.phone ? normalizeBrazilianPhone(patient.phone) : null;

  // Sem isto, o CRM cria o contato mas devolve `contact_inbox: null` — sem
  // o vínculo contato↔inbox (e o `source_id` que ele carrega), nenhuma
  // mensagem consegue ser entregue pra esse contato depois. Confirmado pelo
  // time do CRM (18/08), depois de investigarem um disparo real que falhou
  // silenciosamente por causa disso. Mesmo campo já lido do mesmo jeito em
  // `crm-campaigns/index.ts` e em `whatsapp-broadcast/index.ts`.
  const { data: cred } = await supabase
    .from("crm_credentials")
    .select("inbox_id")
    .eq("owner_id", ownerId)
    .maybeSingle();
  const inboxId: string | null = cred?.inbox_id ?? null;

  const body = { name: patient.name, phone_number: phone || undefined, inbox_id: inboxId || undefined };

  if (row?.crm_contact_id) {
    // Atualizar nome/telefone é acessório: se o CRM demorar, o vínculo que já
    // existe continua válido e o disparo segue.
    await crmFetch(supabase, ownerId, `/api/v1/contacts/${row.crm_contact_id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }).catch(() => null);
    return { ok: true, contactId: row.crm_contact_id };
  }

  // Resolve ANTES de criar (recomendação do time do CRM, 15/08) — evita
  // tentar criar um contato que já existe e só reagir ao 422 depois, que é
  // o jeito antigo mantido abaixo só como rede de segurança.
  //
  // Pular quando quem chamou já perguntou não é um atalho: criar é idempotente
  // por telefone (o CRM devolve o contato existente em vez de recusar, mesma
  // forma de resposta), então perguntar de novo não protege de nada — só custa
  // uma ida a mais por pessoa.
  let contactId: string | null =
    phone && !opcoes.jaConsultado ? await resolverTelefoneNoCrm(ownerId, phone) : null;

  if (!contactId) {
    try {
      const res = await crmFetch(supabase, ownerId, "/api/v1/contacts", {
        method: "POST",
        body: JSON.stringify(body),
      });
      // A resposta vem aninhada (`data.contact.id`, não `data.id`) desde que
      // `inbox_id` passou a ser enviado e o CRM também tenta devolver
      // `contact_inbox` junto — confirmado pelo time do CRM (18/08),
      // reproduzindo a chamada exata daqui. Vale pros dois status (201
      // criado, 200 já existia) — mesma estrutura nos dois. Mantém o
      // fallback pro formato antigo/plano por segurança.
      const dadosCriacao = unwrap(res);
      contactId = dadosCriacao?.contact?.id
        ? String(dadosCriacao.contact.id)
        : dadosCriacao?.id
          ? String(dadosCriacao.id)
          : null;
    } catch (e) {
      // Ainda pode cair aqui numa corrida rara (alguém criou o mesmo contato
      // entre o resolve acima e este create) ou se resolve_phones falhar
      // silenciosamente (endpoint novo). O mesmo vale quando o CRM demora e
      // o fetch é abortado ("TimeoutError: Signal timed out.") — a criação
      // pode ter acontecido do lado de lá mesmo assim.
      const mensagem = e instanceof Error ? e.message : String(e);
      const jaExiste = /\(422\)/.test(mensagem) && /already been taken/i.test(mensagem);
      const demorou = /timed out|TimeoutError|aborted|AbortError/i.test(mensagem);
      if ((jaExiste || demorou) && phone) {
        // resolve_phones de novo primeiro (fluxo recomendado pelo time do
        // CRM, 18/08) — se falhou na primeira vez (rede, falha momentânea),
        // é o jeito confiável de achar, já que aplica a regra do nono
        // dígito certinho. Os dois fallbacks abaixo só entram se isto
        // também não achar.
        contactId = await resolverTelefoneNoCrm(ownerId, phone);
        if (!contactId) contactId = await buscarContatoPorTelefoneViaFiltro(ownerId, phone);
        if (!contactId) contactId = await buscarContatoPorTelefone(ownerId, phone);
      }
      if (!contactId) {
        if (demorou) {
          throw new Error(
            "O CRM demorou demais para responder ao cadastrar o contato. Tente novamente em instantes.",
          );
        }
        throw e;
      }
    }
  }

  // Sem exceção nenhuma até aqui, mas também sem id: não segue como
  // "sucesso vazio" (o que já produziu um erro genérico e sem pista pro
  // usuário, "Não foi possível vincular X ao CRM antes de disparar" —
  // ver NewCampaignSheet.tsx) — melhor um erro específico agora do que
  // deixar o mistério pra descobrir de novo depois.
  if (!contactId) {
    throw new Error(
      "O CRM aceitou o contato mas não devolveu um id válido. Confira se o telefone tem o \"55\" " +
        "do Brasil na frente (use \"Corrigir telefones sem código do país\") e tente de novo.",
    );
  }

  await supabase
    .from("patients")
    .update({ crm_contact_id: contactId })
    .eq("id", patient.patientId)
    .eq("owner_id", ownerId);
  return { ok: true, contactId };
}

// 100 por página é o meio-termo entre número de requisições e tamanho de
// resposta. O teto de páginas é rede de segurança contra uma paginação que não
// termina: 50 × 100 = 5000 contatos, acima disso a tela avisa que truncou.
const PAGE_SIZE = 100;
const MAX_PAGES = 50;
// Buscar uma página de cada vez, esperando cada resposta antes de pedir a
// próxima, fazia uma base de ~4.500 contatos (45 páginas) levar dezenas de
// idas e vindas sequenciais ao CRM — a tela ficava presa em "carregando" por
// tempo suficiente para parecer travada. Pedir várias páginas ao mesmo tempo
// é o que torna isso rápido de verdade.
const CONCORRENCIA = 6;
// Teto de tempo total: melhor devolver o que já tem, marcado como truncado,
// do que deixar a função rodando até o Supabase matar a execução — aí a tela
// nunca saberia por quê.
const PRAZO_MS = 45_000;

interface CrmContact {
  id: string;
  name: string | null;
  phone: string | null;
  /** Caixa do contato, quando o CRM informar. Nome do campo não confirmado. */
  inboxId: string | null;
}

async function buscarPagina(ownerId: string, page: number, pageSize = PAGE_SIZE) {
  // Sem `unwrap` na resposta crua: ele devolve `data` e descarta o `meta`,
  // que é onde a paginação vive.
  return crmFetch(supabase, ownerId, `/api/v1/contacts?page=${page}&pageSize=${pageSize}`);
}

function contatosDaResposta(res: any): { contatos: CrmContact[]; total: number; camposDisponiveis: string[] } {
  const total = Number(res?.meta?.pagination?.total ?? 0);
  const lote = unwrap(res);
  const contatos: CrmContact[] = [];
  let camposDisponiveis: string[] = [];
  if (Array.isArray(lote)) {
    for (const row of lote) {
      if (!camposDisponiveis.length && row && typeof row === "object") {
        camposDisponiveis = Object.keys(row);
      }
      const inbox = row?.inbox_id ?? row?.inboxId ?? row?.inbox?.id ?? null;
      contatos.push({
        id: String(row?.id ?? ""),
        name: row?.name ?? null,
        phone: row?.phone_number ?? row?.phone ?? null,
        inboxId: inbox ? String(inbox) : null,
      });
    }
  }
  return { contatos, total, camposDisponiveis };
}

/**
 * Uma página só, sem laço nenhum — para o cliente puxar a base aos pedaços e
 * mostrar o que já chegou em vez de esperar tudo. É o que faz a tela deixar
 * de ficar presa em "carregando": a primeira página aparece em 1-2s, e o
 * resto entra por trás enquanto a pessoa já está vendo e filtrando.
 */
async function handlePage(ownerId: string, page: number, pageSize: number) {
  const res = await buscarPagina(ownerId, page, pageSize);
  return { ok: true, page, pageSize, ...contatosDaResposta(res) };
}

async function handleList(ownerId: string) {
  const inicio = Date.now();
  const contatos: CrmContact[] = [];
  let total = 0;
  let truncado = false;
  // Só os NOMES dos campos do primeiro contato, nunca os valores: serve para a
  // tela dizer o que o CRM devolve quando não achamos caixa nenhuma, sem
  // trafegar dado pessoal para diagnóstico.
  let camposDisponiveis: string[] = [];

  const registrar = (res: any): number => {
    total = Number(res?.meta?.pagination?.total ?? total);
    const lote = unwrap(res);
    if (!Array.isArray(lote)) return 0;
    for (const row of lote) {
      if (!camposDisponiveis.length && row && typeof row === "object") {
        camposDisponiveis = Object.keys(row);
      }
      const inbox = row?.inbox_id ?? row?.inboxId ?? row?.inbox?.id ?? null;
      contatos.push({
        id: String(row?.id ?? ""),
        name: row?.name ?? null,
        // O CRM guarda o telefone em `phone_number` — mesmo campo que o
        // handleUpsert escreve e que vem embutido em cada conversa.
        phone: row?.phone_number ?? row?.phone ?? null,
        inboxId: inbox ? String(inbox) : null,
      });
    }
    return lote.length;
  };

  // A primeira página sozinha: é dela que sai o total, que decide quantas
  // páginas ainda faltam pedir.
  const primeiraQtd = registrar(await buscarPagina(ownerId, 1));
  if (primeiraQtd === 0) {
    return { ok: true, contacts: contatos, total, truncado, camposDisponiveis };
  }
  if (primeiraQtd < PAGE_SIZE) {
    return { ok: true, contacts: contatos, total, truncado, camposDisponiveis };
  }

  let totalPaginas = Math.min(Math.ceil((total || 0) / PAGE_SIZE), MAX_PAGES);
  // O total do `meta` já foi tratado como confiável em outro lugar do sistema
  // (a estimativa de campanha lê só ele). Mas se vier ausente ou menor que uma
  // página já cheia, não dá pra confiar nele pra decidir quando parar —
  // melhor paginar até achar o fim (ou o teto) do que truncar por engano.
  if (totalPaginas <= 1) totalPaginas = MAX_PAGES;
  if (totalPaginas === MAX_PAGES) truncado = true;

  const pendentes: number[] = [];
  for (let p = 2; p <= totalPaginas; p++) pendentes.push(p);

  while (pendentes.length > 0) {
    if (Date.now() - inicio > PRAZO_MS) {
      truncado = true;
      break;
    }
    const lote = pendentes.splice(0, CONCORRENCIA);
    const respostas = await Promise.all(lote.map((p) => buscarPagina(ownerId, p)));
    let algumaVazia = false;
    for (const r of respostas) {
      if (registrar(r) < PAGE_SIZE) algumaVazia = true;
    }
    // Uma página que voltou incompleta é o fim real da base — mesmo que o
    // `meta.total` tivesse sugerido mais páginas.
    if (algumaVazia) break;
  }

  return { ok: true, contacts: contatos, total, truncado, camposDisponiveis };
}

/**
 * Vincula de uma vez só todo paciente sem `crm_contact_id` cujo telefone já
 * existe como contato no CRM — o backfill que faz o caso comum (base de
 * pacientes que já se sobrepõe à base de contatos do CRM, porque o WhatsApp
 * da clínica já vinha recebendo mensagem dessas pessoas antes) parar de
 * bater no fluxo lento de criar/reagir a 422 a cada disparo.
 *
 * Resolve em lote (`resolverTelefonesEmLote`), agora que o CRM devolve
 * `results` já pareando telefone e id. Quem o lote não achar passa pelo
 * caminho um-a-um e, se ainda assim não aparecer, pela busca em
 * `/contacts/filter` (ver `buscarContatoPorTelefoneViaFiltro`).
 */
async function handleBackfillLinks(ownerId: string) {
  const { data: pacientes, error } = await supabase
    .from("patients")
    .select("id, phone")
    .eq("owner_id", ownerId)
    .is("crm_contact_id", null)
    .not("phone", "is", null);
  if (error) throw new Error(error.message);

  let linkados = 0;
  const semMatch: { id: string; phone: string }[] = [];

  const vincular = async (id: string, contactId: string) => {
    const { error: updError } = await supabase
      .from("patients")
      .update({ crm_contact_id: contactId })
      .eq("id", id)
      .eq("owner_id", ownerId);
    if (!updError) linkados++;
  };

  // Uma chamada por lote de 1000 em vez de uma por paciente: numa base de
  // ~4.500 pacientes isso sai de milhares de requisições para meia dúzia.
  const todos = (pacientes ?? []) as { id: string; phone: string }[];
  const emLote = await resolverTelefonesEmLote(ownerId, todos.map((p) => p.phone));
  const pendentes: { id: string; phone: string }[] = [];
  for (const p of todos) {
    const contactId = emLote.get(normalizeBrazilianPhone(p.phone)) ?? emLote.get(p.phone);
    if (contactId) await vincular(p.id, contactId);
    else pendentes.push({ id: p.id, phone: p.phone });
  }

  while (pendentes.length > 0) {
    const lote = pendentes.splice(0, CONCORRENCIA);
    const resultados = await Promise.all(
      lote.map(async (p) => ({ id: p.id, phone: p.phone, contactId: await resolverTelefoneNoCrm(ownerId, p.phone) })),
    );
    for (const r of resultados) {
      if (!r.contactId) {
        semMatch.push({ id: r.id, phone: r.phone });
        continue;
      }
      await vincular(r.id, r.contactId);
    }
  }

  // Segunda tentativa, só pra quem resolve_phones não achou.
  while (semMatch.length > 0) {
    const lote = semMatch.splice(0, CONCORRENCIA);
    const resultados = await Promise.all(
      lote.map(async (p) => ({ id: p.id, contactId: await buscarContatoPorTelefoneViaFiltro(ownerId, p.phone) })),
    );
    for (const r of resultados) {
      if (!r.contactId) continue;
      await vincular(r.id, r.contactId);
    }
  }

  return {
    ok: true,
    pacientesSemVinculo: (pacientes ?? []).length,
    linkados,
    baseTruncada: false,
  };
}

/**
 * Vincula ao CRM uma LISTA de pacientes, de uma vez.
 *
 * Existe porque o disparo fazia isso pelo caminho errado: o navegador chamava
 * `garantirContatoCrm` uma vez por contato, em série, cada uma com duas
 * tentativas e 55s de timeout. Numa seleção de 200 pacientes era o
 * "Enfileirando…" que não terminava.
 *
 * Aqui é o mesmo padrão que `handleBackfillLinks` já usa para a base inteira —
 * `resolve_phones` em lote, com o caminho um-a-um só para o punhado que ele não
 * achar. Quem já tem `crm_contact_id` gravado nem chega a ser consultado.
 *
 * Devolve o mapa `patientId → contactId`. Quem não resolveu simplesmente não
 * aparece no mapa: o chamador decide se isso derruba o disparo ou se a pessoa
 * fica de fora com aviso — e ele decidiu ficar de fora com aviso.
 */
async function handleResolveBatch(
  ownerId: string,
  pacientes: { patientId: string; name?: string | null; phone?: string | null }[],
) {
  const mapa: Record<string, string> = {};
  if (!pacientes?.length) return { ok: true, contatos: mapa };

  // 1. Quem já está vinculado sai daqui sem custo nenhum.
  const ids = [...new Set(pacientes.map((p) => p.patientId))];
  const { data: jaLinkados } = await supabase
    .from("patients")
    .select("id, crm_contact_id, phone")
    .eq("owner_id", ownerId)
    .in("id", ids);

  const telefonePorId = new Map<string, string>();
  for (const row of (jaLinkados ?? []) as any[]) {
    if (row.crm_contact_id) mapa[String(row.id)] = String(row.crm_contact_id);
    else if (row.phone) telefonePorId.set(String(row.id), String(row.phone));
  }

  // 2. O resto vai para `resolve_phones` numa chamada só. Uma seleção de 200
  //    pessoas era 200 requisições ao CRM (6 de cada vez); agora é uma.
  const pendentes = [...telefonePorId.entries()];
  const semMatch: [string, string][] = [];
  const emLote = await resolverTelefonesEmLote(ownerId, pendentes.map(([, phone]) => phone));
  const naoResolvidos: [string, string][] = [];
  for (const [id, phone] of pendentes) {
    const contactId = emLote.get(normalizeBrazilianPhone(phone)) ?? emLote.get(phone);
    if (contactId) mapa[id] = contactId;
    else naoResolvidos.push([id, phone]);
  }

  // Quem o lote não achou ainda passa pelo caminho um-a-um: ou o CRM está numa
  // versão sem `results` (aí o lote volta vazio e isto resolve tudo), ou é só
  // um telefone que ele não conhece — e nesse caso a chamada individual é
  // barata, porque sobraram poucos.
  while (naoResolvidos.length > 0) {
    const lote = naoResolvidos.splice(0, CONCORRENCIA);
    const resultados = await Promise.all(
      lote.map(async ([id, phone]) => [id, phone, await resolverTelefoneNoCrm(ownerId, phone)] as const),
    );
    for (const [id, phone, contactId] of resultados) {
      if (contactId) mapa[id] = contactId;
      else semMatch.push([id, phone]);
    }
  }

  // 3. Quem o CRM não conhece precisa ser criado — o caminho caro, agora só
  //    para os poucos que sobraram em vez de para a seleção inteira.
  const porId = new Map(pacientes.map((p) => [p.patientId, p]));
  const criar = [...semMatch];
  while (criar.length > 0) {
    const lote = criar.splice(0, CONCORRENCIA);
    const resultados = await Promise.all(
      lote.map(async ([id]) => {
        const p = porId.get(id);
        try {
          const r = await handleUpsert(
            ownerId,
            { patientId: id, name: p?.name ?? "", phone: p?.phone ?? "" },
            // O lote acima já perguntou por este telefone e o CRM respondeu que
            // não conhece. Perguntar de novo, uma pessoa por vez, era a última
            // ida redundante que sobrava no caminho de "vinculando contatos".
            { jaConsultado: true },
          );
          return [id, (r as any)?.contactId ?? null] as const;
        } catch (_) {
          // Um contato que o CRM recusa não pode derrubar os outros 199.
          return [id, null] as const;
        }
      }),
    );
    for (const [id, contactId] of resultados) if (contactId) mapa[id] = String(contactId);
  }

  // Grava os vínculos novos de uma vez, para o próximo disparo já achar tudo
  // no passo 1 e nem consultar o CRM.
  const novos = Object.entries(mapa).filter(([id]) => telefonePorId.has(id));
  await Promise.all(
    novos.map(([id, contactId]) =>
      supabase
        .from("patients")
        .update({ crm_contact_id: contactId })
        .eq("id", id)
        .eq("owner_id", ownerId),
    ),
  );

  return { ok: true, contatos: mapa, resolvidos: Object.keys(mapa).length, pedidos: ids.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const { ownerId, action, patient, patients, page, pageSize } = (await req.json()) as {
      ownerId?: string;
      action?: string;
      patient?: { patientId: string; name: string; phone?: string | null };
      /** Lista para `resolve-batch` — vincular a seleção inteira de um disparo
       *  numa chamada, em vez de uma por contato. */
      patients?: { patientId: string; name?: string | null; phone?: string | null }[];
      /** Presente = uma página só (handlePage). Ausente = varredura completa
       *  no servidor (handleList), mantida por compatibilidade. */
      page?: number;
      pageSize?: number;
    };
    if (!ownerId || !action) {
      return new Response(JSON.stringify({ error: "ownerId e action são obrigatórios" }), { status: 400 });
    }
    let result: unknown;
    if (action === "list" && typeof page === "number") {
      result = await handlePage(ownerId, page, pageSize || PAGE_SIZE);
    } else if (action === "list") {
      result = await handleList(ownerId);
    } else if (action === "upsert" && patient) {
      result = await handleUpsert(ownerId, patient);
    } else if (action === "resolve-batch") {
      result = await handleResolveBatch(ownerId, patients ?? []);
    } else if (action === "backfill-links") {
      result = await handleBackfillLinks(ownerId);
    } else {
      return new Response(JSON.stringify({ error: "action/patient inválidos" }), { status: 400 });
    }

    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("[crm-contacts]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
