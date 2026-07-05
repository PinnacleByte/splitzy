"use client";

export function DateField({
  value,
  onChange,
  min,
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
}) {
  return (
    <input
      type="date"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 rounded-xl bg-surface-2 px-3 py-2 text-sm font-bold outline-none"
    />
  );
}

export function PriceInput({
  value,
  onChange,
  placeholder = "0.00",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-3xl font-black text-muted">$</span>
      <input
        autoFocus={autoFocus}
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        className="w-44 bg-transparent text-center text-4xl font-black tracking-tight outline-none placeholder:text-border"
      />
    </div>
  );
}
