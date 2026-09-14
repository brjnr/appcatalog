import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiErrorMessage, apiGet, apiPost, apiPut } from "@/lib/api";
import {
  LOCATION_LABELS,
  SERVER_ENVIRONMENTS,
  SERVER_LOCATIONS,
  SERVER_STATUSES,
  slugify,
  type CatalogApp,
  type Pic,
  type Server,
} from "@/lib/types";
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
import { Textarea } from "@/components/ui/textarea";

interface ServerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Server | null; // null = create mode
}

const FIELDS = [
  { key: "hostname", label: "Hostname", placeholder: "security-prod-01" },
  { key: "ip_address", label: "IP address", placeholder: "10.10.10.101" },
  { key: "vm_name", label: "VM name", placeholder: "SEC-PROD01" },
  { key: "os", label: "Operating system", placeholder: "Ubuntu Server" },
  { key: "os_version", label: "OS version", placeholder: "22.04 LTS" },
  { key: "server_type", label: "Server type", placeholder: "Virtual Machine" },
  { key: "cpu", label: "CPU", placeholder: "8 Core" },
  { key: "ram", label: "RAM", placeholder: "32 GB" },
  { key: "storage", label: "Storage", placeholder: "500 GB SSD" },
  { key: "datacenter", label: "Data center / location", placeholder: "Jakarta DC1" },
  { key: "cluster", label: "Cluster", placeholder: "PROD-CLUSTER-A" },
  { key: "virtualization", label: "Virtualization platform", placeholder: "VMware vSphere 8" },
] as const;

type TextKey = (typeof FIELDS)[number]["key"];

// Create/edit a server. Only the name is required — applications and PICs can be linked later.
export function ServerFormDialog({ open, onOpenChange, initial }: ServerFormDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [text, setText] = useState<Record<TextKey, string>>(
    () => Object.fromEntries(FIELDS.map((f) => [f.key, ""])) as Record<TextKey, string>,
  );
  const [environment, setEnvironment] = useState("Production");
  const [location, setLocation] = useState("DC");
  const [status, setStatus] = useState("Active");
  const [description, setDescription] = useState("");
  const [appIds, setAppIds] = useState<string[]>([]);
  const [picIds, setPicIds] = useState<string[]>([]);

  const { data: apps } = useQuery({
    queryKey: ["apps"],
    queryFn: () => apiGet<CatalogApp[]>("/apps"),
    enabled: open,
  });
  const { data: pics } = useQuery({
    queryKey: ["pics"],
    queryFn: () => apiGet<Pic[]>("/pics"),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setText(
      Object.fromEntries(
        FIELDS.map((f) => [f.key, (initial?.[f.key] as string | undefined) ?? ""]),
      ) as Record<TextKey, string>,
    );
    setEnvironment(initial?.environment ?? "Production");
    setLocation(initial?.location ?? "DC");
    setStatus(initial?.status ?? "Active");
    setDescription(initial?.description ?? "");
    setAppIds(initial?.application_ids ?? []);
    setPicIds(initial?.pic_ids ?? []);
  }, [open, initial]);

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      initial
        ? apiPut<Server>(`/servers/${initial.id}`, payload)
        : apiPost<Server>("/servers", payload),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      queryClient.invalidateQueries({ queryKey: ["pics"] });
      toast.success(initial ? "Server updated" : `Server ${saved.name} registered`);
      onOpenChange(false);
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Server name is required");
      return;
    }
    save.mutate({
      name: name.trim(),
      ...text,
      environment,
      location,
      status,
      description: description.trim(),
      application_ids: appIds,
      pic_ids: picIds,
    });
  };

  const toggle = (list: string[], setList: (v: string[]) => void, id: string, on: boolean) =>
    setList(on ? [...new Set([...list, id])] : list.filter((x) => x !== id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="server-form-dialog"
        className="max-h-[90svh] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{initial ? "Edit server" : "Add server"}</DialogTitle>
          <DialogDescription>
            Only the server name is required — you can assign applications and PICs now or later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="server-form-name">Server name</Label>
            <Input
              id="server-form-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              data-testid="server-form-name-input"
              placeholder="SEC-PROD-01"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <div key={field.key} className="grid gap-1.5">
                <Label htmlFor={`server-form-${field.key}`}>{field.label}</Label>
                <Input
                  id={`server-form-${field.key}`}
                  value={text[field.key]}
                  onChange={(event) =>
                    setText((prev) => ({ ...prev, [field.key]: event.target.value }))
                  }
                  data-testid={`server-form-${field.key.replace(/_/g, "-")}-input`}
                  placeholder={field.placeholder}
                />
              </div>
            ))}

            <div className="grid gap-1.5">
              <Label htmlFor="server-form-environment">Environment</Label>
              <Select value={environment} onValueChange={setEnvironment}>
                <SelectTrigger id="server-form-environment" data-testid="server-form-environment-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVER_ENVIRONMENTS.map((env) => (
                    <SelectItem key={env} value={env}>
                      {env}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="server-form-location">Site role / location</Label>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger id="server-form-location" data-testid="server-form-location-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVER_LOCATIONS.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {LOCATION_LABELS[loc] ?? loc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="server-form-status">Server status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="server-form-status" data-testid="server-form-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="server-form-description">Description</Label>
            <Textarea
              id="server-form-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              data-testid="server-form-description-input"
              placeholder="What runs on this server?"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Assigned applications (many-to-many)</Label>
            <div className="grid max-h-40 grid-cols-1 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
              {(apps ?? []).map((app) => (
                <label key={app.id} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={appIds.includes(app.id)}
                    onCheckedChange={(checked) =>
                      toggle(appIds, setAppIds, app.id, checked === true)
                    }
                    data-testid={`server-form-app-checkbox-${slugify(app.name)}`}
                  />
                  <span className="truncate">{app.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Assigned PICs</Label>
            <div className="grid max-h-36 grid-cols-1 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
              {(pics ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No PICs registered yet.</p>
              ) : (
                (pics ?? []).map((pic) => (
                  <label key={pic.id} className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox
                      checked={picIds.includes(pic.id)}
                      onCheckedChange={(checked) =>
                        toggle(picIds, setPicIds, pic.id, checked === true)
                      }
                      data-testid={`server-form-pic-checkbox-${slugify(pic.name)}`}
                    />
                    <span className="truncate">
                      [{pic.initials}] {pic.name}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="server-form-cancel-btn"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} data-testid="server-form-submit-btn">
              {save.isPending ? "Saving…" : initial ? "Save changes" : "Add server"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
