export const THEME_COOKIE = "dayson-theme";
export type Theme = "light" | "dark";

export function parseTheme(v: string | undefined | null): Theme {
  return v === "dark" ? "dark" : "light";
}
