# Protocole de test d'écoute à l'aveugle — voix V1

**Décision D3 (validée par Nico le 19/11/2026) :** choisir la voix V1 par un test d'écoute à l'aveugle.

## Candidats
| Fournisseur | Voix à tester | Prix public (par million de caractères) |
|---|---|---|
| Azure Speech | 1 voix neuronale FR, 1 EN (+ variante HD si disponible) | 15 $ (HD 22 $) |
| Google Cloud TTS | Neural2 et Chirp 3 HD, FR et EN | 16 $ / 30 $ |
| ElevenLabs | Multilingual (v4) et Flash, même voix en FR et EN | 80 $ / 40 $ |

Les offres gratuites suffisent (environ 8 extraits × 1 500 caractères × 2 langues ≈ 25 000 caractères par fournisseur).

## Extraits (identiques pour tous les fournisseurs)
1. Narration chaleureuse, débit lent (vulgarisation).
2. Passage dense avec termes techniques et nombres (prononciation : « ADN », « 10⁻⁴ », noms propres étrangers).
3. Passage documentaire avec citation et transition.
4. Même passage à débit rapide.
Chaque extrait existe en FR (fr-FR) et en EN (en-GB).

## Déroulement
- Fichiers renommés aléatoirement, volume normalisé, aucun nom de fournisseur visible.
- Écoute aussi à vitesse 0,75× (intelligibilité à vitesse réduite, dossier §16).
- Notes de 1 à 5 : naturel, intelligibilité, prononciation, fatigue d'écoute après 3 minutes, cohérence entre extraits.
- Idéalement plusieurs auditeurs aux profils cognitifs variés (sans recueillir de diagnostic).

## Décision
Score qualité pondéré, puis comparaison au coût par épisode (docs/AUDIT.md §7). Résultat consigné dans DECISIONS.md.
