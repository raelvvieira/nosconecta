export const MESSAGE_VARIABLES: { label: string; placeholder: string; sample: string }[] = [
  { label: "Primeiro nome", placeholder: "{{primeiro_nome}}", sample: "Maria" },
  { label: "Nome completo", placeholder: "{{nome_completo}}", sample: "Maria Silva" },
  { label: "Telefone", placeholder: "{{telefone}}", sample: "(11) 99999-0000" },
  {
    label: "Data atual",
    placeholder: "{{data_atual}}",
    sample: new Date().toLocaleDateString("pt-BR"),
  },
];

export function renderMessagePreview(content: string): string {
  let result = content;
  for (const v of MESSAGE_VARIABLES) result = result.split(v.placeholder).join(v.sample);
  return result;
}

export function VariableChips({ onInsert }: { onInsert: (placeholder: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-[11px] text-muted-foreground">Inserir variável:</span>
      {MESSAGE_VARIABLES.map((v) => (
        <button
          key={v.placeholder}
          type="button"
          onClick={() => onInsert(v.placeholder)}
          className="text-[11px] font-medium text-pink hover:underline"
        >
          {v.label}
        </button>
      ))}
      <span className="text-[10px] text-warning">Sintaxe não confirmada com o CRM — teste antes de usar</span>
    </div>
  );
}
