# Journal des modifications

## 2026-11-19 — Fondations Phase 0/1
- Création du monorepo (pnpm, TypeScript 6.0.3 strict, Vitest 5.1.1).
- `supabase/migrations` : noyau (profils, préférences, profils d'écoute, épisodes, paramètres), contenu (sources, plans, scripts, affirmations, preuves, audio, progression, retours), offres/quotas, tâches de génération (file, bail, retry, DLQ, coûts), Storage privé et droits par colonne.
- `supabase/tests` : shim Supabase pour PostgreSQL nu, 3 suites (isolation RLS, flux de génération, suppression de compte).
- `packages/contracts` : énumérations, machine à états, BCP 47, paramètres, règles documentaires.
- `packages/pipeline` : interfaces fournisseurs, graphe d'étapes, backoff, segmentation audio et reprise, estimation des coûts, délimitation des contenus non fiables.
- Corrections trouvées par les tests :
  - garde-fou des paramètres en `security definer` contournable → passé en `security invoker` ;
  - validation du plan modifié inopérante si `sections` absent (comparaison à NULL) → `is distinct from` ;
  - suppression de compte bloquée par des FK `on delete set null` sur `cost_events` → références souples + trigger d'anonymisation.
