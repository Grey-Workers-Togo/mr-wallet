# 03 — Modèle de données

Notation : schéma Prisma. `Bg` = `BigInt`, `Dt` = `DateTime @db.Timestamptz(6)`.

---

## 1. Conventions appliquées à toutes les tables métier

Chaque table métier porte **obligatoirement** :

| Champ | Type | Rôle |
|---|---|---|
| `id` | `String @id @default(uuid())` | Identifiant. UUID v7 si disponible (ordonnable), sinon v4. |
| `userId` | `String` | Propriétaire. **Toute requête est filtrée dessus.** |
| `createdAt` | `Dt @default(now())` | Horodatage de création (UTC) |
| `updatedAt` | `Dt @updatedAt` | Horodatage de dernière modification (UTC) |
| `deletedAt` | `Dt?` | Suppression douce. `null` = actif. |

Règles :

- **Aucun `DELETE` physique** sur une table métier. Uniquement `deletedAt = now()`.
- Toute lecture par défaut filtre `deletedAt: null` (middleware Prisma global, avec échappatoire explicite pour l'audit et l'export).
- `@@index([userId, deletedAt])` sur chaque table métier.
- Les montants sont des `BigInt` en unités mineures, **toujours** accompagnés d'un champ `currency`.

## 2. Montants : représentation

```prisma
// Convention appliquée partout, jamais de Float ni de Decimal côté application.
amountMinor  BigInt   // 12345 = 123,45 EUR  |  12345 = 12 345 XOF
currency     String   @db.Char(3)  // ISO 4217
```

La précision (`minorUnits`) n'est **pas** stockée sur chaque ligne : elle est portée par la table `Currency` et lue au moment du formatage. Cela évite l'incohérence d'une même devise avec deux précisions différentes.

---

## 3. Identité et préférences

```prisma
model User {
  id                String    @id @default(uuid())
  email             String    @unique
  passwordHash      String                       // Argon2id
  displayName       String?
  baseCurrency      String    @db.Char(3)        // devise de consolidation
  locale            String    @default("fr-FR")
  timezone          String    @default("Africa/Porto-Novo")
  weekStartsOn      Int       @default(1)        // 1 = lundi
  monthStartDay     Int       @default(1)        // budget calé sur le 1er, ou sur le jour de paie
  emailVerifiedAt   Dt?
  lastLoginAt       Dt?
  createdAt         Dt        @default(now())
  updatedAt         Dt        @updatedAt
  deletedAt         Dt?
}

model Session {
  id                String    @id @default(uuid())
  userId            String
  refreshTokenHash  String                       // jamais le token en clair
  userAgent         String?
  ipHash            String?                      // IP hachée, pas en clair
  expiresAt         Dt
  revokedAt         Dt?
  createdAt         Dt        @default(now())
  lastUsedAt        Dt?

  @@index([userId, expiresAt])
}
```

`monthStartDay` permet de caler les budgets sur le cycle de paie plutôt que sur le calendrier — cas fréquent et souvent oublié.

---

## 4. Devises

```prisma
model Currency {
  code          String   @id @db.Char(3)   // XOF, EUR, USD…
  name          String
  symbol        String
  minorUnits    Int                        // XOF = 0, EUR = 2, TND = 3
  isActive      Boolean  @default(true)
}

model ExchangeRate {
  id            String   @id @default(uuid())
  userId        String?                    // null = taux global fourni par le système
  fromCurrency  String   @db.Char(3)
  toCurrency    String   @db.Char(3)
  rate          Decimal  @db.Decimal(24, 12)
  validFrom     Dt
  source        RateSource @default(MANUAL)
  createdAt     Dt       @default(now())

  @@index([fromCurrency, toCurrency, validFrom])
}

enum RateSource { MANUAL  PROVIDER  PEGGED }
```

`PEGGED` sert aux parités fixes (XOF↔EUR : 655,957). Détails dans `08-devises.md`.

---

## 5. Comptes

```prisma
model Account {
  id                 String       @id @default(uuid())
  userId             String
  name               String
  type               AccountType
  currency           String       @db.Char(3)
  openingBalanceMinor BigInt      @default(0)
  openingBalanceAt   Dt                          // date du solde d'ouverture
  currentBalanceMinor BigInt      @default(0)    // maintenu incrémentalement
  balanceCheckedAt   Dt?                         // dernière réconciliation réussie
  creditLimitMinor   BigInt?                     // cartes de crédit / découvert autorisé
  institution        String?
  color              String?
  icon               String?
  isArchived         Boolean      @default(false)
  includeInNetWorth  Boolean      @default(true)
  sortOrder          Int          @default(0)
  createdAt          Dt           @default(now())
  updatedAt          Dt           @updatedAt
  deletedAt          Dt?

  @@index([userId, deletedAt])
}

enum AccountType {
  CASH
  BANK
  MOBILE_MONEY
  CREDIT_CARD
  SAVINGS
  WALLET
  OTHER
}
```

Notes :

- Un compte a **une seule devise**. Un utilisateur avec un compte EUR et un compte XOF crée deux comptes.
- `CREDIT_CARD` a un solde normalement négatif (dette). Il compte comme passif dans le patrimoine net.
- `isArchived` masque le compte de la saisie courante sans supprimer son historique — distinct de `deletedAt`.

---

## 6. Catégories et tags

```prisma
model Category {
  id           String        @id @default(uuid())
  userId       String
  parentId     String?                     // 2 niveaux max — contrainte applicative
  i18nKey      String?                     // « category.food » — pour les catégories système
  name         String?                     // saisi par l'utilisateur ; prime sur i18nKey
  kind         CategoryKind
  color        String?
  icon         String?
  isSystem     Boolean       @default(false)  // catégories fournies par défaut
  sortOrder    Int           @default(0)
  createdAt    Dt            @default(now())
  updatedAt    Dt            @updatedAt
  deletedAt    Dt?

  @@index([userId, deletedAt])
  @@index([userId, parentId])
}

enum CategoryKind { EXPENSE  INCOME  TRANSFER }

model Tag {
  id        String  @id @default(uuid())
  userId    String
  name      String
  color     String?
  createdAt Dt      @default(now())
  updatedAt Dt      @updatedAt
  deletedAt Dt?

  @@unique([userId, name])
}

model TransactionTag {
  transactionId String
  tagId         String
  createdAt     Dt     @default(now())

  @@id([transactionId, tagId])
}
```

### Nom d'une catégorie

Deux champs, une règle de résolution simple (ADR-0009) :

| Cas | `i18nKey` | `name` | Affichage |
|---|---|---|---|
| Catégorie système, non renommée | `category.food` | `null` | Traduit dans la langue courante |
| Catégorie système, renommée par l'utilisateur | `category.food` | `"Courses"` | `"Courses"`, quelle que soit la langue |
| Catégorie créée par l'utilisateur | `null` | `"Taxi brousse"` | `"Taxi brousse"` |

`name` prime toujours sur `i18nKey`. Un utilisateur qui a renommé une catégorie a exprimé un choix ; le traduire par-dessus serait une régression. `i18nKey` est conservé même après renommage, pour permettre un retour au libellé par défaut.

Contraintes :

- `i18nKey` ou `name` doit être renseigné — jamais les deux à `null`. Contrainte `CHECK` en base.
- L'unicité `(userId, parentId, name)` de la version précédente est abandonnée : elle ne fonctionne plus avec `name` nullable. L'unicité du **nom résolu** est vérifiée en applicatif, dans la langue de l'utilisateur.
- Une catégorie système renommée reste `isSystem = true` : elle demeure non supprimable.

**Suppression d'une catégorie utilisée** : interdite tant que des transactions y sont rattachées. L'API propose une réaffectation vers une autre catégorie dans la même opération (`DELETE /categories/:id?reassignTo=<id>`).

---

## 7. Transactions

```prisma
model Transaction {
  id               String          @id @default(uuid())
  userId           String
  accountId        String
  type             TransactionType
  amountMinor      BigInt                        // TOUJOURS positif ; le sens vient de `type`
  currency         String          @db.Char(3)   // = devise du compte
  occurredAt       Dt                            // DATE MÉTIER — base de tous les calculs
  description      String
  normalizedLabel  String                        // libellé nettoyé, pour dédoublonnage et règles
  categoryId       String?
  payee            String?
  notes            String?
  status           TxStatus        @default(CLEARED)

  // Transferts
  transferGroupId  String?                       // relie les deux jambes d'un transfert
  counterAccountId String?

  // Traçabilité de l'origine
  source           TxSource        @default(MANUAL)
  importBatchId    String?
  externalRef      String?                       // réf. présente dans le fichier importé
  fingerprint      String                        // hash de dédoublonnage

  // Rattachements
  recurrenceId     String?
  debtPaymentId    String?
  goalContributionId String?

  createdAt        Dt              @default(now())
  updatedAt        Dt              @updatedAt
  deletedAt        Dt?

  @@index([userId, occurredAt])
  @@index([userId, accountId, occurredAt])
  @@index([userId, categoryId, occurredAt])
  @@index([userId, fingerprint])
  @@index([transferGroupId])
}

enum TransactionType { EXPENSE  INCOME  TRANSFER }
enum TxStatus        { PENDING  CLEARED  RECONCILED  VOID }
enum TxSource         { MANUAL  IMPORT  RECURRENCE  DEBT_PAYMENT  GOAL_CONTRIBUTION  ADJUSTMENT }
```

### Décisions à respecter impérativement

1. **`amountMinor` est toujours positif.** Le signe est dérivé de `type`. Cela évite la classe de bugs « double négation » lors des agrégations.
2. **Un transfert = deux lignes**, une `TRANSFER` sortante sur le compte source, une `TRANSFER` entrante sur le compte destination, liées par `transferGroupId`. Un transfert est donc toujours créé et supprimé en bloc. Il est **exclu** du calcul des dépenses, des revenus et des budgets.
3. **Transfert entre devises différentes** : les deux jambes ont des montants différents et chacune sa devise ; le taux effectif est déduit et stocké dans `notes` structurées ou dans une table `TransferRate` si le besoin de reporting apparaît. En V1, on stocke les deux montants tels quels sans table supplémentaire.
4. `occurredAt` ≠ `createdAt`. Ne jamais utiliser `createdAt` dans un calcul métier.

---

## 8. Récurrences

```prisma
model RecurrenceRule {
  id               String        @id @default(uuid())
  userId           String
  name             String
  type             TransactionType
  accountId        String
  categoryId       String?
  amountMinor      BigInt
  currency         String        @db.Char(3)
  amountIsEstimate Boolean       @default(false)  // montant variable (facture élec.)

  frequency        Frequency
  interval         Int           @default(1)      // tous les N (jours/semaines/mois)
  dayOfMonth       Int?                           // 1-31 ; 31 → dernier jour du mois
  dayOfWeek        Int?                           // 0-6
  startsOn         Dt
  endsOn           Dt?
  maxOccurrences   Int?

  autoCreate       Boolean       @default(false)  // créer la transaction automatiquement
  reminderDaysBefore Int?        @default(3)
  lastGeneratedAt  Dt?
  isActive         Boolean       @default(true)

  createdAt        Dt            @default(now())
  updatedAt        Dt            @updatedAt
  deletedAt        Dt?

  @@index([userId, isActive, deletedAt])
}

enum Frequency { DAILY  WEEKLY  BIWEEKLY  MONTHLY  QUARTERLY  SEMIANNUAL  YEARLY }
```

**Règle du jour 31** : pour une récurrence mensuelle au 31, les mois plus courts utilisent le dernier jour du mois. Ne jamais décaler au mois suivant.

**`autoCreate`** : si `false` (défaut), l'occurrence apparaît en prévision et déclenche un rappel, mais aucune transaction n'est créée sans confirmation de l'utilisateur. Le défaut est prudent volontairement : créer automatiquement de fausses transactions détruit la confiance dans les soldes.

---

## 9. Budgets

```prisma
model Budget {
  id              String        @id @default(uuid())
  userId          String
  name            String
  categoryId      String?                       // null = budget global
  amountMinor     BigInt
  currency        String        @db.Char(3)
  period          BudgetPeriodType
  startsOn        Dt
  endsOn          Dt?
  rollover        Boolean       @default(false)
  alertThresholds Int[]         @default([80, 100])   // en %
  isActive        Boolean       @default(true)
  createdAt       Dt            @default(now())
  updatedAt       Dt            @updatedAt
  deletedAt       Dt?

  @@index([userId, isActive, deletedAt])
}

enum BudgetPeriodType { WEEKLY  MONTHLY  QUARTERLY  YEARLY  CUSTOM }

model BudgetPeriod {
  id               String   @id @default(uuid())
  userId           String
  budgetId         String
  periodStart      Dt
  periodEnd        Dt
  allocatedMinor   BigInt                  // montant du budget + report éventuel
  rolloverInMinor  BigInt   @default(0)
  spentMinor       BigInt   @default(0)    // maintenu incrémentalement
  lastAlertPct     Int?                    // dernier seuil franchi, évite les alertes répétées
  closedAt         Dt?
  createdAt        Dt       @default(now())
  updatedAt        Dt       @updatedAt

  @@unique([budgetId, periodStart])
  @@index([userId, periodStart])
}
```

`BudgetPeriod` est matérialisé (une ligne par mois) plutôt que calculé à la volée. Raison : le report (`rollover`) est cumulatif et dépend de l'historique — le recalculer à chaque lecture depuis l'origine devient coûteux et fragile. Le prix à payer est une tâche de génération des périodes à venir.

---

## 10. Dettes

```prisma
model Debt {
  id                    String        @id @default(uuid())
  userId                String
  name                  String
  direction             DebtDirection
  counterparty          String?                     // prêteur ou emprunteur
  kind                  DebtKind      @default(LOAN)
  linkedAccountId       String?                     // compte débité pour les paiements

  principalMinor        BigInt                      // montant emprunté à l'origine
  outstandingPrincipalMinor BigInt                  // capital restant dû
  currency              String        @db.Char(3)

  annualRatePct         Decimal?      @db.Decimal(7, 4)   // 0 = prêt sans intérêt
  rateType              RateType      @default(FIXED)
  compounding           Compounding   @default(MONTHLY)

  startedOn             Dt
  termDays              Int?                        // durée réelle en jours ; le nombre de périodes en dérive via / periodsPerYear
  scheduleMode          ScheduleMode  @default(AUTO) // AUTO = moteur d'amortissement, MANUAL = échéances saisies à la main
  paymentFrequency      Frequency     @default(MONTHLY)
  paymentDayOfMonth     Int?
  installmentMinor      BigInt?                     // mensualité, calculée ou saisie

  status                DebtStatus    @default(ACTIVE)
  closedAt              Dt?
  notes                 String?

  createdAt             Dt            @default(now())
  updatedAt             Dt            @updatedAt
  deletedAt             Dt?

  @@index([userId, status, deletedAt])
}

enum DebtDirection { OWED_BY_ME  OWED_TO_ME }
enum DebtKind      { LOAN  CREDIT_CARD  MORTGAGE  INFORMAL  INSTALLMENT  OTHER }
enum RateType      { FIXED  VARIABLE  ZERO }
enum Compounding   { NONE  MONTHLY  QUARTERLY  ANNUAL }
enum DebtStatus    { ACTIVE  PAID_OFF  DEFAULTED  CANCELLED }

model DebtInstallment {
  id                String            @id @default(uuid())
  userId            String
  debtId            String
  sequence          Int                             // 1, 2, 3…
  dueOn             Dt
  totalMinor        BigInt
  principalMinor    BigInt
  interestMinor     BigInt
  feesMinor         BigInt            @default(0)
  balanceAfterMinor BigInt                          // capital restant dû après échéance
  status            InstallmentStatus @default(SCHEDULED)
  paidMinor         BigInt            @default(0)
  paidAt            Dt?
  createdAt         Dt                @default(now())
  updatedAt         Dt                @updatedAt

  @@unique([debtId, sequence])
  @@index([userId, dueOn, status])
}

enum InstallmentStatus { SCHEDULED  PAID  PARTIAL  LATE  SKIPPED }

model DebtPayment {
  id             String   @id @default(uuid())
  userId         String
  debtId         String
  installmentId  String?                    // null = paiement hors échéancier
  paidAt         Dt
  amountMinor    BigInt
  principalMinor BigInt
  interestMinor  BigInt
  feesMinor      BigInt   @default(0)
  isExtraPayment Boolean  @default(false)   // remboursement anticipé
  transactionId  String?                    // transaction générée
  notes          String?
  createdAt      Dt       @default(now())
  updatedAt      Dt       @updatedAt
  deletedAt      Dt?

  @@index([userId, debtId, paidAt])
}
```

C'est le module le plus riche du modèle, et c'est délibéré : traiter une dette comme une simple dépense récurrente ferait perdre le capital restant dû, le coût des intérêts et l'effet d'un remboursement anticipé — c'est-à-dire l'essentiel de l'intérêt du module. Les règles de calcul sont dans `04-modules.md § G — Module debts`.

---

## 11. Objectifs d'épargne

```prisma
model SavingsGoal {
  id              String     @id @default(uuid())
  userId          String
  name            String
  targetMinor     BigInt
  currentMinor    BigInt     @default(0)
  currency        String     @db.Char(3)
  targetDate      Dt?
  linkedAccountId String?                        // épargne suivie sur un compte réel
  priority        Int        @default(0)
  status          GoalStatus @default(ACTIVE)
  color           String?
  icon            String?
  completedAt     Dt?
  createdAt       Dt         @default(now())
  updatedAt       Dt         @updatedAt
  deletedAt       Dt?

  @@index([userId, status, deletedAt])
}

enum GoalStatus { ACTIVE  COMPLETED  ABANDONED }

model GoalContribution {
  id            String   @id @default(uuid())
  userId        String
  goalId        String
  amountMinor   BigInt
  contributedAt Dt
  transactionId String?
  notes         String?
  createdAt     Dt       @default(now())
  updatedAt     Dt       @updatedAt
  deletedAt     Dt?

  @@index([userId, goalId, contributedAt])
}
```

---

## 12. Import

```prisma
model ImportSource {
  id              String   @id @default(uuid())
  userId          String
  name            String                 // « Relevé Ecobank CSV »
  fileFormat      FileFormat
  accountId       String?                // compte cible par défaut
  columnMapping   Json                   // voir 06-import-export.md
  dateFormat      String                 // « dd/MM/yyyy »
  decimalSeparator String  @default(",")
  thousandSeparator String @default(" ")
  encoding        String   @default("utf-8")
  delimiter       String   @default(";")
  hasHeaderRow    Boolean  @default(true)
  skipRows        Int      @default(0)
  amountStrategy  AmountStrategy
  createdAt       Dt       @default(now())
  updatedAt       Dt       @updatedAt
  deletedAt       Dt?

  @@index([userId, deletedAt])
}

enum FileFormat     { CSV  XLSX  XLS  OFX }
enum AmountStrategy { SIGNED_SINGLE_COLUMN  DEBIT_CREDIT_COLUMNS  TYPE_COLUMN }

model ImportBatch {
  id             String       @id @default(uuid())
  userId         String
  sourceId       String?
  accountId      String
  fileName       String
  fileHash       String                      // détecte le réimport du même fichier
  fileSizeBytes  Int
  status         ImportStatus @default(PENDING)
  totalRows      Int          @default(0)
  importedRows   Int          @default(0)
  duplicateRows  Int          @default(0)
  errorRows      Int          @default(0)
  errors         Json?                       // [{row, column, message}]
  startedAt      Dt?
  completedAt    Dt?
  revertedAt     Dt?
  createdAt      Dt           @default(now())
  updatedAt      Dt           @updatedAt

  @@index([userId, createdAt])
}

enum ImportStatus { PENDING  PARSING  AWAITING_REVIEW  IMPORTING  COMPLETED  FAILED  REVERTED }
```

`fileHash` permet d'avertir « ce fichier a déjà été importé le 12 juillet » avant même de parser — première ligne de défense contre les doublons.

---

## 13. Règles de catégorisation automatique

```prisma
model CategorizationRule {
  id          String     @id @default(uuid())
  userId      String
  priority    Int        @default(0)      // évaluées par priorité décroissante
  matchField  MatchField @default(DESCRIPTION)
  matchType   MatchType  @default(CONTAINS)
  matchValue  String
  minAmountMinor BigInt?
  maxAmountMinor BigInt?
  accountId   String?
  categoryId  String
  addTagIds   String[]   @default([])
  setPayee    String?
  isActive    Boolean    @default(true)
  timesApplied Int       @default(0)
  createdAt   Dt         @default(now())
  updatedAt   Dt         @updatedAt
  deletedAt   Dt?

  @@index([userId, isActive, priority])
}

enum MatchField { DESCRIPTION  PAYEE  EXTERNAL_REF }
enum MatchType  { CONTAINS  EQUALS  STARTS_WITH  ENDS_WITH  REGEX }
```

Les règles s'appliquent à l'import et à la saisie manuelle. **Une règle ne réécrit jamais une catégorie choisie explicitement par l'utilisateur.**

---

## 14. Journal d'audit

```prisma
model AuditLog {
  id           BigInt      @id @default(autoincrement())
  userId       String?                       // null pour les actions système
  actorType    ActorType   @default(USER)
  action       String                        // « transaction.create », « debt.payment.record »
  entityType   String                        // « Transaction »
  entityId     String?
  before       Json?                         // état avant (champs modifiés uniquement)
  after        Json?                         // état après
  metadata     Json?                         // {importBatchId, ruleId, …}
  ipHash       String?
  userAgent    String?
  requestId    String?                       // corrélation avec les logs applicatifs
  occurredAt   Dt          @default(now())   // horodatage de l'action

  @@index([userId, occurredAt])
  @@index([entityType, entityId])
  @@index([action, occurredAt])
}

enum ActorType { USER  SYSTEM  IMPORT  SCHEDULER }
```

Contraintes SQL à ajouter en migration brute :

```sql
-- Interdit toute modification ou suppression d'une entrée d'audit
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
```

**Ne jamais écrire `passwordHash`, `refreshTokenHash`, ni de token dans `before`/`after`.** Une liste de champs exclus est maintenue dans l'intercepteur d'audit.

---

## 15. Notifications

```prisma
model Notification {
  id         String           @id @default(uuid())
  userId     String
  type       NotificationType              // détermine le message à rendre
  params     Json                          // { budgetName, percentUsed, dueInDays, … }
  entityType String?
  entityId   String?
  severity   Severity         @default(INFO)
  readAt     Dt?
  createdAt  Dt               @default(now())

  @@index([userId, readAt, createdAt])
}

enum NotificationType {
  BUDGET_THRESHOLD  BUDGET_EXCEEDED  DEBT_DUE_SOON  DEBT_OVERDUE
  DEBT_PAID_OFF  GOAL_REACHED  RECURRENCE_DUE  IMPORT_COMPLETED
  IMPORT_FAILED  BALANCE_MISMATCH
}
enum Severity { INFO  WARNING  CRITICAL }
```

**Aucun texte rendu n'est stocké** (ADR-0009). `type` désigne le message, `params` fournit les valeurs à interpoler ; le rendu se fait à l'affichage, dans la langue courante. Conséquence directe : changer de langue traduit aussi l'historique des notifications.

```jsonc
// Notification BUDGET_THRESHOLD
{
  "type": "BUDGET_THRESHOLD",
  "params": { "budgetName": "Alimentation", "percentUsed": 80, "daysRemaining": 9 },
  "entityType": "BudgetPeriod",
  "entityId": "bpd_..."
}
// rendu fr : « Budget Alimentation : 80 % consommé, 9 jours restants »
// rendu en : "Alimentation budget: 80% used, 9 days left"
```

Deux contraintes associées :

- `params` peut contenir un nom saisi par l'utilisateur (`budgetName`), qui n'est pas traduit — c'est sa donnée. Il ne doit jamais contenir de montant destiné à un push (voir RG-N5).
- Un client recevant un `type` qu'il ne connaît pas (version antérieure) affiche un libellé de repli générique plutôt qu'une ligne vide.

---

## 16. Réconciliation des soldes

```prisma
model BalanceCheck {
  id             String   @id @default(uuid())
  userId         String
  accountId      String
  storedMinor    BigInt
  computedMinor  BigInt
  deltaMinor     BigInt
  isMatch        Boolean
  checkedAt      Dt       @default(now())

  @@index([userId, accountId, checkedAt])
}
```

Tâche nocturne : pour chaque compte, recalculer `solde d'ouverture + Σ transactions` et comparer au solde stocké. En cas d'écart, journaliser et notifier (`BALANCE_MISMATCH`). Ne jamais corriger silencieusement : un écart signale un bug qu'il faut voir.

---

## 17. Tables techniques de support

Ces tables ne portent pas de donnée métier mais sont nécessaires au fonctionnement décrit dans `05-api.md` et `07-securite-audit.md`. Elles ne suivent pas la convention de soft delete.

```prisma
model NotificationPreference {
  id         String           @id @default(uuid())
  userId     String
  type       NotificationType
  inAppEnabled Boolean        @default(true)
  pushEnabled  Boolean        @default(false)
  emailEnabled Boolean        @default(false)   // V2
  createdAt  Dt               @default(now())
  updatedAt  Dt               @updatedAt

  @@unique([userId, type])
}

model DeviceToken {
  id            String       @id @default(uuid())
  userId        String
  platform      DevicePlatform
  // Web Push : endpoint + clés de chiffrement du navigateur
  endpoint      String       @unique
  p256dhKey     String?
  authKey       String?
  // Réservé à un éventuel client natif (ADR-0007 § Réexamen)
  nativeToken   String?
  deviceLabel   String?                       // « Chrome sur Android »
  isActive      Boolean      @default(true)
  lastSeenAt    Dt?
  failureCount  Int          @default(0)      // désactivation après échecs répétés
  createdAt     Dt           @default(now())
  updatedAt     Dt           @updatedAt
  revokedAt     Dt?

  @@index([userId, isActive])
}

enum DevicePlatform { WEB_PUSH  IOS  ANDROID }

model IdempotencyKey {
  key            String   @id                  // fourni par le client
  userId         String
  endpoint       String
  requestHash    String                        // empêche de rejouer la clé avec un autre corps
  responseStatus Int
  responseBody   Json
  createdAt      Dt       @default(now())
  expiresAt      Dt                            // création + 24 h

  @@index([userId, expiresAt])
}

model PasswordResetToken {
  id         String   @id @default(uuid())
  userId     String
  tokenHash  String   @unique                  // jamais le token en clair
  expiresAt  Dt                                // création + 30 min
  usedAt     Dt?
  createdAt  Dt       @default(now())

  @@index([userId, expiresAt])
}

model ExportJob {
  id          String       @id @default(uuid())
  userId      String
  kind        ExportKind
  format      FileFormat
  filters     Json?
  status      JobStatus    @default(PENDING)
  rowCount    Int?
  filePath    String?
  errorMessage String?
  startedAt   Dt?
  completedAt Dt?
  expiresAt   Dt                               // fichier purgé après 7 jours
  createdAt   Dt           @default(now())

  @@index([userId, createdAt])
}

enum ExportKind { TRANSACTIONS  FULL }
enum JobStatus  { PENDING  RUNNING  COMPLETED  FAILED }
```

Notes :

- `IdempotencyKey.requestHash` est indispensable : rejouer la même clé avec un corps différent doit renvoyer une erreur `409`, pas la réponse d'origine.
- Une tâche quotidienne purge `IdempotencyKey`, `PasswordResetToken` et `ExportJob` expirés.
- `NotificationPreference` est créée à la volée avec les valeurs par défaut : l'absence de ligne équivaut à « in-app activé, push désactivé ».
- `DeviceToken` ne contient **aucune donnée financière**. Un `endpoint` qui échoue 5 fois consécutives passe `isActive = false` : les navigateurs invalident silencieusement les abonnements, et sans ce compteur la table se remplit d'entrées mortes.
- La déconnexion d'une session révoque les `DeviceToken` associés à cet appareil.

---

## 18. Vue d'ensemble des relations

Toutes les entités métier appartiennent directement à `User` via `userId`. Les flèches indiquent les rattachements secondaires.

```
User
├── Account ────────── BalanceCheck
│      ▲
│      │ accountId
├── Transaction ─────── TransactionTag ──── Tag
│      │  ├─ categoryId  ──▶ Category
│      │  ├─ importBatchId ──▶ ImportBatch
│      │  ├─ recurrenceId ──▶ RecurrenceRule
│      │  ├─ debtPaymentId ──▶ DebtPayment
│      │  ├─ goalContributionId ──▶ GoalContribution
│      │  └─ transferGroupId ──▶ (autre Transaction)
│
├── Category (auto-référencée parentId, 2 niveaux max)
├── Budget ─────────── BudgetPeriod
├── Debt ─────┬─────── DebtInstallment
│             └─────── DebtPayment ──▶ Transaction
├── SavingsGoal ────── GoalContribution ──▶ Transaction
├── RecurrenceRule
├── CategorizationRule
├── ImportSource ───── ImportBatch
├── ExchangeRate
├── Notification ───── NotificationPreference
├── DeviceToken
├── Session
├── PasswordResetToken
├── IdempotencyKey
├── ExportJob
└── AuditLog
```

## 19. Données de départ (seed)

- Table `Currency` : au minimum XOF (0), EUR (2), USD (2), NGN (2), GHS (2), XAF (0), MAD (2), CAD (2), GBP (2).
- Parité fixe XOF/EUR = 655,957 en `PEGGED`.
- Catégories système par défaut (`isSystem = true`, `name = null`, non supprimables, renommables). **Le seed insère des clés, pas des libellés** — les traductions vivent dans les fichiers de langue :

| `i18nKey` | fr | en |
|---|---|---|
| `category.food` | Alimentation | Food & groceries |
| `category.housing` | Logement | Housing |
| `category.transport` | Transport | Transport |
| `category.health` | Santé | Health |
| `category.education` | Éducation | Education |
| `category.leisure` | Loisirs | Leisure |
| `category.clothing` | Vêtements | Clothing |
| `category.communication` | Communication | Communication |
| `category.utilities` | Énergie & eau | Utilities |
| `category.insurance` | Assurances | Insurance |
| `category.taxes` | Impôts & taxes | Taxes |
| `category.family_support` | Dons & famille | Gifts & family support |
| `category.savings` | Épargne | Savings |
| `category.debt_repayment` | Remboursements | Debt repayment |
| `category.bank_fees` | Frais bancaires | Bank fees |
| `category.other_expense` | Divers | Other |
| `category.salary` | Salaire | Salary |
| `category.freelance` | Activité indépendante | Freelance income |
| `category.bonus` | Primes | Bonuses |
| `category.rental_income` | Loyers perçus | Rental income |
| `category.interest` | Intérêts | Interest |
| `category.gifts_received` | Cadeaux reçus | Gifts received |
| `category.reimbursements` | Remboursements reçus | Reimbursements |
| `category.other_income` | Divers | Other |

Les seize premières sont de `kind = EXPENSE`, les huit suivantes de `kind = INCOME`.
