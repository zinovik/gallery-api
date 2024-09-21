import { AlbumModel, FileModel } from '../types';

export const getFilename = (filePath: string): string =>
    filePath.split('/').pop();

export const addNewAlbumsFromFiles = (
    albums: AlbumModel[],
    files: FileModel[]
): AlbumModel[] => [
    ...albums,
    ...[
        ...new Set(
            files
                .filter(
                    (file) => !albums.some((album) => album.path === file.path)
                )
                .map((file) => file.path)
        ),
    ].map((path) => {
        const [_, ...parts] = path.split('/');

        return {
            title: parts.join('/'),
            path,
        };
    }),
];
