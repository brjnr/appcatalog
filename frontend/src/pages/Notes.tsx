import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AppWindow,
  ContactRound,
  NotebookPen,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ServerIcon,
  Trash2,
} from "lucide-react";
import { apiDelete, apiErrorMessage, apiGet, apiPost } from "@/lib/api";
import { InfraNavProvider, useInfraNav } from "@/lib/infraNav";
import type { Note, NoteLinkOut, SessionUser } from "@/lib/types";
import { slugify } from "@/lib/types";
import { AppNavbar } from "@/components/catalog/AppNavbar";
import { NoteFormDialog } from "@/components/catalog/NoteFormDialog";
import { PicDrawer } from "@/components/catalog/PicDrawer";
import { ServerDrawer } from "@/components/catalog/ServerDrawer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function NotesPage() {
  return (
    <InfraNavProvider>
      <Notes />
    </InfraNavProvider>
  );
}

// Shared scratchpad: anyone signed in can post a temporary note about a server, alert,
// or application. Only the author (or an admin) can edit or delete it.
function Notes() {
  const queryClient = useQueryClient();
  const { openServer, openPic } = useInfraNav();
  const [view, setView] = useState<"active" | "trash">("active");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);

  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<SessionUser | null>("/auth/me"),
    retry: false,
  });

  const { data: notes, isLoading } = useQuery({
    queryKey: ["notes", view],
    queryFn: () => apiGet<Note[]>(`/notes?view=${view}`),
    enabled: Boolean(user),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notes"] });

  const remove = useMutation({
    mutationFn: (note: Note) => apiDelete<void>(`/notes/${note.id}`),
    onSuccess: () => {
      invalidate();
      toast.success(view === "trash" ? "Note deleted for good" : "Note moved to Trash");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const restore = useMutation({
    mutationFn: (note: Note) => apiPost<Note>(`/notes/${note.id}/restore`),
    onSuccess: () => {
      invalidate();
      toast.success("Note restored");
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const q = search.trim().toLowerCase();
  const filtered = (notes ?? []).filter((note) =>
    q ? `${note.title} ${note.body} ${note.author_name}`.toLowerCase().includes(q) : true,
  );

  const linkIcon = (kind: string) =>
    kind === "application" ? AppWindow : kind === "server" ? ServerIcon : ContactRound;

  const renderLink = (note: Note, link: NoteLinkOut) => {
    const Icon = linkIcon(link.kind);
    const className =
      "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40";
    const testid = `note-link-${slugify(note.title)}-${link.kind}-${slugify(link.name)}`;
    if (link.kind === "application") {
      return (
        <Link key={`${link.kind}-${link.id}`} to={`/app/${link.id}`} data-testid={testid} className={className}>
          <Icon className="h-3 w-3" aria-hidden="true" /> {link.name}
        </Link>
      );
    }
    return (
      <button
        key={`${link.kind}-${link.id}`}
        type="button"
        data-testid={testid}
        className={className}
        onClick={() => (link.kind === "server" ? openServer(link.id) : openPic(link.id))}
      >
        <Icon className="h-3 w-3" aria-hidden="true" /> {link.name}
      </button>
    );
  };

  return (
    <div className="min-h-svh">
      <AppNavbar user={user ?? null} />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 lg:px-8" data-testid="notes-page">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-heading text-xl font-semibold tracking-tight text-foreground">
              <NotebookPen className="h-5 w-5 text-sky-600 dark:text-sky-300" aria-hidden="true" />
              Notes & Memos
            </h1>
            <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
              Temporary notes about servers, alerts, or applications. Everyone signed in can read
              them; only the author or an administrator can change one. Expired notes move to Trash
              and are purged 7 days later.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                data-testid="notes-search-input"
                aria-label="Search notes"
                placeholder="Search notes…"
                className="h-9 w-48 pl-8"
              />
            </div>
            <Button
              data-testid="add-note-btn"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> New Note
            </Button>
          </div>
        </div>

        <div className="mt-4 flex gap-1.5" role="tablist" aria-label="Notes view">
          {(["active", "trash"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              data-testid={`notes-tab-${id}`}
              onClick={() => setView(id)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150",
                view === id
                  ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {id === "active" ? "Active notes" : "Deleted (7-day)"}
            </button>
          ))}
          <span className="ml-1 self-center text-xs text-muted-foreground" data-testid="notes-count">
            {isLoading ? "Loading…" : `${filtered.length} note(s)`}
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2" data-testid="notes-list">
          {filtered.length === 0 ? (
            <Card className="p-10 text-center md:col-span-2" data-testid="notes-empty">
              <p className="font-medium text-foreground">
                {view === "trash" ? "Trash is empty" : "No notes yet"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {view === "trash"
                  ? "Expired and deleted notes appear here for 7 days."
                  : "Write the first memo about a server, alert, or application."}
              </p>
            </Card>
          ) : (
            filtered.map((note) => (
              <Card
                key={note.id}
                data-testid={`note-card-${slugify(note.title)}`}
                className={cn(
                  "flex flex-col gap-2 p-4 transition-[border-color,box-shadow] duration-150 hover:border-sky-300",
                  note.status === "trashed" && "border-dashed opacity-90",
                )}
              >
                <div className="flex items-start gap-2">
                  <h2
                    className="min-w-0 flex-1 font-heading text-sm font-semibold text-foreground"
                    data-testid={`note-title-${slugify(note.title)}`}
                  >
                    {note.title}
                  </h2>
                  {note.can_edit && (
                    <div className="flex shrink-0 gap-1">
                      {note.status === "trashed" ? (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Restore ${note.title}`}
                          title="Restore note"
                          data-testid={`note-restore-btn-${slugify(note.title)}`}
                          onClick={() => restore.mutate(note)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Edit ${note.title}`}
                          title="Edit note"
                          data-testid={`note-edit-btn-${slugify(note.title)}`}
                          onClick={() => {
                            setEditing(note);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Delete ${note.title}`}
                        title={note.status === "trashed" ? "Delete permanently" : "Move to Trash"}
                        data-testid={`note-delete-btn-${slugify(note.title)}`}
                        className="text-destructive hover:text-destructive"
                        onClick={() => remove.mutate(note)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </div>

                {note.body && (
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{note.body}</p>
                )}

                {note.links_out.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {note.links_out.map((link) => renderLink(note, link))}
                  </div>
                )}

                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px] text-muted-foreground">
                  <span data-testid={`note-author-${slugify(note.title)}`}>
                    by <span className="font-medium text-foreground">{note.author_name}</span>
                  </span>
                  <span className="font-mono">noted {note.note_date}</span>
                  {note.status === "trashed" ? (
                    <span
                      data-testid={`note-purge-${slugify(note.title)}`}
                      className="font-medium text-red-600 dark:text-red-400"
                    >
                      purges {note.purge_on ?? "—"}
                    </span>
                  ) : (
                    <span
                      data-testid={`note-retention-${slugify(note.title)}`}
                      className={cn(
                        "font-medium",
                        note.days_left <= 1
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-foreground",
                      )}
                    >
                      keeps until {note.expires_at} · {note.days_left} day(s) left
                    </span>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      </main>

      <NoteFormDialog open={formOpen} onOpenChange={setFormOpen} initial={editing} />
      <ServerDrawer />
      <PicDrawer />
    </div>
  );
}
