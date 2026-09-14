import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiErrorMessage, apiGet, apiPost, apiPut } from "@/lib/api";
import type { AppCategory, Department, Role, SessionUser } from "@/lib/types";
import { ROLE_LABELS, slugify } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: SessionUser | null; // null = create mode
}

// Create/edit a user: identity, role, active flag, and assigned app categories.
export function UserFormDialog({ open, onOpenChange, initial }: UserFormDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("normal_user");
  const [isActive, setIsActive] = useState(true);
  const [assignedIds, setAssignedIds] = useState<string[]>([]);

  const [departmentId, setDepartmentId] = useState("");

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: () => apiGet<Department[]>("/departments"),
    enabled: open,
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<AppCategory[]>("/categories"),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setEmail(initial?.email ?? "");
    setPassword("");
    setRole(initial?.role ?? "normal_user");
    setIsActive(initial?.is_active ?? true);
    setAssignedIds(initial?.assigned_category_ids ?? []);
    setDepartmentId(initial?.department_id ?? "");
  }, [open, initial]);

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      initial
        ? apiPut<SessionUser>(`/users/${initial.id}`, payload)
        : apiPost<SessionUser>("/users", payload),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(initial ? "User updated" : `${saved.name} created`);
      onOpenChange(false);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const toggleCategory = (categoryId: string, checked: boolean) => {
    setAssignedIds((prev) =>
      checked ? [...new Set([...prev, categoryId])] : prev.filter((id) => id !== categoryId),
    );
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const payload: Record<string, unknown> = {
      name: name.trim(),
      email: email.trim(),
      role,
      assigned_category_ids: assignedIds,
      department_id: departmentId,
      is_active: isActive,
    };
    if (password) payload.password = password;
    if (!initial && !password) {
      toast.error("A password is required for new users (min 6 characters)");
      return;
    }
    saveMutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="user-form-dialog"
        className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>{initial ? "Edit user" : "Add user"}</DialogTitle>
          <DialogDescription>
            {initial
              ? "Update identity, role, status, or category assignments."
              : "Create an account and assign its role and app categories."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="user-form-name">Name</Label>
            <Input
              id="user-form-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              data-testid="user-form-name-input"
              placeholder="e.g. John Doe"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="user-form-email">Email</Label>
            <Input
              id="user-form-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              data-testid="user-form-email-input"
              placeholder="john.doe@corp.com"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="user-form-password">
              {initial ? "New password (leave blank to keep current)" : "Password"}
            </Label>
            <Input
              id="user-form-password"
              type="password"
              required={!initial}
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              data-testid="user-form-password-input"
              placeholder="min 6 characters"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="user-form-role">Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as Role)}>
              <SelectTrigger id="user-form-role" data-testid="user-form-role-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal_user">Normal User</SelectItem>
                <SelectItem value="administrator">Administrator</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="user-form-department">Department</Label>
            <Select
              value={departmentId || "__none__"}
              onValueChange={(value) => setDepartmentId(value === "__none__" ? "" : value)}
            >
              <SelectTrigger id="user-form-department" data-testid="user-form-department-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="__none__">No department</SelectItem>
                {(departments ?? []).map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Members of a department can read and edit notes shared with it.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label>Assigned app categories</Label>
            <p className="text-xs text-muted-foreground">
              Normal users can only see applications in these categories. Administrators have full
              access regardless.
            </p>
            <div className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-2">
              {(categories ?? []).map((category) => (
                <label
                  key={category.id}
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <Checkbox
                    checked={assignedIds.includes(category.id)}
                    onCheckedChange={(checked) => toggleCategory(category.id, checked === true)}
                    data-testid={`user-form-category-checkbox-${slugify(category.name)}`}
                  />
                  {category.name}
                </label>
              ))}
              {categories && categories.length === 0 && (
                <p className="text-xs text-muted-foreground">No categories yet.</p>
              )}
            </div>
          </div>

          {initial && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
                data-testid="user-form-active-checkbox"
              />
              Active (user can sign in)
            </label>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="user-form-cancel-btn"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending} data-testid="user-form-submit-btn">
              {saveMutation.isPending ? "Saving…" : initial ? "Save changes" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
