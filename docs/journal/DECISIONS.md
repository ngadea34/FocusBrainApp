# Journal des décisions

Format : date · décision · statut (Validée / Technique réversible / En attente) · justification.

| # | Date | Décision | Statut | Justification |
|---|---|---|---|---|
| T1 | 2026-11-19 | Monorepo pnpm, nom de dossier provisoire `brainfocus-app`, paquets `@app/*` | Technique réversible | Aucun nom commercial ; renommage trivial |
| T2 | 2026-11-19 | File de tâches dans PostgreSQL (`generation_steps`, SKIP LOCKED) ; pas de Redis ni pg-boss | Technique réversible | Un seul système, transactions avec les données, testable ; extraction possible via les mêmes RPC |
| T3 | 2026-11-19 | Commandes métier (lancement, validation du plan, annulation) en RPC SQL `security definer` | Technique réversible | Quota + idempotence + machine à états atomiques, non contournables |
| T4 | 2026-11-19 | Droits par colonne en plus de la RLS ; retrait des droits par défaut Supabase | Technique réversible | La RLS filtre les lignes, pas les colonnes (statut, coûts) |
| T5 | 2026-11-19 | `cost_events` sans clés étrangères, anonymisé par trigger | Technique réversible | Registre comptable en ajout seul ; les FK `set null` cassaient la cascade de suppression (test) |
| T6 | 2026-11-19 | Un segment vocal = une étape, clé = hash(langue, voix, débit, texte) | Technique réversible | Reprise sans resynthèse (§9) |
| T7 | 2026-11-19 | TypeScript 6.0.3 plutôt que 7.0.2 | Technique réversible | TS 7 (compilateur natif) très récent ; compatibilité Expo/Metro à confirmer |
| T8 | 2026-11-19 | Une réécriture maximum après vérification | Technique réversible | Borne anti-boucle et anti-coût ; à ajuster selon la qualité mesurée |
| T9 | 2026-11-19 | Remboursement du quota si échec système, ou annulation avant tout traitement | Technique réversible (impact produit léger) | Équité ; une annulation après recherche consomme le quota |
| T10 | 2026-11-19 | Offre `discovery` : 3 générations/mois, 15 min max, 1 simultanée, plafond 2 $/épisode | Provisoire | Protection anti-abus uniquement ; aucun prix fixé |
| T11 | 2026-11-19 | Profils d'écoute sans champ diagnostic ; valeurs par défaut « neutres » configurables | Conforme au dossier §3, §11 | Personnalisation sans donnée de santé |
| T12 | 2026-11-19 | OpenAI TTS écarté | Technique | Arrêt annoncé le 6 janvier 2027 (source tierce) |
| T13 | 2026-11-19 | Lien d'écoute : l'app demande elle-même l'URL signée à Storage (TTL 1 h côté app), sans Edge Function | Technique | La politique RLS du bucket limite déjà la signature au propriétaire (testé sur le projet réel) ; une Edge Function n'ajouterait que l'imposition du TTL. Limite connue : un client modifié peut demander un TTL plus long pour ses propres fichiers. À revoir si on veut empêcher le partage de liens |
| D3 | 2026-11-19 | Voix V1 choisie par test d'écoute à l'aveugle (Azure, Google, ElevenLabs) | Validée (Nico) | Premier poste de coût et critère central de confort ; protocole : docs/product/TEST_ECOUTE_TTS.md |
| D3b | 2026-11-19 | Résultat du test : **Google Chirp 3 HD** en tête (moyenne 3,6/5 ; FR 3,8, EN 3,5), devant ElevenLabs 3,1, Neural2 2,4, Piper 1,9. Retenu pour la V1. Débit : synthétiser à vitesse normale et laisser le lecteur accélérer (Chirp FR noté 1/5 en débit accéléré par synthèse) | Validée (Nico, 19/11) | Un seul auditeur : à reconfirmer en bêta avec des profils variés |
| D1 | 2026-11-19 | Dépôt GitHub `ngadea34/FocusBrainApp` | Validée (Nico) | Créé par Nico |
| D2 | 2026-11-19 | Projet Supabase de dev « FocusBrainApp » créé par Nico, région eu-north-1 (Stockholm, UE), PostgreSQL 17 | Validé (créé par Nico) | Hébergement UE exigé par le dossier ; Stockholm au lieu de Francfort/Paris, toujours dans l'UE |
| D4 (dev) | 2026-11-19 | Modèle local Qwen3 8B via Ollama sur le PC de Nico (RTX 2060 8 Go, 64 Go RAM) ; 0 € | Validé par Nico (« on va faire ça sur ma rtx 2060 ») | Nico refuse toute dépense IA ; offre gratuite Mistral sans API (vérifié sur sa console), Gemini gratuit apparemment indisponible en UE. Qualité inférieure aux grands modèles : à réévaluer avant la bêta (D4 production) |
| D5–D8 | 2026-11-19 | Voir docs/AUDIT.md §9 | En attente | Arbitrages du propriétaire |
