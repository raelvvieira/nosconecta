// A regra é compartilhada com as Edge Functions: a Luna grava o público na
// sessão e o Pipeline lê o mesmo rótulo.
export {
  PUBLICOS,
  ehPublico,
  publicoDoContato,
  type Publico,
} from "../../../supabase/functions/_shared/publico.ts";
