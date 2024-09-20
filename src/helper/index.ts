import { AlbumModel, FileModel } from '../types';

const ACCESS_ADMIN = 'admin';
const ACCESS_PUBLIC = 'public';

interface AlbumAccess {
    path: string;
    accesses: string[];
}

export const getAlbumAccesses = (albums: AlbumModel[]): AlbumAccess[] =>
    [...albums.filter((album) => album.accesses && album.accesses.length > 0)]
        .sort((a1, a2) => a2.path.split('/').length - a1.path.split('/').length)
        .map((album) => ({
            path: album.path,
            accesses: album.accesses,
        }));

const hasAccess = (
    userAccesses: string[],
    requiredAccesses = [] as string[]
): boolean =>
    userAccesses.includes(ACCESS_ADMIN) ||
    requiredAccesses.includes(ACCESS_PUBLIC) ||
    requiredAccesses.every((access) => userAccesses.includes(access));

export const hasAccessToAlbum = (
    userAccesses: string[],
    album: AlbumModel,
    albumAccesses: AlbumAccess[]
) =>
    hasAccess(
        userAccesses,
        album.accesses ||
            albumAccesses.find((albumAccess) =>
                albumAccess.path.includes(album.path.split('/')[0])
            )?.accesses
    );

// TODO: check file AND album accesses?
export const hasAccessToFile = (
    userAccesses: string[],
    file: FileModel,
    albumAccesses: AlbumAccess[]
) =>
    hasAccess(
        userAccesses,
        file.accesses ||
            albumAccesses.find((albumAccess) =>
                albumAccess.path.includes(file.path.split('/')[0])
            )?.accesses
    );
