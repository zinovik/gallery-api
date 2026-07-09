import { AlbumModel } from '../../common/album-file.types';
import { isThisOrChildOrParentPath } from './common.helper';

const ACCESS_ADMIN = 'admin';
const ACCESS_PUBLIC = 'public';

export const resolveAccesses = (
    accesses: string[] | undefined,
    path: string,
    albumsMap: Map<string, AlbumModel>
): string[] | undefined => {
    if (accesses?.length) {
        return accesses;
    }

    while (path) {
        const parent = albumsMap.get(path);

        if (parent?.defaultAccesses) {
            return parent.defaultAccesses;
        }

        path = path.substring(0, path.lastIndexOf('/'));
    }

    return undefined;
};

export const hasAccess = (
    userAccesses: string[],
    targetAccesses: string[] = [],
    path: string,
    accessedPath: string | undefined
) => {
    if (accessedPath && isThisOrChildOrParentPath(path, accessedPath)) {
        return true;
    }

    return (
        userAccesses.includes(ACCESS_ADMIN) ||
        targetAccesses.includes(ACCESS_PUBLIC) ||
        (targetAccesses.length > 0 &&
            targetAccesses.some((access) => userAccesses.includes(access)))
    );
};
