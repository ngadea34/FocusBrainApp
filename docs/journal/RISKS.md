# Registre des risques

| # | Risque | Probabilité | Impact | Mesure |
|---|---|---|---|---|
| R1 | Coût TTS supérieur aux prévisions (voix premium ×5) | Moyenne | Élevé | Plafond de coût par épisode, suivi `cost_events`, test d'écoute avant choix, cache des segments |
| R2 | Affirmations inexactes ou sources inventées par le LLM | Élevée sans contrôle | Critique (confiance) | FactChecker obligatoire, preuves liées à des sources réellement récupérées, règle « non vérifiée ≠ fait », corpus de tests |
| R3 | Injection de prompt via sujet, sources web ou plan modifié | Moyenne | Élevé | Délimitation des contenus non fiables, sorties validées par schéma, aucun outil à effet de bord exposé au LLM |
| R4 | Données personnelles traitées hors UE (LLM, TTS) | Élevée selon fournisseurs | Élevé (RGPD) | Décision D4, DPA, registre des sous-traitants, minimisation (le sujet seul part chez les fournisseurs, jamais l'identité) |
| R5 | Les préférences d'écoute ou les sujets révèlent indirectement des informations de santé | Moyenne | Élevé | Pas de champ diagnostic, AIPD à étudier, conservation limitée, chiffrement au repos (Supabase) |
| R6 | Règles des stores (achats intégrés obligatoires, commission) | Certaine | Moyen | Abstraction `PaymentProvider`, comparaison RevenueCat / natif |
| R7 | Lecture audio en arrière-plan et chapitres insuffisants avec `expo-audio` | Moyenne | Moyen | Spike en début de Phase 6 ; repli `react-native-track-player` (maintenance à surveiller) |
| R8 | Dépendance à un fournisseur unique (LLM, TTS) | Moyenne | Moyen | Interfaces interchangeables, coûts mesurés par fournisseur |
| R9 | Abus (générations massives, comptes multiples) | Moyenne | Élevé | Quotas atomiques, 1 génération simultanée, plafond de coût, limitation de débit Auth à configurer |
| R10 | Tests SQL exécutés sur PostgreSQL 16 nu (shim) et non sur Supabase réel | Certaine aujourd'hui | Moyen | Rejouer les tests sur l'instance Supabase de dev (P1-5), CI avec `supabase start` |
| R11 | Code hors dépôt distant (perte possible) | Moyenne | Élevé | D1 : créer le dépôt GitHub ; copie dans le dossier partagé du projet en attendant |
| R12 | Positionnement perçu comme médical | Faible | Élevé (réglementaire) | Formulations produit, CGU, pas de promesse thérapeutique ni diagnostique |
| R13 | Sources de dev limitées à Wikipédia (tertiaire) et modèle local 8B : vérification des faits moins fiable qu'avec des sources primaires et un grand modèle | Moyen | Citation exacte exigée, rétrogradation en « nuancée » sinon ; sources primaires et modèle de production à décider avant la bêta |
