import React from 'react';
import { ArrowRight, Film, X } from 'lucide-react';
import type { EpisodeSummary } from '../types';

interface EpisodeRecapModalProps {
  recap: EpisodeSummary | null;
  onClose: () => void;
  onAdvanceEpisode: () => void;
}

export const EpisodeRecapModal: React.FC<EpisodeRecapModalProps> = ({
  recap,
  onClose,
  onAdvanceEpisode,
}) => {
  if (!recap) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#111520] border border-white/15 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 my-auto">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="text-xs font-mono tabular-nums text-[#38bdf8]">
              ARC {recap.arcNumber} · EPISODE {recap.episodeNumber} FINALE
            </div>
            <h2 className="text-lg font-semibold text-white mt-1 flex items-center gap-2">
              <Film className="w-5 h-5 text-[#7c5cff]" />
              <span>{recap.title}</span>
            </h2>
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

        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-slate-400">สรุปเหตุการณ์สำคัญในตอนนี้</h3>
            <ul className="space-y-2">
              {recap.recapBullets.map((item, idx) => (
                <li
                  key={idx}
                  className="rounded-xl bg-[#090b10] border border-white/8 px-3.5 py-2.5 text-xs sm:text-sm text-slate-200"
                >
                  <span className="font-mono tabular-nums text-slate-500 mr-2">
                    {String(idx + 1).padStart(2, '0')}.
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {recap.affinityHighlight && (
            <div className="rounded-xl bg-[#090b10] border border-rose-400/25 px-4 py-3 text-xs text-rose-200">
              ความสัมพันธ์: {recap.affinityHighlight}
            </div>
          )}

          {recap.nextEpisodeHook && (
            <div className="rounded-xl bg-[#090b10] border border-[#38bdf8]/30 px-4 py-3 space-y-1">
              <div className="text-xs font-medium text-[#38bdf8]">ตัวอย่างตอนต่อไป</div>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                {recap.nextEpisodeHook}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-slate-300"
          >
            อยู่ในตอนนี้ต่อ
          </button>
          <button
            type="button"
            onClick={onAdvanceEpisode}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#7c5cff] hover:bg-[#6d4aff] text-sm font-semibold text-white transition-colors"
          >
            <span>เริ่ม Episode {recap.episodeNumber + 1}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
