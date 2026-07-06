import { Injectable } from '@nestjs/common';
import { MongoDbService } from '../mongodb/mongodb.service';

@Injectable()
export class CacheService {
    private readonly cacheMap = new Map<
        string,
        { data: unknown; expiresAt: Date }
    >();

    constructor(private readonly mongoDbService: MongoDbService) {}

    async getCache<T>(
        cacheKey: string,
        isInMemoryOnly?: true
    ): Promise<T | undefined> {
        const cacheMap = await this.getCacheMap<T>([cacheKey], isInMemoryOnly);

        return cacheMap.get(cacheKey);
    }

    async setCache<T>(
        cacheKey: string,
        data: T,
        expiresAt: Date,
        isInMemoryOnly?: true
    ): Promise<void> {
        await this.setCaches(
            [
                {
                    cacheKey,
                    data,
                    expiresAt,
                },
            ],
            isInMemoryOnly
        );
    }

    async getCacheMap<T>(
        cacheKeys: string[],
        isInMemoryOnly?: true
    ): Promise<Map<string, T>> {
        const cacheMap = this.getInMemoryCacheMap<T>(cacheKeys);

        const missingInMemoryCacheKeys = cacheKeys.filter(
            (key) => !cacheMap.has(key)
        );

        if (missingInMemoryCacheKeys.length === 0 || isInMemoryOnly) {
            return cacheMap;
        }

        const dbCaches = await this.mongoDbService.getCaches<T>(
            missingInMemoryCacheKeys
        );

        const newInMemoryCaches: {
            cacheKey: string;
            data: T;
            expiresAt: Date;
        }[] = [];

        for (const dbCache of dbCaches) {
            newInMemoryCaches.push(dbCache);
            cacheMap.set(dbCache.cacheKey, dbCache.data);
        }

        this.setInMemoryCaches<T>(newInMemoryCaches);

        return cacheMap;
    }

    async setCaches<T>(
        caches: { cacheKey: string; data: T; expiresAt: Date }[],
        isInMemoryOnly?: true
    ): Promise<void> {
        this.setInMemoryCaches<T>(caches);

        if (isInMemoryOnly) return;

        await this.mongoDbService.upsertCaches<T>(caches);
    }

    async invalidate(
        cacheKeys: string[],
        isInMemoryOnly?: true
    ): Promise<void> {
        console.time('cache invalidation');

        for (const cacheKey of cacheKeys) {
            this.cacheMap.delete(cacheKey);
        }

        if (!isInMemoryOnly) {
            await this.mongoDbService.removeCaches(cacheKeys);
        }

        console.timeEnd('cache invalidation');
    }

    private getInMemoryCacheMap<T>(cacheKeys: string[]): Map<string, T> {
        const inMemoryCacheMap = new Map<string, T>();

        for (const cacheKey of cacheKeys) {
            const cache = this.cacheMap.get(cacheKey);

            if (!cache) {
                continue;
            }

            if (cache.expiresAt.getTime() <= Date.now()) {
                this.cacheMap.delete(cacheKey);
            } else {
                inMemoryCacheMap.set(cacheKey, cache.data as T);
            }
        }

        return inMemoryCacheMap;
    }

    private setInMemoryCaches<T>(
        caches: { cacheKey: string; data: T; expiresAt: Date }[]
    ): void {
        for (const { cacheKey, data, expiresAt } of caches) {
            this.cacheMap.set(cacheKey, {
                data,
                expiresAt,
            });
        }
    }
}
