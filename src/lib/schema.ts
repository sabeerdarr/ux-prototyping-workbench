/**
 * Screen specification contract.
 *
 * The AI never produces code that runs in the app. It produces a ScreenSpec:
 * a flat list of allowlisted components (each with a stable id), referenced
 * from `rootIds` and from container `children`. The prototype renderer maps
 * each component type to a predefined React component.
 *
 * The schemas avoid refinements (regex, min/max) so they translate cleanly to
 * JSON Schema for structured outputs; `normalizeSpec` in spec-ops.ts clamps
 * and sanitizes values after validation instead.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Shared primitives                                                   */
/* ------------------------------------------------------------------ */

export const STATE_KEYS = ["populated", "empty", "loading", "error", "success"] as const;
export const StateKey = z.enum(STATE_KEYS);
export type StateKey = z.infer<typeof StateKey>;

export const Tone = z.enum(["neutral", "brand", "success", "warning", "danger", "info"]);
export type Tone = z.infer<typeof Tone>;

export const ACTION_TYPES = [
  "none",
  "open-dialog",
  "close-dialog",
  "toast",
  "switch-tab",
  "set-state",
  "navigate",
  "dismiss",
  "remove-item",
  "reset-state",
] as const;

/**
 * Interactions are data, not code. The runtime implements each action type.
 * - open-dialog / close-dialog: targetId = dialog component id
 * - toast: message
 * - switch-tab: targetId = tabs component id, tabId = tab id
 * - set-state: targetId = component id, state (+ optional thenState after delayMs)
 * - navigate: message describes the destination (prototype is a single screen)
 * - dismiss: targetId = component to hide (defaults to the source component)
 * - remove-item: targetId = list/table id; the item comes from the click context
 * - reset-state: targetId = component to return to its default state
 */
export const Action = z.object({
  type: z.enum(ACTION_TYPES),
  targetId: z.string().optional(),
  tabId: z.string().optional(),
  state: StateKey.optional(),
  thenState: StateKey.optional(),
  delayMs: z.number().optional(),
  message: z.string().optional(),
});
export type Action = z.infer<typeof Action>;

const StateContent = z.object({
  title: z.string(),
  body: z.string().optional(),
  actionLabel: z.string().optional(),
  action: Action.optional(),
});

/** Alternative content a component shows in a non-populated state. */
export const ComponentStates = z.object({
  empty: StateContent.optional(),
  loading: z.object({ label: z.string().optional() }).optional(),
  error: StateContent.optional(),
  success: StateContent.optional(),
});
export type ComponentStates = z.infer<typeof ComponentStates>;

const Style = z.object({
  emphasis: z.enum(["low", "default", "high"]).optional(),
  tone: Tone.optional(),
  align: z.enum(["start", "center", "end"]).optional(),
});

const A11y = z.object({
  label: z.string().optional(),
  description: z.string().optional(),
});

const Gap = z.enum(["none", "xs", "sm", "md", "lg", "xl"]);

/** Fields every component shares. */
const base = {
  id: z.string(),
  name: z.string().describe("Short human-readable label shown in the inspector, e.g. 'Primary CTA'"),
  children: z.array(z.string()).optional(),
  actionIds: z.array(z.string()).optional(),
  action: Action.optional(),
  states: ComponentStates.optional(),
  defaultState: StateKey.optional(),
  style: Style.optional(),
  a11y: A11y.optional(),
  annotationIds: z.array(z.string()).optional(),
};

const ItemBadge = z.object({ label: z.string(), tone: Tone.optional() });

/* ------------------------------------------------------------------ */
/* Component registry contract                                         */
/* ------------------------------------------------------------------ */

const NavItem = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string().optional(),
  badge: z.string().optional(),
  action: Action.optional(),
});

export const ShellComponent = z.object({
  ...base,
  type: z.literal("shell"),
  props: z.object({
    variant: z.enum(["sidebar", "topbar"]),
    brand: z.string(),
    navItems: z.array(NavItem),
    activeNavId: z.string().optional(),
    user: z.object({ name: z.string(), role: z.string().optional() }).optional(),
  }),
});

export const StackComponent = z.object({
  ...base,
  type: z.literal("stack"),
  props: z.object({
    direction: z.enum(["vertical", "horizontal"]),
    gap: Gap.optional(),
    align: z.enum(["start", "center", "end", "stretch", "between"]).optional(),
    wrap: z.boolean().optional(),
    padding: z.enum(["none", "sm", "md", "lg"]).optional(),
    maxWidth: z.enum(["sm", "md", "lg", "xl", "full"]).optional(),
  }),
});

export const GridComponent = z.object({
  ...base,
  type: z.literal("grid"),
  props: z.object({
    columns: z.number(),
    gap: Gap.optional(),
  }),
});

export const SplitComponent = z.object({
  ...base,
  type: z.literal("split"),
  props: z.object({
    ratio: z.enum(["1:1", "2:1", "1:2", "3:1", "1:3"]),
    gap: Gap.optional(),
  }),
});

export const SectionComponent = z.object({
  ...base,
  type: z.literal("section"),
  props: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
  }),
});

export const CardComponent = z.object({
  ...base,
  type: z.literal("card"),
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    eyebrow: z.string().optional(),
    footer: z.string().optional(),
    padding: z.enum(["sm", "md", "lg"]).optional(),
  }),
});

export const PageHeaderComponent = z.object({
  ...base,
  type: z.literal("page-header"),
  props: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    eyebrow: z.string().optional(),
    breadcrumbs: z.array(z.string()).optional(),
  }),
});

export const HeadingComponent = z.object({
  ...base,
  type: z.literal("heading"),
  props: z.object({ text: z.string(), level: z.number() }),
});

export const TextComponent = z.object({
  ...base,
  type: z.literal("text"),
  props: z.object({
    text: z.string(),
    variant: z.enum(["body", "muted", "small", "lead"]).optional(),
  }),
});

export const BadgeComponent = z.object({
  ...base,
  type: z.literal("badge"),
  props: z.object({ label: z.string() }),
});

export const AlertComponent = z.object({
  ...base,
  type: z.literal("alert"),
  props: z.object({
    variant: z.enum(["info", "success", "warning", "error"]),
    title: z.string(),
    body: z.string().optional(),
    dismissible: z.boolean().optional(),
    actionLabel: z.string().optional(),
  }),
});

export const StatComponent = z.object({
  ...base,
  type: z.literal("stat"),
  props: z.object({
    label: z.string(),
    value: z.string(),
    delta: z.string().optional(),
    trend: z.enum(["up", "down", "flat"]).optional(),
    helper: z.string().optional(),
    icon: z.string().optional(),
  }),
});

export const ProgressComponent = z.object({
  ...base,
  type: z.literal("progress"),
  props: z.object({
    label: z.string(),
    value: z.number(),
    max: z.number().optional(),
    helper: z.string().optional(),
  }),
});

const ListItem = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  meta: z.string().optional(),
  badge: ItemBadge.optional(),
  avatar: z.string().optional().describe("1-2 letter initials"),
  progress: z.number().optional().describe("0-100"),
  actionLabel: z.string().optional(),
  action: Action.optional(),
  secondaryActionLabel: z.string().optional(),
  secondaryAction: Action.optional(),
});

export const ListComponent = z.object({
  ...base,
  type: z.literal("list"),
  props: z.object({
    items: z.array(ListItem),
    dividers: z.boolean().optional(),
  }),
});

const TableColumn = z.object({
  key: z.string(),
  label: z.string(),
  align: z.enum(["start", "end"]).optional(),
  kind: z.enum(["text", "badge", "date", "currency", "progress"]).optional(),
});

const TableRow = z.object({
  id: z.string(),
  cells: z.array(z.object({ key: z.string(), value: z.string(), tone: Tone.optional() })),
});

const RowAction = z.object({
  label: z.string(),
  tone: z.enum(["default", "danger"]).optional(),
  action: Action,
});

export const TableComponent = z.object({
  ...base,
  type: z.literal("table"),
  props: z.object({
    caption: z.string().optional(),
    columns: z.array(TableColumn),
    rows: z.array(TableRow),
    rowActions: z.array(RowAction).optional(),
    searchPlaceholder: z.string().optional(),
  }),
});

export const TabsComponent = z.object({
  ...base,
  type: z.literal("tabs"),
  props: z.object({
    tabs: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        badge: z.string().optional(),
        contentIds: z.array(z.string()),
      }),
    ),
    defaultTabId: z.string().optional(),
  }),
});

export const ButtonComponent = z.object({
  ...base,
  type: z.literal("button"),
  props: z.object({
    label: z.string(),
    variant: z.enum(["primary", "secondary", "ghost", "danger", "link"]),
    size: z.enum(["sm", "md", "lg"]).optional(),
    icon: z.string().optional(),
    fullWidth: z.boolean().optional(),
    disabled: z.boolean().optional(),
    disabledReason: z.string().optional(),
  }),
});

export const MenuComponent = z.object({
  ...base,
  type: z.literal("menu"),
  props: z.object({
    label: z.string(),
    icon: z.string().optional(),
    items: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        icon: z.string().optional(),
        tone: z.enum(["default", "danger"]).optional(),
        action: Action,
      }),
    ),
  }),
});

const FormField = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(["text", "email", "number", "textarea", "select", "checkbox", "date", "radio"]),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  defaultValue: z.string().optional(),
  validationMessage: z.string().optional(),
  minLength: z.number().optional(),
});

export const FormComponent = z.object({
  ...base,
  type: z.literal("form"),
  props: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    fields: z.array(FormField),
    layout: z.enum(["single", "two-column"]).optional(),
    submitLabel: z.string(),
    submittingLabel: z.string().optional(),
    cancelLabel: z.string().optional(),
    submitOutcome: z
      .enum(["success", "error"])
      .describe("Which outcome the prototype simulates on a valid submit"),
    successTitle: z.string().optional(),
    successMessage: z.string().optional(),
    errorTitle: z.string().optional(),
    errorMessage: z.string().optional(),
    retryLabel: z.string().optional(),
  }),
});

export const SearchComponent = z.object({
  ...base,
  type: z.literal("search"),
  props: z.object({
    label: z.string().optional(),
    placeholder: z.string(),
    targetId: z.string().optional().describe("id of a list or table this search filters"),
    filters: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
  }),
});

export const DialogComponent = z.object({
  ...base,
  type: z.literal("dialog"),
  props: z.object({
    title: z.string(),
    body: z.string(),
    confirmLabel: z.string(),
    cancelLabel: z.string(),
    tone: z.enum(["default", "danger"]).optional(),
    confirmAction: Action.optional(),
  }),
});

export const EmptyStateComponent = z.object({
  ...base,
  type: z.literal("empty-state"),
  props: z.object({
    title: z.string(),
    body: z.string(),
    icon: z.string().optional(),
    actionLabel: z.string().optional(),
    secondaryActionLabel: z.string().optional(),
    secondaryAction: Action.optional(),
  }),
});

export const StepperComponent = z.object({
  ...base,
  type: z.literal("stepper"),
  props: z.object({
    steps: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        description: z.string().optional(),
        status: z.enum(["complete", "current", "upcoming"]),
      }),
    ),
    orientation: z.enum(["horizontal", "vertical"]).optional(),
  }),
});

export const ChartComponent = z.object({
  ...base,
  type: z.literal("chart"),
  props: z.object({
    kind: z.enum(["bar", "line", "donut"]),
    title: z.string().optional(),
    unit: z.string().optional(),
    caption: z.string().optional(),
    series: z.array(z.object({ label: z.string(), value: z.number() })),
  }),
});

export const ChecklistComponent = z.object({
  ...base,
  type: z.literal("checklist"),
  props: z.object({
    title: z.string().optional(),
    items: z.array(
      z.object({ id: z.string(), label: z.string(), done: z.boolean(), helper: z.string().optional() }),
    ),
  }),
});

export const ToggleComponent = z.object({
  ...base,
  type: z.literal("toggle"),
  props: z.object({
    label: z.string(),
    description: z.string().optional(),
    defaultOn: z.boolean().optional(),
  }),
});

export const KeyValueComponent = z.object({
  ...base,
  type: z.literal("key-value"),
  props: z.object({
    items: z.array(z.object({ label: z.string(), value: z.string() })),
    columns: z.number().optional(),
  }),
});

export const TimelineComponent = z.object({
  ...base,
  type: z.literal("timeline"),
  props: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        time: z.string(),
        body: z.string().optional(),
        tone: Tone.optional(),
      }),
    ),
  }),
});

export const ImageComponent = z.object({
  ...base,
  type: z.literal("image"),
  props: z.object({
    alt: z.string(),
    label: z.string().optional(),
    aspect: z.enum(["16:9", "4:3", "1:1", "3:1"]).optional(),
  }),
});

export const DividerComponent = z.object({
  ...base,
  type: z.literal("divider"),
  props: z.object({}),
});

export const PaginationComponent = z.object({
  ...base,
  type: z.literal("pagination"),
  props: z.object({ page: z.number(), pageCount: z.number(), label: z.string().optional() }),
});

/** Internal: stands in for a component the AI produced that failed validation. */
export const NoticeComponent = z.object({
  ...base,
  type: z.literal("notice"),
  props: z.object({ text: z.string() }),
});

export const Component = z.discriminatedUnion("type", [
  ShellComponent,
  StackComponent,
  GridComponent,
  SplitComponent,
  SectionComponent,
  CardComponent,
  PageHeaderComponent,
  HeadingComponent,
  TextComponent,
  BadgeComponent,
  AlertComponent,
  StatComponent,
  ProgressComponent,
  ListComponent,
  TableComponent,
  TabsComponent,
  ButtonComponent,
  MenuComponent,
  FormComponent,
  SearchComponent,
  DialogComponent,
  EmptyStateComponent,
  StepperComponent,
  ChartComponent,
  ChecklistComponent,
  ToggleComponent,
  KeyValueComponent,
  TimelineComponent,
  ImageComponent,
  DividerComponent,
  PaginationComponent,
  NoticeComponent,
]);
export type Component = z.infer<typeof Component>;
export type ComponentType = Component["type"];
export type ComponentOf<T extends ComponentType> = Extract<Component, { type: T }>;

export const COMPONENT_TYPES = Component.options.map((o) => o.shape.type.value) as ComponentType[];
/** Types the AI may use (notice is internal). */
export const AI_COMPONENT_TYPES = COMPONENT_TYPES.filter((t) => t !== "notice");

/* ------------------------------------------------------------------ */
/* Annotations, theme, screen                                          */
/* ------------------------------------------------------------------ */

export const AnnotationKind = z.enum(["decision", "assumption", "validate"]);
export type AnnotationKind = z.infer<typeof AnnotationKind>;

export const Annotation = z.object({
  id: z.string(),
  elementId: z.string(),
  kind: AnnotationKind.describe(
    "decision = deliberate design choice; assumption = made because information was missing; validate = recommendation that needs user validation",
  ),
  decision: z.string(),
  rationale: z.string(),
  uxPrinciple: z.string(),
  toneAlignment: z.string(),
  tradeoffs: z.array(z.string()),
  assumptions: z.array(z.string()),
});
export type Annotation = z.infer<typeof Annotation>;

export const Theme = z.object({
  primary: z.string().describe("Hex color, e.g. #2f5fd0"),
  accent: z.string().optional(),
  neutral: z.enum(["slate", "stone", "zinc", "gray"]),
  radius: z.enum(["none", "sm", "md", "lg", "xl"]),
  density: z.enum(["compact", "comfortable", "spacious"]),
  font: z.enum(["sans", "serif", "rounded", "mono"]),
  mode: z.enum(["light", "dark"]),
});
export type Theme = z.infer<typeof Theme>;

export const Platform = z.enum(["desktop", "tablet", "mobile"]);
export type Platform = z.infer<typeof Platform>;

export const Assumption = z.object({ id: z.string(), text: z.string() });

export const ScreenSpec = z.object({
  title: z.string(),
  description: z.string(),
  platform: Platform,
  toneSummary: z.string(),
  theme: Theme,
  rootIds: z.array(z.string()),
  components: z.array(Component),
  annotations: z.array(Annotation),
  assumptions: z.array(Assumption),
});
export type ScreenSpec = z.infer<typeof ScreenSpec>;

/**
 * Loose envelope used to parse raw model output before per-component
 * validation, so one bad component doesn't discard the whole screen.
 */
export const LooseScreenSpec = ScreenSpec.extend({
  components: z.array(z.looseObject({ id: z.string(), type: z.string() })),
  annotations: z.array(z.unknown()),
  assumptions: z.array(z.unknown()).optional(),
  theme: z.unknown(),
});

/* ------------------------------------------------------------------ */
/* Refinement, review, comparison                                      */
/* ------------------------------------------------------------------ */

export const QUICK_ACTIONS = [
  "layout",
  "hierarchy",
  "microcopy",
  "tone",
  "interaction",
  "accessibility",
] as const;
export const QuickAction = z.enum(QUICK_ACTIONS);
export type QuickAction = z.infer<typeof QuickAction>;

/** What the model returns for a component-level refinement: a patch, never a whole screen. */
export const RefinementPatch = z.object({
  scope: z.object({
    targetIds: z.array(z.string()),
    dependentIds: z
      .array(z.string())
      .describe("Other existing components that must change for the request to work (e.g. a parent that gains a child)"),
    explanation: z.string(),
  }),
  componentUpdates: z.array(Component).describe("Full replacement objects for changed existing components; ids unchanged"),
  newComponents: z.array(Component),
  removedComponentIds: z.array(z.string()),
  annotationUpdates: z.array(Annotation),
  newAnnotations: z.array(Annotation),
  removedAnnotationIds: z.array(z.string()),
  summary: z.string(),
  changes: z.array(z.object({ componentId: z.string(), description: z.string() })),
  uxImpact: z.string(),
  tradeoffs: z.array(z.string()),
  newAssumptions: z.array(z.string()),
});
export type RefinementPatch = z.infer<typeof RefinementPatch>;

export const ReviewFinding = z.object({
  id: z.string(),
  componentId: z.string().optional(),
  severity: z.enum(["high", "medium", "low"]),
  category: z.enum(["accessibility", "interaction", "content", "states"]),
  issue: z.string(),
  recommendation: z.string(),
  reference: z.string().optional().describe("e.g. a WCAG success criterion"),
});
export type ReviewFinding = z.infer<typeof ReviewFinding>;

export const ReviewResult = z.object({
  summary: z.string(),
  findings: z.array(ReviewFinding),
});
export type ReviewResult = z.infer<typeof ReviewResult>;

export const ComparisonResult = z.object({
  summary: z.string(),
  changes: z.array(z.object({ componentId: z.string(), description: z.string(), uxImpact: z.string() })),
  risks: z.array(z.string()),
});
export type ComparisonResult = z.infer<typeof ComparisonResult>;

export const AnnotationRefresh = z.object({ annotations: z.array(Annotation) });

/* ------------------------------------------------------------------ */
/* Inputs and project model                                            */
/* ------------------------------------------------------------------ */

export const BriefInput = z.object({
  description: z.string(),
  tone: z.string(),
  screenType: z.string().optional(),
  targetUsers: z.string().optional(),
  primaryGoal: z.string().optional(),
  platform: Platform.optional(),
  visualStyle: z.string().optional(),
});
export type BriefInput = z.infer<typeof BriefInput>;

export type ProviderId = "anthropic" | "demo";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  model: string | null;
  /** True when this provider produces real AI output. */
  isAI: boolean;
}

export interface RefinementRecord {
  instruction: string;
  quickAction?: QuickAction;
  targetIds: string[];
  affectedIds: string[];
  scopeExplanation: string;
  summary: string;
  changes: { componentId: string; description: string }[];
  uxImpact: string;
  tradeoffs: string[];
  newAssumptions: string[];
  warnings: string[];
}

export interface Version {
  id: string;
  number: number;
  createdAt: string;
  kind: "generation" | "refinement" | "restore" | "annotations";
  parentId: string | null;
  label: string;
  spec: ScreenSpec;
  provider: ProviderInfo;
  refinement?: RefinementRecord;
  restoredFrom?: number;
  warnings?: string[];
}

export type ProjectStatus = "draft" | "generating" | "ready" | "refining" | "error" | "approved";

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  brief: BriefInput;
  status: ProjectStatus;
  lastError: string | null;
  provider: ProviderInfo | null;
  versions: Version[];
  currentVersionId: string | null;
  undoStack: string[];
  redoStack: string[];
  approvedVersionId: string | null;
  refinementLog: { at: string; versionId: string | null; instruction: string; targetIds: string[]; ok: boolean; error?: string }[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  status: ProjectStatus;
  versionCount: number;
  provider: ProviderInfo | null;
  approved: boolean;
}
