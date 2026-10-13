-- Lot A1 (ADR-0022 §4): daily counters for the assistant. Counters only, no text (RG-AP3).
-- Additive and reversible: nothing else references this table.
-- Down: DROP TABLE "AssistantUsage";

-- CreateTable
CREATE TABLE "AssistantUsage" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostMicros" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AssistantUsage_pkey" PRIMARY KEY ("userId","day")
);

-- CreateIndex
CREATE INDEX "AssistantUsage_day_idx" ON "AssistantUsage"("day");
