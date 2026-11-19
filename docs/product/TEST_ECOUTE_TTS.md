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

## Mise à jour du 19/11/2026
- Azure retiré du test (inscription avec carte bancaire non souhaitée). Ajout d'une voix **open source gratuite** (Piper 1.8, licence MIT, exécutable sur nos serveurs) : `fr-siwis-medium` et `en-us-lessac-medium` (pas de voix en-GB de qualité moyenne disponible).
- Textes des extraits : `tools/tts-listening-test/extraits.json` (extrait 4 = extrait 1 à débit rapide).
- Clés attendues dans les secrets de l'environnement : `GOOGLE_TTS_API_KEY`, `ELEVENLABS_API_KEY`.
- Extraits générés le 19/11/2026 (`tools/tts-listening-test/generate.py`) : Google `fr-FR-Neural2-F`/`en-GB-Neural2-F`, Google `Chirp3-HD-Aoede` (FR/EN), ElevenLabs « Alice » (`eleven_multilingual_v2`, voix prédéfinie : le compte gratuit n'autorise pas les voix de la bibliothèque via l'API), Piper. Volume normalisé (−18 LUFS), lettres A–D tirées au hasard par extrait.
- Page d'écoute : https://claude.ai/artifact/ENL6tRr6KQodTkV8suHjiU (privée). Clé de correspondance : `test-ecoute/cle-a-ouvrir-apres-ecoute.json` dans le dossier partagé.

## Résultats (Nico, 19/11/2026, 1 auditeur)
| Voix | FR | EN | Moyenne |
|---|---|---|---|
| Google Chirp 3 HD (Aoede) | 3,8 | 3,5 | **3,6** |
| ElevenLabs Multilingual v2 (Alice) | 2,5 | 3,8 | 3,1 |
| Google Neural2 (F) | 1,8 | 3,0 | 2,4 |
| Piper (open source) | 1,8 | 2,0 | 1,9 |

Observations : Chirp 3 HD obtient 5, 4 et 5 sur les trois extraits FR à vitesse normale ou lente, mais 1 sur l'extrait FR accéléré par la synthèse. ElevenLabs est bien meilleur en anglais qu'en français. Conséquence technique : synthétiser à débit normal et gérer « rapide » par la vitesse de lecture du lecteur.
