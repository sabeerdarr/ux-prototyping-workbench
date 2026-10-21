"use client";
/**
 * Small workbench UI kit in the shadcn/ui style: Tailwind-styled primitives
 * owned by this repo rather than a dependency.
 */
import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type ReactNode, type TextareaHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { clsx } from "clsx";
import { X } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "xs" | "sm" | "md";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: ReactNode }>(
  function Button({ variant = "secondary", size = "sm", icon, className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={clsx(
          "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wb-accent disabled:cursor-not-allowed disabled:opacity-50",
          size === "xs" && "h-6 px-2 text-[11.5px]",
          size === "sm" && "h-7 px-2.5 text-[12.5px]",
          size === "md" && "h-9 px-3.5 text-[13px]",
          variant === "primary" && "bg-wb-ink text-white hover:bg-black shadow-sm",
          variant === "accent" && "bg-wb-accent text-white hover:bg-[#2f4be0] shadow-sm",
          variant === "secondary" && "border border-wb-line-strong bg-white text-wb-ink hover:bg-[#f6f6f3] shadow-[0_1px_0_rgb(0_0_0/0.03)]",
          variant === "ghost" && "text-wb-ink-2 hover:bg-black/5 hover:text-wb-ink",
          variant === "danger" && "text-red-700 hover:bg-red-50",
          className,
        )}
        {...rest}
      >
        {icon}
        {children}
      </button>
    );
  },
);

export function IconButton({ label, children, className, active, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={clsx(
        "inline-grid h-7 w-7 place-items-center rounded-md text-wb-ink-2 transition-colors hover:bg-black/5 hover:text-wb-ink",
        "focus-visible:outline-2 focus-visible:outline-wb-accent disabled:cursor-not-allowed disabled:opacity-40",
        active && "bg-black/[0.07] text-wb-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={clsx(
        "block w-full resize-y rounded-md border border-wb-line-strong bg-white px-2.5 py-2 text-[13px] leading-relaxed text-wb-ink placeholder:text-wb-ink-3",
        "focus:border-wb-accent focus:ring-3 focus:ring-wb-accent/15 focus:outline-none aria-[invalid=true]:border-red-500",
        className,
      )}
      {...rest}
    />
  );
});

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "block h-8 w-full rounded-md border border-wb-line-strong bg-white px-2.5 text-[13px] text-wb-ink placeholder:text-wb-ink-3",
        "focus:border-wb-accent focus:ring-3 focus:ring-wb-accent/15 focus:outline-none",
        className,
      )}
      {...rest}
    />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        "block h-8 w-full rounded-md border border-wb-line-strong bg-white px-2 text-[13px] text-wb-ink focus:border-wb-accent focus:ring-3 focus:ring-wb-accent/15 focus:outline-none",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Label({ htmlFor, children, hint, required }: { htmlFor?: string; children: ReactNode; hint?: ReactNode; required?: boolean }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="text-[12px] font-semibold text-wb-ink">
        {children}
        {required && <span className="ml-0.5 text-wb-ink-3">*</span>}
      </label>
      {hint && <span className="text-[11px] text-wb-ink-3">{hint}</span>}
    </div>
  );
}

export function Pill({ tone = "neutral", children, className, title }: { tone?: "neutral" | "accent" | "changed" | "green" | "amber" | "violet" | "red"; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-semibold whitespace-nowrap",
        tone === "neutral" && "bg-black/[0.06] text-wb-ink-2",
        tone === "accent" && "bg-wb-accent-soft text-wb-accent",
        tone === "changed" && "bg-wb-changed-soft text-[#9a5b00]",
        tone === "green" && "bg-emerald-50 text-emerald-700",
        tone === "amber" && "bg-amber-50 text-amber-800",
        tone === "violet" && "bg-violet-50 text-violet-700",
        tone === "red" && "bg-red-50 text-red-700",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, size = "sm" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string }[]; label: string; size?: "sm" | "xs" }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md bg-black/[0.055] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={clsx(
            "inline-flex items-center gap-1 rounded-[5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-wb-accent",
            size === "sm" ? "h-6 px-2 text-[12px]" : "h-5 px-1.5 text-[11px]",
            value === o.value ? "bg-white text-wb-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "text-wb-ink-2 hover:text-wb-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/30 p-4 backdrop-blur-[1px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={clsx("flex max-h-[min(860px,calc(100vh-32px))] w-full flex-col rounded-xl bg-white shadow-2xl outline-none", wide ? "max-w-[1400px]" : "max-w-lg")}
      >
        <div className="flex items-center justify-between border-b border-wb-line px-4 py-3">
          <div className="text-[14px] font-semibold">{title}</div>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="wb-scroll min-h-0 flex-1 overflow-auto">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-wb-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={clsx("inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent", className)} aria-hidden="true" />;
}
