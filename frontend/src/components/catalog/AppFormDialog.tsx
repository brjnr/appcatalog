import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiErrorMessage, apiPost, apiPut } from "@/lib/api";
import { CATEGORIES, ENVIRONMENTS, STATUSES, type CatalogApp } from "@/lib/types";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { ICON_OPTIONS } from "./AppIcon";

interface AppFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: CatalogApp | null; // null = create mode
}

interface AppFormPayload {
  name: string;
  description: string;
  category: string;
  environment: string;
  status: string;
  url: string;
  icon: string;
}

// Admin dialog: register a new application or edit an existing catalog entry.
export function AppFormDialog({ open, onOpenChange, initial }: AppFormDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Business");
  const [environment, setEnvironment] = useState("Production");
  const [status, setStatus] = useState("Active");
  const [icon, setIcon] = useState("AppWindow");

  // Reset the fields each time the dialog opens (create vs prefilled edit).
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setUrl(initial?.url ?? "");
    setDescription(initial?.description ?? "");
    setCategory(initial?.category ?? "Business");
    setEnvironment(initial?.environment ?? "Production");
    setStatus(initial?.status ?? "Active");
    setIcon(initial?.icon ?? "AppWindow");
  }, [open, initial]);

  const saveMutation = useMutation({
    mutationFn: (payload: AppFormPayload) =>
      initial
        ? apiPut<CatalogApp>(`/apps/${initial.id}`, payload)
        : apiPost<CatalogApp>("/apps", payload),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["apps"] });
      toast.success(initial ? "Application updated" : `${saved.name} added to the catalog`);
      onOpenChange(false);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName) {
      toast.error("Application name is required");
      return;
    }
    try {
      const parsed = new URL(trimmedUrl);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("bad protocol");
    } catch {
      toast.error("Enter a valid http(s) application URL");
      return;
    }
    saveMutation.mutate({
      name: trimmedName,
      description: description.trim(),
      url: trimmedUrl,
      category,
      environment,
      status,
      icon,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="admin-app-form-dialog"
        className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>{initial ? "Edit application" : "Add application"}</DialogTitle>
          <DialogDescription>
            {initial
              ? "Update the catalog entry for this application."
              : "Register a new enterprise application in the catalog."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="app-form-name">Name</Label>
            <Input
              id="app-form-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              data-testid="admin-form-name-input"
              placeholder="e.g. Jira Software"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="app-form-url">Application URL</Label>
            <Input
              id="app-form-url"
              required
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              data-testid="admin-form-url-input"
              placeholder="https://app.internal.corp"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="app-form-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="app-form-category" data-testid="admin-form-category-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="app-form-environment">Environment</Label>
              <Select value={environment} onValueChange={setEnvironment}>
                <SelectTrigger id="app-form-environment" data-testid="admin-form-environment-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENVIRONMENTS.map((env) => (
                    <SelectItem key={env} value={env}>
                      {env}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="app-form-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="app-form-status" data-testid="admin-form-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="app-form-icon">Icon</Label>
              <Select value={icon} onValueChange={setIcon}>
                <SelectTrigger id="app-form-icon" data-testid="admin-form-icon-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ICON_OPTIONS.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="app-form-description">Purpose description</Label>
            <Textarea
              id="app-form-description"
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              data-testid="admin-form-description-input"
              placeholder="What does this application do? Who uses it?"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="admin-app-form-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              data-testid="admin-app-form-submit-btn"
            >
              {saveMutation.isPending
                ? "Saving…"
                : initial
                  ? "Save changes"
                  : "Add application"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
