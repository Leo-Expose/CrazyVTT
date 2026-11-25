-- CreateEnum
CREATE TYPE "PoolTransactionType" AS ENUM ('CONTRIBUTE', 'WITHDRAW', 'DM_ADJUST', 'SPEND', 'LOOT_DEPOSIT');

-- CreateTable
CREATE TABLE "PartyResourcePool" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cp" INTEGER NOT NULL DEFAULT 0,
    "sp" INTEGER NOT NULL DEFAULT 0,
    "ep" INTEGER NOT NULL DEFAULT 0,
    "gp" INTEGER NOT NULL DEFAULT 0,
    "pp" INTEGER NOT NULL DEFAULT 0,
    "nuyen" INTEGER NOT NULL DEFAULT 0,
    "cash" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "custom" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "allowPlayerWithdraw" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "PartyResourcePool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyResourceTransaction" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "characterId" TEXT,
    "type" "PoolTransactionType" NOT NULL,
    "cp" INTEGER NOT NULL DEFAULT 0,
    "sp" INTEGER NOT NULL DEFAULT 0,
    "ep" INTEGER NOT NULL DEFAULT 0,
    "gp" INTEGER NOT NULL DEFAULT 0,
    "pp" INTEGER NOT NULL DEFAULT 0,
    "nuyen" INTEGER NOT NULL DEFAULT 0,
    "cash" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "custom" JSONB,
    "description" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyResourceTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartyResourcePool_campaignId_idx" ON "PartyResourcePool"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "PartyResourcePool_campaignId_isDefault_key" ON "PartyResourcePool"("campaignId", "isDefault");

-- CreateIndex
CREATE INDEX "PartyResourceTransaction_poolId_createdAt_idx" ON "PartyResourceTransaction"("poolId", "createdAt");

-- CreateIndex
CREATE INDEX "PartyResourceTransaction_characterId_idx" ON "PartyResourceTransaction"("characterId");

-- AddForeignKey
ALTER TABLE "PartyResourcePool" ADD CONSTRAINT "PartyResourcePool_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyResourcePool" ADD CONSTRAINT "PartyResourcePool_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyResourceTransaction" ADD CONSTRAINT "PartyResourceTransaction_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "PartyResourcePool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyResourceTransaction" ADD CONSTRAINT "PartyResourceTransaction_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyResourceTransaction" ADD CONSTRAINT "PartyResourceTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
