import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react';
import { SCENE_BACKDROPS, TROPE_CATEGORIES } from '../data/presets';
import { resolveSceneBackdrop } from '../utils/storyEngine';
import type { StoryCardFile, TropeCategory, WorldConfig } from '../types';

interface DiscoverViewProps {
  worlds: WorldConfig[];
  activeWorldId: string;
  onPlayWorld: (world: WorldConfig) => void;
  onCustomizeWorld: (world: WorldConfig) => void;
  onDeleteWorld: (worldId: string) => void;
  onCreateNew: () => void;
  onImportStoryCard: (world: WorldConfig) => void;
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  worlds,
  activeWorldId,
  onPlayWorld,
  onCustomizeWorld,
  onDeleteWorld,
  onCreateNew,
  onImportStoryCard,
  onToast,
}) => {
  const [selectedTrope, setSelectedTrope] = useState<TropeCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);

  const filteredWorlds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return worlds.filter((w) => {
      const cat = w.tropeCategory || (w.isCustom ? 'custom' : 'isekai');
      const matchesTrope =
        selectedTrope === 'all'
          ? true
          : selectedTrope === 'custom'
            ? Boolean(w.isCustom)
            : cat === selectedTrope;

      if (!matchesTrope) return false;
      if (!q) return true;

      const haystack = `${w.title} ${w.genre} ${w.synopsis || ''} ${w.protagonist.name} ${w.companion?.name || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [worlds, selectedTrope, searchQuery]);

  const handleExportStoryCard = (world: WorldConfig) => {
    const payload: StoryCardFile = {
      type: 'novus-luminum-story-card',
      version: 1,
      exportedAt: new Date().toISOString(),
      world,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `story-card-${world.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onToast(`ส่งออก Story Card "${world.title}" แล้ว`, 'success');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const worldData: WorldConfig | null =
          parsed?.type === 'novus-luminum-story-card' && parsed?.world
            ? parsed.world
            : parsed?.title && parsed?.protagonist
              ? parsed
              : null;

        if (!worldData) {
          throw new Error('Invalid story card format');
        }

        const imported: WorldConfig = {
          ...worldData,
          id: `card-${Date.now()}`,
          isCustom: true,
          badge: worldData.badge || 'IMPORTED CARD',
          tropeCategory: worldData.tropeCategory || 'custom',
          coverKey:
            worldData.coverKey && SCENE_BACKDROPS[worldData.coverKey]
              ? worldData.coverKey
              : resolveSceneBackdrop(undefined, worldData).key,
        };
        onImportStoryCard(imported);
      } catch {
        onToast('ไฟล์ Story Card ไม่ถูกต้อง กรุณาเลือกไฟล์ .json ที่ส่งออกจากสตูดิโอ', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="max-w-6xl w-full mx-auto px-4 lg:px-8 py-6 space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-['Outfit'] text-2xl sm:text-3xl font-bold text-white tracking-tight">
            ค้นพบเรื่องราวอนิเมะ
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            เลือกโลกเพื่อสวมบทบาทแบบ Playable Anime หรือนำเข้าและส่งออก Story Card เพื่อแบ่งปัน
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/12 text-xs sm:text-sm font-medium text-slate-200 whitespace-nowrap shrink-0 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>นำเข้า Story Card</span>
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#7c5cff] hover:bg-[#6d4aff] text-xs sm:text-sm font-semibold text-white whitespace-nowrap shrink-0 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>สร้างเรื่องใหม่</span>
          </button>
        </div>
      </div>

      {/* Trope Filter & Search Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2 border-b border-white/10">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#111520] border border-white/10 overflow-x-auto">
          {TROPE_CATEGORIES.map((cat) => {
            const active = selectedTrope === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedTrope(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-[#7c5cff] text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาชื่อเรื่อง แนวเรื่อง หรือตัวละคร..."
            className="w-full rounded-xl bg-[#111520] border border-white/12 pl-9 pr-3.5 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:border-[#7c5cff] focus:outline-none"
          />
        </div>
      </div>

      {/* Story Card Grid */}
      {filteredWorlds.length === 0 ? (
        <div className="rounded-2xl bg-[#111520] border border-white/10 p-10 text-center space-y-3">
          <p className="text-sm text-slate-300">
            {selectedTrope === 'custom'
              ? 'ยังไม่มี Story Card ที่สร้างเองหรือนำเข้าในหมวดนี้'
              : 'ไม่พบเรื่องราวที่ตรงกับคำค้นหา'}
          </p>
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#7c5cff] hover:bg-[#6d4aff] text-xs font-semibold text-white"
          >
            <Plus className="w-4 h-4" />
            <span>สร้างโลกเรื่องแรกของคุณ</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredWorlds.map((world) => {
            const backdrop = resolveSceneBackdrop(world.coverKey, world, world.location);
            const isPlaying = world.id === activeWorldId;

            return (
              <article
                key={world.id}
                className={`rounded-2xl bg-[#111520] border overflow-hidden flex flex-col transition-colors ${
                  isPlaying ? 'border-[#7c5cff]/70' : 'border-white/10 hover:border-white/20'
                }`}
              >
                {/* 16:9 Scene Artwork Header */}
                <div className="relative aspect-video bg-[#090b10] overflow-hidden">
                  <img
                    src={backdrop.imagePath}
                    alt={world.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#111520] via-black/35 to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4">
                    <div className="text-[11px] text-slate-300 truncate">
                      {world.badge || 'ANIME WORLD'}
                      {isPlaying ? ' · กำลังเล่นอยู่' : ''}
                    </div>
                    <h2 className="text-base font-semibold text-white leading-snug line-clamp-1 mt-0.5">
                      {world.title}
                    </h2>
                  </div>
                </div>

                {/* Body */}
                <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="text-xs text-slate-400 truncate">{world.genre}</div>
                    <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                      {world.synopsis || world.worldRules}
                    </p>
                    <div className="text-xs text-slate-400 pt-1">
                      ตัวเอก: <span className="text-slate-200">{world.protagonist.name}</span>
                      {world.companion ? (
                        <>
                          {' '}
                          · คู่บทบาท: <span className="text-slate-200">{world.companion.name}</span>
                        </>
                      ) : (
                        ' · ฉายเดี่ยว'
                      )}
                    </div>
                  </div>

                  {/* Action Footer */}
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/8">
                    <button
                      type="button"
                      onClick={() => onPlayWorld(world)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#7c5cff] hover:bg-[#6d4aff] text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>เริ่มเล่น</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onCustomizeWorld(world)}
                        title="ปรับแต่งก่อนเล่น"
                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <SlidersHorizontal className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportStoryCard(world)}
                        title="ส่งออกเป็น Story Card (.json)"
                        className="p-2 rounded-lg text-slate-400 hover:text-[#38bdf8] hover:bg-white/5 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {world.isCustom && (
                        <button
                          type="button"
                          onClick={() => onDeleteWorld(world.id)}
                          title="ลบ Story Card"
                          className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-white/5 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
