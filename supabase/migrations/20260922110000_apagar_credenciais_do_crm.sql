-- Apaga o que sobrou do CRM no banco.
--
-- ── A tabela de credenciais ──────────────────────────────────────────────
--
-- `crm_credentials` guardava o e-mail, a SENHA e o token de acesso da conta do
-- CRM, além do id da caixa de WhatsApp, do pipeline e do limite diário de
-- envio. Nada disso é lido por linha nenhuma de código desde que o funil, os
-- modelos, a cota e o envio passaram a ser nossos.
--
-- Apagar não é só faxina: enquanto ela existir, uma senha de um serviço
-- externo fica guardada num banco que ninguém mais tem motivo para consultar.
-- Credencial parada é credencial esquecida.
--
-- O limite diário já mudou de casa em `whatsapp_send_settings`, com o valor
-- que a clínica tinha escolhido — foi copiado na migration de 21/09.
--
-- ── Os índices únicos antigos ────────────────────────────────────────────
--
-- `idx_wa_contacts_crm`, `idx_wa_conversations_crm` e `idx_wa_messages_crm`
-- são de antes de o espelho ter duas origens. Cada um exige que o id seja
-- único IGNORANDO a origem, enquanto toda escrita de hoje usa a chave com
-- origem (`idx_..._origem_crm`, que continuam).
--
-- Hoje não colidem por sorte: os ids herdados são UUIDs do CRM e os da conexão
-- própria são jids do WhatsApp. É uma armadilha esperando: no dia em que um id
-- se repetisse entre as duas origens, a gravação falharia com um conflito num
-- índice que ninguém lembra que existe — e a mensagem do paciente não entraria.

DROP TABLE IF EXISTS public.crm_credentials;

DROP INDEX IF EXISTS public.idx_wa_contacts_crm;
DROP INDEX IF EXISTS public.idx_wa_conversations_crm;
DROP INDEX IF EXISTS public.idx_wa_messages_crm;

-- ── O que NÃO é apagado, e por quê ──────────────────────────────────────
--
-- `crm_campaign_sends` continua, com o nome errado. Ela é o registro de quanto
-- já saiu hoje — a cota que protege o número —, escrita pelo cron a cada
-- minuto. Renomear exige que a migration e o deploy das funções aconteçam na
-- ordem certa, e no Lovable eles são dois passos manuais sem ordem garantida:
-- entre um e outro, o contador do dia pararia de funcionar. Um nome feio custa
-- menos que isso.
--
-- As colunas `crm_contact_id` de `patients`, `wa_contacts` e `wa_conversations`
-- também ficam. Não são do CRM: são o identificador da pessoa no WhatsApp, e é
-- por elas que a Meta ainda acha o paciente de uma conversão antiga.
