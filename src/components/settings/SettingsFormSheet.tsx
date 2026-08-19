import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Armchair, Building2, BriefcaseMedical, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  saveSetting,
  type SettingsRecord,
  type SettingsSection,
  type UnitSetting,
} from "@/lib/settings/settings.functions";

type Props = {
  open: boolean;
  section: SettingsSection;
  item?: SettingsRecord | null;
  /** Só preenchido (e o seletor só aparece) para profissionais/cadeiras — e
   *  mesmo assim só quando `isAdmin`; quem não administra nunca escolhe
   *  unidade, o servidor carimba a dele sozinho. */
  units?: UnitSetting[];
  isAdmin?: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

const META = {
  professionals: {
    title: "profissional",
    icon: Stethoscope,
    description: "Este cadastro aparece na agenda, nos recebimentos e nas comissões.",
  },
  chairs: {
    title: "cadeira",
    icon: Armchair,
    description: "Organize os recursos disponíveis para evitar conflitos na agenda.",
  },
  procedures: {
    title: "procedimento",
    icon: BriefcaseMedical,
    description: "Defina duração, preço e custo usados no agendamento e no financeiro.",
  },
  units: {
    title: "unidade",
    icon: Building2,
    description: "Cada unidade separa pacientes, agenda e financeiro entre si.",
  },
} as const;

const EMPTY = {
  professionals: {
    name: "",
    specialty: "",
    registrationNumber: "",
    phone: "",
    email: "",
    commissionPct: 0,
    color: "#8B5CF6",
    active: true,
    unitId: null as string | null,
  },
  chairs: { name: "", roomName: "", color: "#FF7A59", active: true, notes: "", unitId: null as string | null },
  procedures: { name: "", category: "", durationMinutes: 60, price: 0, cost: 0, active: true },
  units: { name: "", address: "", active: true },
};

export function SettingsFormSheet({ open, section, item, units, isAdmin, onOpenChange, onSaved }: Props) {
  const save = useServerFn(saveSetting);
  const [form, setForm] = useState<Record<string, unknown>>({ ...EMPTY[section] });
  const meta = META[section];
  const Icon = meta.icon;
  const showUnitSelect = isAdmin && (section === "professionals" || section === "chairs");

  useEffect(() => {
    if (!open) return;
    const base = { ...EMPTY[section] };
    // Unidade padrão pré-selecionada pra não travar o admin num formulário
    // vazio quando só existe uma unidade (o caso comum logo após a migração).
    if (!item && (section === "professionals" || section === "chairs") && units?.length) {
      (base as any).unitId = units.find((u) => u.isDefault)?.id ?? units[0].id;
    }
    setForm(item ? { ...item } : base);
  }, [item, open, section, units]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!String(form.name ?? "").trim()) throw new Error("Informe um nome.");
      if (showUnitSelect && !form.unitId) {
        throw new Error("Selecione a unidade.");
      }
      return save({ data: { section, item: form } });
    },
    onSuccess: () => {
      toast.success(item ? "Alterações salvas" : `${capitalize(meta.title)} adicionado`);
      onOpenChange(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const set = (field: string, value: unknown) =>
    setForm((current) => ({ ...current, [field]: value }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-[540px]">
        <SheetHeader className="border-b border-border bg-gradient-to-br from-pink-soft/60 to-coral-soft/40 px-6 py-5 text-left">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-primary text-white shadow-soft">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <SheetTitle>{item ? `Editar ${meta.title}` : `Adicionar ${meta.title}`}</SheetTitle>
              <SheetDescription>{meta.description}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form
          className="space-y-6 px-6 py-6"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <Field label={section === "chairs" ? "Nome da cadeira *" : "Nome *"}>
            <Input
              value={String(form.name ?? "")}
              onChange={(event) => set("name", event.target.value)}
              autoFocus
              placeholder={namePlaceholder(section)}
            />
          </Field>

          {section === "professionals" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Especialidade">
                  <Input
                    value={String(form.specialty ?? "")}
                    onChange={(event) => set("specialty", event.target.value)}
                    placeholder="Ex.: Ortodontia"
                  />
                </Field>
                <Field label="Registro profissional">
                  <Input
                    value={String(form.registrationNumber ?? "")}
                    onChange={(event) => set("registrationNumber", event.target.value)}
                    placeholder="CRO-SP 00000"
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Telefone">
                  <Input
                    value={String(form.phone ?? "")}
                    onChange={(event) => set("phone", event.target.value)}
                    placeholder="(11) 99999-9999"
                  />
                </Field>
                <Field label="E-mail">
                  <Input
                    type="email"
                    value={String(form.email ?? "")}
                    onChange={(event) => set("email", event.target.value)}
                    placeholder="nome@clinica.com"
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Comissão (%)">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={Number(form.commissionPct ?? 0)}
                    onChange={(event) => set("commissionPct", Number(event.target.value))}
                  />
                </Field>
                <ColorField
                  value={String(form.color ?? "#8B5CF6")}
                  onChange={(value) => set("color", value)}
                />
              </div>
              {showUnitSelect && (
                <UnitField value={form.unitId as string | null} units={units ?? []} onChange={(v) => set("unitId", v)} />
              )}
            </>
          )}

          {section === "chairs" && (
            <>
              <Field label="Consultório ou sala">
                <Input
                  value={String(form.roomName ?? "")}
                  onChange={(event) => set("roomName", event.target.value)}
                  placeholder="Ex.: Consultório 1"
                />
              </Field>
              <ColorField
                value={String(form.color ?? "#FF7A59")}
                onChange={(value) => set("color", value)}
              />
              <Field label="Observações">
                <Textarea
                  rows={3}
                  value={String(form.notes ?? "")}
                  onChange={(event) => set("notes", event.target.value)}
                  placeholder="Procedimentos indicados ou restrições"
                />
              </Field>
              {showUnitSelect && (
                <UnitField value={form.unitId as string | null} units={units ?? []} onChange={(v) => set("unitId", v)} />
              )}
            </>
          )}

          {section === "procedures" && (
            <>
              <Field label="Categoria">
                <Input
                  value={String(form.category ?? "")}
                  onChange={(event) => set("category", event.target.value)}
                  placeholder="Ex.: Estética"
                />
              </Field>
              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
                <Field label="Duração">
                  <Input
                    type="number"
                    min="5"
                    step="5"
                    value={Number(form.durationMinutes ?? 60)}
                    onChange={(event) => set("durationMinutes", Number(event.target.value))}
                  />
                </Field>
                <Field label="Preço (R$)">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={Number(form.price ?? 0)}
                    onChange={(event) => set("price", Number(event.target.value))}
                  />
                </Field>
                <Field label="Custo (R$)">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={Number(form.cost ?? 0)}
                    onChange={(event) => set("cost", Number(event.target.value))}
                  />
                </Field>
              </div>
            </>
          )}

          {section === "units" && (
            <Field label="Endereço">
              <Textarea
                rows={2}
                value={String(form.address ?? "")}
                onChange={(event) => set("address", event.target.value)}
                placeholder="Rua, número, bairro, cidade"
              />
            </Field>
          )}

          <label className="flex items-center justify-between rounded-[20px] border border-border bg-muted/30 px-4 py-3">
            <span>
              <span className="block text-sm font-semibold">Ativo</span>
              <span className="block text-xs text-muted-foreground">
                Disponível para uso no sistema
              </span>
            </span>
            <Switch
              checked={Boolean(form.active)}
              onCheckedChange={(value) => set("active", value)}
            />
          </label>

          <div className="flex gap-3 border-t border-border pt-5">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-gradient-primary text-white"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ColorField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Field label="Cor na agenda">
      <div className="flex h-10 items-center gap-3 rounded-md border border-input bg-background px-3">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-9 cursor-pointer border-0 bg-transparent p-0"
        />
        <span className="text-sm text-muted-foreground">{value.toUpperCase()}</span>
      </div>
    </Field>
  );
}

function UnitField({
  value,
  units,
  onChange,
}: {
  value: string | null;
  units: { id: string; name: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Unidade *">
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione a unidade" />
        </SelectTrigger>
        <SelectContent>
          {units.map((unit) => (
            <SelectItem key={unit.id} value={unit.id}>
              {unit.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function namePlaceholder(section: SettingsSection) {
  return {
    professionals: "Ex.: Dra. Ana Rocha",
    chairs: "Ex.: Cadeira 01",
    procedures: "Ex.: Clareamento",
    units: "Ex.: Unidade Centro",
  }[section];
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
