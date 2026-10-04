"use client";

export async function api(url, method = "GET", body) {
  const response = await fetch(url, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error ?? `Request failed (${response.status}).`);
  return data;
}

const TONES = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  green: "bg-emerald-50 text-emerald-800 border-emerald-200",
  red: "bg-red-50 text-red-800 border-red-200",
  amber: "bg-amber-50 text-amber-900 border-amber-200",
  blue: "bg-sky-50 text-sky-800 border-sky-200",
};

export function Badge({ tone = "neutral", children }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "secondary",
  type = "button",
}) {
  const styles = {
    primary: "bg-slate-900 text-white border-slate-900 hover:bg-slate-700",
    secondary: "bg-white text-slate-800 border-slate-300 hover:bg-slate-50",
    danger: "bg-white text-red-700 border-red-200 hover:bg-red-50",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}

export function Card({ title, children, aside }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      {(title || aside) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && (
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          )}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function ErrorNote({ message }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      {message}
    </p>
  );
}

export const formatDate = (iso) => new Date(iso).toLocaleString();
