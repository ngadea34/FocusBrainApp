# Journal des modifications

## 2026-11-19 — Lien d'écoute signé
- `supabase/tests/remote/signed-url.remote.test.ts` : 4 tests sur le projet réel (utilisateurs et fichier jetables, supprimés à la fin).
- `pnpm test:remote <ref>` : lit les clés via l'API d'administration, sans les écrire nulle part.
- Décision T13 : pas d'Edge Function pour les liens d'écoute.

## 2026-11-19 — Projet Supabase de dev
- Projet `nejqievnldeqiasqsdlj` (eu-north-1, PostgreSQL 17) : 5 migrations appliquées via l'API d'administration, versions alignées sur les noms de fichiers.
- `supabase/tests/run-remote.sh` : rejoue les 3 suites SQL sur l'instance réelle, chacune dans une transaction annulée. Toutes vertes.
- Correction trouvée sur l'instance réelle : `auth.users.id` n'a pas de valeur par défaut chez Supabase, les aides de test fournissent l'identifiant.

## 2026-11-19 — Worker de génération
- `services/worker` : file branchée sur les fonctions SQL (`PgQueue`), boucle d'exécution `runOnce` (bail + heartbeat, retry classé par statut HTTP, dead-letter, plafond de coût, annulation), fournisseur Google Chirp 3 HD (débit 1.0, lexique de prononciation), synthèse par segment avec réutilisation des segments déjà produits, stockage local pour les tests.
- 8 tests de bout en bout contre la vraie base (`pnpm test:db`), ajoutés à la CI.

## 2026-11-19 — Dépôt et CI
- Code poussé sur `ngadea34/FocusBrainApp`. CI GitHub Actions : typecheck, Vitest, migrations + tests SQL sur PostgreSQL 17.
- Test d'écoute : extraits FR/EN, voix open source Piper ajoutée, Azure retiré.

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
