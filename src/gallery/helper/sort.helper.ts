import { AlbumModel, FileModel } from '../../common/album-file.types';

// Reused for every comparison instead of being recreated implicitly by each
// localeCompare() call - this is the biggest win for large arrays, since
// constructing collator state per comparison is expensive.
const collator = new Intl.Collator();

export const sortAlbums = (
    albums: AlbumModel[],
    files: FileModel[]
): AlbumModel[] => {
    // For every top-level path, find the filename of the last file (in
    // original order) belonging to it. A single forward pass where later
    // files overwrite earlier map entries gives the same result as
    // `.find()` on a reversed copy of `files` - but in O(files.length)
    // total instead of once per top-level pair compared during the sort
    // below (previously up to O(albums.length * files.length)).
    const lastFilenameByTopPath = new Map<string, string>();
    for (const file of files) {
        const slashIndex = file.path.indexOf('/');
        const topPath =
            slashIndex === -1 ? file.path : file.path.slice(0, slashIndex);
        lastFilenameByTopPath.set(topPath, file.filename);
    }

    const topLevelPathsOrdered = albums
        .filter((album) => !album.path.includes('/'))
        .map((album) => album.path)
        .sort((path1, path2) => {
            const lastFilenameAlbum1 = lastFilenameByTopPath.get(path1);
            const lastFilenameAlbum2 = lastFilenameByTopPath.get(path2);
            return lastFilenameAlbum1 && lastFilenameAlbum2
                ? collator.compare(lastFilenameAlbum1, lastFilenameAlbum2)
                : 0;
        });

    // O(1) lookups instead of Array.prototype.indexOf, which is O(n) and
    // was previously called twice per comparison in the main sort below.
    const topLevelIndex = new Map<string, number>();
    topLevelPathsOrdered.forEach((path, index) =>
        topLevelIndex.set(path, index)
    );

    // Split each distinct path once and cache explicit order values up
    // front, instead of re-deriving them on every comparison the sort
    // performs (previously O(n log n) redundant `.split('/')` calls).
    const pathPartsByPath = new Map<string, string[]>();
    const pathOrderMap = new Map<string, number>();
    for (const album of albums) {
        if (!pathPartsByPath.has(album.path)) {
            pathPartsByPath.set(album.path, album.path.split('/'));
        }
        if (album.order !== undefined) {
            pathOrderMap.set(album.path, album.order);
        }
    }

    return [...albums].sort((a1, a2) => {
        const a1PathParts = pathPartsByPath.get(a1.path)!;
        const a2PathParts = pathPartsByPath.get(a2.path)!;

        // different root paths
        if (a1PathParts[0] !== a2PathParts[0]) {
            const i1 = topLevelIndex.get(a1PathParts[0]) ?? -1;
            const i2 = topLevelIndex.get(a2PathParts[0]) ?? -1;
            return i1 - i2;
        }

        // the same root path
        // sub albums sorting
        const minPathParts = Math.min(a1PathParts.length, a2PathParts.length);
        // Build prefixes incrementally (O(1) per step) instead of
        // `slice(0, i + 1).join('/')` (O(i) per step) at the point of use.
        let a1Prefix = a1PathParts[0];
        let a2Prefix = a2PathParts[0];
        for (let i = 1; i < minPathParts; i++) {
            a1Prefix += `/${a1PathParts[i]}`;
            a2Prefix += `/${a2PathParts[i]}`;
            if (a1PathParts[i] !== a2PathParts[i]) {
                // one is sub album of another
                if (a1PathParts[i] === undefined) return -1;
                if (a2PathParts[i] === undefined) return 1;

                // sub albums of one album
                const diffPath1Order = pathOrderMap.get(a1Prefix);
                const diffPath2Order = pathOrderMap.get(a2Prefix);
                if (
                    diffPath1Order !== undefined ||
                    diffPath2Order !== undefined
                ) {
                    if (diffPath2Order === undefined) return -1;
                    if (diffPath1Order === undefined) return 1;
                    return diffPath1Order - diffPath2Order;
                }

                // alphabetical order otherwise
                return collator.compare(a1PathParts[i], a2PathParts[i]);
            }
        }

        if (a1PathParts.length !== a2PathParts.length) {
            return a1PathParts.length - a2PathParts.length;
        }

        return collator.compare(a1.path, a2.path);
    });
};

export const sortFiles = (files: FileModel[]): FileModel[] =>
    [...files].sort((f1, f2) => collator.compare(f1.filename, f2.filename));
