import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiErrorMessage, apiGet, apiPut } from "@/lib/api";
import type { AppCategory, SessionUser } from "@/lib/types";
import { ROLE_LABELS, slugify } from "@/lib/types";
import { CategoryIcon } from "@/components/catalog/CategoryIcon";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Access Management: the user × category assignment matrix. Every change is saved
// immediately and enforced by the backend on the next request.
export default function AdminAccess() {
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<SessionUser[]>("/users"),
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<AppCategory[]>("/categories"),
  });

  const assign = useMutation({
    mutationFn: ({ user, ids }: { user: SessionUser; ids: string[] }) =>
      apiPut<SessionUser>(`/users/${user.id}`, { assigned_category_ids: ids }),
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(`${user.name}'s categories updated`);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const toggle = (user: SessionUser, categoryId: string, checked: boolean) => {
    const ids = checked
      ? [...new Set([...user.assigned_category_ids, categoryId])]
      : user.assigned_category_ids.filter((id) => id !== categoryId);
    assign.mutate({ user, ids });
  };

  return (
    <div data-testid="access-page" className="pb-10">
      <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
        Access Management
      </h1>
      <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
        Assign app categories to users. Normal users can only see and open applications in their
        assigned categories — even if they type an application's URL directly. Administrators
        always have full access.
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl border bg-card" data-testid="access-matrix">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-card">User</TableHead>
              {(categories ?? []).map((category) => (
                <TableHead key={category.id} className="min-w-32">
                  <span className="flex items-center gap-1.5">
                    <CategoryIcon
                      icon={category.icon}
                      iconUrl={category.icon_url}
                      className="h-3.5 w-3.5 text-sky-600 dark:text-sky-300"
                    />
                    <span className="truncate">{category.name}</span>
                  </span>
                </TableHead>
              ))}
              <TableHead className="text-right">Assigned</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={(categories?.length ?? 0) + 2} className="py-10 text-center text-muted-foreground">
                  Loading assignments…
                </TableCell>
              </TableRow>
            ) : (
              (users ?? []).map((user) => {
                const slug = slugify(user.email);
                const isAdmin = user.role === "administrator";
                return (
                  <TableRow key={user.id} data-testid={`access-user-${slug}`}>
                    <TableCell className="sticky left-0 bg-card">
                      <div className="font-medium text-foreground">{user.name}</div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {user.email}
                        <Badge
                          variant={isAdmin ? "default" : "secondary"}
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {ROLE_LABELS[user.role]}
                        </Badge>
                      </div>
                    </TableCell>
                    {(categories ?? []).map((category) => (
                      <TableCell key={category.id}>
                        <Checkbox
                          checked={isAdmin || user.assigned_category_ids.includes(category.id)}
                          disabled={isAdmin}
                          onCheckedChange={(checked) => toggle(user, category.id, checked === true)}
                          aria-label={`${isAdmin ? "Administrators have all categories" : `Assign ${category.name} to ${user.name}`}`}
                          data-testid={`access-checkbox-${slug}-${slugify(category.name)}`}
                          className={isAdmin ? "opacity-50" : undefined}
                        />
                      </TableCell>
                    ))}
                    <TableCell className="text-right text-sm text-muted-foreground" data-testid={`access-count-${slug}`}>
                      {isAdmin ? "All" : user.assigned_category_ids.length}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
