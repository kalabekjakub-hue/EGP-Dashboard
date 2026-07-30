export function languagesNeedSync(versions: Array<{ common_revision?: number; local_revision?: number; hasDraft?: boolean }>) {
  if (versions.length < 2) return false;
  if (!versions.some(version => version.hasDraft)) return false;
  const commons = new Set(versions.map(version => version.common_revision ?? 1));
  return commons.size > 1 || versions.some(version => (version.local_revision ?? 0) > 0);
}

export function localesNeedingSync(versions: Array<{ locale: string; common_revision?: number; local_revision?: number; hasDraft?: boolean }>) {
  if (!languagesNeedSync(versions)) return [] as string[];
  const maxCommon = Math.max(1, ...versions.map(version => version.common_revision ?? 1));
  return versions
    .filter(version => (version.common_revision ?? 1) !== maxCommon || (version.local_revision ?? 0) > 0)
    .map(version => version.locale);
}

export function nextLocalRevision(currentLocalRevision: unknown, options: { saveMode?: unknown; resetLocalRevision?: unknown; contentChanged: boolean }) {
  if (options.resetLocalRevision === true) return 0;
  const current = Math.max(0, Number(currentLocalRevision ?? 0) || 0);
  return options.saveMode === "version" && options.contentChanged ? current + 1 : current;
}
