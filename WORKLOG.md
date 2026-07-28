# WORKLOG — Reqraft CLI

## Lot en cours

Publication — en attente de l'OTP npm ou de la configuration du token d'automation.

## Terminé

### Lots A à K

- Tous les lots implémentés, validés et commités.

### Publication

- ✅ Vérification de la disponibilité du nom `@reqraft/cli` sur npm (disponible).
- ✅ Branche `main` créée/mergée avec `develop` et poussée.
- ✅ Tag `v0.1.0` créé et poussé.
- ✅ Workflow GitHub Actions `.github/workflows/publish.yml` ajouté.
- ✅ `package.json` corrigé avec `npm pkg fix` (chemins `bin` normalisés).
- ✅ Release GitHub `v0.1.0` créée : https://github.com/ronael/Reqraft/releases/tag/v0.1.0
- ❌ Publication npm bloquée par l'OTP 2FA du compte npm.

## Reste à faire

- Fournir l'OTP npm ou configurer un `NPM_TOKEN` d'automation dans les secrets GitHub.
- Relancer `npm publish --otp=<code>` ou déclencher le workflow GitHub Actions.

## Commandes exécutées

- `npm view @reqraft/cli` → 404, nom disponible.
- `git checkout main && git merge develop && git push origin main` → succès.
- `git tag -a v0.1.0 && git push origin v0.1.0` → succès.
- `npm pkg fix` → chemins `bin` corrigés.
- `gh release create v0.1.0` → release créée.
- `npm publish --access public` → échec, OTP requis.

## Décisions techniques

- Workflow de publication automatisée déclenchée par les tags `v*`.
- Le workflow attend le secret `NPM_TOKEN` pour publier automatiquement.

## Prochaine action

Attendre l'OTP ou le token npm de l'utilisateur pour finaliser la publication.
