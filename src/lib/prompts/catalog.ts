/**
 * Human-readable description of the component registry, given to the model
 * alongside the JSON schema. Keep in sync with src/lib/schema.ts.
 */
export const ICON_NAMES = [
  "home", "inbox", "calendar", "clock", "file", "folder", "search", "settings", "user", "users",
  "bell", "chart", "dollar", "heart", "star", "check", "alert", "info", "plus", "edit", "trash",
  "download", "upload", "filter", "arrow-right", "external", "mail", "phone", "map", "lock",
  "sparkles", "book", "flag", "target", "gift", "layers", "message", "shield", "zap", "briefcase",
] as const;

export const COMPONENT_CATALOG = `
COMPONENT CATALOG (the only allowed "type" values; every component also has the shared fields)

Shared fields on every component:
  id (stable kebab-case, unique, descriptive e.g. "deadline-list", "primary-cta")
  name (short label for designers, e.g. "Primary CTA")
  props (type-specific, below)
  children?: string[]        ids rendered inside containers, in order
  actionIds?: string[]       ids of buttons/menus rendered in a header action slot (section, card, page-header, shell top bar)
  action?: Action            what happens on click (button, alert action, empty-state primary action)
  states?: { empty?, loading?, error?, success? }   alternative content; empty/error/success = { title, body?, actionLabel?, action? }, loading = { label? }
  defaultState?: "populated" | "empty" | "loading" | "error" | "success"   (omit for populated)
  style?: { emphasis?: "low"|"default"|"high", tone?: Tone, align?: "start"|"center"|"end" }
  a11y?: { label?, description? }   accessible name/description when visible text is not enough

Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info"
Action = { type, targetId?, tabId?, state?, thenState?, delayMs?, message? } where type is one of:
  "open-dialog" (targetId = dialog id) | "close-dialog" | "toast" (message) | "switch-tab" (targetId = tabs id, tabId)
  "set-state" (targetId, state, optional thenState after delayMs — e.g. retry: loading then populated)
  "navigate" (message = where it goes; the prototype is one screen so this shows a toast)
  "dismiss" (targetId optional, hides that component) | "remove-item" (targetId = list/table id; removes the clicked row/item)
  "reset-state" (targetId) | "none"

Layout & containers:
  shell        { variant: "sidebar"|"topbar", brand, navItems: [{id,label,icon?,badge?,action?}], activeNavId?, user?: {name, role?} }  children = main content; actionIds = top bar actions
  stack        { direction: "vertical"|"horizontal", gap?: Gap, align?: "start"|"center"|"end"|"stretch"|"between", wrap?, padding?: "none"|"sm"|"md"|"lg", maxWidth?: "sm"|"md"|"lg"|"xl"|"full" }
  grid         { columns: 1-4, gap?: Gap }   collapses to fewer columns on narrow screens
  split        { ratio: "1:1"|"2:1"|"1:2"|"3:1"|"1:3", gap?: Gap }   two-column layout that stacks on mobile
  section      { title?, description? }   children; actionIds in header
  card         { title?, subtitle?, eyebrow?, footer?, padding?: "sm"|"md"|"lg" }   children; actionIds in header
  page-header  { title, subtitle?, eyebrow?, breadcrumbs?: string[] }   actionIds on the right
  tabs         { tabs: [{id, label, badge?, contentIds: string[]}], defaultTabId? }
  dialog       { title, body, confirmLabel, cancelLabel, tone?: "default"|"danger", confirmAction?: Action }   modal; NOT placed in children — opened via an "open-dialog" action. Optional children render under the body.
  Gap = "none"|"xs"|"sm"|"md"|"lg"|"xl"

Content:
  heading      { text, level: 1-4 }
  text         { text, variant?: "body"|"muted"|"small"|"lead" }
  badge        { label }  (use style.tone)
  alert        { variant: "info"|"success"|"warning"|"error", title, body?, dismissible?, actionLabel? }  + action
  stat         { label, value, delta?, trend?: "up"|"down"|"flat", helper?, icon? }
  progress     { label, value, max?, helper? }
  list         { items: [{id, title, subtitle?, meta?, badge?: {label, tone?}, avatar? (initials), progress? (0-100), actionLabel?, action?, secondaryActionLabel?, secondaryAction?}], dividers? }
  table        { caption?, columns: [{key, label, align?: "start"|"end", kind?: "text"|"badge"|"date"|"currency"|"progress"}], rows: [{id, cells: [{key, value, tone?}]}], rowActions?: [{label, tone?: "default"|"danger", action}], searchPlaceholder? }
               (progress cells hold "0"-"100"; badge cells use tone)
  key-value    { items: [{label, value}], columns?: 1-3 }
  timeline     { items: [{id, title, time, body?, tone?}] }
  stepper      { steps: [{id, label, description?, status: "complete"|"current"|"upcoming"}], orientation?: "horizontal"|"vertical" }
  chart        { kind: "bar"|"line"|"donut", title?, unit?, caption?, series: [{label, value}] }
  checklist    { title?, items: [{id, label, done, helper?}] }  (users can tick items)
  image        { alt, label?, aspect?: "16:9"|"4:3"|"1:1"|"3:1" }  renders an illustrative placeholder; alt must describe intended content
  divider      {}
  pagination   { page, pageCount, label? }
  empty-state  { title, body, icon?, actionLabel?, secondaryActionLabel?, secondaryAction? }  + action

Inputs & actions:
  button       { label, variant: "primary"|"secondary"|"ghost"|"danger"|"link", size?: "sm"|"md"|"lg", icon?, fullWidth?, disabled?, disabledReason? }  + action
  menu         { label, icon?, items: [{id, label, icon?, tone?: "default"|"danger", action}] }  dropdown menu
  search       { label?, placeholder, targetId? (list or table it filters live), filters?: [{id, label}] }
  form         { title?, description?, fields: [{name, label, type: "text"|"email"|"number"|"textarea"|"select"|"checkbox"|"date"|"radio", placeholder?, helpText?, required?, options?, defaultValue?, validationMessage?, minLength?}],
                 layout?: "single"|"two-column", submitLabel, submittingLabel?, cancelLabel?, submitOutcome: "success"|"error",
                 successTitle?, successMessage?, errorTitle?, errorMessage?, retryLabel? }
               Validation runs on submit; then the prototype simulates the chosen outcome. Error retry always succeeds.
  toggle       { label, description?, defaultOn? }

Allowed icon names: ${ICON_NAMES.join(", ")}.
`.trim();
