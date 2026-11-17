/**
 * Converte os retornos que o sistema criou sozinho na agenda (consultas
 * `return` pendentes, no futuro, com a observação "Retorno do atendimento de …")
 * em itens da lista "Retornos a agendar".
 *
 *   node scripts/migracao/converter-retornos-em-lista.mjs --conta nos@x.com
 *       (só mostra o que faria: NADA é gravado)
 *   node scripts/migracao/converter-retornos-em-lista.mjs --conta nos@x.com --aplicar
 *
 * Só toca no que é inequivocamente automático: tipo retorno, status pendente,
 * data de hoje em diante, observação padrão do sistema. Retorno que alguém
 * confirmou, concluiu ou escreveu à mão fica onde está. Na aplicação, cada
 * retorno vira linha da lista E sai da agenda numa única instrução — se a
 * primeira falhar, nada é apagado. Exige a migração `retornos_a_agendar`.
 */
import { projetoNovo, sql } from "./api.mjs";

const arg = (nome) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : null;
};
const aplicar = process.argv.includes("--aplicar");
const conta = arg("conta");
if (!conta) {
  console.error("Uso: --conta <e-mail do dono> [--aplicar]");
  process.exit(1);
}
const ref = projetoNovo();
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const [dono] = await sql(ref, `select id from auth.users where lower(email) = lower(${q(conta)})`);
if (!dono) throw new Error("Nenhum login com esse e-mail.");

const filtro = `owner_id = '${dono.id}' and type = 'return' and status = 'pending'
  and date >= (now() at time zone 'America/Sao_Paulo')::date
  and notes like 'Retorno do atendimento de %'`;

const itens = await sql(
  ref,
  `select patient_name, date, procedure_name from appointments where ${filtro} order by date`,
);
console.log(`${itens.length} retorno(s) automático(s) pendente(s) no futuro.`);
for (const i of itens.slice(0, 10)) console.log(` · ${i.date} ${i.patient_name}`);
if (itens.length > 10) console.log(` … e mais ${itens.length - 10}`);
if (!aplicar) {
  console.log("Simulação: nada foi gravado. Acrescente --aplicar para converter.");
  process.exit(0);
}
const feito = await sql(
  ref,
  `with movidos as (
     insert into retornos_a_agendar
       (owner_id, unit_id, patient_id, patient_name, procedure_name, professional_id,
        professional_name, hora_sugerida, hora_fim_sugerida, data_prevista, observacao)
     select owner_id, unit_id, patient_id, patient_name, nullif(procedure_name,'Consulta'),
            professional_id, nullif(professional_name,''), start_time, end_time, date, notes
       from appointments where ${filtro}
     returning 1
   ), apagados as (
     delete from appointments where ${filtro} returning 1
   )
   select (select count(*) from movidos) as na_lista, (select count(*) from apagados) as saiu_da_agenda`,
);
console.log("Convertidos:", JSON.stringify(feito[0]));
process.exit(0);
