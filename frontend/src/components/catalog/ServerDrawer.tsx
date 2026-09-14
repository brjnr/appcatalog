import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Cpu, HardDrive, MemoryStick, ServerIcon, ShieldBan } from "lucide-react";
import { ApiError, apiGet } from "@/lib/api";
import { useInfraNav } from "@/lib/infraNav";
import { slugify, type Server } from "@/lib/types";
import { DetailRow, InfraStatusBadge } from "./InfraBits";
import { PicBadge } from "./PicBadge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Server detail drawer. Opened from an application's Servers section or from a PIC's
 * assigned servers; its PIC badges open the PIC drawer, so navigation chains both ways.
 */
export function ServerDrawer() {
  const { serverId, closeServer, openPic } = useInfraNav();

  const { data: server, isLoading, isError, error } = useQuery({
    queryKey: ["servers", serverId],
    queryFn: () => apiGet<Server>(`/servers/${serverId}`),
    enabled: Boolean(serverId),
    retry: false,
  });

  const denied = isError && error instanceof ApiError && error.status === 403;

  return (
    <Sheet open={Boolean(serverId)} onOpenChange={(open) => !open && closeServer()}>
      <SheetContent
        side="right"
        data-testid="server-drawer"
        className="w-full overflow-y-auto sm:max-w-xl"
      >
        <SheetHeader>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sky-600 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300">
              <ServerIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <SheetTitle data-testid="server-drawer-name" className="font-heading">
                {server?.name ?? (isLoading ? "Loading…" : "Server")}
              </SheetTitle>
              <SheetDescription className="font-mono text-xs">
                {server?.hostname || "—"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {isLoading ? (
          <div className="grid gap-3 px-4 pb-6" data-testid="server-drawer-loading">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-muted/50" />
            ))}
          </div>
        ) : denied ? (
          <div
            data-testid="server-drawer-denied"
            className="flex flex-col items-center gap-2 px-6 py-12 text-center"
          >
            <ShieldBan className="h-9 w-9 text-red-500" aria-hidden="true" />
            <p className="font-medium text-foreground">Access denied</p>
            <p className="text-sm text-muted-foreground">
              This server belongs to applications that are not assigned to you.
            </p>
          </div>
        ) : !server ? (
          <div data-testid="server-drawer-missing" className="px-6 py-12 text-center">
            <p className="font-medium text-foreground">Server not found</p>
            <p className="mt-1 text-sm text-muted-foreground">It may have been removed.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 px-4 pb-8">
            <div className="flex flex-wrap items-center gap-2">
              <InfraStatusBadge status={server.status} />
              <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {server.environment}
              </span>
              {server.server_type && (
                <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {server.server_type}
                </span>
              )}
            </div>

            {/* Resource strip */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border bg-card p-3">
                <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <Cpu className="h-3 w-3" aria-hidden="true" /> CPU
                </span>
                <p data-testid="server-cpu" className="mt-1 text-sm font-semibold text-foreground">
                  {server.cpu || "—"}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <MemoryStick className="h-3 w-3" aria-hidden="true" /> RAM
                </span>
                <p data-testid="server-ram" className="mt-1 text-sm font-semibold text-foreground">
                  {server.ram || "—"}
                </p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <HardDrive className="h-3 w-3" aria-hidden="true" /> Storage
                </span>
                <p data-testid="server-storage" className="mt-1 text-sm font-semibold text-foreground">
                  {server.storage || "—"}
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              <DetailRow label="Server name" value={server.name} testid="server-detail-name" />
              <DetailRow label="Hostname" value={server.hostname} mono />
              <DetailRow label="IP address" value={server.ip_address} testid="server-detail-ip" mono />
              <DetailRow label="VM name" value={server.vm_name} mono />
              <DetailRow label="Operating system" value={server.os} />
              <DetailRow label="OS version" value={server.os_version} />
              <DetailRow label="Data center / location" value={server.datacenter} testid="server-detail-datacenter" />
              <DetailRow label="Cluster" value={server.cluster} />
              <DetailRow label="Virtualization platform" value={server.virtualization} />
              <DetailRow label="Server type" value={server.server_type} />
            </dl>

            {server.description && (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Description
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-foreground/90">{server.description}</p>
              </div>
            )}

            {/* Applications using this server — clickable through to app detail */}
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Applications using this server
              </h3>
              <div className="mt-2 flex flex-wrap gap-2" data-testid="server-applications">
                {server.applications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Not assigned to any application yet.
                  </p>
                ) : (
                  server.applications.map((app) => (
                    <Link
                      key={app.id}
                      to={`/app/${app.id}`}
                      onClick={closeServer}
                      data-testid={`server-app-link-${slugify(app.name)}`}
                      className="inline-flex items-center rounded-lg border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-[border-color,background-color] duration-150 hover:border-sky-400/70 hover:bg-sky-50 dark:hover:border-sky-500/60 dark:hover:bg-sky-950/40"
                    >
                      {app.name}
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* Server PIC — clicking swaps to the PIC drawer */}
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Server PIC
              </h3>
              <div className="mt-2 flex flex-wrap gap-2" data-testid="server-pics">
                {server.pics.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No PIC assigned yet.</p>
                ) : (
                  server.pics.map((pic) => (
                    <PicBadge
                      key={pic.id}
                      id={pic.id}
                      name={pic.name}
                      initials={pic.initials}
                      onClick={openPic}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
