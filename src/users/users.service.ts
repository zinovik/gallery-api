import { Injectable } from '@nestjs/common';
import { User } from '../common/user.type';
import { FirestoreService } from '../firestore/firestore.service';
import { CacheService } from '../cache/cache.service';

const FIRESTORE_USERS_COLLECTION = 'users';
const FIRESTORE_USERS_KEY_NAME = 'email';

@Injectable()
export class UsersService {
    constructor(
        private readonly firestoreService: FirestoreService,
        private readonly cacheService: CacheService
    ) {}

    async findOne(email: string): Promise<User> {
        let users = await this.cacheService.get<User[]>(
            FIRESTORE_USERS_COLLECTION,
            true
        );

        if (!users) {
            users = (await this.firestoreService.getAllFirestoreDocuments(
                FIRESTORE_USERS_COLLECTION,
                FIRESTORE_USERS_KEY_NAME
            )) as User[]; // because we trust our "db";

            await this.cacheService.set(
                FIRESTORE_USERS_COLLECTION,
                users,
                true
            );
        }

        return (
            users.find((user) => user.email === email) || {
                email,
                accesses: [],
                isEditAccess: false,
            }
        );
    }
}
