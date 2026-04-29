import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

export class CreateCarDto {
  @ApiProperty({ example: 'Toyota Camry' })
  @IsString()
  carName!: string;

  @ApiProperty({ example: 'ABC-1234' })
  @IsString()
  carNumber!: string;

  @ApiProperty({ example: 4, minimum: 1 })
  @IsInt()
  @Min(1)
  capacity!: number;
}
