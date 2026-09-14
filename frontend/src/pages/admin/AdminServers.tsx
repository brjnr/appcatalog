import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
import { apiDelete, apiErrorMessage, apiGet, apiPut } from "@/lib/api";
import { InfraNavProvider, useInfraNav } from "@/lib/infraNav";
import { slugify, type Server } from "@/lib/types";
import { InfraStatusBadge } from "@/components/catalog/InfraBits";
import { ServerFormDialog } from "@/components/catalog/ServerFormDialog";
import { ServerDrawer } from "@/components/catalog/ServerDrawer";
import { PicDrawer } from "@/components/catalog/PicDrawer";
import { ConfirmDeleteDialog } from "@/components/catalog/ConfirmDeleteDialog";
import { PicBadge } from "@/components/catalog/PicBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminServersPage() {
  return (
    <InfraNavProvider>
      <AdminServers />
    </InfraNavProvider>
  );
}

// Servers admin: register, edit, deactivate, delete, view details, assign apps + PICs.
function AdminServers() {
  const queryClient = useQueryClient();
  const { openServer, openPic } = useInfraNav();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Server | null>(null);
  const [deleting, setDeleting] = useState<Server | null>(null);

  const { data: servers, isLoading } = useQuery({
    queryKey: ["servers"],
    queryFn: () => apiGet<Server[]>("/servers"),
  });

  const toggleStatus = useMutation({
    mutationFn: (server: Server) =>
      apiPut<Server>(`/servers/${server.id}`, {
        status: server.status === "Active" ? "Maintenance" : "Active",
      }),
    onSuccess: (server) => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      toast.success(`${server.name} set to ${server.status}`);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const deleteServer = useMutation({
    mutationFn: (server: Server) => apiDelete<void>(`/servers/${server.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      queryClient.invalidateQueries({ queryKey: ["pics"] });
      toast.success("Server deleted");
      setDeleting(null);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const filtered = (servers ?? []).filter((server) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${server.name} ${server.hostname} ${server.ip_address} ${server.vm_name}`
      .toLowerCase()
      .includes(q);
  });

  return (
    <div data-testid="servers-page" className="pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
            Servers
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {servers?.length ?? 0} registered. A server can serve many applications and vice versa.
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
              data-testid="server-search-input"
              aria-label="Search servers"
              placeholder="Name, host, IP…"
              className="h-9 w-48 pl-8"
            />
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            data-testid="add-server-btn"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Add Server
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border bg-card" data-testid="servers-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Server</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Applications</TableHead>
              <TableHead>PIC</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Loading servers…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No servers match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((server) => {
                const slug = slugify(server.name);
                return (
                  <TableRow key={server.id} data-testid={`server-row-${slug}`}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => openServer(server.id)}
                        data-testid={`server-row-name-${slug}`}
                        className="text-left font-mono text-[13px] font-semibold text-sky-700 transition-colors hover:underline dark:text-sky-300"
                      >
                        {server.name}
                      </button>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {server.hostname || "—"} · {server.ip_address || "—"}
                      </div>
                    </TableCell>
                    <TableCell>{server.environment}</TableCell>
                    <TableCell data-testid={`server-location-${slug}`}>
                      <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-300">
                        {server.location}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-56 flex-wrap gap-1">
                        {server.applications.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Unassigned</span>
                        ) : (
                          server.applications.map((app) => (
                            <Badge key={app.id} variant="outline" className="text-[11px]">
                              {app.name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {server.pics.length === 0 ? (
                          <span className="text-xs text-muted-foreground">None</span>
                        ) : (
                          server.pics.map((pic) => (
                            <PicBadge
                              key={pic.id}
                              id={pic.id}
                              name={pic.name}
                              initials={pic.initials}
                              onClick={openPic}
                              showName={false}
                              className="pr-1"
                            />
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <InfraStatusBadge status={server.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`View ${server.name}`}
                          title="View details"
                          data-testid={`server-view-btn-${slug}`}
                          onClick={() => openServer(server.id)}
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Edit ${server.name}`}
                          title="Edit server"
                          data-testid={`server-edit-btn-${slug}`}
                          onClick={() => {
                            setEditing(server);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Toggle status of ${server.name}`}
                          title="Activate / set maintenance"
                          data-testid={`server-toggle-btn-${slug}`}
                          onClick={() => toggleStatus.mutate(server)}
                        >
                          <Power className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Delete ${server.name}`}
                          title="Delete server"
                          data-testid={`server-delete-btn-${slug}`}
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(server)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ServerFormDialog open={formOpen} onOpenChange={setFormOpen} initial={editing} />
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        appName={deleting?.name ?? ""}
        pending={deleteServer.isPending}
        onConfirm={() => deleting && deleteServer.mutate(deleting)}
      />
      <ServerDrawer />
      <PicDrawer />
    </div>
  );
}
