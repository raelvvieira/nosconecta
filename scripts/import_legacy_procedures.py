#!/usr/bin/env python3
"""Lê o CSV de tratamentos/valores do sistema antigo, limpa os dados e
gera uma migração SQL (INSERT em lote) para a tabela public.clinic_procedures.

Uso: python3 scripts/import_legacy_procedures.py <caminho_csv> <owner_email> <arquivo_saida.sql>
"""
import csv
import sys
import re
from collections import Counter
from datetime import datetime


def clean_text(raw: str) -> str | None:
    raw = (raw or "").strip()
    raw = re.sub(r"\s+", " ", raw)
    return raw or None


def clean_price(raw: str) -> float:
    raw = (raw or "").strip().replace(",", ".")
    try:
        return round(float(raw), 2)
    except ValueError:
        return 0.0


def sql_str(value) -> str:
    if value is None:
        return "NULL"
    escaped = str(value).replace("'", "''")
    return f"'{escaped}'"


def sql_num(value: float) -> str:
    return f"{value:.2f}"


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    csv_path, owner_email, out_path = sys.argv[1:4]

    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    values_rows = []
    skipped_no_name = 0
    name_counts = Counter()

    for r in rows:
        name = clean_text(r.get("nome"))
        if not name:
            skipped_no_name += 1
            continue
        name_counts[name] += 1

        category = clean_text(r.get("especialidade"))
        price = clean_price(r.get("valor_padrao"))
        tuss_code = clean_text(r.get("tuss"))
        tuss_name = clean_text(r.get("nometuss"))

        values_rows.append(
            "(" + ", ".join([
                sql_str(name),
                sql_str(category),
                sql_num(price),
                sql_str(tuss_code),
                sql_str(tuss_name),
            ]) + ")"
        )

    dupes = {name: n for name, n in name_counts.items() if n > 1}

    print(f"Total no CSV: {len(rows)}")
    print(f"Sem nome (pulados): {skipped_no_name}")
    print(f"Linhas a importar: {len(values_rows)}")
    print(f"Nomes duplicados: {len(dupes)} {list(dupes.items())[:10]}")

    header = f"""-- Importação de procedimentos/tratamentos do sistema antigo
-- (CSV exportado em 2026-07-01).
-- Gerado por scripts/import_legacy_procedures.py em {datetime.utcnow().isoformat()}Z.
-- {len(values_rows)} procedimentos.
WITH target_owner AS (
  SELECT id FROM auth.users WHERE email = {sql_str(owner_email)} LIMIT 1
)
INSERT INTO public.clinic_procedures (owner_id, name, category, price, tuss_code, tuss_name)
SELECT target_owner.id, v.name, v.category, v.price::numeric, v.tuss_code, v.tuss_name
FROM (VALUES
"""
    footer = """
) AS v(name, category, price, tuss_code, tuss_name)
CROSS JOIN target_owner;
"""

    with open(out_path, "w", encoding="utf-8") as out:
        out.write(header)
        out.write(",\n".join(values_rows))
        out.write(footer)

    print(f"Escrito em: {out_path}")


if __name__ == "__main__":
    main()
