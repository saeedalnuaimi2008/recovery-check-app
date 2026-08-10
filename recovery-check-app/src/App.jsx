import React, { useState, useEffect, useRef, useMemo } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  ComposedChart,
  Line,
  Bar,
  ReferenceArea,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Upload, Plus, Trash2, Activity, Gauge, ListChecks, AlertTriangle, HeartPulse, Settings2, ChevronDown } from "lucide-react";

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------
const colors = {
  bg: "#10161A",
  surface: "#161F23",
  surfaceAlt: "#1D272C",
  border: "#2A363C",
  text: "#EAF1F1",
  textMuted: "#849198",
  textFaint: "#5B676D",
  under: "#5E8AA6",
  safe: "#4FA98C",
  overreach: "#E3A44B",
  danger: "#D9555F",
  bar: "#33474F",
};

const ZONES = [
  { key: "under", label: "Undertrained", range: "< 0.80", color: colors.under, y1: 0 },
  { key: "safe", label: "Sweet Spot", range: "0.80 – 1.30", color: colors.safe, y1: 0.8 },
  { key: "overreach", label: "Overreach", range: "1.30 – 1.50", color: colors.overreach, y1: 1.3 },
  { key: "danger", label: "Danger Zone", range: "≥ 1.50", color: colors.danger, y1: 1.5 },
];

function zoneFor(acwr) {
  if (acwr === null || acwr === undefined || Number.isNaN(acwr)) return null;
  if (acwr < 0.8) return ZONES[0];
  if (acwr <= 1.3) return ZONES[1];
  if (acwr < 1.5) return ZONES[2];
  return ZONES[3];
}

const RPE_LABELS = {
  1: "Very light",
  2: "Light",
  3: "Light",
  4: "Moderate",
  5: "Moderate",
  6: "Hard",
  7: "Hard",
  8: "Very hard",
  9: "Very hard",
  10: "Maximal",
};

const GUIDANCE = {
  under: {
    heading: "Building back up",
    body: "Your recent load is lighter than what your body's adapted to. This is a good window to add volume gradually — a sudden jump from here is what raises injury risk, not the light week itself.",
    actions: ["Ease load up gradually over 1–2 weeks", "Good window for technique work and aerobic base"],
  },
  safe: {
    heading: "In the sweet spot",
    body: "Your training load matches what your body's built up to handle. This is the lowest-risk zone for overuse injury — the goal is to stay consistent, not to chase a big spike.",
    actions: ["Keep your usual routine", "Prioritize normal sleep and recovery between sessions"],
  },
  overreach: {
    heading: "Load is climbing fast",
    body: "Your recent training has picked up faster than your body's used to. Risk of soft-tissue injury goes up here. It doesn't mean stop — it means recover deliberately for the next few days.",
    actions: ["Add an extra recovery or mobility session this week", "Watch for unusual soreness, fatigue, or poor sleep", "Avoid stacking another hard session right away"],
  },
  danger: {
    heading: "High injury risk right now",
    body: "Your load has spiked sharply above what your body's adapted to. This is when most overuse injuries happen. Back off intensity for a few days and let your fitness catch up.",
    actions: ["Flag this to your coach or medical staff", "Prioritize rest, sleep, and light active recovery", "Avoid high-intensity or high-volume sessions until this settles"],
  },
};

function RecoveryGuidance({ row }) {
  if (!row || !row.zone) {
    return (
      <div
        className="p-5 rounded-lg mb-6 flex items-center gap-3"
        style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
      >
        <HeartPulse size={18} color={colors.textFaint} />
        <span style={{ color: colors.textFaint, fontSize: 13 }}>
          Log a session to see your personal recovery guidance.
        </span>
      </div>
    );
  }
  const g = GUIDANCE[row.zone.key];
  return (
    <div
      className="p-5 rounded-lg mb-6"
      style={{ background: colors.surface, border: `1px solid ${row.zone.color}66`, borderLeft: `4px solid ${row.zone.color}` }}
    >
      <div className="flex items-center gap-2 mb-2">
        <HeartPulse size={16} color={row.zone.color} />
        <span
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: 17,
            color: row.zone.color,
          }}
        >
          {g.heading}
        </span>
      </div>
      <p style={{ color: colors.text, fontSize: 14, lineHeight: 1.5, marginBottom: 12, maxWidth: 640 }}>{g.body}</p>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {g.actions.map((a, i) => (
          <li key={i} style={{ color: colors.textMuted, fontSize: 13, lineHeight: 1.6 }}>
            {a}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Math — mirrors the pandas ewm(adjust=False) recursion
// ---------------------------------------------------------------------------
function ewma(values, alpha) {
  const out = [];
  let prev = null;
  values.forEach((v, i) => {
    prev = i === 0 ? v : v * alpha + prev * (1 - alpha);
    out.push(prev);
  });
  return out;
}

function computeSeries(entries, acuteDays, chronicDays) {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const values = sorted.map((e) => e.workload);
  const alphaAcute = 2 / (acuteDays + 1);
  const alphaChronic = 2 / (chronicDays + 1);
  const acute = ewma(values, alphaAcute);
  const chronic = ewma(values, alphaChronic);
  return sorted.map((e, i) => {
    const acwr = chronic[i] ? acute[i] / chronic[i] : null;
    const zone = zoneFor(acwr);
    return {
      ...e,
      ewma_acute: acute[i],
      ewma_chronic: chronic[i],
      acwr,
      zone,
    };
  });
}

// ---------------------------------------------------------------------------
// Parsing helpers for uploaded files
// ---------------------------------------------------------------------------
function normalizeDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function extractEntries(rows) {
  if (!rows || !rows.length) return [];
  const keys = Object.keys(rows[0]);
  const dateKey = keys.find((k) => /date/i.test(k)) || keys[0];
  const loadKey =
    keys.find((k) => /workload|load|rpe|volume|distance|strain/i.test(k)) || keys[1] || keys[0];
  return rows
    .map((r) => ({ date: normalizeDate(r[dateKey]), workload: parseFloat(r[loadKey]) }))
    .filter((e) => e.date && !Number.isNaN(e.workload));
}

function mergeEntries(existing, incoming) {
  const map = new Map(existing.map((e) => [e.date, e]));
  incoming.forEach((e) => map.set(e.date, e));
  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------------------------------------------------------------------------
// UI atoms
// ---------------------------------------------------------------------------
function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div
      className="flex-1 min-w-[140px] p-4 rounded-lg"
      style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} color={accent || colors.textMuted} />
        <span
          className="uppercase tracking-widest"
          style={{ fontSize: 10, color: colors.textMuted, fontFamily: "Inter, sans-serif" }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 26,
          fontWeight: 700,
          color: accent || colors.text,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: colors.textFaint, marginTop: 6, fontFamily: "Inter, sans-serif" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function ZonePill({ zone }) {
  if (!zone) return <span style={{ color: colors.textFaint, fontSize: 12 }}>—</span>;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full"
      style={{
        fontSize: 11,
        fontFamily: "Inter, sans-serif",
        fontWeight: 500,
        color: zone.color,
        background: `${zone.color}1F`,
        border: `1px solid ${zone.color}55`,
      }}
    >
      {zone.label}
    </span>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  return (
    <div
      style={{
        background: colors.surfaceAlt,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: "10px 12px",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        color: colors.text,
      }}
    >
      <div style={{ color: colors.textMuted, marginBottom: 6 }}>{label}</div>
      <div>workload: {row.workload?.toFixed(0)}</div>
      <div>acute: {row.ewma_acute?.toFixed(1)}</div>
      <div>chronic: {row.ewma_chronic?.toFixed(1)}</div>
      <div style={{ color: row.zone?.color || colors.text, marginTop: 4 }}>
        ACWR: {row.acwr?.toFixed(2)} {row.zone ? `· ${row.zone.label}` : ""}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export default function AcwrLoadTerrain() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acuteDays, setAcuteDays] = useState(7);
  const [chronicDays, setChronicDays] = useState(28);
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualWorkload, setManualWorkload] = useState("");
  const [rpe, setRpe] = useState(5);
  const [duration, setDuration] = useState("");
  const [useDirectAU, setUseDirectAU] = useState(false);
  const [fileError, setFileError] = useState("");
  const [showCoachTools, setShowCoachTools] = useState(false);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem("acwr-active-player") || "");
  const [playerList, setPlayerList] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("acwr-player-list") || "[]");
    } catch {
      return [];
    }
  });
  const hasLoaded = useRef(false);
  const fileInputRef = useRef(null);

  function storageKey(name) {
    return `acwr-entries:${name}`;
  }

  function switchPlayer(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPlayerName(trimmed);
    localStorage.setItem("acwr-active-player", trimmed);
    if (!playerList.includes(trimmed)) {
      const updated = [...playerList, trimmed];
      setPlayerList(updated);
      localStorage.setItem("acwr-player-list", JSON.stringify(updated));
    }
    try {
      const raw = localStorage.getItem(storageKey(trimmed));
      setEntries(raw ? JSON.parse(raw) : []);
    } catch {
      setEntries([]);
    }
  }

  useEffect(() => {
    if (playerName) {
      try {
        const raw = localStorage.getItem(storageKey(playerName));
        if (raw) setEntries(JSON.parse(raw));
      } catch {
        // no data yet
      }
    }
    setLoading(false);
    hasLoaded.current = true;
  }, []);

  useEffect(() => {
    if (!hasLoaded.current || !playerName) return;
    localStorage.setItem(storageKey(playerName), JSON.stringify(entries));
  }, [entries, playerName]);

  const series = useMemo(() => computeSeries(entries, acuteDays, chronicDays), [entries, acuteDays, chronicDays]);

  const latest = series.length ? series[series.length - 1] : null;
  const yMax = useMemo(() => {
    const maxAcwr = series.reduce((m, r) => (r.acwr && r.acwr > m ? r.acwr : m), 1.5);
    return Math.max(2, Math.ceil((maxAcwr + 0.2) * 10) / 10);
  }, [series]);
  const maxWorkload = useMemo(() => series.reduce((m, r) => Math.max(m, r.workload || 0), 1), [series]);
  const avg7 = useMemo(() => {
    const last7 = series.slice(-7);
    if (!last7.length) return null;
    return last7.reduce((s, r) => s + r.workload, 0) / last7.length;
  }, [series]);

  function handleAdd() {
    const w = useDirectAU ? parseFloat(manualWorkload) : rpe * parseFloat(duration);
    if (!manualDate || Number.isNaN(w) || w <= 0) return;
    setEntries((prev) => mergeEntries(prev, [{ date: manualDate, workload: w }]));
    setManualWorkload("");
    setDuration("");
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFileError("");
    const isCsv = /\.csv$/i.test(file.name);
    if (isCsv) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const parsed = extractEntries(res.data);
          if (!parsed.length) setFileError("Couldn't find date/workload columns in that file.");
          else setEntries((prev) => mergeEntries(prev, parsed));
        },
        error: () => setFileError("Couldn't read that CSV."),
      });
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const wb = XLSX.read(evt.target.result, { type: "array", cellDates: true });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
          const parsed = extractEntries(rows);
          if (!parsed.length) setFileError("Couldn't find date/workload columns in that file.");
          else setEntries((prev) => mergeEntries(prev, parsed));
        } catch (err) {
          setFileError("Couldn't read that spreadsheet.");
        }
      };
      reader.readAsArrayBuffer(file);
    }
    e.target.value = "";
  }

  function removeEntry(date) {
    setEntries((prev) => prev.filter((e) => e.date !== date));
  }

  if (!playerName) {
    return (
      <div
        style={{ background: colors.bg, minHeight: "100vh", color: colors.text, fontFamily: "Inter, sans-serif" }}
        className="flex items-center justify-center p-6"
      >
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        `}</style>
        <div
          className="w-full max-w-sm p-6 rounded-lg"
          style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
        >
          <div
            className="uppercase tracking-[0.2em] mb-2"
            style={{ fontSize: 11, color: colors.safe, fontWeight: 600 }}
          >
            ACWR Injury Risk Engine
          </div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 26, marginBottom: 8 }}>
            Recovery Check
          </h1>
          <p style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16 }}>
            Enter your name to see your own session history. Each name keeps its own data on this device.
          </p>
          <input
            type="text"
            placeholder="Your name"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && switchPlayer(e.currentTarget.value)}
            className="rounded px-3 py-2 w-full mb-3"
            style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, color: colors.text }}
          />
          <button
            onClick={(e) => switchPlayer(e.currentTarget.previousElementSibling.value)}
            className="rounded px-3 py-2 w-full"
            style={{ background: colors.safe, color: "#0C1512", fontWeight: 600, fontSize: 13 }}
          >
            Continue
          </button>
          {playerList.length > 0 && (
            <div className="mt-4">
              <div style={{ fontSize: 10, color: colors.textFaint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                Or pick an existing profile
              </div>
              <div className="flex flex-wrap gap-2">
                {playerList.map((p) => (
                  <button
                    key={p}
                    onClick={() => switchPlayer(p)}
                    className="rounded-full px-3 py-1"
                    style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, color: colors.text, fontSize: 12 }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ background: colors.bg, minHeight: "100vh", color: colors.text, fontFamily: "Inter, sans-serif" }}
      className="p-5 md:p-10"
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.6); }
        ::selection { background: ${colors.safe}55; }
      `}</style>

      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
          <div
            className="uppercase tracking-[0.2em] mb-2"
            style={{ fontSize: 11, color: colors.safe, fontFamily: "Inter, sans-serif", fontWeight: 600 }}
          >
            ACWR Injury Risk Engine
          </div>
          <h1
            style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 34, lineHeight: 1.1 }}
          >
            Recovery Check
          </h1>
          <p style={{ color: colors.textMuted, fontSize: 14, marginTop: 8, maxWidth: 560 }}>
            Log today's session and see where your training load sits — and what to do about it.
          </p>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem("acwr-active-player");
              setPlayerName("");
            }}
            className="rounded-full px-3 py-1.5 whitespace-nowrap"
            style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textMuted, fontSize: 12 }}
          >
            {playerName} · switch
          </button>
        </div>

        {/* Stat cards */}
        <div className="flex flex-wrap gap-3 mb-6">
          <StatCard
            icon={Gauge}
            label="Current ACWR"
            value={latest && latest.acwr !== null ? latest.acwr.toFixed(2) : "—"}
            sub={latest ? latest.date : "no sessions yet"}
            accent={latest?.zone?.color}
          />
          <StatCard
            icon={AlertTriangle}
            label="Risk Zone"
            value={latest?.zone ? latest.zone.label : "—"}
            accent={latest?.zone?.color}
          />
          <StatCard icon={Activity} label="7-Day Avg Load" value={avg7 ? avg7.toFixed(0) : "—"} sub="AU" />
          <StatCard icon={ListChecks} label="Sessions Logged" value={entries.length} />
        </div>

        {/* Recovery guidance */}
        <RecoveryGuidance row={latest} />

        {/* Add today's session */}
        <div
          className="mb-4 p-4 rounded-lg"
          style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
        >
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Date
              </span>
              <input
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className="rounded px-2 py-1"
                style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, color: colors.text, fontFamily: "'JetBrains Mono', monospace" }}
              />
            </label>

            {!useDirectAU ? (
              <>
                <label className="flex flex-col gap-1">
                  <span style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                    How hard did it feel? (RPE)
                  </span>
                  <select
                    value={rpe}
                    onChange={(e) => setRpe(parseInt(e.target.value, 10))}
                    className="rounded px-2 py-1 w-40"
                    style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, color: colors.text, fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n} — {RPE_LABELS[n]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                    Duration (minutes)
                  </span>
                  <input
                    type="number"
                    placeholder="e.g. 60"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="rounded px-2 py-1 w-28"
                    style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, color: colors.text, fontFamily: "'JetBrains Mono', monospace" }}
                  />
                </label>
                <div className="flex flex-col gap-1">
                  <span style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                    Session load
                  </span>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 14,
                      color: duration ? colors.text : colors.textFaint,
                      padding: "5px 0",
                    }}
                  >
                    {duration ? `${(rpe * parseFloat(duration || 0)).toFixed(0)} AU` : "— AU"}
                  </span>
                </div>
              </>
            ) : (
              <label className="flex flex-col gap-1">
                <span style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                  Session load (AU)
                </span>
                <input
                  type="number"
                  placeholder="e.g. 540"
                  value={manualWorkload}
                  onChange={(e) => setManualWorkload(e.target.value)}
                  className="rounded px-2 py-1 w-32"
                  style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, color: colors.text, fontFamily: "'JetBrains Mono', monospace" }}
                />
              </label>
            )}

            <button
              onClick={handleAdd}
              className="flex items-center gap-1 rounded px-3 py-1.5"
              style={{ background: colors.safe, color: "#0C1512", fontWeight: 600, fontSize: 13 }}
            >
              <Plus size={14} /> Log session
            </button>
          </div>
          <button
            onClick={() => setUseDirectAU((v) => !v)}
            style={{ fontSize: 11, color: colors.textFaint, marginTop: 10, textDecoration: "underline" }}
          >
            {useDirectAU ? "Use RPE × duration instead" : "I already know my AU number — enter it directly"}
          </button>
        </div>

        {/* Coach tools (collapsed by default) */}
        <div className="mb-6 rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
          <button
            onClick={() => setShowCoachTools((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5"
            style={{ background: colors.surface, color: colors.textMuted, fontSize: 12 }}
          >
            <span className="flex items-center gap-2">
              <Settings2 size={13} /> Coach tools — EWMA windows &amp; bulk upload
            </span>
            <ChevronDown size={14} style={{ transform: showCoachTools ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          </button>
          {showCoachTools && (
            <div
              className="flex flex-wrap items-end gap-4 p-4"
              style={{ background: colors.surfaceAlt, borderTop: `1px solid ${colors.border}` }}
            >
              <div className="flex gap-3">
                <label className="flex flex-col gap-1">
                  <span style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                    Acute window
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={acuteDays}
                    onChange={(e) => setAcuteDays(Math.max(1, parseFloat(e.target.value) || 1))}
                    className="rounded px-2 py-1 w-20"
                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.text, fontFamily: "'JetBrains Mono', monospace" }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                    Chronic window
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={chronicDays}
                    onChange={(e) => setChronicDays(Math.max(1, parseFloat(e.target.value) || 1))}
                    className="rounded px-2 py-1 w-20"
                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.text, fontFamily: "'JetBrains Mono', monospace" }}
                  />
                </label>
              </div>

              <div className="h-8 w-px" style={{ background: colors.border }} />

              <div className="flex flex-col gap-1">
                <span style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                  Upload log
                </span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded px-3 py-1.5"
                  style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.text, fontSize: 13 }}
                >
                  <Upload size={14} /> CSV / Excel
                </button>
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" />
              </div>
            </div>
          )}
        </div>
        {fileError && (
          <div style={{ color: colors.danger, fontSize: 12, marginTop: -16, marginBottom: 16 }}>{fileError}</div>
        )}

        {/* Chart */}
        <div className="mb-6 p-4 rounded-lg" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
          {loading ? (
            <div style={{ color: colors.textFaint, textAlign: "center", padding: "60px 0" }}>Loading…</div>
          ) : series.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center text-center"
              style={{ padding: "60px 0", border: `1px dashed ${colors.border}`, borderRadius: 8, color: colors.textFaint }}
            >
              <div style={{ fontSize: 14 }}>No sessions logged yet.</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Upload a training log or add today's session to start the terrain.</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={series} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={colors.border} strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: colors.textFaint, fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={{ stroke: colors.border }}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  yAxisId="ratio"
                  domain={[0, yMax]}
                  tick={{ fill: colors.textFaint, fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <YAxis yAxisId="load" domain={[0, maxWorkload * 2.6]} hide />
                <Tooltip content={<CustomTooltip />} />

                {ZONES.map((z, i) => (
                  <ReferenceArea
                    key={z.key}
                    yAxisId="ratio"
                    y1={z.y1}
                    y2={i === ZONES.length - 1 ? yMax : ZONES[i + 1].y1}
                    fill={z.color}
                    fillOpacity={0.1}
                    strokeOpacity={0}
                  />
                ))}

                <Bar yAxisId="load" dataKey="workload" fill={colors.bar} radius={[2, 2, 0, 0]} barSize={10} />
                <Line
                  yAxisId="ratio"
                  type="monotone"
                  dataKey="acwr"
                  stroke={colors.text}
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: colors.text, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-4 pt-4" style={{ borderTop: `1px solid ${colors.border}` }}>
            {ZONES.map((z) => (
              <div key={z.key} className="flex items-center gap-2">
                <span style={{ width: 8, height: 8, borderRadius: 2, background: z.color, display: "inline-block" }} />
                <span style={{ fontSize: 11, color: colors.textMuted }}>
                  {z.label} <span style={{ color: colors.textFaint }}>({z.range})</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* History table */}
        {series.length > 0 && (
          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: colors.surfaceAlt }}>
                    {["Date", "Workload", "EWMA acute", "EWMA chronic", "ACWR", "Zone", ""].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "8px 12px",
                          color: colors.textMuted,
                          fontWeight: 500,
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: 1,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...series].reverse().map((row) => (
                    <tr key={row.date} style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono', monospace", color: colors.text }}>{row.date}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono', monospace", color: colors.textMuted }}>{row.workload.toFixed(0)}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono', monospace", color: colors.textMuted }}>{row.ewma_acute?.toFixed(1)}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono', monospace", color: colors.textMuted }}>{row.ewma_chronic?.toFixed(1)}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono', monospace", color: row.zone?.color || colors.text }}>
                        {row.acwr !== null ? row.acwr.toFixed(2) : "—"}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <ZonePill zone={row.zone} />
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>
                        <button onClick={() => removeEntry(row.date)} style={{ color: colors.textFaint }} aria-label={`Remove ${row.date}`}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ fontSize: 11, color: colors.textFaint, marginTop: 24, textAlign: "center" }}>
          Risk thresholds follow Gabbett's ACWR bands. This is a training-load monitoring aid, not medical advice.
        </div>
      </div>
    </div>
  );
}
