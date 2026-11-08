-- CreateEnum
CREATE TYPE "RulebookStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ChunkType" AS ENUM ('SPELL', 'ITEM', 'CLASS', 'SUBCLASS', 'FEAT', 'MONSTER', 'RACE', 'BACKGROUND', 'RULE', 'TABLE', 'NARRATIVE');

-- CreateEnum
CREATE TYPE "LicenseType" AS ENUM ('SRD_5E', 'SRD_5_1', 'SRD_5_5', 'COPYRIGHT_WOTC', 'CC_BY_4', 'DM_GUILD', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('PLAYER_EDIT', 'DM_SUGGESTION', 'DM_OVERRIDE', 'DM_LOCK', 'DM_UNLOCK', 'CONFLICT_RESOLVED', 'SYSTEM_CORRECTION');

-- CreateEnum
CREATE TYPE "ConflictType" AS ENUM ('INVALID_VALUE', 'MISSING_PREREQUISITE', 'EXCEEDS_LIMIT', 'DUPLICATE', 'INCOMPATIBLE_CHOICES', 'RULE_VIOLATION');

-- CreateEnum
CREATE TYPE "ConflictSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'BLOCKING');

-- CreateEnum
CREATE TYPE "TileCategory" AS ENUM ('FLOOR', 'WALL', 'CORNER', 'DOOR', 'FURNITURE', 'PROP', 'STAIRS', 'SPECIAL');

-- CreateEnum
CREATE TYPE "LayerType" AS ENUM ('TERRAIN', 'STRUCTURE', 'FURNITURE', 'WALLS', 'LIGHTING', 'FOG', 'TOKENS', 'ANNOTATIONS');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('ATTACK_MELEE', 'ATTACK_RANGED', 'SPELL_ATTACK', 'SPELL_SAVE', 'SPELL_AOE', 'FEATURE', 'ITEM_USE', 'REACTION', 'MOVEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ActionCost" AS ENUM ('ACTION', 'BONUS_ACTION', 'REACTION', 'FREE', 'MOVEMENT', 'LEGENDARY', 'MYTHIC');

-- CreateEnum
CREATE TYPE "ActionSource" AS ENUM ('CLASS', 'SUBCLASS', 'FEAT', 'ITEM', 'RACE', 'BACKGROUND', 'SPELL', 'RACIAL', 'CLASS_FEATURE', 'MAGIC_ITEM', 'OTHER');

-- CreateEnum
CREATE TYPE "ResolutionStatus" AS ENUM ('PREVIEW', 'ROLLING', 'DM_REVIEW', 'APPLIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContainerType" AS ENUM ('BACKPACK', 'POUCH', 'CHEST', 'CART', 'BAG_OF_HOLDING', 'PORTABLE_HOLE', 'HANDY_HAVERSACK', 'QUIVER', 'SCABBARD', 'SHEATH', 'BELT_POUCH', 'SATCHel', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CurrencyType" AS ENUM ('CP', 'SP', 'EP', 'GP', 'PP', 'NUYEN', 'CASH');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('ADD', 'REMOVE', 'TRANSFER', 'CONVERT', 'SPLIT', 'MERGE', 'PAY', 'RECEIVE');

-- CreateEnum
CREATE TYPE "LootStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShopType" AS ENUM ('GENERAL', 'MAGIC', 'BLACKSMITH', 'ALCHEMIST', 'TEMPLE', 'BLACK_MARKET', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ShopItemType" AS ENUM ('RULEBOOK_SPELL', 'RULEBOOK_ITEM', 'RULEBOOK_MONSTER_PART', 'CUSTOM_ITEM', 'CHARACTER_TEMPLATE', 'TOKEN_TEMPLATE', 'LOOT_TABLE');

-- CreateEnum
CREATE TYPE "ShopTransactionType" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "AoEShape" AS ENUM ('CIRCLE', 'CONE', 'LINE', 'CUBE', 'SPHERE', 'CYLINDER', 'HEMISPHERE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "OverrideTargetType" AS ENUM ('ROLL', 'ROLL_BREAKDOWN', 'HP', 'DAMAGE', 'TEMP_HP', 'DEATH_SAVES', 'CONDITIONS', 'POSITION', 'MOVEMENT', 'REACHABLE_AREA', 'INITIATIVE', 'TURN_ORDER', 'REACTION', 'ACTION_RESOLUTION', 'SPELL_SLOTS', 'CHARGES', 'HIT_DICE', 'SUPERIORITY_DICE', 'KI_POINTS', 'CHANNEL_DIVINITY', 'FOG', 'LIGHT', 'WALLS', 'DOORS', 'TERRAIN', 'NARRATIVE', 'CHAT');

-- CreateEnum
CREATE TYPE "OverrideVisibility" AS ENUM ('DM_ONLY', 'DM_AND_PLAYERS', 'TABLE');

-- CreateEnum
CREATE TYPE "DiceMode" AS ENUM ('TRUE_RANDOM', 'WEIGHTED_DECK');

-- CreateEnum
CREATE TYPE "RerollReason" AS ENUM ('ADVANTAGE', 'DISADVANTAGE', 'HALFLING_LUCK', 'ELVEN_ACCURACY', 'GREAT_WEAPON_FIGHTING', 'BLESS', 'BANE', 'PORTENT', 'DM_FORCED', 'PLAYER_CHOICE', 'REROLL_FEATURE', 'OTHER');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "diceMode" "DiceMode" NOT NULL DEFAULT 'TRUE_RANDOM',
ADD COLUMN     "fogShareExcludedCharacterIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "fogShareExploredWithParty" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DiceRoll" ADD COLUMN     "deckPosition" INTEGER,
ADD COLUMN     "deckSeed" TEXT,
ADD COLUMN     "deckSize" INTEGER,
ADD COLUMN     "isReroll" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mode" "DiceMode" NOT NULL DEFAULT 'TRUE_RANDOM',
ADD COLUMN     "originalRollId" TEXT,
ADD COLUMN     "rerollNumber" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rerollReason" "RerollReason",
ADD COLUMN     "visibleTo" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "MapTile" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "TileCategory" NOT NULL,
    "assetId" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "connections" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MapTile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapLayer" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LayerType" NOT NULL,
    "order" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterDraft" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastEditedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterChange" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "changeType" "ChangeType" NOT NULL,
    "authorId" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterLock" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "lockedById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterConflict" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "conflictType" "ConflictType" NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "ConflictSeverity" NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolution" TEXT,

    CONSTRAINT "CharacterConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rulebook" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "edition" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "thumbnailPath" TEXT,
    "status" "RulebookStatus" NOT NULL DEFAULT 'PENDING',
    "totalPages" INTEGER,
    "processedPages" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rulebook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RulebookChunk" (
    "id" TEXT NOT NULL,
    "rulebookId" TEXT NOT NULL,
    "pageStart" INTEGER NOT NULL,
    "pageEnd" INTEGER NOT NULL,
    "contentType" "ChunkType" NOT NULL,
    "rawText" TEXT NOT NULL,
    "structured" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "embedding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RulebookChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RulebookActivation" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "rulebookId" TEXT NOT NULL,
    "contentType" "ChunkType",
    "sourceIds" TEXT[],
    "activatedById" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RulebookActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedContent" (
    "id" TEXT NOT NULL,
    "contentType" "ChunkType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "rawText" TEXT NOT NULL,
    "pageRef" TEXT NOT NULL,
    "license" "LicenseType" NOT NULL DEFAULT 'COPYRIGHT_WOTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractedContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterAction" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ActionType" NOT NULL,
    "cost" "ActionCost" NOT NULL,
    "data" JSONB NOT NULL,
    "source" "ActionSource" NOT NULL,
    "sourceRef" TEXT,
    "recharge" JSONB,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CharacterAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionResolution" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "targetIds" TEXT[],
    "actionId" TEXT,
    "actionType" "ActionType" NOT NULL,
    "actionData" JSONB NOT NULL,
    "attackRolls" JSONB,
    "saveRolls" JSONB,
    "damageRolls" JSONB,
    "conditions" JSONB,
    "resources" JSONB,
    "status" "ResolutionStatus" NOT NULL,
    "dmOverride" BOOLEAN NOT NULL DEFAULT false,
    "dmNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "ActionResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryContainer" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ContainerType" NOT NULL DEFAULT 'CUSTOM',
    "parentId" TEXT,
    "capacity" DOUBLE PRECISION NOT NULL,
    "capacityUnit" TEXT NOT NULL DEFAULT 'LBS',
    "baseWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isMagical" BOOLEAN NOT NULL DEFAULT false,
    "magicType" TEXT,
    "extradimensionalSpaceId" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryContainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrencyContainer" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "containerId" TEXT,
    "name" TEXT NOT NULL,
    "cp" INTEGER NOT NULL DEFAULT 0,
    "sp" INTEGER NOT NULL DEFAULT 0,
    "ep" INTEGER NOT NULL DEFAULT 0,
    "gp" INTEGER NOT NULL DEFAULT 0,
    "pp" INTEGER NOT NULL DEFAULT 0,
    "nuyen" INTEGER NOT NULL DEFAULT 0,
    "cash" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "custom" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurrencyContainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrencyTransaction" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "fromContainerId" TEXT,
    "toContainerId" TEXT,
    "type" "TransactionType" NOT NULL,
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

    CONSTRAINT "CurrencyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LootDistribution" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "status" "LootStatus" NOT NULL DEFAULT 'PENDING',
    "items" JSONB NOT NULL,
    "currency" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,

    CONSTRAINT "LootDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LootAssignment" (
    "id" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "assignedItems" JSONB NOT NULL,
    "assignedCurrency" JSONB NOT NULL,
    "assignedById" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LootAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttunementSlot" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "attunedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "slotNumber" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttunementSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ShopType" NOT NULL,
    "mapId" TEXT,
    "tokenId" TEXT,
    "buyModifier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "sellModifier" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "currency" JSONB NOT NULL,
    "restockRule" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopItem" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "itemType" "ShopItemType" NOT NULL,
    "itemRef" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemData" JSONB NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 1,
    "maxStock" INTEGER NOT NULL DEFAULT -1,
    "currentStock" INTEGER NOT NULL DEFAULT 1,
    "priceOverride" JSONB,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "ShopItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopVisit" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchases" JSONB NOT NULL,
    "sales" JSONB NOT NULL,

    CONSTRAINT "ShopVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopTransaction" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ShopTransactionType" NOT NULL,
    "items" JSONB NOT NULL,
    "currency" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpellTemplate" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "name" TEXT NOT NULL,
    "shape" "AoEShape" NOT NULL,
    "size" JSONB NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'intersection',
    "gridSnap" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpellTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DMOverride" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "targetType" "OverrideTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "previousValue" JSONB NOT NULL,
    "newValue" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "visibility" "OverrideVisibility" NOT NULL,
    "overriddenById" TEXT NOT NULL,
    "overriddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revertedAt" TIMESTAMP(3),
    "revertedById" TEXT,
    "revertReason" TEXT,

    CONSTRAINT "DMOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiceDeck" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "expression" TEXT NOT NULL,
    "deck" JSONB NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "seed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiceDeck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MapTile_campaignId_category_idx" ON "MapTile"("campaignId", "category");

-- CreateIndex
CREATE INDEX "MapLayer_mapId_idx" ON "MapLayer"("mapId");

-- CreateIndex
CREATE UNIQUE INDEX "MapLayer_mapId_name_key" ON "MapLayer"("mapId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterDraft_characterId_key" ON "CharacterDraft"("characterId");

-- CreateIndex
CREATE INDEX "CharacterChange_characterId_createdAt_idx" ON "CharacterChange"("characterId", "createdAt");

-- CreateIndex
CREATE INDEX "CharacterChange_authorId_idx" ON "CharacterChange"("authorId");

-- CreateIndex
CREATE INDEX "CharacterLock_characterId_idx" ON "CharacterLock"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterLock_characterId_fieldPath_key" ON "CharacterLock"("characterId", "fieldPath");

-- CreateIndex
CREATE INDEX "CharacterConflict_characterId_resolvedAt_idx" ON "CharacterConflict"("characterId", "resolvedAt");

-- CreateIndex
CREATE INDEX "Rulebook_campaignId_idx" ON "Rulebook"("campaignId");

-- CreateIndex
CREATE INDEX "Rulebook_sourceId_idx" ON "Rulebook"("sourceId");

-- CreateIndex
CREATE INDEX "RulebookChunk_rulebookId_idx" ON "RulebookChunk"("rulebookId");

-- CreateIndex
CREATE INDEX "RulebookChunk_contentType_idx" ON "RulebookChunk"("contentType");

-- CreateIndex
CREATE INDEX "RulebookActivation_campaignId_idx" ON "RulebookActivation"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "RulebookActivation_campaignId_rulebookId_contentType_key" ON "RulebookActivation"("campaignId", "rulebookId", "contentType");

-- CreateIndex
CREATE INDEX "ExtractedContent_contentType_idx" ON "ExtractedContent"("contentType");

-- CreateIndex
CREATE INDEX "ExtractedContent_sourceId_idx" ON "ExtractedContent"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractedContent_contentType_sourceId_name_key" ON "ExtractedContent"("contentType", "sourceId", "name");

-- CreateIndex
CREATE INDEX "CharacterAction_characterId_idx" ON "CharacterAction"("characterId");

-- CreateIndex
CREATE INDEX "ActionResolution_campaignId_createdAt_idx" ON "ActionResolution"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionResolution_initiatorId_idx" ON "ActionResolution"("initiatorId");

-- CreateIndex
CREATE INDEX "InventoryContainer_characterId_idx" ON "InventoryContainer"("characterId");

-- CreateIndex
CREATE INDEX "InventoryContainer_parentId_idx" ON "InventoryContainer"("parentId");

-- CreateIndex
CREATE INDEX "CurrencyContainer_characterId_idx" ON "CurrencyContainer"("characterId");

-- CreateIndex
CREATE INDEX "CurrencyContainer_containerId_idx" ON "CurrencyContainer"("containerId");

-- CreateIndex
CREATE INDEX "CurrencyTransaction_characterId_createdAt_idx" ON "CurrencyTransaction"("characterId", "createdAt");

-- CreateIndex
CREATE INDEX "CurrencyTransaction_fromContainerId_idx" ON "CurrencyTransaction"("fromContainerId");

-- CreateIndex
CREATE INDEX "CurrencyTransaction_toContainerId_idx" ON "CurrencyTransaction"("toContainerId");

-- CreateIndex
CREATE INDEX "LootDistribution_campaignId_status_idx" ON "LootDistribution"("campaignId", "status");

-- CreateIndex
CREATE INDEX "LootAssignment_distributionId_idx" ON "LootAssignment"("distributionId");

-- CreateIndex
CREATE INDEX "LootAssignment_characterId_idx" ON "LootAssignment"("characterId");

-- CreateIndex
CREATE INDEX "AttunementSlot_characterId_idx" ON "AttunementSlot"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "AttunementSlot_characterId_slotNumber_key" ON "AttunementSlot"("characterId", "slotNumber");

-- CreateIndex
CREATE INDEX "Shop_campaignId_idx" ON "Shop"("campaignId");

-- CreateIndex
CREATE INDEX "Shop_mapId_idx" ON "Shop"("mapId");

-- CreateIndex
CREATE INDEX "Shop_tokenId_idx" ON "Shop"("tokenId");

-- CreateIndex
CREATE INDEX "ShopItem_shopId_category_idx" ON "ShopItem"("shopId", "category");

-- CreateIndex
CREATE INDEX "ShopItem_shopId_isVisible_idx" ON "ShopItem"("shopId", "isVisible");

-- CreateIndex
CREATE INDEX "ShopVisit_shopId_userId_idx" ON "ShopVisit"("shopId", "userId");

-- CreateIndex
CREATE INDEX "ShopVisit_userId_visitedAt_idx" ON "ShopVisit"("userId", "visitedAt");

-- CreateIndex
CREATE INDEX "ShopTransaction_shopId_createdAt_idx" ON "ShopTransaction"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "ShopTransaction_userId_createdAt_idx" ON "ShopTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SpellTemplate_campaignId_idx" ON "SpellTemplate"("campaignId");

-- CreateIndex
CREATE INDEX "DMOverride_campaignId_overriddenAt_idx" ON "DMOverride"("campaignId", "overriddenAt");

-- CreateIndex
CREATE INDEX "DMOverride_targetType_targetId_idx" ON "DMOverride"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "DiceDeck_campaignId_idx" ON "DiceDeck"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "DiceDeck_campaignId_expression_key" ON "DiceDeck"("campaignId", "expression");

-- CreateIndex
CREATE INDEX "DiceRoll_originalRollId_idx" ON "DiceRoll"("originalRollId");

-- AddForeignKey
ALTER TABLE "MapTile" ADD CONSTRAINT "MapTile_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapTile" ADD CONSTRAINT "MapTile_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapTile" ADD CONSTRAINT "MapTile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapLayer" ADD CONSTRAINT "MapLayer_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "Map"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterDraft" ADD CONSTRAINT "CharacterDraft_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterDraft" ADD CONSTRAINT "CharacterDraft_lastEditedById_fkey" FOREIGN KEY ("lastEditedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterChange" ADD CONSTRAINT "CharacterChange_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterChange" ADD CONSTRAINT "CharacterChange_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterChange" ADD CONSTRAINT "CharacterChange_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterLock" ADD CONSTRAINT "CharacterLock_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterLock" ADD CONSTRAINT "CharacterLock_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterConflict" ADD CONSTRAINT "CharacterConflict_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterConflict" ADD CONSTRAINT "CharacterConflict_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rulebook" ADD CONSTRAINT "Rulebook_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rulebook" ADD CONSTRAINT "Rulebook_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RulebookChunk" ADD CONSTRAINT "RulebookChunk_rulebookId_fkey" FOREIGN KEY ("rulebookId") REFERENCES "Rulebook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RulebookActivation" ADD CONSTRAINT "RulebookActivation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RulebookActivation" ADD CONSTRAINT "RulebookActivation_rulebookId_fkey" FOREIGN KEY ("rulebookId") REFERENCES "Rulebook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RulebookActivation" ADD CONSTRAINT "RulebookActivation_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiceRoll" ADD CONSTRAINT "DiceRoll_originalRollId_fkey" FOREIGN KEY ("originalRollId") REFERENCES "DiceRoll"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterAction" ADD CONSTRAINT "CharacterAction_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionResolution" ADD CONSTRAINT "ActionResolution_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionResolution" ADD CONSTRAINT "ActionResolution_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryContainer" ADD CONSTRAINT "InventoryContainer_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryContainer" ADD CONSTRAINT "InventoryContainer_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "InventoryContainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyContainer" ADD CONSTRAINT "CurrencyContainer_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyContainer" ADD CONSTRAINT "CurrencyContainer_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "InventoryContainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyTransaction" ADD CONSTRAINT "CurrencyTransaction_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyTransaction" ADD CONSTRAINT "CurrencyTransaction_fromContainerId_fkey" FOREIGN KEY ("fromContainerId") REFERENCES "CurrencyContainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyTransaction" ADD CONSTRAINT "CurrencyTransaction_toContainerId_fkey" FOREIGN KEY ("toContainerId") REFERENCES "CurrencyContainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyTransaction" ADD CONSTRAINT "CurrencyTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootDistribution" ADD CONSTRAINT "LootDistribution_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootDistribution" ADD CONSTRAINT "LootDistribution_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootDistribution" ADD CONSTRAINT "LootDistribution_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootAssignment" ADD CONSTRAINT "LootAssignment_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "LootDistribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootAssignment" ADD CONSTRAINT "LootAssignment_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootAssignment" ADD CONSTRAINT "LootAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootAssignment" ADD CONSTRAINT "LootAssignment_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttunementSlot" ADD CONSTRAINT "AttunementSlot_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "Map"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopItem" ADD CONSTRAINT "ShopItem_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopVisit" ADD CONSTRAINT "ShopVisit_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopVisit" ADD CONSTRAINT "ShopVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopTransaction" ADD CONSTRAINT "ShopTransaction_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopTransaction" ADD CONSTRAINT "ShopTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpellTemplate" ADD CONSTRAINT "SpellTemplate_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpellTemplate" ADD CONSTRAINT "SpellTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMOverride" ADD CONSTRAINT "DMOverride_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMOverride" ADD CONSTRAINT "DMOverride_overriddenById_fkey" FOREIGN KEY ("overriddenById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMOverride" ADD CONSTRAINT "DMOverride_revertedById_fkey" FOREIGN KEY ("revertedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiceDeck" ADD CONSTRAINT "DiceDeck_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

