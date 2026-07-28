# 02 — Architecture technique

## 1. Forme générale : monolithe modulaire

Le back-end est **un seul déploiement**, découpé en modules à frontières strictes.

Pourquoi pas des microservices : un utilisateur unique consulte ses propres données, les volumes sont faibles (quelques milliers de transactions par utilisateur), et les transactions métier traversent plusieurs domaines (enregistrer un remboursement touche `debts` et `transactions` de façon atomique). Des microservices imposeraient de la cohérence distribuée pour aucun gain. Le découpage modulaire strict préserve néanmoins la possibilité d'extraire un module plus tard s'il le fallait.

```
┌─────────────────────────────────────────────────────┐
│                  Front-end (Next.js)                │
└──────────────────────────┬──────────────────────────┘
                           │ REST/JSON + JWT
┌──────────────────────────▼──────────────────────────┐
│                    API (NestJS)                     │
│  ┌───────────────────────────────────────────────┐  │
│  │ Modules métier                                │  │
│  │ accounts · transactions · categories ·        │  │
│  │ budgets · debts · goals · recurrence ·        │  │
│  │ forecasting · reporting · import · export     │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │ Modules transverses                           │  │
│  │ auth · users · currency · audit ·             │  │
│  │ notifications · money (kernel)                │  │
│  └───────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────┘
                           │ Prisma
┌──────────────────────────▼──────────────────────────┐
│                    PostgreSQL 16                    │
└─────────────────────────────────────────────────────┘
```

## 2. Stack et justifications

| Couche | Choix | Pourquoi |
|---|---|---|
| Langage | TypeScript (back + front) | Un seul langage, types partagés entre API et client via un package `contracts`. |
| Framework API | **NestJS** | Le système de modules de Nest correspond exactement au découpage voulu : injection de dépendances, modules encapsulés avec exports explicites, intercepteurs globaux (indispensables pour l'audit automatique). |
| Base de données | **PostgreSQL 16** | Transactions ACID (obligatoire pour les mouvements d'argent), `numeric`/`bigint` exacts, triggers (pour rendre `audit_log` append-only), `jsonb` pour les diffs d'audit, bonnes fonctions de date. |
| ORM | **Prisma** | Migrations versionnées et lisibles, typage fort généré. Les requêtes analytiques lourdes (rapports, prévisions) se font en SQL brut via `$queryRaw`, pas via l'ORM. |
| Front | **Next.js (App Router)** + TailwindCSS, **responsive-first et installable (PWA)** | Rendu serveur pour les écrans de consultation, bon comportement sur connexion lente. Un seul front sert le web et le mobile (ADR-0007). |
| Service worker | Workbox | Cache de consultation hors ligne en lecture seule (ADR-0008) et réception du push web. |
| Push | Web Push API (VAPID) | Aucun service tiers propriétaire requis. Voir `04-modules.md § K`. |
| État serveur (front) | **TanStack Query** | Cache, invalidation, retry — suffisant sans Redux. |
| i18n | **next-intl** (ICU) | Deux locales `fr` et `en` dès le MVP (ADR-0009). Format ICU pour la pluralisation. |
| Graphiques | **Recharts** | Léger, suffisant pour barres/lignes/camemberts. |
| Auth | JWT access (15 min) + refresh (30 j, rotatif, stocké haché) | Voir `07-securite-audit.md`. |
| Tests | Vitest + Supertest + Playwright | |
| Fichiers | Papaparse (CSV), SheetJS/ExcelJS (XLSX) — **côté serveur** | Le parsing serveur permet de valider et de journaliser l'import. |

### Point d'attention : parsing serveur

Les fichiers importés sont parsés côté serveur, pas dans le navigateur. Raisons : validation homogène, journalisation d'audit, et possibilité de rejouer un import. Contrainte associée : limiter la taille de fichier (10 Mo) et traiter l'import en tâche asynchrone au-delà de 1 000 lignes.

## 3. Découpage en modules

### 3.1 Modules métier

| Module | Responsabilité | Ne fait pas |
|---|---|---|
| `accounts` | Comptes, soldes, soldes d'ouverture, archivage | Ne calcule pas les budgets |
| `transactions` | Transactions, transferts, catégorisation, tags, recherche | Ne génère pas les récurrences |
| `categories` | Arbre des catégories, catégories système par défaut | |
| `recurrence` | Modèles de récurrence, matérialisation des occurrences à venir, détection de récurrences dans l'historique | Ne crée pas directement de transaction passée |
| `budgets` | Budgets, périodes budgétaires, consommation, alertes, report | Ne lit pas les transactions directement (passe par la façade `transactions`) |
| `debts` | Dettes, créances, échéanciers, amortissement, remboursements | Ne crée pas la transaction de paiement elle-même (émet un événement) |
| `goals` | Objectifs d'épargne, contributions, progression | |
| `forecasting` | Projection de trésorerie et de patrimoine net, scénarios | Ne persiste rien (calcul à la volée + cache) |
| `reporting` | Agrégats, séries temporelles, patrimoine net, comparaisons | Ne contient aucune règle métier propre |
| `import` | Sources d'import, mapping, parsing, dédoublonnage, lots | N'écrit pas en base directement : appelle la façade `transactions` |
| `export` | Génération CSV/XLSX, export intégral | |

### 3.2 Modules transverses

| Module | Responsabilité |
|---|---|
| `money` (kernel) | Type `Money`, arithmétique en unités mineures, arrondis, formatage. **Aucune dépendance.** |
| `auth` | Inscription, connexion, tokens, sessions, verrouillage PIN |
| `users` | Profil, préférences, devise de référence, fuseau horaire |
| `currency` | Devises supportées, taux de change, conversion |
| `audit` | Journal append-only, intercepteur global, consultation |
| `notifications` | Alertes budget, échéances de dette proches, objectifs atteints |

## 4. Règles de dépendance entre modules

**Règle 1** — Un module n'importe jamais le `Service` d'un autre module. Il importe uniquement sa **façade** (`<module>.facade.ts`), qui expose un contrat explicite et stable.

**Règle 2** — Le graphe de dépendances est acyclique. Voici les dépendances autorisées :

```
money        → (aucune)
currency     → money
users        → (aucune)
auth         → users
audit        → (aucune)
categories   → (aucune)
accounts     → money, currency
transactions → money, accounts, categories
recurrence   → transactions
budgets      → transactions, categories, money, users
debts        → money, accounts
goals        → money, accounts, transactions
import       → transactions, accounts
export       → transactions, accounts, categories, tags, budgets, debts, goals
reporting    → transactions, accounts, debts, currency
forecasting  → recurrence, debts, transactions, reporting
notifications→ budgets, debts, goals, recurrence
```

Toute dépendance absente de cette liste doit être ajoutée ici avant d'être codée, et vérifiée acyclique.

**Règle 3** — Quand une dépendance créerait un cycle, on passe par un **événement**.

Exemple concret : `debts` a besoin qu'une transaction de dépense soit créée quand on enregistre un remboursement, mais `transactions` ne doit pas connaître `debts`. Solution : `debts` émet `DebtPaymentRecorded`, un listener dans `transactions` crée la transaction correspondante.

## 5. Événements de domaine

Bus interne synchrone (`@nestjs/event-emitter`) en V1. Aucun broker externe : les volumes ne le justifient pas, et l'ajout d'un broker rendrait la cohérence plus difficile.

| Événement | Émetteur | Écouteurs | Effet |
|---|---|---|---|
| `TransactionCreated` | transactions | budgets, goals, notifications | Recalcul consommation, progression objectif, évaluation alertes |
| `TransactionUpdated` | transactions | budgets, goals, notifications | Idem, avec ancienne et nouvelle valeur |
| `TransactionDeleted` | transactions | budgets, goals | Décrément |
| `DebtPaymentRecorded` | debts | transactions, notifications | Création de la transaction de paiement, alerte si dette soldée |
| `BudgetThresholdCrossed` | budgets | notifications | Alerte 80 % / 100 % / dépassement |
| `GoalReached` | goals | notifications | Notification |
| `ImportBatchCompleted` | import | notifications, audit | Résumé du lot |
| `RecurrenceDue` | recurrence | notifications | Rappel d'échéance à venir |

**Contrainte de transactionnalité** : les listeners qui écrivent en base s'exécutent dans la même transaction PostgreSQL que l'émetteur. Si un listener échoue, l'opération entière est annulée. Ne pas utiliser d'émission asynchrone « fire and forget » pour un effet qui modifie des données financières.

## 6. Arborescence cible

```
budget-manager/
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── common/          # filtres, pipes, intercepteurs, décorateurs
│   │       │   ├── audit/       # intercepteur d'audit global
│   │       │   ├── errors/
│   │       │   └── pagination/
│   │       ├── kernel/
│   │       │   └── money/
│   │       └── modules/
│   │           ├── accounts/
│   │           │   ├── accounts.module.ts
│   │           │   ├── accounts.controller.ts
│   │           │   ├── accounts.service.ts
│   │           │   ├── accounts.facade.ts     # interface publique
│   │           │   ├── dto/
│   │           │   └── __tests__/
│   │           ├── transactions/
│   │           └── ...
│   └── web/
│       ├── app/
│       ├── components/
│       ├── lib/
│       └── features/            # miroir des modules back
├── packages/
│   └── contracts/               # types partagés API ↔ front
├── docs/
├── CLAUDE.md
└── README.md
```

## 7. Points d'attention transversaux

### Cohérence des soldes

Le solde d'un compte peut être calculé (somme des transactions + solde d'ouverture) ou stocké. **Décision : stocké et maintenu de façon incrémentale**, avec une procédure de recalcul complet exposée en interne et exécutée en tâche de fond nocturne pour détecter toute dérive. Le calcul à la volée devient trop lent au-delà de quelques milliers de transactions, mais un solde stocké dérive silencieusement si une écriture échoue partiellement — d'où le contrôle de réconciliation obligatoire.

### Fuseaux horaires

Tout est stocké en UTC. Le fuseau de l'utilisateur (`users.timezone`) est appliqué **uniquement** au calcul des bornes de période (un « mois de juillet » n'a pas les mêmes bornes UTC selon le fuseau). Ne jamais utiliser le fuseau du serveur.

### Idempotence

Les endpoints de création acceptent un en-tête `Idempotency-Key`. Une clé déjà vue renvoie la réponse d'origine sans recréer. Indispensable sur connexion instable, où un utilisateur peut soumettre deux fois.

### Clients et compatibilité

L'API est agnostique du client : elle n'utilise ni session serveur, ni rendu HTML, ni dépendance à l'origine de la requête (à l'exception du cookie de refresh, restreint à un seul endpoint). Un client natif pourrait la consommer sans modification si l'ADR-0007 était réexaminée.

Corollaire à respecter dès maintenant : **toute logique métier réutilisable vit dans `packages/contracts` ou dans les dossiers `domain/`, jamais dans un composant React.** C'est ce qui garde le coût d'une éventuelle application native limité à la couche de présentation.

Second corollaire, de même nature : **l'API ne renvoie aucun texte lisible par un humain** (ADR-0009), uniquement des codes et des paramètres. Un client dans une autre langue, ou un client non-web, consomme le même contrat sans adaptation.

### Performance

- Index obligatoires : `(userId, occurredAt)`, `(userId, accountId, occurredAt)`, `(userId, categoryId, occurredAt)`, `(userId, fingerprint)` sur `transactions`.
- Les rapports et prévisions passent par des requêtes SQL agrégées, jamais par un chargement en mémoire des transactions.
- Cache applicatif (in-memory, TTL court) sur les prévisions, invalidé par les événements de transaction.
