# Tâches terminées (avec test correspondant)

| Date | Tâche | Preuve |
|---|---|---|
| 2026-11-19 | Audit de l'environnement et des versions | docs/AUDIT.md §1, §2, §4 |
| 2026-11-19 | Schéma de données + RLS + Storage + file + quotas + coûts | `bash supabase/tests/run.sh` → 83 assertions, 0 échec |
| 2026-11-19 | Contrats TypeScript alignés sur le SQL | `pnpm test` (alignement enums/transitions) |
| 2026-11-19 | Graphe du pipeline, retry, reprise des segments, estimation des coûts | `pnpm test` → 48 tests, `pnpm typecheck` OK |
| 2026-11-19 | Worker : file, boucle d'exécution, synthèse Chirp 3 HD par segment | `pnpm test:db` → 83 assertions SQL + 8 tests de bout en bout (retry 503, reprise sans coût, validation du plan, dead-letter + remboursement, 3 essais max, plafond de coût, annulation, crash de worker) ; `pnpm test` → 54 tests |
| 2026-11-19 | Schéma déployé sur le projet Supabase de dev (UE) | `bash supabase/tests/run-remote.sh nejqievnldeqiasqsdlj` → 3 suites vertes ; REST anonyme → 401 sur les tables et `request_generation` |

Non terminé (pas encore de test) : application mobile, moteurs LLM/recherche réels, stockage Supabase du worker, moteurs de génération, Edge Functions, paiements, admin.
