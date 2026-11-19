# Worker de génération

Le worker fabrique les épisodes demandés depuis l'application : recherche, plan,
écriture, vérification, voix, puis montage d'un seul MP3 avec chapitres. Il tourne
sur le PC qui héberge le modèle local (RTX 2060, Ollama, Qwen3 8B) et prend les
étapes une par une dans la file Supabase.

## Installation (une fois, sur le PC RTX 2060)

1. Installer **Node.js 22** (nodejs.org, version LTS), **Git** (git-scm.com) et **Ollama** (ollama.com).
2. Dans un terminal :
   ```bash
   ollama pull qwen3:8b
   git clone https://github.com/ngadea34/FocusBrainApp.git
   cd FocusBrainApp
   npx -y pnpm@10.28.0 install
   ```
3. Copier `services/worker/.env.example` en `services/worker/.env` et le remplir :
   - `DATABASE_URL` : Supabase > ton projet > bouton **Connect** > « Session pooler ».
     Remplacer `[YOUR-PASSWORD]` par le mot de passe de la base (Project Settings > Database ;
     on peut le réinitialiser là si on ne l'a plus).
   - `SUPABASE_SERVICE_KEY` : Project Settings > API Keys > **Secret keys** (`sb_secret_…`).
   - `GOOGLE_TTS_API_KEY` : la clé Google Cloud Text-to-Speech.

   Ce fichier contient des secrets : il reste sur ce PC, il n'est jamais commité
   (il est dans `.gitignore`), et on ne le colle jamais dans une conversation.

## Lancer

```bash
npx -y pnpm@10.28.0 worker
```

Le worker affiche une ligne `started`, puis traite les épisodes en attente. Les
journaux ne contiennent jamais le sujet ni le texte des épisodes, seulement des
identifiants techniques. **Ctrl+C** arrête proprement après l'étape en cours ; un
deuxième Ctrl+C arrête tout de suite (l'étape sera reprise plus tard, sans perte).

Toutes les 60 s, il remet en file les étapes d'un worker qui aurait planté et
supprime les fichiers audio des comptes supprimés.

## Configuration facultative

| Variable | Rôle | Défaut |
|---|---|---|
| `OLLAMA_URL`, `OLLAMA_MODEL` | Modèle local | `http://127.0.0.1:11434`, `qwen3:8b` |
| `OPENALEX_API_KEY` | Active OpenAlex | désactivé |
| `RESEARCH_CONTACT` | Contact dans le User-Agent (Wikimedia, Crossref) | aucun |
| `WORKER_ID` | Nom du worker dans la file | nom du PC + numéro de processus |
| `WORKER_POLL_MS` | Attente quand la file est vide | 5000 |
| `DATABASE_CA_FILE` | Certificat de Supabase pour vérifier la connexion (Project Settings > Database > SSL) | connexion chiffrée sans vérification du certificat |

## Tests

- `pnpm test` : configuration, montage, boucle (sans réseau).
- `pnpm test:db` : génération complète contre les vraies fonctions SQL, montage réel compris.
