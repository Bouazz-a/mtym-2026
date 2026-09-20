import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Btn, BrutalCard } from "@/features/shared/primitives";
import { updateSchedule } from "@/lib/repositories/centerDayRepository";
import type { CenterDay, ScheduleSlot } from "@/types";
import {
  DEFAULT_SCHEDULE, MAX_MINUTES, MIN_MINUTES, SLIDER_MAX, SLIDER_MIN,
  moveSlot, resizeSlot, sameSchedule, slotEnd, toMinutes,
} from "@/utils/schedule";
import { useAction } from "./useAction";

// The day's passage times: per slot, a slider and a typed start time, and a
// duration. Edits go to a draft that the timetable below renders live; the
// draft is saved when the slider is released or a field is left, and the
// cached day is updated at once so nothing jumps back while it saves.

const SCHEDULE_QUERIES = [["center-days"], ["pools"]];
const SAVE_DELAY = 400; // ms after the last change (arrow keys fire many)

export function ScheduleEditor({
  day,
  schedule,
  onDraft,
  onActive,
}: {
  day: CenterDay;
  schedule: ScheduleSlot[]; // the draft, or the saved schedule
  onDraft: (draft: ScheduleSlot[] | null) => void;
  onActive: (index: number | null) => void;
}) {
  const queryClient = useQueryClient();
  const { run, error } = useAction(SCHEDULE_QUERIES);
  // Read by the delayed save, which outlives the render that scheduled it
  const latest = useRef(schedule);
  const saved = useRef(day.schedule);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    latest.current = schedule;
    saved.current = day.schedule;
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const edit = (next: ScheduleSlot[]) => {
    latest.current = next;
    onDraft(next);
  };

  const save = () => {
    window.clearTimeout(timer.current);
    const next = latest.current;
    if (sameSchedule(next, saved.current)) return onDraft(null);
    queryClient.setQueryData<CenterDay[]>(["center-days"], (days) =>
      days?.map((d) => (d.id === day.id ? { ...d, schedule: next } : d)),
    );
    onDraft(null);
    run(() => updateSchedule(day.id, next));
  };
  const saveSoon = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, SAVE_DELAY);
  };

  return (
    <BrutalCard className="overflow-hidden">
      <div
        className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
        style={{ borderBottom: "2px solid var(--forest)", background: "rgba(98,159,115,0.08)" }}
      >
        <span className="font-mont text-tiny uppercase tracking-widest" style={{ color: "var(--forest)", fontWeight: 900 }}>
          Horaires du jour
        </span>
        <Btn
          variant="ghost"
          size="sm"
          disabled={sameSchedule(schedule, DEFAULT_SCHEDULE)}
          onClick={() => { edit(DEFAULT_SCHEDULE); save(); }}
        >
          Rétablir l'horaire type
        </Btn>
      </div>
      <ul className="striped-rows">
        {schedule.map((slot, i) => (
          <li key={i} className="px-4 py-3 flex items-center gap-x-4 gap-y-2 flex-wrap">
            <span className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--ink-soft)", fontWeight: 900, width: "4.5rem" }}>
              Passage {i + 1}
            </span>
            <TimeField
              id={`schedule-start-${i}`}
              label={`Début du passage ${i + 1}`}
              value={slot.start}
              onLive={(minutes) => edit(moveSlot(latest.current, i, minutes))}
              onFocus={() => onActive(i)}
              onDone={() => { onActive(null); saveSoon(); }}
            />
            <input
              type="range"
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              step={5}
              value={toMinutes(slot.start)}
              aria-label={`Début du passage ${i + 1} (curseur)`}
              aria-valuetext={slot.start}
              className="schedule-slider flex-1"
              style={{ minWidth: "10rem" }}
              onChange={(e) => edit(moveSlot(latest.current, i, Number(e.target.value)))}
              onFocus={() => onActive(i)}
              onBlur={() => { onActive(null); saveSoon(); }}
              onPointerDown={() => onActive(i)}
              onPointerUp={saveSoon}
              onKeyUp={saveSoon}
            />
            <DurationField
              label={`Durée du passage ${i + 1}`}
              value={slot.minutes}
              onLive={(minutes) => edit(resizeSlot(latest.current, i, minutes))}
              onFocus={() => onActive(i)}
              onDone={() => { onActive(null); saveSoon(); }}
            />
            <span className="font-mont text-xs tabular-nums" style={{ color: "var(--ink-soft)", fontWeight: 700, width: "4rem" }}>
              fin {slotEnd(slot)}
            </span>
          </li>
        ))}
      </ul>
      {error && <div className="p-4"><Alert>{error}</Alert></div>}
    </BrutalCard>
  );
}

const FIELD_STYLE: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--ink)",
  borderRadius: 2,
};

// A typed start time, always 24h "HH:MM" (a native time input follows the
// browser's language and can show "01:15 PM"). While it's being typed the
// field keeps its own text; "1715" becomes "17:15"; a complete, valid time
// applies live, and leaving the field (or Enter) settles it.
function TimeField({
  id,
  label,
  value,
  onLive,
  onFocus,
  onDone,
}: {
  id: string;
  label: string;
  value: string;
  onLive: (minutes: number) => void;
  onFocus: () => void;
  onDone: () => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      maxLength={5}
      placeholder="HH:MM"
      aria-label={label}
      value={typed ?? value}
      className="px-2 py-1.5 text-sm font-mont tabular-nums focus-ring"
      style={{ ...FIELD_STYLE, width: "4.5rem" }}
      onFocus={(e) => { onFocus(); e.currentTarget.select(); }}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d:]/g, "");
        const text = /^\d{4}$/.test(raw) ? `${raw.slice(0, 2)}:${raw.slice(2)}` : raw;
        setTyped(text);
        if (/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) onLive(toMinutes(text));
      }}
      onBlur={() => { setTyped(null); onDone(); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}

function DurationField({
  label,
  value,
  onLive,
  onFocus,
  onDone,
}: {
  label: string;
  value: number;
  onLive: (minutes: number) => void;
  onFocus: () => void;
  onDone: () => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  return (
    <label className="inline-flex items-center gap-1.5">
      <input
        type="number"
        min={MIN_MINUTES}
        max={MAX_MINUTES}
        step={5}
        aria-label={label}
        value={typed ?? value}
        className="px-2 py-1.5 text-sm font-mont tabular-nums focus-ring"
        style={{ ...FIELD_STYLE, width: "4.5rem" }}
        onFocus={onFocus}
        onChange={(e) => {
          setTyped(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && n >= MIN_MINUTES && n <= MAX_MINUTES) onLive(n);
        }}
        onBlur={() => { setTyped(null); onDone(); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      />
      <span className="font-mont text-micro uppercase tracking-widest" style={{ color: "var(--ink-faint)", fontWeight: 800 }}>min</span>
    </label>
  );
}
