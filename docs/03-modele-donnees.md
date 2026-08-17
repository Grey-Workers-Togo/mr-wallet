# 03 — Data Model

Notation: Prisma schema. `Bg` = `BigInt`, `Dt` = `DateTime @db.Timestamptz(6)`.

---

## 1. Conventions applied to all business tables

Every business table **mandatorily** carries:

| Field | Type | Role |
|---|---|---|
| `id` | `String @id @default(uuid())` | Identifier. UUID v7 if available (sortable), otherwise v4. |
| `userId` | `String` | Owner. **Every query is filtered on it.** |
| `createdAt` | `Dt @default(now())` | Creation timestamp (UTC) |
| `updatedAt` | `Dt @updatedAt` | Last modification timestamp (UTC) |
| `deletedAt` | `Dt?` | Soft delete. `null` = active. |

Rules:

- **No physical `DELETE`** on a business table. Only `deletedAt = now()`.
- Every read filters `deletedAt: null` by default (global Prisma middleware, with an explicit escape hatch for audit and export).
- `@@index([userId, deletedAt])` on every business table.
- Amounts are `BigInt` in minor units, **always** accompanied by a `currency` field.

## 2. Amounts: representation

```prisma
// Convention applied everywhere, never Float nor Decimal on the application side.
amountMinor  BigInt   // 12345 = 123,45 EUR  |  12345 = 12 345 XOF
currency     String   @db.Char(3)  // ISO 4217
```

The precision (`minorUnits`) is **not** stored on each row: it is carried by the `Currency` table and read at formatting time. This avoids the inconsistency of the same currency having two different precisions.

---

## 3. Identity and preferences

```prisma
model User {
  id                String    @id @default(uuid())
  email             String    @unique
  passwordHash      String                       // Argon2id
  displayName       String?
  baseCurrency      String    @db.Char(3)        // consolidation currency
  locale            String    @default("fr-FR")
  timezone          String    @default("Africa/Porto-Novo")
  weekStartsOn      Int       @default(1)        // 1 = Monday
  monthStartDay     Int       @default(1)        // budget anchored on the 1st, or on payday
  emailVerifiedAt   Dt?
  lastLoginAt       Dt?
  createdAt         Dt        @default(now())
  updatedAt         Dt        @updatedAt
  deletedAt         Dt?
}

model Session {
  id                String    @id @default(uuid())
  userId            String
  refreshTokenHash  String                       // never the plaintext token
  userAgent         String?
  ipHash            String?                      // hashed IP, never plaintext
  expiresAt         Dt
  revokedAt         Dt?
  createdAt         Dt        @default(now())
  lastUsedAt        Dt?

  @@index([userId, expiresAt])
}
```

`monthStartDay` allows budgets to be anchored on the pay cycle rather than the calendar — a frequent and often overlooked case.

---

## 4. Currencies

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
  userId        String?                    // null = global rate provided by the system
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

`PEGGED` is used for fixed parities (XOF↔EUR: 655.957). Details in `08-devises.md`.

---

## 5. Accounts

```prisma
model Account {
  id                 String       @id @default(uuid())
  userId             String
  name               String
  type               AccountType
  currency           String       @db.Char(3)
  openingBalanceMinor BigInt      @default(0)
  openingBalanceAt   Dt                          // opening balance date
  currentBalanceMinor BigInt      @default(0)    // maintained incrementally
  balanceCheckedAt   Dt?                         // last successful reconciliation
  creditLimitMinor   BigInt?                     // credit cards / authorized overdraft
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

Notes:

- An account has **a single currency**. A user with a EUR account and an XOF account creates two accounts.
- `CREDIT_CARD` normally has a negative balance (debt). It counts as a liability in net worth.
- `isArchived` hides the account from current entry without deleting its history — distinct from `deletedAt`.

---

## 6. Categories and tags

```prisma
model Category {
  id           String        @id @default(uuid())
  userId       String
  parentId     String?                     // 2 levels max — application-level constraint
  i18nKey      String?                     // "category.food" — for system categories
  name         String?                     // entered by the user; takes precedence over i18nKey
  kind         CategoryKind
  color        String?
  icon         String?
  isSystem     Boolean       @default(false)  // categories provided by default
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

### Category name

Two fields, a simple resolution rule (ADR-0009):

| Case | `i18nKey` | `name` | Display |
|---|---|---|---|
| System category, not renamed | `category.food` | `null` | Translated in the current language |
| System category, renamed by the user | `category.food` | `"Courses"` | `"Courses"`, regardless of the language |
| Category created by the user | `null` | `"Taxi brousse"` | `"Taxi brousse"` |

`name` always takes precedence over `i18nKey`. A user who has renamed a category has expressed a choice; translating over it would be a regression. `i18nKey` is kept even after renaming, to allow reverting to the default label.

Constraints:

- `i18nKey` or `name` must be set — never both `null`. `CHECK` constraint at the database level.
- The `(userId, parentId, name)` uniqueness of the previous version is dropped: it no longer works with `name` nullable. The uniqueness of the **resolved name** is verified at the application level, in the user's language.
- A renamed system category remains `isSystem = true`: it remains non-deletable.

**Deleting a category in use**: forbidden as long as transactions are attached to it. The API offers reassignment to another category in the same operation (`DELETE /categories/:id?reassignTo=<id>`).

---

## 7. Transactions

```prisma
model Transaction {
  id               String          @id @default(uuid())
  userId           String
  accountId        String
  type             TransactionType
  amountMinor      BigInt                        // ALWAYS positive; the sign comes from `type`
  currency         String          @db.Char(3)   // = account currency
  occurredAt       Dt                            // BUSINESS DATE — basis for all calculations
  description      String
  normalizedLabel  String                        // cleaned label, for deduplication and rules
  categoryId       String?
  payee            String?
  notes            String?
  status           TxStatus        @default(CLEARED)

  // Transfers
  transferGroupId  String?                       // links the two legs of a transfer
  counterAccountId String?

  // Origin traceability
  source           TxSource        @default(MANUAL)
  importBatchId    String?
  externalRef      String?                       // ref. present in the imported file
  fingerprint      String                        // deduplication hash

  // Attachments
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

### Decisions that must be respected

1. **`amountMinor` is always positive.** The sign is derived from `type`. This avoids the "double negation" class of bugs during aggregations.
2. **A transfer = two lines**, an outgoing `TRANSFER` on the source account, an incoming `TRANSFER` on the destination account, linked by `transferGroupId`. A transfer is therefore always created and deleted as a block. It is **excluded** from expense, income, and budget calculations.
3. **Transfer between different currencies**: the two legs have different amounts, each with its own currency; the effective rate is derived and stored in structured `notes` or in a `TransferRate` table if a reporting need arises. In V1, both amounts are stored as-is without an additional table.
4. `occurredAt` ≠ `createdAt`. Never use `createdAt` in a business calculation.

---

## 8. Recurrences

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
  amountIsEstimate Boolean       @default(false)  // variable amount (electricity bill)

  frequency        Frequency
  interval         Int           @default(1)      // every N (days/weeks/months)
  dayOfMonth       Int?                           // 1-31; 31 → last day of the month
  dayOfWeek        Int?                           // 0-6
  startsOn         Dt
  endsOn           Dt?
  maxOccurrences   Int?

  autoCreate       Boolean       @default(false)  // automatically create the transaction
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

**Day-31 rule**: for a monthly recurrence on the 31st, shorter months use the last day of the month. Never push it to the following month.

**`autoCreate`**: if `false` (default), the occurrence appears as a forecast and triggers a reminder, but no transaction is created without user confirmation. The default is deliberately conservative: automatically creating fake transactions destroys trust in balances.

---

## 9. Budgets

```prisma
model Budget {
  id              String        @id @default(uuid())
  userId          String
  name            String
  categoryId      String?                       // null = global budget
  amountMinor     BigInt
  currency        String        @db.Char(3)
  period          BudgetPeriodType
  startsOn        Dt
  endsOn          Dt?
  rollover        Boolean       @default(false)
  alertThresholds Int[]         @default([80, 100])   // in %
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
  allocatedMinor   BigInt                  // budget amount + any rollover
  rolloverInMinor  BigInt   @default(0)
  spentMinor       BigInt   @default(0)    // maintained incrementally
  lastAlertPct     Int?                    // last threshold crossed, avoids repeated alerts
  closedAt         Dt?
  createdAt        Dt       @default(now())
  updatedAt        Dt       @updatedAt

  @@unique([budgetId, periodStart])
  @@index([userId, periodStart])
}
```

`BudgetPeriod` is materialized (one row per month) rather than computed on the fly. Reason: the rollover (`rollover`) is cumulative and depends on history — recalculating it from the origin on every read becomes costly and fragile. The price to pay is a task that generates upcoming periods.

---

## 10. Debts

```prisma
model Debt {
  id                    String        @id @default(uuid())
  userId                String
  name                  String
  direction             DebtDirection
  counterparty          String?                     // lender or borrower
  kind                  DebtKind      @default(LOAN)
  linkedAccountId       String?                     // account debited for payments

  principalMinor        BigInt                      // originally borrowed amount
  outstandingPrincipalMinor BigInt                  // remaining principal
  currency              String        @db.Char(3)

  annualRatePct         Decimal?      @db.Decimal(7, 4)   // 0 = interest-free loan
  rateType              RateType      @default(FIXED)
  compounding           Compounding   @default(MONTHLY)

  startedOn             Dt
  termDays              Int?                        // real day-count; period count derives from this / periodsPerYear
  scheduleMode          ScheduleMode  @default(AUTO) // AUTO = amortization engine, MANUAL = hand-typed installments
  paymentFrequency      Frequency     @default(MONTHLY)
  paymentDayOfMonth     Int?
  installmentMinor      BigInt?                     // installment, calculated or entered

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
  balanceAfterMinor BigInt                          // remaining principal after installment
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
  installmentId  String?                    // null = payment outside the schedule
  paidAt         Dt
  amountMinor    BigInt
  principalMinor BigInt
  interestMinor  BigInt
  feesMinor      BigInt   @default(0)
  isExtraPayment Boolean  @default(false)   // early repayment
  transactionId  String?                    // generated transaction
  notes          String?
  createdAt      Dt       @default(now())
  updatedAt      Dt       @updatedAt
  deletedAt      Dt?

  @@index([userId, debtId, paidAt])
}
```

This is the richest module in the model, and that is deliberate: treating a debt as a simple recurring expense would lose the remaining principal, the cost of interest, and the effect of an early repayment — i.e. the very point of the module. Calculation rules are in `04-modules.md § G — Module debts`.

---

## 11. Savings goals

```prisma
model SavingsGoal {
  id              String     @id @default(uuid())
  userId          String
  name            String
  targetMinor     BigInt
  currentMinor    BigInt     @default(0)
  currency        String     @db.Char(3)
  targetDate      Dt?
  linkedAccountId String?                        // savings tracked on a real account
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
  name            String                 // "Ecobank CSV statement"
  fileFormat      FileFormat
  accountId       String?                // default target account
  columnMapping   Json                   // see 06-import-export.md
  dateFormat      String                 // "dd/MM/yyyy"
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
  fileHash       String                      // detects re-import of the same file
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

`fileHash` allows warning "this file was already imported on July 12" even before parsing — the first line of defense against duplicates.

---

## 13. Automatic categorization rules

```prisma
model CategorizationRule {
  id          String     @id @default(uuid())
  userId      String
  priority    Int        @default(0)      // evaluated in decreasing priority order
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

Rules apply on import and on manual entry. **A rule never overwrites a category explicitly chosen by the user.**

---

## 14. Audit log

```prisma
model AuditLog {
  id           BigInt      @id @default(autoincrement())
  userId       String?                       // null for system actions
  actorType    ActorType   @default(USER)
  action       String                        // "transaction.create", "debt.payment.record"
  entityType   String                        // "Transaction"
  entityId     String?
  before       Json?                         // state before (modified fields only)
  after        Json?                         // state after
  metadata     Json?                         // {importBatchId, ruleId, …}
  ipHash       String?
  userAgent    String?
  requestId    String?                       // correlation with application logs
  occurredAt   Dt          @default(now())   // timestamp of the action

  @@index([userId, occurredAt])
  @@index([entityType, entityId])
  @@index([action, occurredAt])
}

enum ActorType { USER  SYSTEM  IMPORT  SCHEDULER }
```

SQL constraints to add in a raw migration:

```sql
-- Forbids any modification or deletion of an audit entry
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
```

**Never write `passwordHash`, `refreshTokenHash`, or a token in `before`/`after`.** A list of excluded fields is maintained in the audit interceptor.

---

## 15. Notifications

```prisma
model Notification {
  id         String           @id @default(uuid())
  userId     String
  type       NotificationType              // determines the message to render
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

**No rendered text is stored** (ADR-0009). `type` designates the message, `params` supplies the values to interpolate; rendering happens at display time, in the current language. Direct consequence: switching language also translates the notification history.

```jsonc
// Notification BUDGET_THRESHOLD
{
  "type": "BUDGET_THRESHOLD",
  "params": { "budgetName": "Alimentation", "percentUsed": 80, "daysRemaining": 9 },
  "entityType": "BudgetPeriod",
  "entityId": "bpd_..."
}
// fr rendering: « Budget Alimentation : 80 % consommé, 9 jours restants »
// en rendering: "Alimentation budget: 80% used, 9 days left"
```

Two associated constraints:

- `params` can contain a name entered by the user (`budgetName`), which is not translated — it is their data. It must never contain an amount intended for a push (see RG-N5).
- A client receiving a `type` it does not recognize (older version) displays a generic fallback label rather than a blank line.

---

## 16. Balance reconciliation

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

Nightly task: for each account, recompute `opening balance + Σ transactions` and compare it to the stored balance. In case of a discrepancy, log it and notify (`BALANCE_MISMATCH`). Never silently correct it: a discrepancy signals a bug that needs to be seen.

---

## 17. Technical support tables

These tables carry no business data but are necessary for the operation described in `05-api.md` and `07-securite-audit.md`. They do not follow the soft-delete convention.

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
  // Web Push: endpoint + browser encryption keys
  endpoint      String       @unique
  p256dhKey     String?
  authKey       String?
  // Reserved for a possible native client (ADR-0007 § Reexamination)
  nativeToken   String?
  deviceLabel   String?                       // "Chrome on Android"
  isActive      Boolean      @default(true)
  lastSeenAt    Dt?
  failureCount  Int          @default(0)      // deactivation after repeated failures
  createdAt     Dt           @default(now())
  updatedAt     Dt           @updatedAt
  revokedAt     Dt?

  @@index([userId, isActive])
}

enum DevicePlatform { WEB_PUSH  IOS  ANDROID }

model IdempotencyKey {
  key            String   @id                  // provided by the client
  userId         String
  endpoint       String
  requestHash    String                        // prevents replaying the key with a different body
  responseStatus Int
  responseBody   Json
  createdAt      Dt       @default(now())
  expiresAt      Dt                            // creation + 24 h

  @@index([userId, expiresAt])
}

model PasswordResetToken {
  id         String   @id @default(uuid())
  userId     String
  tokenHash  String   @unique                  // never the plaintext token
  expiresAt  Dt                                // creation + 30 min
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
  expiresAt   Dt                               // file purged after 7 days
  createdAt   Dt           @default(now())

  @@index([userId, createdAt])
}

enum ExportKind { TRANSACTIONS  FULL }
enum JobStatus  { PENDING  RUNNING  COMPLETED  FAILED }
```

Notes:

- `IdempotencyKey.requestHash` is essential: replaying the same key with a different body must return a `409` error, not the original response.
- A daily task purges expired `IdempotencyKey`, `PasswordResetToken`, and `ExportJob` entries.
- `NotificationPreference` is created on the fly with default values: the absence of a row is equivalent to "in-app enabled, push disabled".
- `DeviceToken` contains **no financial data**. An `endpoint` that fails 5 times in a row is set to `isActive = false`: browsers silently invalidate subscriptions, and without this counter the table would fill up with dead entries.
- Logging out of a session revokes the `DeviceToken` entries associated with that device.

---

## 18. Overview of relationships

All business entities belong directly to `User` via `userId`. Arrows indicate secondary attachments.

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
│      │  └─ transferGroupId ──▶ (other Transaction)
│
├── Category (self-referencing parentId, 2 levels max)
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

## 19. Seed data

- `Currency` table: at minimum XOF (0), EUR (2), USD (2), NGN (2), GHS (2), XAF (0), MAD (2), CAD (2), GBP (2).
- Fixed parity XOF/EUR = 655.957 as `PEGGED`.
- Default system categories (`isSystem = true`, `name = null`, non-deletable, renamable). **The seed inserts keys, not labels** — translations live in the language files:

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

The first sixteen are of `kind = EXPENSE`, the following eight of `kind = INCOME`.
