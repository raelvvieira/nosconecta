import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  createPatient,
  updatePatient,
  type PatientGender,
  type PatientStatus,
  type PatientSummary,
} from "@/lib/patients/patients.functions";

type Props = {
  open: boolean;
  patient?: PatientSummary | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (id: string) => void;
};

const EMPTY = {
  name: "",
  phone: "",
  cpf: "",
  birthDate: "",
  status: "active" as PatientStatus,
  allergyNotes: "",
  notes: "",
  gender: "" as PatientGender | "",
  neighborhood: "",
  zipCode: "",
  city: "",
  address: "",
  state: "",
  addressComplement: "",
  guardianName: "",
  guardianCpf: "",
};

export function PatientFormSheet({ open, patient, onOpenChange, onSaved }: Props) {
  const createFn = useServerFn(createPatient);
  const updateFn = useServerFn(updatePatient);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!open) return;
    setForm(
      patient
        ? {
            name: patient.name,
            phone: patient.phone ?? "",
            cpf: patient.cpf ?? "",
            birthDate: patient.birthDate ?? "",
            status: patient.status,
            allergyNotes: patient.allergyNotes ?? "",
            notes: patient.notes ?? "",
            gender: patient.gender ?? "",
            neighborhood: patient.neighborhood ?? "",
            zipCode: patient.zipCode ?? "",
            city: patient.city ?? "",
            address: patient.address ?? "",
            state: patient.state ?? "",
            addressComplement: patient.addressComplement ?? "",
            guardianName: patient.guardianName ?? "",
            guardianCpf: patient.guardianCpf ?? "",
          }
        : EMPTY,
    );
  }, [open, patient]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Informe o nome do paciente.");
      const payload = { ...form, id: patient?.id };
      if (patient) {
        await updateFn({ data: payload });
        return { id: patient.id };
      }
      return createFn({ data: payload });
    },
    onSuccess: ({ id }) => {
      toast.success(patient ? "Paciente atualizado" : "Paciente criado");
      onOpenChange(false);
      onSaved(id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[520px] p-0">
        <SheetHeader className="border-b border-border px-6 py-5 text-left bg-gradient-to-br from-pink-soft/50 to-coral-soft/40">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-primary text-white shadow-soft">
              <UserPlus className="h-5 w-5" />
            </span>
            <div>
              <SheetTitle>{patient ? "Editar paciente" : "Novo paciente"}</SheetTitle>
              <SheetDescription>
                Dados usados na agenda, no financeiro e na ficha do paciente.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form
          className="space-y-7 px-6 py-6"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Identificação
            </p>
            <div className="space-y-2">
              <Label htmlFor="patient-name">Nome completo *</Label>
              <Input
                id="patient-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Nome do paciente"
                autoFocus
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="patient-phone">Telefone</Label>
                <Input
                  id="patient-phone"
                  value={form.phone}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, phone: event.target.value }))
                  }
                  placeholder="(11) 99999-9999"
                  inputMode="tel"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patient-cpf">CPF</Label>
                <Input
                  id="patient-cpf"
                  value={form.cpf}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, cpf: event.target.value }))
                  }
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="patient-birth">Data de nascimento</Label>
                <Input
                  id="patient-birth"
                  type="date"
                  value={form.birthDate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, birthDate: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Situação</Label>
                <Select
                  value={form.status}
                  onValueChange={(status) =>
                    setForm((current) => ({ ...current, status: status as PatientStatus }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="in_treatment">Em tratamento</SelectItem>
                    <SelectItem value="return_pending">Retorno pendente</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Sexo</Label>
              <Select
                value={form.gender || "unset"}
                onValueChange={(gender) =>
                  setForm((current) => ({
                    ...current,
                    gender: gender === "unset" ? "" : (gender as PatientGender),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Não informado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">Não informado</SelectItem>
                  <SelectItem value="F">Feminino</SelectItem>
                  <SelectItem value="M">Masculino</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Endereço
            </p>
            <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
              <div className="space-y-2">
                <Label htmlFor="patient-zip">CEP</Label>
                <Input
                  id="patient-zip"
                  value={form.zipCode}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, zipCode: event.target.value }))
                  }
                  placeholder="00000-000"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patient-address">Endereço</Label>
                <Input
                  id="patient-address"
                  value={form.address}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, address: event.target.value }))
                  }
                  placeholder="Rua, número"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="patient-complement">Complemento</Label>
                <Input
                  id="patient-complement"
                  value={form.addressComplement}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, addressComplement: event.target.value }))
                  }
                  placeholder="Apto, bloco..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patient-neighborhood">Bairro</Label>
                <Input
                  id="patient-neighborhood"
                  value={form.neighborhood}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, neighborhood: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_90px]">
              <div className="space-y-2">
                <Label htmlFor="patient-city">Cidade</Label>
                <Input
                  id="patient-city"
                  value={form.city}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, city: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patient-state">UF</Label>
                <Input
                  id="patient-state"
                  value={form.state}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      state: event.target.value.toUpperCase().slice(0, 2),
                    }))
                  }
                  placeholder="RS"
                  maxLength={2}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Responsável (se paciente menor de idade)
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="patient-guardian-name">Nome do responsável</Label>
                <Input
                  id="patient-guardian-name"
                  value={form.guardianName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, guardianName: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patient-guardian-cpf">CPF do responsável</Label>
                <Input
                  id="patient-guardian-cpf"
                  value={form.guardianCpf}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, guardianCpf: event.target.value }))
                  }
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Cuidados e observações
            </p>
            <div className="space-y-2">
              <Label htmlFor="patient-allergy">Alertas de saúde</Label>
              <Input
                id="patient-allergy"
                value={form.allergyNotes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, allergyNotes: event.target.value }))
                }
                placeholder="Ex.: alergia a dipirona"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="patient-notes">Observações</Label>
              <Textarea
                id="patient-notes"
                rows={4}
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="Preferências de contato ou informações administrativas"
              />
            </div>
          </section>

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
              {mutation.isPending
                ? "Salvando..."
                : patient
                  ? "Salvar alterações"
                  : "Criar paciente"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
