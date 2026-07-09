export const isThisOrChildPath = (
    currentItemPath: string,
    requiredPath: string
): boolean =>
    currentItemPath === requiredPath ||
    currentItemPath.startsWith(`${requiredPath}/`);

export const isThisOrChildOrParentPath = (
    currentItemPath: string,
    requiredPath: string
): boolean =>
    isThisOrChildPath(currentItemPath, requiredPath) ||
    requiredPath.startsWith(`${currentItemPath}/`);
