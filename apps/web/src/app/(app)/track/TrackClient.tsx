'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { fetcher, postJson, FetcherError } from '@/lib/fetcher.js';
import { schemas } from '@celebbase/shared-types';
import type { z } from 'zod';
import { DisclaimerBanner } from '../_components/DisclaimerBanner.js';
import styles from './track.module.css';

type DailyLogListResponse = z.infer<typeof schemas.DailyLogListResponseSchema>;
type DailyLogSummaryResponse = z.infer<typeof schemas.DailyLogSummaryResponseSchema>;
type DailyLog = DailyLogListResponse['data'][number];
type MealsCompleted = z.infer<typeof schemas.MealsCompletedSchema>;

type Rating = 1 | 2 | 3 | 4 | 5;

interface MealOption {
  key: keyof MealsCompleted;
  label: string;
  icon: string;
  timeLabel: string;
}

interface ChipOption {
  value: Rating;
  emoji: string;
  word: string;
}

const MEALS: readonly MealOption[] = [
  { key: 'breakfast', label: 'Breakfast', icon: '🌅', timeLabel: 'morning' },
  { key: 'lunch', label: 'Lunch', icon: '☀️', timeLabel: 'midday' },
  { key: 'snack', label: 'Snack', icon: '🥥', timeLabel: 'between' },
  { key: 'dinner', label: 'Dinner', icon: '🌙', timeLabel: 'evening' },
];

const ENERGY_OPTIONS: readonly ChipOption[] = [
  { value: 1, emoji: '😴', word: 'drained' },
  { value: 2, emoji: '🫤', word: 'off' },
  { value: 3, emoji: '🙂', word: 'steady' },
  { value: 4, emoji: '💪', word: 'strong' },
  { value: 5, emoji: '⚡', word: 'electric' },
];

const MOOD_OPTIONS: readonly ChipOption[] = [
  { value: 1, emoji: '🌧', word: 'rough' },
  { value: 2, emoji: '🌫', word: 'foggy' },
  { value: 3, emoji: '🌤', word: 'steady' },
  { value: 4, emoji: '🌞', word: 'bright' },
  { value: 5, emoji: '💫', word: 'radiant' },
];

const SLEEP_OPTIONS: readonly ChipOption[] = [
  { value: 1, emoji: '😵', word: 'rough' },
  { value: 2, emoji: '😟', word: 'light' },
  { value: 3, emoji: '😌', word: 'okay' },
  { value: 4, emoji: '😴', word: 'deep' },
  { value: 5, emoji: '🌙', word: 'dreamy' },
];

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toIsoDate(d);
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function getGreeting(): { eyebrow: string; primary: string; secondary: string } {
  const h = new Date().getHours();
  if (h < 5)
    return {
      eyebrow: 'Quiet hours',
      primary: 'Still awake.',
      secondary: 'Leave a breadcrumb for tomorrow you.',
    };
  if (h < 12)
    return {
      eyebrow: 'Morning chapter',
      primary: 'Good morning.',
      secondary: 'Shape today while it is still yours.',
    };
  if (h < 17)
    return {
      eyebrow: 'Mid-arc',
      primary: 'Good afternoon.',
      secondary: 'How is the arc bending today?',
    };
  if (h < 21)
    return {
      eyebrow: 'Evening chapter',
      primary: 'Good evening.',
      secondary: 'Capture what today really was.',
    };
  return {
    eyebrow: 'Late hours',
    primary: 'Winding down.',
    secondary: 'A last breath before sleep.',
  };
}

function computeStreak(logs: readonly DailyLog[]): number {
  const dates = new Set(logs.map((l) => l.log_date));
  const d = new Date();
  const todayIso = toIsoDate(d);
  if (!dates.has(todayIso)) {
    d.setDate(d.getDate() - 1);
  }
  let streak = 0;
  while (dates.has(toIsoDate(d))) {
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

interface WeekDot {
  iso: string;
  label: string;
  logged: boolean;
  isToday: boolean;
}

function buildWeekDots(logs: readonly DailyLog[]): WeekDot[] {
  const dates = new Set(logs.map((l) => l.log_date));
  const out: WeekDot[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = toIsoDate(d);
    const label = d.toLocaleDateString('en-US', { weekday: 'narrow' });
    out.push({ iso, label, logged: dates.has(iso), isToday: i === 0 });
  }
  return out;
}

interface EmotionChipGroupProps {
  step: string;
  legend: string;
  hint: string;
  options: readonly ChipOption[];
  value: Rating | null;
  onChange: (v: Rating | null) => void;
  name: string;
}

function EmotionChipGroup({
  step,
  legend,
  hint,
  options,
  value,
  onChange,
  name,
}: EmotionChipGroupProps): React.ReactElement {
  const selectedOpt = options.find((o) => o.value === value);
  return (
    <fieldset className={styles.moment}>
      <div className={styles.momentHead}>
        <span className={styles.momentStep} aria-hidden="true">
          {step}
        </span>
        <div className={styles.momentHeadText}>
          <legend className={styles.momentTitle}>{legend}</legend>
          <span className={styles.momentHint}>
            {selectedOpt !== undefined
              ? `Feeling ${selectedOpt.word} — tap again to clear`
              : hint}
          </span>
        </div>
      </div>
      <div className={styles.chipRow} role="radiogroup" aria-label={legend}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={`${name}-${String(opt.value)}`}
              type="button"
              role="radio"
              aria-checked={selected ? 'true' : 'false'}
              className={styles.emotionChip}
              data-selected={selected ? 'true' : 'false'}
              onClick={() => onChange(selected ? null : opt.value)}
            >
              <span className={styles.chipEmoji} aria-hidden="true">
                {opt.emoji}
              </span>
              <span className={styles.chipWord}>{opt.word}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function mealsFilledCount(meals: MealsCompleted): number {
  return MEALS.filter((m) => meals[m.key] === true).length;
}

function countFilledMoments(
  meals: MealsCompleted,
  energy: Rating | null,
  mood: Rating | null,
  sleep: Rating | null,
  weightKg: string,
  notes: string,
): number {
  let n = 0;
  if (mealsFilledCount(meals) > 0) n += 1;
  if (energy !== null) n += 1;
  if (mood !== null) n += 1;
  if (sleep !== null) n += 1;
  if (weightKg.trim() !== '' || notes.trim() !== '') n += 1;
  return n;
}

export function TrackClient(): React.ReactElement {
  const today = toIsoDate(new Date());
  const weekStart = nDaysAgo(6);

  const [meals, setMeals] = useState<MealsCompleted>({});
  const [weightKg, setWeightKg] = useState('');
  const [energy, setEnergy] = useState<Rating | null>(null);
  const [mood, setMood] = useState<Rating | null>(null);
  const [sleep, setSleep] = useState<Rating | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sealed, setSealed] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [weekLogs, setWeekLogs] = useState<DailyLog[]>([]);
  const [summary, setSummary] = useState<DailyLogSummaryResponse | null>(null);

  const greeting = useMemo(() => getGreeting(), []);

  const loadData = useCallback(async () => {
    try {
      const listRes = await fetcher(
        `/api/daily-logs?start_date=${weekStart}&end_date=${today}&limit=7`,
        { schema: schemas.DailyLogListResponseSchema },
      );
      setWeekLogs(listRes.data);
      const todayLog = listRes.data.find((l) => l.log_date === today);
      if (todayLog !== undefined) {
        setMeals(todayLog.meals_completed);
        setWeightKg(todayLog.weight_kg !== null ? String(todayLog.weight_kg) : '');
        setEnergy((todayLog.energy_level ?? null) as Rating | null);
        setMood((todayLog.mood ?? null) as Rating | null);
        setSleep((todayLog.sleep_quality ?? null) as Rating | null);
        setNotes(todayLog.notes ?? '');
        setSealed(true);
      }
    } catch {
      // proceed with empty state — first-time user
    }
    try {
      const summaryRes = await fetcher(
        `/api/daily-logs/summary?start_date=${weekStart}&end_date=${today}`,
        { schema: schemas.DailyLogSummaryResponseSchema },
      );
      setSummary(summaryRes);
    } catch {
      setSummary(null);
    }
  }, [today, weekStart]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const toggleMeal = (key: keyof MealsCompleted): void => {
    setMeals((prev) => ({ ...prev, [key]: !(prev[key] === true) }));
    if (sealed) setSealed(false);
  };

  const markDirty = (): void => {
    if (sealed) setSealed(false);
  };

  const filledCount = countFilledMoments(meals, energy, mood, sleep, weightKg, notes);
  const canSeal = filledCount > 0 && !saving;

  const handleSeal = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!canSeal) return;
    setSaving(true);
    setSaveError(null);
    try {
      const parsedWeight = weightKg.trim() !== '' ? Number(weightKg) : null;
      await postJson('/api/daily-logs', {
        log_date: today,
        meals_completed: meals,
        weight_kg: Number.isFinite(parsedWeight) ? parsedWeight : null,
        energy_level: energy,
        mood,
        sleep_quality: sleep,
        notes: notes.trim() !== '' ? notes.trim() : null,
      });
      setSealed(true);
      setCelebrating(true);
      window.setTimeout(() => {
        setCelebrating(false);
      }, 1800);
      void loadData();
    } catch (err) {
      setSaveError(
        err instanceof FetcherError ? err.message : 'Could not save today. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const streak = computeStreak(weekLogs);
  const weekDots = buildWeekDots(weekLogs);
  const loggedThisWeek = weekDots.filter((d) => d.logged).length;
  const weekPct = Math.round((loggedThisWeek / 7) * 100);

  const avg = (v: number | null): string => (v !== null ? v.toFixed(1) : '—');
  const pct = (v: number | null): string =>
    v !== null ? `${String(Math.round(v * 100))}%` : '—';

  const sealButtonText = saving
    ? 'Sealing…'
    : sealed
      ? 'Today sealed'
      : filledCount === 0
        ? 'Tap a moment to begin'
        : 'Seal today';

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.heroEyebrow}>
            {greeting.eyebrow} · {formatDate(today)}
          </p>
          <h1 className={styles.heroHeading}>{greeting.primary}</h1>
          <p className={styles.heroSub}>{greeting.secondary}</p>
        </div>
        <div className={styles.streakCluster} aria-label="Your current streak">
          <div
            className={styles.streakRing}
            style={{ ['--streak-pct' as string]: String(weekPct) }}
            aria-hidden="true"
          >
            <div className={styles.streakCore}>
              <span className={styles.streakFlame} aria-hidden="true">
                🔥
              </span>
              <span className={styles.streakNumber}>{String(streak)}</span>
              <span className={styles.streakLabel}>day streak</span>
            </div>
          </div>
          <p className={styles.streakCaption}>
            <strong>{String(loggedThisWeek)}</strong> of 7 days this week
          </p>
        </div>
      </header>

      <div className={styles.columns}>
        <form className={styles.ritualCard} onSubmit={(e) => void handleSeal(e)} noValidate>
          <div className={styles.ritualAccent} aria-hidden="true" />
          <div className={styles.ritualIntro}>
            <span className={styles.ritualEyebrow}>Today&apos;s ritual</span>
            <p className={styles.ritualSub}>Five small moments. Pick any. Skip any.</p>
          </div>

          {saveError !== null && (
            <p role="alert" className={styles.errorBanner}>
              {saveError}
            </p>
          )}

          <fieldset className={styles.moment}>
            <div className={styles.momentHead}>
              <span className={styles.momentStep} aria-hidden="true">
                01
              </span>
              <div className={styles.momentHeadText}>
                <legend className={styles.momentTitle}>What did you eat?</legend>
                <span className={styles.momentHint}>
                  {mealsFilledCount(meals) > 0
                    ? `${String(mealsFilledCount(meals))} of 4 moments noted`
                    : 'Tap anything that happened — order is yours.'}
                </span>
              </div>
            </div>
            <div className={styles.mealGrid}>
              {MEALS.map((m) => {
                const selected = meals[m.key] === true;
                return (
                  <button
                    key={m.key}
                    type="button"
                    className={styles.mealPill}
                    data-selected={selected ? 'true' : 'false'}
                    aria-pressed={selected ? 'true' : 'false'}
                    onClick={() => toggleMeal(m.key)}
                  >
                    <span className={styles.mealIcon} aria-hidden="true">
                      {m.icon}
                    </span>
                    <span className={styles.mealLabel}>{m.label}</span>
                    <span className={styles.mealTime}>{m.timeLabel}</span>
                    <span className={styles.mealCheck} aria-hidden="true">
                      ✓
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <EmotionChipGroup
            step="02"
            legend="How's your energy?"
            hint="A body cue — pick the one that fits."
            options={ENERGY_OPTIONS}
            value={energy}
            onChange={(v) => {
              setEnergy(v);
              markDirty();
            }}
            name="energy"
          />

          <EmotionChipGroup
            step="03"
            legend="And the mood?"
            hint="Weather for today's inner sky."
            options={MOOD_OPTIONS}
            value={mood}
            onChange={(v) => {
              setMood(v);
              markDirty();
            }}
            name="mood"
          />

          <EmotionChipGroup
            step="04"
            legend="Last night's sleep?"
            hint="How you left the bed matters."
            options={SLEEP_OPTIONS}
            value={sleep}
            onChange={(v) => {
              setSleep(v);
              markDirty();
            }}
            name="sleep"
          />

          <fieldset className={styles.moment}>
            <div className={styles.momentHead}>
              <span className={styles.momentStep} aria-hidden="true">
                05
              </span>
              <div className={styles.momentHeadText}>
                <legend className={styles.momentTitle}>A line for future you</legend>
                <span className={styles.momentHint}>Optional — weight, a thought, a win.</span>
              </div>
            </div>
            <div className={styles.footprintRow}>
              <label className={styles.weightField}>
                <span className={styles.weightLabel}>Weight</span>
                <div className={styles.weightInputWrap}>
                  <input
                    type="number"
                    min="20"
                    max="500"
                    step="0.1"
                    placeholder="—"
                    value={weightKg}
                    onChange={(e) => {
                      setWeightKg(e.target.value);
                      markDirty();
                    }}
                    className={styles.weightInput}
                    aria-label="Weight in kilograms"
                  />
                  <span className={styles.weightUnit}>kg</span>
                </div>
              </label>
              <textarea
                rows={3}
                maxLength={2000}
                placeholder="Anything you want to remember about today?"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  markDirty();
                }}
                className={styles.noteTextarea}
                aria-label="Notes"
              />
            </div>
          </fieldset>

          <div className={styles.sealRow}>
            <div className={styles.sealMeta}>
              <span className={styles.sealMetaLine}>
                <strong>{String(filledCount)}</strong> of 5 moments captured
              </span>
              <span className={styles.sealMetaHint}>
                {filledCount === 0 ? 'Even one counts.' : 'You can always come back later today.'}
              </span>
            </div>
            <button
              type="submit"
              className={styles.sealBtn}
              data-sealed={sealed ? 'true' : 'false'}
              disabled={!canSeal}
            >
              <span className={styles.sealIcon} aria-hidden="true">
                {sealed ? '✓' : '✦'}
              </span>
              {sealButtonText}
            </button>
          </div>
        </form>

        <aside className={styles.weekCard} aria-label="Your week">
          <header className={styles.weekHeader}>
            <p className={styles.weekEyebrow}>This week</p>
            <h2 className={styles.weekTitle}>Your arc</h2>
          </header>

          <div className={styles.timeline} role="list" aria-label="Last 7 days">
            {weekDots.map((d) => (
              <div
                key={d.iso}
                className={styles.timelineDay}
                role="listitem"
                data-logged={d.logged ? 'true' : 'false'}
                data-today={d.isToday ? 'true' : 'false'}
                aria-label={`${formatDate(d.iso)}${d.logged ? ', logged' : ', not logged'}${d.isToday ? ', today' : ''}`}
              >
                <span className={styles.timelineDot} aria-hidden="true">
                  {d.logged ? '✓' : d.label}
                </span>
                {d.isToday && <span className={styles.timelineTodayTag}>today</span>}
              </div>
            ))}
          </div>

          <p className={styles.weekStory}>
            {loggedThisWeek === 0 ? (
              <>Today is a blank page. Ink it however feels right.</>
            ) : loggedThisWeek === 7 ? (
              <>
                <strong>Seven in a row.</strong> You&apos;ve turned this into a rhythm.
              </>
            ) : (
              <>
                You showed up <strong>{String(loggedThisWeek)} time{loggedThisWeek === 1 ? '' : 's'}</strong>{' '}
                this week. Keep going.
              </>
            )}
          </p>

          {summary !== null && summary.total_logs > 0 && (
            <div className={styles.microStatsGrid}>
              <div className={styles.microStatCard}>
                <span className={styles.microStatValue}>{pct(summary.completion_rate)}</span>
                <span className={styles.microStatLabel}>Meals on track</span>
              </div>
              <div className={styles.microStatCard}>
                <span className={styles.microStatValue}>{avg(summary.avg_energy_level)}</span>
                <span className={styles.microStatLabel}>Avg energy</span>
              </div>
              <div className={styles.microStatCard}>
                <span className={styles.microStatValue}>{avg(summary.avg_mood)}</span>
                <span className={styles.microStatLabel}>Avg mood</span>
              </div>
              <div className={styles.microStatCard}>
                <span className={styles.microStatValue}>{avg(summary.avg_sleep_quality)}</span>
                <span className={styles.microStatLabel}>Avg sleep</span>
              </div>
              {summary.avg_weight_kg !== null && (
                <div className={`${styles.microStatCard} ${styles.microStatCardWide}`}>
                  <span className={styles.microStatValue}>
                    {summary.avg_weight_kg.toFixed(1)}
                    <span className={styles.microStatUnit}>kg</span>
                  </span>
                  <span className={styles.microStatLabel}>Avg weight</span>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <DisclaimerBanner />

      {celebrating && (
        <div className={styles.celebration} role="status" aria-live="polite">
          <div className={styles.celebrationCard}>
            <span className={styles.celebrationBurst} aria-hidden="true">
              ✦
            </span>
            <p className={styles.celebrationTitle}>Today is sealed</p>
            <p className={styles.celebrationSub}>
              {streak > 0 ? (
                <>
                  <strong>{String(streak)}-day streak</strong> · one more page in your story
                </>
              ) : (
                <>Day one of your next streak</>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
