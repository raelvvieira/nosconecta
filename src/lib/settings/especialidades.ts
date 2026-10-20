/**
 * As especialidades que uma pessoa pode escolher na ficha clínica.
 *
 * ── Por que uma lista, e não um campo de texto ────────────────────────────
 *
 * O campo era livre, e um campo livre numa clínica de duas unidades vira
 * "Ortodontia", "ortodontia", "Orto" e "Ortodontista" — quatro coisas para o
 * sistema, uma só para quem lê. Enquanto a especialidade só aparecia embaixo
 * do nome isso não doía; a partir do momento em que ela é escolhida pela
 * própria pessoa, no cadastro dela, doeria na primeira semana.
 *
 * A lista são as especialidades reconhecidas pelo Conselho Federal de
 * Odontologia, mais "Clínica Geral" na frente — que não é especialidade e é
 * como a maioria se descreve.
 *
 * ── Por que em código ─────────────────────────────────────────────────────
 *
 * Porque ela muda a cada anos, não a cada semana, e porque uma tabela no banco
 * exigiria uma tela para administrá-la — uma tela a mais para resolver um
 * problema que a clínica não tem. Quando o CFO reconhecer outra, é uma linha
 * aqui.
 */
export const ESPECIALIDADES: readonly string[] = [
  "Clínica Geral",
  "Acupuntura",
  "Cirurgia e Traumatologia Buco-Maxilo-Faciais",
  "Dentística",
  "Disfunção Temporomandibular e Dor Orofacial",
  "Endodontia",
  "Estomatologia",
  "Harmonização Orofacial",
  "Homeopatia",
  "Implantodontia",
  "Odontogeriatria",
  "Odontologia do Esporte",
  "Odontologia do Trabalho",
  "Odontologia Legal",
  "Odontologia para Pacientes com Necessidades Especiais",
  "Odontopediatria",
  "Ortodontia",
  "Ortopedia Funcional dos Maxilares",
  "Patologia Oral e Maxilofacial",
  "Periodontia",
  "Prótese Buco-Maxilo-Facial",
  "Prótese Dentária",
  "Radiologia Odontológica e Imaginologia",
  "Odontologia em Saúde Coletiva",
];

/**
 * Deixa passar só o que está na lista, sem repetir, na ordem da lista.
 *
 * É a fronteira: a escolha chega de um formulário que a própria pessoa
 * preenche — no convite, antes de ela ter qualquer acesso — e o que vier de
 * fora da lista não entra. A ordem sai da lista e não da ordem dos cliques
 * para a mesma dentista não aparecer "Ortodontia · Dentística" numa tela e
 * "Dentística · Ortodontia" em outra.
 */
export function especialidadesValidas(escolhidas: readonly string[] | null | undefined): string[] {
  const pedidas = new Set((escolhidas ?? []).map((e) => String(e ?? "").trim()));
  return ESPECIALIDADES.filter((e) => pedidas.has(e));
}

/**
 * O texto de uma linha só, para onde cabe uma linha só — o rodapé do nome na
 * agenda, a lista de pessoas.
 *
 * Vazio vira "Odontologia": é o que a tela de cadastros já mostrava para quem
 * não tinha especialidade preenchida, e trocar isso por um espaço em branco
 * seria uma regressão de leitura.
 */
export function especialidadesEmTexto(
  especialidades: readonly string[] | null | undefined,
): string {
  const lista = especialidadesValidas(especialidades);
  return lista.length ? lista.join(" · ") : "";
}
