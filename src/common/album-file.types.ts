export interface AlbumModel {
    path: string;
    title?: string;
    defaultByDate?: boolean;
    text?: string | string[];
    order?: number;
    accesses?: string[];
    defaultAccesses?: string[];
}

export interface FileModel {
    filename: string;
    path?: string;
    description?: string;
    text?: string | string[];
    accesses?: string[];
}

export interface AlbumDTO {
    path: string;
    title: string;
    text?: string | string[];
    filesAmount?: number;
    defaultByDate?: boolean;
    order?: number;
    accesses?: string[];
    resolvedAccesses?: string[];
    defaultAccesses?: string[];
    isDb?: true;
}

export interface FileDTO {
    filename: string;
    path: string;
    url: string;
    description?: string;
    text?: string | string[];
    accesses?: string[];
    resolvedAccesses?: string[];
    isDb?: true;
}

export interface RemovedAlbum {
    path: string;
}

export interface RemovedFile {
    filename: string;
}

export interface AddedAlbum {
    path: string;
    title?: string;
    text?: string | string[];
    defaultByDate?: boolean;
    order?: number;
    accesses?: string[];
    defaultAccesses?: string[];
}

export interface AddedFile {
    filename: string;
    path?: string;
    description?: string;
    text?: string | string[];
    accesses?: string[];
}

export interface UpdatedAlbum {
    path: string;
    newPath?: string;
    title?: string;
    text?: string | string[];
    defaultByDate?: boolean;
    order?: number;
    accesses?: string[];
    defaultAccesses?: string[];
}

export interface UpdatedFile {
    filename: string;
    path?: string;
    description?: string;
    text?: string | string[];
    accesses?: string[];
}
