import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DEFAULT_FREE_MODEL = 'gemini-4-hydrogen';
const ALLOWED_MODELS = new Set(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);
const ALLOWED_FREE_MODES = new Set(['hybrid', 'gemini', 'community']);
const POLLINATIONS_TEXT_ENDPOINT = 'https://text.pollinations.ai/';
const ALLOWED_SCENE_KEYS = new Set([
  'isekai_plaza',
  'hunter_rooftop',
  'royal_palace',
  'cyberpunk_bar',
  'mystic_shrine',
]);

const OPENING_SCENARIO_SEEDS = [
  'เหตุการณ์ไม่คาดฝันยามค่ำคืนหรือช่วงพลบค่ำที่เปลี่ยนบรรยากาศทันที',
  'การพบเบาะแส วัตถุปริศนา หรือสัญญาณลับที่ไม่ควรมีอยู่ตรงนั้น',
  'การเผชิญหน้าหรือบทสนทนาที่ตึงเครียดท่ามกลางสถานที่สำคัญของโลกนี้',
  'เหตุฉุกเฉินขนาดย่อม สภาพอากาศแปรปรวน หรือความโกลาหลรอบข้างที่บีบให้ต้องตัดสินใจ',
  'จังหวะเงียบสงบก่อนพายุใหญ่ที่มีข่าวลือหรือข้อเสนอสุดอันตรายเข้ามาเกี่ยวข้อง',
  'ความเข้าใจผิด การสะกดรอย หรือการถูกจับตามองจากบุคคลปริศนาในพื้นที่',
  'การถูกดึงเข้าไปพัวพันกับภารกิจลับหรือเหตุการณ์แปลกประหลาดตั้งแต่ก้าวแรก',
  'การพบปะในสถานที่ที่ไม่คาดคิดพร้อมแรงจูงใจแอบแฝงของฝ่ายตรงข้าม',
];

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error('MISSING_GEMINI_API_KEY');
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

type FreeAiMode = 'hybrid' | 'gemini' | 'community';

let blockedGeminiKeyHash: string | null = null;
let blockedGeminiUntil = 0;

function getKeyFingerprint(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
}

function isGeminiTemporarilyBlocked(apiKey: string): boolean {
  if (!blockedGeminiKeyHash || Date.now() > blockedGeminiUntil) return false;
  return blockedGeminiKeyHash === getKeyFingerprint(apiKey);
}

function markGeminiKeyBlocked(apiKey: string) {
  blockedGeminiKeyHash = getKeyFingerprint(apiKey);
  blockedGeminiUntil = Date.now() + 2 * 60 * 1000;
}

function resolveFreeAiMode(requested?: unknown): FreeAiMode {
  if (typeof requested === 'string' && ALLOWED_FREE_MODES.has(requested)) {
    return requested as FreeAiMode;
  }
  return 'hybrid';
}

function resolveModel(requested?: unknown): string {
  if (typeof requested === 'string' && ALLOWED_MODELS.has(requested)) {
    return requested;
  }
  return DEFAULT_FREE_MODEL;
}

function resolveThinkingLevel(model: string, depth: 'high' | 'medium' | 'low'): ThinkingLevel {
  if (model === 'gemini-3.1-flash-lite') {
    if (depth === 'low') return ThinkingLevel.MINIMAL;
    if (depth === 'medium') return ThinkingLevel.LOW;
    return ThinkingLevel.MEDIUM;
  }
  if (depth === 'high') return ThinkingLevel.HIGH;
  if (depth === 'medium') return ThinkingLevel.MEDIUM;
  return ThinkingLevel.LOW;
}

function isTransientAiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /429|RESOURCE_EXHAUSTED|503|UNAVAILABLE|500|502|INTERNAL|ECONNRESET|ETIMEDOUT|TimeoutError|AbortError|fetch failed|network/i.test(
    msg,
  );
}

function isGeminiFallbackEligibleError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /MISSING_GEMINI_API_KEY|free tier is not available|ACCESS_TOKEN_SCOPE_INSUFFICIENT|403|PERMISSION_DENIED|400|API_KEY_INVALID/i.test(
    msg,
  );
}

async function generateContentWithRetry(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
  maxRetries = 2,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && isTransientAiError(err)) {
        const delayMs = 450 * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

async function callPollinationsText(
  systemInstruction: string | undefined,
  prompt: string,
  jsonMode: boolean,
  maxRetries = 1,
): Promise<string> {
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (systemInstruction && systemInstruction.trim()) {
    messages.push({ role: 'system', content: systemInstruction.trim() });
  }
  messages.push({ role: 'user', content: prompt });

  const freeModels = ['openai', 'openai-fast'];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const seed = Math.floor(Math.random() * 900000) + 100000;
      const chosenModel = freeModels[attempt] || 'openai';
      const res = await fetch(POLLINATIONS_TEXT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'NovusLuminum/1.0',
        },
        body: JSON.stringify({
          messages,
          model: chosenModel,
          jsonMode,
          private: true,
          seed,
        }),
        signal: AbortSignal.timeout(35000),
      });

      const bodyText = await res.text().catch(() => '');
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error(`POLLINATIONS_RATE_LIMITED_429: ${bodyText.slice(0, 140)}`);
        }
        throw new Error(`POLLINATIONS_UPSTREAM_${res.status}: ${bodyText.slice(0, 140)}`);
      }
      if (!bodyText.trim()) {
        throw new Error('POLLINATIONS_EMPTY_RESPONSE');
      }
      return bodyText;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries && isTransientAiError(err)) {
        const delayMs = 2500;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function generateFreeAiText(params: {
  settings: Record<string, unknown>;
  depth: 'high' | 'medium' | 'low';
  prompt: string;
  systemInstruction?: string;
  jsonMode: boolean;
}): Promise<{ text: string; provider: 'gemini' | 'community'; modelUsed: string }> {
  const mode = resolveFreeAiMode(params.settings?.freeAiMode);
  const model = resolveModel(params.settings?.geminiModel);

  const tryGemini = async () => {
    const rawKey = process.env.GEMINI_API_KEY?.trim() || '';
    if (!rawKey) {
      throw new Error('MISSING_GEMINI_API_KEY');
    }
    if (mode === 'hybrid' && isGeminiTemporarilyBlocked(rawKey)) {
      throw new Error('FREE_TIER_CACHED_BYPASS');
    }
    const ai = getAiClient();
    const config: Record<string, unknown> = {
      thinkingConfig: { thinkingLevel: resolveThinkingLevel(model, params.depth) },
    };
    if (params.jsonMode) config.responseMimeType = 'application/json';
    if (params.systemInstruction) config.systemInstruction = params.systemInstruction;

    try {
      const response = await generateContentWithRetry(ai, {
        model,
        contents: params.prompt,
        config,
      });
      return {
        text: response.text || '',
        provider: 'gemini' as const,
        modelUsed: model,
      };
    } catch (err) {
      if (isGeminiFallbackEligibleError(err) && rawKey) {
        markGeminiKeyBlocked(rawKey);
      }
      throw err;
    }
  };

  if (mode === 'community') {
    const text = await callPollinationsText(
      params.systemInstruction,
      params.prompt,
      params.jsonMode,
    );
    return { text, provider: 'community', modelUsed: 'free-ai-community' };
  }

  if (mode === 'gemini') {
    return tryGemini();
  }

  // Hybrid mode: try Gemini Free Tier first, seamlessly fall back to keyless Free AI on 403/missing key
  try {
    return await tryGemini();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || '');
    if (msg === 'FREE_TIER_CACHED_BYPASS' || isGeminiFallbackEligibleError(err)) {
      const text = await callPollinationsText(
        params.systemInstruction,
        params.prompt,
        params.jsonMode,
      );
      return { text, provider: 'community', modelUsed: 'free-ai-community' };
    }
    throw err;
  }
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function buildDialogueDirectives(settings: Record<string, unknown> = {}): string {
  const proseLength =
    settings.proseLength === 'concise'
      ? 'เขียนกระชับฉับไว 1-2 ย่อหน้า'
      : settings.proseLength === 'rich'
        ? 'เขียนละเอียดมีมิติและบรรยากาศอนิเมะเข้มข้น 3-4 ย่อหน้า'
        : 'เขียนความยาวสมดุล 2-3 ย่อหน้า';
  const drama =
    settings.dramaIntensity === 'grounded'
      ? 'โทนสมจริง สุขุม มีเหตุผลรองรับ'
      : settings.dramaIntensity === 'intense'
        ? 'โทนเข้มข้น ดราม่าและการชิงไหวชิงพริบสูง'
        : 'โทนอนิเมะดราม่าและแอ็กชันสมดุล';
  return `- ความยาวบทบรรยาย: ${proseLength}\n- โทนเรื่อง: ${drama}\n- รูปแบบการเขียน: ใช้ *...* ครอบส่วนบรรยาย/การกระทำ และใช้ "..." ครอบบทสนทนาตัวละครทุกครั้ง`;
}

function handleApiError(res: express.Response, err: unknown) {
  const rawMsg = err instanceof Error ? err.message : String(err || 'Unknown server error');
  const safeMsg = rawMsg.replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED_KEY]');
  console.error('[Novus Luminum AI Error]', safeMsg);

  if (safeMsg === 'MISSING_GEMINI_API_KEY') {
    return res.status(503).json({
      error: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY กรุณาตรวจสอบในเมนู Settings > Secrets',
      code: 'MISSING_API_KEY',
    });
  }
  if (/free tier is not available/i.test(safeMsg)) {
    return res.status(403).json({
      error:
        'โปรเจกต์ของ GEMINI_API_KEY นี้ยังไม่ได้เปิดใช้งาน Free Tier กรุณาตรวจสอบหรือเปลี่ยน API Key ใน Settings > Secrets (หรือสลับเป็นโหมดออฟไลน์ชั่วคราว)',
      code: 'FREE_TIER_UNAVAILABLE',
      detail: safeMsg.slice(0, 240),
    });
  }
  if (/ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(safeMsg)) {
    return res.status(403).json({
      error: 'ไม่พบ GEMINI_API_KEY ที่ใช้งานได้ในระบบ (กรุณาตรวจสอบการตั้งค่า GEMINI_API_KEY ใน Settings > Secrets)',
      code: 'MISSING_OR_INVALID_KEY_SCOPE',
      detail: safeMsg.slice(0, 240),
    });
  }
  if (/403|PERMISSION_DENIED/i.test(safeMsg)) {
    return res.status(403).json({
      error: 'API Key ไม่มีสิทธิ์ใช้งานโมเดลนี้ กรุณาตรวจสอบที่ Settings > Secrets หรือสลับเป็นโหมดออฟไลน์ชั่วคราว',
      code: 'PERMISSION_DENIED',
      detail: safeMsg.slice(0, 240),
    });
  }
  if (/POLLINATIONS_RATE_LIMITED|POLLINATIONS_UPSTREAM_503|SERVICE_UNAVAILABLE/i.test(safeMsg)) {
    return res.status(503).json({
      error: 'ระบบ AI ฟรีกำลังมีผู้ใช้งานหนาแน่นชั่วคราว กรุณารอสัก 5-10 วินาทีแล้วกด "ลองใหม่"',
      code: 'FREE_AI_BUSY',
      detail: safeMsg.slice(0, 240),
    });
  }
  if (/POLLINATIONS_/i.test(safeMsg)) {
    return res.status(502).json({
      error: 'ระบบ AI ฟรีขัดข้องชั่วคราว กรุณากด "ลองใหม่" อีกครั้ง',
      code: 'FREE_AI_UPSTREAM_ERROR',
      detail: safeMsg.slice(0, 240),
    });
  }
  if (/429|RESOURCE_EXHAUSTED/i.test(safeMsg)) {
    return res.status(429).json({
      error: 'โควตาการใช้งานชั่วคราวเต็มแล้ว กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
      code: 'RATE_LIMITED',
    });
  }
  if (/400|API_KEY_INVALID/i.test(safeMsg)) {
    return res.status(400).json({
      error: 'API Key ไม่ถูกต้อง กรุณาตรวจสอบที่ Settings > Secrets',
      code: 'INVALID_KEY',
    });
  }
  return res.status(502).json({
    error: 'ไม่สามารถเชื่อมต่อกับ Gemini API ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง',
    code: 'UPSTREAM_ERROR',
    detail: safeMsg.slice(0, 240),
  });
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      aiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()),
      freeFallbackAvailable: true,
      defaultModel: DEFAULT_FREE_MODEL,
    });
  });

  app.post('/api/gemini/world-builder', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const proName = String(body.proName || '').trim().slice(0, 60);
      if (!proName) {
        return res.status(400).json({ error: 'กรุณาระบุชื่อตัวเอก' });
      }
      const proGender = String(body.proGender || 'ไม่ระบุ').slice(0, 20);
      const hasCompanion = Boolean(body.hasCompanion);
      const compName = String(body.compName || '').trim().slice(0, 60);
      const compGender = String(body.compGender || 'หญิง').slice(0, 20);
      const promptText = String(
        body.promptText || 'โลกอนิเมะแฟนตาซีผจญภัยที่เต็มไปด้วยปริศนาและการตัดสินใจ',
      ).slice(0, 1200);
      const boundaries = String(
        body.boundaries || 'กำหนดขอบเขตธีมและกฎเหล็กให้ชัดเจนตามไอเดียโลก เพื่อไม่ให้เรื่องหลุดธีม',
      ).slice(0, 800);
      const settings = (body.settings || {}) as Record<string, unknown>;

      const uniqueSeed = Math.floor(Math.random() * 900000) + 100000;
      const scenarioSeed =
        OPENING_SCENARIO_SEEDS[Math.floor(Math.random() * OPENING_SCENARIO_SEEDS.length)];

      const compDirective = hasCompanion
        ? `สร้างตัวละครคู่บทบาทเริ่มต้น 1 คน${compName ? ` โดยใช้ชื่อ "${compName}"` : ' (คิดชื่อที่เข้ากับโลกให้เลย)'}${compGender ? ` เพศ "${compGender}"` : ' (เลือกเพศที่เหมาะสม)'} พร้อมออกแบบบทบาท รูปลักษณ์ บุคลิก และอารมณ์เริ่มต้นทั้งหมดให้ครบ`
        : 'ผู้เล่นเลือกเล่นแบบฉายเดี่ยว (Solo Journey) ไม่ต้องสร้างคู่บทบาทเริ่มต้น ให้ companion เป็น null และในฉากเปิดเรื่องตัวเอกต้องเริ่มต้นเพียงลำพัง';

      const prompt = `คุณคือหัวหน้านักออกแบบโลกและตัวละครอนิเมะ RPG (AI-First World Architect) [Seed #${uniqueSeed}]
จงออกแบบโลกอนิเมะสวมบทบาทภาษาไทยให้ครบสมบูรณ์ โดยอิงจากข้อมูลหลักที่ผู้เล่นกำหนดดังนี้:
- ไอเดียโลก / Prompt: "${promptText}"
- ขอบเขตที่ผู้เล่นกำหนดเพิ่มเติม: "${boundaries}"
- ชื่อตัวเอก (ต้องใช้ชื่อนี้): "${proName}"
- เพศตัวเอก (ต้องใช้เพศนี้): "${proGender}"
- คู่บทบาท: ${compDirective}
- แนวทางสถานการณ์เปิดฉากสำหรับรอบนี้: "${scenarioSeed}"

เงื่อนไขสำคัญ:
1. AI เป็นผู้คิดรายละเอียดทั้งหมดของโลกและตัวละครแทนผู้เล่น ยกเว้นชื่อและเพศที่ผู้เล่นเลือกไว้ห้ามเปลี่ยนแปลง
2. ตัวเอกให้เริ่มด้วยบทบาท/สายพลังและนิสัยแบบเปิดกว้างที่พร้อมพัฒนาตามการกระทำของผู้เล่น
3. เขียนฉากเปิดเรื่องภาษาไทย 2-3 ย่อหน้า ใช้ *...* สำหรับบรรยาย และ "..." สำหรับบทสนทนา

ตอบเป็น JSON เท่านั้น:
{
  "title": "ชื่อโลก/ชื่อเรื่องอนิเมะที่น่าดึงดูด",
  "synopsis": "เรื่องย่อชวนติดตาม 1-2 ประโยคสำหรับหน้า Story Card",
  "tropeCategory": "เลือก 1 ค่าจาก: isekai, action, rofan, scifi",
  "coverKey": "เลือก 1 ค่าที่เข้ากับฉากที่สุดจาก: isekai_plaza, hunter_rooftop, royal_palace, cyberpunk_bar, mystic_shrine",
  "genre": "แนวเรื่องสั้นๆ คั่นด้วย •",
  "worldRules": "กฎของโลกและบรรยากาศ 1-2 ประโยค",
  "worldBoundaries": "ขอบเขตสำคัญของโลกนี้",
  "powerSystem": "ระบบพลังหรือกติกาของโลก",
  "location": "สถานที่เปิดฉาก",
  "initialObjective": "เป้าหมายเริ่มต้น",
  "initialItems": ["ไอเทม 1", "ไอเทม 2", "ไอเทม 3"],
  "scenarioTag": "ชื่อสั้นๆ ของสถานการณ์เปิดฉากรอบนี้ (3-6 คำ)",
  "protagonist": { "name": "${proName}", "gender": "${proGender}", "role": "จุดเริ่มต้น/สายพลังเริ่มต้น", "appearance": "รูปลักษณ์สีผม สีตา ทรงผม และชุดที่เข้ากับเพศและโลก", "persona": "นิสัยเริ่มต้นแบบเปิดกว้าง" },
  "companion": ${hasCompanion ? `{ "name": "${compName || 'คิดชื่อให้เหมาะสม'}", "gender": "${compGender}", "role": "บทบาท", "appearance": "รูปลักษณ์สีผม สีตา และชุด", "personality": "บุคลิก", "initialMood": "อารมณ์แรก" }` : 'null'},
  "openingNarration": "ฉากเปิดเรื่อง 2-3 ย่อหน้า ใช้ *...* บรรยายและ \\"...\\" สำหรับคำพูด",
  "initialSuggestions": ["ตัวเลือก 1", "ตัวเลือก 2", "ตัวเลือก 3"]
}`;

      const result = await generateFreeAiText({
        settings,
        depth: 'high',
        prompt,
        jsonMode: true,
      });

      const parsed = extractJsonObject(result.text);
      if (!parsed || !parsed.title) {
        return res.status(502).json({ error: 'รูปแบบข้อมูลโลกที่ AI สร้างไม่สมบูรณ์ กรุณาลองอีกครั้ง' });
      }

      const rawPro = (parsed.protagonist || {}) as Record<string, unknown>;
      parsed.protagonist = {
        ...rawPro,
        name: proName,
        gender: proGender,
      };

      if (hasCompanion && parsed.companion && typeof parsed.companion === 'object') {
        const rawComp = parsed.companion as Record<string, unknown>;
        parsed.companion = {
          ...rawComp,
          name: compName || String(rawComp.name || 'คู่หูนิรนาม'),
          gender: compGender || String(rawComp.gender || 'ไม่ระบุ'),
        };
      } else {
        parsed.companion = null;
      }

      if (!ALLOWED_SCENE_KEYS.has(String(parsed.coverKey))) {
        parsed.coverKey = 'isekai_plaza';
      }

      res.json({ world: parsed, model: result.modelUsed, provider: result.provider });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.post('/api/gemini/dynamic-opening', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const world = (body.world || {}) as Record<string, unknown>;
      const settings = (body.settings || {}) as Record<string, unknown>;
      const previousSnippet = String(body.previousSnippet || '').slice(0, 240);

      if (!world.title) {
        return res.status(400).json({ error: 'ไม่พบข้อมูลโลกสำหรับสร้างฉากเปิด' });
      }

      const runSeed = Math.floor(Math.random() * 999999) + 100000;
      const scenarioAngle =
        OPENING_SCENARIO_SEEDS[Math.floor(Math.random() * OPENING_SCENARIO_SEEDS.length)];
      const pro = (world.protagonist || {}) as Record<string, unknown>;
      const hasComp =
        world.hasCompanion !== false &&
        Boolean(world.companion && (world.companion as Record<string, unknown>).name);
      const comp = hasComp ? (world.companion as Record<string, unknown>) : null;

      const prompt = `คุณคือผู้กำกับฉากเปิดเรื่องอนิเมะ RPG ของ "Novus Luminum" [New Run Seed #${runSeed}]
ภารกิจ: สร้าง "สถานการณ์เปิดฉากและบทสนทนาใหม่ทั้งหมด" สำหรับการเริ่มเล่นรอบใหม่ของโลกนี้ โดยต้องแตกต่างจากรอบก่อนๆ อย่างชัดเจน แต่ยังอยู่ภายใต้ขอบเขตและกฎของโลกนี้อย่างเคร่งครัด!

ข้อมูลและขอบเขตของโลก:
- ชื่อโลก: ${world.title}
- แนวเรื่อง: ${world.genre || 'Anime RPG'}
- กฎของโลก: ${world.worldRules || 'ยึดความสมเหตุสมผลตามธีมโลก'}
- ขอบเขตของโลก (ห้ามหลุดกรอบนี้เด็ดขาด): ${world.worldBoundaries || world.worldRules || world.genre}
- ระบบพลัง: ${world.powerSystem || 'ตามบริบทของโลก'}
- สถานที่หลักอ้างอิง: ${world.location || 'พื้นที่เริ่มต้นของโลก'}

ตัวเอก (ผู้เล่น):
- ชื่อ: ${pro.name || 'ตัวเอก'}
- เพศ: ${pro.gender || 'ไม่ระบุ'}
- บทบาท: ${pro.role || 'ผู้เริ่มต้นเส้นทาง'}
- รูปลักษณ์: ${pro.appearance || 'ตามเนื้อเรื่อง'}

คู่บทบาทเริ่มต้น:
${comp ? `- ชื่อ: ${comp.name} (เพศ: ${comp.gender || 'ไม่ระบุ'}) | บทบาท: ${comp.role || ''} | บุคลิก: ${comp.personality || ''} | รูปลักษณ์: ${comp.appearance || ''}` : '- ไม่มีคู่บทบาทเริ่มต้น (โหมดฉายเดี่ยว Solo Journey — ห้ามบังคับให้มีคู่หูประจำตัว แต่สามารถมีบรรยากาศผู้คนรอบข้างหรือเหตุการณ์ปริศนาได้)'}

โจทย์ความแตกต่างของรอบนี้:
- มุมมองเหตุการณ์ที่ต้องสุ่มใช้รอบนี้: "${scenarioAngle}"
${previousSnippet ? `- ห้ามซ้ำกับฉากเปิดรอบก่อนหน้านี้เด็ดขาด: "${previousSnippet}"` : ''}
${buildDialogueDirectives(settings)}

ตอบเป็น JSON เท่านั้น:
{
  "scenarioTag": "ชื่อฉากเปิดสั้นๆ เฉพาะรอบนี้ (3-6 คำ)",
  "location": "สถานที่เปิดฉากและช่วงเวลาเฉพาะรอบนี้ (ต้องเข้ากับโลกและขอบเขต)",
  "mood": "อารมณ์บรรยากาศเริ่มต้น 1-3 คำ",
  "emotion": "เลือก 1 ค่าจาก: blush, warm, angry, action, shock, sad, smirk, mystery, neutral",
  "objective": "เป้าหมายเฉพาะหน้าของฉากเปิดรอบนี้",
  "openingNarration": "บทบรรยายและบทสนทนาเปิดฉากภาษาไทย 2-3 ย่อหน้า ใช้ *...* บรรยายและ \\"...\\" สำหรับบทสนทนา เปิดจังหวะให้ผู้เล่นตอบโต้ต่อ",
  "suggestedActions": ["ทางเลือก 1", "ทางเลือก 2", "ทางเลือก 3"]
}`;

      const result = await generateFreeAiText({
        settings,
        depth: 'medium',
        prompt,
        jsonMode: true,
      });

      const parsed = extractJsonObject(result.text);
      if (!parsed || !parsed.openingNarration) {
        return res.status(502).json({ error: 'AI ไม่สามารถสร้างฉากเปิดเรื่องได้ กรุณาลองอีกครั้ง' });
      }

      res.json({
        opening: {
          ...parsed,
          engineLabel:
            result.provider === 'gemini'
              ? `DYNAMIC OPENING · ${result.modelUsed.toUpperCase()}`
              : 'DYNAMIC OPENING · FREE AI',
        },
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.post('/api/gemini/turn', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const session = (body.session || {}) as Record<string, unknown>;
      const userInput = String(body.userInput || '').trim().slice(0, 2000);
      const mode = body.mode === 'ooc' ? 'ooc' : 'ic';
      const rerollPrevious = String(body.rerollPrevious || '').trim().slice(0, 500);
      const settings = (body.settings || {}) as Record<string, unknown>;

      if (!userInput || !session.world) {
        return res.status(400).json({ error: 'ข้อมูลการส่งข้อความไม่ครบถ้วน' });
      }

      const world = session.world as Record<string, unknown>;
      const pro = (world.protagonist || {}) as Record<string, unknown>;
      const cast = Array.isArray(session.cast) ? (session.cast as Array<Record<string, unknown>>) : [];
      const lorebook = Array.isArray(session.lorebook)
        ? (session.lorebook as Array<Record<string, unknown>>)
        : [];
      const rpg = (session.rpg || {}) as Record<string, unknown>;
      const messages = Array.isArray(session.messages)
        ? (session.messages as Array<Record<string, unknown>>)
        : [];
      const memories = Array.isArray(session.memories) ? (session.memories as string[]) : [];

      const castSummary =
        cast.length > 0
          ? cast
              .map((c) => {
                const notes = Array.isArray(c.trustNotes) ? (c.trustNotes as string[]).slice(-3).join('; ') : '';
                return `- ${c.name} (เพศ: ${c.gender || 'ไม่ระบุ'} | ${c.role}) | อารมณ์: ${c.mood} | ความสัมพันธ์: ${c.relationshipTier || 'เริ่มสังเกต'} (${c.affinity ?? 35}/100)${notes ? ` | ความทรงจำต่อตัวเอก: ${notes}` : ''}`;
              })
              .join('\n')
          : '(ยังไม่มีคู่บทบาท — ผู้เล่นกำลังเดินทางฉายเดี่ยว สามารถเปิดตัวตัวละครใหม่ตามธรรมชาติได้หากเหมาะสม)';

      const loreSummary =
        lorebook.length > 0
          ? lorebook
              .slice(-6)
              .map((l) => `- [${l.title}]: ${l.detail}`)
              .join('\n')
          : '(ไม่มีบันทึกเพิ่มเติม)';

      const stats = (rpg.stats || {}) as Record<string, unknown>;
      const skills = Array.isArray(rpg.skills) ? (rpg.skills as Array<Record<string, unknown>>) : [];
      const quests = Array.isArray(rpg.quests) ? (rpg.quests as Array<Record<string, unknown>>) : [];

      const rpgSummary = `LV.${rpg.level || 1} (XP ${rpg.xp || 0}/${rpg.xpToNext || 100}) | HP ${rpg.hp || 100}/${rpg.maxHp || 100} | MP ${rpg.mp || 60}/${rpg.maxMp || 60} | Gold ${rpg.gold || 0}G | STR:${stats.str || 10} AGI:${stats.agi || 10} INT:${stats.int || 10} CHA:${stats.cha || 10} LCK:${stats.lck || 10}
สกิลที่มี: ${skills.map((s) => `${s.name}(${s.mpCost}MP)`).join(', ') || 'ไม่มี'}
เควสที่กำลังทำ: ${quests.filter((q) => q.status === 'active').map((q) => q.title).join(', ') || 'ไม่มี'}`;

      const systemInstruction = `คุณคือผู้กำกับอนิเมะเชิงโต้ตอบ (OOC Playable Anime Director) ของ "Novus Luminum"
ข้อมูลโลก:
- ชื่อเรื่อง: ${world.title} (${world.genre || ''})
- กฎของโลก: ${world.worldRules || 'ยึดความสมเหตุสมผล'}
- ขอบเขตของโลก (ห้ามออกนอกกรอบนี้): ${world.worldBoundaries || world.worldRules || 'รักษาธีมและกฎของโลกอย่างเคร่งครัด'}
- ระบบพลัง: ${world.powerSystem || 'ตามบริบทของโลก'}
- สถานที่ปัจจุบัน: ${session.location}
- ตอนปัจจุบัน: ARC ${session.arcNumber || 1} · Episode ${session.episodeNumber || 1} (จังหวะที่ ${session.turnsInEpisode || 1})
- เป้าหมายปัจจุบัน: ${session.objective}
- ไอเทมที่ตัวเอกมี: ${Array.isArray(session.items) && session.items.length ? (session.items as string[]).join(', ') : 'ไม่มี'}

สถานะ RPG ตัวเอก:
${rpgSummary}

ตัวเอก (ผู้เล่น):
- ชื่อ: ${pro.name}
- เพศ: ${pro.gender || 'ไม่ระบุ'} (ใช้สรรพนามและคำลงท้ายให้สอดคล้องกับเพศ)
- บทบาท/สายพลังปัจจุบัน: ${pro.role}
- รูปลักษณ์: ${pro.appearance || 'ตามเนื้อเรื่อง'}
- นิสัยปัจจุบัน: ${pro.persona}

ตัวละครในเรื่องและความสัมพันธ์ (Affinity):
${castSummary}

ความทรงจำสำคัญที่ผ่านมา:
${memories.slice(-6).map((m) => `- ${m}`).join('\n') || '(เริ่มต้น)'}

Lorebook:
${loreSummary}

กติกาการตอบกลับ:
${buildDialogueDirectives(settings)}
- แสดงพัฒนาการความสัมพันธ์ของตัวละครตามระดับ Affinity (ถ้าสูงขึ้นให้ตัวละครเปิดใจ ไว้ใจ หรือแสดงท่าทีใกล้ชิดขึ้น; ถ้าลดลงให้ระแวงหรือเย็นชาลง)
- หากโหมดผู้เล่นเป็น OOC (Out-of-Character / คำสั่งผู้กำกับ) ให้ปรับทิศทางเนื้อเรื่องหรือสร้างเหตุการณ์ตามคำขออย่างเป็นธรรมชาติ
- อัปเดตค่า Affinity (-15 ถึง +15), relationshipNote (1 ประโยคสั้นๆ ถ้ามีความประทับใจใหม่), protagonistUpdate (อัปเดตบทบาทหรือนิสัยตัวเอกเฉพาะเมื่อการกระทำเปลี่ยนตัวตนชัดเจน มิฉะนั้นใส่ null), ค่า RPG, ไอเทม, ตัวละครใหม่, ความทรงจำ, Lore หรือฉาก (sceneKey) เฉพาะเมื่อเกิดขึ้นจริงในฉาก
- ตอบเป็น JSON เท่านั้นตามสคีมานี้:
{
  "narration": "บทบรรยายและบทสนทนาภาษาไทย",
  "emotion": "เลือก 1 ค่า: blush, warm, angry, action, shock, sad, smirk, mystery, neutral",
  "mood": "อารมณ์ล่าสุด 1-3 คำ",
  "tension": 35,
  "affinityDelta": 2,
  "relationshipNote": "ความประทับใจหรือพัฒนาการความสัมพันธ์สั้นๆ (หรือว่างถ้าไม่มี)",
  "protagonistUpdate": null,
  "sceneKey": "เลือกเฉพาะเมื่อเปลี่ยนฉากชัดเจน: isekai_plaza, hunter_rooftop, royal_palace, cyberpunk_bar, mystic_shrine หรือ null",
  "location": "สถานที่ปัจจุบัน (หรือค่าเดิมถ้าไม่ได้ย้าย)",
  "objective": "เป้าหมายปัจจุบัน (หรือค่าเดิม)",
  "rpgDelta": {
    "hpDelta": 0,
    "mpDelta": 0,
    "xpDelta": 15,
    "goldDelta": 0,
    "statGains": {},
    "newSkill": null,
    "questUpdates": []
  },
  "newItems": [],
  "removedItems": [],
  "newCharacters": [],
  "newMemory": "สรุปเหตุการณ์สำคัญ 1 บรรทัด (หรือว่างถ้าไม่มี)",
  "newLore": null,
  "mapNode": null,
  "suggestedActions": ["ทางเลือก 1", "ทางเลือก 2", "ทางเลือก 3"]
}`;

      const recentHistory = messages
        .slice(-8)
        .map(
          (m) =>
            `${m.sender === 'player' ? `[ผู้เล่น${m.mode === 'ooc' ? ' OOC' : ''}]:` : '[เรื่องราว]:'} ${m.text}`,
        )
        .join('\n\n');

      const rerollInstruction = rerollPrevious
        ? `\nคำสั่งพิเศษ (REROLL): จงสร้างผลลัพธ์และบทสนทนาเวอร์ชันใหม่ที่แตกต่างจากเวอร์ชันก่อนหน้านี้อย่างชัดเจน ห้ามซ้ำกับ: "${rerollPrevious}"`
        : '';

      const prompt = `ประวัติเหตุการณ์ล่าสุด:
${recentHistory}

การกระทำล่าสุดของผู้เล่น (โหมด ${mode.toUpperCase()}):
${userInput}${rerollInstruction}

จงสานต่อเรื่องราวตอนที่ ${(Number(session.turn) || 1) + 1} เป็น JSON เท่านั้น:`;

      const result = await generateFreeAiText({
        settings,
        depth: 'high',
        systemInstruction,
        prompt,
        jsonMode: true,
      });

      const parsed = extractJsonObject(result.text);
      if (!parsed || !parsed.narration) {
        return res.status(502).json({ error: 'AI ไม่สามารถสร้างตอนต่อไปได้ กรุณาลองอีกครั้ง' });
      }

      if (parsed.sceneKey && !ALLOWED_SCENE_KEYS.has(String(parsed.sceneKey))) {
        parsed.sceneKey = null;
      }

      res.json({
        turnResult: {
          ...parsed,
          engineLabel:
            result.provider === 'gemini'
              ? `GEMINI · ${result.modelUsed.toUpperCase()}`
              : 'FREE AI · INTERACTIVE',
        },
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.post('/api/gemini/episode-recap', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const session = (body.session || {}) as Record<string, unknown>;
      const settings = (body.settings || {}) as Record<string, unknown>;

      if (!session.world) {
        return res.status(400).json({ error: 'ไม่พบข้อมูลเซสชันสำหรับสรุปตอน' });
      }

      const world = session.world as Record<string, unknown>;
      const cast = Array.isArray(session.cast) ? (session.cast as Array<Record<string, unknown>>) : [];
      const messages = Array.isArray(session.messages)
        ? (session.messages as Array<Record<string, unknown>>)
        : [];
      const recentTurns = messages
        .slice(-8)
        .map((m) => `${m.sender === 'player' ? 'ผู้เล่น:' : 'เรื่องราว:'} ${m.text}`)
        .join('\n');

      const comp = cast[0];
      const prompt = `คุณคือผู้กำกับอนิเมะที่กำลังสรุปจบ Episode ${session.episodeNumber || 1} (ARC ${session.arcNumber || 1}) ของเรื่อง "${world.title}"
ข้อมูลประกอบ:
- สถานที่ล่าสุด: ${session.location}
- เป้าหมาย: ${session.objective}
- ความสัมพันธ์คู่บทบาท: ${comp ? `${comp.name} (${comp.relationshipTier}, ${comp.affinity}%)` : 'ฉายเดี่ยว'}
- เหตุการณ์ในตอนนี้:
${recentTurns}

จงสร้างสรุปจบตอนสไตล์อนิเมะพร้อม "ตัวอย่างตอนต่อไป (Next Episode Preview)" เป็น JSON เท่านั้น:
{
  "title": "ชื่อตอนอนิเมะที่น่าจดจำ (ภาษาไทย 4-8 คำ)",
  "recapBullets": ["จุดเปลี่ยนสำคัญ 1", "จุดเปลี่ยนสำคัญ 2", "จุดเปลี่ยนสำคัญ 3"],
  "affinityHighlight": "สรุปพัฒนาการความสัมพันธ์ในตอนนี้ 1 ประโยค",
  "nextEpisodeHook": "ตัวอย่างตอนต่อไป 1-2 ประโยคที่ทิ้งปมชวนติดตาม"
}`;

      const result = await generateFreeAiText({
        settings,
        depth: 'medium',
        prompt,
        jsonMode: true,
      });

      const parsed = extractJsonObject(result.text);
      if (!parsed || !parsed.title) {
        return res.status(502).json({ error: 'ไม่สามารถสรุปจบตอนได้ กรุณาลองอีกครั้ง' });
      }

      res.json({ recap: parsed });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.post('/api/gemini/suggestions', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const session = (body.session || {}) as Record<string, unknown>;
      const settings = (body.settings || {}) as Record<string, unknown>;

      if (!session.world) {
        return res.status(400).json({ error: 'ไม่พบข้อมูลเซสชัน' });
      }

      const world = session.world as Record<string, unknown>;
      const messages = Array.isArray(session.messages)
        ? (session.messages as Array<Record<string, unknown>>)
        : [];
      const lastScene = messages.slice(-2).map((m) => m.text).join('\n');

      const prompt = `สร้างทางเลือกการกระทำถัดไป 3 ข้อที่แตกต่างกันชัดเจน (เช่น สายบู๊/รุก, สายเจรจา/เปิดใจ, สายพลิกแพลง/สำรวจ) สำหรับเกมสวมบทบาทอนิเมะภาษาไทย
โลก: ${world.title} (${world.genre})
สถานที่: ${session.location}
เป้าหมาย: ${session.objective}
เหตุการณ์ล่าสุด:
${lastScene}

ตอบเป็น JSON เท่านั้น:
{ "suggestedActions": ["*การกระทำ* \\"คำพูด\\"", "*การกระทำ* \\"คำพูด\\"", "*การกระทำ* \\"คำพูด\\""] }`;

      const result = await generateFreeAiText({
        settings,
        depth: 'low',
        prompt,
        jsonMode: true,
      });

      const parsed = extractJsonObject(result.text);
      const list = Array.isArray(parsed?.suggestedActions)
        ? (parsed.suggestedActions as unknown[]).map((s) => String(s).trim()).filter(Boolean).slice(0, 3)
        : [];

      if (list.length === 0) {
        return res.status(502).json({ error: 'ไม่สามารถสร้างทางเลือกใหม่ได้' });
      }
      res.json({ suggestedActions: list });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  function sanitizeSvgMarkup(raw: string, fallbackWidth: number, fallbackHeight: number): string | null {
    if (!raw) return null;
    let source = raw.trim();
    if (source.startsWith('{')) {
      const maybeJson = extractJsonObject(source);
      if (maybeJson && typeof maybeJson.svg === 'string') {
        source = maybeJson.svg;
      }
    }
    let match = source.match(/<svg[\s\S]*?<\/svg>/i);
    if (!match) {
      const openIdx = source.search(/<svg[\s>]/i);
      if (openIdx === -1) return null;
      const partial = source.slice(openIdx);
      const lastTagEnd = partial.lastIndexOf('>');
      if (lastTagEnd === -1) return null;
      match = [`${partial.slice(0, lastTagEnd + 1)}</svg>`];
    }
    let svg = match[0]
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
      .replace(/<(iframe|object|embed|link|meta)[\s\S]*?>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, '')
      .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/data:text\/html/gi, '');

    if (!/xmlns\s*=/.test(svg)) {
      svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!/viewBox\s*=/.test(svg)) {
      svg = svg.replace('<svg', `<svg viewBox="0 0 ${fallbackWidth} ${fallbackHeight}"`);
    }
    return svg;
  }

  app.post('/api/gemini/portrait', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const name = String(body.name || 'Character').trim().slice(0, 60);
      const gender = String(body.gender || 'ไม่ระบุ').slice(0, 20);
      const role = String(body.role || '').slice(0, 120);
      const appearance = String(body.appearance || '').slice(0, 300);
      const mood = String(body.mood || 'neutral').slice(0, 60);
      const genre = String(body.genre || 'Anime RPG').slice(0, 100);
      const settings = (body.settings || {}) as Record<string, unknown>;

      const svgPrompt = `You are a lead cel-shaded anime character artist.
Create a crisp, expressive anime bust portrait as pure SVG (<svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">...</svg>) for this character:
- Name: ${name}
- Gender: ${gender}
- Role: ${role}
- Appearance: ${appearance || 'stylish anime attire, expressive eyes, dramatic hair silhouette'}
- Current Mood: ${mood}
- World Genre: ${genre}

Visual requirements:
1. Rich atmospheric background gradient with rim lighting, cel-shaded hair highlights, expressive anime eyes with specular catchlights, styled collar/outfit matching role & genre.
2. Keep geometry clean and concise (12-22 vector shapes/paths) and ensure the closing </svg> tag is present.
3. Output ONLY valid standalone <svg> markup with <defs> gradients. No <text>, no <script>, no markdown fences.`;

      const result = await generateFreeAiText({
        settings,
        depth: 'medium',
        systemInstruction: 'Output ONLY valid standalone <svg>...</svg> markup. Do not include markdown fences or prose.',
        prompt: svgPrompt,
        jsonMode: false,
      });

      const cleanSvg = sanitizeSvgMarkup(result.text, 240, 240);
      if (!cleanSvg) {
        return res.status(502).json({ error: 'ไม่สามารถวาดภาพตัวละครด้วย AI ได้ในขณะนี้ กรุณาลองใหม่' });
      }

      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleanSvg)}`;
      res.json({ imageUrl: dataUrl, provider: result.provider });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.post('/api/gemini/scene-cg', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const title = String(body.title || 'Anime World').trim().slice(0, 100);
      const genre = String(body.genre || 'Anime Fantasy').slice(0, 120);
      const location = String(body.location || '').slice(0, 160);
      const mood = String(body.mood || '').slice(0, 60);
      const narration = String(body.narration || '').slice(0, 450);
      const settings = (body.settings || {}) as Record<string, unknown>;

      const svgPrompt = `You are a cinematic anime background & Event CG illustrator.
Create a widescreen 16:9 atmospheric anime background / Event CG illustration as pure SVG (<svg viewBox="0 0 800 450" xmlns="http://www.w3.org/2000/svg">...</svg>) for this scene:
- Story Title: ${title}
- Genre: ${genre}
- Location: ${location}
- Mood / Lighting: ${mood}
- Scene Moment: ${narration}

Visual requirements:
1. Layered depth: sky gradient with moon/sun/neon glow, atmospheric mist/bokeh particles, midground architecture or landscape silhouettes, foreground framing elements, dramatic anime lighting shafts.
2. Keep geometry clean and concise (14-24 vector shapes/paths) and ensure the closing </svg> tag is present.
3. Output ONLY valid standalone <svg> markup with <defs> gradients. No <text>, no <script>, no markdown fences.`;

      const result = await generateFreeAiText({
        settings,
        depth: 'medium',
        systemInstruction: 'Output ONLY valid standalone <svg>...</svg> markup. Do not include markdown fences or prose.',
        prompt: svgPrompt,
        jsonMode: false,
      });

      const cleanSvg = sanitizeSvgMarkup(result.text, 800, 450);
      if (!cleanSvg) {
        return res.status(502).json({ error: 'ไม่สามารถวาดฉาก CG ด้วย AI ได้ในขณะนี้ กรุณาลองใหม่' });
      }

      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleanSvg)}`;
      res.json({ imageUrl: dataUrl, provider: result.provider });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript').send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  }
  style.textContent = content;
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  const noop = () => {};
  return { accept: noop, acceptExports: noop, dispose: noop, prune: noop, invalidate: noop, on: noop, off: noop, send: noop, data: {} };
}
export function injectQuery(url) { return url; }
export class ErrorOverlay extends HTMLElement {}
`);
    });
    app.get('/favicon.ico', (_req, res) => res.status(204).end());
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Novus Luminum studio server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
