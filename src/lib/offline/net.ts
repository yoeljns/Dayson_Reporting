export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/** True for a dropped connection (fetch failed) rather than a server reply. */
export function isNetworkError(e: unknown): boolean {
  const msg =
    e instanceof Error ? e.message : typeof e === "string" ? e : String(e ?? "");
  return (
    !isOnline() ||
    /failed to fetch|load failed|networkerror|network request failed|fetch failed|ERR_INTERNET|ERR_NETWORK|The Internet connection appears to be offline/i.test(
      msg
    )
  );
}
