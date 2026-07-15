import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AlbumModel, FileModel, TokenAccess } from '../common/album-file.types';
import { File } from './schemas/file.schema';
import { Album } from './schemas/album.schema';
import { User } from './schemas/user.schema';
import { Cache } from './schemas/cache.schema';

@Injectable()
export class MongoDbService {
    private readonly ACCESS_ADMIN = 'admin';
    private readonly ACCESS_PUBLIC = 'public';

    constructor(
        @InjectModel('File') private fileModel: Model<File>,
        @InjectModel('Album') private albumModel: Model<Album>,
        @InjectModel('User') private userModel: Model<User>,
        @InjectModel('Cache') private cacheModel: Model<Cache<unknown>>
    ) {}

    private MONGO_FIELD_REMOVED = {
        _id: 0,
        __v: 0,
    } as const;

    async getAllFiles(): Promise<FileModel[]> {
        return await this.fileModel
            .find({}, this.MONGO_FIELD_REMOVED)
            .lean()
            .exec();
    }

    private getDateRangesQueryPart(dateRanges?: string[][]) {
        if (!dateRanges) {
            return [];
        }

        return [
            {
                $or: dateRanges.map(([from, to]) => ({
                    filename: {
                        ...(from ? { $gte: from } : {}),
                        ...(to ? { $lte: to } : {}),
                    },
                })),
            },
        ];
    }

    private getAccessesQueryPart(userAccesses: string[]) {
        if (userAccesses.includes(this.ACCESS_ADMIN)) {
            return [];
        }

        return [
            {
                $or: [
                    {
                        'resolved.accesses': this.ACCESS_PUBLIC,
                    },
                    ...(userAccesses.length
                        ? [
                              {
                                  'resolved.accesses': {
                                      $in: userAccesses,
                                  },
                              },
                          ]
                        : []),
                ],
            },
        ];
    }

    private getFilesQuery(
        path: string,
        userAccesses: string[],
        dateRanges?: string[][],
        tags?: string[],
        tokenAccess?: TokenAccess
    ) {
        return {
            $or: [
                ...(tokenAccess
                    ? [
                          {
                              $and: [
                                  {
                                      'resolved.path': {
                                          $regex: `^${tokenAccess.path}(/|$)`,
                                      },
                                  },
                                  ...this.getDateRangesQueryPart(
                                      tokenAccess.dateRanges
                                  ),
                                  ...(tokenAccess.tags
                                      ? [{ tags: { $in: tokenAccess.tags } }]
                                      : []),
                              ],
                          },
                      ]
                    : []),
                {
                    $and: [
                        ...(path
                            ? [{ 'resolved.path': { $regex: `^${path}(/|$)` } }]
                            : []),
                        ...this.getDateRangesQueryPart(dateRanges),
                        ...(tags ? [{ tags: { $in: tags } }] : []),
                        ...this.getAccessesQueryPart(userAccesses),
                    ],
                },
            ],
        };
    }

    async getFiles(
        path: string,
        userAccesses: string[],
        dateRanges?: string[][],
        tags?: string[],
        tokenAccess?: TokenAccess
    ): Promise<FileModel[]> {
        if (!path && !dateRanges && !tags) {
            return [];
        }

        const logMessage = this.buildLogMessage('getFiles', path);

        console.time(logMessage);

        const query = this.getFilesQuery(
            path,
            userAccesses,
            dateRanges,
            tags,
            tokenAccess
        );

        const files = await this.fileModel
            .find(query, this.MONGO_FIELD_REMOVED)
            .lean()
            .exec();

        console.timeEnd(logMessage);

        console.log('getFiles', JSON.stringify(query, null, 2), files.length);

        return files;
    }

    async upsertFiles(
        files: {
            filename: string;
            set?: Partial<FileModel>;
            unset?: Record<string, ''>;
        }[]
    ): Promise<void> {
        if (files.length === 0) {
            return;
        }

        await this.fileModel.bulkWrite(
            files.map((file) => ({
                updateOne: {
                    filter: { filename: file.filename },
                    update: {
                        ...(file.set && Object.keys(file.set).length > 0
                            ? { $set: file.set }
                            : {}),
                        ...(file.unset && Object.keys(file.unset).length > 0
                            ? { $unset: file.unset }
                            : {}),
                    },
                    upsert: true,
                },
            })),
            { ordered: false }
        );
    }

    async removeFiles(filenames: string[]): Promise<void> {
        await this.fileModel.deleteMany({ filenames: { $in: filenames } });
    }

    async getAllAlbums(): Promise<AlbumModel[]> {
        return await this.albumModel
            .find({}, this.MONGO_FIELD_REMOVED)
            .lean()
            .exec();
    }

    private getAlbumsQuery(
        path: string,
        userAccesses: string[],
        isByDateOrTags: boolean,
        tokenAccess?: TokenAccess
    ) {
        const pathParts = path.split('/');

        const parentPaths = pathParts.map((_, index) =>
            pathParts.slice(0, index + 1).join('/')
        );

        return {
            $or: [
                ...(tokenAccess
                    ? [
                          {
                              'resolved.path': {
                                  $regex: `^${tokenAccess.path}(/|$)`,
                              },
                          },
                      ]
                    : []),
                {
                    $and: [
                        ...(path
                            ? [
                                  {
                                      $or: [
                                          ...parentPaths
                                              .slice(0, -1)
                                              .map((parent) => ({
                                                  path: parent,
                                              })),
                                          {
                                              path: {
                                                  $regex: `^${path}(/|$)`,
                                              },
                                          },
                                      ],
                                  },
                              ]
                            : isByDateOrTags
                              ? [] // we need it because we don't know the latest albums or albums that includes files with some tags TODO: avoid it
                              : [
                                    {
                                        path: { $not: { $regex: '/' } }, // root paths
                                    },
                                ]),
                        ...this.getAccessesQueryPart(userAccesses),
                    ],
                },
            ],
        };
    }

    async getAlbums(
        path: string,
        userAccesses: string[],
        isByDateOrTags: boolean,
        tokenAccess?: TokenAccess
    ): Promise<AlbumModel[]> {
        const logMessage = this.buildLogMessage('getAlbums', path);

        console.time(logMessage);

        const query = this.getAlbumsQuery(
            path,
            userAccesses,
            isByDateOrTags,
            tokenAccess
        );

        const albums = await this.albumModel
            .find(query, this.MONGO_FIELD_REMOVED)
            .lean()
            .exec();

        console.timeEnd(logMessage);

        console.log('getAlbums', JSON.stringify(query, null, 2), albums.length);

        return albums;
    }

    async getRootAlbumsWithFileAmounts(
        userAccesses: string[]
    ): Promise<AlbumModel[]> {
        const logMessage = this.buildLogMessage('getRootAlbumsWithFileAmounts');

        console.time(logMessage);

        const query = this.getAlbumsQuery('', userAccesses, false);

        const albums = await this.albumModel
            .aggregate([
                {
                    $match: query,
                },
                {
                    $lookup: {
                        from: 'files',
                        localField: 'path',
                        foreignField: 'resolved.rootPath',
                        pipeline: [
                            {
                                $match: {
                                    ...this.getAccessesQueryPart(
                                        userAccesses
                                    )[0],
                                },
                            },
                            {
                                $count: 'count',
                            },
                        ],
                        as: 'filesAmountStats',
                    },
                },
                {
                    $set: {
                        filesAmount: {
                            $ifNull: [
                                {
                                    $arrayElemAt: [
                                        '$filesAmountStats.count',
                                        0,
                                    ],
                                },
                                0,
                            ],
                        },
                    },
                },
                {
                    $project: {
                        ...this.MONGO_FIELD_REMOVED,
                        filesAmountStats: 0,
                    },
                },
            ])
            .exec();

        console.timeEnd(logMessage);

        return albums;
    }

    async upsertAlbums(
        albums: {
            path: string;
            set?: Partial<AlbumModel>;
            unset?: Record<string, ''>;
        }[]
    ): Promise<void> {
        if (albums.length === 0) {
            return;
        }

        await this.albumModel.bulkWrite(
            albums.map((album) => ({
                updateOne: {
                    filter: { path: album.path },
                    update: {
                        ...(album.set && Object.keys(album.set).length > 0
                            ? { $set: album.set }
                            : {}),
                        ...(album.unset && Object.keys(album.unset).length > 0
                            ? { $unset: album.unset }
                            : {}),
                    },
                    upsert: true,
                },
            })),
            { ordered: false }
        );
    }

    async removeAlbums(paths: string[]): Promise<void> {
        await this.albumModel.deleteMany({ paths: { $in: paths } });
    }

    async getUsers(emails?: string[]): Promise<User[]> {
        return this.userModel
            .find(
                emails?.length ? { emails: { $in: emails } } : {},
                this.MONGO_FIELD_REMOVED
            )
            .lean()
            .exec();
    }

    async getCaches<T>(cacheKeys: string[]): Promise<Cache<T>[]> {
        const logMessage = this.buildLogMessage('getCaches', cacheKeys);

        console.time(logMessage);

        const caches = await this.cacheModel
            .find({ cacheKey: { $in: cacheKeys } }, this.MONGO_FIELD_REMOVED)
            .lean()
            .exec();

        console.timeEnd(logMessage);

        return caches as Cache<T>[];
    }

    async upsertCaches<T>(
        caches: { cacheKey: string; data: T; expiresAt: Date }[]
    ): Promise<void> {
        await this.cacheModel.bulkWrite(
            caches.map((cache) => ({
                updateOne: {
                    filter: { cacheKey: cache.cacheKey },
                    update: { $set: cache },
                    upsert: true,
                },
            })),
            { ordered: false }
        );
    }

    async removeCaches(cacheKeys?: string[]): Promise<void> {
        await this.cacheModel.deleteMany(
            cacheKeys ? { cacheKey: { $in: cacheKeys } } : {}
        );
    }

    private buildLogMessage(
        operation: string,
        parameter?: string | string[]
    ): string {
        const message = `🟡 MONGO DB: ${operation}`;

        if (parameter === undefined) {
            return message;
        }

        if (!Array.isArray(parameter)) {
            return `${message} (${parameter})`;
        }

        const details =
            parameter.length <= 5 ? `: ${parameter.join(', ')}` : '';

        return `${message} (${parameter.length} doc(s)${details})`;
    }
}
