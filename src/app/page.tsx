"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Calendar, RefreshCw, Zap, CheckCircle2, AlertCircle, PlusCircle, Settings2 } from "lucide-react";
import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateSelectArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import DeadlineModal, { type DeadlineFormData } from "./components/DeadlineModal";

// Dynamically import FullCalendar to avoid SSR issues
const FullCalendar = dynamic(() => import("@fullcalendar/react"), { ssr: false });

// ── Types ──────────────────────────────────────────────────────────────────
interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor?: string;
  textColor?: string;
  extendedProps?: {
    description?: string;
    reminders?: DeadlineFormData["reminders"];
  };
}

interface ModalState {
  open: boolean;
  prefillDate?: string;
  prefillTime?: string;
  prefillEndDate?: string;
  prefillEndTime?: string;
}

const TASK_PREVIEW_COLORS = ["#e85d04", "#f48c06", "#d62828", "#ffba08", "#06b6d4"];
const MANUAL_EVENT_COLOR  = "#38bdf8";


// ── Wave canvas hook ───────────────────────────────────────────────────────
function useWaveCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0, H = 0;
    let rafId: number;

    const waves = [
      { amp: 55, freq: 0.007, speed: 0.011, color: "#e85d04", y: 0.52 },
      { amp: 40, freq: 0.010, speed: 0.017, color: "#f48c06", y: 0.60 },
      { amp: 30, freq: 0.013, speed: 0.009, color: "#d62828", y: 0.68 },
      { amp: 45, freq: 0.005, speed: 0.020, color: "#ffba08", y: 0.45 },
    ];

    function resize() {
      W = canvas!.width  = window.innerWidth;
      H = canvas!.height = window.innerHeight;
    }

    function drawWave(wave: typeof waves[0], t: number) {
      ctx!.beginPath();
      ctx!.moveTo(0, H);
      for (let x = 0; x <= W; x += 4) {
        const y =
          wave.y * H +
          Math.sin(x * wave.freq + t * wave.speed * 60) * wave.amp +
          Math.sin(x * wave.freq * 1.7 + t * wave.speed * 40) * (wave.amp * 0.4);
        ctx!.lineTo(x, y);
      }
      ctx!.lineTo(W, H);
      ctx!.closePath();
      const grad = ctx!.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, wave.color + "55");
      grad.addColorStop(1, wave.color + "00");
      ctx!.fillStyle = grad;
      ctx!.fill();
    }

    function animate(ts: number) {
      const t = ts / 1000;
      ctx!.clearRect(0, 0, W, H);
      waves.forEach((w) => drawWave(w, t));
      rafId = requestAnimationFrame(animate);
    }

    resize();
    window.addEventListener("resize", resize);
    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, [canvasRef]);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function uid() {
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}
function toTimeStr(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function Home() {
  const { isSignedIn } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [synced, setSynced]   = useState(false);

  // ── Persist events to localStorage ────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem("lifesaver_events");
      if (stored) setEvents(JSON.parse(stored));
    } catch {
      // corrupt data — start fresh
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("lifesaver_events", JSON.stringify(events));
  }, [events]);

  // ── Linear CRM tasks ─────────────────────────────────────────
  const [crmTasks,        setCrmTasks]        = useState<string[]>([]);
  const [crmLoading,      setCrmLoading]      = useState(true);
  const [crmError,        setCrmError]        = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      setCrmLoading(false);
      return;
    }
    async function fetchLinearTasks() {
      setCrmLoading(true);
      setCrmError(null);
      try {
        const res = await fetch("/api/linear");
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Linear API error ${res.status}`);
        }
        const tasks: string[] = await res.json();
        setCrmTasks(tasks);
      } catch (err: unknown) {
        setCrmError(err instanceof Error ? err.message : String(err));
      } finally {
        setCrmLoading(false);
      }
    }
    fetchLinearTasks();
  }, [isSignedIn]);

  // User settings
  const [workStart, setWorkStart]           = useState("09:00");
  const [workEnd, setWorkEnd]               = useState("18:00");
  const [timeframeHours, setTimeframeHours] = useState(48);

  // Modal state — carries optional pre-fill from calendar drag
  const [modal, setModal] = useState<ModalState>({ open: false });

  // Pending calendar selection (so we can unselect if user cancels)
  const pendingSelect = useRef<DateSelectArg | null>(null);

  useWaveCanvas(canvasRef);

  // ── Open modal from calendar drag ──────────────────────────────────────
  const handleCalendarSelect = useCallback((selectInfo: DateSelectArg) => {
    pendingSelect.current = selectInfo;
    setModal({
      open: true,
      prefillDate: toDateStr(selectInfo.start),
      prefillTime: toTimeStr(selectInfo.start),
      prefillEndDate: toDateStr(selectInfo.end),
      prefillEndTime: toTimeStr(selectInfo.end),
    });
  }, []);

  // ── Open modal from button ─────────────────────────────────────────────
  const handleAddManual = useCallback(() => {
    pendingSelect.current = null;
    const now   = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000);
    setModal({
      open: true,
      prefillDate: toDateStr(start),
      prefillTime: toTimeStr(start),
    });
  }, []);

  // ── Close modal ────────────────────────────────────────────────────────
  const handleModalClose = useCallback(() => {
    pendingSelect.current?.view.calendar.unselect();
    pendingSelect.current = null;
    setModal({ open: false });
  }, []);

  // ── Submit modal → create calendar event ──────────────────────────────
  const handleModalSubmit = useCallback((data: DeadlineFormData) => {
    // Build start from form date + time
    const start = new Date(`${data.date}T${data.time}`);

    // If came from drag: use drag end; else default +45 min
    let end: Date;
    if (pendingSelect.current) {
      end = pendingSelect.current.end;
      pendingSelect.current.view.calendar.unselect();
      pendingSelect.current = null;
    } else {
      end = new Date(start.getTime() + 45 * 60 * 1000);
    }

    const event: CalendarEvent = {
      id: uid(),
      title: data.name,
      start: start.toISOString(),
      end: end.toISOString(),
      backgroundColor: MANUAL_EVENT_COLOR,
      borderColor: MANUAL_EVENT_COLOR,
      textColor: "#0f172a",
      extendedProps: {
        description: data.description,
        reminders: data.reminders,
      },
    };

    setEvents((prev) => [...prev, event]);
    setModal({ open: false });
  }, []);

  // ── Sync CRM tasks ─────────────────────────────────────────────────────
  const handleSync = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSynced(false);

    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: crmTasks, workStart, workEnd, timeframeHours }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Server error ${res.status}`);
      }

      const data: Omit<CalendarEvent, "id">[] = await res.json();
      const enriched: CalendarEvent[] = data.map((e) => {
        // The AI may return reminders at the top level of each event object
        const raw = e as unknown as Record<string, unknown>;
        const aiReminders = Array.isArray(raw.reminders)
          ? (raw.reminders as CalendarEvent["extendedProps"] extends undefined ? never : NonNullable<CalendarEvent["extendedProps"]>["reminders"])
          : undefined;

        return {
          ...e,
          id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          borderColor: e.backgroundColor,
          textColor: "#ffffff",
          extendedProps: {
            ...e.extendedProps,
            reminders: aiReminders ?? e.extendedProps?.reminders ?? [],
          },
        };
      });


      setEvents((prev) => {
        const manual = prev.filter((ev) => ev.id.startsWith("manual-"));
        return [...manual, ...enriched];
      });
      setSynced(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [crmTasks, workStart, workEnd, timeframeHours]);

  const manualCount = events.filter((e) => e.id.startsWith("manual-")).length;
  const aiCount     = events.length - manualCount;

  return (
    <>
      {/* ── Background layers ── */}
      <canvas ref={canvasRef} id="wave-canvas" aria-hidden="true" />
      <div className="orb orb-top"    aria-hidden="true" />
      <div className="orb orb-bottom" aria-hidden="true" />
      <div className="orb orb-mid"    aria-hidden="true" />

      {/* ── Deadline Modal ── */}
      <DeadlineModal
        isOpen={modal.open}
        prefillDate={modal.prefillDate}
        prefillTime={modal.prefillTime}
        onClose={handleModalClose}
        onSubmit={handleModalSubmit}
      />

      {/* ── App layout ── */}
      <div className="app-layout">

        {/* ─── Left: Control Panel ──────────────────────────────────────── */}
        <aside className="control-panel">
          {/* Header */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="badge">
                <Zap size={11} />
                AI Scheduler
              </span>
              {/* Clerk auth controls */}
              {!isSignedIn ? (
                <SignInButton mode="modal">
                  <button
                    id="clerk-sign-in-btn"
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      padding: "0.3rem 0.75rem",
                      borderRadius: "6px",
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.8)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      letterSpacing: "0.03em",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.3)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.18)";
                    }}
                  >
                    Sign In
                  </button>
                </SignInButton>
              ) : (
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: { width: 28, height: 28 },
                    },
                  }}
                />
              )}
            </div>
            <h1 className="gradient-heading" style={{ marginTop: "0.75rem" }}>
              Last-Minute<br />Life Saver
            </h1>
            <p className="subtitle">
              Sync your CRM backlog and let Gemini build a stress-free focus
              schedule — on your terms.
            </p>
          </div>

          {/* Linear Tasks preview */}
          <div className="glass-card">
            <div className="task-list-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>📋 Linear Issues Queue</span>
              {!crmLoading && !crmError && (
                <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--text-muted)", opacity: 0.7 }}>
                  {crmTasks.length} issue{crmTasks.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Loading skeleton */}
            {crmLoading && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {[1, 2, 3].map((n) => (
                  <div key={n} className="task-pill" style={{ opacity: 0.4 }}>
                    <div className="task-pill-dot" style={{ backgroundColor: "rgba(255,255,255,0.2)" }} />
                    <div style={{ height: "0.75rem", borderRadius: "4px", background: "rgba(255,255,255,0.1)", flex: 1, animation: "pulse 1.5s ease-in-out infinite" }} />
                  </div>
                ))}
              </div>
            )}

            {/* Error state */}
            {!crmLoading && crmError && (
              <div style={{ fontSize: "0.78rem", color: "#f87171", lineHeight: 1.5, padding: "0.25rem 0" }}>
                ⚠ {crmError}
              </div>
            )}

            {/* Not signed in state */}
            {!isSignedIn && !crmLoading && (
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", padding: "0.5rem 0" }}>
                Sign in to load your Linear issues.
              </div>
            )}

            {/* Empty state */}
            {isSignedIn && !crmLoading && !crmError && crmTasks.length === 0 && (
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", padding: "0.5rem 0" }}>
                No open issues assigned to you in Linear.
              </div>
            )}

            {/* Task list */}
            {!crmLoading && !crmError && crmTasks.map((task, i) => (
              <div key={i} className="task-pill">
                <div
                  className="task-pill-dot"
                  style={{ backgroundColor: TASK_PREVIEW_COLORS[i % TASK_PREVIEW_COLORS.length] }}
                />
                <span style={{ fontSize: "0.82rem", lineHeight: 1.4 }}>{task}</span>
              </div>
            ))}
          </div>

          {/* Availability Settings */}
          <div className="glass-card">
            <div style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent-orange)", marginBottom: "1rem" }}>
              <Settings2 size={13} />
              Availability Settings
            </div>
            <div className="settings-grid">
              <div className="settings-field">
                <label htmlFor="work-start" className="settings-label">Work Start</label>
                <input id="work-start" type="time" className="settings-input" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
              </div>
              <div className="settings-field">
                <label htmlFor="work-end" className="settings-label">Work End</label>
                <input id="work-end" type="time" className="settings-input" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
              </div>
              <div className="settings-field settings-field--full">
                <label htmlFor="timeframe-hours" className="settings-label">Scheduling Window (hours)</label>
                <input id="timeframe-hours" type="number" className="settings-input" min={1} max={168} value={timeframeHours} onChange={(e) => setTimeframeHours(Math.max(1, parseInt(e.target.value) || 1))} />
              </div>
            </div>
          </div>

          {/* Sync button */}
          <div>
            <button id="sync-crm-btn" className="sync-btn" onClick={handleSync} disabled={loading} aria-label="Sync CRM tasks and generate schedule">
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", position: "relative" }}>
                {loading ? (
                  <><span className="spinner" aria-hidden="true" />Generating Schedule…</>
                ) : (
                  <><RefreshCw size={16} />Sync CRM Tasks</>
                )}
              </span>
            </button>

            {synced && !loading && (
              <div className="events-meta" style={{ marginTop: "0.75rem" }}>
                <CheckCircle2 size={14} color="#4ade80" />
                <span>Schedule generated —</span>
                <span className="events-count">{aiCount} AI blocks</span>
                {manualCount > 0 && (
                  <span className="events-count" style={{ background: "rgba(56,189,248,0.15)", borderColor: "rgba(56,189,248,0.35)", color: "#38bdf8" }}>
                    {manualCount} manual
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="error-banner" role="alert">
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <AlertCircle size={15} style={{ marginTop: "1px", flexShrink: 0, color: "#f87171" }} />
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* How it works */}
          <div className="glass-card" style={{ marginTop: "auto" }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent-orange)", marginBottom: "0.6rem" }}>
              ⚡ How it works
            </div>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.55rem", fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.55 }}>
              <li>▸ Simulates pulling 3 tasks from CRM</li>
              <li>▸ Gemini AI schedules 45-min focus blocks</li>
              <li>▸ 15-min gaps between each block</li>
              <li>▸ Respects your custom work hours & window</li>
              <li>▸ Click "Add Deadline" or drag calendar to create manual events</li>
            </ul>
          </div>

          <footer style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.2)", textAlign: "center", paddingTop: "0.5rem" }}>
            Built with{" "}
            <span style={{ color: "rgba(232,93,4,0.6)" }}>Gemini 2.5 Flash</span>
            {" "}· Next.js 14 · FullCalendar
          </footer>
        </aside>

        {/* ─── Right: Calendar View ──────────────────────────────────────── */}
        <main className="calendar-panel">
          <div className="calendar-header">
            <div className="calendar-title">
              <Calendar size={18} color="var(--accent-orange)" />
              Focus Schedule
              <span>{timeframeHours}-hour view</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              {events.length > 0 && (
                <div className="events-count">{events.length} blocks</div>
              )}
              <button
                id="add-manual-deadline-btn"
                className="manual-btn"
                onClick={handleAddManual}
                aria-label="Add a manual deadline"
              >
                <PlusCircle size={14} />
                Add Deadline
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="calendar-legend">
            <span className="legend-dot" style={{ backgroundColor: "#e85d04" }} />
            <span className="legend-label">AI Scheduled</span>
            <span className="legend-dot" style={{ backgroundColor: MANUAL_EVENT_COLOR }} />
            <span className="legend-label">Manual Deadline</span>
            <span className="legend-hint">· Drag a time slot to add a deadline</span>
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="timeGridWeek"
              headerToolbar={{ left: "prev,next today", center: "title", right: "timeGridWeek,timeGridDay" }}
              events={events}
              height="100%"
              slotMinTime="07:00:00"
              slotMaxTime="21:00:00"
              nowIndicator={true}
              allDaySlot={false}
              slotDuration="00:15:00"
              slotLabelInterval="01:00:00"
              expandRows={true}
              eventDisplay="block"
              selectable={true}
              selectMirror={true}
              select={handleCalendarSelect}
              unselectAuto={false}
              eventMouseEnter={(info) => {
                info.el.style.filter     = "brightness(1.15)";
                info.el.style.transform  = "scale(1.02)";
                info.el.style.zIndex     = "9";
                info.el.style.transition = "all 0.15s ease";
              }}
              eventMouseLeave={(info) => {
                info.el.style.filter    = "";
                info.el.style.transform = "";
                info.el.style.zIndex    = "";
              }}
            />
          </div>
        </main>
      </div>
    </>
  );
}
