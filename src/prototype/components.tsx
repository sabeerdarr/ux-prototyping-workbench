/**
 * Component registry: one trusted React implementation per allowlisted
 * component type. Components receive validated spec data only.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type KeyboardEvent } from "react";
import { ChevronDown, Menu as MenuIcon, X, TrendingUp, TrendingDown, Minus, CheckCircle2, AlertCircle, Loader2, Search as SearchIcon } from "lucide-react";
import type { Component, ComponentOf, ComponentType, StateKey } from "../lib/schema";
import { Icon } from "./icons";
import { useRuntime } from "./runtime";

export type Anchor = Record<string, string | undefined>;

export interface RenderProps<T extends ComponentType> {
  c: ComponentOf<T>;
  anchor: Anchor;
  renderIds: (ids: string[] | undefined) => ReactNode;
}

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

function emphasisClass(c: Component) {
  return c.style?.emphasis && c.style.emphasis !== "default" ? `pt-emph-${c.style.emphasis}` : undefined;
}
function alignClass(c: Component) {
  return c.style?.align ? `pt-align-${c.style.align}` : undefined;
}

/* ---------------- Layout ---------------- */

function Shell({ c, anchor, renderIds }: RenderProps<"shell">) {
  const rt = useRuntime();
  const [open, setOpen] = useState(false);
  const active = rt.state.activeNav ?? c.props.activeNavId ?? c.props.navItems[0]?.id;
  const nav = (
    <nav aria-label="Main" className="pt-shell-nav">
      <ul>
        {c.props.navItems.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className={cx("pt-nav-item", n.id === active && "is-active")}
              aria-current={n.id === active ? "page" : undefined}
              onClick={() => {
                rt.setNav(n.id);
                setOpen(false);
                rt.run(n.action, { sourceId: c.id, itemId: n.id });
              }}
            >
              <Icon name={n.icon} size={17} />
              <span>{n.label}</span>
              {n.badge && <span className="pt-nav-badge">{n.badge}</span>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
  const user = c.props.user && (
    <div className="pt-shell-user">
      <span className="pt-avatar" aria-hidden="true">
        {initials(c.props.user.name)}
      </span>
      <span>
        <span className="pt-shell-user-name">{c.props.user.name}</span>
        {c.props.user.role && <span className="pt-shell-user-role">{c.props.user.role}</span>}
      </span>
    </div>
  );
  return (
    <div {...anchor} className={cx("pt-shell", `pt-shell--${c.props.variant}`, open && "is-nav-open")}>
      {c.props.variant === "sidebar" && (
        <aside className="pt-shell-sidebar">
          <div className="pt-shell-brand">
            <span className="pt-brand-mark" aria-hidden="true">{c.props.brand.slice(0, 1)}</span>
            {c.props.brand}
          </div>
          {nav}
          <div className="pt-shell-sidebar-foot">{user}</div>
        </aside>
      )}
      <div className="pt-shell-body">
        <header className="pt-shell-topbar">
          <button type="button" className="pt-shell-menu-btn" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X size={18} /> : <MenuIcon size={18} />}
          </button>
          <div className="pt-shell-topbar-brand">
            <span className="pt-brand-mark" aria-hidden="true">{c.props.brand.slice(0, 1)}</span>
            {c.props.brand}
          </div>
          {c.props.variant === "topbar" && <div className="pt-shell-topnav">{nav}</div>}
          <div className="pt-shell-actions">{renderIds(c.actionIds)}</div>
          {c.props.variant === "topbar" && <div className="pt-shell-topbar-user">{user}</div>}
        </header>
        {open && <div className="pt-shell-drawer">{nav}</div>}
        <main className="pt-shell-main">{renderIds(c.children)}</main>
      </div>
    </div>
  );
}

function Stack({ c, anchor, renderIds }: RenderProps<"stack">) {
  const p = c.props;
  return (
    <div
      {...anchor}
      className={cx(
        "pt-stack",
        `pt-dir-${p.direction}`,
        `pt-gap-${p.gap ?? "md"}`,
        p.align && `pt-items-${p.align}`,
        p.wrap && "pt-wrap",
        p.padding && `pt-pad-${p.padding}`,
        p.maxWidth && `pt-maxw-${p.maxWidth}`,
        emphasisClass(c),
      )}
    >
      {renderIds(c.children)}
    </div>
  );
}

function Grid({ c, anchor, renderIds }: RenderProps<"grid">) {
  return (
    <div {...anchor} className={cx("pt-grid", `pt-cols-${c.props.columns}`, `pt-gap-${c.props.gap ?? "md"}`)}>
      {renderIds(c.children)}
    </div>
  );
}

function Split({ c, anchor, renderIds }: RenderProps<"split">) {
  return (
    <div {...anchor} className={cx("pt-split", `pt-ratio-${c.props.ratio.replace(":", "-")}`, `pt-gap-${c.props.gap ?? "lg"}`)}>
      {renderIds(c.children)}
    </div>
  );
}

function Section({ c, anchor, renderIds }: RenderProps<"section">) {
  const headingId = useId();
  return (
    <section {...anchor} className={cx("pt-section", emphasisClass(c))} aria-labelledby={c.props.title ? headingId : undefined}>
      {(c.props.title || c.actionIds?.length) && (
        <div className="pt-section-head">
          <div>
            {c.props.title && <h2 id={headingId} className="pt-section-title">{c.props.title}</h2>}
            {c.props.description && <p className="pt-muted">{c.props.description}</p>}
          </div>
          {c.actionIds?.length ? <div className="pt-head-actions">{renderIds(c.actionIds)}</div> : null}
        </div>
      )}
      <div className="pt-section-body">{renderIds(c.children)}</div>
    </section>
  );
}

function Card({ c, anchor, renderIds }: RenderProps<"card">) {
  const p = c.props;
  return (
    <div {...anchor} className={cx("pt-card", `pt-card-pad-${p.padding ?? "md"}`, emphasisClass(c), c.style?.tone && `pt-tone-${c.style.tone}`)}>
      {(p.title || p.eyebrow || c.actionIds?.length) && (
        <div className="pt-card-head">
          <div>
            {p.eyebrow && <div className="pt-eyebrow">{p.eyebrow}</div>}
            {p.title && <h3 className="pt-card-title">{p.title}</h3>}
            {p.subtitle && <p className="pt-muted pt-small">{p.subtitle}</p>}
          </div>
          {c.actionIds?.length ? <div className="pt-head-actions">{renderIds(c.actionIds)}</div> : null}
        </div>
      )}
      <div className="pt-card-body">{renderIds(c.children)}</div>
      {p.footer && <div className="pt-card-foot pt-small pt-muted">{p.footer}</div>}
    </div>
  );
}

function PageHeader({ c, anchor, renderIds }: RenderProps<"page-header">) {
  const p = c.props;
  return (
    <header {...anchor} className={cx("pt-page-header", emphasisClass(c))}>
      <div>
        {p.breadcrumbs?.length ? (
          <nav aria-label="Breadcrumb" className="pt-breadcrumbs">
            {p.breadcrumbs.map((b, i) => (
              <span key={i}>
                {i > 0 && <span aria-hidden="true"> / </span>}
                {b}
              </span>
            ))}
          </nav>
        ) : null}
        {p.eyebrow && <div className="pt-eyebrow">{p.eyebrow}</div>}
        <h1 className="pt-page-title">{p.title}</h1>
        {p.subtitle && <p className="pt-lead">{p.subtitle}</p>}
      </div>
      {c.actionIds?.length ? <div className="pt-head-actions">{renderIds(c.actionIds)}</div> : null}
    </header>
  );
}

function Tabs({ c, anchor, renderIds }: RenderProps<"tabs">) {
  const rt = useRuntime();
  const baseId = useId();
  const tabs = c.props.tabs;
  const active = rt.state.tabs[c.id] ?? c.props.defaultTabId ?? tabs[0]?.id;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + tabs.length) % tabs.length;
    rt.setTab(c.id, tabs[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div {...anchor} className="pt-tabs">
      <div role="tablist" className="pt-tablist" aria-label={c.a11y?.label ?? c.name}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${baseId}-tab-${t.id}`}
            aria-selected={t.id === active}
            aria-controls={`${baseId}-panel-${t.id}`}
            tabIndex={t.id === active ? 0 : -1}
            className={cx("pt-tab", t.id === active && "is-active")}
            onClick={() => rt.setTab(c.id, t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
            {t.badge && <span className="pt-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>
      {tabs.map((t) =>
        t.id === active ? (
          <div key={t.id} role="tabpanel" id={`${baseId}-panel-${t.id}`} aria-labelledby={`${baseId}-tab-${t.id}`} className="pt-tabpanel">
            {renderIds(t.contentIds)}
          </div>
        ) : null,
      )}
    </div>
  );
}

/* ---------------- Content ---------------- */

function Heading({ c, anchor }: RenderProps<"heading">) {
  const level = Math.min(4, Math.max(1, c.props.level));
  const Tag = (`h${level}`) as "h1" | "h2" | "h3" | "h4";
  return <Tag {...anchor} className={cx("pt-heading", `pt-h${level}`, alignClass(c), emphasisClass(c))}>{c.props.text}</Tag>;
}

function Text({ c, anchor }: RenderProps<"text">) {
  return <p {...anchor} className={cx("pt-text", `pt-text-${c.props.variant ?? "body"}`, alignClass(c))}>{c.props.text}</p>;
}

function Badge({ c, anchor }: RenderProps<"badge">) {
  return <span {...anchor} className={cx("pt-badge", `pt-tone-${c.style?.tone ?? "neutral"}`)}>{c.props.label}</span>;
}

function Alert({ c, anchor }: RenderProps<"alert">) {
  const rt = useRuntime();
  const p = c.props;
  const IconC = p.variant === "success" ? CheckCircle2 : p.variant === "info" ? null : AlertCircle;
  return (
    <div {...anchor} role={p.variant === "error" ? "alert" : "status"} className={cx("pt-alert", `pt-alert-${p.variant}`, emphasisClass(c))}>
      <span className="pt-alert-icon" aria-hidden="true">
        {IconC ? <IconC size={18} /> : <Icon name="info" size={18} />}
      </span>
      <div className="pt-alert-content">
        <div className="pt-alert-title">{p.title}</div>
        {p.body && <div className="pt-alert-body">{p.body}</div>}
        {p.actionLabel && (
          <button type="button" className="pt-btn pt-btn-sm pt-btn-secondary pt-alert-action" onClick={() => rt.run(c.action, { sourceId: c.id })}>
            {p.actionLabel}
          </button>
        )}
      </div>
      {p.dismissible && (
        <button type="button" className="pt-icon-btn" aria-label={`Dismiss: ${p.title}`} onClick={() => rt.run({ type: "dismiss", targetId: c.id }, { sourceId: c.id })}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}

function Stat({ c, anchor }: RenderProps<"stat">) {
  const p = c.props;
  const T = p.trend === "up" ? TrendingUp : p.trend === "down" ? TrendingDown : Minus;
  return (
    <div {...anchor} className={cx("pt-stat", emphasisClass(c))}>
      <div className="pt-stat-label">
        <Icon name={p.icon} size={15} />
        {p.label}
      </div>
      <div className="pt-stat-value">{p.value}</div>
      {p.delta && (
        <div className={cx("pt-stat-delta", p.trend && `pt-trend-${p.trend}`)}>
          <T size={14} aria-hidden="true" />
          {p.delta}
        </div>
      )}
      {p.helper && <div className="pt-small pt-muted">{p.helper}</div>}
    </div>
  );
}

function Progress({ c, anchor }: RenderProps<"progress">) {
  const max = c.props.max ?? 100;
  const pct = Math.round((c.props.value / max) * 100);
  return (
    <div {...anchor} className="pt-progress">
      <div className="pt-progress-head">
        <span>{c.props.label}</span>
        <span className="pt-muted">{pct}%</span>
      </div>
      <div className="pt-progress-track" role="progressbar" aria-label={c.props.label} aria-valuenow={c.props.value} aria-valuemin={0} aria-valuemax={max}>
        <div className="pt-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {c.props.helper && <div className="pt-small pt-muted">{c.props.helper}</div>}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function matches(query: string, ...fields: (string | undefined)[]) {
  const q = query.trim().toLowerCase();
  return !q || fields.some((f) => f?.toLowerCase().includes(q));
}

function List({ c, anchor }: RenderProps<"list">) {
  const rt = useRuntime();
  const removed = rt.state.removedItems[c.id] ?? [];
  const query = rt.state.search[c.id] ?? "";
  const items = c.props.items.filter((i) => !removed.includes(i.id) && matches(query, i.title, i.subtitle, i.meta));
  if (items.length === 0) return <StateBlock c={c} kind="empty" anchor={anchor} fallbackTitle={query ? `Nothing matches “${query}”` : "Nothing here yet"} />;
  return (
    <ul {...anchor} className={cx("pt-list", c.props.dividers && "pt-list-dividers", emphasisClass(c))}>
      {items.map((i) => (
        <li key={i.id} className="pt-list-item">
          {i.avatar && <span className="pt-avatar" aria-hidden="true">{i.avatar}</span>}
          <div className="pt-list-main">
            <div className="pt-list-title">{i.title}</div>
            {i.subtitle && <div className="pt-small pt-muted">{i.subtitle}</div>}
            {i.progress !== undefined && (
              <div className="pt-progress-track pt-progress-thin" role="progressbar" aria-label={`${i.title} progress`} aria-valuenow={i.progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="pt-progress-fill" style={{ width: `${i.progress}%` }} />
              </div>
            )}
          </div>
          <div className="pt-list-side">
            {i.badge && <span className={cx("pt-badge", `pt-tone-${i.badge.tone ?? "neutral"}`)}>{i.badge.label}</span>}
            {i.meta && <span className="pt-small pt-muted">{i.meta}</span>}
            <div className="pt-list-actions">
              {i.secondaryActionLabel && (
                <button type="button" className="pt-btn pt-btn-ghost pt-btn-sm" onClick={() => rt.run(i.secondaryAction, { sourceId: c.id, itemId: i.id })}>
                  {i.secondaryActionLabel}
                </button>
              )}
              {i.actionLabel && (
                <button type="button" className="pt-btn pt-btn-secondary pt-btn-sm" aria-label={`${i.actionLabel}: ${i.title}`} onClick={() => rt.run(i.action, { sourceId: c.id, itemId: i.id })}>
                  {i.actionLabel}
                </button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Table({ c, anchor }: RenderProps<"table">) {
  const rt = useRuntime();
  const p = c.props;
  const removed = rt.state.removedItems[c.id] ?? [];
  const query = rt.state.search[c.id] ?? "";
  const rows = p.rows.filter((r) => !removed.includes(r.id) && matches(query, ...r.cells.map((x) => x.value)));
  if (rows.length === 0) return <StateBlock c={c} kind="empty" anchor={anchor} fallbackTitle={query ? `Nothing matches “${query}”` : "Nothing here yet"} />;
  const cell = (row: (typeof rows)[number], key: string) => row.cells.find((x) => x.key === key);
  return (
    <div {...anchor} className={cx("pt-table-wrap", emphasisClass(c))}>
      <table className="pt-table">
        {p.caption && <caption className="pt-sr-only">{p.caption}</caption>}
        <thead>
          <tr>
            {p.columns.map((col) => (
              <th key={col.key} scope="col" className={col.align === "end" ? "pt-end" : undefined}>
                {col.label}
              </th>
            ))}
            {p.rowActions?.length ? <th scope="col"><span className="pt-sr-only">Actions</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const label = r.cells[0]?.value ?? r.id;
            return (
              <tr key={r.id}>
                {p.columns.map((col, ci) => {
                  const x = cell(r, col.key);
                  const v = x?.value ?? "—";
                  let content: ReactNode = v;
                  if (col.kind === "badge") content = <span className={cx("pt-badge", `pt-tone-${x?.tone ?? "neutral"}`)}>{v}</span>;
                  if (col.kind === "progress") {
                    const n = Math.max(0, Math.min(100, Number(v) || 0));
                    content = (
                      <span className="pt-cell-progress">
                        <span className="pt-progress-track pt-progress-thin" role="progressbar" aria-label={`${label} progress`} aria-valuenow={n} aria-valuemin={0} aria-valuemax={100}>
                          <span className="pt-progress-fill" style={{ width: `${n}%` }} />
                        </span>
                        <span className="pt-small pt-muted">{n}%</span>
                      </span>
                    );
                  }
                  const Tag = ci === 0 ? "th" : "td";
                  return (
                    <Tag key={col.key} scope={ci === 0 ? "row" : undefined} data-label={col.label} className={cx(col.align === "end" && "pt-end", ci === 0 && "pt-cell-primary")}>
                      {content}
                    </Tag>
                  );
                })}
                {p.rowActions?.length ? (
                  <td className="pt-end pt-row-actions" data-label="">
                    {p.rowActions.map((a, ai) => (
                      <button
                        key={ai}
                        type="button"
                        className={cx("pt-btn pt-btn-sm", a.tone === "danger" ? "pt-btn-danger-ghost" : "pt-btn-ghost")}
                        aria-label={`${a.label}: ${label}`}
                        onClick={() => rt.run(a.action, { sourceId: c.id, itemId: r.id })}
                      >
                        {a.label}
                      </button>
                    ))}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function KeyValue({ c, anchor }: RenderProps<"key-value">) {
  return (
    <dl {...anchor} className={cx("pt-kv", `pt-kv-cols-${c.props.columns ?? 2}`)}>
      {c.props.items.map((i, n) => (
        <div key={n} className="pt-kv-item">
          <dt className="pt-small pt-muted">{i.label}</dt>
          <dd>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Timeline({ c, anchor }: RenderProps<"timeline">) {
  return (
    <ol {...anchor} className="pt-timeline">
      {c.props.items.map((i) => (
        <li key={i.id} className={cx("pt-timeline-item", `pt-tone-${i.tone ?? "neutral"}`)}>
          <span className="pt-timeline-dot" aria-hidden="true" />
          <div>
            <div className="pt-timeline-title">{i.title}</div>
            <div className="pt-small pt-timeline-time">{i.time}</div>
            {i.body && <div className="pt-small pt-muted">{i.body}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Stepper({ c, anchor }: RenderProps<"stepper">) {
  return (
    <ol {...anchor} className={cx("pt-stepper", `pt-stepper-${c.props.orientation ?? "horizontal"}`)}>
      {c.props.steps.map((s, i) => (
        <li key={s.id} className={cx("pt-step", `is-${s.status}`)} aria-current={s.status === "current" ? "step" : undefined}>
          <span className="pt-step-marker" aria-hidden="true">
            {s.status === "complete" ? <Icon name="check" size={13} /> : i + 1}
          </span>
          <span className="pt-step-text">
            <span className="pt-step-label">{s.label}</span>
            <span className="pt-sr-only"> ({s.status})</span>
            {s.description && <span className="pt-small pt-muted pt-block">{s.description}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Chart({ c, anchor }: RenderProps<"chart">) {
  const p = c.props;
  const max = Math.max(1, ...p.series.map((s) => s.value));
  const summary = p.series.map((s) => `${s.label}: ${s.value}${p.unit ?? ""}`).join(", ");
  let body: ReactNode;
  if (p.kind === "donut") {
    const total = p.series.reduce((a, s) => a + s.value, 0) || 1;
    const offsets = p.series.map((_, i) => p.series.slice(0, i).reduce((a, s) => a + (s.value / total) * 100, 0));
    body = (
      <div className="pt-donut-wrap">
        <svg viewBox="0 0 42 42" className="pt-donut" aria-hidden="true">
          {p.series.map((s, i) => {
            const dash = (s.value / total) * 100;
            const el = <circle key={i} r="15.915" cx="21" cy="21" fill="none" strokeWidth="6" className={`pt-series-${i % 6}`} strokeDasharray={`${dash} ${100 - dash}`} strokeDashoffset={25 - offsets[i]} />;
            return el;
          })}
        </svg>
        <ul className="pt-legend">
          {p.series.map((s, i) => (
            <li key={i}>
              <span className={`pt-swatch pt-series-bg-${i % 6}`} aria-hidden="true" />
              {s.label} <span className="pt-muted">{s.value}{p.unit}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  } else if (p.kind === "line") {
    const w = 300, h = 120;
    const pts = p.series.map((s, i) => [p.series.length > 1 ? (i / (p.series.length - 1)) * w : w / 2, h - (s.value / max) * (h - 10) - 5]);
    body = (
      <div>
        <svg viewBox={`0 0 ${w} ${h}`} className="pt-line" aria-hidden="true" preserveAspectRatio="none">
          <polyline points={pts.map((x) => x.join(",")).join(" ")} fill="none" strokeWidth="2.5" className="pt-series-0" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="pt-chart-axis">{p.series.map((s, i) => <span key={i}>{s.label}</span>)}</div>
      </div>
    );
  } else {
    body = (
      <div className="pt-bars">
        {p.series.map((s, i) => (
          <div key={i} className="pt-bar-col">
            <div className="pt-bar-value pt-small">{s.value}{p.unit}</div>
            <div className="pt-bar" style={{ height: `${Math.max(4, (s.value / max) * 100)}%` }} />
            <div className="pt-small pt-muted pt-bar-label">{s.label}</div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <figure {...anchor} className="pt-chart" role="img" aria-label={`${p.title ?? "Chart"}: ${summary}`}>
      {p.title && <figcaption className="pt-chart-title">{p.title}</figcaption>}
      {body}
      {p.caption && <p className="pt-small pt-muted">{p.caption}</p>}
    </figure>
  );
}

function Checklist({ c, anchor }: RenderProps<"checklist">) {
  const [done, setDone] = useState<Record<string, boolean>>(() => Object.fromEntries(c.props.items.map((i) => [i.id, i.done])));
  const baseId = useId();
  const count = Object.values(done).filter(Boolean).length;
  return (
    <div {...anchor} className="pt-checklist">
      {c.props.title && (
        <div className="pt-checklist-head">
          <span className="pt-checklist-title">{c.props.title}</span>
          <span className="pt-small pt-muted">{count} of {c.props.items.length} done</span>
        </div>
      )}
      <ul>
        {c.props.items.map((i) => (
          <li key={i.id}>
            <input type="checkbox" id={`${baseId}-${i.id}`} checked={done[i.id] ?? false} onChange={(e) => setDone({ ...done, [i.id]: e.target.checked })} />
            <label htmlFor={`${baseId}-${i.id}`} className={cx(done[i.id] && "is-done")}>
              {i.label}
              {i.helper && <span className="pt-small pt-muted pt-block">{i.helper}</span>}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Toggle({ c, anchor }: RenderProps<"toggle">) {
  const [on, setOn] = useState(Boolean(c.props.defaultOn));
  const id = useId();
  return (
    <div {...anchor} className="pt-toggle-row">
      <div>
        <label htmlFor={id} className="pt-toggle-label">{c.props.label}</label>
        {c.props.description && <div className="pt-small pt-muted" id={`${id}-d`}>{c.props.description}</div>}
      </div>
      <button id={id} type="button" role="switch" aria-checked={on} aria-describedby={c.props.description ? `${id}-d` : undefined} className={cx("pt-switch", on && "is-on")} onClick={() => setOn(!on)}>
        <span className="pt-switch-thumb" />
      </button>
    </div>
  );
}

function Image({ c, anchor }: RenderProps<"image">) {
  return (
    <div {...anchor} role="img" aria-label={c.props.alt} className={cx("pt-image", `pt-aspect-${(c.props.aspect ?? "16:9").replace(":", "-")}`)}>
      <span className="pt-image-label">{c.props.label ?? c.props.alt}</span>
    </div>
  );
}

function Divider({ anchor }: RenderProps<"divider">) {
  return <hr {...anchor} className="pt-divider" />;
}

function Pagination({ c, anchor }: RenderProps<"pagination">) {
  const [page, setPage] = useState(c.props.page);
  return (
    <nav {...anchor} className="pt-pagination" aria-label={c.props.label ?? "Pagination"}>
      <button type="button" className="pt-btn pt-btn-ghost pt-btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
      <span className="pt-small pt-muted" aria-live="polite">Page {page} of {c.props.pageCount}</span>
      <button type="button" className="pt-btn pt-btn-ghost pt-btn-sm" disabled={page >= c.props.pageCount} onClick={() => setPage(page + 1)}>Next</button>
    </nav>
  );
}

function EmptyState({ c, anchor }: RenderProps<"empty-state">) {
  const rt = useRuntime();
  const p = c.props;
  return (
    <div {...anchor} className={cx("pt-empty", emphasisClass(c))}>
      <span className="pt-empty-icon" aria-hidden="true"><Icon name={p.icon ?? "inbox"} size={22} /></span>
      <div className="pt-empty-title">{p.title}</div>
      <p className="pt-muted pt-empty-body">{p.body}</p>
      <div className="pt-empty-actions">
        {p.actionLabel && (
          <button type="button" className="pt-btn pt-btn-primary pt-btn-md" onClick={() => rt.run(c.action, { sourceId: c.id })}>{p.actionLabel}</button>
        )}
        {p.secondaryActionLabel && (
          <button type="button" className="pt-btn pt-btn-ghost pt-btn-md" onClick={() => rt.run(p.secondaryAction, { sourceId: c.id })}>{p.secondaryActionLabel}</button>
        )}
      </div>
    </div>
  );
}

function Notice({ c, anchor }: RenderProps<"notice">) {
  return <div {...anchor} className="pt-notice" role="note">{c.props.text}</div>;
}

/* ---------------- Inputs & actions ---------------- */

function Button({ c, anchor }: RenderProps<"button">) {
  const rt = useRuntime();
  const p = c.props;
  const reasonId = useId();
  return (
    <span className={cx("pt-btn-wrap", p.fullWidth && "pt-full")}>
      <button
        {...anchor}
        type="button"
        className={cx("pt-btn", `pt-btn-${p.variant}`, `pt-btn-${p.size ?? "md"}`, p.fullWidth && "pt-full", emphasisClass(c))}
        disabled={p.disabled}
        aria-label={c.a11y?.label}
        aria-describedby={p.disabled && p.disabledReason ? reasonId : c.a11y?.description ? `${reasonId}-d` : undefined}
        onClick={() => rt.run(c.action, { sourceId: c.id })}
      >
        {p.icon && p.icon !== "arrow-right" && <Icon name={p.icon} size={p.size === "lg" ? 18 : 16} />}
        {p.label}
        {p.icon === "arrow-right" && <Icon name="arrow-right" size={p.size === "lg" ? 18 : 16} />}
      </button>
      {p.disabled && p.disabledReason && <span id={reasonId} className="pt-small pt-muted pt-block">{p.disabledReason}</span>}
      {c.a11y?.description && <span id={`${reasonId}-d`} className="pt-sr-only">{c.a11y.description}</span>}
    </span>
  );
}

function Menu({ c, anchor }: RenderProps<"menu">) {
  const rt = useRuntime();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    itemRefs.current[0]?.focus();
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key === "Escape") {
      setOpen(false);
      (ref.current?.querySelector("[aria-haspopup]") as HTMLElement | null)?.focus();
    }
    const dir = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (dir) {
      e.preventDefault();
      itemRefs.current[(i + dir + c.props.items.length) % c.props.items.length]?.focus();
    }
  };
  const iconOnly = Boolean(c.props.icon);
  return (
    <div className="pt-menu" ref={ref}>
      <button
        {...anchor}
        type="button"
        className={cx("pt-btn pt-btn-md", iconOnly ? "pt-btn-ghost pt-btn-icon" : "pt-btn-secondary")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={c.a11y?.label ?? (iconOnly ? c.props.label : undefined)}
        onClick={() => setOpen(!open)}
      >
        {iconOnly ? <Icon name={c.props.icon} size={18} /> : <>{c.props.label}<ChevronDown size={15} aria-hidden="true" /></>}
      </button>
      {open && (
        <div role="menu" id={menuId} className="pt-menu-list">
          {c.props.items.map((it, i) => (
            <button
              key={it.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              role="menuitem"
              type="button"
              className={cx("pt-menu-item", it.tone === "danger" && "is-danger")}
              onKeyDown={(e) => onKey(e, i)}
              onClick={() => {
                setOpen(false);
                rt.run(it.action, { sourceId: c.id, itemId: it.id });
              }}
            >
              <Icon name={it.icon} size={15} />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchBox({ c, anchor }: RenderProps<"search">) {
  const rt = useRuntime();
  const id = useId();
  const target = c.props.targetId;
  const [local, setLocal] = useState("");
  const value = target ? (rt.state.search[target] ?? "") : local;
  const [filter, setFilter] = useState<string | null>(null);
  return (
    <div {...anchor} className="pt-search">
      <label htmlFor={id} className={c.props.label ? "pt-field-label" : "pt-sr-only"}>{c.props.label ?? c.props.placeholder}</label>
      <div className="pt-search-box">
        <SearchIcon size={16} aria-hidden="true" />
        <input
          id={id}
          type="search"
          className="pt-input"
          placeholder={c.props.placeholder}
          value={value}
          onChange={(e) => (target ? rt.setSearch(target, e.target.value) : setLocal(e.target.value))}
        />
      </div>
      {c.props.filters?.length ? (
        <div className="pt-chips" role="group" aria-label="Filters">
          {c.props.filters.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} className={cx("pt-chip", filter === f.id && "is-on")} onClick={() => setFilter(filter === f.id ? null : f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type FormPhase = "idle" | "submitting" | "success" | "error";

function Form({ c, anchor }: RenderProps<"form">) {
  const rt = useRuntime();
  const p = c.props;
  const baseId = useId();
  const initialValues = useMemo(() => Object.fromEntries(p.fields.map((f) => [f.name, f.defaultValue ?? ""])), [p.fields]);
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<FormPhase>("idle");
  const [attempt, setAttempt] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const forced = rt.effectiveState(c);
  const shown: FormPhase = forced === "error" ? "error" : forced === "success" ? "success" : forced === "loading" ? "submitting" : phase;

  const validate = () => {
    const e: Record<string, string> = {};
    for (const f of p.fields) {
      const v = (values[f.name] ?? "").trim();
      if (f.required && (!v || v === "false")) e[f.name] = f.validationMessage ?? `${f.label} is required.`;
      else if (v && f.type === "email" && !/^\S+@\S+\.\S+$/.test(v)) e[f.name] = f.validationMessage ?? "Enter an email address like name@example.org.";
      else if (v && f.minLength && v.length < f.minLength) e[f.name] = f.validationMessage ?? `Use at least ${f.minLength} characters.`;
    }
    return e;
  };

  const submit = (isRetry: boolean) => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      setTimeout(() => summaryRef.current?.focus(), 0);
      return;
    }
    setPhase("submitting");
    const fail = p.submitOutcome === "error" && !isRetry && attempt === 0;
    setTimeout(() => {
      setAttempt((a) => a + 1);
      setPhase(fail ? "error" : "success");
    }, 1100);
  };

  if (shown === "success") {
    return (
      <div {...anchor} className="pt-form-result pt-form-success" role="status">
        <CheckCircle2 size={22} aria-hidden="true" />
        <div>
          <div className="pt-alert-title">{p.successTitle ?? c.states?.success?.title ?? "Done"}</div>
          <p className="pt-muted">{p.successMessage ?? c.states?.success?.body}</p>
          <button
            type="button"
            className="pt-btn pt-btn-ghost pt-btn-sm"
            onClick={() => {
              rt.setComponentState(c.id, null);
              setValues(initialValues);
              setAttempt(0);
              setPhase("idle");
            }}
          >
            {c.states?.success?.actionLabel ?? "Start over"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      {...anchor}
      className={cx("pt-form", p.layout === "two-column" && "pt-form-2col", emphasisClass(c))}
      noValidate
      aria-busy={shown === "submitting"}
      onSubmit={(e) => {
        e.preventDefault();
        rt.setComponentState(c.id, null);
        submit(false);
      }}
    >
      {p.title && <h3 className="pt-card-title">{p.title}</h3>}
      {p.description && <p className="pt-muted pt-small">{p.description}</p>}
      {shown === "error" && (
        <div className="pt-alert pt-alert-error" role="alert">
          <span className="pt-alert-icon" aria-hidden="true"><AlertCircle size={18} /></span>
          <div className="pt-alert-content">
            <div className="pt-alert-title">{p.errorTitle ?? c.states?.error?.title ?? "Something went wrong"}</div>
            <div className="pt-alert-body">{p.errorMessage ?? c.states?.error?.body}</div>
            <button
              type="button"
              className="pt-btn pt-btn-sm pt-btn-secondary pt-alert-action"
              onClick={() => {
                rt.setComponentState(c.id, null);
                submit(true);
              }}
            >
              {p.retryLabel ?? "Try again"}
            </button>
          </div>
        </div>
      )}
      {Object.keys(errors).length > 0 && (
        <div className="pt-error-summary" tabIndex={-1} ref={summaryRef} role="alert">
          {Object.keys(errors).length === 1 ? "One field needs attention." : `${Object.keys(errors).length} fields need attention.`}
        </div>
      )}
      <div className="pt-form-fields">
        {p.fields.map((f) => {
          const id = `${baseId}-${f.name}`;
          const err = errors[f.name];
          const describedBy = [f.helpText && `${id}-help`, err && `${id}-err`].filter(Boolean).join(" ") || undefined;
          const common = {
            id,
            name: f.name,
            "aria-invalid": err ? true : undefined,
            "aria-describedby": describedBy,
            "aria-required": f.required || undefined,
            disabled: shown === "submitting",
          };
          const set = (v: string) => {
            setValues({ ...values, [f.name]: v });
            if (err) setErrors((prev) => ({ ...prev, [f.name]: "" }));
          };
          let control: ReactNode;
          if (f.type === "textarea") control = <textarea {...common} className="pt-input pt-textarea" placeholder={f.placeholder} value={values[f.name]} onChange={(e) => set(e.target.value)} />;
          else if (f.type === "select")
            control = (
              <select {...common} className="pt-input" value={values[f.name]} onChange={(e) => set(e.target.value)}>
                <option value="">{f.placeholder ?? "Choose…"}</option>
                {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            );
          else if (f.type === "checkbox")
            return (
              <div key={f.name} className="pt-field pt-field-check">
                <input {...common} type="checkbox" checked={values[f.name] === "true"} onChange={(e) => set(String(e.target.checked))} />
                <label htmlFor={id}>{f.label}{f.required && <span className="pt-req" aria-hidden="true"> *</span>}</label>
                {f.helpText && <div id={`${id}-help`} className="pt-small pt-muted">{f.helpText}</div>}
                {err && <div id={`${id}-err`} className="pt-field-error">{err}</div>}
              </div>
            );
          else if (f.type === "radio")
            return (
              <fieldset key={f.name} className="pt-field" aria-describedby={describedBy}>
                <legend className="pt-field-label">{f.label}{f.required && <span className="pt-req" aria-hidden="true"> *</span>}</legend>
                {(f.options ?? []).map((o) => (
                  <label key={o} className="pt-radio">
                    <input type="radio" name={`${baseId}-${f.name}`} value={o} checked={values[f.name] === o} disabled={shown === "submitting"} onChange={() => set(o)} />
                    {o}
                  </label>
                ))}
                {f.helpText && <div id={`${id}-help`} className="pt-small pt-muted">{f.helpText}</div>}
                {err && <div id={`${id}-err`} className="pt-field-error">{err}</div>}
              </fieldset>
            );
          else control = <input {...common} type={f.type} className="pt-input" placeholder={f.placeholder} value={values[f.name]} onChange={(e) => set(e.target.value)} />;
          return (
            <div key={f.name} className={cx("pt-field", f.type === "textarea" && "pt-span-2")}>
              <label htmlFor={id} className="pt-field-label">
                {f.label}
                {f.required ? <span className="pt-req" aria-hidden="true"> *</span> : <span className="pt-optional"> (optional)</span>}
              </label>
              {control}
              {f.helpText && <div id={`${id}-help`} className="pt-small pt-muted">{f.helpText}</div>}
              {err && <div id={`${id}-err`} className="pt-field-error">{err}</div>}
            </div>
          );
        })}
      </div>
      <div className="pt-form-actions">
        <button type="submit" className="pt-btn pt-btn-primary pt-btn-md" disabled={shown === "submitting"}>
          {shown === "submitting" && <Loader2 size={16} className="pt-spin" aria-hidden="true" />}
          {shown === "submitting" ? (p.submittingLabel ?? "Working…") : p.submitLabel}
        </button>
        {p.cancelLabel && (
          <button
            type="button"
            className="pt-btn pt-btn-ghost pt-btn-md"
            onClick={() => {
              setValues(initialValues);
              setErrors({});
              setPhase("idle");
            }}
          >
            {p.cancelLabel}
          </button>
        )}
      </div>
    </form>
  );
}

/** Modal dialog; rendered by the renderer's overlay layer, not inline. */
export function DialogView({ c, anchor, renderIds }: RenderProps<"dialog">) {
  const rt = useRuntime();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const ctx = rt.state.dialog?.context;
  useEffect(() => {
    const el = ref.current;
    const prev = document.activeElement as HTMLElement | null;
    el?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") rt.closeDialog();
      if (e.key === "Tab" && el) {
        const f = el.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])");
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const danger = c.props.tone === "danger";
  return (
    <div className="pt-overlay" onMouseDown={(e) => e.target === e.currentTarget && rt.closeDialog()}>
      <div {...anchor} ref={ref} role={danger ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby={titleId} className="pt-dialog">
        <h2 id={titleId} className="pt-dialog-title">{c.props.title}</h2>
        <p className="pt-dialog-body">{c.props.body}</p>
        {c.children?.length ? <div className="pt-dialog-content">{renderIds(c.children)}</div> : null}
        <div className="pt-dialog-actions">
          <button type="button" className="pt-btn pt-btn-ghost pt-btn-md" data-autofocus={danger ? "" : undefined} onClick={() => rt.closeDialog()}>
            {c.props.cancelLabel}
          </button>
          <button
            type="button"
            className={cx("pt-btn pt-btn-md", danger ? "pt-btn-danger" : "pt-btn-primary")}
            data-autofocus={danger ? undefined : ""}
            onClick={() => {
              rt.closeDialog();
              rt.run(c.props.confirmAction, ctx ?? { sourceId: c.id });
            }}
          >
            {c.props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- States ---------------- */

export function StateBlock({ c, kind, anchor, fallbackTitle }: { c: Component; kind: Exclude<StateKey, "populated" | "loading">; anchor: Anchor; fallbackTitle?: string }) {
  const rt = useRuntime();
  const content = c.states?.[kind];
  const IconC = kind === "error" ? AlertCircle : kind === "success" ? CheckCircle2 : null;
  return (
    <div {...anchor} className={cx("pt-state", `pt-state-${kind}`)} role={kind === "error" ? "alert" : "status"}>
      <span className="pt-empty-icon" aria-hidden="true">{IconC ? <IconC size={22} /> : <Icon name="inbox" size={22} />}</span>
      <div className="pt-empty-title">{content?.title ?? fallbackTitle ?? "Nothing here yet"}</div>
      {content?.body && <p className="pt-muted pt-empty-body">{content.body}</p>}
      {content?.actionLabel && (
        <button type="button" className="pt-btn pt-btn-secondary pt-btn-md" onClick={() => rt.run(content.action ?? { type: "reset-state", targetId: c.id }, { sourceId: c.id })}>
          {content.actionLabel}
        </button>
      )}
    </div>
  );
}

export function LoadingBlock({ c, anchor }: { c: Component; anchor: Anchor }) {
  const label = c.states?.loading?.label ?? `Loading ${c.name.toLowerCase()}`;
  return (
    <div {...anchor} className="pt-loading" role="status" aria-live="polite">
      <span className="pt-sr-only">{label}</span>
      <div className="pt-loading-head">
        <Loader2 size={15} className="pt-spin" aria-hidden="true" />
        <span className="pt-small pt-muted">{label}</span>
      </div>
      <div className="pt-skeleton" style={{ width: "92%" }} />
      <div className="pt-skeleton" style={{ width: "78%" }} />
      <div className="pt-skeleton" style={{ width: "85%" }} />
    </div>
  );
}

/* ---------------- Registry ---------------- */

export const REGISTRY: { [K in ComponentType]: (p: RenderProps<K>) => ReactNode } = {
  shell: Shell,
  stack: Stack,
  grid: Grid,
  split: Split,
  section: Section,
  card: Card,
  "page-header": PageHeader,
  heading: Heading,
  text: Text,
  badge: Badge,
  alert: Alert,
  stat: Stat,
  progress: Progress,
  list: List,
  table: Table,
  tabs: Tabs,
  button: Button,
  menu: Menu,
  form: Form,
  search: SearchBox,
  dialog: () => null, // dialogs render in the overlay layer
  "empty-state": EmptyState,
  stepper: Stepper,
  chart: Chart,
  checklist: Checklist,
  toggle: Toggle,
  "key-value": KeyValue,
  timeline: Timeline,
  image: Image,
  divider: Divider,
  pagination: Pagination,
  notice: Notice,
};
