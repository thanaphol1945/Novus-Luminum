import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Paintbrush, Upload, X } from 'lucide-react';
import { EMOTION_PROFILES } from '../data/presets';
import type { EmotionKey } from '../types';

const AFFINITY_MILESTONES = [50, 75, 90] as const;

export function parsePortraitTraits(appearance = '', mood = '', role = '', gender = '') {
  const text = `${appearance} ${role} ${gender}`.toLowerCase();
  const moodText = (mood || '').toLowerCase();

  let hair = '#262938';
  let hairLight = '#464d68';
  let hairDark = '#151722';
  if (/(ขาว|เงิน|silver|white)/.test(text)) {
    hair = '#d7e0ec';
    hairLight = '#f8fafc';
    hairDark = '#8b9bb4';
  } else if (/(ทอง|บลอนด์|gold|blonde)/.test(text)) {
    hair = '#eab308';
    hairLight = '#fef08a';
    hairDark = '#a16207';
  } else if (/(แดง|ทับทิม|crimson|red)/.test(text)) {
    hair = '#dc2626';
    hairLight = '#f87171';
    hairDark = '#7f1d1d';
  } else if (/(ฟ้า|เขียว|cyan|teal|blue)/.test(text)) {
    hair = '#06b6d4';
    hairLight = '#67e8f9';
    hairDark = '#0e7490';
  } else if (/(ชมพู|pink)/.test(text)) {
    hair = '#ec4899';
    hairLight = '#f9a8d4';
    hairDark = '#9d174d';
  } else if (/(ม่วง|purple)/.test(text)) {
    hair = '#7c3aed';
    hairLight = '#c4b5fd';
    hairDark = '#4c1d95';
  } else if (/(น้ำตาล|brown)/.test(text)) {
    hair = '#6b4226';
    hairLight = '#a47148';
    hairDark = '#3d2414';
  }

  let eye = '#38bdf8';
  if (/(แดง|ทับทิม|crimson|red)/.test(text)) eye = '#f43f5e';
  else if (/(ทอง|อำพัน|amber|gold)/.test(text)) eye = '#f59e0b';
  else if (/(ม่วง|อเมทิสต์|purple)/.test(text)) eye = '#a855f7';
  else if (/(เขียว|มรกต|green)/.test(text)) eye = '#10b981';
  else if (/(เทา|เงิน|gray|silver)/.test(text)) eye = '#94a3b8';

  const isLongHair =
    /(ยาว|ดัดลอน|ประบ่า|บ๊อบ|หญิง|สาว|บุตรี|ดัชเชส|female)/.test(text) &&
    !/(ผมสั้นเกรียน|ชายหนุ่ม)/.test(text);
  const hasScar = /(แผลเป็น|scar)/.test(text);
  const hasCyberLens = /(เลนส์|สแกน|ไซเบอร์|cyber|หูฟัง)/.test(text);
  const outfitType = /(ราตรี|ขุนนาง|ดยุก|กำมะหยี่)/.test(text)
    ? 'royal'
    : /(เกราะ|ทหาร|ฮันเตอร์)/.test(text)
      ? 'armor'
      : /(ไซเบอร์|นีออน|แจ็กเก็ต)/.test(text)
        ? 'cyber'
        : 'coat';

  let expression = 'neutral';
  if (/(ยิ้ม|สุข|เปิดใจ|อ่อนโยน|อบอุ่น|เขิน|รัก|หวั่นไหว)/.test(moodText)) expression = 'warm';
  else if (/(โกรธ|ตื่นตัว|ระแวดระวัง|อันตราย|เครียด|ดุดัน|เดือด)/.test(moodText)) expression = 'intense';
  else if (/(หยั่งเชิง|เจ้าเล่ห์|สนุก|มั่นใจ)/.test(moodText)) expression = 'smirk';

  return { hair, hairLight, hairDark, eye, isLongHair, hasScar, hasCyberLens, outfitType, expression };
}

interface AnimePortraitProps {
  name: string;
  appearance?: string;
  role?: string;
  gender?: string;
  mood?: string;
  emotionKey?: EmotionKey;
  tension?: number;
  customImageUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  affinity?: number;
  relationshipTier?: string;
  milestoneEvent?: { milestone: number | null; tier: string; key: number } | null;
  shakeTrigger?: string | number;
  isPainting?: boolean;
  onAiPaint?: () => void;
  onUploadImage?: (dataUrl: string) => void;
  onClearImage?: () => void;
}

export const AnimePortrait: React.FC<AnimePortraitProps> = ({
  name,
  appearance = '',
  role = '',
  gender = '',
  mood = '',
  emotionKey = 'neutral',
  tension = 25,
  customImageUrl,
  size = 'md',
  affinity,
  relationshipTier,
  milestoneEvent = null,
  shakeTrigger,
  isPainting = false,
  onAiPaint,
  onUploadImage,
  onClearImage,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevRef = useRef<{ name: string; affinity: number; tier: string } | null>(null);
  const lastExternalKeyRef = useRef<number | null>(null);
  const [milestoneAlert, setMilestoneAlert] = useState<{
    milestone: number | null;
    tier: string;
    key: number;
  } | null>(null);

  useEffect(() => {
    if (milestoneEvent && milestoneEvent.key !== lastExternalKeyRef.current) {
      lastExternalKeyRef.current = milestoneEvent.key;
      setMilestoneAlert(milestoneEvent);
    }
  }, [milestoneEvent]);

  useEffect(() => {
    if (typeof affinity !== 'number') {
      prevRef.current = null;
      return;
    }

    const currentTier = relationshipTier || '';
    const prev = prevRef.current;

    if (!prev || prev.name !== name) {
      prevRef.current = { name, affinity, tier: currentTier };
      return;
    }

    if (affinity > prev.affinity) {
      const crossedMilestone = [...AFFINITY_MILESTONES]
        .reverse()
        .find((m) => prev.affinity < m && affinity >= m) ?? null;
      const tierChanged = Boolean(currentTier && prev.tier && currentTier !== prev.tier);

      if (crossedMilestone !== null || tierChanged) {
        setMilestoneAlert((existing) =>
          existing && existing.milestone === crossedMilestone && existing.tier === currentTier
            ? existing
            : {
                milestone: crossedMilestone,
                tier: currentTier,
                key: Date.now(),
              },
        );
      }
    }

    prevRef.current = { name, affinity, tier: currentTier };
  }, [name, affinity, relationshipTier]);

  useEffect(() => {
    if (!milestoneAlert) return;
    const timer = window.setTimeout(() => setMilestoneAlert(null), 3100);
    return () => window.clearTimeout(timer);
  }, [milestoneAlert]);
  const traits = useMemo(
    () => parsePortraitTraits(appearance, mood, role, gender),
    [appearance, mood, role, gender],
  );
  const uid = useMemo(
    () => `nl-${(name || 'c').replace(/[^a-zA-Z0-9]/g, '')}-${Math.abs((name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0))}`,
    [name],
  );

  const emotion = EMOTION_PROFILES[emotionKey] || EMOTION_PROFILES.neutral;
  const sizeClass =
    size === 'sm'
      ? 'w-11 h-11 rounded-xl'
      : size === 'lg'
        ? 'w-24 h-24 sm:w-28 sm:h-28 rounded-2xl'
        : 'w-14 h-14 rounded-xl';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUploadImage) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUploadImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const isBlush = emotionKey === 'blush' || traits.expression === 'warm';
  const isAngryOrAction = emotionKey === 'angry' || emotionKey === 'action' || traits.expression === 'intense';
  const isSmirk = emotionKey === 'smirk' || traits.expression === 'smirk';
  const isShock = emotionKey === 'shock';
  const isSad = emotionKey === 'sad';

  const outfitColors =
    traits.outfitType === 'royal'
      ? { primary: '#581c3a', secondary: '#ca8a04' }
      : traits.outfitType === 'armor'
        ? { primary: '#273043', secondary: '#94a3b8' }
        : traits.outfitType === 'cyber'
          ? { primary: '#131d2b', secondary: '#22d3ee' }
          : { primary: '#1e2433', secondary: '#64748b' };

  const emotionMotionClass =
    shakeTrigger !== undefined && size === 'lg'
      ? isAngryOrAction || isShock
        ? 'animate-nl-emotion-shake'
        : isBlush || isSmirk
          ? 'animate-nl-emotion-pop'
          : ''
      : '';

  return (
    <div key={shakeTrigger !== undefined ? `${uid}-${shakeTrigger}` : uid} className={`relative group shrink-0 ${emotionMotionClass}`}>
      {/* Affinity Milestone Toast (md / lg) */}
      {milestoneAlert && size !== 'sm' && (
        <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 z-30">
          <div
            key={milestoneAlert.key}
            role="status"
            aria-live="polite"
            className="animate-nl-milestone-toast inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#191124]/95 border border-rose-400/55 text-xs font-medium text-rose-100 shadow-xl whitespace-nowrap"
          >
            <Heart className="w-3 h-3 fill-rose-400 text-rose-300 shrink-0" />
            <span className="font-mono tabular-nums text-rose-200">
              {milestoneAlert.milestone !== null
                ? `${milestoneAlert.milestone}%`
                : `${affinity}%`}
            </span>
            {milestoneAlert.tier && (
              <>
                <span aria-hidden="true">·</span>
                <span>{milestoneAlert.tier}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Expanding Heart-Pulse Ring */}
      {milestoneAlert && (
        <span
          key={`ring-${milestoneAlert.key}`}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 ${
            size === 'lg' ? 'rounded-2xl' : 'rounded-xl'
          } border-2 border-rose-400/80 animate-nl-heart-ring z-10`}
        />
      )}

      <div
        className={`${sizeClass} relative overflow-hidden border ${
          milestoneAlert ? 'border-rose-400/75' : 'border-white/15'
        } bg-[#0e1320] shadow-lg transition-colors`}
        style={{
          boxShadow: milestoneAlert
            ? '0 0 22px rgba(244, 63, 94, 0.45)'
            : tension >= 60
              ? `0 0 18px ${emotion.accentHex}33`
              : '0 4px 14px rgba(0,0,0,0.45)',
        }}
      >
        {customImageUrl ? (
          <img
            src={customImageUrl}
            alt={name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : (
          <svg viewBox="0 0 120 120" className="w-full h-full" aria-label={`Portrait of ${name}`}>
            <defs>
              <linearGradient id={`${uid}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#14192b" />
                <stop offset="100%" stopColor={emotion.accentHex} stopOpacity="0.28" />
              </linearGradient>
              <linearGradient id={`${uid}-hair`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={traits.hairLight} />
                <stop offset="55%" stopColor={traits.hair} />
                <stop offset="100%" stopColor={traits.hairDark} />
              </linearGradient>
            </defs>

            {/* Backdrop */}
            <rect width="120" height="120" fill={`url(#${uid}-bg)`} />
            <circle cx="60" cy="48" r="44" fill={emotion.accentHex} opacity="0.1" />

            {/* Back Hair */}
            {traits.isLongHair ? (
              <path
                d="M25,46 C22,74 20,104 28,120 L92,120 C100,104 98,74 95,46 C91,20 75,14 60,14 C45,14 29,20 25,46 Z"
                fill={traits.hairDark}
              />
            ) : (
              <path
                d="M28,46 C26,30 40,14 60,14 C80,14 94,30 92,46 L86,66 L34,66 Z"
                fill={traits.hairDark}
              />
            )}

            {/* Shoulders & Outfit */}
            <path d="M18,120 C22,94 36,86 60,86 C84,86 98,94 102,120 Z" fill={outfitColors.primary} />
            <path d="M44,88 L60,108 L76,88" fill="none" stroke={outfitColors.secondary} strokeWidth="2.5" strokeLinejoin="round" />

            {/* Neck & Face */}
            <rect x="52" y="72" width="16" height="20" rx="6" fill="#f1cfb8" />
            <path d="M52,75 Q60,82 68,75 L68,81 Q60,85 52,81 Z" fill="#ddb096" />
            <path d="M35,44 C35,28 85,28 85,44 C86,63 75,79 60,81 C45,79 34,63 35,44 Z" fill="#fae0ce" />

            {/* Subtle blush */}
            {isBlush && (
              <>
                <ellipse cx="44" cy="60" rx="6.5" ry="3" fill="#fb7185" opacity="0.45" />
                <ellipse cx="76" cy="60" rx="6.5" ry="3" fill="#fb7185" opacity="0.45" />
              </>
            )}

            {/* Scar */}
            {traits.hasScar && (
              <path d="M72,54 L78,61" stroke="#b91c1c" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
            )}

            {/* Eyes */}
            <g>
              {/* Left eye */}
              <ellipse cx="47" cy="53" rx="6.2" ry={isShock ? 6.5 : 5.2} fill="#ffffff" />
              <circle cx="47.5" cy="53" r={isShock ? 3.4 : 4.2} fill={traits.eye} />
              <circle cx="47.5" cy="53.3" r="2" fill="#0f172a" />
              <circle cx="45.8" cy="51.2" r="1.4" fill="#ffffff" />
              <path d="M40,48 Q47,45 54,49" fill="none" stroke="#1e293b" strokeWidth="2.1" strokeLinecap="round" />

              {/* Right eye */}
              <ellipse cx="73" cy="53" rx="6.2" ry={isShock ? 6.5 : 5.2} fill="#ffffff" />
              <circle cx="72.5" cy="53" r={isShock ? 3.4 : 4.2} fill={traits.eye} />
              <circle cx="72.5" cy="53.3" r="2" fill="#0f172a" />
              <circle cx="70.8" cy="51.2" r="1.4" fill="#ffffff" />
              <path d="M66,49 Q73,45 80,48" fill="none" stroke="#1e293b" strokeWidth="2.1" strokeLinecap="round" />
            </g>

            {/* Cyber Lens */}
            {traits.hasCyberLens && (
              <g opacity="0.85">
                <rect x="38.5" y="47" width="17" height="12" rx="3" fill="#06b6d4" fillOpacity="0.22" stroke="#22d3ee" strokeWidth="1.2" />
                <line x1="35" y1="53" x2="38.5" y2="53" stroke="#22d3ee" strokeWidth="1.4" />
              </g>
            )}

            {/* Eyebrows */}
            {isAngryOrAction ? (
              <>
                <path d="M40,43 L53,46" stroke={traits.hairDark} strokeWidth="2.1" strokeLinecap="round" />
                <path d="M80,43 L67,46" stroke={traits.hairDark} strokeWidth="2.1" strokeLinecap="round" />
              </>
            ) : isSad ? (
              <>
                <path d="M40,46 L52,43" stroke={traits.hairDark} strokeWidth="1.8" strokeLinecap="round" />
                <path d="M80,46 L68,43" stroke={traits.hairDark} strokeWidth="1.8" strokeLinecap="round" />
              </>
            ) : (
              <>
                <path d="M41,44 Q47,42 53,44" fill="none" stroke={traits.hairDark} strokeWidth="1.8" strokeLinecap="round" />
                <path d="M67,44 Q73,42 79,44" fill="none" stroke={traits.hairDark} strokeWidth="1.8" strokeLinecap="round" />
              </>
            )}

            {/* Nose & Mouth */}
            <path d="M59.5,58 L58.5,62" stroke="#c9977d" strokeWidth="1.3" strokeLinecap="round" />
            {isShock ? (
              <ellipse cx="60" cy="69" rx="3.2" ry="3.8" fill="#be123c" />
            ) : isSmirk ? (
              <path d="M55,69 Q61,71 67,66.5" fill="none" stroke="#9f5848" strokeWidth="1.8" strokeLinecap="round" />
            ) : isBlush || traits.expression === 'warm' ? (
              <path d="M54,68 Q60,72.5 66,68" fill="none" stroke="#9f5848" strokeWidth="1.8" strokeLinecap="round" />
            ) : isAngryOrAction ? (
              <path d="M55,70 Q60,67.5 65,70" fill="none" stroke="#9f5848" strokeWidth="1.8" strokeLinecap="round" />
            ) : (
              <path d="M56,69 Q60,70 64,69" fill="none" stroke="#9f5848" strokeWidth="1.6" strokeLinecap="round" />
            )}

            {/* Front Bangs / Hair */}
            <path
              d="M29,52 C27,26 42,14 60,14 C78,14 93,26 91,52 C88,38 80,31 74,42 C71,32 65,28 60,44 C55,28 49,33 46,43 C40,32 33,38 29,52 Z"
              fill={`url(#${uid}-hair)`}
            />
            {traits.isLongHair && (
              <>
                <path d="M31,45 C29,65 31,82 37,92 C35,76 35,61 36,48 Z" fill={`url(#${uid}-hair)`} />
                <path d="M89,45 C91,65 89,82 83,92 C85,76 85,61 84,48 Z" fill={`url(#${uid}-hair)`} />
              </>
            )}
          </svg>
        )}
      </div>

      {/* Heart-Pulse Corner Indicator */}
      {milestoneAlert && (
        <span
          key={`heart-${milestoneAlert.key}`}
          aria-hidden="true"
          className="pointer-events-none absolute -top-1.5 -right-1.5 z-20 w-6 h-6 rounded-full bg-rose-500/95 border border-rose-200/70 shadow-lg flex items-center justify-center animate-nl-heart-beat"
        >
          <Heart className="w-3.5 h-3.5 fill-white text-white" />
        </span>
      )}

      {(onUploadImage || onAiPaint) && (
        <>
          {onUploadImage && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          )}
          <div className="absolute -bottom-1.5 -right-1.5 z-20 flex items-center gap-1 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            {onAiPaint && (
              <button
                type="button"
                disabled={isPainting}
                onClick={onAiPaint}
                title="วาดภาพตัวละครด้วย AI"
                className="w-7 h-7 rounded-lg bg-[var(--nl-accent)] hover:bg-[var(--nl-accent-hover)] border border-white/25 text-white flex items-center justify-center shadow-md cursor-pointer disabled:opacity-60"
              >
                <Paintbrush className={`w-3.5 h-3.5 ${isPainting ? 'animate-spin' : ''}`} />
              </button>
            )}
            {onUploadImage && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="อัปโหลดรูปโปรไฟล์ตัวละคร"
                className="w-7 h-7 rounded-lg bg-[#161b28] hover:bg-[var(--nl-accent)] border border-white/20 text-slate-200 hover:text-white flex items-center justify-center shadow-md cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
            )}
            {customImageUrl && onClearImage && (
              <button
                type="button"
                onClick={onClearImage}
                title="กลับไปใช้ภาพอนิเมะ SVG"
                className="w-7 h-7 rounded-lg bg-[#161b28] hover:bg-rose-600 border border-white/20 text-slate-200 hover:text-white flex items-center justify-center shadow-md cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
