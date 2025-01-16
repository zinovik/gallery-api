import { AlbumModel, FileModel } from '../../common/album-file.types';

export const sortAlbums = (
    albums: AlbumModel[],
    files: FileModel[]
): AlbumModel[] => {
    const rootPathsWithSortedSubAlbums = albums
        .filter((album) => album.isSorted)
        .map((album) => album.path);

    const reversedFiles = [...files].reverse();

    const topLevelPathsOrdered = albums
        .filter((album) => !album.path.includes('/'))
        .map((album) => album.path)
        .sort((path1, path2) => {
            const lastFilenameAlbum1 = reversedFiles.find(
                (file) =>
                    file.path === path1 || file.path.startsWith(`${path1}/`)
            ).filename;
            const lastFilenameAlbum2 = reversedFiles.find(
                (file) =>
                    file.path === path2 || file.path.startsWith(`${path2}/`)
            ).filename;

            return lastFilenameAlbum1.localeCompare(lastFilenameAlbum2);
        });

    return [...albums].sort((a1, a2) => {
        const a1PathParts = a1.path.split('/');
        const a2PathParts = a2.path.split('/');

        // root paths
        if (a1PathParts.length === 1 && a2PathParts.length === 1) {
            return (
                topLevelPathsOrdered.indexOf(a1PathParts[0]) -
                topLevelPathsOrdered.indexOf(a2PathParts[0])
            );
        }

        // albums from different root paths (one can be root, doesn't matter)
        if (a1PathParts[0] !== a2PathParts[0]) {
            return (
                topLevelPathsOrdered.indexOf(a1PathParts[0]) -
                topLevelPathsOrdered.indexOf(a2PathParts[0])
            );
        }

        // the same root path

        // should sort sub albums
        if (rootPathsWithSortedSubAlbums.includes(a1PathParts[0])) {
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

export const sortFiles = (files: FileModel[]): FileModel[] => {
    return [...files].sort((f1, f2) => f1.filename.localeCompare(f2.filename));
};
