"use client";

import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/login/actions";
import { purgeCaches } from "@/lib/offline/purge";

/**
 * Sign out. Cached pages are purged first so a shared device cannot show the
 * previous user's screens offline; the queued ops stay (owner-tagged).
 */
export function LogoutButton() {
  return (
    <form
      action={logout}
      onSubmit={async (e) => {
        e.preventDefault();
        await purgeCaches();
        await logout();
      }}
    >
      <button
        type="submit"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Çıkış</span>
      </button>
    </form>
  );
}
