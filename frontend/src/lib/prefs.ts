import { useCallback, useState } from "react";

// Layout / sort preferences persist across visits (no login — per-browser localStorage).
export function usePersistedState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // storage unavailable (private mode) — session-only preference
      }
    },
    [key],
  );

  return [value, update];
}

const FAVORITES_KEY = "catalog.favorites";

function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

// Favorites are per-browser: ids live in localStorage, counts sync to the backend
// via POST /api/apps/{id}/favorite so "Most Favorite" sorting stays meaningful.
export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(readFavorites()));

  const toggle = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return { favorites, toggle };
}
