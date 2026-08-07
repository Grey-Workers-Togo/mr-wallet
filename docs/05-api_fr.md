# 05 — API REST

Base : `/api/v1`. Format : JSON. Authentification : `Authorization: Bearer <access_token>` sur tous les endpoints, à la seule exception de `/auth/refresh` qui s'appuie sur un cookie `HttpOnly` (voir `07-securite-audit.md § 2`).

---

## 1. Conventions générales

### Montants

Un montant est toujours transporté sous forme d'objet, jamais de nombre nu :

```json
{ "amountMinor": "125000", "currency": "XOF" }
```

`amountMinor` est une **chaîne** en JSON (les `BigInt` dépassent `Number.MAX_SAFE_INTEGER` et JSON n'a pas d'entier arbitraire). Le client le convertit en `BigInt`.

### Dates

ISO 8601 avec fuseau : `2026-07-28T00:00:00+01:00`. Les dates métier (`occurredAt`) acceptent aussi une date seule (`2026-07-28`), interprétée à minuit dans le fuseau de l'utilisateur.

### Nommage

`camelCase` pour les champs, `kebab-case` pour les segments d'URL, pluriel pour les collections.

### Pagination

Curseur (pas d'offset — l'offset dérive quand des lignes sont insérées entre deux pages) :

```
GET /transactions?limit=50&cursor=eyJpZCI6...
```

```json
{
  "data": [ ... ],
  "pageInfo": { "hasNextPage": true, "endCursor": "eyJpZCI6..." },
  "totalCount": 1284
}
```

`totalCount` n'est renvoyé que si `?withCount=true` (le comptage coûte cher sur les grandes tables).

### Tri et filtres

```
?sort=-occurredAt,amountMinor          # - = descendant
?occurredAt[gte]=2026-01-01&occurredAt[lt]=2026-02-01
?accountId=<uuid>&accountId=<uuid>     # répétition = OU
?type=EXPENSE&categoryId=<uuid>
?q=texte libre                         # recherche sur description + payee
```

### Idempotence

Les `POST` de création acceptent `Idempotency-Key: <uuid>`. Une clé rejouée dans les 24 h renvoie la réponse d'origine (même code HTTP, même corps) sans réexécuter.

### Langue

L'API ne renvoie **aucun texte destiné à être lu par un humain** (ADR-0009). Elle transporte des codes stables et des paramètres ; la traduction est faite par le client.

L'en-tête `Accept-Language` n'est donc utilisé que dans deux cas : l'envoi d'une notification push (rendue serveur, RG-N10) et les emails transactionnels (V2). Quand il est présent, il prime sur `user.locale` pour la requête en cours — cela permet à un utilisateur de changer de langue avant d'avoir enregistré sa préférence. Valeurs reconnues : `fr`, `en`. Toute autre valeur retombe sur `user.locale`, puis sur `fr`.

### Erreurs

```json
{
  "error": {
    "code": "TRANSACTION_CURRENCY_MISMATCH",
    "params": { "expected": "XOF", "received": "EUR" },
    "details": [{ "field": "currency", "code": "CURRENCY_MISMATCH" }],
    "requestId": "req_01J9..."
  }
}
```

| Champ | Rôle |
|---|---|
| `code` | Identifiant stable, en anglais, `SCREAMING_SNAKE_CASE`. C'est le contrat : il ne change pas sans version d'API. |
| `params` | Valeurs à interpoler dans le message traduit. Jamais de phrase, uniquement des données. |
| `details` | Erreurs par champ, chacune avec son propre `code`. Utilisé pour l'affichage au niveau du formulaire. |
| `requestId` | Corrélation avec `AuditLog.requestId` et les logs applicatifs. |

Le client possède un dictionnaire `code → message` par langue. Un `code` inconnu (client non à jour) affiche un message générique accompagné du `requestId`, jamais une chaîne vide ni le code brut.

> **Pourquoi pas de `message` serveur** : au-delà de l'i18n, une erreur identifiée par un code est testable et interprétable par un client, ce qu'une phrase en langue naturelle n'est pas. Un message serveur finit toujours par être comparé par sous-chaîne quelque part.

| Code HTTP | Usage |
|---|---|
| 400 | Corps invalide, règle métier violée |
| 401 | Token absent, expiré ou invalide |
| 403 | Ressource appartenant à un autre utilisateur (**renvoyer 404 en réalité**, voir note) |
| 404 | Ressource inexistante |
| 409 | Conflit (doublon, budget chevauchant, version obsolète) |
| 422 | Validation de schéma échouée |
| 429 | Quota dépassé |
| 500 | Erreur serveur (jamais de détail technique dans la réponse) |

> **Note de sécurité** : une ressource appartenant à un autre utilisateur renvoie **404**, pas 403. Un 403 confirmerait l'existence de l'identifiant et permettrait l'énumération.

### En-têtes de réponse standard

`X-Request-Id` (corrélation avec l'audit), `RateLimit-*`.

---

## 2. Authentification

| Méthode | Chemin | Description |
|---|---|---|
| POST | `/auth/register` | Inscription. Corps : email, password, baseCurrency, timezone. |
| POST | `/auth/login` | Retourne `accessToken` (15 min) dans le corps. Le refresh token (30 j) est posé en cookie `HttpOnly; Secure; SameSite=Strict`, scopé sur `/api/v1/auth/refresh` — il n'apparaît jamais dans le corps de la réponse. |
| POST | `/auth/refresh` | Rotation du refresh token. L'ancien est immédiatement révoqué. Seul endpoint acceptant le cookie ; exige un en-tête anti-CSRF. |
| POST | `/auth/logout` | Révoque la session courante. |
| POST | `/auth/logout-all` | Révoque toutes les sessions. |
| GET | `/auth/sessions` | Liste des sessions actives (appareil, dernière utilisation). |
| DELETE | `/auth/sessions/:id` | Révoque une session précise. |
| POST | `/auth/password/forgot` | Envoi d'un lien de réinitialisation. Réponse toujours 204, même si l'email n'existe pas. |
| POST | `/auth/password/reset` | Réinitialisation par token. Révoque toutes les sessions. |
| POST | `/auth/password/change` | Changement avec mot de passe actuel. |

---

## 3. Utilisateur

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/me` | Profil et préférences |
| PATCH | `/me` | Modifier displayName, locale, timezone, weekStartsOn, monthStartDay |
| PATCH | `/me/base-currency` | Changer la devise de référence (opération lourde : recalcule les rapports en cache) |
| DELETE | `/me` | Suppression du compte (soft delete + purge planifiée à J+30) |
| GET | `/me/export` | Déclenche un export intégral |

---

## 4. Comptes

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/accounts` | Liste. `?includeArchived=true` |
| POST | `/accounts` | Création |
| GET | `/accounts/:id` | Détail avec solde courant |
| PATCH | `/accounts/:id` | Modification (devise refusée si transactions existantes) |
| DELETE | `/accounts/:id` | Soft delete, refusé si transactions |
| POST | `/accounts/:id/archive` | Archivage |
| POST | `/accounts/:id/unarchive` | Désarchivage |
| GET | `/accounts/:id/balance-history` | Série temporelle du solde. `?from&to&granularity=day\|week\|month` |
| POST | `/accounts/:id/reconcile` | Compare solde stocké et solde calculé, retourne l'écart |

---

## 5. Catégories et tags

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/categories` | Arbre complet. `?kind=EXPENSE`. Chaque nœud renvoie `i18nKey` **et** `name` ; le client résout l'affichage (RG-C6) |
| POST | `/categories` | Création |
| PATCH | `/categories/:id` | Modification |
| DELETE | `/categories/:id?reassignTo=<uuid>` | Suppression avec réaffectation obligatoire si utilisée |
| POST | `/categories/reorder` | Réordonnancement en lot |
| GET / POST | `/tags` | Liste / création |
| PATCH / DELETE | `/tags/:id` | Modification / suppression |

---

## 6. Transactions

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/transactions` | Liste paginée et filtrée (voir § filtres) |
| POST | `/transactions` | Création d'une dépense ou d'un revenu |
| POST | `/transactions/transfer` | Création d'un transfert (crée les deux jambes) |
| GET | `/transactions/:id` | Détail |
| PATCH | `/transactions/:id` | Modification |
| DELETE | `/transactions/:id` | Soft delete |
| POST | `/transactions/bulk` | Création en lot (max 500) |
| PATCH | `/transactions/bulk` | Modification en lot (recatégorisation, ajout de tags) |
| DELETE | `/transactions/bulk` | Suppression en lot |
| GET | `/transactions/search` | Recherche avancée (corps de filtres complexe en query ou POST) |
| GET | `/transactions/summary` | Agrégats sur le filtre courant : total, moyenne, nombre, par catégorie |

### Exemple — création

```http
POST /api/v1/transactions
Idempotency-Key: 9f1c...

{
  "accountId": "acc_...",
  "type": "EXPENSE",
  "amountMinor": "12500",
  "currency": "XOF",
  "occurredAt": "2026-07-28",
  "description": "Taxi aéroport",
  "categoryId": "cat_...",
  "payee": "Gozem",
  "tagIds": ["tag_..."],
  "notes": null
}
```

### Exemple — transfert

```http
POST /api/v1/transactions/transfer

{
  "fromAccountId": "acc_bank",
  "toAccountId": "acc_savings",
  "amountMinor": "50000",
  "currency": "XOF",
  "occurredAt": "2026-07-28",
  "description": "Épargne mensuelle"
}
```

Devises différentes : ajouter `toAmountMinor` et `toCurrency`.

---

## 7. Récurrences

| Méthode | Chemin | Description |
|---|---|---|
| GET / POST | `/recurrences` | Liste / création |
| GET / PATCH / DELETE | `/recurrences/:id` | Détail / modification / suppression |
| GET | `/recurrences/:id/occurrences?until=` | Occurrences projetées |
| POST | `/recurrences/:id/skip` | Ignorer la prochaine occurrence. Corps : `{ "occurrenceDate": "..." }` |
| POST | `/recurrences/:id/materialize` | Créer maintenant la transaction de l'occurrence en attente |
| GET | `/recurrences/suggestions` | Récurrences détectées dans l'historique, non encore créées |
| GET | `/recurrences/upcoming?days=30` | Toutes les échéances à venir, tous types confondus |

---

## 8. Budgets

| Méthode | Chemin | Description |
|---|---|---|
| GET / POST | `/budgets` | Liste / création |
| GET / PATCH / DELETE | `/budgets/:id` | Détail / modification / suppression |
| GET | `/budgets/current` | Période en cours de tous les budgets, avec consommation et reste |
| GET | `/budgets/:id/periods` | Historique des périodes |
| GET | `/budgets/:id/periods/:periodId` | Détail d'une période avec les transactions qui la composent |
| POST | `/budgets/from-template` | Création depuis un modèle. Corps : `{ "template": "FIFTY_THIRTY_TWENTY", "monthlyIncomeMinor": "..." }` |

Réponse type de `/budgets/current` :

```json
{
  "data": [{
    "budgetId": "bdg_...",
    "name": "Alimentation",
    "categoryId": "cat_...",
    "periodStart": "2026-07-01T00:00:00+01:00",
    "periodEnd": "2026-07-31T23:59:59+01:00",
    "allocatedMinor": "150000",
    "rolloverInMinor": "-8000",
    "spentMinor": "97500",
    "remainingMinor": "52500",
    "percentUsed": 65,
    "currency": "XOF",
    "daysRemaining": 4,
    "projectedEndMinor": "121875",
    "status": "ON_TRACK"
  }]
}
```

`status` ∈ `ON_TRACK` | `AT_RISK` (rythme de dépense menant au dépassement) | `EXCEEDED`.

---

## 9. Dettes

| Méthode | Chemin | Description |
|---|---|---|
| GET / POST | `/debts` | Liste / création |
| GET / PATCH / DELETE | `/debts/:id` | Détail / modification / suppression |
| GET | `/debts/:id/schedule` | Échéancier complet |
| POST | `/debts/:id/schedule/regenerate` | Régénère les échéances futures |
| GET | `/debts/:id/payments` | Historique des paiements |
| POST | `/debts/:id/payments` | Enregistrer un paiement |
| DELETE | `/debts/:id/payments/:paymentId` | Annuler un paiement (supprime la transaction liée) |
| POST | `/debts/:id/simulate-payoff` | Simule un remboursement anticipé. Corps : `{ "extraAmountMinor": "...", "strategy": "REDUCE_TERM" \| "REDUCE_INSTALLMENT" }` |
| GET | `/debts/summary` | Capital total dû, intérêts payés cumulés, prochaine échéance, date de sortie de dette |
| GET | `/debts/payoff-strategies` | (V2) Comparaison avalanche vs boule de neige |

Réponse type de `simulate-payoff` :

```json
{
  "currentPayoffDate": "2029-03-15",
  "newPayoffDate": "2028-08-15",
  "monthsSaved": 7,
  "interestSavedMinor": "184300",
  "newInstallmentMinor": "125000",
  "currency": "XOF"
}
```

---

## 10. Objectifs

| Méthode | Chemin | Description |
|---|---|---|
| GET / POST | `/goals` | Liste / création |
| GET / PATCH / DELETE | `/goals/:id` | Détail / modification / suppression |
| POST | `/goals/:id/contributions` | Ajouter une contribution |
| DELETE | `/goals/:id/contributions/:contributionId` | Retirer une contribution |
| GET | `/goals/:id/progress` | Progression, épargne mensuelle requise, projection d'atteinte |

---

## 11. Prévisions

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/forecast/cashflow?months=6` | Projection de trésorerie mensuelle |
| GET | `/forecast/net-worth?months=12` | Projection du patrimoine net |
| POST | `/forecast/scenario` | (V2) Projection sous hypothèses |

```json
// POST /forecast/scenario
{
  "months": 12,
  "adjustments": [
    { "type": "CATEGORY_CHANGE", "categoryId": "cat_transport", "percentChange": -20 },
    { "type": "EXTRA_DEBT_PAYMENT", "debtId": "debt_auto", "amountMinor": "500000", "atMonth": 2 },
    { "type": "INCOME_CHANGE", "amountMinor": "50000", "fromMonth": 3 }
  ]
}
```

---

## 12. Rapports

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/reports/spending-by-category` | `?from&to&accountId&depth=1\|2` |
| GET | `/reports/monthly-summary` | `?months=12` — revenus, dépenses, net par mois |
| GET | `/reports/net-worth` | `?from&to&granularity=month` |
| GET | `/reports/cashflow` | Entrées/sorties/net |
| GET | `/reports/comparison` | `?periodA=2026-07&periodB=2026-06` |
| GET | `/reports/top-transactions` | `?from&to&limit=10` |
| GET | `/reports/budget-vs-actual` | `?period=2026-07` |
| GET | `/reports/dashboard` | Agrégat unique pour l'écran d'accueil (évite 8 requêtes) |

---

## 13. Import

| Méthode | Chemin | Description |
|---|---|---|
| GET / POST | `/import/sources` | Configurations de mapping |
| PATCH / DELETE | `/import/sources/:id` | |
| POST | `/import/upload` | `multipart/form-data`. Retourne `batchId` + aperçu des 20 premières lignes brutes et colonnes détectées |
| POST | `/import/batches/:id/mapping` | Soumettre le mapping colonnes → champs |
| GET | `/import/batches/:id/preview` | Lignes parsées, catégorisées, avec marquage des doublons |
| POST | `/import/batches/:id/commit` | Valide l'import. Corps : lignes à exclure, corrections manuelles |
| GET | `/import/batches` | Historique des lots |
| GET | `/import/batches/:id` | Détail, y compris erreurs par ligne |
| POST | `/import/batches/:id/revert` | Annule le lot entier |

---

## 14. Export

| Méthode | Chemin | Description |
|---|---|---|
| POST | `/export/transactions` | `{ format: "CSV"\|"XLSX", filters: {...} }` → fichier |
| POST | `/export/full` | Archive complète de toutes les entités |
| GET | `/export/jobs/:id` | Statut d'un export asynchrone (au-delà de 10 000 lignes) |

---

## 15. Devises

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/currencies` | Devises supportées avec `minorUnits` |
| GET | `/currencies/rates?from&to&at=` | Taux applicable à une date |
| POST | `/currencies/rates` | Saisie manuelle d'un taux |
| DELETE | `/currencies/rates/:id` | |
| POST | `/currencies/convert` | `{ amountMinor, from, to, at }` |

---

## 16. Notifications et audit

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/notifications?unreadOnly=true` | Liste. Renvoie `type` + `params`, jamais de texte rendu (RG-N9) |
| POST | `/notifications/:id/read` | Marquer comme lue |
| POST | `/notifications/read-all` | Tout marquer comme lu |
| GET | `/notifications/preferences` | Préférences par type et par canal |
| PATCH | `/notifications/preferences` | |
| GET | `/notifications/push/public-key` | Clé publique VAPID, nécessaire à l'abonnement navigateur |
| POST | `/notifications/push/subscribe` | Enregistre un abonnement push |
| DELETE | `/notifications/push/subscribe` | Désabonne l'appareil courant |
| GET | `/notifications/push/devices` | Appareils abonnés (libellé, dernière activité) |
| DELETE | `/notifications/push/devices/:id` | Révoque un appareil |
| POST | `/notifications/push/test` | Envoie une notification de test à l'appareil courant |

```http
POST /api/v1/notifications/push/subscribe

{
  "platform": "WEB_PUSH",
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": { "p256dh": "BN...", "auth": "k9..." },
  "deviceLabel": "Chrome sur Android"
}
```

Un `endpoint` déjà enregistré est mis à jour (`lastSeenAt`, `failureCount = 0`) plutôt que dupliqué.
| GET | `/audit-log` | Journal de l'utilisateur. `?entityType&entityId&action&from&to` |
| GET | `/audit-log/:entityType/:entityId` | Historique complet d'une entité |

Le journal d'audit est **en lecture seule** : aucun endpoint d'écriture ou de suppression n'est exposé.

---

## 17. Limitation de débit

| Périmètre | Limite |
|---|---|
| `/auth/login`, `/auth/password/*` | 5 requêtes / 15 min / IP |
| `/import/upload` | 20 / heure / utilisateur |
| `/export/*` | 10 / heure / utilisateur |
| Reste de l'API | 300 / min / utilisateur |
