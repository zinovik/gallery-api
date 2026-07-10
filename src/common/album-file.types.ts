export interface AlbumModel {
    path: string;
    title?: string;
    defaultByDate?: boolean;
    text?: string | string[];
    order?: number;
    accesses?: string[];
    defaultAccesses?: string[];
    resolved?: {
        accesses?: string[];
        title?: string;
    };
}

export interface FileModel {
    filename: string;
    path?: string;
    description?: string;
    text?: string | string[];
    tags?: string[];
    accesses?: string[];
    resolved?: {
        accesses?: string[];
        path?: string;
        storagePath?: string;
    };
}

export interface AlbumDTO {
    path: string;
    title?: string;
    text?: string | string[];
    filesAmount?: number;
    defaultByDate?: boolean;
    order?: number;
    accesses?: string[];
    defaultAccesses?: string[];
    resolved?: {
        accesses?: string[];
        title?: string;
    };
}

export interface FileDTO {
    filename: string;
    path?: string;
    url: string;
    description?: string;
    text?: string | string[];
    tags?: string[];
    accesses?: string[];
    resolved?: {
        accesses?: string[];
        path?: string;
    };
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
    tags?: string[];
    accesses?: string[];
}

export interface SignedUrlModel {
    storagePath: string;
    url: string;
}

export interface SignedUrlModelRead extends SignedUrlModel {
    expiresAt: number;
}
