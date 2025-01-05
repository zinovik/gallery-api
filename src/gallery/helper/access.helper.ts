import { AlbumModel, FileModel } from '../../common/album-file.types';

const ACCESS_ADMIN = 'admin';
const ACCESS_PUBLIC = 'public';

interface AlbumAccess {
    path: string;
    accesses: string[];
}

export const getAlbumAccessesSorted = (albums: AlbumModel[]): AlbumAccess[] =>
    [...albums.filter((album) => album.accesses && album.accesses.length > 0)]
        .sort((a1, a2) => a2.path.split('/').length - a1.path.split('/').length)
        .map((album) => ({
            path: album.path,
            accesses: album.accesses,
        }));

export const hasAccess = (
    userAccesses: string[],
    accessedPath: string | '',
    targetAccesses: string[],
    path: string,
    albumAccessesSorted: AlbumAccess[]
) => {
    if (
        accessedPath &&
        (path === accessedPath ||
            path.startsWith(`${accessedPath}/`) ||
            accessedPath.startsWith(`${path}/`))
    ) {
        return true;
    }

    const pathVariants = path
        .split('/')
        .map((_, i, pathParts) => pathParts.slice(0, i + 1).join('/'));

    const requiredAccesses =
        targetAccesses ||
        albumAccessesSorted.find((albumAccess) =>
            pathVariants.includes(albumAccess.path)
        )?.accesses ||
        [];

    return (
        userAccesses.includes(ACCESS_ADMIN) ||
        requiredAccesses.includes(ACCESS_PUBLIC) ||
        requiredAccesses.every((access) => userAccesses.includes(access))
    );
};

export const getPublicFilenames = (
    files: FileModel[],
    albums: AlbumModel[]
) => {
    const albumAccessesSorted = getAlbumAccessesSorted(albums);
    const userAccesses: string[] = []; // no accesses = public user

    return files
        .filter((file) =>
            hasAccess(
                userAccesses,
                '',
                file.accesses,
                file.path,
                albumAccessesSorted
            )
        )
        .map((file) => file.filename);
};
