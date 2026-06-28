"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Plus, Trash2, Bell, Clock, AlignLeft, Tag } from "lucide-react";
import s from "./DeadlineModal.module.css";

// ── Types ─────────────────────────────────────────────────────────────────
export type RecurrenceType = "once" | "daily" | "weekly" | "monthly" | "yearly";

export interface Reminder {
  id: string;
  type: RecurrenceType;
  /** one-time: full date string */
  date: string;
  /** all types: HH:MM */
  time: string;
  /** weekly: 0=Sun … 6=Sat */
  dayOfWeek: number;
  /** monthly: 1–31 */
  dayOfMonth: number;
  /** yearly: month index 0–11 */
  month: number;
  /** yearly: day 1–31 */
  yearDay: number;
}

export interface DeadlineFormData {
  name: string;
  description: string;
  date: string;
  time: string;
  reminders: Reminder[];
}

interface Props {
  isOpen: boolean;
  prefillDate?: string;
  prefillTime?: string;
  onClose: () => void;
  onSubmit: (data: DeadlineFormData) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const uid = () => `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const todayDate = () => new Date().toISOString().slice(0, 10);
const nowTime   = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};

const RECURRENCE: { value: RecurrenceType; label: string; icon: string }[] = [
  { value: "once",    label: "One-time",  icon: "🔔" },
  { value: "daily",   label: "Daily",     icon: "📅" },
  { value: "weekly",  label: "Weekly",    icon: "🗓️" },
  { value: "monthly", label: "Monthly",   icon: "📆" },
  { value: "yearly",  label: "Yearly",    icon: "🎯" },
];

const DAYS_OF_WEEK = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS       = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function daysInMonth(month: number) {
  // Use a non-leap year as default; enough for the picker
  return new Date(2001, month + 1, 0).getDate();
}

// ── Component ──────────────────────────────────────────────────────────────
export default function DeadlineModal({ isOpen, prefillDate, prefillTime, onClose, onSubmit }: Props) {
  const [name,        setName]        = useState("");
  const [description, setDescription] = useState("");
  const [date,        setDate]        = useState(todayDate());
  const [time,        setTime]        = useState(nowTime());
  const [reminders,   setReminders]   = useState<Reminder[]>([]);
  const [errors,      setErrors]      = useState<Record<string, string>>({});
  const nameRef = useRef<HTMLInputElement>(null);

  // Reset form when opened
  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setDescription("");
    setDate(prefillDate ?? todayDate());
    setTime(prefillTime ?? nowTime());
    setReminders([]);
    setErrors({});
    setTimeout(() => nameRef.current?.focus(), 80);
  }, [isOpen, prefillDate, prefillTime]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  const addReminder = useCallback(() =>
    setReminders(p => [...p, {
      id: uid(), type: "once",
      date: todayDate(), time: nowTime(),
      dayOfWeek: 1, dayOfMonth: 1, month: 0, yearDay: 1,
    }])
  , []);

  const removeReminder = useCallback((id: string) =>
    setReminders(p => p.filter(r => r.id !== id))
  , []);

  const updateReminder = useCallback((id: string, patch: Partial<Reminder>) =>
    setReminders(p => p.map(r => r.id === id ? { ...r, ...patch } : r))
  , []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Task name is required";
    if (!date)        errs.date = "Date is required";
    if (!time)        errs.time = "Time is required";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSubmit({ name: name.trim(), description: description.trim(), date, time, reminders });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className={s.backdrop} onClick={onClose} aria-hidden="true" />

      {/* Drawer */}
      <div className={s.panel} role="dialog" aria-modal="true" aria-label="Add Deadline">

        {/* ── Header ── */}
        <div className={s.header}>
          <div className={s.titleGroup}>
            <div className={s.titleIcon}>
              <Clock size={17} />
            </div>
            <div className={s.titleText}>
              <span className={s.titleMain}>Add Deadline</span>
              <span className={s.titleSub}>Block time · Set reminders</span>
            </div>
          </div>
          <button className={s.closeBtn} onClick={onClose} aria-label="Close panel">
            <X size={16} />
          </button>
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} noValidate style={{ display: "contents" }}>
          <div className={s.body}>

            {/* Task Name */}
            <div className={s.field}>
              <label htmlFor="dl-name" className={s.label}>
                <Tag size={11} />
                Task Name
                <span className={s.required}>*</span>
              </label>
              <input
                ref={nameRef}
                id="dl-name"
                type="text"
                className={`${s.input}${errors.name ? ` ${s.inputError}` : ""}`}
                placeholder="e.g. Submit quarterly report"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={120}
              />
              {errors.name && <span className={s.errorMsg}>{errors.name}</span>}
            </div>

            {/* Description */}
            <div className={s.field}>
              <label htmlFor="dl-desc" className={s.label}>
                <AlignLeft size={11} />
                Description
              </label>
              <textarea
                id="dl-desc"
                className={s.textarea}
                placeholder="Optional notes or context…"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>

            {/* Date + Time */}
            <div className={s.row}>
              <div className={s.field}>
                <label htmlFor="dl-date" className={s.label}>
                  📅 Date<span className={s.required}>*</span>
                </label>
                <input
                  id="dl-date"
                  type="date"
                  className={`${s.input}${errors.date ? ` ${s.inputError}` : ""}`}
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
                {errors.date && <span className={s.errorMsg}>{errors.date}</span>}
              </div>
              <div className={s.field}>
                <label htmlFor="dl-time" className={s.label}>
                  🕐 Time<span className={s.required}>*</span>
                </label>
                <input
                  id="dl-time"
                  type="time"
                  className={`${s.input}${errors.time ? ` ${s.inputError}` : ""}`}
                  value={time}
                  onChange={e => setTime(e.target.value)}
                />
                {errors.time && <span className={s.errorMsg}>{errors.time}</span>}
              </div>
            </div>

            <div className={s.divider} />

            {/* ── Reminders ── */}
            <div>
              <div className={s.sectionHeader}>
                <div className={s.sectionTitle}>
                  <Bell size={14} color="#f48c06" />
                  Reminders
                  {reminders.length > 0 && (
                    <span className={s.reminderCount}>{reminders.length}</span>
                  )}
                </div>
                <button type="button" className={s.addReminderBtn} onClick={addReminder}>
                  <Plus size={12} />
                  Add Reminder
                </button>
              </div>

              {reminders.length === 0 ? (
                <p className={s.emptyHint}>No reminders yet — click "+ Add Reminder" to schedule one.</p>
              ) : (
                <div className={s.reminderList}>
                  {reminders.map((r, i) => (
                    <div key={r.id} className={s.reminderCard}>
                      <div className={s.reminderCardHeader}>
                        <span className={s.reminderNum}>Reminder {i + 1}</span>
                        <button
                          type="button"
                          className={s.deleteBtn}
                          onClick={() => removeReminder(r.id)}
                          aria-label="Delete reminder"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {/* Type pills */}
                      <div className={s.pillGroup}>
                        {RECURRENCE.map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            className={`${s.pill}${r.type === opt.value ? ` ${s.pillActive}` : ""}`}
                            onClick={() => updateReminder(r.id, { type: opt.value })}
                          >
                            <span>{opt.icon}</span>
                            <span>{opt.label}</span>
                          </button>
                        ))}
                      </div>

                      {/* ── Context-aware pickers ── */}

                      {/* ONE-TIME */}
                      {r.type === "once" && (
                        <div className={s.reminderPickers}>
                          <input type="date" className={`${s.input} ${s.inputSm}`}
                            value={r.date} onChange={e => updateReminder(r.id, { date: e.target.value })}
                            aria-label="Reminder date" />
                          <input type="time" className={`${s.input} ${s.inputSm}`}
                            value={r.time} onChange={e => updateReminder(r.id, { time: e.target.value })}
                            aria-label="Reminder time" />
                        </div>
                      )}

                      {/* DAILY */}
                      {r.type === "daily" && (
                        <div className={s.reminderPickers}>
                          <span className={s.recurLabel}>Every day at</span>
                          <input type="time" className={`${s.input} ${s.inputSm}`}
                            value={r.time} onChange={e => updateReminder(r.id, { time: e.target.value })}
                            aria-label="Reminder time" />
                        </div>
                      )}

                      {/* WEEKLY — day of week + time */}
                      {r.type === "weekly" && (
                        <div className={s.reminderPickers}>
                          <span className={s.recurLabel}>Every</span>
                          <select
                            className={`${s.input} ${s.inputSm} ${s.select}`}
                            value={r.dayOfWeek}
                            onChange={e => updateReminder(r.id, { dayOfWeek: Number(e.target.value) })}
                            aria-label="Day of week"
                          >
                            {DAYS_OF_WEEK.map((d, i) => (
                              <option key={d} value={i}>{d}</option>
                            ))}
                          </select>
                          <span className={s.recurLabel}>at</span>
                          <input type="time" className={`${s.input} ${s.inputSm}`}
                            value={r.time} onChange={e => updateReminder(r.id, { time: e.target.value })}
                            aria-label="Reminder time" />
                        </div>
                      )}

                      {/* MONTHLY — day of month + time */}
                      {r.type === "monthly" && (
                        <div className={s.reminderPickers}>
                          <span className={s.recurLabel}>On the</span>
                          <select
                            className={`${s.input} ${s.inputSm} ${s.select}`}
                            value={r.dayOfMonth}
                            onChange={e => updateReminder(r.id, { dayOfMonth: Number(e.target.value) })}
                            aria-label="Day of month"
                          >
                            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                              <option key={d} value={d}>
                                {d}{d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th"}
                              </option>
                            ))}
                          </select>
                          <span className={s.recurLabel}>at</span>
                          <input type="time" className={`${s.input} ${s.inputSm}`}
                            value={r.time} onChange={e => updateReminder(r.id, { time: e.target.value })}
                            aria-label="Reminder time" />
                        </div>
                      )}

                      {/* YEARLY — month + day + time */}
                      {r.type === "yearly" && (
                        <div className={s.reminderPickers} style={{ flexWrap: "wrap" }}>
                          <span className={s.recurLabel}>Every</span>
                          <select
                            className={`${s.input} ${s.inputSm} ${s.select}`}
                            value={r.month}
                            onChange={e => updateReminder(r.id, { month: Number(e.target.value), yearDay: 1 })}
                            aria-label="Month"
                          >
                            {MONTHS.map((m, i) => (
                              <option key={m} value={i}>{m}</option>
                            ))}
                          </select>
                          <select
                            className={`${s.input} ${s.inputSm} ${s.select}`}
                            value={r.yearDay}
                            onChange={e => updateReminder(r.id, { yearDay: Number(e.target.value) })}
                            aria-label="Day of month"
                          >
                            {Array.from({ length: daysInMonth(r.month) }, (_, i) => i + 1).map(d => (
                              <option key={d} value={d}>
                                {d}{d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th"}
                              </option>
                            ))}
                          </select>
                          <span className={s.recurLabel}>at</span>
                          <input type="time" className={`${s.input} ${s.inputSm}`}
                            value={r.time} onChange={e => updateReminder(r.id, { time: e.target.value })}
                            aria-label="Reminder time" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Footer ── */}
          <div className={s.footer}>
            <button type="button" className={s.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={s.submitBtn}>
              <Clock size={15} />
              Add to Calendar
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
