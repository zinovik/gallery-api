export interface Configuration {
    isDevelopment: boolean;
    origin: string;
    maxAge: number;
    clientId: string;
    jwtSecret: string;
}

const configuration: Configuration = {
    isDevelopment: Boolean(process.env['DEVELOPMENT']),
    origin: process.env['DEVELOPMENT']
        ? 'http://localhost:3000'
        : 'https://zinovik.github.io',
    maxAge: parseInt(process.env['MAX_AGE'], 10) || 30 * 24 * 60 * 60 * 1000, // 30 days
    clientId:
        '306312319198-u9h4e07khciuet8hnj00b8fvmq25rlj0.apps.googleusercontent.com',
    jwtSecret: process.env['DEVELOPMENT']
        ? 'local-development-secret'
        : process.env['JWT_SECRET'],
};

export default () => configuration;
