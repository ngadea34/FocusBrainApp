# Application de podcasts personnalisés (nom provisoire)

Transforme une question en monologue audio documenté, adapté aux préférences d'écoute de chacun.
Outil de découverte, d'apprentissage et de concentration — pas un dispositif médical.

## Démarrer

```bash
pnpm install
pnpm typecheck && pnpm test          # contrats et pipeline (Vitest)
PGHOST=... PGPORT=... PGUSER=postgres pnpm test:db   # migrations + tests SQL sur une base jetable
```

`pnpm test:db` crée une base `app_test`, applique `supabase/tests/shim` (rôles et schémas Supabase simulés)
puis `supabase/migrations`, et exécute `supabase/tests/sql/*.test.sql`. Le shim n'est **jamais** déployé.

## Documentation

- [Audit et fondations](docs/AUDIT.md) : état des lieux, architecture, versions, schéma, sécurité, coûts, tâches, décisions
- [Décisions](docs/journal/DECISIONS.md) · [Modifications](docs/journal/CHANGELOG.md) · [Terminé](docs/journal/DONE.md) · [Risques](docs/journal/RISKS.md)
