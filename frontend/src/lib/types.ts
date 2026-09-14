// Hand-written mirrors of the backend Pydantic models (backend/models/catalog.py).
// Nothing infers across the Python boundary — keep this in sync with that file.
export interface CatalogApp {
  id: string;
  name: string;
  description: string;
  category: string;
  environment: string;
  status: string;
  url: string;
  icon: string;
  usage_count: number;
  favorite_count: number;
  created_at: string;
  updated_at: string;
}

export const CATEGORIES = [
  "Business",
  "Infrastructure",
  "Network",
  "Security",
  "Monitoring",
  "Data Center",
  "HR",
  "Finance",
] as const;

export const ENVIRONMENTS = [
  "Production",
  "Staging",
  "Internal",
  "Cloud",
  "On-Premises",
] as const;

export const STATUSES = ["Active", "Maintenance", "Deprecated"] as const;

export type LayoutId = "grid" | "list" | "alphabetical" | "category" | "compact";

export type SortId =
  | "name_asc"
  | "name_desc"
  | "most_used"
  | "most_favorite"
  | "recently_added"
  | "recently_updated";

export const SORT_OPTIONS: { id: SortId; label: string }[] = [
  { id: "name_asc", label: "Name: A → Z" },
  { id: "name_desc", label: "Name: Z → A" },
  { id: "most_used", label: "Most Used" },
  { id: "most_favorite", label: "Most Favorite" },
  { id: "recently_added", label: "Recently Added" },
  { id: "recently_updated", label: "Recently Updated" },
];

export const SORT_LABELS: Record<string, string> = Object.fromEntries(
  SORT_OPTIONS.map((o) => [o.id, o.label]),
);

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// Shared card interactions across all catalog layouts.
export interface CardActions {
  onOpenDetail: (app: CatalogApp) => void;
  onLaunch: (app: CatalogApp) => void;
  onToggleFavorite: (app: CatalogApp) => void;
  isFavorite: (appId: string) => boolean;
}
