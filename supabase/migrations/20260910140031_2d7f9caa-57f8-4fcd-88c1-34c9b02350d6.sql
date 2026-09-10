-- Estas funções são usadas apenas por gatilhos internos do banco. Deixá-las
-- executáveis por authenticated/public sem necessidade aumenta a superfície de
-- ataque sem ganho nenhum — gatilhos não precisam de GRANT EXECUTE para rodar.

REVOKE EXECUTE ON FUNCTION public.card_invoice_recalc(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.card_invoice_recalc(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.card_purchase_freeze() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.card_purchase_freeze() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.card_purchase_sync() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.card_purchase_sync() FROM authenticated;