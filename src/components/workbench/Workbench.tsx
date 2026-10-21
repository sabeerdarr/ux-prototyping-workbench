"use client";
import { useState } from "react";
import { clsx } from "clsx";
import { CircleCheck } from "lucide-react";
import { BriefPanel } from "./BriefPanel";
import { Canvas } from "./Canvas";
import { CompareModal, HistoryPanel } from "./HistoryPanel";
import { Inspector } from "./Inspector";
import { ProjectsModal } from "./ProjectsModal";
import { ReviewPanel } from "./ReviewPanel";
import { TopBar } from "./TopBar";
import { useWorkbench } from "./use-workbench";

type LeftTab = "brief" | "history" | "review";

export function Workbench() {
  const wb = useWorkbench();
  const [tab, setTab] = useState<LeftTab>("brief");
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [compareFrom, setCompareFrom] = useState<string | null>(null);
  const p = wb.project;
  const approvedCurrent = p?.approvedVersionId && p.approvedVersionId === p.currentVersionId;

  const tabs: { id: LeftTab; label: string; count?: number }[] = [
    { id: "brief", label: "Brief" },
    { id: "history", label: "History", count: p?.versions.length || undefined },
    { id: "review", label: "Review" },
  ];

  return (
    <div className="flex h-full min-h-[640px] flex-col">
      <TopBar wb={wb} onOpenProjects={() => setProjectsOpen(true)} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[316px_minmax(0,1fr)_360px] xl:grid-cols-[336px_minmax(0,1fr)_384px]">
        <aside aria-label="Project controls" className="flex min-h-0 flex-col border-b border-wb-line bg-white lg:border-r lg:border-b-0">
          <div role="tablist" aria-label="Project panels" className="flex gap-1 border-b border-wb-line px-3 pt-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={clsx(
                  "-mb-px border-b-2 px-2 pb-2 text-[12.5px] font-medium",
                  tab === t.id ? "border-wb-ink text-wb-ink" : "border-transparent text-wb-ink-3 hover:text-wb-ink",
                )}
              >
                {t.label}
                {t.count ? <span className="ml-1 text-wb-ink-3">{t.count}</span> : null}
              </button>
            ))}
          </div>
          {approvedCurrent && (
            <div className="mx-3 mt-3 flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] leading-snug text-emerald-900">
              <CircleCheck size={15} className="mt-px flex-none text-emerald-600" aria-hidden="true" />
              <span>
                <strong className="font-semibold">v{wb.version?.number} is approved.</strong> Export it from the top bar, or keep refining. New versions won&apos;t be approved until you approve them.
              </span>
            </div>
          )}
          <div role="tabpanel" className="wb-scroll min-h-0 flex-1 overflow-y-auto">
            {tab === "brief" && <BriefPanel key={p?.id ?? "new"} wb={wb} />}
            {tab === "history" && <HistoryPanel wb={wb} onCompare={setCompareFrom} />}
            {tab === "review" && <ReviewPanel wb={wb} />}
          </div>
        </aside>
        <div className="flex min-h-[620px] min-w-0 flex-col lg:min-h-0">
          <Canvas wb={wb} />
        </div>
        <aside aria-label="Design rationale" className="min-h-0 border-t border-wb-line bg-[#f8f8f6] lg:border-t-0 lg:border-l">
          <Inspector wb={wb} />
        </aside>
      </div>
      {projectsOpen && <ProjectsModal wb={wb} onClose={() => setProjectsOpen(false)} />}
      {compareFrom && <CompareModal wb={wb} fromId={compareFrom} onClose={() => setCompareFrom(null)} />}
    </div>
  );
}
