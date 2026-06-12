import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class RouteQuoteDto {
  @ApiProperty({ example: 'Barcelona-El Prat International Airport (BCN)' })
  @IsString()
  @MinLength(1)
  from!: string;

  @ApiProperty({ example: 'Plaça de Catalunya, Barcelona' })
  @IsString()
  @MinLength(1)
  to!: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  @Max(20)
  passengerCount!: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(0)
  @Max(50)
  luggageCount!: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  infantCarrierCount?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  childSeatCount?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  boosterCount?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isReturnTrip?: boolean;
}
