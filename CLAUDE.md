# Instructions d'implémentation — Budget Manager

Ce fichier s'adresse à l'agent (ou au développeur) qui implémente le projet. Il résume les règles non négociables. Le détail est dans `docs/`.

## Avant d'écrire du code

1. Lire `docs/01-vision-perimetre.md`, `docs/02-architecture.md`, `docs/03-modele-donnees.md`.
2. Lire `docs/09-roadmap.md` et implémenter **dans l'ordre des lots** — ne pas sauter de lot.
3. Lire `docs/10-conventions-dev.md` avant le premier commit.

## Règles absolues

### Argent

- **Jamais de `float` ou de `Number` pour un montant.** Tout montant est un entier en unité mineure (`amountMinor: bigint`) accompagné d'un `currency` (ISO 4217) et d'une précision (`minorUnits`).
- Le XOF n'a pas de sous-unité (`minorUnits = 0`), l'EUR en a 2. Ne jamais coder en dur « ×100 ».
- Les arrondis se font au moment de l'affichage, jamais du stockage.

### Horodatage et traçabilité

- Toute table métier porte `createdAt`, `updatedAt`, et `deletedAt` (soft delete) en `timestamptz`, stockés en UTC.
- Toute écriture (create/update/delete) passant par l'API produit **une entrée dans `audit_log`**, via un intercepteur global — pas de journalisation ad hoc dans chaque service.
- `audit_log` est **append-only** : pas d'UPDATE, pas de DELETE. Vérifier par un trigger PostgreSQL.
- Distinguer toujours la **date métier** (`occurredAt` — quand la dépense a eu lieu) de la **date technique** (`createdAt` — quand la ligne a été enregistrée). Les deux sont obligatoires sur une transaction.

### Modularité

- Un module = un dossier sous `apps/api/src/modules/<nom>/`, avec `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, `entities/`.
- **Un module n'importe jamais le service d'un autre module directement.** Il passe par l'interface publique exportée (`<module>.facade.ts`) ou par un événement.
- Les dépendances autorisées entre modules sont listées dans `docs/02-architecture.md` — ce graphe ne doit pas contenir de cycle.
- Toute nouvelle dépendance inter-module doit être justifiée et ajoutée au graphe dans la doc.

### Langues

- **Deux locales dès le départ : `fr` et `en`** (ADR-0009). Le build échoue si une clé manque dans l'une des deux.
- **La base et l'API ne contiennent jamais de texte lisible par un humain.** Uniquement des identifiants stables et des paramètres : `Notification` stocke `type` + `params`, les catégories système un `i18nKey`, les erreurs un `code` + `params`. Le rendu se fait côté client.
- Aucune chaîne visible en dur dans un composant. Jamais de concaténation de fragments de phrase : un message est une phrase complète paramétrée.
- Les données saisies par l'utilisateur ne sont jamais traduites.
- Exception unique : le contenu d'un push est rendu côté serveur au moment de l'envoi (un service worker inactif ne peut pas traduire) — et il ne stocke rien.

### Périmètre

- **Pas d'offline-first.** Pas de base locale synchronisée, pas de file d'écritures différées, pas de résolution de conflits. Un cache de **consultation** en lecture seule est prévu au lot 7 (ADR-0008) : il ne bufferise jamais d'écriture.
- **Un seul front.** PWA installable, responsive-first, pas d'application native (ADR-0007). Corollaire : toute logique métier réutilisable vit dans `packages/contracts` ou dans les dossiers `domain/`, jamais dans un composant React.
- **Pas de connecteur vers une API tierce** (banque, VTC, livraison) en V1 ou V2. L'ingestion se fait par import de fichier ou saisie manuelle.
- **Pas d'appel à une API de taux de change payante** dans le cœur applicatif. Le module devises fonctionne avec des taux saisis manuellement ; un provider externe est branchable mais optionnel (voir `docs/08-devises.md`).

### Sécurité

- Mots de passe : Argon2id. Jamais de MD5/SHA/bcrypt.
- Toute requête est scopée à l'utilisateur authentifié. **Aucune requête Prisma sur une table métier sans filtre `userId`.** Écrire un test qui vérifie qu'un utilisateur A ne peut pas lire les données d'un utilisateur B, pour chaque endpoint.
- Ne jamais écrire de montant, de libellé de transaction ou d'email dans les logs applicatifs.
- **Jamais de token dans `localStorage`.** Access token en mémoire, refresh token en cookie `HttpOnly` scopé sur `/auth/refresh`. Aucun token dans le cache du service worker.
- **Aucun montant ni libellé dans le contenu d'une notification push** : elle s'affiche sur un écran verrouillé et transite par un service tiers.

## Ce qu'il faut faire quand un point est ambigu

Ne pas inventer une règle métier silencieusement. Ouvrir une question dans `docs/QUESTIONS.md` (à créer au besoin), implémenter le comportement le plus conservateur, et le signaler dans le résumé de la tâche.

## Definition of done (par lot)

- Tests unitaires sur les règles métier du lot (pas de test de getter trivial).
- Test d'intégration API pour chaque endpoint exposé, incluant le test d'isolation multi-utilisateur.
- Migration Prisma versionnée et réversible.
- Documentation mise à jour si le modèle ou l'API a changé (`docs/03`, `docs/05`).
- `npm run lint && npm run typecheck && npm run test` passent.
