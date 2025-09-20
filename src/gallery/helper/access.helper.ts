import { FileModel } from '../../common/album-file.types';

const ACCESS_ADMIN = 'admin';
const ACCESS_PUBLIC = 'public';

export const hasAccess = (
    userAccesses: string[],
    targetAccesses: string[],
    path: string,
    accessedPath: string | ''
) => {
    if (
        accessedPath &&
        (path === accessedPath ||
            path.startsWith(`${accessedPath}/`) ||
            accessedPath.startsWith(`${path}/`))
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

export const getPublicFilenames = (files: FileModel[]) => {
    const userAccesses: string[] = []; // no accesses = public user

    return files
        .filter((file) => hasAccess(userAccesses, file.accesses, file.path, ''))
        .map((file) => file.filename);
};
