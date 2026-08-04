import { Min, Max, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class ShareQueryInDto {
    @Type(() => Number)
    @IsNumber({}, { message: 'The value must be a number' })
    @Min(0.01, { message: 'The value must be greater than 0' })
    @Max(168, { message: 'The value must be equal or less than 168' })
    expires_in_h: number;
}
