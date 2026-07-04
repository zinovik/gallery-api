import { Injectable } from '@nestjs/common';
import { User } from '../common/user.type';
import { MongoDbService } from '../mongodb/mongodb.service';
import { CacheService } from '../cache/cache.service';

const USERS_CACHE_KEY = 'users';

@Injectable()
export class UsersService {
    constructor(
        private readonly mongoDbService: MongoDbService,
        private readonly cacheService: CacheService
    ) {}

    async findOne(email: string): Promise<User> {
        let users = await this.cacheService.get<User[]>(USERS_CACHE_KEY, true);

        if (!users) {
            users = await this.mongoDbService.getUsers();

            await this.cacheService.set(USERS_CACHE_KEY, users, true);
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
