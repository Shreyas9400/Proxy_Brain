"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface MemoryRow {
  id: string;
  statement: string;
  memoryType: string;
  domain: string;
  origin: string;
  confidence: number;
  importance: string;
  status: string;
  temporalType: string;
  reviewReason: string | null;
  createdAt: string;
  updatedAt: string;
  lastConfirmedAt: string;
}

interface MemoryDetail {
  memory: MemoryRow;
  versions: Array<{ id: string; previousStatement: string | null; newStatement: string; newStatus: string; changeReason: string; actor: string; createdAt: string }>;
  sources: Array<{ id: string; title: string; type: string; rawContent: string; createdAt: string }>;
  entities: Array<{ id: string; name: string; entityType: string }>;
  openContradictions: Array<{ id: string; explanation: string }>;
}

const STATUS_OPTIONS = ["ACTIVE", "PENDING_REVIEW", "STALE", "SUPERSEDED", "CONTRADICTED", "UNCERTAIN", "ARCHIVED"];

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ACTIVE") return "default";
  if (status === "CONTRADICTED" || status === "ARCHIVED") return "destructive";
  if (status === "PENDING_REVIEW" || status === "UNCERTAIN" || status === "STALE") return "secondary";
  return "outline";
}

export default function MemoryPage() {
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MemoryDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const loadMemories = useCallback(async () => {
    setLoading(true);
    const url = statusFilter ? `/api/memory?status=${statusFilter}` : "/api/memory";
    const res = await fetch(url);
    const data = await res.json();
    setMemories(data.memories ?? []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    // Initial + filter-change data load, not a cascading state update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMemories();
  }, [loadMemories]);

  async function openDetail(id: string) {
    setSelectedId(id);
    setEditing(false);
    const res = await fetch(`/api/memory/${id}`);
    if (!res.ok) {
      toast.error("Couldn't load that memory.");
      return;
    }
    const data = (await res.json()) as MemoryDetail;
    setDetail(data);
    setEditValue(data.memory.statement);
  }

  async function handleArchive() {
    if (!selectedId) return;
    const res = await fetch(`/api/memory/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ARCHIVED" }),
    });
    if (!res.ok) {
      toast.error("Failed to archive memory.");
      return;
    }
    toast.success("Memory archived.");
    setSelectedId(null);
    setDetail(null);
    loadMemories();
  }

  async function handleSaveEdit() {
    if (!selectedId) return;
    const res = await fetch(`/api/memory/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statement: editValue }),
    });
    if (!res.ok) {
      toast.error("Failed to save edit.");
      return;
    }
    toast.success("Memory updated.");
    setEditing(false);
    openDetail(selectedId);
    loadMemories();
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex w-full max-w-md flex-col overflow-y-auto border-r border-border p-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Button size="sm" variant={statusFilter === "" ? "secondary" : "ghost"} onClick={() => setStatusFilter("")}>
            All
          </Button>
          {STATUS_OPTIONS.map((s) => (
            <Button key={s} size="sm" variant={statusFilter === s ? "secondary" : "ghost"} onClick={() => setStatusFilter(s)}>
              {s}
            </Button>
          ))}
        </div>

        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {!loading && memories.length === 0 ? <p className="text-sm text-muted-foreground">No memories found.</p> : null}

        <div className="flex flex-col gap-2">
          {memories.map((m) => (
            <Card
              key={m.id}
              onClick={() => openDetail(m.id)}
              className={cn("cursor-pointer transition-colors hover:ring-foreground/20", selectedId === m.id && "ring-2 ring-ring")}
            >
              <CardContent className="flex flex-col gap-1.5">
                <p className="line-clamp-2 text-sm">{m.statement}</p>
                <div className="flex flex-wrap items-center gap-1">
                  <Badge variant={statusVariant(m.status)}>{m.status}</Badge>
                  <Badge variant="outline">{m.memoryType}</Badge>
                  <Badge variant="outline">{m.domain}</Badge>
                  <span className="text-xs text-muted-foreground">conf {m.confidence.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!detail ? (
          <p className="text-sm text-muted-foreground">Select a memory to see its full explainability panel.</p>
        ) : (
          <div className="flex max-w-2xl flex-col gap-5">
            <div>
              {editing ? (
                <div className="flex flex-col gap-2">
                  <Textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveEdit}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-lg leading-snug">{detail.memory.statement}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Badge variant={statusVariant(detail.memory.status)}>{detail.memory.status}</Badge>
              <Badge variant="outline">{detail.memory.memoryType}</Badge>
              <Badge variant="outline">{detail.memory.domain}</Badge>
              <Badge variant="outline">{detail.memory.origin}</Badge>
              <Badge variant="outline">{detail.memory.temporalType}</Badge>
              <Badge variant="outline">{detail.memory.importance}</Badge>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Confidence</dt>
              <dd>{detail.memory.confidence.toFixed(2)}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{new Date(detail.memory.createdAt).toLocaleString()}</dd>
              <dt className="text-muted-foreground">Updated</dt>
              <dd>{new Date(detail.memory.updatedAt).toLocaleString()}</dd>
              <dt className="text-muted-foreground">Last confirmed</dt>
              <dd>{new Date(detail.memory.lastConfirmedAt).toLocaleString()}</dd>
              {detail.memory.reviewReason ? (
                <>
                  <dt className="text-muted-foreground">Review reason</dt>
                  <dd>{detail.memory.reviewReason}</dd>
                </>
              ) : null}
            </dl>

            {detail.openContradictions.length > 0 ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="mb-1 font-medium text-destructive">Open contradiction(s)</p>
                {detail.openContradictions.map((c) => (
                  <p key={c.id} className="text-destructive/90">
                    {c.explanation}
                  </p>
                ))}
              </div>
            ) : null}

            {detail.entities.length > 0 ? (
              <div>
                <p className="mb-1.5 text-sm font-medium">Entities</p>
                <div className="flex flex-wrap gap-1.5">
                  {detail.entities.map((e) => (
                    <Badge key={e.id} variant="secondary">
                      {e.name}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex gap-2">
              {!editing ? (
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              ) : null}
              {detail.memory.status !== "ARCHIVED" ? (
                <Button size="sm" variant="destructive" onClick={handleArchive}>
                  Archive
                </Button>
              ) : null}
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium">View Source</p>
              <div className="flex flex-col gap-2">
                {detail.sources.length === 0 ? <p className="text-sm text-muted-foreground">No linked source.</p> : null}
                {detail.sources.map((s) => (
                  <Card key={s.id} size="sm">
                    <CardContent>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        {s.title} · {s.type} · {new Date(s.createdAt).toLocaleString()}
                      </p>
                      <p className="line-clamp-4 text-sm whitespace-pre-wrap">{s.rawContent}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium">View History</p>
              <div className="flex flex-col gap-2">
                {detail.versions.map((v) => (
                  <div key={v.id} className="border-l-2 border-border pl-3 text-sm">
                    <p className="text-xs text-muted-foreground">
                      {new Date(v.createdAt).toLocaleString()} · {v.actor} · {v.newStatus}
                    </p>
                    <p>{v.newStatement}</p>
                    <p className="text-xs text-muted-foreground">{v.changeReason}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
