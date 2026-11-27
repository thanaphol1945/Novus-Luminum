import { EMOTION_PROFILES, SCENE_BACKDROPS } from '../data/presets';
import type {
  CastMember,
  DynamicOpeningResult,
  EmotionKey,
  EpisodeSummary,
  RpgState,
  SceneVisualKey,
  SessionState,
  TurnResult,
  TurnSnapshot,
  WorldConfig,
} from '../types';

export function getRelationshipTier(affinity: number, recentEmotion?: EmotionKey): string {
  const clamped = Math.max(0, Math.min(100, affinity));
  if (clamped >= 80) {
    return recentEmotion === 'blush' || recentEmotion === 'warm'
      ? 'คู่ใจ & หวั่นไหว'
      : 'คู่หูร่วมเป็นร่วมตาย';
  }
  if (clamped >= 60) return 'สนิทสนม';
  if (clamped >= 40) return 'เริ่มไว้ใจ';
  if (clamped >= 20) return 'ระแวดระวัง';
  return 'คนแปลกหน้า';
}

export function resolveSceneBackdrop(
  sceneKey?: SceneVisualKey,
  world?: WorldConfig,
  locationText = '',
) {
  if (sceneKey && SCENE_BACKDROPS[sceneKey]) {
    return SCENE_BACKDROPS[sceneKey];
  }
  const combined = `${locationText} ${world?.location || ''} ${world?.genre || ''} ${world?.title || ''}`.toLowerCase();
  if (/(cyber|neon|ชิบุยะ|บาร์|2099|แฮก|sci-fi)/.test(combined)) {
    return SCENE_BACKDROPS.cyberpunk_bar;
  }
  if (/(palace|royal|กุหลาบ|ราชวัง|เต้นรำ|ขุนนาง|valtheria|political)/.test(combined)) {
    return SCENE_BACKDROPS.royal_palace;
  }
  if (/(rooftop|ดาดฟ้า|สถาบัน|ฮันเตอร์|hunter|academy|arcadia)/.test(combined)) {
    return SCENE_BACKDROPS.hunter_rooftop;
  }
  if (/(shrine|ศาลเจ้า|ป่าหมอก|วิญญาณ|forest|kodama|ดันเจี้ยน|dungeon|mystery)/.test(combined)) {
    return SCENE_BACKDROPS.mystic_shrine;
  }
  if (world?.coverKey && SCENE_BACKDROPS[world.coverKey]) {
    return SCENE_BACKDROPS[world.coverKey];
  }
  return SCENE_BACKDROPS.isekai_plaza;
}

export function detectEmotionFromText(text = '', mood = ''): { key: EmotionKey; label: string } {
  const combined = `${text} ${mood}`.toLowerCase();
  if (/(เขิน|หน้าแดง|หวั่นไหว|สบตา|หัวใจเต้น|แก้มแดง|blush)/.test(combined)) {
    return { key: 'blush', label: EMOTION_PROFILES.blush.label };
  }
  if (/(โกรธ|เดือด|ตึงเครียด|ขมวดคิ้ว|คำราม|กัดฟัน|angry)/.test(combined)) {
    return { key: 'angry', label: EMOTION_PROFILES.angry.label };
  }
  if (/(ดาบ|ปะทะ|พุ่ง|ต่อสู้|ยิง|หลบ|ระเบิด|โจมตี|action|วิกฤต)/.test(combined)) {
    return { key: 'action', label: EMOTION_PROFILES.action.label };
  }
  if (/(ตกใจ|ตะลึง|เบิกตา|ไม่จริง|ฉับพลัน|shock)/.test(combined)) {
    return { key: 'shock', label: EMOTION_PROFILES.shock.label };
  }
  if (/(เศร้า|น้ำตา|สูญเสีย|หดหู่|เงียบเหงา|sad)/.test(combined)) {
    return { key: 'sad', label: EMOTION_PROFILES.sad.label };
  }
  if (/(ยิ้มมุมปาก|เจ้าเล่ห์|หยั่งเชิง|หัวเราะเบา|ท้าทาย|smirk)/.test(combined)) {
    return { key: 'smirk', label: EMOTION_PROFILES.smirk.label };
  }
  if (/(ปริศนา|เงา|ลึกลับ|กระซิบ|ร่องรอย|สัญญาณ|mystery|ระแวดระวัง)/.test(combined)) {
    return { key: 'mystery', label: EMOTION_PROFILES.mystery.label };
  }
  if (/(ยิ้ม|อบอุ่น|อ่อนโยน|โล่งใจ|สงบ|ผ่อนคลาย|warm)/.test(combined)) {
    return { key: 'warm', label: EMOTION_PROFILES.warm.label };
  }
  return { key: 'neutral', label: EMOTION_PROFILES.neutral.label };
}

export function buildInitialRpgState(world: WorldConfig): RpgState {
  const genre = (world.genre || '').toLowerCase();
  const isAction = /(action|hunter|cyberpunk|isekai)/.test(genre);
  const isIntrigue = /(political|mystery|romance)/.test(genre);

  return {
    level: 1,
    xp: 0,
    xpToNext: 100,
    hp: 100,
    maxHp: 100,
    mp: 60,
    maxMp: 60,
    gold: 25,
    unspentPoints: 0,
    stats: {
      str: isAction ? 12 : 8,
      agi: isAction ? 11 : 10,
      int: isIntrigue ? 13 : 10,
      cha: isIntrigue ? 12 : 9,
      lck: 10,
    },
    skills: [
      {
        id: 'skill-sense',
        name: 'วิเคราะห์สถานการณ์',
        mpCost: 8,
        description: 'อ่านเจตนา จุดอ่อน และเบาะแสที่ซ่อนอยู่ในฉาก',
      },
      {
        id: 'skill-burst',
        name: isIntrigue ? 'วาจาพลิกเกม' : 'เร่งปฏิกิริยาฉับพลัน',
        mpCost: 15,
        description: isIntrigue
          ? 'โต้กลับด้วยตรรกะและแรงกดดันทางจิตวิทยา'
          : 'ปลดปล่อยพลังประจำตัวในเสี้ยววินาทีเพื่อชิงความได้เปรียบ',
      },
    ],
    quests: [
      {
        id: 'quest-main-1',
        title: world.initialObjective || 'สำรวจเหตุการณ์ตรงหน้าและก้าวแรกในโลกนี้',
        status: 'active',
      },
    ],
  };
}

export function createSnapshot(session: SessionState, messageIndex: number): TurnSnapshot {
  return {
    id: `snap-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    messageIndex,
    turn: session.turn,
    arcNumber: session.arcNumber,
    episodeNumber: session.episodeNumber,
    turnsInEpisode: session.turnsInEpisode,
    location: session.location,
    objective: session.objective,
    mood: session.mood,
    tension: session.tension,
    sceneKey: session.sceneKey,
    sceneCgUrl: session.sceneCgUrl,
    protagonist: { ...session.world.protagonist },
    items: [...session.items],
    cast: session.cast.map((c) => ({ ...c, trustNotes: [...(c.trustNotes || [])] })),
    memories: [...session.memories],
    lorebook: session.lorebook.map((l) => ({ ...l })),
    rpg: {
      ...session.rpg,
      stats: { ...session.rpg.stats },
      skills: session.rpg.skills.map((s) => ({ ...s })),
      quests: session.rpg.quests.map((q) => ({ ...q })),
    },
    map: {
      currentNodeId: session.map.currentNodeId,
      nodes: session.map.nodes.map((n) => ({ ...n, connectedTo: [...n.connectedTo] })),
    },
    affinityHistory: (session.affinityHistory || []).map((entry) => ({ ...entry })),
    suggestedActions: [...session.suggestedActions],
  };
}

export function createInitialSession(world: WorldConfig): SessionState {
  const comp = world.hasCompanion !== false && world.companion ? world.companion : null;
  const startLocation = world.location || 'จุดเริ่มต้น';
  const startMood = comp?.initialMood || 'สังเกตการณ์';
  const openingText =
    world.openingNarration ||
    (comp
      ? `*สายลมพัดผ่านฉากเปิดเรื่องของ ${world.title}*\n\n*${comp.name} หันมามองคุณแล้วเอ่ยทักทายด้วยน้ำเสียงเป็นธรรมชาติ*`
      : `*สายลมพัดผ่าน${startLocation}ในโลก ${world.title} คุณยืนอยู่เพียงลำพังพร้อมเส้นทางข้างหน้าที่รอให้คุณลิขิตเอง*`);

  const initialEmotion = detectEmotionFromText(openingText, startMood).key;
  const initialSceneKey = resolveSceneBackdrop(world.coverKey, world, startLocation).key;

  const initialCast: CastMember[] = comp
    ? [
        {
          id: 'primary-companion',
          name: comp.name,
          gender: comp.gender || 'ไม่ระบุ',
          role: comp.role || 'คู่บทบาทหลัก',
          appearance: comp.appearance || '',
          mood: comp.initialMood || 'สังเกตการณ์',
          affinity: 35,
          relationshipTier: getRelationshipTier(35, initialEmotion),
          trustNotes: [`พบกันครั้งแรก ณ ${startLocation}`],
          isPrimary: true,
        },
      ]
    : [];

  return {
    sessionId: `session-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    world,
    turn: 1,
    arcNumber: 1,
    episodeNumber: 1,
    turnsInEpisode: 1,
    episodeArchive: [],
    location: startLocation,
    objective: world.initialObjective || 'สำรวจและกำหนดเส้นทางของคุณ',
    mood: startMood,
    tension: 25,
    sceneKey: initialSceneKey,
    items: [...(world.initialItems || [])],
    cast: initialCast,
    memories: [
      `เริ่มต้นเรื่องราวใน "${world.title}" ณ ${startLocation}`,
      comp ? `พบกับ ${comp.name} (${comp.role})` : 'เริ่มต้นการเดินทางแบบฉายเดี่ยว (Solo Journey)',
    ],
    lorebook: [
      {
        id: 'lore-world-rules',
        title: `กฎของ ${world.title}`,
        detail: world.worldRules || world.worldBoundaries,
        createdAt: 'ARC 1 · EP.1',
      },
      {
        id: 'lore-power-system',
        title: 'ระบบพลังของโลก',
        detail: world.powerSystem || 'พัฒนาตามการกระทำของผู้เล่น',
        createdAt: 'ARC 1 · EP.1',
      },
    ],
    rpg: buildInitialRpgState(world),
    map: {
      currentNodeId: 'node-start',
      nodes: [
        {
          id: 'node-start',
          name: startLocation,
          type: 'hub',
          x: 160,
          y: 120,
          connectedTo: [],
        },
      ],
    },
    messages: [
      {
        id: `narrator-init-${Date.now()}`,
        sender: 'narrator',
        turn: 1,
        text: openingText,
        emotion: initialEmotion,
        scenarioTag: world.scenarioTag || 'บทนำ',
        engineLabel: 'PROLOGUE',
      },
    ],
    turnSnapshots: [],
    affinityHistory: comp
      ? [
          {
            id: `aff-init-${Date.now()}`,
            turn: 1,
            arcNumber: 1,
            episodeNumber: 1,
            characterId: 'primary-companion',
            characterName: comp.name,
            delta: 0,
            previousAffinity: 35,
            newAffinity: 35,
            tier: getRelationshipTier(35, initialEmotion),
            description: `เริ่มต้นความสัมพันธ์ ณ ${startLocation}`,
          },
        ]
      : [],
    suggestedActions:
      world.initialSuggestions && world.initialSuggestions.length > 0
        ? world.initialSuggestions
        : [
            '*สำรวจสภาพแวดล้อมรอบตัวและประเมินสถานการณ์ตรงหน้า*',
            comp ? `*หันไปพูดคุยกับ ${comp.name} เพื่อแลกเปลี่ยนข้อมูล*` : '*มุ่งหน้าไปยังจุดหมายต่อไปอย่างระมัดระวัง*',
            '*ตรวจสอบอุปกรณ์และเตรียมความพร้อมก่อนลงมือ*',
          ],
  };
}

export function buildLocalWorldFromPrompt({
  promptText,
  proName,
  proGender,
  hasCompanion,
  compName,
  compGender,
  boundaries,
}: {
  promptText: string;
  proName: string;
  proGender: WorldConfig['protagonist']['gender'];
  hasCompanion: boolean;
  compName: string;
  compGender: WorldConfig['protagonist']['gender'];
  boundaries: string;
}): WorldConfig {
  const cleanPrompt = (promptText || '').trim();
  const shortTitle = cleanPrompt
    ? `${cleanPrompt.slice(0, 26)}${cleanPrompt.length > 26 ? '…' : ''}`
    : 'Chronicles of New Lumen';
  const defaultApp =
    proGender === 'หญิง'
      ? 'ผมยาวสีดำขลับ ดวงตาคมสีฟ้าอมเทา สวมเสื้อคลุมเดินทางเข้ารูปสีเข้ม'
      : proGender === 'ชาย'
        ? 'ผมสั้นสีดำยุ่งเล็กน้อย ดวงตาสีเทาเข้ม สวมเสื้อคลุมเดินทางสีดำหม่น'
        : 'ผมประบ่าสีเงินหม่น ดวงตาสีอำพัน สวมชุดคลุมลึกลับสีกรมท่า';

  const coverKey = resolveSceneBackdrop(undefined, undefined, cleanPrompt).key;

  return {
    id: `custom-${Date.now()}`,
    title: shortTitle,
    badge: hasCompanion ? 'CUSTOM STORY' : 'SOLO STORY',
    synopsis: cleanPrompt || 'เรื่องราวอนิเมะต้นฉบับที่สร้างขึ้นเอง',
    tropeCategory: 'custom',
    coverKey,
    isCustom: true,
    hasCompanion,
    accentHex: '#7c5cff',
    genre: 'Anime RPG • Custom World',
    worldRules: cleanPrompt || 'โลกใบใหม่ที่ทุกการกระทำของผู้เล่นกำหนดชะตากรรมของเรื่องราว',
    worldBoundaries: boundaries || cleanPrompt || 'ยึดบรรยากาศและกฎของโลกที่สร้างขึ้นอย่างเคร่งครัด',
    powerSystem: 'พัฒนาสายพลังและสกิลตามการกระทำของผู้เล่น',
    location: 'จุดเริ่มต้นแห่งโชคชะตา — ยามค่ำคืน',
    initialObjective: 'สำรวจสภาพแวดล้อมและค้นหาจุดเริ่มต้นของปริศนาในโลกนี้',
    initialItems: ['ของติดตัวปริศนา', 'แผนที่เก่าขาดวิ่น', 'เหรียญติดตัว'],
    scenarioTag: 'จุดเริ่มต้นบทใหม่',
    protagonist: {
      name: proName,
      gender: proGender || 'ไม่ระบุ',
      role: 'ผู้เริ่มต้นเส้นทาง (พัฒนาตามการกระทำ)',
      appearance: defaultApp,
      persona: 'ปรับเปลี่ยนตามการตัดสินใจของคุณ',
    },
    companion: hasCompanion
      ? {
          name: compName || (compGender === 'ชาย' ? 'เรย์ คาริส' : 'อาริสะ ลูเมน'),
          gender: compGender || 'หญิง',
          role: 'พันธมิตรผู้ร่วมชะตากรรม',
          appearance:
            compGender === 'ชาย'
              ? 'ผมสีเงินสั้น ตาสีทอง สวมแจ็กเก็ตเกราะเบา'
              : 'ผมยาวสีขาวเงิน ตาสีอเมทิสต์ สวมชุดคลุมนักเดินทาง',
          personality: 'ช่างสังเกต พูดตรงไปตรงมา และซ่อนความลับบางอย่างไว้',
          initialMood: 'สังเกตการณ์',
        }
      : null,
    openingNarration: '',
    initialSuggestions: [],
  };
}

export function generateLocalDynamicOpening(world: WorldConfig): DynamicOpeningResult {
  const hasComp = world.hasCompanion !== false && Boolean(world.companion?.name);
  const comp = hasComp ? world.companion : null;
  const pro = world.protagonist || { name: 'ตัวเอก', gender: 'ไม่ระบุ' as const };
  const baseLoc = (world.location || 'พื้นที่เริ่มต้น').split('—')[0].trim();

  const variants: Array<{
    scenarioTag: string;
    time: string;
    mood: string;
    emotion: EmotionKey;
    objective: string;
    soloText: string;
    compText: string;
  }> = [
    {
      scenarioTag: 'สัญญาณลับใต้เงามืด',
      time: 'ยามดึกหลังฝนซา',
      mood: 'ระแวดระวัง',
      emotion: 'mystery',
      objective: `แกะรอยสัญญาณปริศนาที่เพิ่งปรากฏรอบ${baseLoc}`,
      soloText: `*หมอกบางลอยต่ำปกคลุม${baseLoc}ในยามดึกหลังฝนซา กลิ่นอายเฉพาะตัวของโลก "${world.title}" แผ่ซ่านอยู่ในอากาศเงียบงัน*\n\n*ขณะที่คุณ (${pro.name}) กำลังตรวจสอบรอบข้าง วัตถุประหลาดชิ้นหนึ่งกลับเรืองแสงวูบวาบขึ้นใกล้ปลายเท้า พร้อมเสียงฝีเท้าแผ่วเบาที่หยุดลงตรงมุมอับไม่ไกลนัก*`,
      compText: `*หมอกบางลอยต่ำปกคลุม${baseLoc}ในยามดึกหลังฝนซา แสงไฟริบหรี่สะท้อนเงาของใครบางคนที่กำลังรีบเดินเข้ามา*\n\n*${comp?.name}ชะลอฝีเท้าลงตรงหน้าคุณ สีหน้าเต็มไปด้วยความระแวดระวัง* "${pro.name}... โชคดีที่เจอตัวก่อน รอบนี้สถานการณ์มันไม่เหมือนปกติเลย ฉันเพิ่งเห็นร่องรอยแปลกๆ แถวนี้ เราต้องรีบตัดสินใจแล้วว่าจะตามรอยไปหรือเปลี่ยนเส้นทาง"`,
    },
    {
      scenarioTag: 'ข้อเสนอที่คาดไม่ถึง',
      time: 'ยามสายท่ามกลางความวุ่นวาย',
      mood: 'หยั่งเชิง',
      emotion: 'smirk',
      objective: `ประเมินข้อเสนอและหาความจริงเบื้องหลังความเคลื่อนไหวใน${baseLoc}`,
      soloText: `*เสียงผู้คนและแรงสั่นสะเทือนของเหตุการณ์บางอย่างดังก้องทั่ว${baseLoc} ในช่วงเวลานี้ทุกคนต่างรีบเร่งราวกับมีข่าวใหญ่เพิ่งแพร่สะพัด*\n\n*ซองสารปิดผนึกไร้ชื่อถูกสอดไว้ข้างตัวคุณตั้งแต่เมื่อไหร่ไม่รู้ ข้อความสั้นๆ ด้านในท้าทายให้ ${pro.name} เลือกข้างก่อนที่เวลาจะหมดลง*`,
      compText: `*ท่ามกลางความวุ่นวายของ${baseLoc} ${comp?.name}เดินแทรกฝูงชนเข้ามาหยุดข้างคุณพร้อมยิ้มมุมปากแบบอ่านใจไม่ออก*\n\n"ดูเหมือนวันนี้ดวงเราจะสมพงษ์กับเรื่องยุ่งยากนะ ${pro.name}" *${comp?.name}ลดเสียงลงให้ได้ยินกันแค่สองคน* "มีคนกำลังตามหาตัวคนที่มีคุณสมบัติแบบพวกเราอยู่พอดี... สนใจจะลองฟังข้อเสนอ หรือจะชิงลงมือก่อนล่ะ?"`,
    },
    {
      scenarioTag: 'เหตุวิกฤตเฉพาะหน้า',
      time: 'ช่วงพลบค่ำฟ้าเปลี่ยนสี',
      mood: 'ตื่นตัวสูง',
      emotion: 'action',
      objective: `รับมือความโกลาหลกะทันหันที่เกิดขึ้น ณ ${baseLoc}`,
      soloText: `*ท้องฟ้าเหนือ${baseLoc}เปลี่ยนสีฉับพลันพร้อมแรงกดดันประหลาดที่สอดคล้องกับกฎของ "${world.title}" เสียงเตือนภัยดังแทรกความเงียบ*\n\n*${pro.name}ตั้งหลักอย่างรวดเร็ว เบื้องหน้ามีสองเส้นทาง—ทางหนึ่งนำไปสู่ต้นตอของเหตุการณ์ ส่วนอีกทางคือจุดซุ่มดูสถานการณ์ที่ปลอดภัยกว่า*`,
      compText: `*แรงสั่นสะเทือนเบาๆ แล่นผ่านพื้นใต้เท้าที่${baseLoc} ${comp?.name}ขยับตัวเข้ามาตั้งท่าพร้อมรับมือทันที*\n\n"เฮ้ ${pro.name}! อย่าเพิ่งเหม่อสิ ดูตรงนั้น!" *${comp?.name}ชี้ไปยังจุดที่บรรยากาศเริ่มบิดเบี้ยวผิดปกติ* "ถ้าปล่อยไว้แบบนี้เรื่องบานปลายแน่ นายจะบุกเข้าไปจัดการตรงๆ หรือให้ฉันช่วยเปิดทางให้ก่อนดี?"`,
    },
    {
      scenarioTag: 'บทสนทนาใต้แสงจันทร์',
      time: 'คืนเดือนหงายเงียบสงัด',
      mood: 'สงบนิ่ง',
      emotion: 'warm',
      objective: `เตรียมความพร้อมและวางแผนก้าวต่อไปจาก${baseLoc}`,
      soloText: `*แสงจันทร์สาดส่องลงบน${baseLoc}อย่างเงียบสงบ เป็นช่วงเวลาไม่กี่นาทีที่ความวุ่นวายของ "${world.title}" ดูเหมือนจะหยุดนิ่ง*\n\n*แต่ในความสงบนี้เอง ${pro.name}กลับสังเกตเห็นเงาความเคลื่อนไหวไกลออกไป ซึ่งเป็นจุดเริ่มต้นของเส้นทางใหม่ที่กำลังรออยู่*`,
      compText: `*ลมเย็นยามค่ำคืนพัดผ่าน${baseLoc}อย่างแผ่วเบา ${comp?.name}หันมามองคุณด้วยแววตาที่ผ่อนคลายกว่าปกติเล็กน้อย*\n\n"คืนนี้เงียบแปลกๆ นะว่าไหม ${pro.name}?" *${comp?.name}เอนหลังพิงกำแพงพลางหันมาสบตา* "ก่อนที่เรื่องวุ่นวายรอบใหม่จะเริ่มขึ้น... อยากคุยเรื่องแผนของเรา หรือมีอะไรที่นายอยากถามฉันก่อนไหม?"`,
    },
  ];

  const pick = variants[Math.floor(Math.random() * variants.length)];
  const loc = `${baseLoc} — ${pick.time}`;
  return {
    scenarioTag: pick.scenarioTag,
    location: loc,
    mood: pick.mood,
    emotion: pick.emotion,
    objective: pick.objective,
    openingNarration: comp ? pick.compText : pick.soloText,
    suggestedActions: comp
      ? [
          `*สบตา${comp.name}แล้วตอบกลับอย่างมั่นใจ* "งั้นลุยกันเลย ฉันไม่ปล่อยให้โอกาสนี้หลุดมือแน่"`,
          `*กวาดตามองรอบ${baseLoc}อย่างละเอียด* "เดี๋ยวก่อน ลองตรวจสอบสถานการณ์รอบข้างให้แน่ใจก่อนดีกว่า"`,
          `*ถามกลับด้วยน้ำเสียงจริงจัง* "แล้วเธอรู้เบื้องหลังของเรื่องนี้มากแค่ไหนกันแน่ ${comp.name}?"`,
        ]
      : [
          `*เดินเข้าไปตรวจสอบต้นตอของเหตุการณ์ตรงหน้าอย่างไม่ลังเล*`,
          `*ถอยเข้ามุมอับเพื่อซุ่มสังเกตการณ์และเก็บข้อมูลก่อนลงมือ*`,
          `*เตรียมอาวุธและตรวจสอบอุปกรณ์ติดตัวให้พร้อมรับมือทุกสถานการณ์*`,
        ],
    engineLabel: 'DYNAMIC OPENING · OFFLINE',
  };
}

export function generateLocalTurn(
  session: SessionState,
  userInput: string,
  mode: 'ic' | 'ooc',
): TurnResult {
  const comp = session.cast[0];
  const pro = session.world.protagonist;
  const trimmed = userInput.trim();
  const isAction = /(โจมตี|บุก|วิ่ง|ฟัน|ยิง|หลบ|ใช้สกิล|ตรวจ|ค้น)/.test(trimmed);
  const isWarm = /(ช่วย|ปกป้อง|ขอบคุณ|ไว้ใจ|ยิ้ม|ถามไถ่|ปลอบ)/.test(trimmed);
  const emotion: EmotionKey =
    mode === 'ooc' ? 'neutral' : isAction ? 'action' : isWarm ? 'warm' : comp ? 'smirk' : 'mystery';
  const mood = isAction ? 'ตื่นตัว' : isWarm ? 'เปิดใจขึ้น' : comp ? 'ตั้งใจฟัง' : 'ระแวดระวัง';
  const affinityDelta = comp ? (isWarm ? 5 : isAction ? 2 : 1) : 0;

  const narration =
    mode === 'ooc'
      ? `*[คำสั่งผู้กำกับ OOC]* ปรับทิศทางฉากตามที่ระบุ: "${trimmed}"\n\n*บรรยากาศรอบ ${session.location} เปลี่ยนแปลงไปตามบทใหม่ที่วางไว้ ${comp ? `${comp.name} ขยับเข้ามาสมทบด้วยท่าทีสอดคล้องกับสถานการณ์` : `${pro.name} เตรียมพร้อมรับความเปลี่ยนแปลงตรงหน้า`}*`
      : comp
        ? `*${pro.name} ตัดสินใจลงมือ: ${trimmed}*\n\n*${comp.name} ตอบสนองทันที แววตาสะท้อนอารมณ์ที่เปลี่ยนไปเล็กน้อย* "เข้าใจแล้ว ${pro.name} ถ้าเลือกทางนี้ ฉันก็จะตามไปด้วย... แต่ระวังด้านหน้าไว้ด้วย ดูเหมือนความเคลื่อนไหวรอบ ${session.location.split('—')[0].trim()} กำลังเข้มข้นขึ้น"`
        : `*${pro.name} ดำเนินการตามการตัดสินใจ: ${trimmed}*\n\n*ผลลัพธ์เริ่มปรากฏขึ้นรอบ ${session.location.split('—')[0].trim()} ร่องรอยใหม่เผยให้เห็นเส้นทางที่ซ่อนอยู่ท่ามกลางความเงียบงัน*`;

  const shouldEvolve = (session.turn + 1) % 4 === 0;
  const protagonistUpdate = shouldEvolve
    ? {
        role: isAction
          ? `${pro.role.split('(')[0].trim()} (นักรบแนวหน้า)`
          : isWarm
            ? `${pro.role.split('(')[0].trim()} (ผู้เชื่อมสายสัมพันธ์)`
            : undefined,
        persona: isAction
          ? 'เด็ดเดี่ยว กล้าชนกับวิกฤตตรงหน้า'
          : isWarm
            ? 'เปิดใจและใส่ใจความรู้สึกของพวกพ้องมากขึ้น'
            : undefined,
      }
    : null;

  return {
    narration,
    emotion,
    mood,
    tension: Math.min(95, Math.max(15, session.tension + (isAction ? 10 : -3))),
    affinityDelta,
    relationshipNote: isWarm && comp ? `${comp.name} รู้สึกประทับใจในท่าทีของคุณ` : undefined,
    protagonistUpdate,
    rpgDelta: {
      xpDelta: 20,
      mpDelta: isAction ? -5 : 4,
      goldDelta: isAction ? 5 : 0,
    },
    newMemory: `ตอนที่ ${session.turn + 1}: ${trimmed.slice(0, 65)}`,
    suggestedActions: comp
      ? [
          `*หันไปส่งสัญญาณให้ ${comp.name}* "เดินหน้าต่อกันเถอะ อย่าให้เสียจังหวะ"`,
          `*ตรวจสอบเบาะแสหรือไอเทมที่เพิ่งพบอย่างละเอียด*`,
          `*ลองเจรจาหรือสอบถามข้อมูลเพิ่มเติมจากบรรยากาศรอบข้าง*`,
        ]
      : [
          `*ก้าวต่อไปยังจุดที่มีร่องรอยชัดเจนที่สุด*`,
          `*หยุดซุ่มสังเกตการณ์เพื่อจับจังหวะศัตรูหรือผู้คนรอบข้าง*`,
          `*ใช้สกิลวิเคราะห์สถานการณ์เพื่อหาทางลับ*`,
        ],
    engineLabel: 'STORY ENGINE · OFFLINE',
  };
}

export function generateLocalEpisodeRecap(session: SessionState): EpisodeSummary {
  const comp = session.cast[0];
  const recentMems = session.memories.slice(-4);
  return {
    id: `ep-${Date.now()}`,
    arcNumber: session.arcNumber,
    episodeNumber: session.episodeNumber,
    title: `บทที่ ${session.episodeNumber}: เงาที่เปลี่ยนไป ณ ${session.location.split('—')[0].trim()}`,
    recapBullets:
      recentMems.length > 0
        ? recentMems
        : [`${session.world.protagonist.name} ก้าวผ่านเหตุการณ์สำคัญใน ${session.location}`],
    affinityHighlight: comp
      ? `${comp.name} อยู่ในระดับ "${comp.relationshipTier}" (${comp.affinity}%)`
      : 'เดินทางฉายเดี่ยวและสั่งสมประสบการณ์อย่างต่อเนื่อง',
    nextEpisodeHook: `ตอนต่อไป: เป้าหมาย "${session.objective}" กำลังจะเปิดเผยความจริงอีกด้านที่ไม่มีใครคาดคิด`,
    completedAtTurn: session.turn,
  };
}

export function generateProceduralAnimePortraitDataUrl({
  name,
  appearance = '',
  mood = '',
  accentHex = '#7c5cff',
}: {
  name: string;
  appearance?: string;
  mood?: string;
  accentHex?: string;
}): string {
  const text = `${name} ${appearance} ${mood}`.toLowerCase();
  const hair = /(เงิน|ขาว|silver|white)/.test(text)
    ? '#e2e8f0'
    : /(ทอง|blonde|gold)/.test(text)
      ? '#facc15'
      : /(แดง|crimson|red)/.test(text)
        ? '#e11d48'
        : /(ฟ้า|cyan|blue)/.test(text)
          ? '#38bdf8'
          : '#27293d';
  const eye = /(แดง|ruby|crimson)/.test(text)
    ? '#fb7185'
    : /(ทอง|amber)/.test(text)
      ? '#fbbf24'
      : '#60a5fa';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0b1020"/>
        <stop offset="100%" stop-color="${accentHex}" stop-opacity="0.48"/>
      </linearGradient>
      <radialGradient id="rim" cx="50%" cy="38%" r="55%">
        <stop offset="0%" stop-color="${accentHex}" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#090b10" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="240" height="240" fill="url(#bg)"/>
    <circle cx="120" cy="96" r="88" fill="url(#rim)"/>
    <circle cx="48" cy="52" r="2.5" fill="#fff" opacity="0.6"/>
    <circle cx="195" cy="70" r="2" fill="#fff" opacity="0.5"/>
    <path d="M52,96 C44,155 40,210 56,240 L184,240 C200,210 196,155 188,96 C178,42 152,26 120,26 C88,26 62,42 52,96Z" fill="#11131f"/>
    <path d="M32,240 C42,188 72,172 120,172 C168,172 198,188 208,240Z" fill="#1b2134"/>
    <path d="M88,174 L120,216 L152,174" fill="none" stroke="${accentHex}" stroke-width="4" stroke-linejoin="round"/>
    <rect x="104" y="144" width="32" height="36" rx="10" fill="#f3cfb8"/>
    <path d="M72,92 C72,56 168,56 168,92 C170,130 148,158 120,162 C92,158 70,130 72,92Z" fill="#fde3d2"/>
    <ellipse cx="94" cy="108" rx="12" ry="9" fill="#fff"/>
    <circle cx="95" cy="108" r="7.5" fill="${eye}"/>
    <circle cx="95" cy="108" r="3.5" fill="#0f172a"/>
    <circle cx="91" cy="104" r="2.5" fill="#fff"/>
    <ellipse cx="146" cy="108" rx="12" ry="9" fill="#fff"/>
    <circle cx="145" cy="108" r="7.5" fill="${eye}"/>
    <circle cx="145" cy="108" r="3.5" fill="#0f172a"/>
    <circle cx="141" cy="104" r="2.5" fill="#fff"/>
    <path d="M112,138 Q120,143 128,138" fill="none" stroke="#a65d4f" stroke-width="3" stroke-linecap="round"/>
    <path d="M58,104 C54,50 86,26 120,26 C154,26 186,50 182,104 C174,74 158,64 146,84 C138,62 128,58 120,88 C112,58 102,62 94,84 C82,64 66,74 58,104Z" fill="${hair}"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function generateProceduralSceneCgDataUrl({
  location,
  mood,
  accentHex = '#7c5cff',
}: {
  location: string;
  mood: string;
  accentHex?: string;
}): string {
  const combined = `${location} ${mood}`.toLowerCase();
  const skyTop = /(แดง|วิกฤต|ปะทะ|โกรธ|blood|crimson)/.test(combined) ? '#260812' : '#090d1e';
  const skyBottom = /(นีออน|ไซเบอร์|cyber|neon)/.test(combined) ? '#0e7490' : accentHex;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${skyTop}"/>
        <stop offset="68%" stop-color="${skyBottom}" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#090b10"/>
      </linearGradient>
      <radialGradient id="moon" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
        <stop offset="60%" stop-color="${skyBottom}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${skyBottom}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="800" height="450" fill="url(#sky)"/>
    <circle cx="590" cy="128" r="105" fill="url(#moon)"/>
    <circle cx="590" cy="128" r="38" fill="#f8fafc" opacity="0.9"/>
    <path d="M0,335 L110,270 L215,310 L340,235 L465,305 L610,245 L725,295 L800,260 L800,450 L0,450Z" fill="#0d1120" opacity="0.78"/>
    <path d="M0,380 L160,340 L310,370 L500,325 L660,365 L800,335 L800,450 L0,450Z" fill="#07090f"/>
    <g fill="#ffffff" opacity="0.55">
      <circle cx="140" cy="90" r="1.8"/><circle cx="230" cy="64" r="1.4"/><circle cx="380" cy="112" r="2"/>
      <circle cx="480" cy="58" r="1.5"/><circle cx="710" cy="84" r="2"/><circle cx="290" cy="180" r="2.4"/>
    </g>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
