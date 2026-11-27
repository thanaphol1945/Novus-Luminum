export type GenderOption = 'ชาย' | 'หญิง' | 'ไม่ระบุ';

export type EmotionKey =
  | 'blush'
  | 'warm'
  | 'angry'
  | 'action'
  | 'shock'
  | 'sad'
  | 'smirk'
  | 'mystery'
  | 'neutral';

export type InputMode = 'ic' | 'ooc';

export type WorkspaceTab = 'discover' | 'play' | 'settings';

export type StoryTab = 'stage' | 'character' | 'map';

export type PlayViewMode = 'stage' | 'feed';

export type TropeCategory = 'all' | 'isekai' | 'action' | 'rofan' | 'scifi' | 'custom';

export type SceneVisualKey =
  | 'isekai_plaza'
  | 'hunter_rooftop'
  | 'royal_palace'
  | 'cyberpunk_bar'
  | 'mystic_shrine';

export type ProseLength = 'concise' | 'balanced' | 'rich';

export type ThemeMode = 'luminum' | 'crimson';

export type FreeAiMode = 'hybrid' | 'gemini' | 'community';

export interface ProtagonistConfig {
  name: string;
  gender: GenderOption;
  role: string;
  appearance: string;
  persona: string;
}

export interface CompanionConfig {
  name: string;
  gender: GenderOption;
  role: string;
  appearance: string;
  personality: string;
  initialMood: string;
}

export interface WorldConfig {
  id: string;
  title: string;
  badge?: string;
  synopsis?: string;
  tropeCategory?: Exclude<TropeCategory, 'all'>;
  coverKey?: SceneVisualKey;
  isCustom?: boolean;
  isSandbox?: boolean;
  hasCompanion?: boolean;
  accentHex?: string;
  genre: string;
  toneTags?: string[];
  worldRules: string;
  worldBoundaries: string;
  powerSystem: string;
  location: string;
  initialObjective: string;
  initialItems: string[];
  scenarioTag?: string;
  protagonist: ProtagonistConfig;
  companion: CompanionConfig | null;
  openingNarration: string;
  initialSuggestions: string[];
}

export interface CastMember {
  id: string;
  name: string;
  gender: GenderOption;
  role: string;
  appearance: string;
  mood: string;
  affinity: number;
  relationshipTier: string;
  trustNotes: string[];
  isPrimary?: boolean;
}

export interface RpgStats {
  str: number;
  agi: number;
  int: number;
  cha: number;
  lck: number;
}

export interface RpgSkill {
  id: string;
  name: string;
  mpCost: number;
  description: string;
}

export interface RpgQuest {
  id: string;
  title: string;
  status: 'active' | 'completed';
}

export interface RpgState {
  level: number;
  xp: number;
  xpToNext: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  gold: number;
  unspentPoints: number;
  stats: RpgStats;
  skills: RpgSkill[];
  quests: RpgQuest[];
}

export interface MapNode {
  id: string;
  name: string;
  type: 'hub' | 'danger' | 'mystery' | 'sanctuary';
  x: number;
  y: number;
  connectedTo: string[];
}

export interface WorldMapState {
  currentNodeId: string;
  nodes: MapNode[];
}

export interface LoreEntry {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
}

export interface EpisodeSummary {
  id: string;
  arcNumber: number;
  episodeNumber: number;
  title: string;
  recapBullets: string[];
  affinityHighlight: string;
  nextEpisodeHook: string;
  completedAtTurn: number;
}

export interface AffinityLogEntry {
  id: string;
  turn: number;
  arcNumber: number;
  episodeNumber: number;
  characterId: string;
  characterName: string;
  delta: number;
  previousAffinity: number;
  newAffinity: number;
  tier: string;
  description: string;
}

export interface TurnSnapshot {
  id: string;
  messageIndex: number;
  turn: number;
  arcNumber: number;
  episodeNumber: number;
  turnsInEpisode: number;
  location: string;
  objective: string;
  mood: string;
  tension: number;
  sceneKey: SceneVisualKey;
  sceneCgUrl?: string;
  protagonist?: ProtagonistConfig;
  items: string[];
  cast: CastMember[];
  memories: string[];
  lorebook: LoreEntry[];
  rpg: RpgState;
  map: WorldMapState;
  affinityHistory?: AffinityLogEntry[];
  suggestedActions: string[];
}

export interface StoryMessage {
  id: string;
  sender: 'narrator' | 'player' | 'system';
  mode?: InputMode;
  turn: number;
  text: string;
  emotion?: EmotionKey;
  scenarioTag?: string;
  engineLabel?: string;
  isOpeningLoading?: boolean;
  snapshotId?: string;
  affinityDelta?: number;
}

export interface SessionState {
  sessionId: string;
  world: WorldConfig;
  turn: number;
  arcNumber: number;
  episodeNumber: number;
  turnsInEpisode: number;
  episodeArchive: EpisodeSummary[];
  location: string;
  objective: string;
  mood: string;
  tension: number;
  sceneKey: SceneVisualKey;
  sceneCgUrl?: string;
  items: string[];
  cast: CastMember[];
  memories: string[];
  lorebook: LoreEntry[];
  rpg: RpgState;
  map: WorldMapState;
  messages: StoryMessage[];
  turnSnapshots: TurnSnapshot[];
  affinityHistory: AffinityLogEntry[];
  suggestedActions: string[];
}

export interface AppSettings {
  aiEnabled: boolean;
  freeAiMode: FreeAiMode;
  geminiModel: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
  proseLength: ProseLength;
  dramaIntensity: 'grounded' | 'dramatic' | 'intense';
  ttsAutoPlay: boolean;
  ttsRate: number;
  themeMode: ThemeMode;
  typewriterEnabled: boolean;
  sfxEnabled: boolean;
  ambientEnabled: boolean;
}

export interface SaveSlot {
  id: string;
  label: string;
  savedAt: string;
  session: SessionState;
}

export interface EmotionProfile {
  key: EmotionKey;
  label: string;
  accentHex: string;
  badgeClass: string;
}

export interface DynamicOpeningResult {
  scenarioTag: string;
  location: string;
  mood: string;
  emotion: EmotionKey;
  objective: string;
  openingNarration: string;
  suggestedActions: string[];
  engineLabel: string;
}

export interface TurnResult {
  narration: string;
  emotion: EmotionKey;
  mood: string;
  tension: number;
  location?: string;
  objective?: string;
  sceneKey?: SceneVisualKey;
  affinityDelta?: number;
  relationshipNote?: string;
  protagonistUpdate?: {
    role?: string;
    persona?: string;
  } | null;
  rpgDelta?: {
    hpDelta?: number;
    mpDelta?: number;
    xpDelta?: number;
    goldDelta?: number;
    statGains?: Partial<RpgStats>;
    newSkill?: { name: string; mpCost: number; description: string } | null;
    questUpdates?: Array<{ title: string; status: 'active' | 'completed' }>;
  };
  newItems?: string[];
  removedItems?: string[];
  newCharacters?: Array<{
    name: string;
    gender: GenderOption;
    role: string;
    appearance: string;
    mood: string;
  }>;
  newMemory?: string;
  newLore?: { title: string; detail: string } | null;
  mapNode?: { name: string; type: 'hub' | 'danger' | 'mystery' | 'sanctuary' } | null;
  suggestedActions: string[];
  engineLabel: string;
}

export interface DiceCheckResult {
  id: string;
  stat: keyof RpgStats;
  d20: number;
  modifier: number;
  total: number;
  isCritSuccess: boolean;
  isCritFail: boolean;
  label: string;
}

export interface FloatingStatPopup {
  id: string;
  label: string;
  tone: 'positive' | 'negative' | 'accent' | 'level';
}

export interface StoryCardFile {
  type: 'novus-luminum-story-card';
  version: 1;
  exportedAt: string;
  world: WorldConfig;
}
