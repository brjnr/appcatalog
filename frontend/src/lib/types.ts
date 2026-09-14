// Hand-written mirrors of the backend Pydantic models (backend/models/) — keep in sync.
export interface CatalogApp {
  id: string;
  name: string;
  description: string;
  category_id: string;
  category_name: string;
  environment: string;
  status: string;
  url: string;
  icon: string;
  usage_count: number;
  favorite_count: number;
  created_at: string;
  updated_at: string;
}

export interface AppCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  icon_url: string | null;
  status: string; // "active" | "inactive"
  created_at: string;
  updated_at: string;
}

export type Role = "administrator" | "normal_user";

// Mirror of backend UserOut — also used for the /auth/me session payload and user lists.
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  assigned_category_ids: string[];
  is_active: boolean;
}

export const ROLE_LABELS: Record<string, string> = {
  administrator: "Administrator",
  normal_user: "Normal User",
};

export const ENVIRONMENTS = [
  "Production",
  "Staging",
  "Internal",
  "Cloud",
  "On-Premises",
] as const;

export const STATUSES = ["Active", "Maintenance", "Deprecated"] as const;

export const CATEGORY_STATUSES = ["active", "inactive"] as const;

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
