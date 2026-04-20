'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetcher, postJson, FetcherError } from '@/lib/fetcher.js';
import { schemas } from '@celebbase/shared-types';
import type { z } from 'zod';
import { DisclaimerBanner } from '../_components/DisclaimerBanner.js';
import styles from './track.module.css';

type DailyLogSummaryResponse = z.infer<typeof schemas.DailyLogSummaryResponseSchema>;
type MealsCompleted = z.infer<typeof schemas.MealsCompletedSchema>;

type Rating = 1 | 2 | 3 | 4 | 5;

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

interface RatingGroupProps {
  label: string;
  value: Rating | null;
  onChange: (v: Rating | null) => void;
}

function RatingGroup({ label, value, onChange }: RatingGroupProps): React.ReactElement {
  return (
    <div className={styles.ratingRow}>
      <span className={styles.ratingLabel}>{label}</span>
      <div className={styles.ratingButtons}>
        {([1, 2, 3, 4, 5] as Rating[]).map((n) => (
          <button
            key={n}
            type="button"
            className={`${styles.ratingBtn} ${value === n ? styles.ratingBtnActive : ''}`}
            onClick={() => onChange(value === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

interface QuickLogDrawerProps {
  open: boolean;
  onClose: () => void;
  onLogged: () => void;
}

function QuickLogDrawer({ open, onClose, onLogged }: QuickLogDrawerProps): React.ReactElement | null {
  const today = toIsoDate(new Date());
  const [energy, setEnergy] = useState<Rating | null>(null);
  const [mood, setMood] = useState<Rating | null>(null);
  const [sleep, setSleep] = useState<Rating | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEnergy(null);
      setMood(null);
      setSleep(null);
      setSaved(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSubmit = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await postJson('/api/daily-logs', {
        date: today,
        ...(energy !== null ? { energy_level: energy } : {}),
        ...(mood !== null ? { mood } : {}),
        ...(sleep !== null ? { sleep_quality: sleep } : {}),
      });
      setSaved(true);
      onLogged();
      setTimeout(onClose, 1000);
    } catch (err) {
      const msg = err instanceof FetcherError ? err.message : 'Failed to save. Try again.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={styles.drawerBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Quick log"
      onClick={handleBackdrop}
    >
      <div className={styles.drawer}>
        <div className={styles.drawerHeader}>
          <h2 className={styles.drawerTitle}>Quick log</h2>
          <button
            type="button"
            className={styles.drawerClose}
            aria-label="Close quick log"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className={styles.drawerDate}>{formatDate(today)}</p>
        <RatingGroup label="Energy level" value={energy} onChange={setEnergy} />
        <RatingGroup label="Mood" value={mood} onChange={setMood} />
        <RatingGroup label="Sleep quality" value={sleep} onChange={setSleep} />
        {error !== null && <p role="alert" className={styles.errorBanner}>{error}</p>}
        {saved && <p className={styles.drawerSuccess}>Logged!</p>}
        <button
          type="button"
          className={styles.drawerSaveBtn}
          disabled={saving || saved || (energy === null && mood === null && sleep === null)}
          onClick={() => void handleSubmit()}
        >
          {saving ? 'Saving…' : 'Save log'}
        </button>
      </div>
    </div>
  );
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
  const [saved, setSaved] = useState(false);
  const [summary, setSummary] = useState<DailyLogSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadTodayLog = useCallback(async () => {
    try {
      const res = await fetcher(`/api/daily-logs?start_date=${today}&end_date=${today}`, {
        schema: schemas.DailyLogListResponseSchema,
      });
      const log = res.data[0];
      if (log !== undefined) {
        setMeals(log.meals_completed);
        setWeightKg(log.weight_kg !== null ? String(log.weight_kg) : '');
        setEnergy((log.energy_level ?? null) as Rating | null);
        setMood((log.mood ?? null) as Rating | null);
        setSleep((log.sleep_quality ?? null) as Rating | null);
        setNotes(log.notes ?? '');
      }
    } catch {
      // No log yet today — start with empty form
    }
  }, [today]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await fetcher(
        `/api/daily-logs/summary?start_date=${weekStart}&end_date=${today}`,
        { schema: schemas.DailyLogSummaryResponseSchema },
      );
      setSummary(res);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [today, weekStart]);

  useEffect(() => {
    void loadTodayLog();
    void loadSummary();
  }, [loadTodayLog, loadSummary]);

  const toggleMeal = (key: keyof MealsCompleted): void => {
    setMeals((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const parsedWeight = weightKg.trim() !== '' ? Number(weightKg) : null;
      await postJson('/api/daily-logs', {
        log_date: today,
        meals_completed: meals,
        weight_kg: parsedWeight,
        energy_level: energy,
        mood,
        sleep_quality: sleep,
        notes: notes.trim() !== '' ? notes.trim() : null,
      });
      setSaved(true);
      void loadSummary();
    } catch (err) {
      setSaveError(
        err instanceof FetcherError ? err.message : 'Could not save log. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const pct = (v: number | null): string =>
    v !== null ? `${Math.round(v * 100)}%` : '—';
  const avg = (v: number | null): string =>
    v !== null ? v.toFixed(1) : '—';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Track</h1>
        <p className={styles.dateLabel}>{formatDate(today)}</p>
      </header>

      <div className={styles.columns}>
        {/* Log form */}
        <section className={styles.formCard}>
          <h2 className={styles.sectionTitle}>Today&apos;s Log</h2>
          <form onSubmit={(e) => void handleSubmit(e)}>
            {saved && (
              <p role="status" className={styles.successBanner}>
                Log saved ✓
              </p>
            )}
            {saveError !== null && (
              <p role="alert" className={styles.errorBanner}>
                {saveError}
              </p>
            )}

            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Meals completed</legend>
              <div className={styles.mealsGrid}>
                {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((meal) => (
                  <label key={meal} className={styles.mealLabel}>
                    <input
                      type="checkbox"
                      checked={meals[meal] === true}
                      onChange={() => toggleMeal(meal)}
                      className={styles.mealCheckbox}
                    />
                    <span className={styles.mealName}>
                      {meal.charAt(0).toUpperCase() + meal.slice(1)}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="weight">
                Weight (kg)
              </label>
              <input
                id="weight"
                type="number"
                min="20"
                max="500"
                step="0.1"
                placeholder="e.g. 70.5"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className={styles.input}
              />
            </div>

            <RatingGroup label="Energy level" value={energy} onChange={setEnergy} />
            <RatingGroup label="Mood" value={mood} onChange={setMood} />
            <RatingGroup label="Sleep quality" value={sleep} onChange={setSleep} />

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="notes">
                Notes
              </label>
              <textarea
                id="notes"
                rows={3}
                maxLength={2000}
                placeholder="How are you feeling today?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={styles.textarea}
              />
            </div>

            <button type="submit" disabled={saving} className={styles.saveBtn}>
              {saving ? 'Saving…' : 'Save log'}
            </button>
          </form>
        </section>

        {/* 7-day summary */}
        <section className={styles.summaryCard}>
          <h2 className={styles.sectionTitle}>7-Day Summary</h2>
          {summaryLoading ? (
            <p className={styles.loadingText}>Loading…</p>
          ) : summary === null ? (
            <p className={styles.emptyText}>No data yet.</p>
          ) : (
            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{summary.total_logs}</span>
                <span className={styles.statLabel}>Days logged</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{pct(summary.completion_rate)}</span>
                <span className={styles.statLabel}>Meal adherence</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{avg(summary.avg_energy_level)}</span>
                <span className={styles.statLabel}>Avg energy</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{avg(summary.avg_mood)}</span>
                <span className={styles.statLabel}>Avg mood</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{avg(summary.avg_sleep_quality)}</span>
                <span className={styles.statLabel}>Avg sleep</span>
              </div>
              {summary.avg_weight_kg !== null && (
                <div className={styles.stat}>
                  <span className={styles.statValue}>
                    {summary.avg_weight_kg.toFixed(1)} kg
                  </span>
                  <span className={styles.statLabel}>Avg weight</span>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
      <DisclaimerBanner />
      <button
        type="button"
        className={styles.fab}
        aria-label="Quick log for today"
        onClick={() => setDrawerOpen(true)}
      >
        +
      </button>
      <QuickLogDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onLogged={() => void loadSummary()}
      />
    </div>
  );
}
