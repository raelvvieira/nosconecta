#!/usr/bin/env python3
"""Lê o CSV de pacientes do sistema antigo, limpa os dados e gera uma
migração SQL (INSERT em lote) para a tabela public.patients.

Uso: python3 scripts/import_legacy_patients.py <caminho_csv> <owner_email> <arquivo_saida.sql>
"""
import csv
import sys
import re
from datetime import datetime

LOWERCASE_CONNECTORS = {"de", "da", "do", "das", "dos", "e"}


def clean_name(raw: str) -> str | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    raw = re.sub(r"\s+", " ", raw)
    words = raw.split(" ")
    out = []
    for i, w in enumerate(words):
        lw = w.lower()
        if i > 0 and lw in LOWERCASE_CONNECTORS:
            out.append(lw)
        else:
            # preserva hifens e apóstrofos capitalizando cada pedaço
            parts = re.split(r"([-'])", w)
            out.append("".join(p.capitalize() if p not in ("-", "'") else p for p in parts))
    return " ".join(out)


def clean_phone(raw: str) -> str | None:
    digits = re.sub(r"\D", "", raw or "")
    if not digits:
        return None
    if len(digits) in (12, 13) and digits.startswith("55"):
        digits = digits[2:]
    if len(digits) == 11:
        return f"({digits[0:2]}) {digits[2:7]}-{digits[7:11]}"
    if len(digits) == 10:
        return f"({digits[0:2]}) {digits[2:6]}-{digits[6:10]}"
    return digits or None


def clean_digits(raw: str) -> str | None:
    digits = re.sub(r"\D", "", raw or "")
    return digits or None


def clean_date(raw: str) -> str | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    return raw.split(" ")[0].split("T")[0]


def clean_text(raw: str) -> str | None:
    raw = (raw or "").strip()
    return raw or None


def clean_place(raw: str) -> str | None:
    raw = clean_text(raw)
    if not raw:
        return None
    return clean_name(raw)


def clean_zip(raw: str) -> str | None:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 8:
        return f"{digits[0:5]}-{digits[5:8]}"
    return clean_text(raw)


def clean_state(raw: str) -> str | None:
    raw = clean_text(raw)
    return raw.upper()[:2] if raw else None


def clean_gender(raw: str) -> str | None:
    raw = (raw or "").strip().upper()
    return raw if raw in ("M", "F") else None


def sql_str(value: str | None) -> str:
    if value is None:
        return "NULL"
    escaped = value.replace("'", "''")
    return f"'{escaped}'"


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    csv_path, owner_email, out_path = sys.argv[1:4]

    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    values_rows = []
    skipped_excluded = 0
    skipped_no_name = 0

    for r in rows:
        if r.get("excluido", "").strip().lower() in ("t", "true", "1"):
            skipped_excluded += 1
            continue

        name = clean_name(r.get("nome"))
        if not name:
            skipped_no_name += 1
            continue

        phone = clean_phone(r.get("celular")) or clean_phone(r.get("telefone"))
        cpf = clean_digits(r.get("cpf"))
        birth_date = clean_date(r.get("datanascimento"))
        email = clean_text(r.get("email"))
        if email:
            email = email.lower()

        neighborhood = clean_place(r.get("bairro"))
        zip_code = clean_zip(r.get("cep"))
        city = clean_place(r.get("cidade"))
        address = clean_text(r.get("endereco"))
        state = clean_state(r.get("uf"))
        complement = clean_text(r.get("complemento"))
        gender = clean_gender(r.get("sexo"))
        legacy_patient_id = clean_text(r.get("id_paciente"))
        guardian_name = clean_name(r.get("responsavél") or r.get("responsavel") or "")
        guardian_cpf = clean_digits(r.get("cpf_responsavél_paciente") or r.get("cpf_responsavel_paciente"))

        notes_parts = []
        observacao = clean_text(r.get("observacao"))
        if observacao:
            notes_parts.append(observacao)
        motivo = clean_text(r.get("motivo_chegar_clinica"))
        if motivo:
            notes_parts.append(f"Motivo de chegada: {motivo}")
        numero_paciente = clean_text(r.get("numeropaciente"))
        if numero_paciente:
            notes_parts.append(f"Prontuário antigo: nº {numero_paciente}")
        notes = "; ".join(notes_parts) if notes_parts else None

        values_rows.append(
            "(" + ", ".join([
                sql_str(name),
                sql_str(phone),
                sql_str(cpf),
                sql_str(birth_date),
                sql_str(email),
                sql_str(neighborhood),
                sql_str(zip_code),
                sql_str(city),
                sql_str(address),
                sql_str(state),
                sql_str(complement),
                sql_str(gender),
                sql_str(legacy_patient_id),
                sql_str(guardian_name),
                sql_str(guardian_cpf),
                sql_str(notes),
            ]) + ")"
        )

    print(f"Total no CSV: {len(rows)}")
    print(f"Excluídos (excluido=true): {skipped_excluded}")
    print(f"Sem nome (pulados): {skipped_no_name}")
    print(f"Linhas a importar: {len(values_rows)}")

    header = f"""-- Importação de pacientes do sistema antigo (CSV exportado em 2026-07-01).
-- Gerado por scripts/import_legacy_patients.py em {datetime.utcnow().isoformat()}Z.
-- {len(values_rows)} pacientes (de {len(rows)} no arquivo original; {skipped_excluded} marcados como excluídos no sistema antigo foram ignorados).
WITH target_owner AS (
  SELECT id FROM auth.users WHERE email = {sql_str(owner_email)} LIMIT 1
)
INSERT INTO public.patients (
  owner_id, company_id, status, name, phone, cpf, birth_date, email,
  neighborhood, zip_code, city, address, state, address_complement,
  gender, legacy_patient_id, guardian_name, guardian_cpf, notes
)
SELECT
  target_owner.id, 'demo', 'active', v.name, v.phone, v.cpf, v.birth_date::date, v.email,
  v.neighborhood, v.zip_code, v.city, v.address, v.state, v.address_complement,
  v.gender, v.legacy_patient_id, v.guardian_name, v.guardian_cpf, v.notes
FROM (VALUES
"""
    footer = f"""
) AS v(name, phone, cpf, birth_date, email, neighborhood, zip_code, city, address, state, address_complement, gender, legacy_patient_id, guardian_name, guardian_cpf, notes)
CROSS JOIN target_owner
ON CONFLICT (legacy_patient_id) DO NOTHING;
"""

    with open(out_path, "w", encoding="utf-8") as out:
        out.write(header)
        out.write(",\n".join(values_rows))
        out.write(footer)

    print(f"Escrito em: {out_path}")


if __name__ == "__main__":
    main()
