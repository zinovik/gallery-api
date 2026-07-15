import { AlbumModel } from '../../common/album-file.types';

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
