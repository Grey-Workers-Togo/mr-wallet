-- CreateEnum
CREATE TYPE "RateSource" AS ENUM ('MANUAL', 'PROVIDER', 'PEGGED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK', 'MOBILE_MONEY', 'CREDIT_CARD', 'SAVINGS', 'WALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('EXPENSE', 'INCOME', 'TRANSFER');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('EXPENSE', 'INCOME', 'TRANSFER');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('PENDING', 'CLEARED', 'RECONCILED', 'VOID');

-- CreateEnum
CREATE TYPE "TxSource" AS ENUM ('MANUAL', 'IMPORT', 'RECURRENCE', 'DEBT_PAYMENT', 'GOAL_CONTRIBUTION', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY');

-- CreateEnum
CREATE TYPE "BudgetPeriodType" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DebtDirection" AS ENUM ('OWED_BY_ME', 'OWED_TO_ME');

-- CreateEnum
CREATE TYPE "DebtKind" AS ENUM ('LOAN', 'CREDIT_CARD', 'MORTGAGE', 'INFORMAL', 'INSTALLMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('FIXED', 'VARIABLE', 'ZERO');

-- CreateEnum
CREATE TYPE "Compounding" AS ENUM ('NONE', 'MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('ACTIVE', 'PAID_OFF', 'DEFAULTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('SCHEDULED', 'PAID', 'PARTIAL', 'LATE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "FileFormat" AS ENUM ('CSV', 'XLSX', 'XLS', 'OFX');

-- CreateEnum
CREATE TYPE "AmountStrategy" AS ENUM ('SIGNED_SINGLE_COLUMN', 'DEBIT_CREDIT_COLUMNS', 'TYPE_COLUMN');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PARSING', 'AWAITING_REVIEW', 'IMPORTING', 'COMPLETED', 'FAILED', 'REVERTED');

-- CreateEnum
CREATE TYPE "MatchField" AS ENUM ('DESCRIPTION', 'PAYEE', 'EXTERNAL_REF');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('CONTAINS', 'EQUALS', 'STARTS_WITH', 'ENDS_WITH', 'REGEX');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'IMPORT', 'SCHEDULER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BUDGET_THRESHOLD', 'BUDGET_EXCEEDED', 'DEBT_DUE_SOON', 'DEBT_OVERDUE', 'DEBT_PAID_OFF', 'GOAL_REACHED', 'RECURRENCE_DUE', 'IMPORT_COMPLETED', 'IMPORT_FAILED', 'BALANCE_MISMATCH');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('WEB_PUSH', 'IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "ExportKind" AS ENUM ('TRANSACTIONS', 'FULL');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "baseCurrency" CHAR(3) NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'fr-FR',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Porto-Novo',
    "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
    "monthStartDay" INTEGER NOT NULL DEFAULT 1,
    "emailVerifiedAt" TIMESTAMPTZ(6),
    "lastLoginAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Currency" (
    "code" CHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "minorUnits" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "fromCurrency" CHAR(3) NOT NULL,
    "toCurrency" CHAR(3) NOT NULL,
    "rate" DECIMAL(24,12) NOT NULL,
    "validFrom" TIMESTAMPTZ(6) NOT NULL,
    "source" "RateSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "openingBalanceMinor" BIGINT NOT NULL DEFAULT 0,
    "openingBalanceAt" TIMESTAMPTZ(6) NOT NULL,
    "currentBalanceMinor" BIGINT NOT NULL DEFAULT 0,
    "balanceCheckedAt" TIMESTAMPTZ(6),
    "creditLimitMinor" BIGINT,
    "institution" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "includeInNetWorth" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "i18nKey" TEXT,
    "name" TEXT,
    "kind" "CategoryKind" NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionTag" (
    "transactionId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionTag_pkey" PRIMARY KEY ("transactionId","tagId")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL,
    "description" TEXT NOT NULL,
    "normalizedLabel" TEXT NOT NULL,
    "categoryId" TEXT,
    "payee" TEXT,
    "notes" TEXT,
    "status" "TxStatus" NOT NULL DEFAULT 'CLEARED',
    "transferGroupId" TEXT,
    "counterAccountId" TEXT,
    "source" "TxSource" NOT NULL DEFAULT 'MANUAL',
    "importBatchId" TEXT,
    "externalRef" TEXT,
    "fingerprint" TEXT NOT NULL,
    "recurrenceId" TEXT,
    "debtPaymentId" TEXT,
    "goalContributionId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurrenceRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "amountIsEstimate" BOOLEAN NOT NULL DEFAULT false,
    "frequency" "Frequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "dayOfMonth" INTEGER,
    "dayOfWeek" INTEGER,
    "startsOn" TIMESTAMPTZ(6) NOT NULL,
    "endsOn" TIMESTAMPTZ(6),
    "maxOccurrences" INTEGER,
    "autoCreate" BOOLEAN NOT NULL DEFAULT false,
    "reminderDaysBefore" INTEGER DEFAULT 3,
    "lastGeneratedAt" TIMESTAMPTZ(6),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "RecurrenceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "period" "BudgetPeriodType" NOT NULL,
    "startsOn" TIMESTAMPTZ(6) NOT NULL,
    "endsOn" TIMESTAMPTZ(6),
    "rollover" BOOLEAN NOT NULL DEFAULT false,
    "alertThresholds" INTEGER[] DEFAULT ARRAY[80, 100]::INTEGER[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetPeriod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "periodStart" TIMESTAMPTZ(6) NOT NULL,
    "periodEnd" TIMESTAMPTZ(6) NOT NULL,
    "allocatedMinor" BIGINT NOT NULL,
    "rolloverInMinor" BIGINT NOT NULL DEFAULT 0,
    "spentMinor" BIGINT NOT NULL DEFAULT 0,
    "lastAlertPct" INTEGER,
    "closedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BudgetPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "direction" "DebtDirection" NOT NULL,
    "counterparty" TEXT,
    "kind" "DebtKind" NOT NULL DEFAULT 'LOAN',
    "linkedAccountId" TEXT,
    "principalMinor" BIGINT NOT NULL,
    "outstandingPrincipalMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "annualRatePct" DECIMAL(7,4),
    "rateType" "RateType" NOT NULL DEFAULT 'FIXED',
    "compounding" "Compounding" NOT NULL DEFAULT 'MONTHLY',
    "startedOn" TIMESTAMPTZ(6) NOT NULL,
    "termMonths" INTEGER,
    "paymentFrequency" "Frequency" NOT NULL DEFAULT 'MONTHLY',
    "paymentDayOfMonth" INTEGER,
    "installmentMinor" BIGINT,
    "status" "DebtStatus" NOT NULL DEFAULT 'ACTIVE',
    "closedAt" TIMESTAMPTZ(6),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtInstallment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "dueOn" TIMESTAMPTZ(6) NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "principalMinor" BIGINT NOT NULL,
    "interestMinor" BIGINT NOT NULL,
    "feesMinor" BIGINT NOT NULL DEFAULT 0,
    "balanceAfterMinor" BIGINT NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "paidMinor" BIGINT NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DebtInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "installmentId" TEXT,
    "paidAt" TIMESTAMPTZ(6) NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "principalMinor" BIGINT NOT NULL,
    "interestMinor" BIGINT NOT NULL,
    "feesMinor" BIGINT NOT NULL DEFAULT 0,
    "isExtraPayment" BOOLEAN NOT NULL DEFAULT false,
    "transactionId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "DebtPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetMinor" BIGINT NOT NULL,
    "currentMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "targetDate" TIMESTAMPTZ(6),
    "linkedAccountId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "color" TEXT,
    "icon" TEXT,
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalContribution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "contributedAt" TIMESTAMPTZ(6) NOT NULL,
    "transactionId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "GoalContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileFormat" "FileFormat" NOT NULL,
    "accountId" TEXT,
    "columnMapping" JSONB NOT NULL,
    "dateFormat" TEXT NOT NULL,
    "decimalSeparator" TEXT NOT NULL DEFAULT ',',
    "thousandSeparator" TEXT NOT NULL DEFAULT ' ',
    "encoding" TEXT NOT NULL DEFAULT 'utf-8',
    "delimiter" TEXT NOT NULL DEFAULT ';',
    "hasHeaderRow" BOOLEAN NOT NULL DEFAULT true,
    "skipRows" INTEGER NOT NULL DEFAULT 0,
    "amountStrategy" "AmountStrategy" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "ImportSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT,
    "accountId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "revertedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorizationRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "matchField" "MatchField" NOT NULL DEFAULT 'DESCRIPTION',
    "matchType" "MatchType" NOT NULL DEFAULT 'CONTAINS',
    "matchValue" TEXT NOT NULL,
    "minAmountMinor" BIGINT,
    "maxAmountMinor" BIGINT,
    "accountId" TEXT,
    "categoryId" TEXT NOT NULL,
    "addTagIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "setPayee" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "timesApplied" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "CategorizationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT,
    "actorType" "ActorType" NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "params" JSONB NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "severity" "Severity" NOT NULL DEFAULT 'INFO',
    "readAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "storedMinor" BIGINT NOT NULL,
    "computedMinor" BIGINT NOT NULL,
    "deltaMinor" BIGINT NOT NULL,
    "isMatch" BOOLEAN NOT NULL,
    "checkedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dhKey" TEXT,
    "authKey" TEXT,
    "nativeToken" TEXT,
    "deviceLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMPTZ(6),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ExportKind" NOT NULL,
    "format" "FileFormat" NOT NULL,
    "filters" JSONB,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "rowCount" INTEGER,
    "filePath" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "ExchangeRate_fromCurrency_toCurrency_validFrom_idx" ON "ExchangeRate"("fromCurrency", "toCurrency", "validFrom");

-- CreateIndex
CREATE INDEX "Account_userId_deletedAt_idx" ON "Account"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Category_userId_deletedAt_idx" ON "Category"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Category_userId_parentId_idx" ON "Category"("userId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag"("userId", "name");

-- CreateIndex
CREATE INDEX "Transaction_userId_occurredAt_idx" ON "Transaction"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "Transaction_userId_accountId_occurredAt_idx" ON "Transaction"("userId", "accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "Transaction_userId_categoryId_occurredAt_idx" ON "Transaction"("userId", "categoryId", "occurredAt");

-- CreateIndex
CREATE INDEX "Transaction_userId_fingerprint_idx" ON "Transaction"("userId", "fingerprint");

-- CreateIndex
CREATE INDEX "Transaction_transferGroupId_idx" ON "Transaction"("transferGroupId");

-- CreateIndex
CREATE INDEX "RecurrenceRule_userId_isActive_deletedAt_idx" ON "RecurrenceRule"("userId", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "Budget_userId_isActive_deletedAt_idx" ON "Budget"("userId", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "BudgetPeriod_userId_periodStart_idx" ON "BudgetPeriod"("userId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetPeriod_budgetId_periodStart_key" ON "BudgetPeriod"("budgetId", "periodStart");

-- CreateIndex
CREATE INDEX "Debt_userId_status_deletedAt_idx" ON "Debt"("userId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "DebtInstallment_userId_dueOn_status_idx" ON "DebtInstallment"("userId", "dueOn", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DebtInstallment_debtId_sequence_key" ON "DebtInstallment"("debtId", "sequence");

-- CreateIndex
CREATE INDEX "DebtPayment_userId_debtId_paidAt_idx" ON "DebtPayment"("userId", "debtId", "paidAt");

-- CreateIndex
CREATE INDEX "SavingsGoal_userId_status_deletedAt_idx" ON "SavingsGoal"("userId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "GoalContribution_userId_goalId_contributedAt_idx" ON "GoalContribution"("userId", "goalId", "contributedAt");

-- CreateIndex
CREATE INDEX "ImportSource_userId_deletedAt_idx" ON "ImportSource"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "ImportBatch_userId_createdAt_idx" ON "ImportBatch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CategorizationRule_userId_isActive_priority_idx" ON "CategorizationRule"("userId", "isActive", "priority");

-- CreateIndex
CREATE INDEX "AuditLog_userId_occurredAt_idx" ON "AuditLog"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_action_occurredAt_idx" ON "AuditLog"("action", "occurredAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "BalanceCheck_userId_accountId_checkedAt_idx" ON "BalanceCheck"("userId", "accountId", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_type_key" ON "NotificationPreference"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_endpoint_key" ON "DeviceToken"("endpoint");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_isActive_idx" ON "DeviceToken"("userId", "isActive");

-- CreateIndex
CREATE INDEX "IdempotencyKey_userId_expiresAt_idx" ON "IdempotencyKey"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "ExportJob_userId_createdAt_idx" ON "ExportJob"("userId", "createdAt");
