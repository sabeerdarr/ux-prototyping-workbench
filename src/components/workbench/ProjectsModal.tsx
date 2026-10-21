"use client";
import { useEffect, useState } from "react";
import { FolderOpen, Plus, Trash2 } from "lucide-react";
import type { ProjectSummary } from "@/lib/schema";
import { listProjects } from "@/lib/client/api";
import { Button, IconButton, Modal, Pill } from "../ui";
import type { Workbench } from "./use-workbench";

export function ProjectsModal({ wb, onClose }: { wb: Workbench; onClose: () => void }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    listProjects().then(setProjects).catch(() => setFailed(true));
  }, []);

  return (
    <Modal
      open
      onClose={onClose}
      title="Projects"
      footer={
        <Button
          variant="primary"
          icon={<Plus size={14} />}
          onClick={() => {
            wb.startNew();
            onClose();
          }}
        >
          New project
        </Button>
      }
    >
      <div className="p-3">
        {failed && <p className="p-2 text-[12.5px] text-red-700">Couldn&apos;t load projects. Check that the server is running.</p>}
        {!projects && !failed && <p className="p-2 text-[12.5px] text-wb-ink-3">Loading…</p>}
        {projects?.length === 0 && <p className="p-2 text-[12.5px] text-wb-ink-3">No saved projects yet. Generate a prototype and it&apos;s saved automatically.</p>}
        <ul className="flex flex-col gap-1">
          {projects?.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-lg border border-wb-line px-3 py-2 hover:border-wb-line-strong">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  void wb.openProject(p.id);
                  onClose();
                }}
              >
                <div className="flex items-center gap-1.5">
                  <FolderOpen size={14} className="text-wb-ink-3" aria-hidden="true" />
                  <span className="truncate text-[13px] font-semibold">{p.name}</span>
                  {p.id === wb.project?.id && <Pill tone="accent">Open</Pill>}
                  {p.approved && <Pill tone="green">Approved</Pill>}
                </div>
                <div className="mt-0.5 text-[11.5px] text-wb-ink-3">
                  {p.versionCount} version{p.versionCount === 1 ? "" : "s"} · {p.provider?.label ?? "Not generated"} · updated {new Date(p.updatedAt).toLocaleString()}
                </div>
              </button>
              {confirmId === p.id ? (
                <div className="flex items-center gap-1">
                  <Button
                    size="xs"
                    variant="danger"
                    onClick={async () => {
                      await wb.removeProject(p.id);
                      setProjects((list) => list?.filter((x) => x.id !== p.id) ?? null);
                      setConfirmId(null);
                    }}
                  >
                    Delete permanently
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setConfirmId(null)}>
                    Keep
                  </Button>
                </div>
              ) : (
                <IconButton label={`Delete ${p.name}`} onClick={() => setConfirmId(p.id)}>
                  <Trash2 size={14} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
