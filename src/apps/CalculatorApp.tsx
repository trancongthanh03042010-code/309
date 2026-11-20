import React, { useEffect, useState } from 'react';
import { History, Delete, RefreshCw } from 'lucide-react';
import { osApi } from '../services/api';

type Mode = 'basic' | 'scientific' | 'unit' | 'currency';

export function CalculatorApp() {
  const [mode, setMode] = useState<Mode>('basic');
  const [expr, setExpr] = useState('0');
  const [history, setHistory] = useState<string[]>([]);
  const [showHist, setShowHist] = useState(false);

  // Unit converter
  const [unitType, setUnitType] = useState<'length' | 'weight' | 'temp' | 'data'>('length');
  const [unitVal, setUnitVal] = useState('1');
  const [fromUnit, setFromUnit] = useState('km');
  const [toUnit, setToUnit] = useState('m');

  // Currency converter
  const [fxBase, setFxBase] = useState('USD');
  const [fxTarget, setFxTarget] = useState('JPY');
  const [fxAmount, setFxAmount] = useState('100');
  const [fxRates, setFxRates] = useState<Record<string, number>>({});
  const [fxMeta, setFxMeta] = useState<{ date: string; source: string } | null>(null);
  const [fxError, setFxError] = useState<string | null>(null);

  const loadFx = async (base: string) => {
    setFxError(null);
    try {
      const res = await osApi.currency(base);
      setFxRates(res.rates);
      setFxMeta({ date: res.date, source: res.source });
    } catch (err) {
      setFxError(err instanceof Error ? err.message : 'Không thể tải tỷ giá hối đoái');
    }
  };

  useEffect(() => {
    if (mode === 'currency') {
      loadFx(fxBase);
    }
  }, [mode, fxBase]);

  const append = (val: string) => {
    setExpr((prev) => (prev === '0' && !'.+-*/%'.includes(val) ? val : prev + val));
  };

  const evaluate = () => {
    try {
      const sanitized = expr
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/π/g, String(Math.PI))
        .replace(/√\(/g, 'Math.sqrt(')
        .replace(/sin\(/g, 'Math.sin(')
        .replace(/cos\(/g, 'Math.cos(')
        .replace(/tan\(/g, 'Math.tan(')
        .replace(/log\(/g, 'Math.log10(')
        .replace(/ln\(/g, 'Math.log(')
        .replace(/\^/g, '**');
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${sanitized})`)() as number;
      if (!Number.isFinite(result)) throw new Error('Invalid');
      const rounded = String(Number(result.toFixed(8)));
      setHistory((h) => [`${expr} = ${rounded}`, ...h].slice(0, 20));
      setExpr(rounded);
    } catch {
      setExpr('Lỗi');
    }
  };

  const convertUnit = (): string => {
    const v = Number(unitVal);
    if (Number.isNaN(v)) return '0';
    if (unitType === 'temp') {
      const c = fromUnit === 'C' ? v : fromUnit === 'F' ? ((v - 32) * 5) / 9 : v - 273.15;
      const out = toUnit === 'C' ? c : toUnit === 'F' ? (c * 9) / 5 + 32 : c + 273.15;
      return out.toFixed(2);
    }
    const factors: Record<string, Record<string, number>> = {
      length: { m: 1, km: 1000, cm: 0.01, mi: 1609.34, ft: 0.3048 },
      weight: { kg: 1, g: 0.001, lb: 0.453592, oz: 0.0283495 },
      data: { MB: 1, KB: 1 / 1024, GB: 1024, TB: 1024 * 1024 },
    };
    const f = factors[unitType];
    const inBase = v * (f[fromUnit] || 1);
    return (inBase / (f[toUnit] || 1)).toFixed(4);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#101014] text-white overflow-hidden">
      {/* Mode Switcher */}
      <div className="px-3 py-2.5 bg-[#1A1A22] border-b border-zinc-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-[11px] font-medium overflow-x-auto os-scroll-hidden">
          {(
            [
              { id: 'basic', label: 'Cơ bản' },
              { id: 'scientific', label: 'Khoa học' },
              { id: 'unit', label: 'Đổi đơn vị' },
              { id: 'currency', label: 'Tiền tệ' },
            ] as { id: Mode; label: string }[]
          ).map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`px-2.5 py-1 rounded-lg whitespace-nowrap ${
                mode === m.id ? 'bg-amber-500 text-black font-semibold' : 'text-zinc-400'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowHist((s) => !s)} className="p-1.5 rounded-lg bg-zinc-800">
          <History className="w-4 h-4 text-amber-400" />
        </button>
      </div>

      {showHist && (
        <div className="p-3 bg-zinc-900 border-b border-zinc-800 max-h-36 overflow-y-auto text-xs font-mono-num space-y-1">
          {history.length === 0 ? (
            <p className="text-zinc-500">Chưa có phép tính nào.</p>
          ) : (
            history.map((h, i) => <div key={i}>{h}</div>)
          )}
        </div>
      )}

      {(mode === 'basic' || mode === 'scientific') && (
        <div className="flex-1 min-h-0 flex flex-col justify-between p-4 gap-2">
          <div className="flex-1 min-h-[72px] flex items-end justify-end pb-2">
            <p className="text-3xl sm:text-4xl font-mono-num font-bold break-all text-right">{expr}</p>
          </div>

          {mode === 'scientific' && (
            <div className="grid grid-cols-5 gap-1.5 text-xs font-mono-num shrink-0">
              {['sin(', 'cos(', 'tan(', 'log(', 'ln(', '√(', '^', '(', ')', 'π'].map((fn) => (
                <button
                  key={fn}
                  onClick={() => append(fn)}
                  className="py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-purple-300 font-semibold"
                >
                  {fn}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-4 gap-2 shrink-0">
            <button onClick={() => setExpr('0')} className="h-12 rounded-2xl bg-zinc-700 font-semibold">AC</button>
            <button onClick={() => setExpr((e) => (e.length > 1 ? e.slice(0, -1) : '0'))} className="h-12 rounded-2xl bg-zinc-700 flex items-center justify-center">
              <Delete className="w-5 h-5" />
            </button>
            <button onClick={() => append('%')} className="h-12 rounded-2xl bg-zinc-700 font-semibold">%</button>
            <button onClick={() => append('÷')} className="h-12 rounded-2xl bg-amber-500 text-black font-bold text-lg">÷</button>

            {['7', '8', '9'].map((n) => (
              <button key={n} onClick={() => append(n)} className="h-12 rounded-2xl bg-zinc-800 font-mono-num text-lg font-semibold">{n}</button>
            ))}
            <button onClick={() => append('×')} className="h-12 rounded-2xl bg-amber-500 text-black font-bold text-lg">×</button>

            {['4', '5', '6'].map((n) => (
              <button key={n} onClick={() => append(n)} className="h-12 rounded-2xl bg-zinc-800 font-mono-num text-lg font-semibold">{n}</button>
            ))}
            <button onClick={() => append('-')} className="h-12 rounded-2xl bg-amber-500 text-black font-bold text-lg">-</button>

            {['1', '2', '3'].map((n) => (
              <button key={n} onClick={() => append(n)} className="h-12 rounded-2xl bg-zinc-800 font-mono-num text-lg font-semibold">{n}</button>
            ))}
            <button onClick={() => append('+')} className="h-12 rounded-2xl bg-amber-500 text-black font-bold text-lg">+</button>

            <button onClick={() => append('0')} className="col-span-2 h-12 rounded-2xl bg-zinc-800 font-mono-num text-lg font-semibold">0</button>
            <button onClick={() => append('.')} className="h-12 rounded-2xl bg-zinc-800 font-mono-num text-lg font-semibold">.</button>
            <button onClick={evaluate} className="h-12 rounded-2xl bg-emerald-500 text-black font-bold text-lg">=</button>
          </div>
        </div>
      )}

      {mode === 'unit' && (
        <div className="p-4 space-y-4 text-xs">
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                { id: 'length', label: 'Độ dài' },
                { id: 'weight', label: 'Khối lượng' },
                { id: 'temp', label: 'Nhiệt độ' },
                { id: 'data', label: 'Dữ liệu' },
              ] as const
            ).map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  setUnitType(u.id);
                  if (u.id === 'length') { setFromUnit('km'); setToUnit('m'); }
                  if (u.id === 'weight') { setFromUnit('kg'); setToUnit('lb'); }
                  if (u.id === 'temp') { setFromUnit('C'); setToUnit('F'); }
                  if (u.id === 'data') { setFromUnit('GB'); setToUnit('MB'); }
                }}
                className={`py-2 rounded-xl font-semibold ${unitType === u.id ? 'bg-amber-500 text-black' : 'bg-zinc-800'}`}
              >
                {u.label}
              </button>
            ))}
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={unitVal}
                onChange={(e) => setUnitVal(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-zinc-800 font-mono-num text-base outline-none"
              />
              <select value={fromUnit} onChange={(e) => setFromUnit(e.target.value)} className="px-3 py-2 rounded-xl bg-zinc-800">
                {(unitType === 'length' ? ['m', 'km', 'cm', 'mi', 'ft'] : unitType === 'weight' ? ['kg', 'g', 'lb', 'oz'] : unitType === 'temp' ? ['C', 'F', 'K'] : ['KB', 'MB', 'GB', 'TB']).map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              <span className="text-2xl font-mono-num font-bold text-amber-400">{convertUnit()}</span>
              <select value={toUnit} onChange={(e) => setToUnit(e.target.value)} className="px-3 py-2 rounded-xl bg-zinc-800">
                {(unitType === 'length' ? ['m', 'km', 'cm', 'mi', 'ft'] : unitType === 'weight' ? ['kg', 'g', 'lb', 'oz'] : unitType === 'temp' ? ['C', 'F', 'K'] : ['KB', 'MB', 'GB', 'TB']).map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {mode === 'currency' && (
        <div className="p-4 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Tỷ giá ngoại tệ trực tiếp</span>
            <button onClick={() => loadFx(fxBase)} className="p-1.5 rounded-lg bg-zinc-800">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {fxError ? (
            <div className="p-3 rounded-2xl bg-rose-500/15 text-rose-300">{fxError}</div>
          ) : (
            <div className="p-4 rounded-2xl bg-zinc-900 space-y-3">
              <div className="flex gap-2">
                <input
                  type="number"
                  value={fxAmount}
                  onChange={(e) => setFxAmount(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-zinc-800 font-mono-num text-base outline-none"
                />
                <select value={fxBase} onChange={(e) => setFxBase(e.target.value)} className="px-3 py-2 rounded-xl bg-zinc-800">
                  {['USD', 'EUR', 'JPY', 'GBP', 'KRW', 'AUD'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                <span className="text-2xl font-mono-num font-bold text-emerald-400">
                  {fxRates[fxTarget] ? (Number(fxAmount || 0) * fxRates[fxTarget]).toFixed(2) : '...'}
                </span>
                <select value={fxTarget} onChange={(e) => setFxTarget(e.target.value)} className="px-3 py-2 rounded-xl bg-zinc-800">
                  {Object.keys(fxRates).length > 0
                    ? Object.keys(fxRates).map((c) => <option key={c} value={c}>{c}</option>)
                    : ['JPY', 'EUR', 'GBP'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {fxMeta && (
                <p className="text-[10px] text-zinc-500">
                  Cập nhật {fxMeta.date} · {fxMeta.source}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
