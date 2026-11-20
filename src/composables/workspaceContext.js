import { inject } from "vue";
export const workspaceKey = Symbol("atlas-workspace");
export function useWorkspace() {
  const workspace = inject(workspaceKey);
  if (!workspace) throw new Error("Workspace component must be inside App");
  return workspace;
}
