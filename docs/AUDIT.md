# Audit initial et fondations — Phase 0

**Date :** 19 novembre 2026 · **Statut :** fondations posées, décisions structurantes en attente
**Portée :** les 9 livrables demandés au §17 du dossier de transmission.

> Convention : ce qui est **vérifié** l'est par une commande, un test ou une page consultée (source citée).
> Ce qui est **hypothèse** est marqué comme tel et doit être confirmé.

---

## 1. État des lieux des fichiers et dépôts existants

| Élément | Constat (vérifié le 19/11/2026) |
|---|---|
| Dossier partagé du projet | 4 fichiers : `CLAUDE.md` (règles d'orchestration économe en tokens), `builder.md`, `runner.md`, `scout.md` (définitions de sous-agents). Aucun code, aucune spécification technique, aucun schéma SQL. Le « schéma SQL déjà envisagé » mentionné au §8 du dossier **n'a pas été transmis**. |
| Dépôts GitHub accessibles (compte `ngadea34`) | 13 dépôts : `Atlas`, `KNOWLEDGE_CORE_GITHUB_READY`, `knowledge-core`, `roxan-*` (pocket, core, interface, content, v3, voice, installers, assistant), `arbione-finance`, `meteo-drone`. **Aucun ne correspond à l'application de podcasts** (ni « mindwave », ni « brainfocus », ni « podcast »). Leur contenu n'a pas été ouvert. |
| Ordinateur relié (Windows, « DinGrogu ») | Dossier `KnowlegeCore` visible, non partagé avec cette session, sans sous-dossier apparent. Non exploré. |
| Environnement de travail cloud | Node 22.23, pnpm 10.28, PostgreSQL 16.15 local (utilisé pour les tests), Docker indisponible. |

**Conclusion :** projet démarré de zéro. Le monorepo `brainfocus-app/` (nom provisoire) a été créé dans le dossier partagé du projet, avec un historique git local, en attendant un dépôt GitHub.

## 2. Ressources déjà configurées

| Ressource | Constat |
|---|---|
| Projet Supabase | **Aucun** : aucune URL, clé ou variable d'environnement Supabase. |
| Clés API IA (LLM, TTS, recherche) | **Aucune** clé fournisseur dans l'environnement. |
| Comptes stores (Apple, Google Play), prestataire de paiement | Aucune trace. Non vérifiable depuis cette session. |
| Expo / EAS | Aucune configuration. |
| Connecteurs claude.ai | Google Drive et Gmail présents mais connexion expirée ; non nécessaires ici. |

Rien n'a été souscrit, aucune dépense engagée.

## 3. Architecture technique recommandée

```
Application mobile (Expo / React Native, TypeScript)
   │  lecture directe protégée par RLS (supabase-js)
   │  commandes sensibles via RPC SQL (request_generation, approve_outline, cancel_generation)
   ▼
Supabase (région UE) ── PostgreSQL : données + file de tâches + quotas + coûts
   │                    Auth · Storage privé (URLs signées)
   │                    Edge Functions courtes : URLs signées, webhooks paiement, suppression de compte
   ▼
Worker(s) Node.js TypeScript (conteneur, hébergement UE)
   claim_step → moteur (Intent, Research, SourceEvaluator, Cognitive, Script,
                FactChecker, Voice, AudioAssembler) → complete_step / fail_step
   └─ fournisseurs interchangeables : LlmProvider · SearchProvider · TtsProvider · PaymentProvider
```

**Choix et justifications**

1. **File de tâches dans PostgreSQL** (`generation_steps`, `FOR UPDATE SKIP LOCKED`) plutôt que Redis/BullMQ ou un service de files externe : un seul système à opérer, transactions avec les données, idempotence et quotas atomiques, testable localement. Volume attendu (quelques milliers d'étapes/jour) très en deçà des limites. Extraction vers une file dédiée possible plus tard sans changer les contrats (`claim/complete/fail`).
2. **Commandes métier en RPC SQL `security definer`** : le quota, l'idempotence et la machine à états sont garantis dans la même transaction, impossible à contourner depuis le client. Pas de service API séparé en Phase 1 ; une API TypeScript (Hono) viendra seulement si des besoins le justifient (orchestration multi-fournisseurs côté requête, webhooks complexes).
3. **Un seul worker modulaire au départ** : chaque moteur est un module du paquet `@app/pipeline` ; on déploie un processus qui traite toutes les étapes, puis on sépare (ex. worker TTS) quand la charge ou les coûts le demandent. Conforme au §13 (« ne pas créer tous les services dès le premier jour »).
4. **Fournisseurs derrière des interfaces** (`packages/pipeline/src/providers.ts`) : chaque appel renvoie son usage mesuré → `record_cost` → marge par épisode.
5. **Reprise fine** : un segment audio = une étape, clé = hash(texte, voix, débit, langue). Un segment en erreur est réessayé seul ; un segment inchangé n'est jamais resynthétisé.
6. **Plan validé avant rédaction** : statut `awaiting_approval`, RPC `approve_outline` (avec plan éventuellement modifié, conservé comme nouvelle version). Désactivable par épisode (`require_outline_approval`).

**Structure actuelle du monorepo**

```
brainfocus-app/
  packages/contracts   énumérations, machine à états, langues BCP 47, paramètres, règles documentaires (zod)
  packages/pipeline    interfaces fournisseurs, graphe d'étapes, retry, segments audio, estimation des coûts
  supabase/migrations  5 migrations (noyau, contenu, offres, tâches, Storage + droits)
  supabase/tests       tests SQL d'isolation et de flux (PostgreSQL jetable)
  docs/                audit, journaux
```
`apps/mobile`, `services/worker`, `apps/admin` seront créés en Phases 2, 3 et 7.

## 4. Dépendances et versions à retenir

Versions relevées sur le registre npm le 19/11/2026 (`npm view`), sauf mention.

| Domaine | Paquet | Version | Remarque |
|---|---|---|---|
| Mobile | `expo` (SDK 58) | 58.0.26 | Sortie le 15/10/2026, inclut React Native 0.88 ([changelog](https://expo.dev/changelog/sdk-58)) |
| | `react-native` / `react` | 0.88.1 / 19.3.0 | Versions embarquées par `expo@58.0.26` |
| | `expo-router` | ~58.0.33 | |
| | `expo-audio` | ~58.0.12 | Lecteur recommandé ; **spike requis** : arrière-plan, écran verrouillé, chapitres |
| | `react-native-track-player` | 4.1.2 | Alternative ; dernière publication mars 2026 (risque de maintenance) |
| | `expo-localization`, `i18next`, `react-i18next` | 58.0.5 / 27.2.2 / 18.0.3 | i18n |
| | `@tanstack/react-query` | 5.108.1 | Cache et synchronisation |
| | `react-native-purchases` | 11.0.4 | Si RevenueCat est retenu |
| Données | `@supabase/supabase-js` | 2.119.2 | |
| | CLI `supabase` | 3.2.0 | Migrations, tests locaux |
| Langage | `typescript` | **6.0.3** retenu | 7.0.2 (compilateur natif) disponible : à adopter quand Expo/Metro l'auront validé |
| | `zod` | 4.6.7 | Contrats |
| Tests / qualité | `vitest` | 5.1.1 | Node 22.12+, 24+ ou 26+ |
| | `@biomejs/biome` | 2.6.8 | Lint + format (à ajouter) |
| Runtime | Node.js | 26 LTS (26.13.1) pour les workers | Expo SDK 58 accepte 22.13+, 24.3+, 26+ |
| | `pnpm` | 10.28 (installé) ; 12.21 disponible | |
| Serveur (si besoin) | `hono` | 4.13.19 | API légère portable (Node, Edge) |
| IA | `@anthropic-ai/sdk` | 1.10.0 | Derrière `LlmProvider` |
| Journalisation | `pino` | 10.4.0 | Logs minimisés |
| File de tâches | — | — | Implémentée en SQL ; `pg-boss` 12.38 écarté (non nécessaire) |

## 5. Schéma de données détaillé

Implémenté dans `supabase/migrations/` (testé, non déployé). Toutes les tables personnelles portent `user_id` ; les tables filles d'un épisode portent `(episode_id, user_id)` avec clé étrangère composite vers `episodes(id, user_id)`, ce qui garantit la cohérence propriétaire et rend les politiques RLS simples et indexées.

| Groupe | Tables | Points clés |
|---|---|---|
| Comptes | `profiles`, `user_preferences`, `cognitive_profiles` | Créés automatiquement à l'inscription. « Profils d'écoute » = jeux de paramètres nommés ; **aucun champ diagnostic**. |
| Épisodes | `episodes`, `episode_settings` | 12 statuts du §9. Paramètres et sujet verrouillés après lancement (trigger). Langues BCP 47 validées (SQL + TS). |
| Documentation | `sources` (catalogue partagé, sans donnée utilisateur), `episode_sources` (palier 1–6, pertinence, limites) | Une source n'est visible que par qui l'a mobilisée. |
| Rédaction | `outline_versions`, `script_versions`, `script_sections` | Versions successives ; auteur `system` ou `user` ; instantané des paramètres. |
| Vérification | `claims` (confirmée, nuancée, non vérifiée, rejetée), `claim_evidence` | Citation originale conservée ; une traduction doit déclarer sa langue (contrainte). |
| Audio | `audio_assets`, `storage_deletion_queue` | Chemin imposé `{user_id}/{episode_id}/…` (contrainte) ; hash de texte pour réutilisation. |
| Écoute | `listening_progress`, `feedback` | Progression indépendante du fichier. |
| Génération | `episode_jobs`, `generation_steps`, `cost_events` | Idempotence, bail, retry, DLQ, plafond de coût. |
| Commercial | `plans`, `subscriptions`, `quota_usage` | Limites techniques seulement, **aucun prix**. |
| Admin | vues `admin_job_costs`, `admin_dead_letter_steps` | Rôle de service uniquement. |

**Suppression :** supprimer `auth.users` supprime en cascade toutes les données ; les coûts sont conservés **anonymisés** ; les fichiers audio sont placés dans `storage_deletion_queue` pour suppression par un worker.

## 6. Plan de sécurité et politiques RLS

| Mesure | État |
|---|---|
| RLS activée sur **toutes** les tables publiques | ✅ testée (requête sur `pg_class`) |
| Droits par défaut de Supabase retirés, puis accordés **colonne par colonne** (ex. l'utilisateur ne peut écrire ni `status`, ni coûts, ni chemins audio) | ✅ testé |
| Isolation entre deux utilisateurs sur chaque table, Storage compris | ✅ 40 assertions |
| Anonyme : aucun accès | ✅ testé |
| Coûts, entrées/sorties internes d'étapes, file de suppression : invisibles côté client | ✅ testé |
| RPC worker (`claim_step`, `record_cost`…) interdites aux utilisateurs | ✅ testé |
| Storage privé, lecture propriétaire uniquement, écriture workers | ✅ politique + test ; diffusion par URL signée courte (Edge Function, à écrire) |
| Fonctions `security definer` avec `search_path = ''` | ✅ |
| Aucun secret dans l'app mobile | Principe : seule la clé publique (anon) côté client ; clés fournisseurs uniquement dans les workers |
| Injection de prompt | Contenus non fiables (sujet, sources, plan modifié) toujours délimités (`fenceUntrusted`) et traités comme données ; sorties LLM validées par schéma zod ; plan utilisateur borné (64 Ko, forme vérifiée) |
| Limitation des abus et des coûts | Quota mensuel atomique, durée max par offre, 1 génération simultanée (offre découverte), plafond de coût par épisode |
| Données de santé | Aucune collecte de diagnostic ; retours limités à des dimensions d'expérience (rythme, clarté…) |
| RGPD | Hébergement UE à confirmer ; registre des sous-traitants, politique de conservation, AIPD à étudier (voir RISKS.md) |
| Restent à faire | Limitation de débit HTTP (Auth et Edge), sauvegardes/restauration (PITR), procédure de suppression de compte de bout en bout, revue des sous-traitants, MFA administrateurs |

**Deux défauts de sécurité ont été trouvés par les tests et corrigés** : un garde-fou en `security definer` contournable (les paramètres restaient modifiables après lancement) et une validation de plan inopérante sur valeur nulle. Voir CHANGELOG.

## 7. Estimation des coûts d'exploitation

### Coût variable par épisode (estimation, hors taxes)

Modèle : `estimateEpisodeCost` (`packages/pipeline/src/cost.ts`). Hypothèses : 150 mots/min, 6 caractères/mot, 1,6 token/mot, 6 tokens lus par token écrit, +60 % de sortie hors script, 12 recherches à 0,01 $ (**hypothèse non vérifiée**), MP3 64 kbit/s conservé 12 mois, 1,5 écoute.

| Durée | LLM (Sonnet 5.5) | TTS Azure / Google Neural2 (15–16 $/M car.) | TTS Google Chirp 3 HD (30 $) | TTS ElevenLabs v4 (80 $) | Total (Sonnet + Neural2) |
|---|---|---|---|---|---|
| 5 min | 0,03 $ | 0,07 $ | 0,14 $ | 0,36 $ | **≈ 0,23 $** |
| 15 min | 0,10 $ | 0,21 $ | 0,41 $ | 1,08 $ | **≈ 0,44 $** |
| 30 min | 0,20 $ | 0,42 $ | 0,81 $ | 2,16 $ | **≈ 0,76 $** |
| 60 min | 0,40 $ | 0,86 $ | 1,62 $ | 4,32 $ | **≈ 1,40 $** |

Lecture : **la synthèse vocale domine** ; le choix du fournisseur de voix fait varier le coût d'un facteur 5. Avec Opus 5.5 au lieu de Sonnet 5.5, le poste LLM double (≈ +0,40 $ pour 60 min). Stockage et sortie réseau sont négligeables (< 0,02 $).

Prix sources (consultés le 19/11/2026) : Claude Opus 5.5 4 $/20 $, Sonnet 5.5 2 $/10 $, Haiku 5.5 0,10 $/0,50 $ par million de tokens (documentation Anthropic) ; [Google TTS](https://cloud.google.com/text-to-speech/pricing) Neural2 16 $, Chirp 3 HD 30 $ par million de caractères, 1 M gratuit/mois ; Azure Neural 15 $, HD 22 $ ([texttolab, 06/11/2026](https://texttolab.com/blog/azure-text-to-speech-pricing), source tierce) ; ElevenLabs 40–80 $ ([AssemblyAI, 10/11/2026](https://www.assemblyai.com/blog/tts-api-pricing), source tierce) ; OpenAI TTS annoncé arrêté le 6 janvier 2027 (même source) → écarté.

### Coûts fixes mensuels (ordre de grandeur)

| Poste | Coût | Source |
|---|---|---|
| Supabase Pro (8 Go disque, 100 Go stockage, 250 Go sortie, 100 000 MAU) | à partir de 25 $/mois | [supabase.com/pricing](https://supabase.com/pricing) |
| Hébergement worker UE | 5–30 $/mois (**hypothèse**) | à comparer |
| Comptes développeur Apple / Google | 99 $/an / 25 $ une fois (**à vérifier**) | |
| RevenueCat | gratuit jusqu'à 2 500 $ de revenu mensuel suivi, puis 1 % | [apppricinglab, 05/2026](https://apppricinglab.com/playbook/revenuecat-review), source tierce |
| Commission des stores | 15 % (petites entreprises) à 30 % (**à vérifier**) | |

Développement : Supabase gratuit (500 Mo, 1 Go stockage) suffit ; offres gratuites TTS (Azure 500 000 car./mois, Google 1 M) permettent les essais d'écoute à coût nul.

**Plafond provisoire** de l'offre découverte : 3 générations/mois, 15 min max, 2 $ de coût maximal par épisode. Valeurs anti-abus, **pas des prix**.

## 8. Découpage en tâches vérifiables

Chaque tâche n'est « terminée » qu'avec le test indiqué.

| # | Tâche | Critère de fin | État |
|---|---|---|---|
| P0-1 | Audit environnement, versions, coûts | Ce document | ✅ |
| P1-1 | Schéma, RLS, Storage, file, quotas, coûts | `supabase/tests/run.sh` : 83 assertions | ✅ |
| P1-2 | Contrats TS alignés sur SQL | `pnpm test` : enums et transitions comparés au SQL | ✅ |
| P1-3 | Graphe d'étapes, retry, segments, coûts | `pnpm test` : 48 tests | ✅ |
| P1-4 | Créer le dépôt GitHub et pousser | Dépôt privé avec CI (typecheck, vitest, tests SQL) verte | ⏳ Nico |
| P1-5 | Créer le projet Supabase UE, appliquer les migrations | `supabase db push` + tests rejoués sur l'instance de dev | ⏳ Nico |
| P1-6 | Edge Function URL signée (TTL court) | Test : refus hors propriétaire, expiration | ○ |
| P1-7 | Worker : boucle claim/heartbeat/complete/fail + fournisseurs factices | Test d'intégration bout en bout avec faux fournisseurs, reprise après crash | ○ |
| P1-8 | Suppression de compte de bout en bout (données + fichiers) | Test : plus aucune ligne ni fichier | ○ |
| P2-1 | App Expo : auth, profil, préférences, i18n FR/EN | Tests composants + parcours e2e (Maestro) | ○ |
| P2-2 | Création d'épisode + paramètres + bibliothèque | e2e : création → `queued` | ○ |
| P3-1 | ResearchEngine (OpenAlex, Crossref, recherche web) multilingue | Corpus de sujets tests, références vérifiables | ○ |
| P3-2 | SourceEvaluator (paliers, actualité, limites) | Jeu de sources annotées | ○ |
| P4-1 | IntentEngine + CognitiveEngine (plan) | Plans conformes au schéma, adaptés aux paramètres (grille d'évaluation) | ○ |
| P4-2 | ScriptEngine | Respect durée ±10 %, niveau, structure | ○ |
| P5-1 | FactChecker | Aucune affirmation « non vérifiée » énoncée comme un fait (test automatique) | ○ |
| P5-2 | VoiceEngine + AudioAssembler + chapitres | Reprise d'un segment seul ; durée cohérente | ○ |
| P6-1 | Lecteur (±15 s, chapitres, vitesse, arrière-plan, progression) | Tests sur appareils iOS et Android | ○ |
| P7-1 | Abonnements, paiements, tableau de bord coûts, CGU, confidentialité | Webhooks testés en bac à sable | ○ |

## 9. Décisions nécessitant une validation humaine

| # | Décision | Recommandation | Bloquant pour |
|---|---|---|---|
| D1 | Créer le dépôt GitHub (nom provisoire) | Dépôt privé, ex. `ngadea34/podcast-app` | Poussée du code, CI |
| D2 | Créer le projet Supabase (région UE, offre gratuite en dev) | Francfort ou Paris (à confirmer à la création) | P1-5 |
| D3 | Fournisseur de synthèse vocale V1 | Test d'écoute à l'aveugle FR/EN : Azure, Google, ElevenLabs (offres gratuites) | Phase 5, prix |
| D4 | Fournisseur et localisation des modèles IA | API Anthropic directe en développement ; décider avant la bêta entre API directe et Claude via un cloud en région UE | Phase 3–4, RGPD |
| D5 | Prestataire de paiement | RevenueCat (abstraction des deux stores) — à comparer en Phase 7 | Phase 7 |
| D6 | Hébergeur des workers (UE) | À comparer (Scaleway, Fly.io, Render…) | Mise en ligne |
| D7 | Offres, quotas et prix | Après mesure des coûts réels en bêta | Phase 7 |
| D8 | Nom commercial | Non défini ; tout est nommé de façon provisoire | Publication stores |

Aucune de ces décisions ne bloque la suite des fondations, à part D1 et D2 pour pousser et déployer.
