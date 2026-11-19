# Application mobile (Expo, SDK 58)

Première version : connexion, création d'un épisode, bibliothèque, suivi de l'état,
validation du plan, sources, lecteur audio (vitesse ×1 à ×2). Français et anglais
selon la langue du téléphone.

## Adresse e-mail confirmée ?

Si tu arrives ici après avoir touché le lien de confirmation reçu par e-mail :
ton adresse est confirmée. Reviens dans l'application et connecte-toi.

## Tester sur un téléphone Android avec Expo Go (gratuit, sans compte)

1. Sur le téléphone : installer **Expo Go** depuis le Play Store.
2. Sur un ordinateur relié au même Wi-Fi, avec Node 22 et pnpm :
   ```bash
   git clone https://github.com/ngadea34/FocusBrainApp.git
   cd FocusBrainApp
   pnpm install
   cd apps/mobile
   npx expo start
   ```
3. Dans Expo Go, scanner le QR code affiché dans le terminal.

Si le téléphone ne trouve pas l'ordinateur (pare-feu Windows, Wi-Fi invité), autoriser
Node.js sur les réseaux privés dans le pare-feu.

## Configuration

`src/config.ts` contient l'URL du projet Supabase de développement et sa clé
**publishable**. Cette clé est faite pour être embarquée dans une application : elle ne
donne que les droits de l'utilisateur connecté, bornés par la RLS. Aucun secret dans
l'application. Pour viser un autre projet : variables `EXPO_PUBLIC_SUPABASE_URL` et
`EXPO_PUBLIC_SUPABASE_KEY`.

## Connexion

E-mail et mot de passe, avec confirmation de l'adresse par e-mail. Les codes à usage
unique demanderaient de modifier les modèles d'e-mail, ce que l'offre gratuite de
Supabase n'autorise qu'avec un serveur SMTP personnel (décision D10). Avec l'envoi
d'e-mails par défaut de Supabase, seules les adresses des membres de l'organisation
Supabase reçoivent l'e-mail : c'est voulu pendant le développement.

## Tests

- `pnpm test` (racine) : logique de l'app et textes FR/EN (`test/app.test.ts`).
- `pnpm test:remote nejqievnldeqiasqsdlj apps` : les appels de l'app contre le vrai
  projet, avec la vraie clé publique (`test/api.remote.test.ts`).
- `pnpm --filter @app/mobile typecheck` ; `npx expo export --platform android` vérifie
  que le bundle Android se construit.
