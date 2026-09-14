import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { apiGet } from "@/lib/api";
import { InfraNavProvider, useInfraNav } from "@/lib/infraNav";
import type { SessionUser, StandbyCalendar as StandbyCalendarData } from "@/lib/types";
import { slugify } from "@/lib/types";
import { AppNavbar } from "@/components/catalog/AppNavbar";
import { PicDrawer } from "@/components/catalog/PicDrawer";
import { ServerDrawer } from "@/components/catalog/ServerDrawer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function StandbyCalendarPage() {
  return (
    <InfraNavProvider>
      <StandbyCalendar />
    </InfraNavProvider>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthShift(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// On-call roster for one month across every PIC. Scoped by the backend, so a normal
// user only sees shifts for applications assigned to them.
function StandbyCalendar() {
  const navigate = useNavigate();
  const { openPic } = useInfraNav();
  const [month, setMonth] = useState<string | null>(null);

  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<SessionUser | null>("/auth/me"),
    retry: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["standby", month],
    queryFn: () => apiGet<StandbyCalendarData>(month ? `/standby?month=${month}` : "/standby"),
    enabled: Boolean(user),
  });

  // The server decides the current month; we only shift relative to what it returned.
  const activeMonth = data?.month ?? month;

  const grid = useMemo(() => {
    if (!activeMonth) return null;
    const [y, m] = activeMonth.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const leading = (first.getUTCDay() + 6) % 7; // Monday-first
    const cells: (string | null)[] = Array.from({ length: leading }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(`${activeMonth}-${String(day).padStart(2, "0")}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [activeMonth]);

  const byDate = useMemo(() => {
    const map = new Map<string, StandbyCalendarData["entries"]>();
    for (const entry of data?.entries ?? []) {
      if (!map.has(entry.date)) map.set(entry.date, []);
      map.get(entry.date)!.push(entry);
    }
    return map;
  }, [data]);

  const monthLabel = activeMonth
    ? new Date(`${activeMonth}-01T00:00:00Z`).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : "…";

  return (
    <div className="min-h-svh">
      <AppNavbar user={user ?? null} />
      <main className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8" data-testid="standby-page">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-heading text-xl font-semibold tracking-tight text-foreground">
              <CalendarDays className="h-5 w-5 text-sky-600 dark:text-sky-300" aria-hidden="true" />
              Standby Calendar
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              On-call roster across all people in charge. Click a PIC to open their full details.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous month"
              data-testid="standby-prev-month"
              onClick={() => activeMonth && setMonth(monthShift(activeMonth, -1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <span
              data-testid="standby-month-label"
              className="min-w-40 text-center font-heading text-sm font-semibold text-foreground"
            >
              {monthLabel}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next month"
              data-testid="standby-next-month"
              onClick={() => activeMonth && setMonth(monthShift(activeMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-testid="standby-this-month"
              onClick={() => setMonth(null)}
            >
              This month
            </Button>
          </div>
        </div>

        <p className="mt-3 text-sm text-muted-foreground" data-testid="standby-shift-count">
          {isLoading ? "Loading roster…" : `${data?.entries.length ?? 0} shift(s) this month`}
        </p>

        {/* Month grid */}
        <Card className="mt-3 overflow-hidden p-0">
          <div className="grid grid-cols-7 border-b bg-muted/40">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7" data-testid="standby-grid">
            {(grid ?? Array.from({ length: 35 }, () => null)).map((date, index) => {
              const entries = date ? (byDate.get(date) ?? []) : [];
              return (
                <div
                  key={date ?? `blank-${index}`}
                  data-testid={date ? `standby-cell-${date}` : undefined}
                  className={cn(
                    "min-h-24 border-b border-r p-1.5 last:border-r-0",
                    !date && "bg-muted/20",
                    entries.length > 0 && "bg-sky-50/40 dark:bg-sky-950/20",
                  )}
                >
                  {date && (
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {Number(date.slice(-2))}
                    </span>
                  )}
                  <div className="mt-1 flex flex-col gap-1">
                    {entries.map((entry) => (
                      <button
                        key={`${entry.pic_id}-${entry.application_id}`}
                        type="button"
                        onClick={() => openPic(entry.pic_id)}
                        data-testid={`standby-entry-${entry.date}-${slugify(entry.pic_name)}`}
                        title={`${entry.pic_name} → ${entry.application_name}${entry.notes ? ` (${entry.notes})` : ""}`}
                        className="flex items-center gap-1.5 rounded-md border border-sky-200 bg-card px-1.5 py-1 text-left transition-[border-color,background-color] duration-150 hover:border-sky-400 hover:bg-sky-50 dark:border-sky-900 dark:hover:bg-sky-950/50"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[9px] font-semibold text-white dark:bg-sky-600">
                          {entry.pic_initials}
                        </span>
                        <span className="min-w-0 truncate text-[11px] font-medium text-foreground">
                          {entry.application_name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Agenda list — the same data, easier to scan */}
        <h2 className="mt-8 font-heading text-sm font-semibold text-foreground">Agenda</h2>
        <div className="mt-2 flex flex-col gap-1.5" data-testid="standby-agenda">
          {(data?.entries.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="standby-empty">
              {isLoading ? "Loading…" : "No standby shifts scheduled this month."}
            </p>
          ) : (
            data?.entries.map((entry) => (
              <div
                key={`${entry.date}-${entry.pic_id}-${entry.application_id}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2"
              >
                <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                  {entry.date}
                </span>
                <button
                  type="button"
                  onClick={() => openPic(entry.pic_id)}
                  data-testid={`agenda-pic-${slugify(entry.pic_name)}`}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-0.5 pl-0.5 pr-2.5 transition-colors hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-white dark:bg-sky-600">
                    {entry.pic_initials}
                  </span>
                  <span className="text-sm font-medium text-foreground">{entry.pic_name}</span>
                </button>
                <span className="text-muted-foreground" aria-hidden="true">
                  →
                </span>
                <button
                  type="button"
                  onClick={() => navigate(`/app/${entry.application_id}`)}
                  className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
                >
                  {entry.application_name}
                </button>
                {entry.notes && (
                  <span className="text-xs text-muted-foreground">· {entry.notes}</span>
                )}
              </div>
            ))
          )}
        </div>
      </main>

      <PicDrawer />
      <ServerDrawer />
    </div>
  );
}
