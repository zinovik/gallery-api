import { IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsStringOrArrayOfStrings } from './is-string-or-array-of-strings.decorator';
import { AddAlbumRelation } from '../../common/album-file.types';

class RemovedAlbumInDTO {
    @IsString()
    @ApiProperty({ type: String, example: 'board-games/unsorted' })
    path: string;
}

class RemovedFileInDTO {
    @IsString()
    @ApiProperty({ type: String, example: '20000000_000000.jpg' })
    filename: string;
}

class AddedAlbumInDTO {
    @IsString()
    @ApiProperty({ type: String, example: 'board-games/unsorted' })
    path: string;

    @IsString()
    @ApiProperty()
    title: string;

    @IsStringOrArrayOfStrings()
    @IsOptional()
    @ApiProperty()
    text: string | string[];

    @IsString()
    @ApiProperty()
    relatedPath: string;

    @IsEnum(AddAlbumRelation)
    @ApiProperty()
    relation: AddAlbumRelation;
}

class UpdatedAlbumInDTO {
    @IsString()
    @ApiProperty({ type: String, example: 'board-games/unsorted' })
    path: string;

    @IsString()
    @IsOptional()
    @ApiProperty()
    newPath?: string;

    @IsString()
    @IsOptional()
    @ApiProperty()
    title?: string;

    @IsStringOrArrayOfStrings()
    @IsOptional()
    @ApiProperty()
    text?: string | string[];

    @IsString({ each: true })
    @IsOptional()
    @ApiProperty()
    accesses?: string[];
}

class UpdatedFileInDTO {
    @IsString()
    @ApiProperty({ type: String, example: '20241231_000000.jpg' })
    filename: string;

    @IsString()
    @IsOptional()
    @ApiProperty({ type: String, example: 'board-games/unsorted' })
    path?: string;

    @IsString()
    @IsOptional()
    @ApiProperty()
    description?: string;

    @IsStringOrArrayOfStrings()
    @IsOptional()
    @ApiProperty()
    text?: string | string[];

    @IsString({ each: true })
    @IsOptional()
    @ApiProperty()
    accesses?: string[];
}

class RemoveInDto {
    @ValidateNested()
    @Type(() => RemovedAlbumInDTO)
    @IsOptional()
    @ApiProperty()
    albums?: RemovedAlbumInDTO[];

    @ValidateNested()
    @Type(() => RemovedFileInDTO)
    @IsOptional()
    @ApiProperty()
    files?: RemovedFileInDTO[];
}

class AddInDto {
    @ValidateNested()
    @Type(() => AddedAlbumInDTO)
    @IsOptional()
    @ApiProperty()
    albums?: AddedAlbumInDTO[];
}

class UpdateInDto {
    @ValidateNested()
    @Type(() => UpdatedAlbumInDTO)
    @IsOptional()
    @ApiProperty()
    albums?: UpdatedAlbumInDTO[];

    @ValidateNested()
    @Type(() => UpdatedFileInDTO)
    @IsOptional()
    @ApiProperty()
    files?: UpdatedFileInDTO[];
}

export class EditInDto {
    @ValidateNested()
    @Type(() => RemoveInDto)
    @IsOptional()
    @ApiProperty()
    remove?: RemoveInDto;

    @ValidateNested()
    @Type(() => AddInDto)
    @IsOptional()
    @ApiProperty()
    add?: AddInDto;

    @ValidateNested()
    @Type(() => UpdateInDto)
    @IsOptional()
    @ApiProperty()
    update?: UpdateInDto;
}
