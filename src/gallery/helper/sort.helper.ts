import { AlbumModel, FileModel } from '../../common/album-file.types';

export const sortAlbums = (albums: AlbumModel[]): AlbumModel[] => {
    const sortedAlbums = albums
        .filter((album) => album.isSorted)
        .map((album) => album.path);

    const topLevelAlbums = albums
        .filter((album) => album.path.split('/').length === 1)
        .map((album) => album.path);

    return [...albums].sort((a1, a2) => {
        const a1PathParts = a1.path.split('/');
        const a2PathParts = a2.path.split('/');

        if (a1PathParts.length === 1 && a2PathParts.length === 1) {
            return 0;
        }

        if (a1PathParts[0] !== a2PathParts[0]) {
            return (
                topLevelAlbums.indexOf(a1PathParts[0]) -
                topLevelAlbums.indexOf(a2PathParts[0])
            );
        }

        // the same root path

        // is sorted album
        if (sortedAlbums.includes(a1PathParts[0])) {
            if (a1PathParts.length === a2PathParts.length)
                return a1.path.localeCompare(a2.path);

            const minPathParts = Math.min(
                a1PathParts.length,
                a2PathParts.length
            );

            for (let i = 0; i < minPathParts; i++) {
                if (a1PathParts[i] !== a2PathParts[i]) {
                    if (a1PathParts[i] === undefined) return -1;
                    if (a2PathParts[i] === undefined) return 1;
                    return a1PathParts[i].localeCompare(a2PathParts[i]);
                }
            }
        }

        if (a2.path.includes(a1.path)) return -1;
        if (a1.path.includes(a2.path)) return 1;

        return 0;
    });
};

export const sortFiles = (
    files: FileModel[],
    albums: AlbumModel[]
): FileModel[] => {
    const albumPaths = albums.map((album) => album.path);

    return [...files].sort((f1, f2) =>
        f1.path.split('/')[0] === f2.path.split('/')[0] // the same root path
            ? f1.filename.localeCompare(f2.filename)
            : albumPaths.indexOf(f1.path) - albumPaths.indexOf(f2.path)
    );
};
