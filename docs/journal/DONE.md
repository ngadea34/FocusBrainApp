# Tâches terminées (avec test correspondant)

| Date | Tâche | Preuve |
|---|---|---|
| 2026-11-19 | Audit de l'environnement et des versions | docs/AUDIT.md §1, §2, §4 |
| 2026-11-19 | Schéma de données + RLS + Storage + file + quotas + coûts | `bash supabase/tests/run.sh` → 83 assertions, 0 échec |
| 2026-11-19 | Contrats TypeScript alignés sur le SQL | `pnpm test` (alignement enums/transitions) |
| 2026-11-19 | Graphe du pipeline, retry, reprise des segments, estimation des coûts | `pnpm test` → 48 tests, `pnpm typecheck` OK |
| 2026-11-19 | Worker : file, boucle d'exécution, synthèse Chirp 3 HD par segment | `pnpm test:db` → 83 assertions SQL + 8 tests de bout en bout (retry 503, reprise sans coût, validation du plan, dead-letter + remboursement, 3 essais max, plafond de coût, annulation, crash de worker) ; `pnpm test` → 54 tests |
| 2026-11-19 | Schéma déployé sur le projet Supabase de dev (UE) | `bash supabase/tests/run-remote.sh nejqievnldeqiasqsdlj` → 3 suites vertes ; REST anonyme → 401 sur les tables et `request_generation` |
| 2026-11-19 | Lien d'écoute signé, réservé au propriétaire, qui expire | `pnpm test:remote nejqievnldeqiasqsdlj` → 4 tests ; base vérifiée vide après coup |
| 2026-11-19 | Suppression de compte : données puis tous les fichiers (orphelins compris) | `pnpm test:db` → 84 assertions + 10 tests ; `pnpm test:remote nejqievnldeqiasqsdlj` → 6 tests ; suites SQL rejouées sur le projet réel |
| 2026-11-19 | Étapes de génération réelles (intention → vérification) avec modèle local et Wikipédia | `pnpm test:db` → 14 tests dont 4 sur les moteurs (sources filtrées, réécriture, citations exactes, validation du plan modifié) ; `pnpm test` → 60 tests. Pas encore essayé avec le vrai Qwen3 ni le vrai Wikipédia |
| 2026-11-19 | Moteur documentaire multi-sources (6 connecteurs actifs), licences, types de preuves, déduplication, vérification croisée | `pnpm test` → 84 tests ; `pnpm test:db` → 84 assertions + 15 tests ; `pnpm test:live` FR/EN ; démo 3 sujets (`docs/research/DEMO.md`) |

Non terminé (pas encore de test) : application mobile, moteurs LLM/recherche réels, stockage Supabase du worker, moteurs de génération, Edge Functions, paiements, admin.
| 2026-11-19 | OpenAlex actif et User-Agent avec contact | `pnpm test` → 92 tests (clé en en-tête Bearer, jamais dans l'URL ; contact mailto) ; `pnpm test:live` et `pnpm research:demo` avec OpenAlex → 8 documents par sujet |
