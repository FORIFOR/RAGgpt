export type Scope = {
  tenant: string;
  user_id: string;
  notebook_id: string;
  include_global?: boolean;
};

const DEFAULT_TENANT_ENV =
  process.env.NEXT_PUBLIC_TENANT_ID ||
  process.env.NEXT_PUBLIC_TENANT ||
  process.env.RAG_TENANT_DEFAULT ||
  process.env.TENANT_DEFAULT;
const DEFAULT_USER_ENV =
  process.env.NEXT_PUBLIC_USER_ID ||
  process.env.RAG_DEFAULT_USER ||
  process.env.DEFAULT_USER_ID;

export const DEFAULT_TENANT: string = (DEFAULT_TENANT_ENV || "demo").trim() || "demo";
export const DEFAULT_USER: string = (DEFAULT_USER_ENV || "local").trim() || "local";

export function setScope(scope: Scope) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem("scope", JSON.stringify(scope));
  window.sessionStorage.setItem("tenant", scope.tenant);
  window.sessionStorage.setItem("user_id", scope.user_id);
  window.sessionStorage.setItem("notebook_id", scope.notebook_id);
  window.sessionStorage.setItem("include_global", scope.include_global ? "1" : "0");
}

export function getScope(): Scope {
  if (typeof window === "undefined") {
    throw new Error("Scope is only available in the browser.");
  }
  const raw = window.sessionStorage.getItem("scope");
  if (!raw) throw new Error("No active notebook.");
  return JSON.parse(raw) as Scope;
}

export function resolveScope(
  notebook: string | null | undefined,
  tenant?: string | null,
  userId?: string | null,
  includeGlobal?: boolean | null,
): Scope {
  const notebookId = (notebook || "").trim();
  if (!notebookId) {
    throw new Error("Notebook ID is required to resolve scope");
  }
  const tenantId = (tenant || DEFAULT_TENANT).trim() || DEFAULT_TENANT;
  const user = (userId || DEFAULT_USER).trim() || DEFAULT_USER;
  const scope: Scope = {
    tenant: tenantId,
    user_id: user,
    notebook_id: notebookId,
  };
  if (includeGlobal ?? false) {
    scope.include_global = true;
  }
  return scope;
}

export function scopeOf(
  notebookId: string,
  options?: { tenant?: string | null; user_id?: string | null; include_global?: boolean }
): Scope {
  const id = (notebookId || "").trim();
  if (!id) {
    throw new Error("Notebook ID is required");
  }
  const tenant =
    (options?.tenant ?? DEFAULT_TENANT)?.trim() || DEFAULT_TENANT;
  const user =
    (options?.user_id ?? DEFAULT_USER)?.trim() || DEFAULT_USER;
  const scope: Scope = {
    tenant,
    user_id: user,
    notebook_id: id,
  };
  if (options?.include_global) {
    scope.include_global = true;
  }
  return scope;
}

export function buildScopeQuery(scope: Scope): Record<string, string> {
  return {
    tenant: scope.tenant,
    user_id: scope.user_id,
    notebook_id: scope.notebook_id,
    include_global: scope.include_global ? "true" : "false",
  };
}
