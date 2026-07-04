import { Injectable } from '@nestjs/common';
import { MongoDbService } from '../mongodb/mongodb.service';

@Injectable()
export class CacheService {
    private readonly cache = new Map<
        string,
        { data: unknown; expiresAt?: Date }
    >();

    constructor(private readonly mongoDbService: MongoDbService) {}

    async get<T>(cacheKey: string, isInMemoryOnly?: true): Promise<T | null> {
        const inMemoryData = this.getInMemory<T>(cacheKey);

        if (inMemoryData || isInMemoryOnly) return inMemoryData;

        const dbData = await this.mongoDbService.getCache<
            T & { expiresAt?: Date }
        >(cacheKey);

        if (dbData) {
            if (dbData.expiresAt) {
                const ttlMs = new Date(dbData.expiresAt).getTime() - Date.now();

                if (ttlMs > 0) {
                    this.setInMemory(cacheKey, dbData, ttlMs);
                }
            } else {
                this.setInMemory(cacheKey, dbData);
            }
        }

        return dbData ?? null;
    }

    async set<T>(
        cacheKey: string,
        data: T,
        isInMemoryOnly?: true,
        ttlMs?: number
    ): Promise<void> {
        this.setInMemory<T>(cacheKey, data, ttlMs);

        if (isInMemoryOnly) return;

        await this.mongoDbService.setCache<T>(cacheKey, data, ttlMs);
    }

    async invalidateAll(isInMemoryOnly?: true): Promise<void> {
        console.time('cache invalidation');

        for (const key of this.cache.keys()) {
            this.cache.delete(key);
        }

        if (!isInMemoryOnly) {
            await this.mongoDbService.removeCache();
        }

        console.timeEnd('cache invalidation');
    }

    private getInMemory<T>(cacheKey: string): T | null {
        const cache = this.cache.get(cacheKey);

        if (!cache) return null;

        if (cache.expiresAt && cache.expiresAt.getTime() <= Date.now()) {
            this.cache.delete(cacheKey);
            return null;
        }

        return cache.data as T;
    }

    private setInMemory<T>(cacheKey: string, data: T, ttlMs?: number): void {
        this.cache.set(cacheKey, {
            data,
            ...(ttlMs ? { expiresAt: new Date(Date.now() + ttlMs) } : {}),
        });
    }
}
