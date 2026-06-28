import { Injectable } from '@nestjs/common';
import { FirestoreService } from '../firestore/firestore.service';

const FIRESTORE_CACHE_COLLECTION = 'cache';
const FAKE_CACHE_ID = 'fake-cache-id';

interface DbCache<T> {
    [FAKE_CACHE_ID]: string;
    data: T;
}

@Injectable()
export class CacheService {
    private readonly cache = new Map<
        string,
        { data: unknown; expiresAt?: Date }
    >();

    constructor(private readonly firestoreService: FirestoreService) {}

    async get<T>(key: string, isInMemoryOnly?: true): Promise<T | null> {
        let data = this.getInMemory<T>(key);

        if (data || isInMemoryOnly) return data;

        data = await this.getInDb(key);

        if (data) this.setInMemory(key, data); // TODO: expiresAt

        return data ?? null;
    }

    async set<T>(
        key: string,
        data: T,
        isInMemoryOnly?: true,
        ttlMs?: number
    ): Promise<void> {
        this.setInMemory(key, data, ttlMs);

        if (isInMemoryOnly) return;

        await this.setInDb(key, data, ttlMs);
    }

    async invalidateAll(isInMemoryOnly?: true): Promise<void> {
        console.time('cache invalidation');

        for (const key of this.cache.keys()) {
            this.cache.delete(key);
        }

        if (!isInMemoryOnly) {
            await this.firestoreService.removeAllFirestoreDocuments(
                FIRESTORE_CACHE_COLLECTION
            );
        }

        console.timeEnd('cache invalidation');
    }

    private getInMemory<T>(key: string): T | null {
        const cache = this.cache.get(key);

        if (!cache) return null;

        if (cache.expiresAt && cache.expiresAt.getTime() <= Date.now()) {
            this.cache.delete(key);
            return null;
        }

        return cache.data as T;
    }

    private setInMemory<T>(key: string, data: T, ttlMs?: number): void {
        this.cache.set(key, {
            data,
            ...(ttlMs ? { expiresAt: new Date(Date.now() + ttlMs) } : {}),
        });
    }

    private async getInDb<T>(key: string): Promise<T | null> {
        const data = (
            await this.firestoreService.getFirestoreDocuments<DbCache<T>>(
                FIRESTORE_CACHE_COLLECTION,
                [key],
                FAKE_CACHE_ID
            )
        )[0]?.data;

        return data ?? null;
    }

    private async setInDb<T>(
        key: string,
        data: T,
        ttlMs?: number
    ): Promise<void> {
        await this.firestoreService.writeFirestoreDocuments<DbCache<T>>(
            FIRESTORE_CACHE_COLLECTION,
            [
                {
                    [FAKE_CACHE_ID]: key,
                    data,
                },
            ],
            FAKE_CACHE_ID,
            ttlMs
        );
    }
}
