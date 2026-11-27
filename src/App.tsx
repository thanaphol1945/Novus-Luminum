import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Coffee,
  Compass,
  Dices,
  Download,
  Film,
  FolderOpen,
  Heart,
  History,
  List,
  Map as MapIcon,
  MapPin,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Settings,
  Trash2,
  TrendingUp,
  Tv,
  Upload,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AnimePortrait } from './components/AnimePortrait';
import { DiscoverView } from './components/DiscoverView';
import { EpisodeRecapModal } from './components/EpisodeRecapModal';
import { VisualNovelStage } from './components/VisualNovelStage';
import { WorldCreatorModal, WorldCustomizerModal } from './components/WorldModals';
import {
  APP_NAME,
  DEFAULT_SETTINGS,
  EMOTION_PROFILES,
  PRESET_WORLDS,
  SCENE_BACKDROPS,
} from './data/presets';
import {
  ApiError,
  fetchHealth,
  requestAiDynamicOpening,
  requestAiEpisodeRecap,
  requestAiPortrait,
  requestAiSceneCg,
  requestAiSuggestions,
  requestAiTurn,
} from './services/api';
import type {
  AffinityLogEntry,
  AppSettings,
  DiceCheckResult,
  EpisodeSummary,
  FloatingStatPopup,
  InputMode,
  MapNode,
  PlayViewMode,
  RpgStats,
  SaveSlot,
  SceneVisualKey,
  SessionState,
  StoryMessage,
  StoryTab,
  TurnResult,
  TurnSnapshot,
  WorkspaceTab,
  WorldConfig,
} from './types';
import { soundEngine } from './utils/audioEngine';
import {
  createInitialSession,
  createSnapshot,
  detectEmotionFromText,
  generateLocalDynamicOpening,
  generateLocalEpisodeRecap,
  generateLocalTurn,
  generateProceduralAnimePortraitDataUrl,
  generateProceduralSceneCgDataUrl,
  getRelationshipTier,
  resolveSceneBackdrop,
} from './utils/storyEngine';

const STORAGE_KEYS = {
  SESSION: 'nl_studio_session_v2',
  CUSTOM_WORLDS: 'nl_studio_custom_worlds_v2',
  SAVES: 'nl_studio_saves_v2',
  SETTINGS: 'nl_studio_settings_v2',
  PORTRAITS: 'nl_studio_portraits_v2',
  VIEW_MODE: 'nl_studio_play_view_v2',
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeSession(raw: SessionState): SessionState {
  const arcNumber = typeof raw.arcNumber === 'number' && raw.arcNumber >= 1 ? raw.arcNumber : 1;
  const episodeNumber =
    typeof raw.episodeNumber === 'number' && raw.episodeNumber >= 1 ? raw.episodeNumber : 1;
  const turnsInEpisode =
    typeof raw.turnsInEpisode === 'number' && raw.turnsInEpisode >= 1 ? raw.turnsInEpisode : 1;
  const sceneKey = resolveSceneBackdrop(raw.sceneKey, raw.world, raw.location).key;

  const cast = Array.isArray(raw.cast)
    ? raw.cast.map((c) => {
        const aff = typeof c.affinity === 'number' ? Math.max(0, Math.min(100, c.affinity)) : 35;
        return {
          ...c,
          affinity: aff,
          relationshipTier: c.relationshipTier || getRelationshipTier(aff),
          trustNotes: Array.isArray(c.trustNotes) ? c.trustNotes : [],
        };
      })
    : [];

  const normalizedRpg = raw.rpg
    ? {
        ...raw.rpg,
        unspentPoints:
          typeof raw.rpg.unspentPoints === 'number' && raw.rpg.unspentPoints >= 0
            ? raw.rpg.unspentPoints
            : 0,
      }
    : raw.rpg;

  return {
    ...raw,
    arcNumber,
    episodeNumber,
    turnsInEpisode,
    episodeArchive: Array.isArray(raw.episodeArchive) ? raw.episodeArchive : [],
    sceneKey,
    rpg: normalizedRpg,
    cast,
    turnSnapshots: Array.isArray(raw.turnSnapshots) ? raw.turnSnapshots : [],
    affinityHistory: Array.isArray(raw.affinityHistory) ? raw.affinityHistory : [],
    memories: Array.isArray(raw.memories) ? raw.memories : [],
    lorebook: Array.isArray(raw.lorebook) ? raw.lorebook : [],
    items: Array.isArray(raw.items) ? raw.items : [],
    suggestedActions: Array.isArray(raw.suggestedActions) ? raw.suggestedActions : [],
  };
}

function restoreSessionFromSnapshot(
  current: SessionState,
  snap: TurnSnapshot,
): SessionState {
  return {
    ...current,
    world: snap.protagonist
      ? {
          ...current.world,
          protagonist: { ...snap.protagonist },
        }
      : current.world,
    turn: snap.turn,
    arcNumber: snap.arcNumber,
    episodeNumber: snap.episodeNumber,
    turnsInEpisode: snap.turnsInEpisode,
    location: snap.location,
    objective: snap.objective,
    mood: snap.mood,
    tension: snap.tension,
    sceneKey: snap.sceneKey,
    sceneCgUrl: snap.sceneCgUrl,
    items: [...snap.items],
    cast: snap.cast.map((c) => ({ ...c, trustNotes: [...(c.trustNotes || [])] })),
    memories: [...snap.memories],
    lorebook: snap.lorebook.map((l) => ({ ...l })),
    rpg: {
      ...snap.rpg,
      unspentPoints: typeof snap.rpg.unspentPoints === 'number' ? snap.rpg.unspentPoints : 0,
      stats: { ...snap.rpg.stats },
      skills: snap.rpg.skills.map((s) => ({ ...s })),
      quests: snap.rpg.quests.map((q) => ({ ...q })),
    },
    map: {
      currentNodeId: snap.map.currentNodeId,
      nodes: snap.map.nodes.map((n) => ({ ...n, connectedTo: [...n.connectedTo] })),
    },
    messages: current.messages.slice(0, snap.messageIndex),
    turnSnapshots: current.turnSnapshots.filter((s) => s.messageIndex < snap.messageIndex),
    affinityHistory: Array.isArray(snap.affinityHistory)
      ? snap.affinityHistory.map((entry) => ({ ...entry }))
      : (current.affinityHistory || []).filter((entry) => entry.turn <= snap.turn),
    suggestedActions: [...snap.suggestedActions],
  };
}

function renderFormattedStoryText(text: string) {
  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);
  return paragraphs.map((para, pIdx) => {
    const tokens = para.split(/(\*[^*]+\*|"[^"]+")/g);
    return (
      <p key={pIdx} className="leading-relaxed text-[15px] text-slate-200">
        {tokens.map((tok, tIdx) => {
          if (tok.startsWith('*') && tok.endsWith('*') && tok.length > 2) {
            return (
              <span key={tIdx} className="italic text-slate-400">
                {tok.slice(1, -1)}
              </span>
            );
          }
          if (tok.startsWith('"') && tok.endsWith('"') && tok.length > 2) {
            return (
              <span key={tIdx} className="text-white font-medium">
                {tok}
              </span>
            );
          }
          return <span key={tIdx}>{tok}</span>;
        })}
      </p>
    );
  });
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = readStorage<Partial<AppSettings>>(STORAGE_KEYS.SETTINGS, {});
    const validModel: AppSettings['geminiModel'] =
      saved.geminiModel === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
    const validFreeMode: AppSettings['freeAiMode'] =
      saved.freeAiMode === 'gemini' || saved.freeAiMode === 'community' ? saved.freeAiMode : 'hybrid';
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      geminiModel: validModel,
      freeAiMode: validFreeMode,
    };
  });
  const [customWorlds, setCustomWorlds] = useState<WorldConfig[]>(() =>
    readStorage<WorldConfig[]>(STORAGE_KEYS.CUSTOM_WORLDS, []),
  );
  const [saves, setSaves] = useState<SaveSlot[]>(() =>
    readStorage<SaveSlot[]>(STORAGE_KEYS.SAVES, []),
  );
  const [portraitImages, setPortraitImages] = useState<Record<string, string>>(() =>
    readStorage<Record<string, string>>(STORAGE_KEYS.PORTRAITS, {}),
  );
  const [playViewMode, setPlayViewMode] = useState<PlayViewMode>(() =>
    readStorage<PlayViewMode>(STORAGE_KEYS.VIEW_MODE, 'stage'),
  );
  const [session, setSession] = useState<SessionState>(() =>
    normalizeSession(
      readStorage<SessionState>(STORAGE_KEYS.SESSION, createInitialSession(PRESET_WORLDS[0])),
    ),
  );

  const [aiServerConfigured, setAiServerConfigured] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('play');
  const [storyTab, setStoryTab] = useState<StoryTab>('stage');
  const [affinityFilterCharId, setAffinityFilterCharId] = useState<string>('all');

  const [inputText, setInputText] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('ic');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingOpening, setIsGeneratingOpening] = useState(false);
  const [isRefreshingSug, setIsRefreshingSug] = useState(false);
  const [isGeneratingRecap, setIsGeneratingRecap] = useState(false);

  const [diceStat, setDiceStat] = useState<keyof RpgStats>('str');
  const [lastDiceCheck, setLastDiceCheck] = useState<DiceCheckResult | null>(null);
  const [isRollingDice, setIsRollingDice] = useState(false);

  const [floatingPopups, setFloatingPopups] = useState<FloatingStatPopup[]>([]);
  const [heroEvolvedNotice, setHeroEvolvedNotice] = useState<{
    role?: string;
    persona?: string;
  } | null>(null);
  const [paintingPortraitKey, setPaintingPortraitKey] = useState<string | null>(null);
  const [isPaintingScene, setIsPaintingScene] = useState(false);

  const [newMapPinName, setNewMapPinName] = useState('');
  const [newMapPinType, setNewMapPinType] = useState<MapNode['type']>('mystery');

  const [editingFeedMsgId, setEditingFeedMsgId] = useState<string | null>(null);
  const [editingFeedDraft, setEditingFeedDraft] = useState('');
  const [activeRecap, setActiveRecap] = useState<EpisodeSummary | null>(null);
  const [milestoneEvent, setMilestoneEvent] = useState<{
    milestone: number | null;
    tier: string;
    key: number;
  } | null>(null);

  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [showCreatorModal, setShowCreatorModal] = useState(false);
  const [customizeDraft, setCustomizeDraft] = useState<
    (WorldConfig & { itemsText: string; hasCompanion: boolean }) | null
  >(null);
  const [saveCustomizedAsCopy, setSaveCustomizedAsCopy] = useState(false);

  const [newLoreTitle, setNewLoreTitle] = useState('');
  const [newLoreDetail, setNewLoreDetail] = useState('');
  const [newSaveLabel, setNewSaveLabel] = useState('');

  const [aiErrorBanner, setAiErrorBanner] = useState<{
    message: string;
    code?: string;
    status?: number;
    canRetry?: boolean;
  } | null>(null);
  const retryActionRef = useRef<(() => void) | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(
    null,
  );
  const toastTimerRef = useRef<number | null>(null);
  const storyEndRef = useRef<HTMLDivElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4000);
  };

  const clearAiError = () => {
    retryActionRef.current = null;
    setAiErrorBanner(null);
  };

  const reportAiError = (err: unknown, fallbackMessage: string, retryFn?: () => void) => {
    const msg = err instanceof Error ? err.message : fallbackMessage;
    retryActionRef.current = retryFn || null;
    if (err instanceof ApiError || retryFn) {
      setAiErrorBanner({
        message: msg,
        code: err instanceof ApiError ? err.code : undefined,
        status: err instanceof ApiError ? err.status : undefined,
        canRetry: Boolean(retryFn),
      });
    }
    showToast(msg, 'error');
  };

  const pushFloatingPopups = (items: Array<Omit<FloatingStatPopup, 'id'>>) => {
    if (items.length === 0) return;
    const stamped = items.map((item, idx) => ({
      ...item,
      id: `pop-${Date.now()}-${idx}`,
    }));
    setFloatingPopups(stamped);
    window.setTimeout(() => {
      setFloatingPopups((prev) => prev.filter((p) => !stamped.some((s) => s.id === p.id)));
    }, 2600);
  };

  useEffect(() => {
    fetchHealth()
      .then((res) => setAiServerConfigured(res.aiConfigured))
      .catch(() => setAiServerConfigured(false));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.themeMode === 'crimson' ? 'crimson' : 'luminum';
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  useEffect(() => {
    soundEngine.setAmbient(Boolean(settings.ambientEnabled) && activeTab === 'play', session.tension);
    return () => {
      if (!settings.ambientEnabled) {
        soundEngine.stopAmbient();
      }
    };
  }, [settings.ambientEnabled, activeTab, session.tension]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.VIEW_MODE, JSON.stringify(playViewMode));
    } catch {}
  }, [playViewMode]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CUSTOM_WORLDS, JSON.stringify(customWorlds));
    } catch {}
  }, [customWorlds]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SAVES, JSON.stringify(saves));
    } catch {}
  }, [saves]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PORTRAITS, JSON.stringify(portraitImages));
    } catch {}
  }, [portraitImages]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
    } catch {}
  }, [session]);

  useEffect(() => {
    if (activeTab === 'play' && storyTab === 'stage' && playViewMode === 'feed') {
      storyEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [session.messages.length, activeTab, storyTab, playViewMode]);

  const stopSpeech = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMsgId(null);
  };

  const handleSpeakThai = (msg: StoryMessage, forcePlay = false) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (!forcePlay) showToast('เบราว์เซอร์นี้ไม่รองรับเสียงพากย์ Web Speech API', 'error');
      return;
    }

    if (!forcePlay && speakingMsgId === msg.id) {
      stopSpeech();
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = msg.text.replace(/\*/g, '').replace(/"/g, '').trim();
    if (!cleanText) return;

    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.lang = 'th-TH';
    utter.rate = settings.ttsRate || 1.0;

    const voices = window.speechSynthesis.getVoices();
    const thaiVoice = voices.find((v) => v.lang.toLowerCase().startsWith('th'));
    if (thaiVoice) utter.voice = thaiVoice;

    utter.onstart = () => setSpeakingMsgId(msg.id);
    utter.onend = () => setSpeakingMsgId(null);
    utter.onerror = () => setSpeakingMsgId(null);
    window.speechSynthesis.speak(utter);
  };

  const startWorldWithDynamicOpening = async (
    world: WorldConfig,
    options: { skipDynamicCall?: boolean; prevSnippet?: string } = {},
  ) => {
    const { skipDynamicCall = false, prevSnippet = '' } = options;
    stopSpeech();
    setEditingFeedMsgId(null);
    const baseSession = createInitialSession(world);
    setActiveTab('play');
    setStoryTab('stage');
    setAffinityFilterCharId('all');

    if (skipDynamicCall && world.openingNarration) {
      setSession(baseSession);
      showToast(`เข้าสู่โลก "${world.title}" แล้ว`, 'success');
      return;
    }

    const loadingSession: SessionState = {
      ...baseSession,
      messages: [
        {
          ...baseSession.messages[0],
          text: `*กำลังสร้างสถานการณ์เปิดฉากและบทสนทนาใหม่เฉพาะรอบนี้ ภายใต้ขอบเขตของโลก "${world.title}"...*`,
          scenarioTag: 'กำลังสุ่มสถานการณ์ใหม่',
          engineLabel: 'PREPARING',
          isOpeningLoading: true,
        },
      ],
    };
    setSession(loadingSession);
    setIsGeneratingOpening(true);

    try {
      const opening = settings.aiEnabled
        ? await requestAiDynamicOpening(world, settings, prevSnippet)
        : generateLocalDynamicOpening(world);

      const newOpeningMsg: StoryMessage = {
        id: `narrator-init-${Date.now()}`,
        sender: 'narrator',
        turn: 1,
        text: opening.openingNarration,
        emotion: opening.emotion || detectEmotionFromText(opening.openingNarration, opening.mood).key,
        scenarioTag: opening.scenarioTag,
        engineLabel: opening.engineLabel,
      };

      setSession((prev) => {
        if (prev.sessionId !== loadingSession.sessionId) return prev;
        const nextLoc = opening.location || prev.location;
        const nextMood = opening.mood || prev.mood;
        const nextObj = opening.objective || prev.objective;
        const nextSceneKey = resolveSceneBackdrop(world.coverKey, world, nextLoc).key;
        const updatedCast = prev.cast.map((c) => (c.isPrimary ? { ...c, mood: nextMood } : c));
        const updatedNodes = prev.map.nodes.map((n, idx) =>
          idx === 0 ? { ...n, name: nextLoc } : n,
        );
        const updatedQuests = prev.rpg.quests.map((q, idx) =>
          idx === 0 ? { ...q, title: nextObj } : q,
        );

        return {
          ...prev,
          location: nextLoc,
          mood: nextMood,
          objective: nextObj,
          sceneKey: nextSceneKey,
          cast: updatedCast,
          map: { ...prev.map, nodes: updatedNodes },
          rpg: { ...prev.rpg, quests: updatedQuests },
          memories: [
            `เริ่มต้นเรื่องราวใน "${world.title}" ณ ${nextLoc} (${opening.scenarioTag})`,
            updatedCast[0]
              ? `พบกับ ${updatedCast[0].name} (${updatedCast[0].role})`
              : 'เริ่มต้นการเดินทางแบบฉายเดี่ยว (Solo Journey)',
          ],
          messages: [newOpeningMsg],
          turnSnapshots: [],
          affinityHistory: updatedCast[0]
            ? [
                {
                  id: `aff-init-${Date.now()}`,
                  turn: 1,
                  arcNumber: 1,
                  episodeNumber: 1,
                  characterId: updatedCast[0].id,
                  characterName: updatedCast[0].name,
                  delta: 0,
                  previousAffinity: updatedCast[0].affinity,
                  newAffinity: updatedCast[0].affinity,
                  tier: updatedCast[0].relationshipTier,
                  description: `เริ่มต้นความสัมพันธ์ ณ ${nextLoc} (${opening.scenarioTag})`,
                },
              ]
            : [],
          suggestedActions:
            opening.suggestedActions.length >= 2 ? opening.suggestedActions : prev.suggestedActions,
        };
      });

      clearAiError();
      if (settings.ttsAutoPlay) {
        handleSpeakThai(newOpeningMsg, true);
      }
      showToast(`เริ่มรอบใหม่: ${opening.scenarioTag}`, 'success');
    } catch (err) {
      setSession(baseSession);
      reportAiError(err, 'ไม่สามารถสุ่มฉากเปิดด้วย AI ได้', () => {
        startWorldWithDynamicOpening(world, options);
      });
    } finally {
      setIsGeneratingOpening(false);
    }
  };

  const handleSelectWorld = (world: WorldConfig) => {
    const prevSnippet = session.world.id === world.id ? session.messages[0]?.text || '' : '';
    startWorldWithDynamicOpening(world, { prevSnippet });
  };

  const openWorldCustomizer = (world: WorldConfig) => {
    setCustomizeDraft({
      ...world,
      hasCompanion: world.hasCompanion !== false && Boolean(world.companion?.name),
      worldBoundaries: world.worldBoundaries || world.worldRules || '',
      toneTags: Array.isArray(world.toneTags) ? [...world.toneTags] : [],
      protagonist: {
        ...world.protagonist,
        gender: world.protagonist.gender || 'ชาย',
      },
      companion: world.companion
        ? {
            ...world.companion,
            gender: world.companion.gender || 'หญิง',
          }
        : {
            name: '',
            gender: 'หญิง',
            role: 'พันธมิตร',
            appearance: '',
            personality: 'เป็นธรรมชาติ',
            initialMood: 'สังเกตการณ์',
          },
      itemsText: (world.initialItems || []).join(', '),
    });
    setSaveCustomizedAsCopy(false);
  };

  const handleLaunchCustomizedWorld = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customizeDraft) return;

    const parsedItems = (customizeDraft.itemsText || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const compObj =
      customizeDraft.hasCompanion && customizeDraft.companion
        ? {
            ...customizeDraft.companion,
            name: (customizeDraft.companion.name || '').trim() || 'คู่บทบาทนิรนาม',
            gender: customizeDraft.companion.gender || 'ไม่ระบุ',
          }
        : null;

    const finalWorld: WorldConfig = {
      ...customizeDraft,
      id: saveCustomizedAsCopy ? `custom-${Date.now()}` : customizeDraft.id,
      isCustom: saveCustomizedAsCopy ? true : Boolean(customizeDraft.isCustom),
      badge: saveCustomizedAsCopy ? 'CUSTOM EDITION' : customizeDraft.badge || 'ANIME WORLD',
      tropeCategory: saveCustomizedAsCopy ? 'custom' : customizeDraft.tropeCategory,
      title: (customizeDraft.title || 'โลกอนิเมะใหม่').trim(),
      worldBoundaries: (customizeDraft.worldBoundaries || customizeDraft.worldRules || '').trim(),
      initialItems: parsedItems,
      companion: compObj,
    };

    if (saveCustomizedAsCopy) {
      setCustomWorlds((prev) => [finalWorld, ...prev]);
    }
    setCustomizeDraft(null);
    startWorldWithDynamicOpening(finalWorld);
  };

  const applyTurnResult = (
    base: SessionState,
    userMessage: StoryMessage,
    result: TurnResult,
    nextTurn: number,
  ): SessionState => {
    const snapshot = createSnapshot(base, base.messages.length);
    const delta = result.rpgDelta || {};
    const nextRpg = {
      ...base.rpg,
      stats: { ...base.rpg.stats },
      skills: [...base.rpg.skills],
      quests: [...base.rpg.quests],
    };

    nextRpg.hp = Math.max(0, Math.min(nextRpg.maxHp, nextRpg.hp + (delta.hpDelta || 0)));
    nextRpg.mp = Math.max(0, Math.min(nextRpg.maxMp, nextRpg.mp + (delta.mpDelta || 0)));
    nextRpg.gold = Math.max(0, nextRpg.gold + (delta.goldDelta || 0));
    nextRpg.xp = Math.max(0, nextRpg.xp + (delta.xpDelta || 0));

    while (nextRpg.xp >= nextRpg.xpToNext) {
      nextRpg.xp -= nextRpg.xpToNext;
      nextRpg.level += 1;
      nextRpg.unspentPoints = (nextRpg.unspentPoints || 0) + 2;
      nextRpg.xpToNext = Math.round(nextRpg.xpToNext * 1.35);
      nextRpg.maxHp += 15;
      nextRpg.hp = nextRpg.maxHp;
      nextRpg.maxMp += 10;
      nextRpg.mp = nextRpg.maxMp;
    }

    if (delta.statGains) {
      for (const key of ['str', 'agi', 'int', 'cha', 'lck'] as const) {
        const gain = delta.statGains[key];
        if (typeof gain === 'number' && gain !== 0) {
          nextRpg.stats[key] = Math.max(1, nextRpg.stats[key] + gain);
        }
      }
    }

    if (delta.newSkill && delta.newSkill.name) {
      const exists = nextRpg.skills.some((s) => s.name === delta.newSkill?.name);
      if (!exists) {
        nextRpg.skills.push({
          id: `skill-${Date.now()}`,
          name: delta.newSkill.name,
          mpCost: delta.newSkill.mpCost || 10,
          description: delta.newSkill.description || 'สกิลใหม่ที่ปลดล็อกระหว่างเรื่อง',
        });
      }
    }

    if (Array.isArray(delta.questUpdates)) {
      for (const qu of delta.questUpdates) {
        if (!qu.title) continue;
        const idx = nextRpg.quests.findIndex((q) => q.title === qu.title);
        if (idx >= 0) {
          nextRpg.quests[idx] = { ...nextRpg.quests[idx], status: qu.status };
        } else {
          nextRpg.quests.push({
            id: `quest-${Date.now()}-${Math.random()}`,
            title: qu.title,
            status: qu.status || 'active',
          });
        }
      }
    }

    let nextItems = [...base.items];
    if (Array.isArray(result.removedItems) && result.removedItems.length > 0) {
      nextItems = nextItems.filter((item) => !result.removedItems?.includes(item));
    }
    if (Array.isArray(result.newItems) && result.newItems.length > 0) {
      for (const item of result.newItems) {
        if (item && !nextItems.includes(item)) nextItems.push(item);
      }
    }

    const affinityDelta = typeof result.affinityDelta === 'number' ? result.affinityDelta : 0;
    const relNote = (result.relationshipNote || '').trim();
    const newAffinityEntries: AffinityLogEntry[] = [];
    const fallbackEventDesc =
      relNote ||
      (result.newMemory || '').trim() ||
      userMessage.text.replace(/\*/g, '').trim().slice(0, 90) ||
      'เหตุการณ์ระหว่างการเดินทาง';

    const nextCast = base.cast.map((c) => {
      if (!c.isPrimary) return c;
      const prevAff = typeof c.affinity === 'number' ? c.affinity : 35;
      const nextAff = Math.max(0, Math.min(100, prevAff + affinityDelta));
      const actualDelta = nextAff - prevAff;
      const nextTier = getRelationshipTier(nextAff, result.emotion);
      const existingNotes = Array.isArray(c.trustNotes) ? c.trustNotes : [];
      const nextNotes =
        relNote && !existingNotes.includes(relNote)
          ? [...existingNotes, relNote].slice(-8)
          : existingNotes;

      if (actualDelta !== 0 || relNote) {
        newAffinityEntries.push({
          id: `aff-${Date.now()}-${c.id}`,
          turn: nextTurn,
          arcNumber: base.arcNumber,
          episodeNumber: base.episodeNumber,
          characterId: c.id,
          characterName: c.name,
          delta: actualDelta,
          previousAffinity: prevAff,
          newAffinity: nextAff,
          tier: nextTier,
          description: fallbackEventDesc,
        });
      }

      return {
        ...c,
        mood: result.mood || c.mood,
        affinity: nextAff,
        relationshipTier: nextTier,
        trustNotes: nextNotes,
      };
    });

    if (Array.isArray(result.newCharacters)) {
      for (const nc of result.newCharacters) {
        if (nc.name && !nextCast.some((c) => c.name === nc.name)) {
          const newCharId = `char-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const initTier = getRelationshipTier(30);
          nextCast.push({
            id: newCharId,
            name: nc.name,
            gender: nc.gender || 'ไม่ระบุ',
            role: nc.role || 'ตัวละครใหม่',
            appearance: nc.appearance || '',
            mood: nc.mood || 'สังเกตการณ์',
            affinity: 30,
            relationshipTier: initTier,
            trustNotes: [`พบเจอใน ARC ${base.arcNumber} · EP.${base.episodeNumber}`],
          });
          newAffinityEntries.push({
            id: `aff-${Date.now()}-${newCharId}`,
            turn: nextTurn,
            arcNumber: base.arcNumber,
            episodeNumber: base.episodeNumber,
            characterId: newCharId,
            characterName: nc.name,
            delta: 0,
            previousAffinity: 30,
            newAffinity: 30,
            tier: initTier,
            description: `พบตัวละครใหม่: ${nc.name} (${nc.role || 'ตัวละครในเรื่อง'})`,
          });
        }
      }
    }

    const nextMemories = result.newMemory ? [...base.memories, result.newMemory] : base.memories;

    const nextLorebook =
      result.newLore && result.newLore.title
        ? [
            ...base.lorebook,
            {
              id: `lore-${Date.now()}`,
              title: result.newLore.title,
              detail: result.newLore.detail,
              createdAt: `EP.${base.episodeNumber} · จังหวะ ${nextTurn}`,
            },
          ]
        : base.lorebook;

    let nextMap = base.map;
    if (result.mapNode && result.mapNode.name) {
      const existing = base.map.nodes.find((n) => n.name === result.mapNode?.name);
      if (existing) {
        nextMap = { ...base.map, currentNodeId: existing.id };
      } else {
        const angle = (base.map.nodes.length * 1.45) % (Math.PI * 2);
        const radius = 80 + (base.map.nodes.length % 3) * 28;
        const newNodeId = `node-${Date.now()}`;
        const newNode: MapNode = {
          id: newNodeId,
          name: result.mapNode.name,
          type: result.mapNode.type || 'mystery',
          x: Math.max(48, Math.min(272, Math.round(160 + Math.cos(angle) * radius))),
          y: Math.max(42, Math.min(198, Math.round(120 + Math.sin(angle) * (radius * 0.65)))),
          connectedTo: [base.map.currentNodeId],
        };
        nextMap = {
          currentNodeId: newNodeId,
          nodes: [...base.map.nodes, newNode],
        };
      }
    }

    const nextLocation = result.location || base.location;
    const nextSceneKey: SceneVisualKey =
      result.sceneKey && SCENE_BACKDROPS[result.sceneKey]
        ? result.sceneKey
        : result.location && result.location !== base.location
          ? resolveSceneBackdrop(undefined, base.world, nextLocation).key
          : base.sceneKey;

    const taggedPlayerMessage: StoryMessage = {
      ...userMessage,
      snapshotId: snapshot.id,
    };

    const narratorMessage: StoryMessage = {
      id: `narrator-${Date.now()}`,
      sender: 'narrator',
      turn: nextTurn,
      text: result.narration,
      emotion: result.emotion,
      engineLabel: result.engineLabel,
      snapshotId: snapshot.id,
      affinityDelta: base.cast.length > 0 ? affinityDelta : 0,
    };

    const nextProtagonist =
      result.protagonistUpdate &&
      (result.protagonistUpdate.role || result.protagonistUpdate.persona)
        ? {
            ...base.world.protagonist,
            role: result.protagonistUpdate.role?.trim() || base.world.protagonist.role,
            persona: result.protagonistUpdate.persona?.trim() || base.world.protagonist.persona,
          }
        : base.world.protagonist;

    return {
      ...base,
      world: {
        ...base.world,
        protagonist: nextProtagonist,
      },
      turn: nextTurn,
      turnsInEpisode: base.turnsInEpisode + 1,
      location: nextLocation,
      objective: result.objective || base.objective,
      mood: result.mood || base.mood,
      tension: result.tension,
      sceneKey: nextSceneKey,
      items: nextItems,
      cast: nextCast,
      memories: nextMemories,
      lorebook: nextLorebook,
      rpg: nextRpg,
      map: nextMap,
      messages: [...base.messages, taggedPlayerMessage, narratorMessage],
      turnSnapshots: [...base.turnSnapshots, snapshot],
      affinityHistory: [...(base.affinityHistory || []), ...newAffinityEntries],
      suggestedActions:
        result.suggestedActions.length > 0 ? result.suggestedActions : base.suggestedActions,
    };
  };

  const executeTurn = async (
    baseSession: SessionState,
    text: string,
    mode: InputMode,
    rerollPrevious = '',
  ): Promise<boolean> => {
    const cleanText = text.trim();
    if (!cleanText) return false;

    const nextTurn = baseSession.turn + 1;
    const playerMsg: StoryMessage = {
      id: `player-${Date.now()}`,
      sender: 'player',
      mode,
      turn: nextTurn,
      text: cleanText,
      emotion: detectEmotionFromText(cleanText).key,
    };

    setIsGenerating(true);
    try {
      const result = settings.aiEnabled
        ? await requestAiTurn(baseSession, cleanText, mode, settings, rerollPrevious)
        : generateLocalTurn(baseSession, cleanText, mode);

      const updated = applyTurnResult(baseSession, playerMsg, result, nextTurn);
      setSession(updated);

      const leveledUp = updated.rpg.level > baseSession.rpg.level;
      const roleChanged =
        updated.world.protagonist.role !== baseSession.world.protagonist.role;
      const personaChanged =
        updated.world.protagonist.persona !== baseSession.world.protagonist.persona;

      if (roleChanged || personaChanged) {
        setHeroEvolvedNotice({
          role: roleChanged ? updated.world.protagonist.role : undefined,
          persona: personaChanged ? updated.world.protagonist.persona : undefined,
        });
      }

      // Floating Stat Popups + Web Audio SFX
      const popups: Array<Omit<FloatingStatPopup, 'id'>> = [];
      const rDelta = result.rpgDelta || {};
      if (leveledUp) {
        popups.push({ label: `LEVEL UP! LV.${updated.rpg.level} (+2 แต้ม)`, tone: 'level' });
      }
      if (typeof rDelta.xpDelta === 'number' && rDelta.xpDelta > 0) {
        popups.push({ label: `+${rDelta.xpDelta} XP`, tone: 'accent' });
      }
      if (typeof rDelta.hpDelta === 'number' && rDelta.hpDelta !== 0) {
        popups.push({
          label: `${rDelta.hpDelta > 0 ? '+' : ''}${rDelta.hpDelta} HP`,
          tone: rDelta.hpDelta > 0 ? 'positive' : 'negative',
        });
      }
      if (typeof rDelta.mpDelta === 'number' && rDelta.mpDelta !== 0) {
        popups.push({
          label: `${rDelta.mpDelta > 0 ? '+' : ''}${rDelta.mpDelta} MP`,
          tone: rDelta.mpDelta > 0 ? 'accent' : 'negative',
        });
      }
      if (typeof rDelta.goldDelta === 'number' && rDelta.goldDelta !== 0) {
        popups.push({
          label: `${rDelta.goldDelta > 0 ? '+' : ''}${rDelta.goldDelta} G`,
          tone: rDelta.goldDelta > 0 ? 'positive' : 'negative',
        });
      }

      const prevPrimary = baseSession.cast.find((c) => c.isPrimary);
      const nextPrimary = updated.cast.find((c) => c.isPrimary);
      const actualAffinityDelta =
        prevPrimary && nextPrimary
          ? (nextPrimary.affinity ?? 35) - (prevPrimary.affinity ?? 35)
          : 0;
      if (actualAffinityDelta !== 0) {
        popups.push({
          label: `${actualAffinityDelta > 0 ? '+' : ''}${actualAffinityDelta}% ความสัมพันธ์`,
          tone: actualAffinityDelta > 0 ? 'positive' : 'negative',
        });
      }
      pushFloatingPopups(popups);

      const crossedMilestone =
        prevPrimary && nextPrimary
          ? [90, 75, 50].find(
              (m) => (prevPrimary.affinity ?? 35) < m && (nextPrimary.affinity ?? 35) >= m,
            )
          : undefined;
      const tierLeveledUp =
        prevPrimary &&
        nextPrimary &&
        (nextPrimary.affinity ?? 35) > (prevPrimary.affinity ?? 35) &&
        nextPrimary.relationshipTier !== prevPrimary.relationshipTier;

      if (leveledUp) {
        soundEngine.playLevelUp(settings.sfxEnabled);
      } else if (crossedMilestone !== undefined || tierLeveledUp) {
        soundEngine.playMilestone(settings.sfxEnabled);
      } else if (actualAffinityDelta !== 0) {
        soundEngine.playAffinityChange(settings.sfxEnabled, actualAffinityDelta);
      }

      if (nextPrimary && (crossedMilestone !== undefined || tierLeveledUp)) {
        const key = Date.now();
        setMilestoneEvent({
          milestone: crossedMilestone ?? null,
          tier: nextPrimary.relationshipTier,
          key,
        });
        window.setTimeout(() => {
          setMilestoneEvent((curr) => (curr?.key === key ? null : curr));
        }, 3200);
        showToast(
          crossedMilestone !== undefined
            ? `ความสัมพันธ์กับ ${nextPrimary.name} ถึง ${crossedMilestone}% (${nextPrimary.relationshipTier})`
            : `ความสัมพันธ์กับ ${nextPrimary.name} เลื่อนขั้นเป็น "${nextPrimary.relationshipTier}" (${nextPrimary.affinity}%)`,
          'success',
        );
      } else if (roleChanged || personaChanged) {
        showToast(`ตัวตนของ ${updated.world.protagonist.name} พัฒนาขึ้นตามการกระทำแล้ว`, 'success');
      } else if (updated.turnsInEpisode === 5) {
        showToast(
          `ถึงจังหวะจบ Episode ${updated.episodeNumber} แล้ว กด "จบตอน & สรุป Recap" ด้านบนได้เลย`,
          'info',
        );
      }

      clearAiError();
      if (settings.ttsAutoPlay) {
        const latestNarrator = updated.messages[updated.messages.length - 1];
        if (latestNarrator) handleSpeakThai(latestNarrator, true);
      }
      return true;
    } catch (err) {
      reportAiError(err, 'เกิดข้อผิดพลาดระหว่างสร้างเรื่องราว', async () => {
        const ok = await executeTurn(baseSession, cleanText, mode, rerollPrevious);
        if (ok) setInputText('');
      });
      return false;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRollDiceCheck = () => {
    if (isRollingDice || isGenerating) return;
    setIsRollingDice(true);
    soundEngine.playDiceRoll(settings.sfxEnabled);

    window.setTimeout(() => {
      const statVal = session.rpg.stats[diceStat] || 10;
      const modifier = Math.floor((statVal - 10) / 2);
      const d20 = Math.floor(Math.random() * 20) + 1;
      const total = d20 + modifier;
      const isCritSuccess = d20 === 20;
      const isCritFail = d20 === 1;
      const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;
      const outcomeTag = isCritSuccess
        ? 'CRITICAL SUCCESS'
        : isCritFail
          ? 'CRITICAL FAIL'
          : total >= 14
            ? 'สำเร็จ'
            : 'ตึงมือ';
      const label = `ทอยเต๋า ${diceStat.toUpperCase()} (${d20}${modStr} = ${total} · ${outcomeTag})`;

      if (isCritSuccess) soundEngine.playCritSuccess(settings.sfxEnabled);
      else if (isCritFail) soundEngine.playCritFail(settings.sfxEnabled);

      setLastDiceCheck({
        id: `dice-${Date.now()}`,
        stat: diceStat,
        d20,
        modifier,
        total,
        isCritSuccess,
        isCritFail,
        label,
      });
      setIsRollingDice(false);
    }, 260);
  };

  const handleSendAction = async (customAction?: string) => {
    const baseText = (customAction ?? inputText).trim();
    if (!baseText && !lastDiceCheck) return;
    if (isGenerating || isGeneratingOpening || isGeneratingRecap) return;

    const text = lastDiceCheck
      ? `[${lastDiceCheck.label}] ${baseText || `*ดำเนินการทดสอบค่า ${lastDiceCheck.stat.toUpperCase()}*`}`
      : baseText;

    if (!customAction) setInputText('');
    const usedDice = lastDiceCheck;
    setLastDiceCheck(null);

    const ok = await executeTurn(session, text, inputMode);
    if (!ok && !customAction) {
      setInputText(baseText);
      if (usedDice) setLastDiceCheck(usedDice);
    }
  };

  const handleRewindToSnapshot = (snapshotId: string) => {
    if (isGenerating || isGeneratingOpening || isGeneratingRecap) return;
    const snap = session.turnSnapshots.find((s) => s.id === snapshotId);
    if (!snap) {
      showToast('ไม่พบจุดบันทึกของจังหวะนี้', 'error');
      return;
    }
    stopSpeech();
    setEditingFeedMsgId(null);
    const restored = restoreSessionFromSnapshot(session, snap);
    setSession(restored);
    showToast(`ย้อนเรื่องราวกลับไปยังจังหวะที่ ${snap.turn} แล้ว`, 'info');
  };

  const handleRerollMessage = async (narratorMsg: StoryMessage) => {
    if (isGenerating || isGeneratingOpening || isGeneratingRecap) return;
    if (!narratorMsg.snapshotId) {
      showToast('ไม่สามารถสุ่มคำตอบใหม่สำหรับบทนำนี้ได้', 'error');
      return;
    }
    const snap = session.turnSnapshots.find((s) => s.id === narratorMsg.snapshotId);
    const msgIdx = session.messages.findIndex((m) => m.id === narratorMsg.id);
    const precedingPlayer = msgIdx > 0 ? session.messages[msgIdx - 1] : null;
    if (!snap || !precedingPlayer || precedingPlayer.sender !== 'player') {
      showToast('ไม่พบคำสั่งก่อนหน้าสำหรับสุ่มคำตอบใหม่', 'error');
      return;
    }

    stopSpeech();
    const baseSession = restoreSessionFromSnapshot(session, snap);
    showToast('กำลังสุ่มผลลัพธ์ฉากนี้ใหม่...', 'info');
    await executeTurn(
      baseSession,
      precedingPlayer.text,
      precedingPlayer.mode || 'ic',
      narratorMsg.text,
    );
  };

  const handleEditPlayerTurn = async (playerMsg: StoryMessage, updatedText: string) => {
    if (isGenerating || isGeneratingOpening || isGeneratingRecap) return;
    const clean = updatedText.trim();
    if (!clean || !playerMsg.snapshotId) return;

    const snap = session.turnSnapshots.find((s) => s.id === playerMsg.snapshotId);
    if (!snap) {
      showToast('ไม่พบจุดบันทึกของจังหวะที่ต้องการแก้ไข', 'error');
      return;
    }

    stopSpeech();
    setEditingFeedMsgId(null);
    const baseSession = restoreSessionFromSnapshot(session, snap);
    await executeTurn(baseSession, clean, playerMsg.mode || 'ic');
  };

  const handleTriggerEpisodeRecap = async () => {
    if (isGenerating || isGeneratingOpening || isGeneratingRecap) return;
    setIsGeneratingRecap(true);
    try {
      const recap = settings.aiEnabled
        ? await requestAiEpisodeRecap(session, settings)
        : generateLocalEpisodeRecap(session);
      clearAiError();
      setActiveRecap(recap);
    } catch (err) {
      reportAiError(err, 'ไม่สามารถสร้างสรุปตอนได้', () => {
        handleTriggerEpisodeRecap();
      });
    } finally {
      setIsGeneratingRecap(false);
    }
  };

  const handleAdvanceEpisode = () => {
    if (!activeRecap) return;
    const completed = activeRecap;
    const nextEpisode = session.episodeNumber + 1;
    const nextArc =
      session.episodeNumber % 3 === 0 ? session.arcNumber + 1 : session.arcNumber;
    const nextTurn = session.turn + 1;

    const transitionMsg: StoryMessage = {
      id: `narrator-ep-${Date.now()}`,
      sender: 'narrator',
      turn: nextTurn,
      text: `*[ARC ${nextArc} · EPISODE ${nextEpisode} เริ่มต้นขึ้น]*\n\n*${completed.nextEpisodeHook || `เหตุการณ์หลังจบ "${completed.title}" กำลังเปิดฉากสู่บทใหม่ ณ ${session.location}`}*`,
      emotion: 'mystery',
      scenarioTag: `เปิด Episode ${nextEpisode}`,
      engineLabel: 'NEW EPISODE',
    };

    setSession((prev) => ({
      ...prev,
      turn: nextTurn,
      arcNumber: nextArc,
      episodeNumber: nextEpisode,
      turnsInEpisode: 1,
      episodeArchive: [completed, ...prev.episodeArchive],
      memories: [...prev.memories, `จบ EP.${completed.episodeNumber}: ${completed.title}`],
      messages: [...prev.messages, transitionMsg],
    }));

    setActiveRecap(null);
    showToast(`เข้าสู่ ARC ${nextArc} · Episode ${nextEpisode} แล้ว`, 'success');
  };

  const handleRefreshSuggestions = async () => {
    if (isRefreshingSug || isGenerating || isGeneratingOpening) return;
    setIsRefreshingSug(true);
    try {
      if (settings.aiEnabled) {
        const list = await requestAiSuggestions(session, settings);
        setSession((prev) => ({ ...prev, suggestedActions: list }));
      } else {
        const comp = session.cast[0];
        setSession((prev) => ({
          ...prev,
          suggestedActions: comp
            ? [
                `*หันไปปรึกษากับ ${comp.name} อย่างจริงจัง* "ลองเปลี่ยนแผนตอนนี้ดูไหม?"`,
                `*สำรวจร่องรอยรอบ ${prev.location.split('—')[0].trim()} เพิ่มเติม*`,
                `*ใช้สกิล "${prev.rpg.skills[0]?.name || 'วิเคราะห์สถานการณ์'}" ตรวจสอบจุดผิดปกติ*`,
              ]
            : [
                `*ตรวจสอบเส้นทางลับหรือเบาะแสใกล้ตัว*`,
                `*หยุดสังเกตการณ์ความเคลื่อนไหวรอบด้าน*`,
                `*ใช้สกิล "${prev.rpg.skills[0]?.name || 'วิเคราะห์สถานการณ์'}" ประเมินโอกาส*`,
              ],
        }));
      }
      clearAiError();
    } catch (err) {
      reportAiError(err, 'ไม่สามารถสุ่มทางเลือกใหม่ได้', () => {
        handleRefreshSuggestions();
      });
    } finally {
      setIsRefreshingSug(false);
    }
  };

  const handleResetWorld = () => {
    if (isGenerating || isGeneratingOpening || isGeneratingRecap) return;
    const prevSnippet = session.messages[0]?.text || '';
    showToast(`กำลังสุ่มฉากเปิดเรื่องใหม่ใน "${session.world.title}"...`, 'info');
    startWorldWithDynamicOpening(session.world, { prevSnippet });
  };

  const handleSaveSlot = (e: React.FormEvent) => {
    e.preventDefault();
    const label =
      newSaveLabel.trim() ||
      `${session.world.title} · ARC ${session.arcNumber} EP.${session.episodeNumber}`;
    const slot: SaveSlot = {
      id: `save-${Date.now()}`,
      label,
      savedAt: new Date().toLocaleString('th-TH'),
      session,
    };
    setSaves((prev) => [slot, ...prev]);
    setNewSaveLabel('');
    showToast(`บันทึก "${label}" เรียบร้อยแล้ว`, 'success');
  };

  const handleExportSession = () => {
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `novus-luminum-${session.world.id}-ep${session.episodeNumber}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('ดาวน์โหลดไฟล์เซฟ JSON แล้ว', 'success');
  };

  const handleImportSession = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as SessionState;
        if (!parsed.world || !Array.isArray(parsed.messages)) {
          throw new Error('ไฟล์เซฟไม่ถูกต้อง');
        }
        setSession(normalizeSession(parsed));
        setActiveTab('play');
        setStoryTab('stage');
        showToast(`นำเข้าเซฟ "${parsed.world.title}" สำเร็จ`, 'success');
      } catch {
        showToast('ไม่สามารถอ่านไฟล์เซฟได้ กรุณาตรวจสอบรูปแบบ JSON', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAddLore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLoreTitle.trim() || !newLoreDetail.trim()) return;
    setSession((prev) => ({
      ...prev,
      lorebook: [
        ...prev.lorebook,
        {
          id: `lore-${Date.now()}`,
          title: newLoreTitle.trim(),
          detail: newLoreDetail.trim(),
          createdAt: `EP.${prev.episodeNumber} · จังหวะ ${prev.turn}`,
        },
      ],
    }));
    setNewLoreTitle('');
    setNewLoreDetail('');
    showToast('เพิ่มบันทึก Lorebook แล้ว', 'success');
  };

  const handleAllocateStat = (stat: keyof RpgStats) => {
    if ((session.rpg.unspentPoints || 0) <= 0) return;
    soundEngine.playItemUse(settings.sfxEnabled);
    setSession((prev) => ({
      ...prev,
      rpg: {
        ...prev.rpg,
        unspentPoints: Math.max(0, (prev.rpg.unspentPoints || 0) - 1),
        stats: {
          ...prev.rpg.stats,
          [stat]: (prev.rpg.stats[stat] || 10) + 1,
        },
      },
    }));
    pushFloatingPopups([{ label: `+1 ${stat.toUpperCase()}`, tone: 'positive' }]);
    showToast(`อัปเกรดค่า ${stat.toUpperCase()} +1 แล้ว`, 'success');
  };

  const handleRestAtCamp = () => {
    const cost = 20;
    if (session.rpg.gold < cost) {
      showToast(`ต้องใช้ ${cost}G สำหรับการพักฟื้น (คุณมี ${session.rpg.gold}G)`, 'error');
      return;
    }
    if (session.rpg.hp >= session.rpg.maxHp && session.rpg.mp >= session.rpg.maxMp) {
      showToast('HP และ MP ของคุณเต็มอยู่แล้ว', 'info');
      return;
    }
    soundEngine.playHeal(settings.sfxEnabled);
    setSession((prev) => ({
      ...prev,
      rpg: {
        ...prev.rpg,
        hp: prev.rpg.maxHp,
        mp: prev.rpg.maxMp,
        gold: Math.max(0, prev.rpg.gold - cost),
      },
      memories: [...prev.memories, `พักฟื้นพลัง HP/MP จนเต็ม ณ ${prev.location} (-${cost}G)`],
    }));
    pushFloatingPopups([
      { label: 'HP / MP ฟื้นฟูเต็ม 100%', tone: 'positive' },
      { label: `-${cost}G`, tone: 'negative' },
    ]);
    showToast(`พักฟื้น HP และ MP เต็มแล้ว (-${cost}G)`, 'success');
  };

  const handleUseInventoryItem = (item: string) => {
    if (isBusy) return;
    soundEngine.playItemUse(settings.sfxEnabled);
    setStoryTab('stage');
    handleSendAction(`*หยิบ "${item}" ขึ้นมาใช้ในสถานการณ์นี้*`);
  };

  const handleAiPaintPortrait = async (charKey: string) => {
    if (paintingPortraitKey) return;
    const castMember = session.cast.find((c) => c.id === charKey);
    const target =
      charKey === 'protagonist'
        ? {
            name: session.world.protagonist.name,
            gender: session.world.protagonist.gender,
            role: session.world.protagonist.role,
            appearance: session.world.protagonist.appearance,
            mood: session.world.protagonist.persona,
          }
        : castMember
          ? {
              name: castMember.name,
              gender: castMember.gender,
              role: castMember.role,
              appearance: castMember.appearance,
              mood: castMember.mood,
            }
          : null;

    if (!target) return;
    setPaintingPortraitKey(charKey);
    try {
      const imageUrl = settings.aiEnabled
        ? await requestAiPortrait(
            { ...target, genre: session.world.genre },
            settings,
          )
        : generateProceduralAnimePortraitDataUrl({
            name: target.name,
            appearance: target.appearance,
            mood: target.mood,
            accentHex: session.world.accentHex,
          });
      setPortraitImages((prev) => ({ ...prev, [charKey]: imageUrl }));
      clearAiError();
      soundEngine.playItemUse(settings.sfxEnabled);
      showToast(`วาดภาพตัวละคร "${target.name}" เรียบร้อยแล้ว`, 'success');
    } catch (err) {
      if (!settings.aiEnabled) {
        const fallback = generateProceduralAnimePortraitDataUrl({
          name: target.name,
          appearance: target.appearance,
          mood: target.mood,
          accentHex: session.world.accentHex,
        });
        setPortraitImages((prev) => ({ ...prev, [charKey]: fallback }));
      }
      reportAiError(err, 'วาดภาพตัวละครด้วย AI ไม่สำเร็จ กรุณาลองใหม่', () => {
        handleAiPaintPortrait(charKey);
      });
    } finally {
      setPaintingPortraitKey(null);
    }
  };

  const handleAiPaintScene = async () => {
    if (isPaintingScene || isBusy) return;
    setIsPaintingScene(true);
    const latestText =
      session.messages
        .filter((m) => m.sender === 'narrator')
        .slice(-1)[0]?.text || session.location;

    try {
      const cgUrl = settings.aiEnabled
        ? await requestAiSceneCg(
            {
              title: session.world.title,
              genre: session.world.genre,
              location: session.location,
              mood: session.mood,
              narration: latestText,
            },
            settings,
          )
        : generateProceduralSceneCgDataUrl({
            location: session.location,
            mood: session.mood,
            accentHex: session.world.accentHex,
          });
      setSession((prev) => ({ ...prev, sceneCgUrl: cgUrl }));
      clearAiError();
      soundEngine.playItemUse(settings.sfxEnabled);
      showToast(`วาดภาพฉาก CG ณ ${session.location} สำเร็จ`, 'success');
    } catch (err) {
      if (!settings.aiEnabled) {
        const fallback = generateProceduralSceneCgDataUrl({
          location: session.location,
          mood: session.mood,
          accentHex: session.world.accentHex,
        });
        setSession((prev) => ({ ...prev, sceneCgUrl: fallback }));
      }
      reportAiError(err, 'วาดภาพฉาก CG ด้วย AI ไม่สำเร็จ กรุณาลองใหม่', () => {
        handleAiPaintScene();
      });
    } finally {
      setIsPaintingScene(false);
    }
  };

  const handleAddManualMapPin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newMapPinName.trim();
    if (!cleanName) return;
    if (session.map.nodes.some((n) => n.name === cleanName)) {
      showToast('มีจุดสถานที่นี้อยู่บนแผนที่แล้ว', 'error');
      return;
    }

    const angle = (session.map.nodes.length * 1.35) % (Math.PI * 2);
    const radius = 72 + (session.map.nodes.length % 3) * 26;
    const newNode: MapNode = {
      id: `node-${Date.now()}`,
      name: cleanName,
      type: newMapPinType,
      x: Math.max(46, Math.min(274, Math.round(160 + Math.cos(angle) * radius))),
      y: Math.max(38, Math.min(202, Math.round(120 + Math.sin(angle) * (radius * 0.65)))),
      connectedTo: [session.map.currentNodeId],
    };

    soundEngine.playItemUse(settings.sfxEnabled);
    setSession((prev) => ({
      ...prev,
      map: {
        ...prev.map,
        nodes: [...prev.map.nodes, newNode],
      },
    }));
    setNewMapPinName('');
    showToast(`ปักหมุด "${cleanName}" บนแผนที่แล้ว`, 'success');
  };

  const allWorlds = useMemo(() => [...customWorlds, ...PRESET_WORLDS], [customWorlds]);
  const primaryCast = session.cast[0] || null;
  const latestNarratorMsg = useMemo(() => {
    const list = session.messages.filter((m) => m.sender === 'narrator');
    return list[list.length - 1] || session.messages[0];
  }, [session.messages]);

  const hasPlayedTurns = session.messages.some((m) => m.sender === 'player');
  const tensionLabel =
    session.tension >= 75 ? 'วิกฤต' : session.tension >= 45 ? 'ตึงเครียด' : 'สงบ';
  const isBusy = isGenerating || isGeneratingOpening || isGeneratingRecap;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--nl-bg)] text-slate-100 transition-colors">
      {/* Top Bar: Brand wordmark — 3 concise single-line tabs — 1 primary CTA */}
      <header className="sticky top-0 z-30 h-14 px-4 lg:px-6 bg-[var(--nl-bg)]/95 backdrop-blur-md border-b border-[var(--nl-border)] flex items-center justify-between gap-4 lg:gap-8">
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-['Outfit'] text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            {APP_NAME}
          </span>
        </div>

        <nav className="flex items-center gap-2 sm:gap-5 overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'discover', label: 'ค้นพบเรื่อง', icon: Compass },
              { id: 'play', label: 'กำลังเล่น', icon: BookOpen },
              { id: 'settings', label: 'เซฟ & ตั้งค่า', icon: Settings },
            ] as const
          ).map((tab) => {
            const TabIcon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'text-white bg-white/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <TabIcon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setShowCreatorModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--nl-accent)] hover:bg-[var(--nl-accent-hover)] text-xs sm:text-sm font-medium text-white whitespace-nowrap shrink-0 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">สร้างเรื่องใหม่</span>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 min-w-0 flex flex-col">
        {activeTab === 'discover' && (
          <DiscoverView
            worlds={allWorlds}
            activeWorldId={session.world.id}
            onPlayWorld={handleSelectWorld}
            onCustomizeWorld={openWorldCustomizer}
            onDeleteWorld={(worldId) => {
              setCustomWorlds((prev) => prev.filter((w) => w.id !== worldId));
              showToast('ลบ Story Card แล้ว', 'info');
            }}
            onCreateNew={() => setShowCreatorModal(true)}
            onImportStoryCard={(imported) => {
              setCustomWorlds((prev) => [imported, ...prev]);
              showToast(`นำเข้า Story Card "${imported.title}" เรียบร้อยแล้ว`, 'success');
              startWorldWithDynamicOpening(imported, {
                skipDynamicCall: Boolean(imported.openingNarration),
              });
            }}
            onToast={showToast}
          />
        )}

        {activeTab === 'play' && (
          <div className="flex-1 flex flex-col max-w-5xl w-full mx-auto px-4 lg:px-8 py-4 gap-4">
            {/* Active Story Header & Per-Story Sub-Tabs (เนื้อเรื่อง / ตัวละคร / แผนที่ & ตอน) */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div className="min-w-0">
                <div className="text-sm sm:text-base font-semibold text-white truncate">
                  {session.world.title}
                </div>
                <div className="text-xs text-slate-400 truncate mt-0.5">
                  <span className="font-mono tabular-nums text-[#38bdf8]">
                    ARC {session.arcNumber} · EP.{session.episodeNumber}
                  </span>
                  <span aria-hidden="true"> · </span>
                  <span>{session.location}</span>
                </div>
              </div>

              <div className="inline-flex items-center p-1 rounded-xl bg-[#111520] border border-white/10 self-start md:self-auto overflow-x-auto">
                {(
                  [
                    { id: 'stage', label: 'เนื้อเรื่อง', icon: BookOpen },
                    { id: 'character', label: 'ตัวละคร', icon: User },
                    { id: 'map', label: 'แผนที่ & ตอน', icon: MapIcon },
                  ] as const
                ).map((sub) => {
                  const SubIcon = sub.icon;
                  const active = storyTab === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setStoryTab(sub.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                        active
                          ? 'bg-[#7c5cff] text-white'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      }`}
                    >
                      <SubIcon className="w-3.5 h-3.5" />
                      <span>{sub.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {storyTab === 'stage' && (
              <>
            {/* Play Stage Controls & Episode Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center p-1 rounded-xl bg-[#111520] border border-white/10">
                  <button
                    type="button"
                    onClick={() => setPlayViewMode('stage')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      playViewMode === 'stage'
                        ? 'bg-[#7c5cff] text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Tv className="w-3.5 h-3.5" />
                    <span>โหมดฉากอนิเมะ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlayViewMode('feed')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      playViewMode === 'feed'
                        ? 'bg-[#7c5cff] text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>โหมดบทความ</span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleResetWorld}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#111520] hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 disabled:opacity-50 whitespace-nowrap transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingOpening ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">สุ่มฉากเปิดใหม่</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="text-xs text-slate-400 font-mono tabular-nums">
                  จังหวะ {session.turnsInEpisode}/5
                </div>

                <button
                  type="button"
                  disabled={!hasPlayedTurns || isBusy}
                  onClick={handleTriggerEpisodeRecap}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#111520] hover:bg-[#192033] border border-[#38bdf8]/40 text-xs font-medium text-[#38bdf8] disabled:opacity-40 whitespace-nowrap transition-colors"
                >
                  <Film className={`w-3.5 h-3.5 ${isGeneratingRecap ? 'animate-pulse' : ''}`} />
                  <span>{isGeneratingRecap ? 'กำลังสรุปตอน...' : 'จบตอน & สรุป Recap'}</span>
                </button>
              </div>
            </div>

            {playViewMode === 'stage' ? (
              <VisualNovelStage
                session={session}
                portraitImages={portraitImages}
                speakingMsgId={speakingMsgId}
                isBusy={isBusy}
                typewriterEnabled={settings.typewriterEnabled}
                sfxEnabled={settings.sfxEnabled}
                ambientEnabled={settings.ambientEnabled}
                floatingPopups={floatingPopups}
                isPaintingPortrait={
                  paintingPortraitKey === (primaryCast ? primaryCast.id : 'protagonist')
                }
                isPaintingScene={isPaintingScene}
                milestoneEvent={milestoneEvent}
                onSpeakThai={handleSpeakThai}
                onRerollMessage={handleRerollMessage}
                onRewindToSnapshot={handleRewindToSnapshot}
                onEditPlayerTurn={handleEditPlayerTurn}
                onChangeSceneKey={(sceneKey) =>
                  setSession((prev) => ({ ...prev, sceneKey, sceneCgUrl: undefined }))
                }
                onAiPaintPortrait={handleAiPaintPortrait}
                onAiPaintScene={handleAiPaintScene}
                onClearSceneCg={() =>
                  setSession((prev) => ({ ...prev, sceneCgUrl: undefined }))
                }
                onToggleAmbient={() =>
                  setSettings((prev) => ({ ...prev, ambientEnabled: !prev.ambientEnabled }))
                }
                onUploadPortrait={(charKey, dataUrl) =>
                  setPortraitImages((prev) => ({ ...prev, [charKey]: dataUrl }))
                }
                onClearPortrait={(charKey) =>
                  setPortraitImages((prev) => {
                    const next = { ...prev };
                    delete next[charKey];
                    return next;
                  })
                }
                renderFormattedText={renderFormattedStoryText}
              />
            ) : (
              <>
                {/* Feed Mode Scene Summary Header */}
                <section className="rounded-2xl bg-[#111520] border border-white/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <AnimePortrait
                    size="lg"
                    name={primaryCast ? primaryCast.name : session.world.protagonist.name}
                    appearance={
                      primaryCast ? primaryCast.appearance : session.world.protagonist.appearance
                    }
                    role={primaryCast ? primaryCast.role : session.world.protagonist.role}
                    gender={primaryCast ? primaryCast.gender : session.world.protagonist.gender}
                    mood={session.mood}
                    emotionKey={latestNarratorMsg?.emotion || 'neutral'}
                    tension={session.tension}
                    affinity={primaryCast?.affinity}
                    relationshipTier={primaryCast?.relationshipTier}
                    milestoneEvent={primaryCast ? milestoneEvent : null}
                    customImageUrl={portraitImages[primaryCast ? primaryCast.id : 'protagonist']}
                    onUploadImage={(dataUrl) => {
                      const key = primaryCast ? primaryCast.id : 'protagonist';
                      setPortraitImages((prev) => ({ ...prev, [key]: dataUrl }));
                    }}
                    onClearImage={() => {
                      const key = primaryCast ? primaryCast.id : 'protagonist';
                      setPortraitImages((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      });
                    }}
                  />

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h1 className="text-base sm:text-lg font-semibold text-white">
                          {session.world.title}
                        </h1>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span>{session.location}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {primaryCast ? (
                              <>
                                {primaryCast.name} ({session.mood}) · ความสัมพันธ์{' '}
                                <span className="text-rose-300 font-mono tabular-nums">
                                  {primaryCast.affinity}%
                                </span>{' '}
                                ({primaryCast.relationshipTier})
                              </>
                            ) : (
                              'ฉายเดี่ยว'
                            )}
                          </span>
                        </div>
                      </div>

                      <select
                        value={session.sceneKey}
                        onChange={(e) =>
                          setSession((prev) => ({
                            ...prev,
                            sceneKey: e.target.value as SceneVisualKey,
                          }))
                        }
                        aria-label="เลือกฉากหลัง"
                        className="rounded-lg bg-[#090b10] border border-white/12 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-[#38bdf8]"
                      >
                        {Object.values(SCENE_BACKDROPS).map((sc) => (
                          <option key={sc.key} value={sc.key}>
                            ฉาก: {sc.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-300">
                      <span className="text-slate-500">เป้าหมาย: </span>
                      {session.objective}
                    </p>

                    <div className="flex items-center gap-3 pt-1">
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        ความตึงเครียด · {tensionLabel}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden max-w-xs">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${session.tension}%`,
                            backgroundColor:
                              session.tension >= 75
                                ? '#f43f5e'
                                : session.tension >= 45
                                  ? '#f59e0b'
                                  : '#38bdf8',
                          }}
                        />
                      </div>
                      <span className="text-xs font-mono tabular-nums text-slate-300">
                        {session.tension}%
                      </span>
                    </div>
                  </div>
                </section>

                {/* Story Feed */}
                <section className="flex-1 space-y-4">
                  {session.messages.map((msg, idx) => {
                    const isPlayer = msg.sender === 'player';
                    const emo =
                      EMOTION_PROFILES[msg.emotion || 'neutral'] || EMOTION_PROFILES.neutral;
                    const prevMsg = idx > 0 ? session.messages[idx - 1] : null;
                    const canReroll =
                      !isPlayer &&
                      !msg.isOpeningLoading &&
                      Boolean(msg.snapshotId) &&
                      prevMsg?.sender === 'player';

                    if (isPlayer) {
                      const isEditing = editingFeedMsgId === msg.id;
                      return (
                        <div
                          key={msg.id}
                          className="animate-nl-entry ml-auto max-w-2xl rounded-2xl bg-[#1a1f33] border border-[#7c5cff]/35 px-4 py-3.5 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                            <span className="font-medium text-violet-200">
                              {session.world.protagonist.name}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono tabular-nums">
                                {msg.mode === 'ooc' ? 'OOC' : 'IC'} · จังหวะ {msg.turn}
                              </span>
                              {msg.snapshotId && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setEditingFeedMsgId(msg.id);
                                    setEditingFeedDraft(msg.text);
                                  }}
                                  className="inline-flex items-center gap-1 text-slate-300 hover:text-white disabled:opacity-40"
                                  title="แก้ไขคำสั่งนี้และเล่นต่อใหม่"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>แก้ไข</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {isEditing ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleEditPlayerTurn(msg, editingFeedDraft);
                              }}
                              className="space-y-2"
                            >
                              <input
                                type="text"
                                value={editingFeedDraft}
                                onChange={(e) => setEditingFeedDraft(e.target.value)}
                                className="w-full rounded-lg bg-[#090b10] border border-white/15 px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-[#38bdf8]"
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingFeedMsgId(null)}
                                  className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-slate-300"
                                >
                                  ยกเลิก
                                </button>
                                <button
                                  type="submit"
                                  disabled={isBusy || !editingFeedDraft.trim()}
                                  className="px-3 py-1.5 rounded-lg bg-[#7c5cff] text-xs font-medium text-white disabled:opacity-50"
                                >
                                  บันทึก & เล่นต่อ
                                </button>
                              </div>
                            </form>
                          ) : (
                            <div className="space-y-2">{renderFormattedStoryText(msg.text)}</div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <article
                        key={msg.id}
                        className="animate-nl-entry rounded-2xl bg-[#111520] border border-white/10 p-4 sm:p-5 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/8">
                          <div className="flex items-center gap-3 min-w-0">
                            <AnimePortrait
                              size="sm"
                              name={primaryCast ? primaryCast.name : session.world.protagonist.name}
                              appearance={
                                primaryCast
                                  ? primaryCast.appearance
                                  : session.world.protagonist.appearance
                              }
                              role={primaryCast ? primaryCast.role : session.world.protagonist.role}
                              gender={
                                primaryCast ? primaryCast.gender : session.world.protagonist.gender
                              }
                              mood={session.mood}
                              emotionKey={emo.key}
                              tension={session.tension}
                              customImageUrl={
                                portraitImages[primaryCast ? primaryCast.id : 'protagonist']
                              }
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white truncate">
                                {primaryCast ? primaryCast.name : 'ผู้บรรยาย'}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                                <span className="font-mono tabular-nums">จังหวะ {msg.turn}</span>
                                <span aria-hidden="true">·</span>
                                <span style={{ color: emo.accentHex }}>{emo.label}</span>
                                {typeof msg.affinityDelta === 'number' && msg.affinityDelta !== 0 && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span
                                      className={`font-mono tabular-nums ${
                                        msg.affinityDelta > 0 ? 'text-rose-300' : 'text-slate-400'
                                      }`}
                                    >
                                      ความสัมพันธ์ {msg.affinityDelta > 0 ? '+' : ''}
                                      {msg.affinityDelta}
                                    </span>
                                  </>
                                )}
                                {msg.scenarioTag && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>{msg.scenarioTag}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {!msg.isOpeningLoading && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleSpeakThai(msg)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs whitespace-nowrap shrink-0 transition-colors ${
                                  speakingMsgId === msg.id
                                    ? 'bg-[#38bdf8]/15 border-[#38bdf8]/50 text-[#38bdf8]'
                                    : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
                                }`}
                                title="เสียงพากย์ภาษาไทย"
                              >
                                {speakingMsgId === msg.id ? (
                                  <VolumeX className="w-3.5 h-3.5" />
                                ) : (
                                  <Volume2 className="w-3.5 h-3.5" />
                                )}
                                <span>{speakingMsgId === msg.id ? 'หยุด' : 'พากย์ไทย'}</span>
                              </button>

                              {canReroll && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleRerollMessage(msg)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white disabled:opacity-40 whitespace-nowrap"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  <span>สุ่มคำตอบใหม่</span>
                                </button>
                              )}

                              {msg.snapshotId && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleRewindToSnapshot(msg.snapshotId!)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-rose-500/15 border border-white/10 hover:border-rose-400/40 text-xs text-slate-300 hover:text-rose-200 disabled:opacity-40 whitespace-nowrap"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>ย้อนจุดนี้</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="space-y-3">{renderFormattedStoryText(msg.text)}</div>
                      </article>
                    );
                  })}
                  <div ref={storyEndRef} />
                </section>
              </>
            )}

            {/* Suggested Actions + Dice Check + Composer (Shared across Stage & Feed) */}
            <section className="sticky bottom-0 z-20 bg-[var(--nl-bg)]/95 backdrop-blur-md pt-3 pb-2 border-t border-[var(--nl-border)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-400">ทางเลือกแนะนำ</span>
                <div className="flex items-center gap-3">
                  {/* 1d20 Stat Check Quick Bar */}
                  <div className="flex items-center gap-1.5">
                    <select
                      value={diceStat}
                      onChange={(e) => setDiceStat(e.target.value as keyof RpgStats)}
                      aria-label="เลือกค่าสเตตัสสำหรับทอยเต๋า"
                      className="rounded-lg bg-[var(--nl-surface)] border border-white/12 px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-[var(--nl-secondary)]"
                    >
                      <option value="str">STR ({session.rpg.stats.str})</option>
                      <option value="agi">AGI ({session.rpg.stats.agi})</option>
                      <option value="int">INT ({session.rpg.stats.int})</option>
                      <option value="cha">CHA ({session.rpg.stats.cha})</option>
                      <option value="lck">LCK ({session.rpg.stats.lck})</option>
                    </select>
                    <button
                      type="button"
                      disabled={isRollingDice || isBusy}
                      onClick={handleRollDiceCheck}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--nl-surface)] hover:bg-white/10 border border-white/15 text-xs text-slate-100 disabled:opacity-50 whitespace-nowrap ${
                        isRollingDice ? 'animate-nl-dice-tumble' : ''
                      }`}
                    >
                      <Dices className="w-3.5 h-3.5 text-[var(--nl-secondary)]" />
                      <span>ทอย 1d20</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isRefreshingSug || isBusy}
                    onClick={handleRefreshSuggestions}
                    className="inline-flex items-center gap-1 text-xs text-[var(--nl-secondary)] hover:text-white disabled:opacity-50 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshingSug ? 'animate-spin' : ''}`} />
                    <span>สุ่มทางเลือกใหม่</span>
                  </button>
                </div>
              </div>

              {lastDiceCheck && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--nl-surface)] border border-[var(--nl-secondary)]/40 text-xs">
                  <div className="flex items-center gap-2">
                    <Dices className="w-4 h-4 text-[var(--nl-secondary)] shrink-0" />
                    <span
                      className={`font-mono tabular-nums font-semibold ${
                        lastDiceCheck.isCritSuccess
                          ? 'text-amber-300'
                          : lastDiceCheck.isCritFail
                            ? 'text-rose-400'
                            : 'text-white'
                      }`}
                    >
                      {lastDiceCheck.label}
                    </span>
                    <span className="text-slate-400 hidden sm:inline">
                      · จะแนบผลเต๋าเข้ากับการกระทำถัดไป
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleSendAction()}
                      className="px-2.5 py-1 rounded-lg bg-[var(--nl-accent)] hover:bg-[var(--nl-accent-hover)] text-white font-medium whitespace-nowrap"
                    >
                      ส่งผลเต๋าเลย
                    </button>
                    <button
                      type="button"
                      onClick={() => setLastDiceCheck(null)}
                      className="p-1 text-slate-400 hover:text-white"
                      aria-label="ล้างผลเต๋า"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {aiErrorBanner && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl bg-rose-500/12 border border-rose-400/35 text-xs">
                  <div className="flex items-start gap-2 text-rose-100">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      <div className="font-semibold text-rose-200">
                        เชื่อมต่อระบบ AI ฟรีไม่สำเร็จ {aiErrorBanner.status ? `(${aiErrorBanner.status})` : ''}
                      </div>
                      <div className="text-rose-100/90">{aiErrorBanner.message}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-center">
                    {aiErrorBanner.canRetry && retryActionRef.current && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          const fn = retryActionRef.current;
                          if (fn) fn();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--nl-accent)] hover:bg-[var(--nl-accent-hover)] text-white font-medium whitespace-nowrap disabled:opacity-50"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>ลองใหม่</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveTab('settings')}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-slate-100 whitespace-nowrap"
                    >
                      ตั้งค่า
                    </button>
                    {settings.aiEnabled && (
                      <button
                        type="button"
                        onClick={() => {
                          setSettings((prev) => ({ ...prev, aiEnabled: false }));
                          clearAiError();
                          showToast(
                            'สลับเป็นโหมดออฟไลน์แล้ว สามารถส่งข้อความเพื่อเล่นต่อได้ทันที',
                            'success',
                          );
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 whitespace-nowrap"
                      >
                        ใช้โหมดออฟไลน์
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={clearAiError}
                      className="p-1 text-rose-200/80 hover:text-white"
                      aria-label="ปิดแจ้งเตือน"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {session.suggestedActions.map((sug, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleSendAction(sug)}
                    className="text-left p-2.5 rounded-xl bg-[var(--nl-surface)] hover:bg-[var(--nl-surface-elevated)] border border-white/10 hover:border-[var(--nl-accent)]/60 text-xs text-slate-200 line-clamp-2 disabled:opacity-50 transition-colors"
                  >
                    {sug}
                  </button>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendAction();
                }}
                className="flex flex-col sm:flex-row gap-2"
              >
                <div className="flex items-center p-1 rounded-xl bg-[var(--nl-surface)] border border-white/10 shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setInputMode('ic')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      inputMode === 'ic'
                        ? 'bg-[var(--nl-accent)] text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    IC · สวมบทบาท
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('ooc')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      inputMode === 'ooc'
                        ? 'bg-[var(--nl-secondary)] text-slate-950'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    OOC · กำกับฉาก
                  </button>
                </div>

                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    disabled={isBusy}
                    placeholder={
                      inputMode === 'ic'
                        ? `พิมพ์การกระทำหรือคำพูดของ ${session.world.protagonist.name}...`
                        : 'พิมพ์คำสั่งผู้กำกับเพื่อปรับเหตุการณ์ในเรื่อง...'
                    }
                    className="flex-1 rounded-xl bg-[var(--nl-surface)] border border-white/12 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-[var(--nl-accent)] focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={(!inputText.trim() && !lastDiceCheck) || isBusy}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--nl-accent)] hover:bg-[var(--nl-accent-hover)] text-sm font-medium text-white disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    <span>{isGenerating ? 'กำลังดำเนินเรื่อง...' : 'ส่ง'}</span>
                  </button>
                </div>
              </form>
            </section>
              </>
            )}

            {storyTab === 'character' && (
              <div className="space-y-6 py-1">
            {/* Protagonist RPG Sheet */}
            <section className="rounded-2xl bg-[var(--nl-surface)] border border-[var(--nl-border)] p-5 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <AnimePortrait
                    size="lg"
                    name={session.world.protagonist.name}
                    appearance={session.world.protagonist.appearance}
                    role={session.world.protagonist.role}
                    gender={session.world.protagonist.gender}
                    mood={session.world.protagonist.persona}
                    emotionKey={
                      session.messages.filter((m) => m.sender === 'player').slice(-1)[0]?.emotion
                    }
                    isPainting={paintingPortraitKey === 'protagonist'}
                    onAiPaint={() => handleAiPaintPortrait('protagonist')}
                    customImageUrl={portraitImages['protagonist']}
                    onUploadImage={(dataUrl) =>
                      setPortraitImages((prev) => ({ ...prev, protagonist: dataUrl }))
                    }
                    onClearImage={() =>
                      setPortraitImages((prev) => {
                        const next = { ...prev };
                        delete next.protagonist;
                        return next;
                      })
                    }
                  />
                  <div className="flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-white">
                        {session.world.protagonist.name}
                      </h2>
                      <span className="text-xs text-slate-400">
                        · {session.world.protagonist.gender}
                      </span>
                      <span className="text-xs font-mono tabular-nums text-[var(--nl-secondary)]">
                        · LV.{session.rpg.level}
                      </span>
                      {heroEvolvedNotice && (
                        <span className="inline-flex items-center gap-1 text-xs font-mono text-emerald-300">
                          · <TrendingUp className="w-3.5 h-3.5" /> พัฒนาตัวตนแล้ว
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-violet-300">{session.world.protagonist.role}</p>
                    <p className="text-xs text-slate-400">
                      รูปลักษณ์: {session.world.protagonist.appearance || 'ตามเนื้อเรื่อง'}
                    </p>
                    <p className="text-xs text-slate-400">
                      นิสัย: {session.world.protagonist.persona}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handleRestAtCamp}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--nl-bg)] hover:bg-white/10 border border-emerald-400/35 text-xs font-medium text-emerald-300 disabled:opacity-45 whitespace-nowrap shrink-0 transition-colors"
                  >
                    <Coffee className="w-3.5 h-3.5" />
                    <span>พักฟื้นเต็ม (20G)</span>
                  </button>
                </div>
              </div>

              {/* Vitals & Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">HP</span>
                    <span className="font-mono tabular-nums text-emerald-300">
                      {session.rpg.hp} / {session.rpg.maxHp}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{
                        width: `${Math.round((session.rpg.hp / Math.max(1, session.rpg.maxHp)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">MP</span>
                    <span className="font-mono tabular-nums text-sky-300">
                      {session.rpg.mp} / {session.rpg.maxMp}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-sky-500 rounded-full"
                      style={{
                        width: `${Math.round((session.rpg.mp / Math.max(1, session.rpg.maxMp)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">XP · Gold: {session.rpg.gold}G</span>
                    <span className="font-mono tabular-nums text-amber-300">
                      {session.rpg.xp} / {session.rpg.xpToNext}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full"
                      style={{
                        width: `${Math.round((session.rpg.xp / Math.max(1, session.rpg.xpToNext)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {(session.rpg.unspentPoints || 0) > 0 && (
                <div className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-amber-500/12 border border-amber-400/35 text-amber-200">
                  <span>คุณมีแต้มอัปเกรดสเตตัสจากการเลเวลอัป กด +1 ที่ค่าพลังด้านล่างได้เลย</span>
                  <span className="font-mono tabular-nums font-semibold">
                    คงเหลือ {session.rpg.unspentPoints} แต้ม
                  </span>
                </div>
              )}

              <div className="grid grid-cols-5 gap-2 pt-1">
                {(
                  [
                    ['str', 'STR', session.rpg.stats.str],
                    ['agi', 'AGI', session.rpg.stats.agi],
                    ['int', 'INT', session.rpg.stats.int],
                    ['cha', 'CHA', session.rpg.stats.cha],
                    ['lck', 'LCK', session.rpg.stats.lck],
                  ] as const
                ).map(([statKey, label, val]) => (
                  <div
                    key={label}
                    className="rounded-xl bg-[var(--nl-bg)] border border-white/10 py-2.5 px-2 text-center space-y-1"
                  >
                    <div className="text-[11px] font-mono text-slate-400">{label}</div>
                    <div className="text-base font-semibold font-mono tabular-nums text-white">
                      {val}
                    </div>
                    {(session.rpg.unspentPoints || 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => handleAllocateStat(statKey)}
                        className="w-full py-1 rounded-lg bg-[var(--nl-accent)] hover:bg-[var(--nl-accent-hover)] text-[11px] font-mono font-medium text-white transition-colors"
                      >
                        +1
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Skills, Items, Quests */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pt-3 border-t border-white/10">
                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold text-slate-300">สกิล (คลิกเพื่อใช้งาน)</h3>
                  <div className="space-y-2">
                    {session.rpg.skills.map((skill) => (
                      <button
                        key={skill.id}
                        type="button"
                        onClick={() => {
                          setStoryTab('stage');
                          handleSendAction(`*ใช้สกิล "${skill.name}"*`);
                        }}
                        className="w-full text-left rounded-xl bg-[var(--nl-bg)] hover:bg-white/5 border border-white/10 p-3 transition-colors"
                      >
                        <div className="flex items-center justify-between text-xs font-semibold text-white">
                          <span>{skill.name}</span>
                          <span className="font-mono tabular-nums text-sky-300">
                            {skill.mpCost} MP
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{skill.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold text-slate-300">
                    ไอเทมติดตัว (คลิกเพื่อใช้ในฉาก)
                  </h3>
                  <div className="space-y-1.5">
                    {session.items.length === 0 ? (
                      <p className="text-xs text-slate-500">ไม่มีไอเทมในกระเป๋า</p>
                    ) : (
                      session.items.map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleUseInventoryItem(item)}
                          className="w-full text-left flex items-center justify-between gap-2 rounded-xl bg-[var(--nl-bg)] hover:bg-white/5 border border-white/10 hover:border-[var(--nl-secondary)]/45 px-3 py-2 text-xs text-slate-200 disabled:opacity-50 transition-colors"
                        >
                          <span className="truncate">{item}</span>
                          <span className="text-[11px] text-[var(--nl-secondary)] shrink-0">
                            ใช้ไอเทม
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold text-slate-300">เควสและเป้าหมาย</h3>
                  <div className="space-y-1.5">
                    {session.rpg.quests.map((q) => (
                      <div
                        key={q.id}
                        className="rounded-xl bg-[var(--nl-bg)] border border-white/10 px-3 py-2 text-xs flex items-start justify-between gap-2"
                      >
                        <span
                          className={
                            q.status === 'completed'
                              ? 'line-through text-slate-500'
                              : 'text-slate-200'
                          }
                        >
                          {q.title}
                        </span>
                        <span
                          className={
                            q.status === 'completed'
                              ? 'text-emerald-400 shrink-0'
                              : 'text-amber-300 shrink-0'
                          }
                        >
                          {q.status === 'completed' ? 'สำเร็จ' : 'กำลังทำ'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Cast Directory & Affinity Progression */}
            <section className="rounded-2xl bg-[var(--nl-surface)] border border-[var(--nl-border)] p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Heart className="w-4 h-4 text-rose-400" />
                  <span>ความสัมพันธ์ & ตัวละครที่พบในเรื่อง ({session.cast.length})</span>
                </h2>
                <span className="text-xs text-slate-400">พัฒนาตามการกระทำและบทสนทนาในเรื่อง</span>
              </div>

              {session.cast.length === 0 ? (
                <p className="text-xs text-slate-400">
                  ขณะนี้คุณกำลังเดินทางแบบฉายเดี่ยว ตัวละครใหม่จะปรากฏขึ้นที่นี่เมื่อพบเจอในเนื้อเรื่อง
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {session.cast.map((char) => {
                    const aff = typeof char.affinity === 'number' ? char.affinity : 35;
                    const tier = char.relationshipTier || getRelationshipTier(aff);
                    const barColor =
                      aff >= 80
                        ? '#f43f5e'
                        : aff >= 60
                          ? '#a78bfa'
                          : aff >= 40
                            ? '#38bdf8'
                            : '#94a3b8';

                    return (
                      <div
                        key={char.id}
                        className="rounded-xl bg-[var(--nl-bg)] border border-white/10 p-4 space-y-3"
                      >
                        <div className="flex items-start gap-3.5">
                          <AnimePortrait
                            size="md"
                            name={char.name}
                            appearance={char.appearance}
                            role={char.role}
                            gender={char.gender}
                            mood={char.mood}
                            emotionKey={char.isPrimary ? latestNarratorMsg?.emotion : undefined}
                            tension={session.tension}
                            affinity={aff}
                            relationshipTier={tier}
                            isPainting={paintingPortraitKey === char.id}
                            onAiPaint={() => handleAiPaintPortrait(char.id)}
                            customImageUrl={portraitImages[char.id]}
                            onUploadImage={(dataUrl) =>
                              setPortraitImages((prev) => ({ ...prev, [char.id]: dataUrl }))
                            }
                            onClearImage={() =>
                              setPortraitImages((prev) => {
                                const next = { ...prev };
                                delete next[char.id];
                                return next;
                              })
                            }
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="text-sm font-semibold text-white">
                              {char.name}{' '}
                              <span className="text-xs font-normal text-slate-400">
                                · {char.gender}
                              </span>
                            </div>
                            <div className="text-xs text-[var(--nl-secondary)]">{char.role}</div>
                            <div className="text-xs text-amber-300">อารมณ์: {char.mood}</div>
                            {char.appearance && (
                              <p className="text-xs text-slate-400">{char.appearance}</p>
                            )}
                          </div>
                        </div>

                        {/* Affinity Bar */}
                        <div className="space-y-1.5 pt-2 border-t border-white/8">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-300">ระดับความสัมพันธ์: {tier}</span>
                            <span className="font-mono tabular-nums text-rose-300">{aff}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{ width: `${aff}%`, backgroundColor: barColor }}
                            />
                          </div>
                        </div>

                        {/* Trust Notes */}
                        {Array.isArray(char.trustNotes) && char.trustNotes.length > 0 && (
                          <div className="space-y-1 pt-1">
                            <div className="text-[11px] text-slate-500">ความทรงจำร่วมกัน</div>
                            <ul className="space-y-1">
                              {char.trustNotes.slice(-3).map((note, nIdx) => (
                                <li key={nIdx} className="text-xs text-slate-300">
                                  · {note}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Detailed Affinity Progression Log */}
            <section className="rounded-2xl bg-[#111520] border border-white/10 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <History className="w-4 h-4 text-[#38bdf8]" />
                    <span>ประวัติการเปลี่ยนแปลงความสัมพันธ์</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    บันทึกทุกเหตุการณ์และจังหวะที่ความรู้สึกของตัวละครเปลี่ยนแปลงตลอดเรื่อง
                  </p>
                </div>

                {session.cast.length > 1 && (
                  <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#090b10] border border-white/10 overflow-x-auto">
                    <button
                      type="button"
                      onClick={() => setAffinityFilterCharId('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                        affinityFilterCharId === 'all'
                          ? 'bg-[#7c5cff] text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      ทั้งหมด
                    </button>
                    {session.cast.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setAffinityFilterCharId(c.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                          affinityFilterCharId === c.id
                            ? 'bg-[#7c5cff] text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {(() => {
                const filteredHistory = (session.affinityHistory || [])
                  .filter(
                    (entry) =>
                      affinityFilterCharId === 'all' || entry.characterId === affinityFilterCharId,
                  )
                  .slice()
                  .reverse();

                if (filteredHistory.length === 0) {
                  return (
                    <p className="text-xs text-slate-400 py-3">
                      ยังไม่มีประวัติการเปลี่ยนแปลงความสัมพันธ์ — พูดคุยหรือตัดสินใจในเนื้อเรื่องเพื่อดูพัฒนาการที่นี่
                    </p>
                  );
                }

                return (
                  <div className="divide-y divide-white/8 border-t border-white/8 max-h-96 overflow-y-auto pr-1">
                    {filteredHistory.map((entry) => {
                      const isPositive = entry.delta > 0;
                      const isNegative = entry.delta < 0;
                      return (
                        <div
                          key={entry.id}
                          className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                              <span className="font-mono tabular-nums text-[#38bdf8]">
                                จังหวะ {entry.turn}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                ARC {entry.arcNumber} EP.{entry.episodeNumber}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-medium text-white">{entry.characterName}</span>
                              <span aria-hidden="true">·</span>
                              <span className="text-slate-300">{entry.tier}</span>
                            </div>
                            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                              {entry.description}
                            </p>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 self-start sm:self-center text-xs font-mono tabular-nums">
                            <span
                              className={
                                isPositive
                                  ? 'text-emerald-300'
                                  : isNegative
                                    ? 'text-rose-400'
                                    : 'text-slate-400'
                              }
                            >
                              {isPositive
                                ? `เพิ่มขึ้น +${entry.delta}%`
                                : isNegative
                                  ? `ลดลง ${entry.delta}%`
                                  : 'เริ่มต้น'}
                            </span>
                            <span className="text-slate-400">
                              {entry.delta === 0
                                ? `${entry.newAffinity}%`
                                : `${entry.previousAffinity}% → ${entry.newAffinity}%`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </section>
              </div>
            )}

            {storyTab === 'map' && (
              <div className="space-y-6 py-1">
            {/* Episode Archive */}
            <section className="rounded-2xl bg-[#111520] border border-white/10 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Film className="w-4 h-4 text-[#7c5cff]" />
                    <span>คลังตอนที่จบแล้ว (Episode Archive)</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ปัจจุบัน: ARC {session.arcNumber} · EP.{session.episodeNumber} (จังหวะ{' '}
                    {session.turnsInEpisode}/5)
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!hasPlayedTurns || isBusy}
                  onClick={handleTriggerEpisodeRecap}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-[#38bdf8]/40 text-xs font-medium text-[#38bdf8] disabled:opacity-40"
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>สรุป Episode ปัจจุบัน</span>
                </button>
              </div>

              {session.episodeArchive.length === 0 ? (
                <p className="text-xs text-slate-400">
                  ยังไม่มีตอนที่จบสมบูรณ์ กด "จบตอน & สรุป Recap" ในหน้าเล่นเรื่องเพื่อบันทึกสรุปตอนและขึ้น Episode ใหม่
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {session.episodeArchive.map((ep) => (
                    <div
                      key={ep.id}
                      className="rounded-xl bg-[#090b10] border border-white/10 p-4 space-y-2.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono tabular-nums text-[#38bdf8]">
                          ARC {ep.arcNumber} · EP.{ep.episodeNumber}
                        </span>
                        <span className="font-mono tabular-nums text-slate-500">
                          ถึงจังหวะ {ep.completedAtTurn}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-white">{ep.title}</h3>
                      <ul className="space-y-1 text-xs text-slate-300">
                        {ep.recapBullets.map((b, bIdx) => (
                          <li key={bIdx}>· {b}</li>
                        ))}
                      </ul>
                      {ep.affinityHighlight && (
                        <div className="text-xs text-rose-300 pt-1 border-t border-white/8">
                          ความสัมพันธ์: {ep.affinityHighlight}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Interactive Map */}
            <section className="rounded-2xl bg-[var(--nl-surface)] border border-[var(--nl-border)] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-white">แผนที่พื้นที่ที่ค้นพบ</h2>
                  <p className="text-xs text-slate-400">
                    ตำแหน่งปัจจุบัน: {session.location} (คลิกจุดที่เคยไปเพื่อเดินทางกลับ)
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  {session.map.nodes.length} แห่ง
                </span>
              </div>

              <form onSubmit={handleAddManualMapPin} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newMapPinName}
                  onChange={(e) => setNewMapPinName(e.target.value)}
                  placeholder="ชื่อสถานที่ใหม่สำหรับปักหมุดบนแผนที่..."
                  className="flex-1 rounded-xl bg-[var(--nl-bg)] border border-white/12 px-3 py-2 text-xs text-white"
                />
                <select
                  value={newMapPinType}
                  onChange={(e) => setNewMapPinType(e.target.value as MapNode['type'])}
                  aria-label="ประเภทสถานที่"
                  className="rounded-xl bg-[var(--nl-bg)] border border-white/12 px-3 py-2 text-xs text-slate-200"
                >
                  <option value="hub">ย่านชุมชน / ฐาน</option>
                  <option value="mystery">พื้นที่ลึกลับ</option>
                  <option value="danger">เขตอันตราย</option>
                  <option value="sanctuary">จุดปลอดภัย</option>
                </select>
                <button
                  type="submit"
                  disabled={!newMapPinName.trim()}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--nl-accent)] hover:bg-[var(--nl-accent-hover)] text-xs font-medium text-white disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>ปักหมุดสถานที่</span>
                </button>
              </form>

              <div className="rounded-xl bg-[var(--nl-bg)] border border-white/10 p-3 overflow-x-auto">
                <svg viewBox="0 0 320 240" className="w-full max-w-xl h-56 mx-auto">
                  {session.map.nodes.map((node) =>
                    node.connectedTo.map((targetId) => {
                      const target = session.map.nodes.find((n) => n.id === targetId);
                      if (!target) return null;
                      return (
                        <line
                          key={`${node.id}-${target.id}`}
                          x1={node.x}
                          y1={node.y}
                          x2={target.x}
                          y2={target.y}
                          stroke="rgba(148,163,184,0.28)"
                          strokeWidth="1.5"
                          strokeDasharray="3 3"
                        />
                      );
                    }),
                  )}

                  {session.map.nodes.map((node) => {
                    const isCurrent = node.id === session.map.currentNodeId;
                    return (
                      <g
                        key={node.id}
                        className="cursor-pointer"
                        onClick={() => {
                          if (!isCurrent) {
                            setStoryTab('stage');
                            handleSendAction(`*เดินทางไปยัง ${node.name}*`);
                          }
                        }}
                      >
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={isCurrent ? 9 : 6.5}
                          fill={
                            isCurrent
                              ? 'var(--nl-accent)'
                              : node.type === 'danger'
                                ? '#7f1d1d'
                                : node.type === 'sanctuary'
                                  ? '#065f46'
                                  : '#1e293b'
                          }
                          stroke={isCurrent ? 'var(--nl-secondary)' : '#64748b'}
                          strokeWidth="2"
                        />
                        <text
                          x={node.x}
                          y={node.y + 18}
                          textAnchor="middle"
                          className="fill-slate-300 text-[9px]"
                        >
                          {node.name.slice(0, 24)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Memory Log */}
              <section className="rounded-2xl bg-[#111520] border border-white/10 p-5 space-y-3">
                <h2 className="text-sm font-semibold text-white">บันทึกความทรงจำ</h2>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {session.memories.map((mem, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl bg-[#090b10] border border-white/8 px-3.5 py-2.5 text-xs text-slate-300"
                    >
                      <span className="font-mono tabular-nums text-slate-500 mr-2">
                        {String(idx + 1).padStart(2, '0')}.
                      </span>
                      {mem}
                    </div>
                  ))}
                </div>
              </section>

              {/* Lorebook */}
              <section className="rounded-2xl bg-[#111520] border border-white/10 p-5 space-y-4">
                <h2 className="text-sm font-semibold text-white">สารานุกรมโลก (Lorebook)</h2>
                <form onSubmit={handleAddLore} className="space-y-2">
                  <input
                    type="text"
                    value={newLoreTitle}
                    onChange={(e) => setNewLoreTitle(e.target.value)}
                    placeholder="หัวข้อ Lore ใหม่ (เช่น ชื่อองค์กร, ศาสตราวุธ)..."
                    className="w-full rounded-xl bg-[#090b10] border border-white/12 px-3 py-2 text-xs text-white"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newLoreDetail}
                      onChange={(e) => setNewLoreDetail(e.target.value)}
                      placeholder="รายละเอียด..."
                      className="flex-1 rounded-xl bg-[#090b10] border border-white/12 px-3 py-2 text-xs text-white"
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-2 rounded-xl bg-[#7c5cff] hover:bg-[#6d4aff] text-xs font-medium text-white shrink-0"
                    >
                      เพิ่ม
                    </button>
                  </div>
                </form>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {session.lorebook.map((lore) => (
                    <div
                      key={lore.id}
                      className="rounded-xl bg-[#090b10] border border-white/8 p-3 space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white">{lore.title}</span>
                        <span className="text-slate-500 font-mono">{lore.createdAt}</span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{lore.detail}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-5xl w-full mx-auto px-4 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Save Slots */}
            <section className="rounded-2xl bg-[#111520] border border-white/10 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">คลังเซฟเกม</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportSession}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>ส่งออก</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => importFileRef.current?.click()}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>นำเข้า</span>
                  </button>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept="application/json"
                    onChange={handleImportSession}
                    className="hidden"
                  />
                </div>
              </div>

              <form onSubmit={handleSaveSlot} className="flex gap-2">
                <input
                  type="text"
                  value={newSaveLabel}
                  onChange={(e) => setNewSaveLabel(e.target.value)}
                  placeholder={`ตั้งชื่อเซฟ (ค่าเริ่มต้น: ${session.world.title})`}
                  className="flex-1 rounded-xl bg-[#090b10] border border-white/12 px-3 py-2 text-xs text-white"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#7c5cff] hover:bg-[#6d4aff] text-xs font-medium text-white shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>บันทึก</span>
                </button>
              </form>

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {saves.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    ยังไม่มีรายการเซฟที่บันทึกไว้
                  </p>
                ) : (
                  saves.map((slot) => (
                    <div
                      key={slot.id}
                      className="rounded-xl bg-[#090b10] border border-white/10 p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">
                          {slot.label}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {slot.savedAt} · ARC {slot.session.arcNumber || 1} EP.
                          {slot.session.episodeNumber || slot.session.turn}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setSession(normalizeSession(slot.session));
                            setActiveTab('play');
                            setStoryTab('stage');
                            showToast(`โหลดเซฟ "${slot.label}" แล้ว`, 'success');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-[#7c5cff] text-xs text-slate-200 hover:text-white transition-colors"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>โหลด</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSaves((prev) => prev.filter((s) => s.id !== slot.id))}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400"
                          aria-label="ลบเซฟ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Studio Settings */}
            <section className="rounded-2xl bg-[var(--nl-surface)] border border-[var(--nl-border)] p-5 space-y-4">
              <h2 className="text-sm font-semibold text-white">ตั้งค่าสตูดิโอ ธีม & เสียงพากย์</h2>

              {/* Theme Mode Switch */}
              <div className="rounded-xl bg-[var(--nl-bg)] border border-white/10 p-3.5 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Palette className="w-4 h-4 text-[var(--nl-secondary)]" />
                  <span>โทนสีสตูดิโอ</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettings((prev) => ({ ...prev, themeMode: 'luminum' }))}
                    className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                      settings.themeMode !== 'crimson'
                        ? 'bg-[#7c5cff] border-[#7c5cff] text-white'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    Luminum Obsidian
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings((prev) => ({ ...prev, themeMode: 'crimson' }))}
                    className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                      settings.themeMode === 'crimson'
                        ? 'bg-[#e11d48] border-[#e11d48] text-white'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    Crimson Dark
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-[var(--nl-bg)] border border-white/10 p-3.5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white">โหมดสร้างเรื่องและวาดภาพด้วย AI ฟรี</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {aiServerConfigured === false
                      ? 'ระบบพร้อมใช้งาน AI ฟรีแบบไม่ใช้คีย์ หรือใส่ GEMINI_API_KEY ใน Settings > Secrets'
                      : 'เชื่อมต่อ AI ฟรีผ่านเซิร์ฟเวอร์อัตโนมัติ (แบบผสม Hybrid)'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.aiEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSettings((prev) => ({ ...prev, aiEnabled: checked }));
                    if (!checked) clearAiError();
                  }}
                  className="w-4 h-4 accent-[var(--nl-accent)]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs text-slate-300">ระบบ AI ฟรีที่ใช้งาน (Free AI Mode)</label>
                <select
                  value={settings.freeAiMode}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      freeAiMode: e.target.value as AppSettings['freeAiMode'],
                    }))
                  }
                  className="w-full rounded-xl bg-[var(--nl-bg)] border border-white/12 px-3 py-2 text-xs text-white"
                >
                  <option value="hybrid">แบบผสม: Gemini ฟรี + AI ฟรีสำรองอัตโนมัติ (แนะนำ)</option>
                  <option value="community">Free Community AI (ไม่ใช้คีย์ · ฟรี 100%)</option>
                  <option value="gemini">Gemini ฟรีเท่านั้น (ใช้ GEMINI_API_KEY)</option>
                </select>
                <p className="text-[11px] text-slate-500">
                  แบบผสมจะใช้ Gemini ฟรีเป็นหลัก และสลับไปใช้ Free Community AI อัตโนมัติทันทีหากโปรเจกต์ติดข้อจำกัด Free Tier (403)
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs text-slate-300">โมเดล Gemini (สำหรับคีย์ที่รองรับ Free Tier)</label>
                <select
                  value={settings.geminiModel}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      geminiModel: e.target.value as AppSettings['geminiModel'],
                    }))
                  }
                  className="w-full rounded-xl bg-[var(--nl-bg)] border border-white/12 px-3 py-2 text-xs text-white"
                >
                  <option value="gemini-4-hydrogen">Gemini 4 Hydrogen (โมเดลฟรีที่ดีที่สุด · แนะนำ)</option>
                  <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (โมเดลฟรี · ประหยัดและไว)</option>
                </select>
                <p className="text-[11px] text-slate-500">
                  ใช้โมเดลฟรีตัวท็อป Gemini 4 Hydrogen พร้อม Thinking Mode อัตโนมัติเมื่อคีย์รองรับ
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs text-slate-300">ความยาวบทบรรยาย</label>
                  <select
                    value={settings.proseLength}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        proseLength: e.target.value as AppSettings['proseLength'],
                      }))
                    }
                    className="w-full rounded-xl bg-[var(--nl-bg)] border border-white/12 px-3 py-2 text-xs text-white"
                  >
                    <option value="concise">กระชับ (1-2 ย่อหน้า)</option>
                    <option value="balanced">สมดุล (2-3 ย่อหน้า)</option>
                    <option value="rich">ละเอียด (3-4 ย่อหน้า)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs text-slate-300">ระดับความเข้มข้น</label>
                  <select
                    value={settings.dramaIntensity}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        dramaIntensity: e.target.value as AppSettings['dramaIntensity'],
                      }))
                    }
                    className="w-full rounded-xl bg-[var(--nl-bg)] border border-white/12 px-3 py-2 text-xs text-white"
                  >
                    <option value="grounded">สมจริง สุขุม</option>
                    <option value="dramatic">สมดุลอนิเมะ</option>
                    <option value="intense">ดราม่าเข้มข้น</option>
                  </select>
                </div>
              </div>

              {/* Typewriter & Sound Effects */}
              <div className="rounded-xl bg-[var(--nl-bg)] border border-white/10 p-3.5 space-y-2.5">
                <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                  <span>เอฟเฟกต์พิมพ์ดีดทีละตัวอักษร (Typewriter)</span>
                  <input
                    type="checkbox"
                    checked={settings.typewriterEnabled}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, typewriterEnabled: e.target.checked }))
                    }
                    className="w-4 h-4 accent-[var(--nl-accent)]"
                  />
                </label>
                <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                  <span>เสียงเอฟเฟกต์ (ทอยเต๋า, อัปเลเวล, ความสัมพันธ์)</span>
                  <input
                    type="checkbox"
                    checked={settings.sfxEnabled}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, sfxEnabled: e.target.checked }))
                    }
                    className="w-4 h-4 accent-[var(--nl-accent)]"
                  />
                </label>
                <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                  <span>เสียงบรรยากาศอนิเมะ (Ambient Audio)</span>
                  <input
                    type="checkbox"
                    checked={settings.ambientEnabled}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, ambientEnabled: e.target.checked }))
                    }
                    className="w-4 h-4 accent-[var(--nl-accent)]"
                  />
                </label>
              </div>

              <div className="rounded-xl bg-[var(--nl-bg)] border border-white/10 p-3.5 space-y-3">
                <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                  <span>เล่นเสียงพากย์ภาษาไทยอัตโนมัติทุกตอน</span>
                  <input
                    type="checkbox"
                    checked={settings.ttsAutoPlay}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, ttsAutoPlay: e.target.checked }))
                    }
                    className="w-4 h-4 accent-[var(--nl-secondary)]"
                  />
                </label>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>ความเร็วเสียงพากย์</span>
                    <span className="font-mono tabular-nums">{settings.ttsRate.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="1.4"
                    step="0.1"
                    value={settings.ttsRate}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        ttsRate: parseFloat(e.target.value),
                      }))
                    }
                    className="w-full accent-[var(--nl-secondary)]"
                  />
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Modals */}
      <WorldCreatorModal
        open={showCreatorModal}
        settings={settings}
        onClose={() => setShowCreatorModal(false)}
        onCreated={(newWorld, skipDynamicCall) => {
          setCustomWorlds((prev) => [newWorld, ...prev]);
          startWorldWithDynamicOpening(newWorld, { skipDynamicCall });
        }}
        onToast={showToast}
      />

      <WorldCustomizerModal
        draft={customizeDraft}
        onChange={setCustomizeDraft}
        saveAsCopy={saveCustomizedAsCopy}
        onToggleSaveAsCopy={setSaveCustomizedAsCopy}
        onClose={() => setCustomizeDraft(null)}
        onSubmit={handleLaunchCustomizedWorld}
      />

      <EpisodeRecapModal
        recap={activeRecap}
        onClose={() => setActiveRecap(null)}
        onAdvanceEpisode={handleAdvanceEpisode}
      />

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-xl px-4 py-3 text-xs font-medium shadow-xl border ${
            toast.type === 'error'
              ? 'bg-rose-950/95 border-rose-500/50 text-rose-100'
              : toast.type === 'success'
                ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-100'
                : 'bg-[#161c2c]/95 border-white/15 text-slate-100'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
