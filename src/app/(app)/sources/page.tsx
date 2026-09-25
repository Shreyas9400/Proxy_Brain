"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SourceRow {
  id: string;
  title: string;
  type: string;
  rawContent: string;
  createdAt: string;
}

interface SourceVersion {
  id: string;
  versionNumber: number;
  rawContent: string;
  createdAt: string;
}

export default function SourcesPage() {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ source: SourceRow; versions: SourceVersion[] } | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/sources");
    const data = await res.json();
    setSources(data.sources ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Initial data load, not a cascading state update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function openDetail(id: string) {
    setSelectedId(id);
    const res = await fetch(`/api/sources/${id}`);
    if (!res.ok) {
      toast.error("Couldn't load that source.");
      return;
    }
    setDetail(await res.json());
  }

  async function handleNoteSubmit() {
    if (!noteText.trim()) return;
    setUploading(true);
    const res = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: noteTitle || undefined, text: noteText }),
    });
    setUploading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Import failed." }));
      toast.error(body.error ?? "Import failed.");
      return;
    }
    toast.success("Note imported. Memory formation is running in the background.");
    setNoteTitle("");
    setNoteText("");
    load();
  }

  async function handleFileUpload(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/sources", { method: "POST", body: form });
    setUploading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Import failed." }));
      toast.error(body.error ?? "Import failed.");
      return;
    }
    toast.success(`Imported ${file.name}. Memory formation is running in the background.`);
    if (fileInputRef.current) fileInputRef.current.value = "";
    load();
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex w-full max-w-md flex-col gap-4 overflow-y-auto border-r border-border p-4">
        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm font-medium">Import a file</p>
            <p className="text-xs text-muted-foreground">.txt, .md, .pdf, .json, .csv</p>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.markdown,.pdf,.json,.csv"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm font-medium">Add a manual note</p>
            <Input placeholder="Title (optional)" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
            <Textarea placeholder="Paste text..." value={noteText} onChange={(e) => setNoteText(e.target.value)} className="min-h-24" />
            <Button size="sm" onClick={handleNoteSubmit} disabled={uploading || !noteText.trim()}>
              Import
            </Button>
          </CardContent>
        </Card>

        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {!loading && sources.length === 0 ? <p className="text-sm text-muted-foreground">No sources yet.</p> : null}

        <div className="flex flex-col gap-2">
          {sources.map((s) => (
            <Card
              key={s.id}
              onClick={() => openDetail(s.id)}
              className={cn("cursor-pointer transition-colors hover:ring-foreground/20", selectedId === s.id && "ring-2 ring-ring")}
            >
              <CardContent className="flex flex-col gap-1">
                <p className="line-clamp-1 text-sm font-medium">{s.title}</p>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline">{s.type}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!detail ? (
          <p className="text-sm text-muted-foreground">Select a source to view its immutable raw content.</p>
        ) : (
          <div className="flex max-w-2xl flex-col gap-4">
            <div>
              <p className="text-lg font-medium">{detail.source.title}</p>
              <p className="text-xs text-muted-foreground">
                {detail.source.type} · {new Date(detail.source.createdAt).toLocaleString()}
              </p>
            </div>
            <pre className="max-h-[60vh] overflow-auto rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">{detail.source.rawContent}</pre>
            {detail.versions.length > 0 ? (
              <div>
                <p className="mb-1.5 text-sm font-medium">Versions</p>
                <div className="flex flex-col gap-2">
                  {detail.versions.map((v) => (
                    <div key={v.id} className="border-l-2 border-border pl-3 text-sm">
                      <p className="text-xs text-muted-foreground">
                        v{v.versionNumber} · {new Date(v.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
