import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Lista curada em vez de biblioteca externa: cobre o que se usa num
// atendimento de clínica sem somar peso de dependência ao bundle. Os termos
// de busca são em pt-BR porque é o idioma de quem atende.
interface EmojiGroup {
  id: string;
  label: string;
  icon: string;
  emojis: { char: string; terms: string }[];
}

const GROUPS: EmojiGroup[] = [
  {
    id: "rostos",
    label: "Rostos",
    icon: "😀",
    emojis: [
      { char: "😀", terms: "feliz sorriso alegre" },
      { char: "😃", terms: "feliz sorriso" },
      { char: "😄", terms: "feliz rindo" },
      { char: "😁", terms: "sorriso dentes" },
      { char: "😊", terms: "feliz timido simpatico" },
      { char: "🙂", terms: "sorriso leve" },
      { char: "😉", terms: "piscada" },
      { char: "😍", terms: "amor apaixonado coracao" },
      { char: "🥰", terms: "amor carinho" },
      { char: "😘", terms: "beijo" },
      { char: "😂", terms: "rindo chorando engracado" },
      { char: "🤣", terms: "rindo muito engracado" },
      { char: "😅", terms: "alivio suor" },
      { char: "😎", terms: "oculos estiloso" },
      { char: "🤩", terms: "estrelas uau" },
      { char: "🥳", terms: "festa comemorar" },
      { char: "🤗", terms: "abraco" },
      { char: "🤔", terms: "pensando duvida" },
      { char: "😐", terms: "neutro" },
      { char: "😴", terms: "sono dormindo" },
      { char: "😢", terms: "triste chorando" },
      { char: "😭", terms: "chorando muito" },
      { char: "😡", terms: "raiva bravo" },
      { char: "😱", terms: "susto medo" },
      { char: "🤒", terms: "doente febre" },
      { char: "🤕", terms: "machucado dor" },
      { char: "😷", terms: "mascara doente" },
      { char: "🥺", terms: "por favor suplicando" },
    ],
  },
  {
    id: "gestos",
    label: "Gestos",
    icon: "👍",
    emojis: [
      { char: "👍", terms: "joia positivo ok curtir" },
      { char: "👎", terms: "negativo nao" },
      { char: "👌", terms: "ok perfeito" },
      { char: "🙏", terms: "obrigado por favor oracao" },
      { char: "👏", terms: "palmas parabens" },
      { char: "🤝", terms: "acordo aperto de mao" },
      { char: "✌️", terms: "paz vitoria" },
      { char: "🤞", terms: "dedos cruzados sorte" },
      { char: "💪", terms: "forca musculo" },
      { char: "👋", terms: "oi tchau aceno" },
      { char: "🙌", terms: "comemorar maos" },
      { char: "✍️", terms: "escrevendo anotar" },
      { char: "👉", terms: "aponta direita" },
      { char: "👇", terms: "aponta baixo" },
      { char: "☝️", terms: "atencao aponta cima" },
      { char: "🫶", terms: "coracao maos amor" },
    ],
  },
  {
    id: "coracoes",
    label: "Corações",
    icon: "❤️",
    emojis: [
      { char: "❤️", terms: "amor coracao vermelho" },
      { char: "🧡", terms: "coracao laranja" },
      { char: "💛", terms: "coracao amarelo" },
      { char: "💚", terms: "coracao verde" },
      { char: "💙", terms: "coracao azul" },
      { char: "💜", terms: "coracao roxo" },
      { char: "🩷", terms: "coracao rosa" },
      { char: "🤍", terms: "coracao branco" },
      { char: "💖", terms: "coracao brilhante" },
      { char: "💕", terms: "coracoes amor" },
      { char: "✨", terms: "brilho estrelas" },
      { char: "⭐", terms: "estrela" },
      { char: "🌟", terms: "estrela brilhante" },
      { char: "🔥", terms: "fogo top" },
      { char: "🎉", terms: "festa parabens comemorar" },
      { char: "🎊", terms: "confete festa" },
    ],
  },
  {
    id: "saude",
    label: "Saúde",
    icon: "🦷",
    emojis: [
      { char: "🦷", terms: "dente dental odonto" },
      { char: "🪥", terms: "escova dente higiene" },
      { char: "😁", terms: "sorriso dentes" },
      { char: "🩺", terms: "estetoscopio medico" },
      { char: "💊", terms: "remedio comprimido" },
      { char: "💉", terms: "injecao anestesia vacina" },
      { char: "🏥", terms: "hospital clinica" },
      { char: "🧑‍⚕️", terms: "dentista profissional saude" },
      { char: "📋", terms: "prontuario ficha" },
      { char: "🩹", terms: "curativo band aid" },
      { char: "😬", terms: "dentes nervoso" },
      { char: "🧼", terms: "higiene limpeza" },
    ],
  },
  {
    id: "agenda",
    label: "Agenda",
    icon: "📅",
    emojis: [
      { char: "📅", terms: "calendario data agenda" },
      { char: "🗓️", terms: "calendario agenda" },
      { char: "⏰", terms: "despertador horario alarme" },
      { char: "🕐", terms: "relogio hora" },
      { char: "⏳", terms: "ampulheta aguardando" },
      { char: "📍", terms: "local endereco" },
      { char: "🗺️", terms: "mapa localizacao" },
      { char: "🚗", terms: "carro chegar" },
      { char: "✅", terms: "confirmado check ok" },
      { char: "❌", terms: "cancelado erro nao" },
      { char: "⚠️", terms: "atencao aviso" },
      { char: "🔔", terms: "lembrete sino notificacao" },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    icon: "💰",
    emojis: [
      { char: "💰", terms: "dinheiro pagamento" },
      { char: "💵", terms: "dinheiro nota" },
      { char: "💳", terms: "cartao pagamento" },
      { char: "🧾", terms: "recibo nota fiscal" },
      { char: "📄", terms: "documento arquivo" },
      { char: "📎", terms: "anexo clipe" },
      { char: "✉️", terms: "email mensagem" },
      { char: "📱", terms: "celular telefone whatsapp" },
      { char: "📞", terms: "ligacao telefone" },
      { char: "💬", terms: "conversa mensagem balao" },
      { char: "📊", terms: "grafico relatorio" },
      { char: "🔗", terms: "link" },
    ],
  },
];

export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState(GROUPS[0].id);

  const searching = query.trim().length > 0;
  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    if (!q) return [];
    return GROUPS.flatMap((g) => g.emojis).filter((e) => e.terms.includes(q) || e.char === q);
  }, [query]);

  const visible = searching ? results : (GROUPS.find((g) => g.id === activeGroup) ?? GROUPS[0]).emojis;

  return (
    <div className="w-[320px]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar emojis..."
          className="h-9 rounded-xl pl-9 text-sm"
        />
      </div>

      {!searching && (
        <div className="mt-2 flex items-center gap-0.5 border-b border-border pb-2">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setActiveGroup(g.id)}
              title={g.label}
              aria-label={g.label}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-lg text-base transition-colors",
                activeGroup === g.id ? "bg-coral-soft" : "hover:bg-muted",
              )}
            >
              {g.icon}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 max-h-[220px] overflow-y-auto">
        {visible.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Nenhum emoji encontrado.</p>
        ) : (
          <div className="grid grid-cols-8 gap-0.5">
            {visible.map((e, i) => (
              <button
                key={`${e.char}-${i}`}
                type="button"
                onClick={() => onSelect(e.char)}
                title={e.terms.split(" ")[0]}
                className="grid h-9 w-9 place-items-center rounded-lg text-xl transition-transform hover:scale-125 hover:bg-muted"
              >
                {e.char}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
