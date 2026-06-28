# Design QA — Pacientes

- Source visual truth paths:
  - `C:\Users\raelv\Documents\Codex\2026-06-27\quer\work\patients-reference.png`
  - `C:\Users\raelv\Documents\Codex\2026-06-27\quer\work\patient-detail-reference.png`
- Implementation screenshot paths:
  - `C:\Users\raelv\Documents\Codex\2026-06-27\quer\work\patients-implementation-mobile.png`
  - `C:\Users\raelv\Documents\Codex\2026-06-27\quer\work\patient-detail-implementation-mobile.png`
- Focused comparison paths:
  - `C:\Users\raelv\Documents\Codex\2026-06-27\quer\work\patients-comparison.png`
  - `C:\Users\raelv\Documents\Codex\2026-06-27\quer\work\patient-detail-comparison.png`
- Viewport: 390 × 844 px
- States: lista completa, busca filtrada por “João Silva” e detalhe de João Silva.

## Full-view comparison evidence

The implementation follows the selected visual direction: soft neutral canvas, white elevated cards, pink-to-orange primary actions, compact status pills and a persistent five-item mobile navigation. The list preserves the search → primary action → filters → attention → patients hierarchy. The detail preserves the profile → quick actions → attention → tabs → care timeline hierarchy.

## Functional evidence

- The list renders the repository's real Supabase patient and receivables data, with demo enrichment only for absent profile fields.
- Search was exercised with “João Silva” and reduced the list to the matching patient.
- Patient rows route to `/pacientes/$patientId`.
- “Agendar” opens Agenda with the patient preselected.
- “Recebimento” opens the receivables form with the patient preselected.
- WhatsApp uses the patient's normalized phone number.
- Create and edit use the same validated patient form and invalidate the patient queries after saving.

## Findings and patches

- P1: the first detail route rendered behind the list because the route parent had no outlet. Patched by separating `/pacientes` into a layout and `/pacientes/` into the index route.
- P2: the profile block was taller than the reference at mobile width. Patched to a horizontal compact profile summary.
- P2: real financial overdue data was replacing the explicitly configured clinical status. Patched so configured patient status remains authoritative while overdue amounts still appear as attention alerts.
- P2: detail status always used the success color. Patched with semantic success, warning, danger and neutral styles.
- P2: a letter glyph had been used for WhatsApp. Patched with a Lucide message icon consistent with the application's icon system.
- No remaining actionable P0 or P1 mismatch.

## Checks

- [x] Mobile list and detail compared against both source references.
- [x] Search interaction verified.
- [x] Dynamic detail routing verified.
- [x] Existing Agenda and Receivables flows receive patient context.
- [x] New patient files pass ESLint.
- [x] Production client and SSR builds pass.

## Follow-up polish

- The repository-wide lint command still reports pre-existing CRLF/Prettier issues outside this feature; the new patient files pass their scoped lint run.
- Apply the included Supabase migration in deployment so the new profile, treatment and care-event fields are persisted remotely.

final result: passed
