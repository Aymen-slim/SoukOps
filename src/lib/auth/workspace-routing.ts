import { isWorkspaceMode, type WorkspaceMode } from "@/lib/pro/types";

export const WORKSPACE_MODE_COOKIE = "wassalha_workspace_mode";

export function workspaceHomePath(mode: WorkspaceMode): "/dashboard" | "/pro" {
  return mode === "pro" ? "/pro" : "/dashboard";
}

/**
 * Pure route guard helper used by both `src/proxy.ts` and `<WorkspaceGate />`.
 * Returns a redirect destination when a user visits the opposite track's desk,
 * or null when the pathname matches their active workspace mode.
 */
export function resolveWorkspaceRedirect(pathname: string, modeRaw: unknown): "/dashboard" | "/pro" | null {
  if (!isWorkspaceMode(modeRaw)) return null;
  if (modeRaw === "pro" && (pathname === "/dashboard" || pathname.startsWith("/dashboard/"))) {
    return "/pro";
  }
  if (modeRaw === "ecommerce" && (pathname === "/pro" || pathname.startsWith("/pro/"))) {
    return "/dashboard";
  }
  return null;
}
