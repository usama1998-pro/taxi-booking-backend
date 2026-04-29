import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';

/** Documents JWT access via the global Bearer scheme (Swagger **Authorize** — no extra header parameter). */
export function ApiAccessTokenInSwagger() {
  return applyDecorators(ApiBearerAuth('access-token'));
}
