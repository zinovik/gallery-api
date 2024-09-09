import { Injectable } from '@nestjs/common';
import { User } from '../common/user';
import { ACCESS_ALL } from '../config';

@Injectable()
export class UsersService {
    private readonly users = [
        {
            email: 'zinovik@gmail.com',
            accesses: [ACCESS_ALL],
            isEditAccess: true,
        },
        {
            email: 'puchochek@gmail.com',
            accesses: [ACCESS_ALL],
            isEditAccess: false,
        },
    ];

    async findOne(email: string): Promise<User | undefined> {
        return this.users.find((user) => user.email === email);
    }
}
