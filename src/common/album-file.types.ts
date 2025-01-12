export interface AlbumModel {
    path: string;
    title: string;
    defaultByDate?: true;
    text?: string | string[];
    isSorted?: true;
    accesses?: string[];
}

export interface FileModel {
    path: string;
    filename: string;
    isNoThumbnail?: true;
    description?: string;
    text?: string | string[];
    accesses?: string[];
}

export interface Album {
    path: string;
    title: string;
    filesAmount: number;
    defaultByDate?: true;
    text?: string | string[];
    isSorted?: true;
    accesses?: string[];
}

export interface File {
    path: string;
    filename: string;
    isNoThumbnail?: true;
    description?: string;
    text?: string | string[];
    url: string;
    accesses?: string[];
}

export interface RemovedAlbum {
    path: string;
}

export interface RemovedFile {
    filename: string;
}

export enum AddAlbumRelation {
    after = 'after',
    before = 'before',
}

export interface AddedAlbum {
    path: string;
    title: string;
    text: string | string[];
    relatedPath: string;
    relation: AddAlbumRelation;
}

export interface UpdatedAlbum {
    path: string;
    newPath?: string;
    title?: string;
    text?: string | string[];
    accesses?: string[];
}

export interface UpdatedFile {
    filename: string;
    path?: string;
    description?: string;
    text?: string | string[];
    accesses?: string[];
}
