const ACCESS_ADMIN = 'admin';
const ACCESS_PUBLIC = 'public';

export const hasAccess = (
    userAccesses: string[],
    targetAccesses: string[] = [],
    path: string,
    accessedPath: string | undefined,
    allAccessiblePaths: string[] = []
) => {
    if (
        accessedPath &&
        (path === accessedPath ||
            path.startsWith(`${accessedPath}/`) ||
            accessedPath.startsWith(`${path}/`))
    ) {
        return true;
    }

    if (
        targetAccesses.length === 0 &&
        allAccessiblePaths.some(
            (accessiblePath) =>
                path === accessiblePath || path.startsWith(`${accessiblePath}/`)
        )
    ) {
        return true;
    }

    return (
        userAccesses.includes(ACCESS_ADMIN) ||
        targetAccesses.includes(ACCESS_PUBLIC) ||
        (targetAccesses.length > 0 &&
            targetAccesses.some((access) => userAccesses.includes(access)))
    );
};
