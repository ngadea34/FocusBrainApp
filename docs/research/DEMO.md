# Démonstration du moteur documentaire V1

Générée le 2026-11-19 20:23 UTC par `pnpm research:demo`, contre les vraies API publiques.
La vérification des affirmations par le modèle n'est pas incluse : elle demande Qwen3 sur le PC de développement.

## Simple : « couleur bleue du ciel diffusion Rayleigh » / « Rayleigh scattering sky colour »

| Connecteur | Résultat | Durée |
|---|---|---|
| wikidata | 0 documents | 1.1 s |
| hal | 5 documents | 1.4 s |
| crossref | 8 documents | 2.3 s |
| pubmed | 4 documents | 3.4 s |
| europepmc | 4 documents | 14.9 s |
| wikipedia | erreur : fr.wikipedia.org_429 | 31.4 s |

24 documents après déduplication, dont 6 dont le texte peut être transmis au modèle (licence).

| Rang | Type de preuve | Licence | → modèle | Sources | Référence |
|---|---|---|---|---|---|
| 3 | peer_reviewed_study | restricted | non | hal | Stéphane Viollet, Julien Serres (2025). Mesurer l'invisible dans le ciel pour naviguer : une approche inspirée du vivant. La Revue de l'électricité et de l'élec |
| 3 | peer_reviewed_study | unknown | non | pubmed | Hu XL, Liu SP, Li N (2003). Resonance Rayleigh scattering spectra for studying the interaction of aminoglycoside antibiotics with pontamine sky blue and their a |
| 3 | peer_reviewed_study | unknown | non | pubmed | Ehlers K, Chakrabarty R, Moosmüller H (2014). Blue moons and Martian sunsets. Applied optics. doi:10.1364/ao.53.001808 |
| 3 | peer_reviewed_study | unknown | non | pubmed | Gedzelman SD (2005). Simulating colors of clear and partly cloudy skies. Applied optics. doi:10.1364/ao.44.005723 |
| 3 | peer_reviewed_study | cc-by | oui | europepmc | Fernandez AJ, Gibson GM, Rył A et al. (2025). Microrheology: From Video Microscopy to Optical Tweezers. Micromachines. doi:10.3390/mi16080918 |
| 3 | peer_reviewed_study | unknown | non | europepmc | Shepherd J, Leake MC (2025). Invention, innovation, and commercialisation in British biophysics. Biophysical reviews. doi:10.1007/s12551-025-01330-w |
| 3 | peer_reviewed_study | cc-by | oui | europepmc | Fosbury RAE, Jeffery G (2022). Reindeer eyes seasonally adapt to ozone-blue Arctic twilight by tuning a photonic tapetum lucidum. Proceedings. Biological scienc |
| 3 | peer_reviewed_study | cc-by-nc-nd | non | europepmc | Werdell PJ, Cairns B, Caplan SA et al. (2026). Advancing Earth System Science With the NASA Plankton, Aerosol, Cloud, Ocean Ecosystem (PACE) Satellite Mission.  |
| 4 | primary_study | unknown | non | crossref | Lamiaa Alsadaty (2025). Dynamiques Identitaires Dans Un Masque La Couleur Du Ciel De Bassim Khandaqji:, Lecture Sociolinguistique. مجلة لغة . كلام. doi:10.35779 |
| 4 | primary_study | unknown | non | crossref | Elias Khoury, Rania Samara (2006). Et le sud qui s'étend de la ligne bleue au bleu du ciel. La pensée de midi. doi:10.3917/lpm.019.0131 |
| 4 | primary_study | unknown | non | crossref | Marie Parmentier (2021). Du Noir cosmologique au bleu aérien : une brève histoire de la couleur du ciel dans le Japon d’Edo (1603-1868). Cahiers d'Extrême-Asie. |
| 4 | primary_study | unknown | non | crossref | J. Dufay (1929). Spectre, couleur et polarisation de la lumière du ciel nocturne. Journal de Physique et le Radium. doi:10.1051/jphysrad:01929001006021900 |

## Intermédiaire : « sleep deprivation memory consolidation » / « privation de sommeil mémoire »

| Connecteur | Résultat | Durée |
|---|---|---|
| wikipedia | 8 documents | 1.1 s |
| wikidata | 0 documents | 1.1 s |
| hal | 8 documents | 1.5 s |
| pubmed | 5 documents | 2.2 s |
| crossref | 8 documents | 2.4 s |
| europepmc | 8 documents | 16.8 s |

35 documents après déduplication, dont 12 dont le texte peut être transmis au modèle (licence).

| Rang | Type de preuve | Licence | → modèle | Sources | Référence |
|---|---|---|---|---|---|
| 2 | systematic_review | unknown | non | pubmed | Dumitru C, Iacob CI, Zamfirache F et al. (2025). Sleep deprivation and memory consolidation in rats: A meta-analysis of experimental studies. Behavioural brain  |
| 3 | peer_reviewed_study | unknown | non | hal | Eric Le Glou, Laurent Seugnet, Paul Shaw et al. (2012). Circadian Modulation of Consolidated Memory Retrieval Following Sleep Deprivation in Drosophila. Sleep.  |
| 3 | peer_reviewed_study | restricted | non | hal | Géraldine Rauchs, Dorothée Feyers, Brigitte Landeau et al. (2011). Sleep contributes to the strengthening of some memories over others, depending on hippocampal |
| 3 | peer_reviewed_study | unknown | non | pubmed | Walker MP, Stickgold R (2004). Sleep-dependent learning and memory consolidation. Neuron. doi:10.1016/j.neuron.2004.08.031 |
| 3 | peer_reviewed_study | unknown | non | pubmed | Cousins JN, Fernández G (2019). The impact of sleep deprivation on declarative memory. Progress in brain research. doi:10.1016/bs.pbr.2019.01.007 |
| 3 | peer_reviewed_study | unknown | non | pubmed | Pace-Schott EF, Germain A, Milad MR (2015). Effects of sleep on memory for conditioned fear and fear extinction. Psychological bulletin. doi:10.1037/bul0000014 |
| 3 | peer_reviewed_study | unknown | non | pubmed | Sagaspe P, Charles A, Taillard J et al. (2003). [Inhibition and working memory: effect of acute sleep deprivation on a random letter generation task]. Canadian  |
| 3 | peer_reviewed_study | unknown | non | europepmc | Hariyanti D, Muliadi ARP, Rosyidah C et al. (2026). Impact of combined chronic stress and REM sleep deprivation on memory function and hippocampal BDNF protein  |
| 3 | peer_reviewed_study | cc-by-nc | non | europepmc | Chen X, Ruan F, Rodriguez AM et al. (2026). Sleep-dependent DNA methylation remodeling in basolateral amygdala fear engrams. Cell reports. doi:10.1016/j.celrep. |
| 3 | peer_reviewed_study | cc-by | oui | europepmc | Sahnoun I, Moussa I, Ghériani R et al. (2023). [Obstructive hypopnea sleep apnea syndrome in the elderly]. The Pan African medical journal. doi:10.11604/pamj.20 |
| 3 | peer_reviewed_study | cc-by | oui | europepmc | Keita G, Traoré J, Coulibaly SP et al. (2024). [Hospital frequency of non-epileptic psychogenic seizures in Bamako]. The Pan African medical journal. doi:10.116 |
| 4 | primary_study | unknown | non | crossref | Tiba Paula (2009). Sleep deprivation and memory: effects in acquisition, consolidation, retrieval and extinction. Frontiers in Behavioral Neuroscience. doi:10.3 |

## Complexe (débattu) : « screen time attention children » / « écrans attention enfants »

| Connecteur | Résultat | Durée |
|---|---|---|
| wikipedia | erreur : en.wikipedia.org_429; fr.wikipedia.org_429 | 0.5 s |
| wikidata | erreur : www.wikidata.org_429; www.wikidata.org_429 | 1.0 s |
| hal | 8 documents | 1.2 s |
| pubmed | 5 documents | 2.2 s |
| crossref | 8 documents | 2.3 s |
| europepmc | 8 documents | 7.1 s |

24 documents après déduplication, dont 5 dont le texte peut être transmis au modèle (licence).

| Rang | Type de preuve | Licence | → modèle | Sources | Référence |
|---|---|---|---|---|---|
| 2 | systematic_review | unknown | non | pubmed | Santos RMS, Mendes CG, Marques Miranda D et al. (2022). The Association between Screen Time and Attention in Children: A Systematic Review. Developmental neurop |
| 2 | systematic_review | unknown | non | pubmed | Eirich R, McArthur BA, Anhorn C et al. (2022). Association of Screen Time With Internalizing and Externalizing Behavior Problems in Children 12 Years or Younger |
| 2 | systematic_review | cc-by | oui | europepmc | Zhao C, Xu J, Wu X et al. (2026). Screen time and attention-deficit/hyperactivity disorder in children: a systematic review and meta-analysis. doi:10.3389/fped. |
| 3 | peer_reviewed_study | unknown | non | hal | Lee Jasmine C Capilastique, Raiza Marie A Dagohoy, Angel Grace D Garino et al. (2026). Screen Time and Attention Span among Children in a Private School in Iloi |
| 3 | peer_reviewed_study | unknown | non | hal | Gabriel-Job Nneka, N Wobo Kininyiruchi (2025). Screen Time Use and Management among Children: A Study of Teacher’s Knowledge and Awareness in Rivers State, Nige |
| 3 | peer_reviewed_study | unknown | non | hal | Marie Guimard-Brunault, Nadia Hernandez, Laetitia Roché et al. (2023). Back to Basic: Do Children with Autism Spontaneously Look at Screen Displaying a Face or  |
| 3 | peer_reviewed_study | unknown | non | hal | Marie Jourdren, Aurélie Bucaille, Juliette Ropars (2023). The Impact of Screen Exposure on Attention Abilities in Young Children: A Systematic Review. Pediatric |
| 3 | peer_reviewed_study | unknown | non | pubmed | Kar SS, Dube R, Goud BKM et al. (2025). Impact of Screen Time on Development of Children. Children (Basel, Switzerland). doi:10.3390/children12101297 |
| 3 | peer_reviewed_study | unknown | non | pubmed | Nagata JM, Lee CM, Hur JO et al. (2025). What we know about screen time and social media in early adolescence: a review of findings from the Adolescent Brain Co |
| 3 | peer_reviewed_study | unknown | non | pubmed | Harlé B, Desmurget M (2012). [Effects on children's cognitive development of chronic exposure to screens]. Archives de pediatrie : organe officiel de la Societe |
| 3 | peer_reviewed_study | cc-by | oui | europepmc | Carcelén-Fraile MDC, Camacho-Illana A, López-Cantero V et al. (2026). Physical Activity, Screen Time, Cardiorespiratory Fitness, and Selective Attention in Prim |
| 3 | peer_reviewed_study | cc-by | oui | europepmc | Panayotova GG, Yakabova DN (2026). Associations Between Early Screen Exposure and Neurocognitive Outcomes in Children Aged 2-5 Years: A Systematic Review. Healt |
