export interface AlbumModel {
    path: string;
    title: string;
    text?: string | string[];
    isSorted?: true;
    accesses?: string[];
}

export interface FileModel {
    path: string;
    filename: string;
    isNoThumbnail?: true;
    description: string;
    text?: string | string[];
    isVertical?: true;
    accesses?: string[];
}

export interface AlbumDTO {
    path: string;
    title: string;
    text?: string | string[];
    isSorted?: true;
    accesses?: string[];
}

export interface FileDTO {
    path: string;
    filename: string;
    isNoThumbnail?: true;
    description: string;
    text?: string | string[];
    isVertical?: true;
    url: string;
    accesses?: string[];
}

export interface RemovedAlbumDTO {
    path: string;
}

export interface RemovedFileDTO {
    filename: string;
}

export interface AddedAlbumDTO {
    pathPart: string;
    title: string;
    text: string | string[];
    relatedPath: string;
    relation: 'after' | 'before' | 'in';
}

export interface UpdatedAlbumDTO {
    path: string;
    newPath?: string;
    title?: string;
    text?: string | string[];
    accesses?: string[];
}

export interface UpdatedFileDTO {
    filename: string;
    path?: string;
    description?: string;
    text?: string | string[];
    accesses?: string[];
}
