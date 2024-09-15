import { Injectable } from '@nestjs/common';
import { User } from '../common/user';
import { ACCESS_ADMIN } from '../config';

@Injectable()
export class UsersService {
    private readonly users = [
        {
            email: 'zinovik@gmail.com',
            accesses: [ACCESS_ADMIN],
            isEditAccess: true,
        },
        {
            email: 'puchochek@gmail.com',
            accesses: [ACCESS_ADMIN],
            isEditAccess: false,
        },
        {
            email: 'zinovikos@gmail.com',
            accesses: ['family'],
            isEditAccess: false,
        },
        {
            email: 'zinovikv@gmail.com',
            accesses: ['family', 'ero'],
            isEditAccess: false,
        },
        {
            email: 'zinovikn@gmail.com',
            accesses: ['family', 'ero'],
            isEditAccess: false,
        },
    ];

    async findOne(email: string): Promise<User> {
        return (
            this.users.find((user) => user.email === email) || {
                email,
                accesses: [],
                isEditAccess: false,
            }
        );
    }
}
