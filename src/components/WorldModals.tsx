import React, { useState } from 'react';
import { RefreshCw, Sparkles, X, Compass, Users } from 'lucide-react';
import { GENDER_OPTIONS, SANDBOX_GENRE_CHIPS } from '../data/presets';
import { requestAiWorldBuilder } from '../services/api';
import { buildLocalWorldFromPrompt, resolveSceneBackdrop } from '../utils/storyEngine';
import type { AppSettings, GenderOption, WorldConfig } from '../types';

interface CreatorModalProps {
  open: boolean;
  settings: AppSettings;
  onClose: () => void;
  onCreated: (world: WorldConfig, skipDynamicCall: boolean) => void;
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const WorldCreatorModal: React.FC<CreatorModalProps> = ({
  open,
  settings,
  onClose,
  onCreated,
  onToast,
}) => {
  const [aiWorldPrompt, setAiWorldPrompt] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hasCompanion, setHasCompanion] = useState(false);

  const [proName, setProName] = useState('');
  const [proGender, setProGender] = useState<GenderOption>('ชาย');
  const [proAppearance, setProAppearance] = useState('');

  const [compName, setCompName] = useState('');
  const [compGender, setCompGender] = useState<GenderOption>('หญิง');
  const [compRole, setCompRole] = useState('');
  const [compAppearance, setCompAppearance] = useState('');
  const [compPersona, setCompPersona] = useState('');

  const [worldTitle, setWorldTitle] = useState('');
  const [genre, setGenre] = useState('Dark Fantasy • Action • Romance');
  const [worldRules, setWorldRules] = useState('');
  const [worldBoundaries, setWorldBoundaries] = useState('');
  const [powerSystem, setPowerSystem] = useState('');
  const [location, setLocation] = useState('ลานกว้างใต้แสงจันทร์');
  const [objective, setObjective] = useState('');
  const [opening, setOpening] = useState('');
  const [scenarioTag, setScenarioTag] = useState('');
  const [initSuggestions, setInitSuggestions] = useState<string[]>([]);
  const [initItems, setInitItems] = useState<string[]>([]);
  const [aiReady, setAiReady] = useState(false);

  if (!open) return null;

  const resetForm = () => {
    setAiWorldPrompt('');
    setWorldTitle('');
    setGenre('Dark Fantasy • Action • Romance');
    setWorldRules('');
    setWorldBoundaries('');
    setPowerSystem('');
    setProName('');
    setProGender('ชาย');
    setProAppearance('');
    setCompName('');
    setCompGender('หญิง');
    setCompRole('');
    setCompAppearance('');
    setCompPersona('');
    setLocation('ลานกว้างใต้แสงจันทร์');
    setObjective('');
    setOpening('');
    setScenarioTag('');
    setInitSuggestions([]);
    setInitItems([]);
    setAiReady(false);
    setShowAdvanced(false);
  };

  const buildDraft = async (): Promise<WorldConfig | null> => {
    const cleanProName = proName.trim();
    if (!cleanProName) {
      onToast('กรุณากรอกชื่อตัวเอกของคุณก่อนครับ', 'error');
      return null;
    }

    setIsBuilding(true);
    try {
      let built: WorldConfig;
      if (settings.aiEnabled) {
        built = await requestAiWorldBuilder({
          promptText: aiWorldPrompt.trim() || `${genre} ที่มีปริศนาและการตัดสินใจเข้มข้น`,
          proName: cleanProName,
          proGender,
          hasCompanion,
          compName: compName.trim(),
          compGender,
          boundaries: worldBoundaries.trim(),
          settings,
        });
      } else {
        built = buildLocalWorldFromPrompt({
          promptText: aiWorldPrompt.trim(),
          proName: cleanProName,
          proGender,
          hasCompanion,
          compName: compName.trim(),
          compGender,
          boundaries: worldBoundaries.trim(),
        });
      }

      setWorldTitle(built.title || '');
      setGenre(built.genre || 'Anime Roleplay');
      setWorldRules(built.worldRules || '');
      setWorldBoundaries(built.worldBoundaries || worldBoundaries.trim() || built.worldRules || '');
      setPowerSystem(built.powerSystem || '');
      setLocation(built.location || 'ลานกว้างกลางเมือง');
      setObjective(built.initialObjective || '');
      setProAppearance(built.protagonist?.appearance || '');

      if (hasCompanion && built.companion) {
        setCompName(built.companion.name || '');
        setCompGender(built.companion.gender || compGender);
        setCompRole(built.companion.role || '');
        setCompAppearance(built.companion.appearance || '');
        setCompPersona(built.companion.personality || '');
      }

      setOpening(built.openingNarration || '');
      setScenarioTag(built.scenarioTag || 'บทเริ่มต้นแห่งโชคชะตา');
      setInitSuggestions(Array.isArray(built.initialSuggestions) ? built.initialSuggestions : []);
      setInitItems(
        Array.isArray(built.initialItems) && built.initialItems.length > 0
          ? built.initialItems
          : ['ของติดตัวประจำกาย'],
      );
      setAiReady(true);
      return built;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถสร้างโลกด้วย AI ได้';
      onToast(msg, 'error');
      return null;
    } finally {
      setIsBuilding(false);
    }
  };

  const handlePreviewBuild = async () => {
    const built = await buildDraft();
    if (built) {
      onToast('ออกแบบโลกและตัวละครเรียบร้อยแล้ว กดเข้าเล่นหรือปรับแก้เพิ่มเติมได้ทันที', 'success');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBuilding) return;

    if (!proName.trim()) {
      onToast('กรุณากรอกชื่อตัวเอกของคุณก่อนครับ', 'error');
      return;
    }

    let built: WorldConfig | null = null;
    if (!aiReady || !worldTitle.trim()) {
      built = await buildDraft();
      if (!built) return;
    }

    const finalTitle = (built?.title || worldTitle).trim() || 'โลกอนิเมะใหม่';
    const finalGenre = (built?.genre || genre).trim() || 'Anime Roleplay';
    const finalRules =
      (built?.worldRules || worldRules).trim() || 'ดำเนินเรื่องตามการตัดสินใจของผู้เล่นอย่างอิสระ';
    const finalBoundaries = (built?.worldBoundaries || worldBoundaries || finalRules).trim();
    const finalPower = (built?.powerSystem || powerSystem).trim() || 'พัฒนาตามการกระทำของผู้เล่น';
    const finalLoc = (built?.location || location).trim() || 'ลานกว้างใต้แสงจันทร์';
    const finalItems =
      built?.initialItems?.length ? built.initialItems : initItems.length ? initItems : ['ของติดตัวประจำกาย'];
    const finalOpening = (built?.openingNarration || opening).trim();
    const finalSuggestions =
      built?.initialSuggestions?.length ? built.initialSuggestions : initSuggestions;

    const compData = hasCompanion
      ? {
          name: (built?.companion?.name || compName).trim() || 'คู่บทบาทนิรนาม',
          gender: (built?.companion?.gender || compGender || 'ไม่ระบุ') as GenderOption,
          role: (built?.companion?.role || compRole).trim() || 'คู่บทบาทหลัก',
          appearance: (built?.companion?.appearance || compAppearance).trim(),
          personality:
            (built?.companion?.personality || compPersona).trim() || 'มีเอกลักษณ์และน่าค้นหา',
          initialMood: built?.companion?.initialMood || 'สนใจ',
        }
      : null;

    const newWorld: WorldConfig = {
      id: `custom-${Date.now()}`,
      title: finalTitle,
      badge: hasCompanion ? 'AI WORLD' : 'AI SOLO JOURNEY',
      synopsis: (built?.synopsis || aiWorldPrompt).trim() || finalRules,
      tropeCategory: built?.tropeCategory || 'custom',
      coverKey:
        built?.coverKey ||
        resolveSceneBackdrop(undefined, undefined, `${aiWorldPrompt} ${finalGenre} ${finalLoc}`).key,
      isCustom: true,
      isSandbox: false,
      hasCompanion,
      accentHex: '#7c5cff',
      genre: finalGenre,
      toneTags: [],
      worldRules: finalRules,
      worldBoundaries: finalBoundaries,
      powerSystem: finalPower,
      location: finalLoc,
      initialObjective:
        (built?.initialObjective || objective).trim() || 'เริ่มต้นการผจญภัยและค้นหาความจริงของโลกนี้',
      initialItems: finalItems,
      scenarioTag: built?.scenarioTag || scenarioTag || 'ฉากเปิดเฉพาะรอบนี้',
      protagonist: {
        name: proName.trim(),
        gender: proGender,
        role: built?.protagonist?.role || 'เริ่มต้นเส้นทาง (พัฒนาตามการกระทำ)',
        appearance: (built?.protagonist?.appearance || proAppearance).trim(),
        persona: built?.protagonist?.persona || 'ปรับเปลี่ยนตามการตัดสินใจของคุณ',
      },
      companion: compData,
      openingNarration: finalOpening,
      initialSuggestions: finalSuggestions,
    };

    resetForm();
    onClose();
    onCreated(newWorld, Boolean(finalOpening));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#111520] border border-white/12 rounded-2xl max-w-2xl w-full p-6 shadow-2xl my-auto max-h-[92vh] overflow-y-auto space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#38bdf8]" />
              <span>สร้างโลก & ตัวละครด้วย AI</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              กำหนดเพียงชื่อ เพศ และไอเดียโลก — ระบบจะออกแบบรายละเอียดและสุ่มฉากเปิดใหม่ทุกครั้งที่เริ่มเล่น
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Step 1: Protagonist */}
          <div className="space-y-3 pb-4 border-b border-white/8">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#38bdf8]">1. ตัวตนของตัวเอก</span>
              <span className="text-xs text-slate-500">รูปลักษณ์และสายพลังจะถูกสร้างให้เข้ากับโลก</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1.5">ชื่อตัวเอก *</label>
                <input
                  type="text"
                  required
                  value={proName}
                  onChange={(e) => setProName(e.target.value)}
                  placeholder="เช่น เร็น, ยูกิ, อารอน..."
                  className="w-full rounded-xl bg-[#090b10] border border-white/12 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-[#7c5cff] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1.5">เพศตัวเอก *</label>
                <div className="grid grid-cols-3 gap-2">
                  {GENDER_OPTIONS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setProGender(g)}
                      className={`py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                        proGender === g
                          ? 'bg-[#7c5cff] text-white border-[#7c5cff]'
                          : 'bg-[#090b10] text-slate-300 border-white/12 hover:border-white/25'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Companion */}
          <div className="space-y-3 pb-4 border-b border-white/8">
            <div className="text-xs font-medium text-rose-300">2. คู่บทบาทเริ่มต้น (เลือกได้)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setHasCompanion(false)}
                className={`p-3 rounded-xl border text-left transition-colors ${
                  !hasCompanion
                    ? 'bg-[#38bdf8]/12 border-[#38bdf8]/60 text-white'
                    : 'bg-[#090b10] border-white/10 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-[#38bdf8]" />
                  <span>ฉายเดี่ยว (Solo Journey)</span>
                </div>
                <div className="text-xs opacity-75 mt-1">เริ่มเรื่องคนเดียว ค่อยพบตัวละครใหม่ตามเนื้อเรื่อง</div>
              </button>
              <button
                type="button"
                onClick={() => setHasCompanion(true)}
                className={`p-3 rounded-xl border text-left transition-colors ${
                  hasCompanion
                    ? 'bg-rose-500/15 border-rose-400/60 text-white'
                    : 'bg-[#090b10] border-white/10 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-rose-300" />
                  <span>มีคู่บทบาทเริ่มต้น</span>
                </div>
                <div className="text-xs opacity-75 mt-1">สร้างคู่หูเริ่มต้น (กำหนดชื่อและเพศเพิ่มได้)</div>
              </button>
            </div>

            {hasCompanion && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs text-slate-300 mb-1.5">ชื่อคู่บทบาท (เว้นว่างให้ AI ตั้งให้)</label>
                  <input
                    type="text"
                    value={compName}
                    onChange={(e) => setCompName(e.target.value)}
                    placeholder="เว้นว่าง = ให้ AI คิดชื่อให้"
                    className="w-full rounded-xl bg-[#090b10] border border-white/12 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-rose-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1.5">เพศคู่บทบาท</label>
                  <div className="grid grid-cols-3 gap-2">
                    {GENDER_OPTIONS.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setCompGender(g)}
                        className={`py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                          compGender === g
                            ? 'bg-rose-500 text-white border-rose-500'
                            : 'bg-[#090b10] text-slate-300 border-white/12 hover:border-white/25'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 3: World Concept */}
          <div className="space-y-3">
            <div className="text-xs font-medium text-violet-300">3. ไอเดียโลกและขอบเขต</div>
            <textarea
              rows={3}
              value={aiWorldPrompt}
              onChange={(e) => {
                setAiWorldPrompt(e.target.value);
                setAiReady(false);
              }}
              placeholder="บอกไอเดียโลกที่อยากเล่น เช่น 'โลกแฟนตาซีที่ดวงอาทิตย์ดับไป 100 ปี เมืองทั้งหมดอยู่บนรถไฟยักษ์ที่วิ่งฝ่าหิมะและอสูรเงา'..."
              className="w-full rounded-xl bg-[#090b10] border border-white/12 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-[#38bdf8] focus:outline-none"
            />

            <div className="flex flex-wrap gap-1.5">
              {SANDBOX_GENRE_CHIPS.slice(0, 8).map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    setAiWorldPrompt((prev) =>
                      prev.includes(chip) ? prev : `${prev ? prev + ' ' : ''}[${chip}]`,
                    );
                    setAiReady(false);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#090b10] hover:bg-white/10 border border-white/10 text-xs text-slate-300 transition-colors"
                >
                  + {chip}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1.5">
                ขอบเขตของโลก / สิ่งที่ห้ามหลุดธีม (ไม่บังคับ)
              </label>
              <input
                type="text"
                value={worldBoundaries}
                onChange={(e) => setWorldBoundaries(e.target.value)}
                placeholder="เช่น คุมธีมดาร์กแฟนตาซียุคกลาง ไม่มีปืนสมัยใหม่ เน้นการเอาตัวรอด..."
                className="w-full rounded-xl bg-[#090b10] border border-white/12 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-[#38bdf8] focus:outline-none"
              />
            </div>

            <button
              type="button"
              disabled={isBuilding}
              onClick={handlePreviewBuild}
              className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-[#38bdf8]/40 text-[#38bdf8] text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isBuilding ? 'animate-spin' : ''}`} />
              <span>{isBuilding ? 'กำลังออกแบบโลกและตัวละคร...' : 'สร้างพรีวิวโลก & ตัวละครก่อน'}</span>
            </button>
          </div>

          {aiReady && (
            <div className="rounded-xl bg-[#090b10] border border-emerald-500/35 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-emerald-300">ออกแบบโลกเรียบร้อยแล้ว</span>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="text-xs text-[#38bdf8] hover:underline"
                >
                  {showAdvanced ? 'ซ่อนช่องแก้ไขละเอียด' : 'แก้ไขรายละเอียดเอง'}
                </button>
              </div>
              <div className="text-sm font-semibold text-white">
                {worldTitle} <span className="text-xs font-normal text-slate-400">· {genre}</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{worldRules}</p>
              <div className="text-xs text-slate-400 space-y-1 pt-2 border-t border-white/10">
                <div>
                  <span className="text-[#38bdf8]">รูปลักษณ์ตัวเอก:</span> {proAppearance || 'ตามเนื้อเรื่อง'}
                </div>
                <div>
                  <span className="text-amber-300">ระบบพลัง:</span> {powerSystem || 'พัฒนาตามการกระทำ'}
                </div>
                {hasCompanion && (
                  <div>
                    <span className="text-rose-300">คู่บทบาท:</span> {compName} ({compGender}) · {compRole}
                  </div>
                )}
              </div>
            </div>
          )}

          {showAdvanced && (
            <div className="rounded-xl bg-[#090b10] border border-white/10 p-4 space-y-2.5">
              <div className="text-xs text-slate-400">ปรับแก้รายละเอียดเพิ่มเติม</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={worldTitle}
                  onChange={(e) => setWorldTitle(e.target.value)}
                  placeholder="ชื่อโลก"
                  className="rounded-lg bg-[#111520] border border-white/10 px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  placeholder="แนวเรื่อง"
                  className="rounded-lg bg-[#111520] border border-white/10 px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  value={powerSystem}
                  onChange={(e) => setPowerSystem(e.target.value)}
                  placeholder="ระบบพลัง"
                  className="rounded-lg bg-[#111520] border border-white/10 px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  value={proAppearance}
                  onChange={(e) => setProAppearance(e.target.value)}
                  placeholder="รูปลักษณ์ตัวเอก"
                  className="rounded-lg bg-[#111520] border border-white/10 px-3 py-2 text-xs text-white"
                />
              </div>
              <input
                type="text"
                value={worldRules}
                onChange={(e) => setWorldRules(e.target.value)}
                placeholder="กฎของโลก"
                className="w-full rounded-lg bg-[#111520] border border-white/10 px-3 py-2 text-xs text-white"
              />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="สถานที่เปิดฉาก"
                className="w-full rounded-lg bg-[#111520] border border-white/10 px-3 py-2 text-xs text-white"
              />
              {hasCompanion && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={compRole}
                    onChange={(e) => setCompRole(e.target.value)}
                    placeholder="บทบาทคู่บทบาท"
                    className="rounded-lg bg-[#111520] border border-white/10 px-3 py-2 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={compAppearance}
                    onChange={(e) => setCompAppearance(e.target.value)}
                    placeholder="รูปลักษณ์คู่บทบาท"
                    className="rounded-lg bg-[#111520] border border-white/10 px-3 py-2 text-xs text-white"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              {showAdvanced ? 'ซ่อนตัวเลือกขั้นสูง' : 'ปรับแก้รายละเอียดเอง'}
            </button>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-slate-300"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={isBuilding}
                className="px-5 py-2 rounded-xl bg-[#7c5cff] hover:bg-[#6d4aff] text-sm font-semibold text-white disabled:opacity-50 transition-colors"
              >
                {isBuilding ? 'กำลังสร้างโลก...' : aiReady ? 'เข้าเล่นโลกนี้' : 'สร้างและเข้าเล่นทันที'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

interface WorldCustomizerModalProps {
  draft: (WorldConfig & { itemsText: string; hasCompanion: boolean }) | null;
  onChange: React.Dispatch<
    React.SetStateAction<(WorldConfig & { itemsText: string; hasCompanion: boolean }) | null>
  >;
  saveAsCopy: boolean;
  onToggleSaveAsCopy: (val: boolean) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const WorldCustomizerModal: React.FC<WorldCustomizerModalProps> = ({
  draft,
  onChange,
  saveAsCopy,
  onToggleSaveAsCopy,
  onClose,
  onSubmit,
}) => {
  if (!draft) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#111520] border border-white/12 rounded-2xl max-w-2xl w-full p-6 shadow-2xl my-auto max-h-[90vh] overflow-y-auto space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-white">
              ปรับแต่งก่อนเริ่มรอบใหม่: {draft.title}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              ทุกครั้งที่กดเริ่มเล่น ระบบจะสุ่มสถานการณ์และบทสนทนาเปิดฉากใหม่ภายใต้ขอบเขตโลกนี้
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1.5">ชื่อตัวเอก</label>
              <input
                type="text"
                required
                value={draft.protagonist.name}
                onChange={(e) =>
                  onChange((p) =>
                    p ? { ...p, protagonist: { ...p.protagonist, name: e.target.value } } : p,
                  )
                }
                placeholder="ชื่อตัวเอก"
                className="w-full rounded-xl bg-[#090b10] border border-white/12 px-3.5 py-2.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1.5">เพศตัวเอก</label>
              <div className="grid grid-cols-3 gap-2">
                {GENDER_OPTIONS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() =>
                      onChange((p) =>
                        p ? { ...p, protagonist: { ...p.protagonist, gender: g } } : p,
                      )
                    }
                    className={`py-2.5 rounded-xl text-xs font-medium border ${
                      (draft.protagonist.gender || 'ชาย') === g
                        ? 'bg-[#7c5cff] text-white border-[#7c5cff]'
                        : 'bg-[#090b10] text-slate-300 border-white/12'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={draft.title}
              onChange={(e) => onChange((p) => (p ? { ...p, title: e.target.value } : p))}
              className="rounded-xl bg-[#090b10] border border-white/12 px-3.5 py-2.5 text-sm text-white"
              placeholder="ชื่อโลก"
            />
            <input
              type="text"
              value={draft.location}
              onChange={(e) => onChange((p) => (p ? { ...p, location: e.target.value } : p))}
              className="rounded-xl bg-[#090b10] border border-white/12 px-3.5 py-2.5 text-sm text-white"
              placeholder="สถานที่หลักอ้างอิง"
            />
          </div>

          <textarea
            rows={2}
            value={draft.worldBoundaries || ''}
            onChange={(e) => onChange((p) => (p ? { ...p, worldBoundaries: e.target.value } : p))}
            className="w-full rounded-xl bg-[#090b10] border border-white/12 px-3.5 py-2.5 text-sm text-white"
            placeholder="ขอบเขตและกฎเหล็กของโลกนี้"
          />

          <div className="flex flex-wrap gap-1.5">
            {SANDBOX_GENRE_CHIPS.map((tag) => {
              const active = (draft.toneTags || []).includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    onChange((p) => {
                      if (!p) return p;
                      const current = p.toneTags || [];
                      const next = active ? current.filter((t) => t !== tag) : [...current, tag];
                      return {
                        ...p,
                        toneTags: next,
                        genre: next.length ? next.join(' • ') : p.genre,
                      };
                    })
                  }
                  className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                    active
                      ? 'bg-[#7c5cff]/25 border-[#7c5cff] text-white'
                      : 'bg-[#090b10] border-white/10 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>

          <div className="rounded-xl bg-[#090b10] border border-white/10 p-4 space-y-3">
            <label className="flex items-center justify-between text-xs text-[#38bdf8] cursor-pointer">
              <span className="font-medium">มีคู่บทบาทเริ่มต้น (ปิดเพื่อเล่นแบบฉายเดี่ยว Solo)</span>
              <input
                type="checkbox"
                checked={draft.hasCompanion}
                onChange={(e) =>
                  onChange((p) => (p ? { ...p, hasCompanion: e.target.checked } : p))
                }
                className="w-4 h-4 accent-[#7c5cff]"
              />
            </label>

            {draft.hasCompanion && draft.companion && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-white/10">
                <input
                  type="text"
                  value={draft.companion.name}
                  onChange={(e) =>
                    onChange((p) =>
                      p && p.companion
                        ? { ...p, companion: { ...p.companion, name: e.target.value } }
                        : p,
                    )
                  }
                  placeholder="ชื่อคู่บทบาท"
                  className="rounded-xl bg-[#111520] border border-white/12 px-3.5 py-2 text-sm text-white"
                />
                <div className="grid grid-cols-3 gap-1.5">
                  {GENDER_OPTIONS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() =>
                        onChange((p) =>
                          p && p.companion
                            ? { ...p, companion: { ...p.companion, gender: g } }
                            : p,
                        )
                      }
                      className={`py-2 rounded-xl text-xs font-medium border ${
                        (draft.companion?.gender || 'หญิง') === g
                          ? 'bg-rose-500 text-white border-rose-500'
                          : 'bg-[#111520] text-slate-300 border-white/12'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-white/10">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={saveAsCopy}
                onChange={(e) => onToggleSaveAsCopy(e.target.checked)}
                className="w-4 h-4 accent-[#7c5cff]"
              />
              <span>บันทึกเก็บไว้ในคลังโลก</span>
            </label>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[#7c5cff] hover:bg-[#6d4aff] text-sm font-semibold text-white transition-colors"
            >
              สุ่มฉากเปิดใหม่ & เข้าเล่น
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
