"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";

// ─── Data ───
const AREA_UNITS = [
  { key: "hectare", label: "Hectare", labelHi: "हेक्टर", sqm: 10000 },
  { key: "bigha", label: "Bigha", labelHi: "बीघा", sqm: 683 },
  { key: "biswa", label: "Biswa", labelHi: "बिस्वा", sqm: 34.15 },
  { key: "sqm", label: "Sq. Meter", labelHi: "वर्ग मीटर", sqm: 1 },
  { key: "sqft", label: "Sq. Feet", labelHi: "वर्ग फुट", sqm: 0.09290304 },
  { key: "gaj", label: "Gaj", labelHi: "गज", sqm: 0.83612736 },
  { key: "acre", label: "Acre", labelHi: "एकड़", sqm: 4046.8564224 },
  { key: "kanal", label: "Kanal", labelHi: "कनाल", sqm: 505.857 },
] as const;

type AreaUnitKey = (typeof AREA_UNITS)[number]["key"];

// ─── Helpers ───
function convertArea(sqm: number, toKey: AreaUnitKey): number {
  return sqm / AREA_UNITS.find((u) => u.key === toKey)!.sqm;
}

function fmt(n: number): string {
  if (n === 0) return "0";
  if (Math.abs(n) >= 100)
    return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 0.01)
    return n.toLocaleString("en-IN", { maximumFractionDigits: 4 });
  return n.toPrecision(4);
}

function fmtINR(n: number): string {
  if (n === 0) return "₹0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_00_00_000) {
    const cr = abs / 1_00_00_000;
    return `${sign}₹${cr.toLocaleString("en-IN", { maximumFractionDigits: 2 })} Cr`;
  }
  if (abs >= 1_00_000) {
    const lakh = abs / 1_00_000;
    return `${sign}₹${lakh.toLocaleString("en-IN", { maximumFractionDigits: 2 })} Lakh`;
  }
  if (abs >= 1_000) {
    const hazar = abs / 1_000;
    return `${sign}₹${hazar.toLocaleString("en-IN", { maximumFractionDigits: 2 })} Hazaar`;
  }
  return `${sign}₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function safeEval(expr: string): number | null {
  const cleaned = expr.replace(/\s/g, "").replace(/x/gi, "*");
  if (!/^[0-9+\-*/().]+$/.test(cleaned) || !cleaned) return null;
  try {
    const r = new Function(`"use strict"; return (${cleaned})`)();
    return typeof r === "number" && isFinite(r) ? r : null;
  } catch {
    return null;
  }
}

// ─── History ───
type HistoryEntry = {
  id: string;
  timestamp: number;
  type: "convert";
  input: string;
  results: { label: string; value: string }[];
};

const HISTORY_KEY = "area-calc-history";

function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    try {
      setEntries(JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"));
    } catch {
      /* empty */
    }
  }, []);

  const persist = (list: HistoryEntry[]) => {
    const sliced = list.slice(0, 50);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(sliced));
    setEntries(sliced);
  };

  return {
    entries,
    add: (e: Omit<HistoryEntry, "id" | "timestamp">) => {
      const full: HistoryEntry = {
        ...e,
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        timestamp: Date.now(),
      };
      persist([full, ...entries]);
    },
    clear: () => {
      localStorage.removeItem(HISTORY_KEY);
      setEntries([]);
    },
    remove: (id: string) => persist(entries.filter((e) => e.id !== id)),
  };
}

// ─── MathInput ───
function MathInput({
  value,
  onChange,
  onEnter,
  placeholder = "0",
  large = false,
}: {
  value: string;
  onChange: (raw: string, num: number) => void;
  onEnter?: () => void;
  placeholder?: string;
  large?: boolean;
}) {
  const evaluated = useMemo(() => safeEval(value), [value]);
  const hasExpr = /[+\-*/x()]/.test(value.replace(/^-/, ""));

  return (
    <div>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value, safeEval(e.target.value) ?? 0)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        placeholder={placeholder}
        className={
          large
            ? "w-full text-5xl font-bold text-gray-900 bg-transparent outline-none py-2 placeholder:text-gray-200 placeholder:font-normal placeholder:text-3xl"
            : "w-full h-12 text-lg font-semibold text-gray-900 bg-gray-50 rounded-lg px-3 outline-none border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all placeholder:text-gray-200"
        }
      />
      {hasExpr && evaluated !== null && (
        <div className={`text-sm font-medium mt-1 text-emerald-600 ${large ? "" : "px-1"}`}>
          = {fmt(evaluated)}
        </div>
      )}
    </div>
  );
}

// ─── Share helper (dynamic import to avoid SSR issues) ───
async function shareResults(element: HTMLElement, label: string, results: { labelHi: string; label: string; value: number }[]) {
  try {
    // Dynamic import — html2canvas doesn't work with SSR
    const html2canvas = (await import("html2canvas")).default;

    const canvas = await html2canvas(element, {
      backgroundColor: "#f0fdf4",
      scale: 2,
      useCORS: true,
      logging: false,
    });
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    );

    if (blob) {
      const file = new File([blob], "area-calculation.png", { type: "image/png" });

      // Try native share with image
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Area Calculation",
          text: label,
          files: [file],
        });
        return;
      }

      // Fallback: download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "area-calculation.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    console.warn("Image share failed, falling back to text:", err);
  }

  // Final fallback: share as text
  const text = `${label}\n\n` + results.map((r) => `${r.labelHi} (${r.label}): ${fmt(r.value)}`).join("\n");
  if (navigator.share) {
    await navigator.share({ title: "Area Calculation", text });
  } else {
    await navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  }
}

// ─── Results Grid ───
function ResultsGrid({
  areaSqm,
  label,
  onSave,
  ratePerSqm = 0,
  rateUnitLabel = "",
}: {
  areaSqm: number;
  label: string;
  onSave?: () => void;
  ratePerSqm?: number;
  rateUnitLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [saved, setSaved] = useState(false);
  const results = useMemo(
    () => AREA_UNITS.map((u) => ({
      ...u,
      value: convertArea(areaSqm, u.key),
      cost: ratePerSqm > 0 ? ratePerSqm * u.sqm : 0,
    })),
    [areaSqm, ratePerSqm]
  );

  const handleShare = useCallback(async () => {
    if (!ref.current) return;
    setSharing(true);
    await shareResults(ref.current, label, results);
    setSharing(false);
  }, [label, results]);

  const handleSave = useCallback(() => {
    onSave?.();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [onSave]);

  return (
    <div className="space-y-2">
      <div ref={ref} className="space-y-2 rounded-2xl bg-gradient-to-b from-emerald-50/50 to-transparent p-3 -mx-1">
        <div className="px-1 text-sm font-semibold text-emerald-700">{label}</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {results.map((r) => (
            <div
              key={r.key}
              className="bg-white rounded-xl p-3 ring-1 ring-gray-100 shadow-sm"
            >
              <div className="text-lg font-bold text-gray-900 tabular-nums leading-tight">
                {fmt(r.value)}
              </div>
              <div className="text-[11px] font-medium text-gray-500 mt-0.5">
                {r.labelHi} <span className="text-gray-400">({r.label})</span>
              </div>
              {r.cost > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-gray-100">
                  <div className="text-sm font-bold text-amber-700">{fmtINR(r.cost)}</div>
                  <div className="text-[10px] text-gray-400">per {r.labelHi}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Buttons with spacing */}
      <div className="flex gap-2 pt-2">
        {onSave && (
          <button
            onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 rounded-xl text-sm font-medium text-white active:bg-emerald-700 transition-all shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
            </svg>
            {saved ? "Saved!" : "Save"}
          </button>
        )}
        <button
          onClick={handleShare}
          disabled={sharing}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-white rounded-xl ring-1 ring-gray-200 text-sm font-medium text-gray-600 active:bg-gray-50 disabled:opacity-50 transition-all shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
          </svg>
          {sharing ? "Sharing..." : "Share"}
        </button>
      </div>
    </div>
  );
}

// ─── Scrollable Chip Selector ───
function ChipRow<T extends string>({
  items,
  selected,
  onSelect,
}: {
  items: { key: T; label: string; labelHi: string }[];
  selected: T;
  onSelect: (k: T) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
      {items.map((u) => (
        <button
          key={u.key}
          onClick={() => onSelect(u.key)}
          className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
            selected === u.key
              ? "bg-emerald-600 text-white shadow-sm"
              : "bg-gray-100 text-gray-600 active:bg-gray-200"
          }`}
        >
          {u.labelHi}
        </button>
      ))}
    </div>
  );
}

// ─── Converter ───
function SimpleConverter({
  onSave,
}: {
  onSave: (e: Omit<HistoryEntry, "id" | "timestamp">) => void;
}) {
  const [input, setInput] = useState("1");
  const [num, setNum] = useState(1);
  const [unit, setUnit] = useState<AreaUnitKey>("hectare");
  const [rateInput, setRateInput] = useState("");
  const [rateNum, setRateNum] = useState(0);

  const unitData = AREA_UNITS.find((u) => u.key === unit)!;
  const sqm = num * unitData.sqm;

  const ratePerSqm = rateNum > 0 ? rateNum / unitData.sqm : 0;

  const save = () => {
    if (num <= 0) return;
    onSave({
      type: "convert",
      input: `${input} ${unitData.labelHi} (${unitData.label})`,
      results: AREA_UNITS.map((u) => ({
        label: `${u.labelHi} (${u.label})`,
        value: fmt(convertArea(sqm, u.key)),
      })),
    });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-5 space-y-4">
        {/* Two-field input row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-medium text-gray-300 uppercase tracking-wider mb-1.5 block">
              Area / क्षेत्रफल
            </label>
            <MathInput
              value={input}
              onChange={(r, n) => { setInput(r); setNum(n); }}
              onEnter={save}
              large
              placeholder="1"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium text-gray-300 uppercase tracking-wider mb-1.5 block">
              ₹ Rate / दर <span className="normal-case">(optional)</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={rateInput}
              onChange={(e) => {
                setRateInput(e.target.value);
                setRateNum(safeEval(e.target.value) ?? 0);
              }}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder={`₹ / ${unitData.labelHi}`}
              className="w-full text-3xl font-bold text-gray-900 bg-transparent outline-none py-2 placeholder:text-gray-200 placeholder:font-normal placeholder:text-2xl"
            />
          </div>
        </div>

        <ChipRow items={AREA_UNITS as any} selected={unit} onSelect={setUnit} />

        <p className="text-[10px] text-gray-200 text-center">
          supports +, -, *, /
        </p>
      </div>

      <ResultsGrid
        areaSqm={sqm}
        label={`${fmt(num)} ${unitData.labelHi} (${unitData.label}) =`}
        onSave={save}
        ratePerSqm={ratePerSqm}
        rateUnitLabel={unitData.labelHi}
      />

      <details className="bg-white rounded-xl shadow-sm ring-1 ring-gray-200">
        <summary className="px-4 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer select-none">
          Quick Reference / त्वरित संदर्भ
        </summary>
        <div className="divide-y divide-gray-50 text-xs px-4 pb-2">
          {[
            ["1 हेक्टर", "10,000 वर्ग मीटर"],
            ["1 बीघा", "683 वर्ग मीटर"],
            ["1 बीघा", "7,350 वर्ग फुट"],
            ["1 बीघा", "816.50 गज"],
            ["1 बीघा", "20 बिस्वा"],
          ].map(([f, t], i) => (
            <div key={i} className="flex justify-between py-1.5">
              <span className="text-gray-400">{f}</span>
              <span className="font-medium text-gray-700">{t}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

// ─── History ───
function HistoryTab({
  entries,
  onClear,
  onRemove,
}: {
  entries: HistoryEntry[];
  onClear: () => void;
  onRemove: (id: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!entries.length) {
    return (
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-8 text-center">
        <svg className="w-10 h-10 mx-auto text-gray-200 mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-gray-400">No history yet</p>
        <p className="text-[10px] text-gray-300 mt-1">Press Enter or Save to store calculations</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-gray-400">{entries.length} saved</span>
        <button onClick={onClear} className="text-[10px] font-medium text-red-400 active:text-red-600">
          Clear All
        </button>
      </div>
      {entries.map((e) => {
        const open = expandedId === e.id;
        const d = new Date(e.timestamp);
        return (
          <div key={e.id} className="bg-white rounded-xl shadow-sm ring-1 ring-gray-200 overflow-hidden">
            <button
              onClick={() => setExpandedId(open ? null : e.id)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left active:bg-gray-50"
            >
              <span className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 bg-emerald-100 text-emerald-700">
                UC
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">{e.input}</div>
                <div className="text-[10px] text-gray-400">
                  {d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })},{" "}
                  {d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              <svg className={`w-3.5 h-3.5 text-gray-300 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {open && (
              <div className="border-t border-gray-100 px-3 py-2 space-y-1">
                <div className="grid grid-cols-2 gap-1.5">
                  {e.results.map((r, i) => (
                    <div key={i} className="bg-gray-50 rounded-md px-2 py-1.5">
                      <div className="text-sm font-bold text-gray-800 tabular-nums">{r.value}</div>
                      <div className="text-[10px] text-gray-400">{r.label}</div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => onRemove(e.id)}
                  className="text-[10px] text-red-400 font-medium mt-1 active:text-red-600"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ───
export default function AreaCalculator() {
  const [tab, setTab] = useState<"convert" | "history">("convert");
  const h = useHistory();

  const tabs = [
    { key: "convert" as const, label: "Converter", labelHi: "परिवर्तक" },
    { key: "history" as const, label: "History", labelHi: "इतिहास" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-amber-50/30">
      <header className="bg-white/90 backdrop-blur-sm sticky top-0 z-10 border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-0">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
              <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">
                Area Calculator
              </h1>
              <p className="text-[11px] text-gray-400">भूमि क्षेत्रफल कैलकुलेटर</p>
            </div>
          </div>

          <div className="flex">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 py-2.5 text-xs font-medium text-center border-b-2 transition-colors ${
                  tab === t.key
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-gray-400 active:text-gray-600"
                }`}
              >
                {t.label}
                {t.key === "history" && h.entries.length > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 text-[10px] font-bold bg-emerald-600 text-white rounded-full px-1">
                    {h.entries.length}
                  </span>
                )}
                <span className="block text-[10px] font-normal opacity-60">{t.labelHi}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4">
        {tab === "convert" && <SimpleConverter onSave={h.add} />}
        {tab === "history" && (
          <HistoryTab entries={h.entries} onClear={h.clear} onRemove={h.remove} />
        )}
      </main>
    </div>
  );
}
