import { Injectable } from '@nestjs/common';
import { User } from '../common/user';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class UsersService {
    constructor(private readonly storageService: StorageService) {}

    async findOne(email: string): Promise<User> {
        const users = await this.storageService.getUsers();

        return (
            users.find((user) => user.email === email) || {
                email,
                accesses: [],
                isEditAccess: false,
            }
        );
    }
}
