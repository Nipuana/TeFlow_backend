/**
 * Shared domain types used across modules.
 *
 * Role hierarchy (low → high privilege):
 *   employee  — base role: works on (create/edit) tasks in projects they're on
 *   manager   — sees and manages ALL projects in the org, runs the project teams
 *   admin     — org administration (members, billing view, integrations)
 *   owner     — provisions accounts, billing changes, deletes the org
 *
 * The string identifiers ARE the authority — do not add "display only" synonyms.
 */
export type Role = 'employee' | 'manager' | 'admin' | 'owner';

/** The trusted, verified identity attached to a request by requireAuth (API2). */
export interface AuthUser {
  id: string;
  orgId: string;
  role: Role;
  /** Authentication methods reference — contains 'mfa'/'reauth' after step-up. */
  amr: string[];
  /** Unix seconds of the last step-up re-auth (0 if none). */
  stepUpAt: number;
}

/** Base fields every stored document carries. */
export interface BaseDoc {
  id: string;
  createdAt: string;
  updatedAt: string;
}
