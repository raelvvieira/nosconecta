-- A unidade que não é a principal nasce como unidade de viagem.
--
-- ── Por que ───────────────────────────────────────────────────────────────
--
-- A migration de ontem criou `schedule_mode`, com `'weekly'` como padrão —
-- ou seja, as duas unidades continuaram "abertas de segunda a sábado", que é
-- como estão cadastradas em `clinic_business_hours`. A de Porto Alegre com
-- duas cadeiras e ninguém lá na maior parte dos dias.
--
-- Isso dependia de alguém abrir a tela e ligar uma chave. Enquanto não
-- ligasse, a agenda de Porto Alegre tinha vaga livre em todo dia do
-- calendário — e a Luna passou a poder oferecer essa agenda a quem tem DDD de
-- lá, sem esperar confirmação. Deixar o padrão errado e contar com um clique
-- é o tipo de coisa que só se descobre pela paciente que viajou à toa.
--
-- A clínica foi explícita sobre a regra, em 20/10: "o que não tiver marcado no
-- calendário de Porto Alegre é Florianópolis". É essa frase que esta migration
-- escreve no banco.
--
-- ── O que ela NÃO faz ─────────────────────────────────────────────────────
--
-- Não toca em unidade que já tenha dia marcado: ali alguém já decidiu, e
-- recombinar as migrations (o Lovable faz isso) não pode desfazer uma decisão.
-- Também não toca na unidade principal, nem em unidade inativa.
--
-- Zero dias marcados quer dizer zero horários naquela unidade. É o lado
-- seguro: a Luna diz que a equipe confirma as próximas datas de atendimento
-- lá, em vez de oferecer um dia em que a sala está vazia.
UPDATE public.clinic_units u
SET schedule_mode = 'by_date',
    updated_at = now()
WHERE u.is_default IS DISTINCT FROM true
  AND u.active
  AND coalesce(u.schedule_mode, 'weekly') = 'weekly'
  AND NOT EXISTS (
    SELECT 1 FROM public.clinic_unit_dates d WHERE d.unit_id = u.id
  );