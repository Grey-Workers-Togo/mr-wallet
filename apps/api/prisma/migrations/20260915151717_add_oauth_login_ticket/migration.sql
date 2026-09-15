-- CreateTable
CREATE TABLE "OAuthLoginTicket" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthLoginTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthLoginTicket_tokenHash_key" ON "OAuthLoginTicket"("tokenHash");

-- CreateIndex
CREATE INDEX "OAuthLoginTicket_expiresAt_idx" ON "OAuthLoginTicket"("expiresAt");
