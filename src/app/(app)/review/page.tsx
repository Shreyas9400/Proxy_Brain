"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface PendingMemory {
  id: string;
  statement: string;
  memoryType: string;
  domain: string;
  origin: string;
  confidence: number;
  importance: string;
  reviewReason: string | null;
  createdAt: string;
}

interface OpenContradiction {
  id: string;
  memoryIdA: string;
  memoryIdB: string;
  explanation: string;
}

export default function ReviewPage() {
  const [pending, setPending] = useState<PendingMemory[]>([]);
  const [contradictions, setContradictions] = useState<OpenContradiction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/review");
    const data = await res.json();
    setPending(data.pending ?? []);
    setContradictions(data.openContradictions ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Initial data load, not a cascading state update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function act(id: string, action: "approve" | "edit" | "reject") {
    const body: { action: string; editedStatement?: string } = { action };
    if (action === "edit") body.editedStatement = editValue;

    const res = await fetch(`/api/review/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error("Failed to apply review action.");
      return;
    }
    toast.success(action === "approve" ? "Approved." : action === "edit" ? "Edited and approved." : "Rejected.");
    setEditingId(null);
    load();
  }

  async function resolveContradiction(id: string, resolution: string) {
    const res = await fetch(`/api/review/contradictions/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolution }),
    });
    if (!res.ok) {
      toast.error("Failed to resolve contradiction.");
      return;
    }
    toast.success("Contradiction resolved.");
    load();
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-4">
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold">Pending review ({pending.length})</h2>
        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {!loading && pending.length === 0 ? <p className="text-sm text-muted-foreground">Nothing waiting for review.</p> : null}
        <div className="flex flex-col gap-3">
          {pending.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex flex-col gap-2">
                {editingId === m.id ? (
                  <Textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                ) : (
                  <p className="text-sm">{m.statement}</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{m.memoryType}</Badge>
                  <Badge variant="outline">{m.domain}</Badge>
                  <Badge variant="outline">{m.origin}</Badge>
                  <Badge variant="outline">{m.importance}</Badge>
                  <span className="text-xs text-muted-foreground">conf {m.confidence.toFixed(2)}</span>
                </div>
                {m.reviewReason ? <p className="text-xs text-muted-foreground">Why review: {m.reviewReason}</p> : null}
                <div className="flex gap-2">
                  {editingId === m.id ? (
                    <>
                      <Button size="sm" onClick={() => act(m.id, "edit")}>
                        Save & approve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => act(m.id, "approve")}>
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(m.id);
                          setEditValue(m.statement);
                        }}
                      >
                        Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => act(m.id, "reject")}>
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Open contradictions ({contradictions.length})</h2>
        {!loading && contradictions.length === 0 ? <p className="text-sm text-muted-foreground">No open contradictions.</p> : null}
        <div className="flex flex-col gap-3">
          {contradictions.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-col gap-2">
                <p className="text-sm">{c.explanation}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => resolveContradiction(c.id, "RESOLVED_A")}>
                    Keep A
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => resolveContradiction(c.id, "RESOLVED_B")}>
                    Keep B
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => resolveContradiction(c.id, "RESOLVED_BOTH_VALID")}>
                    Both valid
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => resolveContradiction(c.id, "DISMISSED")}>
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
