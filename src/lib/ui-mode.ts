import type { Profile } from "@/types/db";

/** Managers and admins are the only roles that have a UI mode to switch. */
export function canSwitchMode(profile: Pick<Profile, "role">): boolean {
  return profile.role === "manager" || profile.role === "admin";
}

/**
 * Management mode hides the salesperson reporting screens (new visit, own plan,
 * drafts) and puts oversight screens in the menu instead.
 *
 * `management_mode` is null until the user flips the switch, and null means
 * "role default" — managers land in management mode, everyone else reports.
 */
export function isManagementMode(
  profile: Pick<Profile, "role" | "management_mode">
): boolean {
  return canSwitchMode(profile) && (profile.management_mode ?? true);
}
