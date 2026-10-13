# Instructions d'implémentation — Budget Manager

Ce fichier s'adresse à l'agent (ou au développeur) qui implémente le projet. Il résume les règles non négociables. Le détail est dans `docs/`.

## Avant d'écrire du code

1. Lire `docs/01-vision-perimetre.md`, `docs/02-architecture.md`, `docs/03-modele-donnees.md`.
2. Lire `docs/09-roadmap.md` et implémenter **dans l'ordre des lots** — ne pas sauter de lot.
   Pour l'assistant et la capture SMS : `docs/17-roadmap-assistant.md` (lots A0 à A5).
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

- **Offline-first sur mobile uniquement** (ADR-0010, qui remplace ADR-0004). Le client envoie des intentions, jamais des états ; le serveur reste seul juge ; aucun conflit n'est résolu silencieusement. Le web garde un cache de **consultation** en lecture seule (ADR-0008) qui ne bufferise jamais d'écriture.
- **Clients.** Web : PWA installable, responsive-first. Natif : `apps/mobile` (Expo, ADR-0011/0012, pas encore commencé) et `apps/capture` (application Android de capture des SMS, ADR-0020). Toute logique métier réutilisable vit dans `packages/` ou dans les dossiers `domain/`, jamais dans un composant React. Une app n'importe jamais depuis une autre app (RG-RE1).
- **Pas de connecteur vers une API tierce pour l'ingestion** (banque, VTC, livraison). L'ingestion se fait par saisie, import de fichier ou SMS d'opérateur (ADR-0005, ADR-0013, ADR-0020). Un fournisseur de LLM n'est pas un connecteur d'ingestion : il n'est appelé qu'à travers le port `LlmProvider` (ADR-0017).
- **Pas d'appel à une API de taux de change payante** dans le cœur applicatif. Le module devises fonctionne avec des taux saisis manuellement ; un provider externe est branchable mais optionnel (voir `docs/08-devises.md`).

### Assistant et capture SMS (ADR-0016 à ADR-0022)

Feuille de route : `docs/17-roadmap-assistant.md`, lots **A0 à A5**, dans l'ordre, sur la branche `feat/assistant`. Lire les ADR 0016 à 0022 avant le premier lot.

- **Le LLM ne calcule jamais.** Il choisit un outil en lecture seule ; chaque chiffre vient d'une façade existante (`ReportingFacade`, `AccountsFacade`…). Un outil ne contient aucune logique métier (ADR-0016).
- **Le LLM n'écrit jamais un nombre.** Réponses à gabarits `{{r1.x}}`, validées (aucun chiffre hors repères), une correction puis repli déterministe. Les valeurs dérivées (pourcentages, écarts) sont calculées par le code, en entiers (ADR-0018).
- **Le LLM ne produit ni date ni identifiant.** Périodes symboliques résolues côté serveur avec `users.timezone` ; catégories et comptes par alias (`c1`, `a1`).
- **`userId` vient toujours du jeton**, jamais de la sortie du modèle. Test d'isolation A/B pour chaque outil.
- **Aucun appel direct à un SDK de fournisseur** hors des adaptateurs du module `llm`. Tous les tests passent par l'adaptateur `fake` : aucun test ne fait d'appel réseau ni ne coûte d'argent (RG-LL5).
- **Pas de LangChain ni de framework d'orchestration. Pas de modèle exécuté sur le téléphone** (ADR-0017).
- **Rien n'est stocké** : ni question, ni réponse, ni prompt, ni SMS. Seule la table de compteurs `AssistantUsage` persiste, sans texte. Les traces Langfuse ne contiennent que des métadonnées (ADR-0019).
- **Ce qui part au fournisseur est minimisé** : jamais la liste brute des transactions, jamais un identifiant interne, jamais un numéro de téléphone, jamais le nom d'une personne pour un transfert entre particuliers (ADR-0019, ADR-0021).
- **SMS** : liste blanche d'expéditeurs appliquée dans le code natif ; aucune transaction créée sans confirmation de l'utilisateur ; les transactions confirmées passent par `/sync/push`. **Aucun vrai SMS dans ce dépôt (public)** : les tests utilisent des SMS synthétiques ; le corpus réel est dans le dépôt privé `mr-wallet-assistant-research` (ADR-0020).
- **Tout est derrière `ASSISTANT_ENABLED` / `CAPTURE_ENABLED`**. Changements de schéma additifs et réversibles uniquement ; aucun endpoint existant ne change de forme (ADR-0022).
- **Arrêt en fin de lot.** À la fin de chaque lot : vérifier le critère de sortie, lancer `npm run lint && npm run typecheck && npm run test`, résumer ce qui a été fait, les questions ouvertes et les écarts aux ADR, puis **attendre la validation** avant le lot suivant.

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
