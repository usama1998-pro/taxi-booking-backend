import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignDriverLinkedUserDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Existing staff or passenger `User` id to attach to this driver.',
  })
  @IsUUID()
  userId!: string;
}
