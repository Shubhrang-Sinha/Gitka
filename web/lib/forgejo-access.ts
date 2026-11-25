import { forgejoFetchAs, ForgejoRequestError } from "./forgejo";

/** Filter revoked repository access without treating outages as an empty project list. */
export async function visibleForgejoProjects<T extends { forgejo_repo: string }>(userId: string | number, projects: T[]): Promise<T[]> {
  const visible: T[] = [];
  for (let offset = 0; offset < projects.length; offset += 6) {
    const batch = projects.slice(offset, offset + 6);
    const allowed = await Promise.all(batch.map(async (project) => {
      try {
        await forgejoFetchAs(userId, `/repos/${project.forgejo_repo}`);
        return true;
      } catch (error) {
        if (error instanceof ForgejoRequestError && (error.status === 403 || error.status === 404)) return false;
        throw error;
      }
    }));
    batch.forEach((project, index) => { if (allowed[index]) visible.push(project); });
  }
  return visible;
}
