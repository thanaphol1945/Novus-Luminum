import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FastForward,
  Heart,
  ImagePlus,
  Music,
  Paintbrush,
  Pencil,
  RefreshCw,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { EMOTION_PROFILES, SCENE_BACKDROPS } from '../data/presets';
import { soundEngine } from '../utils/audioEngine';
import { resolveSceneBackdrop } from '../utils/storyEngine';
import type {
  FloatingStatPopup,
  SceneVisualKey,
  SessionState,
  StoryMessage,
} from '../types';
import { AnimePortrait } from './AnimePortrait';

interface VisualNovelStageProps {
  session: SessionState;
  portraitImages: Record<string, string>;
  speakingMsgId: string | null;
  isBusy: boolean;
  typewriterEnabled: boolean;
  sfxEnabled: boolean;
  ambientEnabled: boolean;
  floatingPopups?: FloatingStatPopup[];
  isPaintingPortrait?: boolean;
  isPaintingScene?: boolean;
  milestoneEvent?: { milestone: number | null; tier: string; key: number } | null;
  onSpeakThai: (msg: StoryMessage) => void;
  onRerollMessage: (msg: StoryMessage) => void;
  onRewindToSnapshot: (snapshotId: string) => void;
  onEditPlayerTurn: (playerMsg: StoryMessage, updatedText: string) => void;
  onChangeSceneKey: (sceneKey: SceneVisualKey) => void;
  onAiPaintPortrait: (charKey: string) => void;
  onAiPaintScene: () => void;
  onClearSceneCg: () => void;
  onToggleAmbient: () => void;
  onUploadPortrait: (charKey: string, dataUrl: string) => void;
  onClearPortrait: (charKey: string) => void;
  renderFormattedText: (text: string) => React.ReactNode;
}

export const VisualNovelStage: React.FC<VisualNovelStageProps> = ({
  session,
  portraitImages,
  speakingMsgId,
  isBusy,
  typewriterEnabled,
  sfxEnabled,
  ambientEnabled,
  floatingPopups = [],
  isPaintingPortrait = false,
  isPaintingScene = false,
  milestoneEvent = null,
  onSpeakThai,
  onRerollMessage,
  onRewindToSnapshot,
  onEditPlayerTurn,
  onChangeSceneKey,
  onAiPaintPortrait,
  onAiPaintScene,
  onClearSceneCg,
  onToggleAmbient,
  onUploadPortrait,
  onClearPortrait,
  renderFormattedText,
}) => {
  const narratorMessages = session.messages.filter((m) => m.sender === 'narrator');
  const [pageOffset, setPageOffset] = useState(0);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const clampedOffset = Math.min(pageOffset, Math.max(0, narratorMessages.length - 1));
  const activeNarratorIndex = Math.max(0, narratorMessages.length - 1 - clampedOffset);
  const activeMsg = narratorMessages[activeNarratorIndex] || session.messages[0];
  const isLatestScene = clampedOffset === 0;

  // Typewriter reveal state for newly generated narrator turns
  const seenMsgIdsRef = useRef<Set<string>>(new Set());
  const [revealedCount, setRevealedCount] = useState<number>(Infinity);
  const [typingMsgId, setTypingMsgId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeMsg) return;
    const fullText = activeMsg.text || '';

    if (
      !typewriterEnabled ||
      !isLatestScene ||
      activeMsg.isOpeningLoading ||
      seenMsgIdsRef.current.has(activeMsg.id)
    ) {
      seenMsgIdsRef.current.add(activeMsg.id);
      setTypingMsgId(null);
      setRevealedCount(fullText.length);
      return;
    }

    // Mark as seen so browsing history doesn't replay typewriter unexpectedly
    seenMsgIdsRef.current.add(activeMsg.id);
    setTypingMsgId(activeMsg.id);
    setRevealedCount(0);

    let count = 0;
    const stepSize = fullText.length > 420 ? 4 : 2;
    const timer = window.setInterval(() => {
      count += stepSize;
      if (count >= fullText.length) {
        setRevealedCount(fullText.length);
        setTypingMsgId(null);
        window.clearInterval(timer);
      } else {
        setRevealedCount(count);
        soundEngine.playTypewriterTick(sfxEnabled);
      }
    }, 18);

    return () => window.clearInterval(timer);
  }, [activeMsg?.id, typewriterEnabled, isLatestScene, activeMsg?.isOpeningLoading, sfxEnabled]);

  const isTypingActive =
    Boolean(activeMsg) && typingMsgId === activeMsg.id && revealedCount < activeMsg.text.length;

  const handleSkipTypewriter = () => {
    if (!activeMsg) return;
    setRevealedCount(activeMsg.text.length);
    setTypingMsgId(null);
  };

  const displayStoryText = activeMsg
    ? isTypingActive
      ? activeMsg.text.slice(0, revealedCount)
      : activeMsg.text
    : '';

  const activeMsgGlobalIndex = session.messages.findIndex((m) => m.id === activeMsg?.id);
  const precedingPlayerMsg =
    activeMsgGlobalIndex > 0 && session.messages[activeMsgGlobalIndex - 1]?.sender === 'player'
      ? session.messages[activeMsgGlobalIndex - 1]
      : null;

  const primaryCast = session.cast[0] || null;
  const targetPortraitKey = primaryCast ? primaryCast.id : 'protagonist';
  const backdrop = resolveSceneBackdrop(session.sceneKey, session.world, session.location);
  const emotion = EMOTION_PROFILES[activeMsg?.emotion || 'neutral'] || EMOTION_PROFILES.neutral;

  const tensionLabel =
    session.tension >= 75 ? 'วิกฤต' : session.tension >= 45 ? 'ตึงเครียด' : 'สงบ';
  const stageShakeClass =
    isLatestScene &&
    (activeMsg?.emotion === 'angry' ||
      activeMsg?.emotion === 'action' ||
      activeMsg?.emotion === 'shock')
      ? 'animate-nl-emotion-shake'
      : '';

  return (
    <div className="space-y-3">
      {/* Cinematic 16:9 Stage Viewport */}
      <div
        key={`stage-frame-${activeMsg?.id}-${activeMsg?.emotion}`}
        className={`relative rounded-2xl overflow-hidden border border-[var(--nl-border)] bg-[var(--nl-bg)] shadow-2xl ${stageShakeClass}`}
      >
        {/* Background Layer */}
        <div className="relative min-h-[430px] sm:min-h-[480px] flex flex-col justify-between">
          <img
            src={session.sceneCgUrl || backdrop.imagePath}
            alt={session.sceneCgUrl ? `Scene CG: ${session.location}` : backdrop.label}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--nl-bg)] via-[var(--nl-bg)]/60 to-black/45" />

          {/* Top Stage HUD */}
          <div className="relative z-10 p-4 flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
                <span className="font-mono tabular-nums font-semibold text-white">
                  ARC {session.arcNumber} · EP.{session.episodeNumber}
                </span>
                <span aria-hidden="true">·</span>
                <span>{session.location}</span>
              </div>
              <div className="text-xs text-slate-300">
                เป้าหมาย: <span className="text-white">{session.objective}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {primaryCast && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/55 backdrop-blur-sm border border-white/12 text-slate-100">
                  <Heart className="w-3.5 h-3.5 text-rose-400" />
                  <span className="font-medium">{primaryCast.name}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-rose-300">
                    {primaryCast.affinity}%
                  </span>
                  <span className="text-slate-300">({primaryCast.relationshipTier})</span>
                </div>
              )}

              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-black/55 backdrop-blur-sm border border-white/12 text-slate-200">
                <span>ความตึงเครียด: {tensionLabel}</span>
                <span className="font-mono tabular-nums text-[var(--nl-secondary)]">
                  {session.tension}%
                </span>
              </div>

              <button
                type="button"
                onClick={onToggleAmbient}
                title={ambientEnabled ? 'ปิดเสียงบรรยากาศ' : 'เปิดเสียงบรรยากาศ'}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg backdrop-blur-sm border text-xs transition-colors whitespace-nowrap shrink-0 ${
                  ambientEnabled
                    ? 'bg-[var(--nl-accent)]/25 border-[var(--nl-accent)]/60 text-white'
                    : 'bg-black/55 border-white/12 text-slate-300 hover:text-white'
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>{ambientEnabled ? 'Ambient เปิด' : 'Ambient'}</span>
              </button>
            </div>
          </div>

          {/* Floating Stat Popups */}
          {floatingPopups.length > 0 && (
            <div className="pointer-events-none relative z-20 px-4 flex flex-wrap justify-end gap-1.5">
              {floatingPopups.map((pop) => (
                <span
                  key={pop.id}
                  className={`animate-nl-float-delta px-2.5 py-1 rounded-lg text-xs font-mono tabular-nums font-medium border shadow-lg backdrop-blur-sm ${
                    pop.tone === 'level'
                      ? 'bg-amber-500/90 border-amber-200 text-slate-950'
                      : pop.tone === 'positive'
                        ? 'bg-emerald-950/90 border-emerald-400/50 text-emerald-200'
                        : pop.tone === 'negative'
                          ? 'bg-rose-950/90 border-rose-400/50 text-rose-200'
                          : 'bg-[var(--nl-surface)]/95 border-[var(--nl-secondary)]/50 text-[var(--nl-secondary)]'
                  }`}
                >
                  {pop.label}
                </span>
              ))}
            </div>
          )}

          {/* Center Character Spotlight & Scene Controls */}
          <div className="relative z-10 px-4 sm:px-6 pt-2 pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <AnimePortrait
                size="lg"
                name={primaryCast ? primaryCast.name : session.world.protagonist.name}
                appearance={
                  primaryCast ? primaryCast.appearance : session.world.protagonist.appearance
                }
                role={primaryCast ? primaryCast.role : session.world.protagonist.role}
                gender={primaryCast ? primaryCast.gender : session.world.protagonist.gender}
                mood={session.mood}
                emotionKey={activeMsg?.emotion || 'neutral'}
                tension={session.tension}
                affinity={primaryCast?.affinity}
                relationshipTier={primaryCast?.relationshipTier}
                milestoneEvent={primaryCast ? milestoneEvent : null}
                shakeTrigger={activeMsg?.id}
                isPainting={isPaintingPortrait}
                onAiPaint={() => onAiPaintPortrait(targetPortraitKey)}
                customImageUrl={portraitImages[targetPortraitKey]}
                onUploadImage={(dataUrl) => onUploadPortrait(targetPortraitKey, dataUrl)}
                onClearImage={() => onClearPortrait(targetPortraitKey)}
              />

              <div className="pb-1 space-y-0.5">
                <div className="text-sm sm:text-base font-semibold text-white">
                  {primaryCast ? primaryCast.name : session.world.protagonist.name}
                </div>
                <div className="text-xs text-slate-300">
                  <span>{primaryCast ? primaryCast.role : session.world.protagonist.role}</span>
                  <span aria-hidden="true"> · </span>
                  <span style={{ color: emotion.accentHex }}>{emotion.label}</span>
                </div>
                {precedingPlayerMsg && (
                  <div className="text-xs text-violet-200/90 pt-1 line-clamp-1">
                    คุณ: {precedingPlayerMsg.text}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start sm:self-end">
              <button
                type="button"
                disabled={isPaintingScene || isBusy}
                onClick={onAiPaintScene}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/60 hover:bg-[var(--nl-accent)]/85 backdrop-blur-sm border border-white/15 text-xs text-slate-100 disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
                title="วาดภาพฉาก CG ด้วย AI ตามบรรยากาศตอนนี้"
              >
                {isPaintingScene ? (
                  <Paintbrush className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="w-3.5 h-3.5" />
                )}
                <span>{isPaintingScene ? 'กำลังวาดฉาก...' : 'วาดฉาก CG'}</span>
              </button>

              {session.sceneCgUrl && (
                <button
                  type="button"
                  onClick={onClearSceneCg}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-rose-950/75 hover:bg-rose-800/80 border border-rose-400/40 text-xs text-rose-100 whitespace-nowrap shrink-0"
                  title="สลับกลับไปใช้ฉากมาตรฐาน"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>รีเซ็ต CG</span>
                </button>
              )}

              <select
                value={backdrop.key}
                onChange={(e) => onChangeSceneKey(e.target.value as SceneVisualKey)}
                aria-label="เปลี่ยนฉากหลังอนิเมะ"
                className="rounded-lg bg-black/60 backdrop-blur-sm border border-white/15 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-[var(--nl-secondary)]"
              >
                {Object.values(SCENE_BACKDROPS).map((sc) => (
                  <option key={sc.key} value={sc.key} className="bg-[#111520]">
                    ฉาก: {sc.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bottom Dialogue & Narration Theater Box */}
          <div className="relative z-10 mx-3 sm:mx-5 mb-4 rounded-xl bg-[var(--nl-bg)]/92 backdrop-blur-md border border-[var(--nl-border)] p-4 sm:p-5 space-y-3">
            {/* Inline Edit Player Action */}
            {editingPlayerId && precedingPlayerMsg?.id === editingPlayerId ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!editDraft.trim()) return;
                  onEditPlayerTurn(precedingPlayerMsg, editDraft.trim());
                  setEditingPlayerId(null);
                  setPageOffset(0);
                }}
                className="space-y-2 pb-3 border-b border-white/10"
              >
                <div className="text-xs text-[var(--nl-secondary)]">
                  แก้ไขคำพูดหรือการกระทำของคุณแล้วสร้างผลลัพธ์ใหม่:
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    className="flex-1 rounded-lg bg-[var(--nl-surface)] border border-white/15 px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-[var(--nl-secondary)]"
                  />
                  <button
                    type="submit"
                    disabled={isBusy || !editDraft.trim()}
                    className="px-3.5 py-2 rounded-lg bg-[var(--nl-accent)] text-xs font-medium text-white disabled:opacity-50"
                  >
                    บันทึก & เล่นต่อ
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingPlayerId(null)}
                    className="px-3 py-2 rounded-lg bg-white/5 text-xs text-slate-300"
                  >
                    ยกเลิก
                  </button>
                </div>
              </form>
            ) : null}

            {/* Story Text (Click to skip typewriter if active) */}
            {activeMsg && (
              <div
                onClick={isTypingActive ? handleSkipTypewriter : undefined}
                title={isTypingActive ? 'คลิกเพื่อแสดงข้อความทั้งหมดทันที' : undefined}
                className={`max-h-56 overflow-y-auto pr-1 space-y-2.5 ${
                  isTypingActive ? 'cursor-pointer' : ''
                }`}
              >
                {renderFormattedText(displayStoryText)}
                {isTypingActive && (
                  <span
                    aria-hidden="true"
                    className="inline-block w-1.5 h-4 align-middle bg-[var(--nl-secondary)] animate-pulse ml-1"
                  />
                )}
              </div>
            )}

            {/* Bottom Stage Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-white/10">
              {/* Pagination across turns */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <button
                  type="button"
                  disabled={activeNarratorIndex <= 0}
                  onClick={() => setPageOffset((p) => p + 1)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 text-slate-200"
                  title="ดูฉากก่อนหน้า"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono tabular-nums px-1">
                  ฉาก {activeNarratorIndex + 1} / {narratorMessages.length}
                </span>
                <button
                  type="button"
                  disabled={clampedOffset <= 0}
                  onClick={() => setPageOffset((p) => Math.max(0, p - 1))}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 text-slate-200"
                  title="ดูฉากถัดไป"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                {isTypingActive && (
                  <button
                    type="button"
                    onClick={handleSkipTypewriter}
                    className="inline-flex items-center gap-1 ml-1 px-2 py-1 rounded-lg bg-[var(--nl-accent)]/20 border border-[var(--nl-accent)]/40 text-xs text-white whitespace-nowrap"
                  >
                    <FastForward className="w-3 h-3" />
                    <span>แสดงทั้งหมด</span>
                  </button>
                )}
              </div>

              {/* OOC Turn Actions: TTS, Edit, Reroll, Rewind */}
              <div className="flex flex-wrap items-center gap-1.5">
                {activeMsg && !activeMsg.isOpeningLoading && (
                  <button
                    type="button"
                    onClick={() => onSpeakThai(activeMsg)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs whitespace-nowrap transition-colors ${
                      speakingMsgId === activeMsg.id
                        ? 'bg-[var(--nl-secondary)]/15 border-[var(--nl-secondary)]/50 text-[var(--nl-secondary)]'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    {speakingMsgId === activeMsg.id ? (
                      <VolumeX className="w-3.5 h-3.5" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                    <span>{speakingMsgId === activeMsg.id ? 'หยุด' : 'พากย์ไทย'}</span>
                  </button>
                )}

                {precedingPlayerMsg && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setEditingPlayerId(precedingPlayerMsg.id);
                      setEditDraft(precedingPlayerMsg.text);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white disabled:opacity-40 whitespace-nowrap"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>แก้ไขคำสั่ง</span>
                  </button>
                )}

                {activeMsg?.snapshotId && precedingPlayerMsg && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setPageOffset(0);
                      onRerollMessage(activeMsg);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white disabled:opacity-40 whitespace-nowrap"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>สุ่มคำตอบใหม่</span>
                  </button>
                )}

                {activeMsg?.snapshotId && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setPageOffset(0);
                      onRewindToSnapshot(activeMsg.snapshotId!);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-rose-500/15 border border-white/10 hover:border-rose-400/40 text-xs text-slate-300 hover:text-rose-200 disabled:opacity-40 whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>ย้อนกลับ</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
