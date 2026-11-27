import { EMOTION_PROFILES } from '../data/presets';
import type {
  AppSettings,
  DynamicOpeningResult,
  EmotionKey,
  EpisodeSummary,
  SessionState,
  TurnResult,
  WorldConfig,
} from '../types';
import { detectEmotionFromText } from '../utils/storyEngine';

export class ApiError extends Error {
  status: number;
  code?: string;
  detail?: string;

  constructor(message: string, status: number, code?: string, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function compactSessionForApi(session: SessionState) {
  return {
    turn: session.turn,
    arcNumber: session.arcNumber,
    episodeNumber: session.episodeNumber,
    turnsInEpisode: session.turnsInEpisode,
    location: session.location,
    objective: session.objective,
    mood: session.mood,
    tension: session.tension,
    items: session.items,
    memories: session.memories.slice(-8),
    lorebook: session.lorebook.slice(-8).map((l) => ({
      title: l.title,
      detail: l.detail,
    })),
    cast: session.cast.map((c) => ({
      id: c.id,
      name: c.name,
      gender: c.gender,
      role: c.role,
      appearance: c.appearance,
      mood: c.mood,
      affinity: c.affinity,
      relationshipTier: c.relationshipTier,
      trustNotes: (c.trustNotes || []).slice(-4),
      isPrimary: c.isPrimary,
    })),
    messages: session.messages.slice(-10).map((m) => ({
      sender: m.sender,
      mode: m.mode,
      text: m.text,
    })),
    rpg: session.rpg,
    world: {
      id: session.world.id,
      title: session.world.title,
      genre: session.world.genre,
      worldRules: session.world.worldRules,
      worldBoundaries: session.world.worldBoundaries,
      powerSystem: session.world.powerSystem,
      location: session.world.location,
      initialObjective: session.world.initialObjective,
      hasCompanion: session.world.hasCompanion,
      protagonist: session.world.protagonist,
      companion: session.world.companion,
    },
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const rawText = await res.text().catch(() => '');
  let data: Record<string, unknown> = {};
  if (rawText) {
    try {
      data = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  if (!res.ok) {
    const serverMsg = typeof data?.error === 'string' ? data.error : '';
    const code = typeof data?.code === 'string' ? data.code : undefined;
    const detail = typeof data?.detail === 'string' ? data.detail : undefined;
    if (serverMsg) {
      throw new ApiError(serverMsg, res.status, code, detail);
    }
    if (res.status === 403) {
      throw new ApiError(
        'การเชื่อมต่อถูกปฏิเสธ (403 Forbidden) กรุณาตรวจสอบ GEMINI_API_KEY ใน Settings > Secrets หรือรีเฟรชหน้าเว็บใหม่ (สามารถสลับเป็นโหมดออฟไลน์เพื่อเล่นต่อได้)',
        403,
        'PROXY_FORBIDDEN',
      );
    }
    throw new ApiError(`เซิร์ฟเวอร์ตอบกลับผิดพลาด (${res.status})`, res.status, code, detail);
  }
  return data as T;
}

export async function fetchHealth(): Promise<{ ok: boolean; aiConfigured: boolean }> {
  const res = await fetch('/api/health');
  if (!res.ok) return { ok: false, aiConfigured: false };
  return res.json();
}

export async function requestAiWorldBuilder(params: {
  promptText: string;
  proName: string;
  proGender: string;
  hasCompanion: boolean;
  compName: string;
  compGender: string;
  boundaries: string;
  settings: AppSettings;
}): Promise<WorldConfig> {
  const data = await postJson<{ world: WorldConfig }>('/api/gemini/world-builder', params);
  return data.world;
}

export async function requestAiDynamicOpening(
  world: WorldConfig,
  settings: AppSettings,
  previousSnippet = '',
): Promise<DynamicOpeningResult> {
  const data = await postJson<{ opening: DynamicOpeningResult }>('/api/gemini/dynamic-opening', {
    world,
    settings,
    previousSnippet,
  });
  const op = data.opening;
  const emoKey = String(op.emotion || '').toLowerCase() as EmotionKey;
  const resolvedEmotion: EmotionKey = EMOTION_PROFILES[emoKey]
    ? emoKey
    : detectEmotionFromText(op.openingNarration || '', op.mood || '').key;

  return {
    scenarioTag: String(op.scenarioTag || 'ฉากเปิดสุ่มใหม่').trim(),
    location: String(op.location || world.location || 'จุดเริ่มต้น').trim(),
    mood: String(op.mood || world.companion?.initialMood || 'ตื่นตัว').trim(),
    emotion: resolvedEmotion,
    objective: String(op.objective || world.initialObjective || 'สำรวจสถานการณ์ตรงหน้า').trim(),
    openingNarration: String(op.openingNarration || '').trim(),
    suggestedActions: Array.isArray(op.suggestedActions)
      ? op.suggestedActions.slice(0, 3).map((s) => String(s).trim()).filter(Boolean)
      : world.initialSuggestions || [],
    engineLabel: op.engineLabel || 'DYNAMIC OPENING · GEMINI',
  };
}

export async function requestAiTurn(
  session: SessionState,
  userInput: string,
  mode: 'ic' | 'ooc',
  settings: AppSettings,
  rerollPrevious = '',
): Promise<TurnResult> {
  const data = await postJson<{ turnResult: TurnResult }>('/api/gemini/turn', {
    session: compactSessionForApi(session),
    userInput,
    mode,
    settings,
    rerollPrevious,
  });
  const tr = data.turnResult;
  const emoKey = String(tr.emotion || '').toLowerCase() as EmotionKey;
  const resolvedEmotion: EmotionKey = EMOTION_PROFILES[emoKey]
    ? emoKey
    : detectEmotionFromText(tr.narration || '', tr.mood || '').key;

  return {
    ...tr,
    emotion: resolvedEmotion,
    mood: String(tr.mood || session.mood || 'ตั้งใจ').trim(),
    tension:
      typeof tr.tension === 'number'
        ? Math.max(0, Math.min(100, Math.round(tr.tension)))
        : session.tension,
    affinityDelta:
      typeof tr.affinityDelta === 'number'
        ? Math.max(-15, Math.min(15, Math.round(tr.affinityDelta)))
        : 0,
    suggestedActions: Array.isArray(tr.suggestedActions)
      ? tr.suggestedActions.slice(0, 3).map((s) => String(s).trim()).filter(Boolean)
      : session.suggestedActions,
  };
}

export async function requestAiEpisodeRecap(
  session: SessionState,
  settings: AppSettings,
): Promise<EpisodeSummary> {
  const data = await postJson<{
    recap: {
      title: string;
      recapBullets: string[];
      affinityHighlight: string;
      nextEpisodeHook: string;
    };
  }>('/api/gemini/episode-recap', { session: compactSessionForApi(session), settings });

  return {
    id: `ep-${Date.now()}`,
    arcNumber: session.arcNumber,
    episodeNumber: session.episodeNumber,
    title: data.recap.title || `Episode ${session.episodeNumber}`,
    recapBullets: Array.isArray(data.recap.recapBullets) ? data.recap.recapBullets : [],
    affinityHighlight: data.recap.affinityHighlight || '',
    nextEpisodeHook: data.recap.nextEpisodeHook || '',
    completedAtTurn: session.turn,
  };
}

export async function requestAiSuggestions(
  session: SessionState,
  settings: AppSettings,
): Promise<string[]> {
  const data = await postJson<{ suggestedActions: string[] }>('/api/gemini/suggestions', {
    session: compactSessionForApi(session),
    settings,
  });
  return data.suggestedActions;
}

export async function requestAiPortrait(
  params: {
    name: string;
    gender: string;
    role: string;
    appearance: string;
    mood: string;
    genre: string;
  },
  settings: AppSettings,
): Promise<string> {
  const data = await postJson<{ imageUrl: string }>('/api/gemini/portrait', {
    ...params,
    settings,
  });
  return data.imageUrl;
}

export async function requestAiSceneCg(
  params: {
    title: string;
    genre: string;
    location: string;
    mood: string;
    narration: string;
  },
  settings: AppSettings,
): Promise<string> {
  const data = await postJson<{ imageUrl: string }>('/api/gemini/scene-cg', {
    ...params,
    settings,
  });
  return data.imageUrl;
}
