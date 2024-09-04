export interface AlbumInterface {
    path: string;
    title: string;
    text?: string | string[];
    isSorted?: true;
}

export interface FileInterface {
    path: string;
    filename: string;
    isTitle?: true;
    isNoThumbnail?: true;
    description: string;
    text?: string | string[];
    isVertical?: true;
}

export interface RemovedAlbum {
    path: string;
}

export interface RemovedFile {
    filename: string;
}

export interface AddedAlbum {
    pathPart: string;
    title: string;
    text: string | string[];
    relatedPath: string;
    relation: 'after' | 'before' | 'in';
}

export interface UpdatedAlbum {
    path: string;
    newPath?: string;
    title?: string;
    text?: string | string[];
}

export interface UpdatedFile {
    filename: string;
    path?: string;
    description?: string;
    text?: string | string[];
}
