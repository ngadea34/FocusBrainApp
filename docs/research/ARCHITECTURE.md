# Moteur documentaire V1

Réponse au brief « Research Engine V1 » du 19/11/2026. Ce document couvre :
- l'audit de l'existant ;
- l'architecture ;
- le tableau des API ;
- les règles de licence ;
- les tests ;
- la maintenance.

La démonstration sur trois sujets est dans [DEMO.md](DEMO.md).

Convention : ce qui a été **observé** en appelant l'API le 19/11/2026 est marqué « observé ». Ce qui ne l'a pas été est marqué « non vérifié ».

## 1. Audit de l'intégration Wikipédia (avant ce travail)

| Constat | Conséquence |
|---|---|
| Wikipédia était la seule source (`WikipediaSearch` dans le worker). | Les preuves étaient tertiaires : la vérification d'un fait reposait sur une encyclopédie. |
| Toutes les sources avaient le même rang (6, « other »), sans type de preuve. | L'évaluateur ne pouvait pas distinguer une revue systématique d'un article encyclopédique. |
| Aucune licence n'était enregistrée. Tout extrait était transmis au modèle. | C'était incompatible avec le §5 du brief : aucun contrôle des droits. |
| L'extrait était rangé dans `sources.metadata` (JSON libre). Pas d'auteurs, de date de publication, d'identifiant (DOI/PMID), de statut de relecture ni de citation. | La traçabilité était incomplète. |
| Le connecteur était codé dans le worker, et le nom « Wikipédia » était écrit en dur dans l'étape de recherche. | Les moteurs métier étaient couplés à un fournisseur. |
| Il n'y avait ni cache, ni espacement des appels, ni reprise sur 429/5xx. Le User-Agent était générique. | Wikimedia renvoie 429 depuis les adresses IP partagées du cloud (observé). |
| La déduplication se limitait à l'URL. | Le même article vu par plusieurs services aurait été compté plusieurs fois. |

Ce qui était sain et a été conservé :
- le contenu non fiable est délimité ;
- une citation n'est gardée que si elle figure mot pour mot dans la source ;
- une affirmation sans citation exacte est rétrogradée en « nuancée » ;
- chaque étape reprend son travail depuis la base de données.

## 2. Architecture

```
moteurs métier (services/worker/src/engines.ts)
   │  ne voient que ResearchDocument + ResearchService
   ▼
packages/research  ← couche indépendante, sans dépendance au worker ni au modèle
   ├─ service.ts     ResearchService : connecteurs actifs en parallèle, panne isolée par source,
   │                 déduplication, rétractations écartées, tri par fiabilité
   ├─ connectors/    un fichier par fournisseur → ResearchDocument
   ├─ http.ts        délai d'attente, reprises 429/5xx (Retry-After plafonné), espacement par hôte,
   │                 cache (interface ; mémoire en dev), User-Agent configurable
   ├─ license.ts     normalisation des licences + décision « transmissible au modèle »
   ├─ evidence.ts    type de preuve et rang de fiabilité (jamais la popularité)
   ├─ dedupe.ts      identité DOI > PMID > PMCID > HAL > Wikidata > URL > titre+année ; fusion
   └─ citation.ts    référence lisible déterministe
```

Ce qui ne change pas : les moteurs restent séparés (recherche, script, voix) et le modèle reste remplaçable (`LlmProvider`). Les fournisseurs vocaux ne sont pas touchés.

### Métadonnées obligatoires (brief §3)

Chaque `ResearchDocument` porte les champs suivants. La migration `0007` les stocke dans `public.sources`.

| Champ du brief | `ResearchDocument` | Colonne `sources` |
|---|---|---|
| source_provider | `sourceProvider`, `providers[]` (fusion) | `source_provider`, `providers` |
| title, authors | `title`, `authors` | `title`, `authors` |
| publication_date, retrieval_date | `publicationDate`, `retrievalDate` | `publication_date`, `retrieved_at` |
| url | `url` | `url` |
| DOI / PMID / identifiant | `ids.{doi,pmid,pmcid,halId,wikidata}` | `doi`, `pmid`, `pmcid`, `hal_id`, `wikidata_id` |
| abstract ou contenu autorisé | `abstract` + `license.allowedForGeneration` | `abstract`, `license_allows_generation` |
| document_type | `documentType` | `document_type` |
| language | `language` | `language` |
| source_license | `license.{raw,code}` | `license_raw`, `license_code` |
| peer_review_status | `peerReviewStatus` | `peer_review_status` |
| publication_status | `publicationStatus` (dont `retracted`) | `publication_status` |
| source_reliability | `evidenceLevel`, `reliabilityTier` | `evidence_level`, `reliability_tier` |
| citation_information | `citation` | `citation` |

### Évaluation documentaire (brief §4)

Le type de preuve vient uniquement des types déclarés par la source et du statut de relecture. Le nombre de citations et la popularité ne sont jamais lus ; un test le vérifie.

| Rang | Type de preuve |
|---|---|
| 1 | Recommandation institutionnelle |
| 2 | Revue systématique, méta-analyse |
| 3 | Étude relue par les pairs |
| 4 | Étude primaire dont la relecture n'est pas établie |
| 5 | Prépublication ; document pédagogique (thèse, cours, chapitre) |
| 6 | Encyclopédie ; inconnu |

Un document rétracté, signalé par au moins une source, est écarté.

Le moteur combine ce rang avec la pertinence notée par le modèle, à l'étape d'évaluation des sources.

### Vérification des faits

Chaque affirmation relevée par le rédacteur est confrontée à la source citée **et** aux deux sources indépendantes les plus fiables qui ont un texte lisible. Le résultat suit ces règles :
- **Contradiction sans confirmation** : l'affirmation est rejetée. Elle déclenche une réécriture, puis elle est retirée si elle persiste.
- **Confirmation et contradiction** : l'affirmation devient « nuancée ». La contradiction est inscrite dans `claims.rationale`, et chaque source est enregistrée dans `claim_evidence` (`supports` / `contradicts`).
- **Aucune source n'en parle** : l'affirmation est « non vérifiée », pour preuve insuffisante.

## 3. Règles de propriété intellectuelle (brief §5)

L'accès gratuit à une API n'autorise pas la réutilisation des contenus. Les règles appliquées sont les suivantes.

| Contenu | Règle |
|---|---|
| Métadonnées (titre, auteurs, date, identifiants, revue) | Elles sont enregistrées et peuvent être citées. Le modèle voit la référence d'une source même si son texte est fermé. |
| Résumé ou texte | Il est transmis au modèle **seulement** si la licence permet l'usage commercial **et** la transformation : CC0, domaine public, CC BY, CC BY-SA. |
| CC BY-NC, CC BY-ND, licences d'éditeur, licences TDM, autorisation HAL, licence absente | Le texte est conservé pour la traçabilité mais **jamais** transmis au modèle. |
| Texte intégral | Il n'est pas téléchargé en V1. Seuls les résumés et introductions sont récupérés, ce qui évite les téléchargements massifs. |
| Redistribution audio | Le script est une reformulation, pas une citation. Les citations exactes ne viennent que de textes sous licence ouverte. Les crédits d'un épisode doivent mentionner les sources CC BY / CC BY-SA, dont Wikipédia (attribution, partage à l'identique). L'écran des crédits reste à faire. |

La vérification ne lit, par défaut, que les textes sous licence ouverte (`verificationMayReadRestricted: false`). Lire un résumé fermé pour juger une affirmation, sans le reproduire, est peut-être admissible, mais c'est une question juridique. Elle est inscrite comme **décision D9**, à valider par un juriste avant d'activer l'option.

## 4. Tableau des API

**Intégrées et testées en direct le 19/11/2026**

| Source | Accès | Limites | Coût | Licence des contenus | Format |
|---|---|---|---|---|---|
| Europe PMC (REST) | Sans clé | Non documentées dans nos tests ; ~2 à 17 s par requête (observé) | Gratuit | Champ `license` par article (ex. « cc by », « cc by-nc-nd »), sinon droits de l'éditeur (observé) | JSON |
| PubMed (E-utilities) | Sans clé | 3 req/s sans clé (en-tête `X-RateLimit-Limit`, observé) | Gratuit | Aucune licence fournie : résumés traités comme non réutilisables | JSON + XML |
| Crossref (REST) | Sans clé | 1 req/s, 1 à la fois sur le pool public (en-têtes, observé) | Gratuit | Licence par DOI (URL) ; les licences « tdm » ne valent pas réutilisation | JSON |
| HAL (Solr) | Sans clé | Non documentées dans nos tests | Gratuit | `licence_s` ; souvent « hal-authorisation » (non ouverte, observé) | JSON |
| Wikipédia (Action API) | Sans clé | Wikimedia demande un User-Agent avec contact (variable `RESEARCH_CONTACT`). Avec contact, depuis le cloud : réponses OK sur 2 sujets sur 3, puis 429 (IP partagée, observé le 19/11/2026) | Gratuit | CC BY-SA 4.0 | JSON |
| Wikidata (Action API) | Sans clé | Idem Wikimedia (429 observé) | Gratuit | CC0 | JSON |

**Prêt, mais désactivé**

| Source | Accès | Limites | Coût | Licence des contenus | Format |
|---|---|---|---|---|---|
| OpenAlex | **Clé gratuite requise** : sans clé, budget quotidien partagé par IP, épuisé (429, observé) | Clé gratuite : 10 000 crédits par jour, une recherche coûte 10 crédits, soit environ 1 000 recherches par jour (en-têtes `X-RateLimit-*` observés le 19/11/2026) | Gratuit avec clé, sans moyen de paiement | Licence par emplacement (`primary_location.license`) | JSON |

**Non intégrées en V1 (phase 2)**

Ces informations n'ont pas été vérifiées en direct.

| Source | Ce qu'on en sait (non vérifié) |
|---|---|
| OMS / Global Health Observatory | API OData de données chiffrées, sans clé |
| Eurostat | API de statistiques, sans clé |
| INSEE | Portail d'API, clé gratuite |
| HAS, INSERM | Pas d'API de recherche publique identifiée : contenu par pages web, ce qui demanderait du scraping, exclu par le brief |
| DOAJ, arXiv | API publiques ; arXiv demande d'espacer les appels |
| Project Gutenberg | Pas d'API officielle documentée (outils tiers seulement) |

## 5. Tests

| Commande | Ce qu'elle couvre |
|---|---|
| `pnpm test` | **Connecteurs** : réponses réelles enregistrées dans `packages/research/test/fixtures`.<br>**Licences** : 9 cas.<br>**Types de preuves**, y compris l'indifférence aux citations.<br>**Déduplication** entre 3 services, fusion par titre, rétractation prioritaire.<br>**HTTP** : cache, Retry-After, 404, espacement.<br>**Isolement** d'une source en panne, désactivation par source, agrégation des avis. |
| `pnpm test:db` | Parcours complet sur la vraie base, avec un faux modèle :<br>- métadonnées et licences enregistrées ;<br>- doublon fusionné avec sa provenance ;<br>- **le texte sous droits n'atteint jamais le modèle** ;<br>- contradiction entre sources détectée et tracée. |
| `pnpm test:live` | Recherche réelle en français et en anglais, avec traçabilité et tri par fiabilité. Hors CI. |
| `pnpm research:demo` | Régénère `DEMO.md`. Hors CI. |

## 6. Maintenance

**Ajouter une source**
1. Créer `packages/research/src/connectors/<id>.ts`, qui renvoie des `ResearchDocument` via `makeDocument`.
2. Y renseigner honnêtement la relecture, le statut et la licence. Ne jamais supposer une licence ouverte.
3. Enregistrer une vraie réponse dans `test/fixtures` et ajouter un test.
4. Ajouter le connecteur à la liste passée à `ResearchService`.

**Autres opérations**
- **Désactiver une source** : `new ResearchService(connectors, { disabled: ["hal"] })`. Aucune autre modification n'est nécessaire.
- **Limites d'appels** : réglage `minIntervalMs` par hôte dans `Http`, par exemple Crossref 1100 ms et PubMed 400 ms. Avec une clé NCBI, PubMed monte à 10 req/s (non vérifié).
- **Contact du User-Agent** : variable d'environnement `RESEARCH_CONTACT` (e-mail ou URL), lue par `researchUserAgent()`. Elle n'est jamais écrite dans le dépôt, qui est public. Les 429 de Wikimedia qui restent viennent de l'IP partagée du cloud ; le PC de dev ou le serveur de production ont leur propre IP.
- **OpenAlex** : actif. En dev, la clé gratuite est injectée par le secret réseau (`api.openalex.org`, `Authorization: Bearer`). Ailleurs (PC de dev, production), la passer au connecteur depuis `OPENALEX_API_KEY` ; elle part en en-tête, jamais dans l'URL ni dans les journaux.
- **Licences** : toute nouvelle forme de licence non reconnue tombe en « restricted ». Pour l'autoriser, ajouter une règle dans `license.ts` **et** un test.
- **Cache** : `MemoryCache` en développement. En production, brancher une implémentation persistante de l'interface `Cache`, par exemple une table Postgres avec une durée de vie.
