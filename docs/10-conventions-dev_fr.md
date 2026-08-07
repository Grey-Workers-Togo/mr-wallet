# 10 — Conventions de développement

---

## 1. Langue

| Élément | Langue |
|---|---|
| Code, identifiants, noms de tables et de champs | **Anglais** |
| Codes d'erreur, `i18nKey`, types de notification | **Anglais**, stables, jamais traduits |
| Commentaires de code | Français ou anglais, mais cohérent par fichier |
| Documentation, commits | **Français** |
| Interface utilisateur | **Français et anglais** (ADR-0009) |
| Données saisies par l'utilisateur | Sa langue, jamais traduites |

## 1 bis. Internationalisation

Règle unique, dont tout le reste découle (ADR-0009) :

> **La base et l'API ne contiennent jamais de texte destiné à être lu par un humain.** Elles transportent des identifiants stables et des paramètres ; le rendu se fait côté client.

### Structure des traductions

```
apps/web/messages/
├── fr.json
└── en.json
```

Clés hiérarchiques par domaine, miroir des modules :

```jsonc
{
  "category": { "food": "Alimentation", "housing": "Logement" },
  "error":    { "TRANSACTION_CURRENCY_MISMATCH": "La devise doit être {expected}, reçue {received}." },
  "notification": {
    "BUDGET_THRESHOLD": "Budget {budgetName} : {percentUsed} % consommé, {daysRemaining} jours restants"
  },
  "account":  { "type": { "MOBILE_MONEY": "Mobile money" } }
}
```

Les messages destinés au push sont dupliqués côté serveur (`apps/api/messages/`), puisqu'ils sont rendus au moment de l'envoi (RG-N10).

### Règles

| Règle | Énoncé |
|---|---|
| RG-L1 | Aucune chaîne visible par l'utilisateur n'est écrite en dur dans un composant. Règle de lint dédiée. |
| RG-L2 | **Parité des clés vérifiée en CI** : `fr.json` et `en.json` doivent avoir exactement le même jeu de clés. Une clé manquante fait échouer le build, elle ne retombe pas silencieusement sur l'autre langue. |
| RG-L3 | Un message est une **phrase complète paramétrée**, jamais une concaténation de fragments. L'ordre des mots et les accords diffèrent entre langues. |
| RG-L4 | La pluralisation passe par le mécanisme ICU (`{count, plural, one {…} other {…}}`), jamais par un `if (n > 1)`. |
| RG-L5 | Tout enum exposé à l'utilisateur (`AccountType`, `DebtKind`, `TxStatus`…) a une entrée de traduction par valeur. Ajouter une valeur d'enum sans sa traduction fait échouer la CI. |
| RG-L6 | Les dates et les nombres sont formatés via `Intl`, avec `user.locale` et `user.timezone`. Jamais de format construit à la main. |
| RG-L7 | Le formatage d'un montant combine `locale` (séparateurs, position du symbole) et `Currency.minorUnits` (nombre de décimales). Les deux sont indépendants : un utilisateur en `en` peut afficher des XOF. |
| RG-L8 | Utiliser les propriétés CSS logiques (`margin-inline-start`, `padding-inline`, `text-align: start`) plutôt que `left`/`right`. Convention gratuite qui limite le coût d'un éventuel RTL. |
| RG-L9 | Les libellés d'accessibilité (`aria-label`, `alt`) sont traduits comme le reste. |

---

## 2. Style de code

- TypeScript en mode `strict`, `noUncheckedIndexedAccess` activé.
- Pas de `any`. Utiliser `unknown` puis valider (Zod).
- Pas de `enum` TypeScript côté partagé : préférer les union de littéraux ou les enums Prisma générées.
- Fonctions pures pour toute la logique de calcul (montants, échéanciers, périodes) — elles doivent être testables sans base de données.
- Nommage : `camelCase` (variables, fonctions), `PascalCase` (types, classes), `SCREAMING_SNAKE_CASE` (constantes).
- Un fichier = une responsabilité. Au-delà de 300 lignes, découper.

### Interdits

```ts
// ❌ Montant en nombre flottant
const total = 12.5 + 7.3;

// ❌ Précision codée en dur
const display = amountMinor / 100;

// ❌ Requête non scopée
await prisma.transaction.findMany({ where: { accountId } });

// ❌ Date de calcul métier prise sur createdAt
where: { createdAt: { gte: monthStart } }

// ❌ Chaîne visible en dur, et concaténation de fragments
<button>Enregistrer</button>
const msg = "Budget " + name + " dépassé de " + n + " %";

// ✅ Corrections
const total = Money.add(a, b);
const display = formatMoney(amountMinor, currency);  // lit minorUnits
await prisma.transaction.findMany({ where: { userId, accountId } });
where: { userId, occurredAt: { gte: monthStart } }
<button>{t("common.save")}</button>
const msg = t("budget.exceeded", { name, percent: n });
```

---

## 3. Structure d'un module back-end

```
modules/<nom>/
├── <nom>.module.ts          # déclaration Nest, imports, exports
├── <nom>.controller.ts      # HTTP uniquement : validation, mapping, codes
├── <nom>.service.ts         # règles métier
├── <nom>.facade.ts          # interface publique consommée par les autres modules
├── <nom>.repository.ts      # accès Prisma (si la logique de requête est non triviale)
├── dto/
│   ├── create-<x>.dto.ts
│   └── update-<x>.dto.ts
├── domain/                  # fonctions pures : calculs, règles, invariants
└── __tests__/
    ├── <nom>.service.spec.ts
    ├── <nom>.controller.e2e-spec.ts
    └── domain/*.spec.ts
```

Règles :

- Le **controller** ne contient aucune règle métier.
- Le **service** ne connaît pas HTTP (pas de `Request`, pas de codes de statut).
- La **façade** est le seul export du module vers l'extérieur. Ce qui n'est pas dans la façade est privé.
- Le dossier **domain** ne dépend ni de Nest ni de Prisma. C'est là que vit le calcul d'échéancier, le calcul de période budgétaire, l'arithmétique monétaire.

---

## 4. Validation

- Toute entrée d'API est validée par un schéma Zod, avant d'atteindre le service.
- Les schémas Zod vivent dans `packages/contracts` et sont partagés avec le front — une seule source de vérité pour la forme des données.
- La validation métier (« la devise doit correspondre au compte ») reste dans le service, pas dans le schéma.

---

## 5. Base de données

- Une migration par changement fonctionnel, nommée explicitement : `20260728_add_debt_installments`.
- **Toute migration doit être réversible.** Si ce n'est pas possible, le documenter dans le fichier de migration.
- Pas de `prisma db push` en dehors du prototypage local.
- Toute nouvelle table métier porte les 5 champs obligatoires (`id`, `userId`, `createdAt`, `updatedAt`, `deletedAt`) et l'index `(userId, deletedAt)`.
- Les requêtes analytiques passent par `$queryRaw` avec `Prisma.sql` (jamais de concaténation de chaîne).
- Toute opération touchant à l'argent s'exécute dans une transaction SQL explicite.

---

## 6. Tests

### Répartition attendue

| Type | Cible | Ce qui est testé |
|---|---|---|
| Unitaire (domain) | Couverture ≥ 95 % | Arithmétique monétaire, échéanciers, périodes budgétaires, dédoublonnage, parsing |
| Service | Couverture ≥ 80 % | Règles métier avec base de test |
| API (e2e) | Tous les endpoints | Codes de retour, validation, **isolation multi-utilisateur** |
| Front e2e | 13 cas d'usage MVP | Parcours complets |

### Tests obligatoires, non négociables

1. **Isolation** : pour chaque endpoint, un utilisateur A reçoit 404 sur une ressource de B.
2. **Arithmétique** : aucun test monétaire ne doit passer par un `number`.
3. **Échéancier** : `Σ capital = principal` et dernier `balanceAfter = 0`, sur au moins 5 jeux de paramètres, dont un taux 0 et un montant non divisible.
4. **Conversion** : 10,00 EUR → 6 560 XOF au taux 655,957.
5. **Audit** : chaque mutation produit exactement une entrée, avec les bons `before`/`after`, sans champ sensible.
6. **Réconciliation** : après une séquence aléatoire de 200 créations/modifications/suppressions, le solde stocké est égal au solde recalculé.
7. **Idempotence** : rejouer un `POST` avec la même `Idempotency-Key` ne crée pas de doublon.

### Ce qu'il ne faut pas tester

Getters triviaux, mappings DTO sans logique, code framework. La couverture n'est pas un objectif en soi ; couvrir les règles `RG-xx` de `04-modules.md` l'est.

---

## 7. Git

### Branches

`main` (protégée) ← `feat/<lot>-<sujet>` | `fix/<sujet>` | `chore/<sujet>`

### Commits — Conventional Commits

```
feat(debts): génération de l'échéancier amortissable
fix(transactions): correction du solde après suppression d'un transfert
test(money): cas de répartition avec reste
docs(api): endpoints de simulation de remboursement
refactor(budgets): extraction du calcul de période dans domain/
chore(deps): mise à jour de prisma
```

Un commit = un changement cohérent. Pas de commit « wip » sur `main`.

### Pull requests

- Description : ce qui change, pourquoi, comment tester.
- Référence au lot et aux règles `RG-xx` couvertes.
- CI verte obligatoire.

---

## 8. Definition of done (par tâche)

Une tâche n'est terminée que si **tous** les points sont vrais :

- [ ] Le code respecte les interdits du § 2.
- [ ] Les règles `RG-xx` concernées sont implémentées et testées.
- [ ] Test d'isolation multi-utilisateur ajouté pour chaque nouvel endpoint.
- [ ] Migration Prisma créée, nommée, réversible.
- [ ] Journalisation d'audit vérifiée (l'action apparaît dans `AuditLog` avec le bon contenu).
- [ ] `npm run lint && npm run typecheck && npm run test` passent.
- [ ] La documentation (`docs/03`, `docs/05`) est à jour si le modèle ou l'API a changé.
- [ ] Aucun `console.log`, aucun `TODO` sans ticket associé.
- [ ] Aucune donnée sensible dans les logs ajoutés.
- [ ] **Toute chaîne visible ajoutée existe en `fr` et en `en`** ; la parité des clés passe en CI (RG-L2).
- [ ] Tout nouveau code d'erreur, type de notification ou valeur d'enum exposée a sa traduction dans les deux langues.

---

## 9. Environnements et configuration

| Variable | Rôle | Défaut |
|---|---|---|
| `DATABASE_URL` | Connexion PostgreSQL | — |
| `JWT_SECRET` | Signature des access tokens | — (obligatoire) |
| `JWT_ACCESS_TTL` | Durée de l'access token | `15m` |
| `REFRESH_TTL` | Durée du refresh token | `30d` |
| `ARGON_MEMORY_COST` | Coût mémoire Argon2id | `19456` |
| `UPLOAD_MAX_BYTES` | Taille max d'un import | `10485760` |
| `UPLOAD_RETENTION_DAYS` | Rétention des fichiers importés | `30` |
| `AUDIT_RETENTION_MONTHS` | Rétention du journal d'audit | `24` |
| `EXCHANGE_RATE_PROVIDER` | Fournisseur de taux (vide = désactivé) | vide |
| `VAPID_PUBLIC_KEY` | Clé publique Web Push (vide = push désactivé) | vide |
| `VAPID_PRIVATE_KEY` | Clé privée Web Push | vide |
| `VAPID_SUBJECT` | Contact `mailto:` exigé par la spécification Web Push | vide |
| `IP_HASH_SALT` | Sel de hachage des IP | — (obligatoire) |
| `LOG_LEVEL` | Niveau de log | `info` |

L'application refuse de démarrer si une variable obligatoire manque — validation du schéma d'environnement au boot, pas d'échec silencieux en production.

---

## 10. Tâches planifiées

| Tâche | Fréquence | Rôle |
|---|---|---|
| `generateBudgetPeriods` | quotidienne | Matérialise les périodes budgétaires sur 12 mois glissants |
| `materializeRecurrences` | quotidienne | Crée les transactions des récurrences `autoCreate` échues (idempotent) |
| `notifyUpcoming` | quotidienne | Rappels d'échéances de dettes et de récurrences |
| `markLateInstallments` | quotidienne | Passe les échéances dépassées en `LATE` |
| `reconcileBalances` | nocturne | Compare soldes stockés et recalculés, notifie les écarts |
| `purgeUploads` | quotidienne | Supprime les fichiers importés de plus de 30 jours |
| `purgeAuditLog` | mensuelle | Archive puis purge au-delà de la rétention |
| `purgeDeletedAccounts` | quotidienne | Purge physique des comptes supprimés depuis 30 jours |
| `purgeStaleDeviceTokens` | hebdomadaire | Supprime les abonnements push inactifs ou en échec depuis 90 jours |
| `purgeExpiredSupportRows` | quotidienne | Purge `IdempotencyKey`, `PasswordResetToken` et `ExportJob` expirés |

Toutes les tâches sont **idempotentes** et journalisées avec `actorType = SCHEDULER`.

---

## 11. Journal des décisions

Toute décision d'architecture non triviale est consignée dans `docs/adr/NNNN-titre.md` :

```markdown
# ADR-0003 — Solde de compte stocké plutôt que calculé

## Statut
Accepté — 2026-07-28

## Contexte
[le problème]

## Décision
[ce qui est décidé]

## Conséquences
[bénéfices, coûts, ce que ça ferme]
```

Les six premières ADR sont déjà rédigées (`docs/adr/0001` à `0006`) et couvrent les décisions structurantes prises en phase de conception. Toute nouvelle décision d'architecture prise pendant l'implémentation ajoute une ADR ; une décision qui en remplace une autre passe l'ancienne en statut « Remplacée par ADR-NNNN » sans la supprimer.
