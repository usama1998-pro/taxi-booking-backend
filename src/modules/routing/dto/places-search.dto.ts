import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class PlacesSearchDto {
  @ApiProperty({ example: 'Barcelona Airport' })
  @IsString()
  @MinLength(1)
  input!: string;
}
