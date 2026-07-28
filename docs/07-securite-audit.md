# 07 — Sécurité, audit et horodatage

---

## 1. Modèle de menace (résumé)

| Menace | Gravité | Parade |
|---|---|---|
| Accès aux données d'un autre utilisateur (IDOR) | Critique | Filtrage `userId` systématique + tests d'isolation par endpoint |
| Vol de base de données | Critique | Chiffrement au repos, hachage Argon2id, pas de secret en base |
| Vol de token | Élevée | Access token court, refresh rotatif, révocation de session |
| Fuite par les logs | Élevée | Interdiction d'écrire montants, libellés et emails dans les logs |
| Force brute sur le login | Moyenne | Limitation de débit + verrouillage temporaire |
| Injection SQL | Moyenne | Prisma paramétré ; `$queryRaw` uniquement avec `Prisma.sql` |
| Import de fichier malveillant | Moyenne | Taille limitée, parsing en sandbox, pas d'évaluation de formule Excel |
| XSS via libellé de transaction | Moyenne | Échappement systématique côté rendu, jamais de `dangerouslySetInnerHTML` |
| CSV injection à l'export | Faible | Préfixer d'une apostrophe toute cellule commençant par `= + - @` |

---

## 2. Authentification

- **Hachage** : Argon2id, `memoryCost ≥ 19 MiB`, `timeCost ≥ 2`, `parallelism = 1`. Jamais MD5, SHA-*, ni bcrypt.
- **Politique de mot de passe** : 12 caractères minimum, vérification contre une liste de mots de passe compromis (zxcvbn ou liste HIBP locale). Pas d'exigence de composition arbitraire (majuscule/chiffre/symbole), qui dégrade la qualité réelle des mots de passe.
- **Access token** : JWT, 15 minutes, contient `sub`, `sessionId`, `iat`, `exp`. Aucune donnée personnelle dans le payload.
- **Refresh token** : opaque (aléatoire 256 bits), 30 jours, **stocké haché** en base, **rotatif**. Détection de réutilisation : si un refresh token déjà consommé est présenté, révoquer toute la famille de sessions et notifier l'utilisateur — signal probable de vol.
- **Verrouillage** : après 5 échecs, délai exponentiel (1 s, 2 s, 4 s…) plafonné à 15 minutes, par couple (email, IP).
- **Réinitialisation de mot de passe** : token à usage unique, 30 minutes, invalidé après usage. La réponse de `/auth/password/forgot` est toujours 204, quelle que soit l'existence de l'email (pas d'énumération de comptes).

### Stockage des tokens côté client

Le vol de token est la menace la plus probable sur un client, et le lieu de stockage détermine l'exposition. Les règles diffèrent selon le contexte d'exécution.

| Contexte | Access token | Refresh token |
|---|---|---|
| **Web / PWA** | En mémoire uniquement (variable JavaScript). Jamais `localStorage`. | Cookie `HttpOnly` + `Secure` + `SameSite=Strict`, scopé sur `/api/v1/auth/refresh` |
| **Client natif** (si ADR-0007 est réexaminée) | En mémoire | Keychain (iOS) / Keystore (Android), jamais dans les préférences applicatives |

| Règle | Énoncé |
|---|---|
| RG-S1 | Le refresh token n'est **jamais** accessible au JavaScript de la page. Un cookie `HttpOnly` neutralise le vol par XSS, contrairement à `localStorage`. |
| RG-S2 | L'access token vit en mémoire et disparaît au rechargement. Il est réobtenu par un appel de refresh au démarrage. Le coût est un appel réseau supplémentaire ; le bénéfice est qu'aucun token ne persiste sur disque côté web. |
| RG-S3 | Le cookie de refresh étant `SameSite=Strict`, l'endpoint `/auth/refresh` est le seul à l'accepter, et il exige un en-tête anti-CSRF. Tous les autres endpoints n'acceptent que `Authorization: Bearer`. |
| RG-S4 | À la déconnexion : révocation serveur de la session, suppression du cookie, purge du cache hors ligne (RG-OF3), révocation des `DeviceToken` de l'appareil. |
| RG-S5 | Aucun token, sous aucune forme, n'est écrit dans le cache du service worker. |

### Verrouillage applicatif (PIN)

Verrouillage après inactivité (défaut 5 minutes, configurable, désactivable). Le PIN est une protection **locale** contre l'accès physique à l'appareil : il ne remplace pas l'authentification serveur et **n'est jamais transmis à l'API**.

| Règle | Énoncé |
|---|---|
| RG-S6 | Le PIN est stocké haché (Argon2id, paramètres allégés adaptés au client) dans le stockage local, jamais en clair, jamais envoyé au serveur. |
| RG-S7 | Le verrouillage masque l'interface **et** bloque l'accès aux données du cache hors ligne. Un verrouillage qui laisse les données lisibles par un autre moyen ne protège rien. |
| RG-S8 | Après 5 PIN erronés, le client purge le cache local et force une reconnexion complète. |
| RG-S9 | La biométrie système n'est pas garantie disponible en PWA (voir ADR-0007). Le PIN est le mécanisme de référence ; la biométrie, quand l'API `WebAuthn` est disponible, est proposée en complément optionnel. |

---

## 3. Autorisation

Une seule règle, mais absolue :

> **Toute requête sur une table métier est filtrée par `userId` issu du token, jamais d'un paramètre de requête.**

Mise en œuvre :

1. Un décorateur `@CurrentUser()` fournit l'identifiant.
2. Une extension Prisma injecte automatiquement `where: { userId }` sur les modèles métier, avec une échappatoire explicite (`prisma.$unsafeGlobal`) réservée aux tâches système et auditée.
3. **Test obligatoire pour chaque endpoint** : un utilisateur A obtient 404 sur une ressource de B. Ce test fait partie de la definition of done.

Une ressource d'un autre utilisateur renvoie **404**, jamais 403.

---

## 4. Chiffrement

| Donnée | Protection |
|---|---|
| En transit | TLS 1.3 obligatoire, HSTS, pas de repli HTTP |
| Base de données | Chiffrement au repos au niveau du volume (fourni par l'hébergeur) |
| Sauvegardes | Chiffrées, clés distinctes de celles de production |
| Fichiers importés | Stockés chiffrés, purgés à 30 jours |
| Secrets applicatifs | Variables d'environnement ou gestionnaire de secrets, jamais en dépôt |

Le chiffrement applicatif champ à champ des montants n'est **pas** retenu : il empêcherait toute agrégation SQL, et donc tous les rapports, pour un gain marginal face au chiffrement de volume. Décision à réexaminer seulement si une contrainte réglementaire l'impose.

---

## 5. Journalisation applicative

Interdits dans les logs, quel que soit le niveau :

- montants, libellés de transaction, noms de bénéficiaires ;
- adresses email, mots de passe, tokens, en-têtes `Authorization` ;
- adresses IP en clair (hachées avec un sel applicatif).

Autorisés : identifiants techniques (UUID), codes d'erreur, durées, `requestId`, noms d'endpoint.

Chaque requête porte un `requestId` (ULID) propagé dans les logs et dans `AuditLog.requestId`, ce qui permet de relier une entrée d'audit à sa trace technique sans stocker de donnée sensible.

---

## 6. Horodatage — règles générales

L'horodatage de toutes les actions est une exigence structurante du projet. Elle se décline à trois niveaux.

### Niveau 1 — Horodatage des enregistrements

Toute table métier porte `createdAt`, `updatedAt`, `deletedAt`, en `timestamptz`, **stockés en UTC**.

- La conversion en heure locale est faite à l'affichage, à partir de `user.timezone`.
- Ne jamais utiliser le fuseau du serveur pour un calcul métier.
- `createdAt` est **immuable** : aucun endpoint ne permet de le modifier.

### Niveau 2 — Distinction date métier / date technique

| Champ | Sens | Utilisé pour |
|---|---|---|
| `occurredAt` | Quand l'opération a eu lieu | Budgets, rapports, prévisions, soldes historiques |
| `createdAt` | Quand la ligne a été enregistrée | Audit, tri de saisie, détection d'anomalie |

Une dépense du 3 juillet saisie le 28 juillet compte dans le budget de juillet (par `occurredAt`), et apparaît dans le journal comme créée le 28 (par `createdAt`). Confondre les deux fausse tous les rapports.

### Niveau 3 — Journal d'audit

Voir section suivante.

---

## 7. Journal d'audit

### Principe

Toute action modifiant des données produit une entrée dans `AuditLog`. La table est **append-only**, garantie par trigger PostgreSQL (voir `03-modele-donnees.md § 14`).

### Mise en œuvre

Un **intercepteur NestJS global** capture les mutations. Pas de `auditService.log(...)` disséminé dans les services : ça serait oublié quelque part.

```
Requête → Guard auth → Intercepteur audit (ouvre le contexte)
        → Controller → Service → Prisma (transaction SQL)
        → Intercepteur audit (écrit l'entrée dans la MÊME transaction SQL)
```

L'écriture de l'audit est **dans la transaction métier** : si l'opération est annulée, l'entrée d'audit ne subsiste pas ; si l'audit échoue, l'opération échoue. Un audit décorrélé de l'écriture n'a aucune valeur probante.

### Contenu d'une entrée

```json
{
  "id": 84213,
  "userId": "usr_...",
  "actorType": "USER",
  "action": "transaction.update",
  "entityType": "Transaction",
  "entityId": "txn_...",
  "before": { "amountMinor": "12500", "categoryId": "cat_transport" },
  "after":  { "amountMinor": "15000", "categoryId": "cat_alimentation" },
  "metadata": { "reason": null },
  "ipHash": "a3f1...",
  "userAgent": "Mozilla/5.0 ...",
  "requestId": "req_01J9...",
  "occurredAt": "2026-07-28T13:42:07.331Z"
}
```

Règles de contenu :

| Règle | Énoncé |
|---|---|
| RG-AU1 | `before`/`after` ne contiennent que les **champs modifiés**, pas l'entité entière. |
| RG-AU2 | Liste noire de champs jamais journalisés : `passwordHash`, `refreshTokenHash`, tout champ nommé `*token*`, `*secret*`, `*password*`. Cette liste est centralisée et testée. |
| RG-AU3 | Les opérations en lot produisent **une** entrée avec un compteur, pas une entrée par ligne (`transaction.bulk_update`, `metadata: { count: 143 }`). |
| RG-AU4 | Les actions système portent `actorType = SYSTEM` ou `SCHEDULER` et `userId` renseigné quand l'action concerne un utilisateur précis. |
| RG-AU5 | Les lectures ne sont pas journalisées, **sauf** trois cas sensibles : export de données, consultation du journal d'audit lui-même, connexion. |

### Actions à journaliser (liste minimale)

```
auth.login, auth.login_failed, auth.logout, auth.refresh,
auth.password_change, auth.password_reset, auth.session_revoke
user.update, user.base_currency_change, user.delete, user.export

account.create|update|delete|archive|reconcile
transaction.create|update|delete|bulk_create|bulk_update|bulk_delete
transfer.create|update|delete
category.create|update|delete|reassign
tag.create|update|delete
budget.create|update|delete|period_close
debt.create|update|delete|schedule_regenerate
debt_payment.record|delete
goal.create|update|delete|contribution_add|contribution_delete
recurrence.create|update|delete|materialize|skip
rule.create|update|delete
import.upload|commit|revert
export.transactions|export.full
currency.rate_create|rate_delete
```

### Consultation

- `GET /audit-log` : journal de l'utilisateur, filtrable.
- `GET /audit-log/:entityType/:entityId` : historique complet d'une entité, présenté en frise chronologique dans l'interface (« Modifié le 12/07 : montant 12 500 → 15 000 »).
- Aucun endpoint d'écriture ou de suppression n'est exposé.

### Rétention

Conservation 24 mois glissants. Au-delà, archivage vers stockage froid (export mensuel) puis purge. La purge est elle-même journalisée avec `actorType = SYSTEM`.

---

## 8. Données personnelles

- **Minimisation** : seuls email, nom d'affichage et préférences sont collectés. Pas de numéro de téléphone, pas d'adresse, pas de date de naissance.
- **Droit d'accès et de portabilité** : `GET /me/export` fournit l'intégralité des données dans un format ouvert.
- **Droit à l'effacement** : `DELETE /me` marque le compte supprimé, révoque les sessions, et déclenche une purge physique à J+30. Le délai permet la récupération en cas d'erreur ; il est annoncé à l'utilisateur.
- **Conservation** : les données sont conservées tant que le compte est actif. Un compte inactif depuis 24 mois est notifié avant toute action.
- **Sous-traitants** : aucun service tiers ne reçoit de données financières en V1. Si un fournisseur d'email transactionnel est utilisé, il ne reçoit que l'adresse et le contenu du message.

---

## 9. Sécurité applicative — points de vigilance concrets

**Import Excel** — ne jamais évaluer les formules d'un classeur importé. Lire les valeurs calculées ou la chaîne brute, jamais exécuter.

**Export CSV** — toute cellule commençant par `=`, `+`, `-`, `@`, tabulation ou retour chariot est préfixée d'une apostrophe. Sans cela, un libellé de transaction contenant une formule s'exécute à l'ouverture dans Excel.

**Upload** — vérifier le type MIME **et** la signature du fichier, pas seulement l'extension. Stocker hors de la racine web, sous un nom généré.

**En-têtes HTTP** — `Content-Security-Policy` stricte, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy` minimale.

**CORS** — liste blanche d'origines explicite. Jamais `*` avec `credentials`.

**Dépendances** — `npm audit` en CI, mise à jour mensuelle, verrouillage par lockfile.

---

## 10. Sauvegardes et restauration

- Sauvegarde quotidienne complète + journalisation continue (PITR) sur 7 jours.
- Rétention : 7 jours quotidiens, 4 hebdomadaires, 12 mensuels.
- **Test de restauration trimestriel obligatoire.** Une sauvegarde jamais restaurée n'est pas une sauvegarde.
- Objectifs : RPO 1 h, RTO 4 h.
