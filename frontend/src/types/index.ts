import type { CharacterHpInfo } from '@/utils/characterHp';
// ============================================
// CrazyVTT Frontend Type Definitions
// Mirrors backend API models (Prisma schema)
// ============================================

// ============================================
// Enums
// ============================================

import { GameSystem } from './gameSystem';

export { GameSystem };

export enum PlatformRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export enum CampaignRole {
  DM = 'DM',
  PLAYER = 'PLAYER',
  SPECTATOR = 'SPECTATOR',
}

export enum CampaignStatus {
  PREPARATION = 'PREPARATION',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  INACTIVE = 'INACTIVE',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
}

export enum AssetType {
  MAP = 'MAP',
  TOKEN = 'TOKEN',
  AUDIO = 'AUDIO',
  AVATAR = 'AVATAR',
  DOCUMENT = 'DOCUMENT',
  OTHER = 'OTHER',
}

export enum RulebookStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL',
}

export type ChunkType = 'SPELL' | 'ITEM' | 'CLASS' | 'SUBCLASS' | 'FEAT' | 'MONSTER' | 'RACE' | 'BACKGROUND' | 'RULE' | 'TABLE' | 'NARRATIVE';
export const ChunkType = {
  SPELL: 'SPELL', ITEM: 'ITEM', CLASS: 'CLASS', SUBCLASS: 'SUBCLASS', FEAT: 'FEAT',
  MONSTER: 'MONSTER', RACE: 'RACE', BACKGROUND: 'BACKGROUND', RULE: 'RULE', TABLE: 'TABLE', NARRATIVE: 'NARRATIVE',
} as const satisfies Record<string, ChunkType>;

export enum LicenseType {
  SRD_5E = 'SRD_5E',
  SRD_5_1 = 'SRD_5_1',
  SRD_5_5 = 'SRD_5_5',
  COPYRIGHT_WOTC = 'COPYRIGHT_WOTC',
  CC_BY_4 = 'CC_BY_4',
  DM_GUILD = 'DM_GUILD',
  UNKNOWN = 'UNKNOWN',
}

export enum AssetScope {
  GLOBAL = 'GLOBAL',
  USER = 'USER',
  CAMPAIGN = 'CAMPAIGN',
}

export enum MessageType {
  PLAYER = 'PLAYER',
  DM = 'DM',
  SYSTEM = 'SYSTEM',
  DICE_ROLL = 'DICE_ROLL',
  CHARACTER_ACTION = 'CHARACTER_ACTION',
}

export enum TokenLayer {
  TOKEN = 'token',
  SPIRIT = 'spirit',
}

export enum TokenType {
  PLAYER = 'player',
  NPC    = 'npc',
  OBJECT = 'object',
}

export enum TokenDisposition {
  FRIENDLY = 'friendly',
  NEUTRAL  = 'neutral',
  HOSTILE  = 'hostile',
}

export type MovementMode = 'walk' | 'fly' | 'swim' | 'climb' | 'burrow' | 'teleport';
export const MovementMode = {
  WALK: 'walk', FLY: 'fly', SWIM: 'swim', CLIMB: 'climb', BURROW: 'burrow', TELEPORT: 'teleport',
} as const satisfies Record<string, MovementMode>;

export type TerrainType = 'normal' | 'difficult' | 'hazardous' | 'impassable';
export const TerrainType = {
  NORMAL: 'normal', DIFFICULT: 'difficult', HAZARDOUS: 'hazardous', IMPASSABLE: 'impassable',
} as const satisfies Record<string, TerrainType>;

export interface TokenMovementData {
  speed: number;                    // Base speed in feet
  flySpeed?: number;
  swimSpeed?: number;
  climbSpeed?: number;
  burrowSpeed?: number;
  movementMode: MovementMode;       // WALK | FLY | SWIM | CLIMB | BURROW | TELEPORT
  remainingThisTurn: number;        // Feet left this turn
  usedThisTurn: number;             // Feet used this turn
  difficultTerrainMultiplier: number; // 1, 2, etc.
  threatenedSquares: number[];      // Grid indices for AoO
  reach: number;                    // Feet
}

export interface ReachableSquare {
  x: number;
  y: number;
  cost: number;                     // Movement cost to reach this square
  path: { x: number; y: number }[]; // Path from start to this square
  isDifficult: boolean;
  isHazardous: boolean;
  hazardDamage?: { type: string; amount: string }; // e.g., { type: 'fire', amount: '1d6' }
}

export type TokenDisplayMode = 'pog' | 'top-down' | 'full-art';

// ============================================
// Map Tiles & Layers (Phase 3)
// ============================================

export type TileCategory = 'FLOOR' | 'WALL' | 'CORNER' | 'DOOR' | 'FURNITURE' | 'PROP' | 'STAIRS' | 'SPECIAL';
export const TileCategory = {
  FLOOR: 'FLOOR', WALL: 'WALL', CORNER: 'CORNER', DOOR: 'DOOR', FURNITURE: 'FURNITURE',
  PROP: 'PROP', STAIRS: 'STAIRS', SPECIAL: 'SPECIAL',
} as const satisfies Record<string, TileCategory>;

export enum LayerType {
  TERRAIN = 'TERRAIN',
  STRUCTURE = 'STRUCTURE',
  FURNITURE = 'FURNITURE',
  WALLS = 'WALLS',
  LIGHTING = 'LIGHTING',
  FOG = 'FOG',
  TOKENS = 'TOKENS',
  ANNOTATIONS = 'ANNOTATIONS',
}

export interface MapTile {
  id: string;
  campaignId: string;
  name: string;
  category: TileCategory;
  assetId: string;
  asset?: {
    id: string;
    filePath: string;
    thumbnailPath: string | null;
    originalName: string;
    mimeType: string;
  };
  width: number;
  height: number;
  connections?: {
    north: boolean;
    south: boolean;
    east: boolean;
    west: boolean;
    autoTile: boolean;
  };
  isDefault: boolean;
  createdById: string | null;
  createdBy?: {
    id: string;
    displayName: string;
  } | null;
  createdAt: string;
}

export interface MapLayer {
  id: string;
  mapId: string;
  name: string;
  type: LayerType;
  order: number;
  visible: boolean;
  locked: boolean;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// Layer data structures per type
export interface TerrainLayerData {
  tiles: Array<{
    tileId?: string;
    x: number;
    y: number;
    type?: TerrainType;
    hazardDamage?: { type: string; amount: string };
    rotation?: 0 | 90 | 180 | 270;
    flipH?: boolean;
    flipV?: boolean;
    variant?: string;
  }>;
}

export interface StructureLayerData {
  tiles: Array<{
    tileId: string;
    x: number;
    y: number;
    rotation?: 0 | 90 | 180 | 270;
    flipH?: boolean;
    flipV?: boolean;
    variant?: string;
  }>;
}

export interface FurnitureLayerData {
  tiles: Array<{
    tileId: string;
    x: number;
    y: number;
    rotation?: 0 | 90 | 180 | 270;
    flipH?: boolean;
    flipV?: boolean;
    variant?: string;
    scale?: number;
  }>;
}

export interface WallsLayerData {
  segments: Array<{
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    type: string;
  }>;
}

export interface LightingLayerData {
  lights: Array<{
    id: string;
    x: number;
    y: number;
    brightRadius: number;
    dimRadius: number;
    color: string;
    enabled: boolean;
  }>;
}

export interface FogLayerData {
  boxes: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

export interface AnnotationsLayerData {
  drawings: Array<{
    id: string;
    type: 'freehand' | 'rect' | 'circle' | 'text' | 'arrow';
    points: Array<{ x: number; y: number }>;
    color: string;
    strokeWidth: number;
    text?: string;
  }>;
}

export interface TokenVariant {
  id: string;
  name: string;
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

export interface WangConnections {
  north: boolean;
  south: boolean;
  east: boolean;
  west: boolean;
  autoTile: boolean;
}

export interface TileDefinition {
  id: string;
  name: string;
  category: string;
  connections: WangConnections;
  variants?: Record<number, string>;
}

/** NPC stat block — game-system-agnostic container for combat stats. */
/**
 * How proficient a creature is in a save or skill.
 * 'custom' marks a bonus set explicitly rather than derived — used for homebrew
 * and for published creatures whose printed value does not decompose into
 * ability modifier plus a whole number of proficiency bonuses.
 */
export type ProficiencyLevel = 'none' | 'proficient' | 'expertise' | 'custom';

/** Proficiency metadata backing a creature's derived save and skill bonuses. */
export interface NpcProficiencies {
  /**
   * Overrides the proficiency bonus derived from challenge rating, for the rare
   * published monster whose printed values do not match the CR table.
   */
  bonusOverride?: number;
  saves?: Record<string, ProficiencyLevel>;
  skills?: Record<string, ProficiencyLevel>;
}

export interface NpcStatBlock {
  /** Armor Class / Defense rating */
  ac: number;
  /**
   * Maximum hit points. Optional: stat blocks saved before HP was tracked have
   * none, and callers fall back to a default (see CreatureLibrary placement).
   */
  hpMax?: number;
  /** Hit dice expression, e.g. "7d8+14" (informational) */
  hitDice?: string;
  /** Speed (e.g. "30 ft." or "30 ft., fly 60 ft.") */
  speed: string;
  /** Ability scores */
  abilities: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  /**
   * Saving throw bonuses as totals, e.g. { "dex": 5, "wis": 3 }.
   * These stay the value that is displayed and rolled. Where `proficiencies`
   * has a matching entry the total is derived and rewritten on save; where it
   * does not, the stored value is preserved verbatim (which is how every stat
   * block created before proficiency tracking keeps working unchanged).
   */
  savingThrows?: Record<string, number>;
  /** Skill bonuses as totals, e.g. { "perception": 5, "stealth": 7 }. See savingThrows. */
  skills?: Record<string, number>;
  /**
   * How each bonus above is arrived at. Optional throughout — absent means
   * "legacy data, take the totals as given".
   */
  proficiencies?: NpcProficiencies;
  /** Damage vulnerabilities */
  damageVulnerabilities?: string;
  /** Damage resistances */
  damageResistances?: string;
  /** Damage immunities */
  damageImmunities?: string;
  /** Condition immunities */
  conditionImmunities?: string;
  /** Senses, e.g. "darkvision 60 ft., passive Perception 15" */
  senses?: string;
  /** Languages */
  languages?: string;
  /**
   * Attribute modifiers, used by systems that print modifiers rather than
   * scores. Pathfinder 2e stat blocks give "Str +4" directly and have no
   * underlying score, so deriving one from `abilities` would be an invention.
   * Absent for D&D 5e, where `abilities` holds scores and the modifier is
   * derived.
   */
  attributeModifiers?: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  /** Challenge rating, e.g. "1/4", "5" */
  challengeRating?: string;
  /**
   * Creature level, for systems that rate creatures by level rather than
   * challenge rating (Pathfinder 2e). Kept separate from challengeRating so
   * neither system has to pretend to use the other's scale.
   */
  level?: number;
  /** XP value */
  xp?: number;
  /** Special traits/abilities (name + description pairs) */
  traits?: Array<{ name: string; description: string }>;
  /** Actions (name + description pairs) */
  actions?: Array<{ name: string; description: string }>;
  /** Bonus actions */
  bonusActions?: Array<{ name: string; description: string }>;
  /** Reactions */
  reactions?: Array<{ name: string; description: string }>;
  /** Legendary actions */
  legendaryActions?: Array<{ name: string; description: string }>;
  /** Creature type, e.g. "Medium humanoid (goblinoid)" */
  creatureType?: string;
  /** Alignment, e.g. "neutral evil" */
  alignment?: string;
  /** Game system this stat block is designed for */
  gameSystem?: string;
  /** Any extra freeform notes */
  notes?: string;
}

/** Creature template from the library (DB model). */
export interface CreatureTemplate {
  id: string;
  name: string;
  gameSystem: GameSystem | null;
  source: string;
  challengeRating: string | null;
  creatureType: string | null;
  alignment: string | null;
  imageUrl: string | null;
  statBlock: NpcStatBlock;
  size: { width: number; height: number };
  disposition: TokenDisposition;
  displayMode: TokenDisplayMode;
  createdById: string | null;
  campaignId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TokenHp {
  current: number;
  max:     number;
  temp:    number;
}

/** Reusable token template — saved configuration for placing tokens across maps. */
export interface TokenTemplate {
  id: string;
  name: string;
  imageUrl: string | null;
  type: TokenType;
  disposition: TokenDisposition | null;
  displayMode: TokenDisplayMode;
  size: { width: number; height: number };
  notes: string | null;
  hp: TokenHp | null;
  showHpBar: boolean;
  statBlock: NpcStatBlock | null;
  sightRadius: number | null;
  campaignId: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// User & Authentication
// ============================================

export interface User {
  id: string;
  email: string;
  displayName: string;
  platformRole: PlatformRole;
  globalAssetManager: boolean;
  /** May edit or delete anyone's character template, not just their own. */
  templateEditor: boolean;
  mfaEnabled: boolean;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  mustChangePassword?: boolean;
  isApproved?: boolean;
  preferences?: UserPreferences | null;
  /**
   * For an administrator without two-factor authentication: when it becomes
   * required, after which the server refuses everything but enrolment. Null
   * or absent for everyone else.
   */
  adminMfaDeadline?: string | null;
  /** How many MFA backup codes are left; null with MFA off. */
  mfaBackupCodesRemaining?: number | null;
}

/** A campaign member's user, as the campaign routes send it. */
export type MemberUser = Pick<User, 'id' | 'displayName' | 'avatarUrl'>;

/** A chat message's author, as the message routes send it. */
export type MessageUser = Pick<User, 'id' | 'displayName'>;

/** One of the newest accounts on the Admin Panel's activity tab (GET /api/admin/activity). */
export type AdminRecentUser = Pick<
  User,
  'id' | 'email' | 'displayName' | 'platformRole' | 'mfaEnabled' | 'createdAt' | 'lastLoginAt'
>;

/**
 * A user as the Admin Panel's user list has them (GET /api/users, admins
 * only): when the account's sign-in lock ends, or null when it is not locked.
 * Absent on a user from any other route.
 */
export interface AdminListedUser extends User {
  signInLockedUntil?: string | null;
}

/** One match from the invite picker's search: never an email address. */
export type InvitableUser = Pick<User, 'id' | 'displayName' | 'avatarUrl'>;

/** GET /api/campaigns/:campaignId/invitable-users: at most 20 matches, and whether there were more. */
export interface InvitableUserSearch {
  users: InvitableUser[];
  hasMore: boolean;
}

/**
 * A shareable starter sheet. Visible to everyone; editable by its author, an
 * admin, or a user with `templateEditor`.
 *
 * Distinct from the hardcoded starter presets served by
 * `/api/characters/templates/:system/:name`, which are compiled into the
 * backend rather than stored as rows.
 */
export interface CharacterTemplate {
  id: string;
  name: string;
  description: string | null;
  gameSystem: GameSystem | null;
  /** Always a GLOBAL asset — a template is readable by everyone, so its image must be too. */
  tokenImageUrl: string | null;
  data: unknown;
  createdById: string | null;
  createdBy: { id: string; displayName: string } | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A template as the list sends it: everything but the sheet, which
 * GET /api/character-templates/:id serves.
 */
export type CharacterTemplateSummary = Omit<CharacterTemplate, 'data'>;

// ============================================
// Admin Types
// ============================================

export interface AssetTypeStat {
  type: string;
  count: number;
  sizeBytes: number;
}

/** GET /api/admin/health: whether each part of the server is working. */
export interface AdminHealth {
  status: 'healthy' | 'degraded';
  services: { api: 'ok'; database: 'ok' | 'error'; websocket: 'ok' | 'error' };
  /** Live connections open now. */
  connections: number;
}

/** How full the disk holding the uploads folder is (GET /api/admin/stats). */
export interface UploadsDisk {
  totalBytes: number;
  /** What the server can still write. */
  freeBytes: number;
  /** Whole percent used, as `df` counts it. */
  usedPercent: number;
  /** More than 80% full. */
  warning: boolean;
}

export interface SystemStats {
  userCount: number;
  campaignCount: number;
  activeCampaignCount: number;
  totalStorageBytes: number;
  activeSessionCount: number;
  sessionCount: number;
  characterCount: number;
  mapCount: number;
  assetBreakdown: AssetTypeStat[];
  /** Null when the server could not read the disk. */
  uploadsDisk?: UploadsDisk | null;
}

export interface AdminSystemSettings {
  id: string;
  instanceName: string;
  timezone: string;
  allowRegistration: boolean;
  requireAdminApproval: boolean;
  themeId: string;
  customThemeColors: Record<string, string> | null;
  fontId: string;
  customLogoUrl: string | null;
  customFaviconUrl: string | null;
  customMascotUrl: string | null;
}

export interface AppearanceSettings {
  /** The instance's name, which the browser tab shows. */
  instanceName: string;
  themeId: string;
  customThemeColors: Record<string, string> | null;
  fontId: string;
  customLogoUrl: string | null;
  customFaviconUrl: string | null;
  customMascotUrl: string | null;
}

export interface AdminActivitySession {
  id: string;
  sessionNumber: number;
  startedAt: string;
  endedAt: string | null;
  campaign: { id: string; name: string };
}

export interface AdminOnlineUser {
  id: string;
  email: string;
  displayName: string;
  platformRole: PlatformRole;
  lastLoginAt: string | null;
  sessionExpiry: string | null;
}

export interface AdminSystemLog {
  id: string;
  level: string;
  message: string;
  /** The administrator who acted; null for the instance's own lines. */
  userId: string | null;
  /** That administrator's account as it is now; null when there is none, or it has been deleted. */
  actor: { id: string; email: string; displayName: string } | null;
  context: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminActivityData {
  recentUsers: AdminRecentUser[];
  recentSessions: AdminActivitySession[];
  onlineUsers: AdminOnlineUser[];
  recentLogs: AdminSystemLog[];
}

// ============================================
// Public Server Config
// ============================================

/** Upload limits in bytes, keyed by asset type — served by GET /api/config. */
/**
 * The limits a self-hoster can set, one per MAX_<TYPE>_SIZE_MB variable. The
 * same shape comes back from GET /api/config and GET /api/admin/config, so it
 * is declared once here. OTHER is not uploadable and is never reported.
 */
export interface ServerUploadLimits {
  MAP: number;
  TOKEN: number;
  AUDIO: number;
  AVATAR: number;
  DOCUMENT: number;
}

export interface ServerConfig {
  uploadLimits: ServerUploadLimits;
  maxUploadBytes: number;
  /**
   * Whether this instance can send email at all. A bare boolean — the SMTP
   * host, port and credentials stay on the admin-only config endpoint. Used to
   * disable the "also email them" option on a campaign invitation rather than
   * offering something that would silently do nothing.
   */
  smtp?: { configured: boolean };
}

// ============================================
// Admin Types (extended)
// ============================================

export interface AdminServerConfig {
  uploadLimits: ServerUploadLimits;
  sessionTimeoutMs: number;
  rememberMeTimeoutMs: number;
  smtp: {
    configured: boolean;
    host: string | null;
    port: number;
    user: string | null;
    secure: boolean;
  };
}

export interface AdminBackup {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

/** A file in the uploads folder that no asset names (GET /api/admin/orphaned-files). */
export interface OrphanedFile {
  /** Relative to the uploads folder. */
  path: string;
  size: number;
  modifiedAt: string;
}

export interface OrphanedFilesReport {
  /** At most 5,000, sorted by path; `total` counts them all. */
  files: OrphanedFile[];
  total: number;
  totalBytes: number;
  /** Files no asset names that changed too recently to judge, and are not listed. */
  recent: number;
  minimumAgeMinutes: number;
}

export interface OrphanedFilesDeletion {
  deleted: string[];
  /** Named, but not a leftover file by the time of the delete. */
  skipped: string[];
  failed: string[];
}

export interface AuthResponse {
  message: string;
  user: User;
  mustChangePassword?: boolean;
  pendingApproval?: boolean;
}

export interface MFARequiredResponse {
  mfaRequired: true;
  message: string;
}

export interface MFASetupResponse {
  message: string;
  qrCodeUrl: string;
  secret: string;
}

export interface MFAVerifyResponse {
  message: string;
  backupCodes: string[];
}

export interface MFALoginResponse {
  message: string;
  user: User;
  mustChangePassword?: boolean;
  backupCodeUsed?: boolean;
  remainingBackupCodes?: number;
  warning?: string;
}

// ============================================
// Campaign
// ============================================

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  gameSystem: GameSystem | null;
  status: CampaignStatus;
  currentMapId: string | null;
  vibeSettings: VibeSettings;
  currentVibe: string | null;
  spiritLayerEnabled: boolean;
  spiritLayerStyle: string;
  chatCooldownEnabled: boolean;
  chatCooldownSeconds: number;
  /** When true, players share their explored areas with the party (union of all explored cells). */
  fogShareExploredWithParty?: boolean;
  /** Character IDs excluded from party vision merge (e.g., familiars, scouts). */
  fogShareExcludedCharacterIds?: string[];
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string | null;
  memberships?: CampaignMembership[];
  /**
   * The requesting user's role in this campaign.
   *
   * Sent by `GET /campaigns` and `GET /campaigns/:id` (see `userRole: m.role`
   * in backend/src/routes/campaigns.ts), but it was missing from this interface
   * — code that needed it annotated the value as `any` to get at it, which is
   * how the omission survived.
   */
  userRole?: CampaignRole;
  /**
   * NOTE: from `GET /campaigns/:id` these are METADATA ONLY — the
   * `tokens`/`wallSegments`/`fogData`/`lights`/`annotations` map blobs and the
   * character `data` sheet are NOT included. Fetch the active map via
   * `GET /maps/:id` and a full sheet via `GET /characters/:id`. The types stay
   * full because those endpoints return full objects; do not read the omitted
   * fields off these embedded arrays.
   */
  maps?: CampaignMap[];
  characters?: Character[];
  /** Most recent open (non-ended) session, if any — populated by GET /campaigns/:id */
  activeSession?: { id: string; sessionNumber: number; startedAt: string } | null;
}

export interface VibeSettings {
  /** The server treats a missing flag as on, for settings saved before it existed. */
  enabled?: boolean;
  periods: VibePeriod[];
  [key: string]: unknown;
}

export interface VibePeriod {
  name: string;
  hue: string;
  filter: string;
  audio?: string | null;
}

export interface CampaignMembership {
  id: string;
  userId: string;
  campaignId: string;
  role: CampaignRole;
  characterIds: string[];
  joinedAt: string;
  user?: MemberUser;
}

export interface CampaignInvitation {
  id: string;
  campaignId: string;
  userId: string;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string | null;
  campaign?: {
    id: string;
    name: string;
    description: string | null;
    gameSystem: GameSystem | null;
    status: CampaignStatus;
    owner?: {
      displayName: string;
    };
    /** The member who runs the game, which is not the owner once it is handed over. */
    dm?: {
      displayName: string;
    } | null;
  };
}

/** An invitation as the campaign's DM lists them. */
export interface CampaignInvitationSummary {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string | null;
  user: { displayName: string };
}

// ============================================
// Session
// ============================================

export interface Session {
  id: string;
  campaignId: string;
  sessionNumber: number;
  startedAt: string;
  endedAt: string | null;
  savedState: SessionState | null;
  notes: string | null;
}

/**
 * One of the caller's own notes, as the list returns it.
 *
 * No `content`: a note runs to tens of thousands of characters and the list
 * would otherwise move megabytes every time the panel opened. The body arrives
 * from `getNote`, one note at a time.
 */
export interface PersonalNoteSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A document as it appears in a campaign's shared list.
 *
 * `id` is the asset id, used with the document serving route. A document is
 * private to whoever uploaded it until a DM shares it with a campaign; this is
 * the shape the list of shared documents comes back in.
 */
export interface CampaignDocument {
  id: string;
  name: string;
  description: string | null;
  /** The stored file's name, whose extension the document is served by. */
  filename: string;
  originalName: string;
  /** As declared at upload. Not what the file is served as. */
  mimeType: string;
  fileSize: number;
  createdAt: string;
  /** Null once the uploader's account is deleted. */
  uploadedBy: { id: string; displayName: string } | null;
  linkedAt: string;
  /**
   * Who shared it. For the campaign's own document this is its uploader, so it
   * is null once that account is deleted, as uploadedBy is.
   */
  linkedBy: { id: string; displayName: string } | null;
  /**
   * True when shared into the campaign by link, which the DM can undo. False
   * when it is the campaign's own document, created or uploaded at CAMPAIGN
   * scope, where there is no link to remove.
   */
  shared: boolean;
  /**
   * Whether the server will take an edit of its text from the signed-in
   * user, by the rule for deleting it. Offer Edit on this alone.
   */
  canEdit: boolean;
}

/**
 * A saved dice roll, shown as a button in the dice panel.
 *
 * Private to whoever saved it and scoped to one campaign, so a table's homebrew
 * rolls do not follow you into an unrelated game. The expression is checked when
 * it is saved against the code that rolls it, so a stored macro can always be
 * rolled.
 */
export interface DiceMacro {
  id: string;
  userId: string;
  campaignId: string;
  name: string;
  expression: string;
  createdAt: string;
  updatedAt: string;
}

/** A note with its Markdown source. */
export interface PersonalNote extends PersonalNoteSummary {
  content: string;
}

/**
 * A campaign the caller is no longer in and still has notes or dice macros
 * in (GET /api/campaigns/left). Notes are titles only, newest edit first.
 */
export interface LeftCampaignSummary {
  id: string;
  name: string;
  notes: PersonalNoteSummary[];
  macros: DiceMacro[];
}

/**
 * One campaign the caller has left (GET /api/campaigns/left/:campaignId):
 * note titles, newest edit first, and macros. A note's text comes from
 * GET /api/campaigns/left/:campaignId/notes/:noteId, one note at a time, or
 * from GET /api/campaigns/left/:campaignId/notes, all of them in one answer.
 */
export interface LeftCampaignDetail {
  campaign: { id: string; name: string };
  notes: PersonalNoteSummary[];
  macros: DiceMacro[];
}

// ============================================
// Rulebook Types
// ============================================

export interface Rulebook {
  id: string;
  campaignId: string;
  title: string;
  sourceId: string;
  edition: string;
  filePath: string;
  thumbnailPath: string | null;
  status: RulebookStatus;
  totalPages: number | null;
  processedPages: number;
  uploadedById: string;
  uploadedBy: { id: string; displayName: string };
  createdAt: string;
  updatedAt: string;
  chunks?: RulebookChunk[];
  activations?: RulebookActivation[];
  _count?: { chunks: number; activations: number };
}

export interface RulebookChunk {
  id: string;
  rulebookId: string;
  pageStart: number;
  pageEnd: number;
  contentType: ChunkType;
  rawText: string;
  structured: unknown | null;
  confidence: number;
  createdAt: string;
}

export interface RulebookActivation {
  id: string;
  campaignId: string;
  rulebookId: string;
  contentType: ChunkType | null;
  sourceIds: string[];
  activatedById: string;
  activatedBy: { id: string; displayName: string };
  activatedAt: string;
  rulebook?: Rulebook;
}

export interface ExtractedContent {
  id: string;
  contentType: ChunkType;
  sourceId: string;
  name: string;
  data: unknown;
  rawText: string;
  pageRef: string;
  license: LicenseType;
  createdAt: string;
  updatedAt: string;
}

export interface RulebookProcessingStatus {
  rulebookId: string;
  status: RulebookStatus;
  processedPages: number;
  totalPages: number;
  currentStep: string;
  error?: string;
}

export interface RulebookUploadMetadata {
  title: string;
  sourceId: string;
  edition: string;
  campaignId: string;
}

export interface CreateRulebookActivationInput {
  rulebookId: string;
  contentType?: ChunkType;
  sourceIds?: string[];
}

export interface UpdateRulebookActivationInput {
  contentType?: ChunkType;
  sourceIds?: string[];
}

/**
 * A past session as the history list returns it.
 *
 * Deliberately without `savedState`: that is a large blob of token positions
 * kept for resuming a session, and the server does not send it here.
 */
export interface SessionSummary {
  id: string;
  sessionNumber: number;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
}

export interface SessionState {
  sessionId: string;
  savedAt: string;
  mapId: string;
  tokens: Token[];
  spiritLayerVisible: boolean;
  currentVibe: string;
  annotations: Annotation[];
}

// ============================================
// Character
// ============================================

export interface Character {
  id: string;
  userId: string;
  campaignId: string | null;
  gameSystem: GameSystem | null;
  name: string;
  data: CharacterData;
  tokenImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * The owner, as GET /api/characters/:id gives it to anyone who may read the
   * character. Absent from every other response, live updates included.
   */
  user?: { id: string; displayName: string; avatarUrl: string | null };
}

/**
 * A character as GET /api/characters lists it: everything but the sheet,
 * which GET /api/characters/:id serves, plus the campaign it is in.
 */
export type CharacterSummary = Omit<Character, 'data'> & {
  campaign?: { id: string; name: string } | null;
};

/**
 * Character data union type - supports all game systems
 * Import specific types from './game-systems' for type-safe access
 */
export type CharacterData =
  | import('./game-systems').DnD5eCharacterData
  | import('./game-systems').PF2eCharacterData
  | import('./game-systems').SR6CharacterData
  | import('./game-systems').CoC7eCharacterData
  // A character with no game system stores a flexible sheet here. The union
  // omitted it, so `Character.data` never admitted a shape it demonstrably
  // holds — invisible while the flexible editor's props were `any`.
  | import('./flexible-character-sheet').FlexibleCharacterData;

// ============================================
// Map & Tokens
// ============================================

export interface CampaignMap {
  id: string;
  campaignId: string;
  name: string;
  imageUrl: string;
  baseLayerUrl: string;
  spiritLayerUrl: string | null;
  width: number;
  height: number;
  gridSize: number;
  feetPerSquare: number;
  diagonalRule: 'flat' | 'alternating';
  tokens: Token[];
  annotations: Annotation[];
  wallSegments?: import('./walls').WallSegment[];
  fogData?: import('./walls').FogState | null;
  lightingEnabled?: boolean;
  /** Manual fog of war on this map. Absent on older payloads means on. */
  fogEnabled?: boolean;
  /** Everything in line of sight is lit. Absent on older payloads means on. */
  globalIllumination?: boolean;
  /** Explored areas are remembered per player. Absent on older payloads means on. */
  explorationEnabled?: boolean;
  lights?: import('./walls').LightSource[];
  createdAt: string;
  updatedAt: string;
}

export interface Token {
  id: string;
  characterId: string | null;
  name: string;
  imageUrl: string;
  position: Position;
  size: Size;
  layer: TokenLayer;
  visible: boolean;
  controlledBy: string | null;
  rotation: number;
  conditions: string[];
  metadata: Record<string, unknown>;
  // Token type system
  type:        TokenType;
  disposition: TokenDisposition | null;
  hp:          TokenHp | null;
  showHpBar:   boolean;
  /** The DM's notes. Never sent to players (tokenSentTo), so absent for them. */
  notes?:      string | null;
  initiative:  number | null;
  /**
   * Darkvision, in grid squares: how far the token makes things out with no
   * light (0 = none; 12 = 60 ft at 5 ft a square). It never limits how far a lit thing can be
   * noticed. Decides what the server sends, so only the DM may change it.
   */
  sightRadius?: number;
  /** Display mode: pog (circular + border), top-down (circular, no border), full-art (rectangular, alpha). Default: pog */
  displayMode?: TokenDisplayMode;
  /** NPC stat block — populated when placing from creature library or entered manually. */
  statBlock?: NpcStatBlock | null;
  /** ID of the creature template this token was created from (if any). */
  creatureTemplateId?: string | null;
  /**
   * The DM has hidden what this token is. Players who do not control it are
   * sent it with its identity masked (utils/tokenMask.ts); only the DM may set it.
   */
  obscured?: boolean;
  // Movement data (Phase 6)
  movement?: TokenMovementData;
}

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Annotation {
  id: string;
  type: 'circle' | 'line' | 'rectangle' | 'polygon';
  position: Position;
  color: string;
  [key: string]: unknown;
}

/**
 * One member of a campaign roster, from `GET /campaigns/:id/characters`.
 *
 * The characters here are deliberately not `Character`: the endpoint strips the
 * `data` sheet and returns a derived `hp` in its place, so that no campaign
 * member can read another player's sheet off the roster.
 */
export interface RosterMember {
  userId: string;
  userName: string;
  userAvatar: string | null;
  role: CampaignRole;
  joinedAt: string;
  characters: {
    id: string;
    name: string;
    tokenImageUrl: string | null;
    gameSystem: GameSystem | null;
    userId: string;
    hp: CharacterHpInfo | null;
  }[];
}

// ============================================
// Asset
// ============================================

/**
 * A campaign that stops an account being deleted: its owner is its DM. An
 * admin clears it by handing the DM seat to one of `members`, or deleting it.
 */
export interface DeletionBlocker {
  id: string;
  name: string;
  members: { userId: string; displayName: string; role: string }[];
}

export interface Asset {
  id: string;
  type: AssetType;
  scope: AssetScope;
  /**
   * Null once the uploader's account is deleted, on the files that outlive it:
   * campaign and global uploads, and personal files something still uses. The
   * avatar and the personal files nothing uses are deleted with the account.
   */
  uploadedById: string | null;
  campaignId: string | null;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  name: string;
  description: string | null;
  tags: string[];
  createdAt: string;
  /** Populated by backend include — available in list responses */
  uploadedBy?: { id: string; displayName: string } | null;
  campaign?: { id: string; name: string } | null;
  /**
   * In the asset list only: whether the server will let this user delete the
   * asset, move it out of its scope, or rewrite it if it is a text document,
   * by the rule those routes apply.
   */
  canChange?: boolean;
}

/** What kind of record uses an asset. */
export type AssetUseKind =
  | 'map'
  | 'token'
  | 'character'
  | 'characterTemplate'
  | 'creature'
  | 'tokenTemplate'
  | 'campaignSetting'
  | 'vibePeriod';

/**
 * One place an asset is used, from the server's refusal to delete it. `name`
 * and the campaign are null where the viewer may not see the record, and then
 * `count` is how many of that kind are folded into the entry. For a map's
 * tokens `count` is how many tokens carry the picture.
 */
export interface AssetUse {
  kind: AssetUseKind;
  name: string | null;
  campaignId: string | null;
  campaignName: string | null;
  count: number;
}

export interface AssetListResponse {
  assets: Asset[];
  pagination: Pagination;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ============================================
// Message & Chat
// ============================================

export interface Message {
  id: string;
  campaignId: string;
  userId: string | null;
  user?: MessageUser;
  type: MessageType;
  content: string;
  metadata: MessageMetadata | null;
  createdAt: string;
}

export interface MessageMetadata {
  /**
   * Free-form per-message payload — a dice breakdown, a `user.joined` action,
   * whatever the sender attached. `unknown` rather than `any` so a reader has to
   * check what it found before using it; the shape genuinely varies by message
   * type and is not worth a discriminated union while only a few types set it.
   */
  [key: string]: unknown;
}

// ============================================
// Dice Roll
// ============================================

export interface DiceRoll {
  id: string;
  campaignId: string;
  /** Null once the roller's account is deleted. */
  userId: string | null;
  expression: string;
  result: number;
  breakdown: DiceRollBreakdown;
  characterName: string | null;
  purpose: string | null;
  rolledAt: string;
}

export interface DiceRollBreakdown {
  expression: string;
  rolls: DiceRollDetail[];
  total: number;
  formula: string;
}

export interface DiceRollDetail {
  type: 'dice' | 'modifier';
  notation?: string;
  count?: number;
  sides?: number;
  results?: number[];
  total?: number;
  kept?: number[];
  value?: number;
}

// ============================================
// Campaign Export/Import
// ============================================

export interface CampaignImportPreview {
  formatVersion: number;
  exportedAt: string;
  exportedFrom: string;
  campaignName: string;
  gameSystem: string;
  mapCount: number;
  tokenCount: number;
  creatureCount: number;
  tokenTemplateCount: number;
  assetCount: number;
  includesAudio: boolean;
  totalSizeBytes: number;
}

/** Something a campaign import left out, and why. */
export interface CampaignImportSkipped {
  kind: 'map' | 'token' | 'creature' | 'tokenTemplate' | 'asset';
  name: string;
  reason: string;
}

export interface CampaignImportResult {
  campaignId: string;
  campaignName: string;
  /** What was created, which may be fewer than the archive held. */
  mapCount: number;
  tokenCount: number;
  creatureCount: number;
  tokenTemplateCount: number;
  /** What was imported in a changed form, in words. */
  warnings: string[];
  /** What was left out, and why. */
  skipped: CampaignImportSkipped[];
}

// ============================================
// API Request/Response Types
// ============================================

export interface ApiError {
  error: string;
  message: string;
}

export interface ApiResponse<T = unknown> {
  message?: string;
  data?: T;
  [key: string]: unknown;
}

// Login
export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

// Register
export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

// MFA Verify
export interface MFAVerifyRequest {
  token: string;
}

export interface MFALoginVerifyRequest {
  token?: string;
  backupCode?: string;
}

// Password Reset
export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// Campaign
export interface CreateCampaignRequest {
  name: string;
  gameSystem?: GameSystem;
  description?: string;
}

export interface UpdateCampaignRequest {
  name?: string;
  gameSystem?: GameSystem | null;
  /** null clears it. */
  description?: string | null;
  status?: CampaignStatus;
  vibeSettings?: VibeSettings;
  spiritLayerEnabled?: boolean;
  spiritLayerStyle?: string;
  chatCooldownEnabled?: boolean;
  chatCooldownSeconds?: number;
}

// Character
export interface CreateCharacterRequest {
  name: string;
  data?: CharacterData;
  tokenImageUrl?: string;
  gameSystem?: GameSystem | null;
  campaignId?: string;
}

export interface UpdateCharacterRequest {
  name?: string;
  data?: CharacterData;
  tokenImageUrl?: string;
  /**
   * The character's `updatedAt` as the sheet was loaded. The server refuses the
   * save with 409 if the character has changed since.
   */
  updatedAt?: string;
}

// Map
export interface CreateMapRequest {
  name: string;
  imageUrl: string;
  width: number;
  height: number;
  gridSize?: number;
  feetPerSquare?: number;
  diagonalRule?: 'flat' | 'alternating';
  spiritLayerUrl?: string;
}

export interface UpdateMapRequest {
  name?: string;
  width?: number;
  height?: number;
  gridSize?: number;
  feetPerSquare?: number;
  diagonalRule?: 'flat' | 'alternating';
  imageUrl?: string;
  spiritLayerUrl?: string | null;
  lightingEnabled?: boolean;
  fogEnabled?: boolean;
  globalIllumination?: boolean;
  explorationEnabled?: boolean;
}

// Token
export interface CreateTokenRequest {
  characterId?: string | null;
  name: string;
  imageUrl: string;
  position: Position;
  size?: Size;
  layer?: TokenLayer;
  visible?: boolean;
  controlledBy?: string | null;
  rotation?: number;
  conditions?: string[];
  metadata?: Record<string, unknown>;
  // Token type system
  type?: TokenType;
  disposition?: TokenDisposition | null;
  hp?: TokenHp | null;
  showHpBar?: boolean;
  notes?: string | null;
  initiative?: number | null;
  /** Darkvision in grid squares; 0 = none. DM only on update. */
  sightRadius?: number | null;
  /** Display mode: pog, top-down or full-art. Default: pog */
  displayMode?: TokenDisplayMode;
  /** NPC stat block, when placing from the creature library or moving a token that has one. */
  statBlock?: NpcStatBlock | null;
  /** The creature template this token came from, if any. */
  creatureTemplateId?: string | null;
  /** DM only: hide what the token is from players who do not control it. */
  obscured?: boolean;
  // Movement data (Phase 6)
  movement?: TokenMovementData;
}

export interface UpdateTokenRequest {
  name?: string;
  imageUrl?: string;
  position?: Position;
  size?: Size;
  layer?: TokenLayer;
  visible?: boolean;
  controlledBy?: string | null;
  rotation?: number;
  conditions?: string[];
  metadata?: Record<string, unknown>;
  // Token type system
  type?: TokenType;
  disposition?: TokenDisposition | null;
  hp?: TokenHp | null;
  showHpBar?: boolean;
  notes?: string;
  initiative?: number | null;
  /** Darkvision in grid squares; 0 = none. DM only on update. */
  sightRadius?: number | null;
  displayMode?: TokenDisplayMode;
  statBlock?: NpcStatBlock | null;
  creatureTemplateId?: string | null;
  /** DM only: hide what the token is from players who do not control it. */
  obscured?: boolean;
  // Movement data (Phase 6)
  movement?: Partial<TokenMovementData>;
}

// ============================================
// WebSocket Event Types
// ============================================

export interface WebSocketEvent<T = unknown> {
  type: string;
  data: T;
  timestamp: string;
}

// Token Movement Events
export interface TokenMoveStartEvent {
  tokenId: string;
  mapId: string; // Required - server validates map belongs to authenticated campaign
}

export interface TokenMoveEvent {
  tokenId: string;
  mapId: string; // Required - server validates map belongs to authenticated campaign
  x: number;
  y: number;
}

export interface TokenMoveEndEvent {
  tokenId: string;
  mapId: string; // Required - server validates map belongs to authenticated campaign
  x: number;
  y: number;
}

// Movement System Events (Phase 6)
export interface MovementReachableRequest {
  tokenId: string;
  mapId: string;
  speed?: number; // Override speed
  movementMode?: MovementMode;
  ignoreTerrain?: boolean; // DM override
}

export interface MovementReachableResponse {
  tokenId: string;
  reachable: ReachableSquare[];
  speedUsed: number;
  movementMode: MovementMode;
}

export interface MovementCommitRequest {
  tokenId: string;
  mapId: string;
  path: { x: number; y: number }[]; // Path taken
  endPosition: { x: number; y: number };
  speedUsed: number;
  movementMode: MovementMode;
  opportunityAttacks?: OpportunityAttackTrigger[];
}

export interface OpportunityAttackTrigger {
  enemyTokenId: string;
  enemyName: string;
  enemyReach: number;
  attackBonus: number;
  squareLeft: { x: number; y: number }; // Square that provoked
}

export interface MovementCommitResponse {
  success: boolean;
  opportunityAttacks?: OpportunityAttackTrigger[];
  message?: string;
}

export interface ReactionPromptEvent {
  promptId: string;
  targetTokenId: string; // Token being moved
  attackerTokenId: string;
  attackerName: string;
  attackBonus: number;
  reach: number;
  squareLeft: { x: number; y: number };
  expiresAt: string; // ISO timestamp
}

export interface ReactionResponse {
  promptId: string;
  action: 'take' | 'decline';
  attackRoll?: { expression: string; result: number }; // If taking AoO
}

export interface MovementCancelledEvent {
  tokenId: string;
  mapId: string;
  startPosition: { x: number; y: number };
}

export interface MovementModeChangeEvent {
  tokenId: string;
  mapId: string;
  movementMode: MovementMode;
}

export interface DMOverrideMovementEvent {
  tokenId: string;
  mapId: string;
  type: 'teleport' | 'grant_extra' | 'ignore_terrain' | 'force_move' | 'reset';
  value?: number; // For grant_extra
  position?: { x: number; y: number }; // For teleport/force_move
  ignoreTerrain?: boolean;
}

export interface MovementHistoryEntry {
  id: string;
  tokenId: string;
  tokenName: string;
  mapId: string;
  startPosition: { x: number; y: number };
  endPosition: { x: number; y: number };
  path: { x: number; y: number }[];
  distance: number;
  movementMode: MovementMode;
  opportunityAttacks: Array<{
    enemyTokenId: string;
    enemyName: string;
    hit: boolean;
    damage?: number;
    stoppedMovement: boolean;
  }>;
  dmOverrides: string[];
  movedById: string;
  movedByName: string;
  createdAt: string;
}

export interface TokenMovedEvent {
  tokenId: string;
  x: number;
  y: number;
  /** Null for anyone but the DM and the mover while the token is obscured. */
  movedBy: string | null;
  /**
   * Set on a frame of a drag still in progress; absent on the drop. A frame is
   * where the token is being carried, not where it stands.
   */
  dragging?: true;
}

// Dice Roll Events
export interface DiceRollEvent {
  expression: string;
  characterName?: string;
  purpose?: string;
  secret?: boolean;
}

/** The server's answer to a `dice.roll` sent with an acknowledgement: the stored roll's id, or why not. */
export type DiceRollAck = { ok: true; id: string } | { ok: false; error: string };

/** The server's answer to a request that returns nothing but whether it was done. */
export type DoneAck = { ok: true } | { ok: false; error: string };

export interface DiceRolledEvent {
  /**
   * The stored roll's id. Optional because a roll made while the session is
   * paused is evaluated in the browser and never reaches the server, so it has
   * no database row — see DiceRoller's local-roll path. Everything else, live
   * or replayed from history, carries one and dedupes on it.
   */
  id?: string;
  /** Null for a roll whose roller has since deleted their account. */
  userId: string | null;
  userName: string | null;
  characterName: string | null;
  expression: string;
  result: number;
  breakdown: DiceRollBreakdown;
  purpose: string | null;
  timestamp: string;
  secret?: boolean;
}

export interface DiceRolledSecretEvent extends DiceRolledEvent {
  originalRoller: string;
  isAuditView: boolean;
}

// Chat Events
export interface ChatMessageEvent {
  content: string;
  type: MessageType;
  /**
   * The sender's own name for the message, 1 to 64 letters, digits, hyphens
   * or underscores. It comes back on the sender's copy of the broadcast, and
   * a message resent with it is stored and sent once.
   */
  clientId?: string;
}

/** The server's answer to a `chat.message` sent with an acknowledgement. */
export type ChatMessageAck = { ok: true; id: string } | { ok: false; error: string };

/**
 * A system notice. The server sends the row's real id, which is what lets a
 * notice received live be recognised as the same message when history replays
 * it — see ChatPanel's merge.
 */
export interface ChatSystemBroadcast {
  id: string;
  content: string;
  metadata?: MessageMetadata;
  timestamp: string;
}

export interface ChatMessageBroadcast {
  id: string;
  userId: string;
  userName: string;
  content: string;
  type: MessageType;
  timestamp: string;
  /** On the sender's own copy only: the `clientId` it was sent with. */
  clientId?: string;
}

// Session Events
export interface SessionStartedBroadcast {
  sessionId: string;
  sessionNumber: number;
  startedAt: string;
}

export interface SessionPausedBroadcast {
  sessionId: string;
  sessionNumber: number;
}

export interface SessionEndedBroadcast {
  sessionId: string;
  sessionNumber: number;
}

export interface SessionResumedBroadcast {
  sessionId: string;
  sessionNumber: number;
  startedAt: string;
}

// Vibe Events
export interface VibeUpdateEvent {
  period: string;
}

export interface VibeUpdatedBroadcast {
  period: string;
  hue: string;
  filter: string;
  audio?: string;
}

/** The DM saved the vibe periods: the periods as saved, and the vibe they leave in force. */
export interface VibeSettingsUpdatedBroadcast {
  campaignId: string;
  vibeSettings: VibeSettings;
  currentVibe: string | null;
  updatedBy: string;
  timestamp: string;
}

/** The DM saved Campaign Settings (`campaign.settings.updated`): the fields every member's page shows. */
export interface CampaignSettingsUpdatedBroadcast {
  campaignId: string;
  name: string;
  description: string | null;
  gameSystem: GameSystem | null;
  chatCooldownEnabled: boolean;
  chatCooldownSeconds: number;
}

// Atmosphere Events
export interface AtmosphereEffectSetEvent {
  effect: string | null;
}

export interface AtmosphereEffectUpdatedBroadcast {
  effect: string | null;
  setBy: string;
  timestamp: string;
}

export interface AtmosphereAudioSetEvent {
  assetId: string | null;
  volume?: number;
  loop?: boolean;
}

export interface AtmosphereAudioUpdatedBroadcast {
  assetId: string | null;
  audioUrl: string | null;
  volume: number;
  loop: boolean;
  setBy: string;
  timestamp: string;
}

// Spirit Layer Events
export interface SpiritLayerToggleEvent {
  visible: boolean;
}

export interface SpiritLayerToggledBroadcast {
  visible: boolean;
  toggledBy: string;
  timestamp: string;
}

export interface SpiritLayerTokenToggledBroadcast {
  mapId: string;
  tokenId: string;
  visible: boolean;
  token?: Token; // Present when visible=true or for DM; minimal data when hidden
  toggledBy: string;
  timestamp: string;
}

// ============================================
// Character HP Events
// ============================================

/** Where a page of chat history stopped, and whether there is more behind it. */
export interface MessagePageInfo {
  limit: number;
  hasMore: boolean;
  /** Send back as `cursor` for the page before this one. Opaque — do not build one. */
  nextCursor: string | null;
}

export interface MessageHistoryPage {
  messages: Message[];
  pagination: MessagePageInfo;
}

export interface HitDiceSpendEvent {
  characterId: string;
  /** Which pool it comes out of — a multiclass character has several. */
  index: number;
}

export interface CharacterHpUpdateEvent {
  characterId: string;
  delta: number;
}

export interface CharacterHpUpdatedBroadcast {
  characterId: string;
  hp: { current: number; max: number; temp: number };
}

/**
 * The DM seat moved to another member. Campaign ownership is a separate thing
 * and does not move with it.
 */
/** Why a connection lost its campaign, as `campaign.access.revoked` says. */
export type AccessRevokedReason = 'removed' | 'campaign-deleted' | 'signed-out';

/**
 * `campaign.access.revoked`: this connection may no longer use its campaign.
 * Declared on the server too (websocket/utils.ts); keepInStep.test.ts there
 * fails if the two differ.
 */
export interface AccessRevoked {
  /** The campaign the connection was in, or null when it had not joined one. */
  campaignId: string | null;
  reason: AccessRevokedReason;
  /** A sentence for the person, shown as it is. */
  message: string;
}

/** A member's role in a campaign changed (`campaign.role.changed`). */
export interface MemberRoleChangedBroadcast {
  campaignId: string;
  userId: string;
  role: CampaignRole;
}

export interface DmTransferredBroadcast {
  campaignId: string;
  /** Null only if the campaign somehow had no DM to demote. */
  previousDmId: string | null;
  newDmId: string;
}

// ============================================
// Initiative Tracker Types
// ============================================

export interface CombatantEntry {
  tokenId: string;
  /** The map the token is on; the server always sends it. */
  mapId: string;
  name: string;
  imageUrl: string;
  initiative: number | null;
  hp: { current: number; max: number; temp: number } | null;
  type: 'player' | 'npc' | 'object';
  disposition: 'friendly' | 'neutral' | 'hostile' | null;
}

export interface CombatState {
  active: boolean;
  round: number;
  currentTokenId: string | null;
  combatants: CombatantEntry[];
}

export interface InitiativeAddEvent    { tokenId: string; mapId: string; }
export interface InitiativeRemoveEvent { tokenId: string; }
export interface InitiativeSetEvent    { tokenId: string; mapId: string; value: number | null; }
/**
 * `expression` is only a fallback. The server derives initiative from the
 * token's character sheet or stat block, because it is the only side holding
 * either and because some systems (Call of Cthulhu) do not roll for initiative
 * at all. Send one only for a combatant nothing can be derived for.
 */
export interface InitiativeRollEvent   { tokenId: string; mapId: string; expression?: string; characterName?: string; }
export interface InitiativeReorderEvent { orderedTokenIds: string[]; }

// ============================================
// Map Pings — transient "look here" marks
// ============================================

/** Client → server. Coordinates are map pixels, not grid cells. */
export interface MapPingEvent {
  mapId: string;
  x: number;
  y: number;
}

/**
 * Server → all campaign members. Carries only the sender's id — the display
 * name and identity colour are resolved client-side from the roster.
 */
export interface MapPingedBroadcast {
  mapId: string;
  x: number;
  y: number;
  userId: string;
}

// ============================================
// User Preferences (per-user theme + font)
// ============================================

export interface UserPreferences {
  themeId?: string;
  customThemeColors?: {
    primary: string;
    accent: string;
    background: string;
    text: string;
  } | null;
  fontId?: string;
}

// ============================================
// Character Draft Types (Collaborative Editing)
// ============================================

export enum ChangeType {
  PLAYER_EDIT = 'PLAYER_EDIT',
  DM_SUGGESTION = 'DM_SUGGESTION',
  DM_OVERRIDE = 'DM_OVERRIDE',
  DM_LOCK = 'DM_LOCK',
  DM_UNLOCK = 'DM_UNLOCK',
  CONFLICT_RESOLVED = 'CONFLICT_RESOLVED',
  SYSTEM_CORRECTION = 'SYSTEM_CORRECTION',
}

export enum ConflictType {
  INVALID_VALUE = 'INVALID_VALUE',
  MISSING_PREREQUISITE = 'MISSING_PREREQUISITE',
  EXCEEDS_LIMIT = 'EXCEEDS_LIMIT',
  DUPLICATE = 'DUPLICATE',
  INCOMPATIBLE_CHOICES = 'INCOMPATIBLE_CHOICES',
  RULE_VIOLATION = 'RULE_VIOLATION',
}

export enum ConflictSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  BLOCKING = 'BLOCKING',
}

export interface CharacterLock {
  id: string;
  characterId: string;
  fieldPath: string;
  lockedById: string;
  lockedBy: { id: string; displayName: string };
  reason: string | null;
  createdAt: string;
}

export interface CharacterConflict {
  id: string;
  characterId: string;
  fieldPath: string;
  conflictType: ConflictType;
  description: string;
  severity: ConflictSeverity;
  detectedAt: string;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolvedBy: { id: string; displayName: string } | null;
  resolution: string | null;
}

export interface CharacterChange {
  id: string;
  characterId: string;
  fieldPath: string;
  oldValue: unknown;
  newValue: unknown;
  changeType: ChangeType;
  authorId: string;
  author: { id: string; displayName: string };
  resolvedById: string | null;
  resolvedBy: { id: string; displayName: string } | null;
  resolvedAt: string | null;
  note: string | null;
  createdAt: string;
}

export interface CharacterDraftState {
  draft: { data: Record<string, unknown>; version: number };
  locks: CharacterLock[];
  conflicts: CharacterConflict[];
  version: number;
}

// ============================================
// Game System Types
// ============================================

// ============================================
// Action Resolution Types (Phase 4)
// ============================================

export enum ActionType {
  ATTACK_MELEE = 'ATTACK_MELEE',
  ATTACK_RANGED = 'ATTACK_RANGED',
  SPELL_ATTACK = 'SPELL_ATTACK',
  SPELL_SAVE = 'SPELL_SAVE',
  SPELL_AOE = 'SPELL_AOE',
  FEATURE = 'FEATURE',
  ITEM_USE = 'ITEM_USE',
  REACTION = 'REACTION',
  MOVEMENT = 'MOVEMENT',
  OTHER = 'OTHER',
}

export enum ActionCost {
  ACTION = 'ACTION',
  BONUS_ACTION = 'BONUS_ACTION',
  REACTION = 'REACTION',
  FREE = 'FREE',
  MOVEMENT = 'MOVEMENT',
  LEGENDARY = 'LEGENDARY',
  MYTHIC = 'MYTHIC',
}

export enum ActionSource {
  CLASS = 'CLASS',
  SUBCLASS = 'SUBCLASS',
  FEAT = 'FEAT',
  ITEM = 'ITEM',
  RACE = 'RACE',
  BACKGROUND = 'BACKGROUND',
  SPELL = 'SPELL',
  RACIAL = 'RACIAL',
  CLASS_FEATURE = 'CLASS_FEATURE',
  MAGIC_ITEM = 'MAGIC_ITEM',
  OTHER = 'OTHER',
}

export enum ResolutionStatus {
  PREVIEW = 'PREVIEW',
  ROLLING = 'ROLLING',
  DM_REVIEW = 'DM_REVIEW',
  APPLIED = 'APPLIED',
  CANCELLED = 'CANCELLED',
}

export interface CharacterAction {
  id: string;
  characterId: string;
  name: string;
  type: ActionType;
  cost: ActionCost;
  data: Record<string, unknown>;
  source: ActionSource;
  sourceRef: string | null;
  recharge: {
    type: 'SHORT_REST' | 'LONG_REST' | 'TURN_START' | 'CUSTOM';
    value: number;
  } | null;
  used: boolean;
  sortOrder: number;
}

export interface AttackPreview {
  attackRoll: {
    expression: string;
    breakdown: string;
    vsAC?: number;
    advantage?: boolean;
    disadvantage?: boolean;
  };
  damageRoll?: {
    expression: string;
    breakdown: string;
    damageType?: string;
  };
  saveDC?: {
    ability: string;
    dc: number;
    halfOnSuccess: boolean;
  };
  area?: {
    shape: string;
    size: number;
    units: 'feet' | 'squares';
  };
  range?: {
    normal: number;
    long?: number;
    units: 'feet';
  };
  resourceCost?: {
    type: 'spell_slot' | 'charge' | 'use' | 'superiority_dice' | 'ki' | 'channel_divinity';
    amount: number;
    details: string;
  }[];
  conditions?: {
    name: string;
    duration: string;
    saveEnds: boolean;
    saveDC?: number;
  }[];
  description: string;
  warnings?: string[];
}

export interface ActionResolution {
  id: string;
  campaignId: string;
  initiatorId: string;
  targetIds: string[];
  actionId: string | null;
  actionType: ActionType;
  actionData: Record<string, unknown>;
  attackRolls: Array<{
    expression: string;
    result: number;
    breakdown: DiceRollBreakdown;
    vsAC: number;
  }> | null;
  saveRolls: Array<{
    targetId: string;
    expression: string;
    result: number;
    breakdown: DiceRollBreakdown;
    vsDC: number;
    success: boolean;
  }> | null;
  damageRolls: Array<{
    targetId: string;
    expression: string;
    result: number;
    breakdown: DiceRollBreakdown;
    type: string;
    applied: boolean;
  }> | null;
  conditions: Array<{
    targetId: string;
    name: string;
    duration: string;
    saveEnds: boolean;
    saveDC?: number;
  }> | null;
  resources: Array<{
    type: string;
    amount: number;
    details: string;
  }> | null;
  status: ResolutionStatus;
  dmOverride: boolean;
  dmNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolvedBy?: { id: string; displayName: string };
}

export interface ApplyResult {
  success: boolean;
  appliedDamage: AppliedDamage[];
  appliedConditions: AppliedCondition[];
  consumedResources: ConsumedResource[];
  deathSavesTriggered: DeathSaveTrigger[];
  messages: string[];
}

export interface AppliedDamage {
  targetId: string;
  targetName: string;
  damage: number;
  damageType: string;
  previousHP: number;
  newHP: number;
  tempHP: number;
  killed: boolean;
  unconscious: boolean;
}

export interface AppliedCondition {
  targetId: string;
  targetName: string;
  condition: string;
  duration: string;
  saveEnds: boolean;
  saveDC?: number;
  added: boolean;
}

export interface ConsumedResource {
  characterId: string;
  type: 'spell_slot' | 'charge' | 'use' | 'hit_dice' | 'superiority_dice' | 'ki' | 'channel_divinity';
  details: string;
  amount: number;
}

export interface DeathSaveTrigger {
  targetId: string;
  targetName: string;
  reason: 'damage_at_0hp' | 'critical_hit_at_0hp' | 'massive_damage';
  autoFailures: number;
}

// ============================================
// Spell AoE Template Types (Phase 10)
// ============================================

export enum AoEShape {
  CIRCLE = 'CIRCLE',
  CONE = 'CONE',
  LINE = 'LINE',
  CUBE = 'CUBE',
  SPHERE = 'SPHERE',
  CYLINDER = 'CYLINDER',
  HEMISPHERE = 'HEMISPHERE',
  CUSTOM = 'CUSTOM',
}

export type TemplateOrigin = 'intersection' | 'token_center' | 'self';

export interface AoETemplateSize {
  radius?: number;      // Circle, Sphere, Cylinder, Hemisphere (feet)
  length?: number;      // Cone, Line (feet)
  width?: number;       // Line, Wall (feet)
  height?: number;      // Cylinder (feet)
  side?: number;        // Cube (feet)
  points?: Array<{ x: number; y: number }>; // Custom polygon
}

export interface AoETemplate {
  id: string;
  campaignId?: string | null;
  name: string;
  shape: AoEShape;
  size: AoETemplateSize;
  origin: TemplateOrigin;
  gridSnap: boolean;
  color: string;
  isDefault: boolean;
  createdById?: string | null;
  createdAt?: string;
}

export interface SpellAoEData {
  spellId: string;
  spellName: string;
  level: number;
  school?: string;
  template: AoETemplate;
  damage?: { dice: string; type: string };
  save?: { ability: string; dc: number; halfOnSave: boolean };
  conditions?: string[];
  concentration: boolean;
  duration: string;
}

export interface TargetSpellEvaluation {
  tokenId: string;
  tokenName: string;
  tokenX: number;
  tokenY: number;
  tokenSize: number;
  coverageRatio: number; // 0 to 1
  isAffected: boolean;
  saveRoll?: number;
  savePassed?: boolean;
  calculatedDamage: number;
  appliedConditions: string[];
}

export interface SpellCastResolutionData {
  castId: string;
  spellId?: string;
  spellName: string;
  casterTokenId?: string;
  casterName?: string;
  template: AoETemplate;
  placement: {
    originX: number;
    originY: number;
    targetX?: number;
    targetY?: number;
    angle?: number; // radians
  };
  targets: TargetSpellEvaluation[];
  damageRoll?: string;
  baseDamage?: number;
  status: 'PENDING_REVIEW' | 'APPLIED' | 'CANCELLED';
}

// ============================================
// Universal DM Override Types (Phase 11)
// ============================================

export enum OverrideTargetType {
  ROLL = 'ROLL',
  ROLL_BREAKDOWN = 'ROLL_BREAKDOWN',
  HP = 'HP',
  DAMAGE = 'DAMAGE',
  TEMP_HP = 'TEMP_HP',
  DEATH_SAVES = 'DEATH_SAVES',
  CONDITIONS = 'CONDITIONS',
  POSITION = 'POSITION',
  MOVEMENT = 'MOVEMENT',
  REACHABLE_AREA = 'REACHABLE_AREA',
  INITIATIVE = 'INITIATIVE',
  TURN_ORDER = 'TURN_ORDER',
  REACTION = 'REACTION',
  ACTION_RESOLUTION = 'ACTION_RESOLUTION',
  SPELL_SLOTS = 'SPELL_SLOTS',
  CHARGES = 'CHARGES',
  HIT_DICE = 'HIT_DICE',
  SUPERIORITY_DICE = 'SUPERIORITY_DICE',
  KI_POINTS = 'KI_POINTS',
  CHANNEL_DIVINITY = 'CHANNEL_DIVINITY',
  FOG = 'FOG',
  LIGHT = 'LIGHT',
  WALLS = 'WALLS',
  DOORS = 'DOORS',
  TERRAIN = 'TERRAIN',
  NARRATIVE = 'NARRATIVE',
  CHAT = 'CHAT',
}

export enum OverrideVisibility {
  DM_ONLY = 'DM_ONLY',
  DM_AND_PLAYERS = 'DM_AND_PLAYERS',
  TABLE = 'TABLE',
}

export interface DMOverride {
  id: string;
  campaignId: string;
  targetType: OverrideTargetType;
  targetId: string;
  fieldPath: string;
  previousValue: unknown;
  newValue: unknown;
  reason: string;
  visibility: OverrideVisibility;
  overriddenById: string;
  overriddenAt: string;
  revertedAt?: string | null;
  revertedById?: string | null;
  revertReason?: string | null;
  overriddenBy?: { id: string; displayName: string };
  revertedBy?: { id: string; displayName: string };
}

export * from './game-systems';

// ============================================
// Dual-Mode Dice Types (Phase 12)
// ============================================

export enum DiceMode {
  TRUE_RANDOM = 'TRUE_RANDOM',
  WEIGHTED_DECK = 'WEIGHTED_DECK',
}

export enum RerollReason {
  ADVANTAGE = 'ADVANTAGE',
  DISADVANTAGE = 'DISADVANTAGE',
  HALFLING_LUCK = 'HALFLING_LUCK',
  ELVEN_ACCURACY = 'ELVEN_ACCURACY',
  GREAT_WEAPON_FIGHTING = 'GREAT_WEAPON_FIGHTING',
  BLESS = 'BLESS',
  BANE = 'BANE',
  PORTENT = 'PORTENT',
  DM_FORCED = 'DM_FORCED',
  PLAYER_CHOICE = 'PLAYER_CHOICE',
  REROLL_FEATURE = 'REROLL_FEATURE',
  OTHER = 'OTHER',
}

/** A single possible outcome in a weighted deck. */
export interface DeckOutcome {
  /** Individual die values for this combination */
  rolls: number[];
  /** Post-keep/drop total */
  total: number;
}

/** Metadata attached to a roll stored with Phase 12 information. */
export interface DiceRollMetadata {
  mode: DiceMode;
  /** True if this roll is a re-roll (advantage, halfling luck, etc.) */
  isReroll: boolean;
  /** The reason this was re-rolled */
  rerollReason?: RerollReason | null;
  /** Which draw in the current deck cycle (1-based, WEIGHTED_DECK only) */
  deckPosition?: number | null;
  /** Total deck size for the expression (WEIGHTED_DECK only) */
  deckSize?: number | null;
}
