import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginResponseDto, SigninDto, SignoutResponseDto } from './dto/signin.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('verify-code')
  @ApiOperation({
    summary: 'Verify a 4-digit driver code',
    description:
      'Validates a backend-assigned 4-digit code and returns an access token for the matching active driver account.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid code or disabled driver account' })
  verifyCode(@Body() dto: VerifyCodeDto) {
    return this.authService.verifyCode(dto);
  }

  @Public()
  @Post('signin')
  @ApiOperation({
    summary: 'Sign in as driver or admin',
    description:
      'Resolves by email: driver accounts first, then staff `User` rows with `is_admin` (see npm run create-admin).',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  signin(@Body() dto: SigninDto) {
    return this.authService.signin(dto);
  }

  @Public()
  @Post('signup')
  @ApiOperation({
    summary: 'Sign up as user or driver',
    description:
      'Creates the account and returns the same JWT payload as signin (access_token, expires_in, expires_at).',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Email or phone already registered',
  })
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Public()
  @Post('signout')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Sign out',
    description:
      'With a valid Bearer access token, marks it revoked until `exp` so verify and protected APIs reject it. Without a header, returns `revoked: false` — the client should still delete stored tokens. In Swagger, use **Authorize** and paste only the `access_token` (optional for this call).',
  })
  @ApiOkResponse({ type: SignoutResponseDto })
  @ApiResponse({
    status: 401,
    description: 'Authorization present but token invalid or expired',
  })
  signout(@Req() req: Request) {
    const header =
      req.get('Authorization') ??
      req.headers.authorization ??
      req.headers['Authorization'];
    const value =
      typeof header === 'string'
        ? header
        : Array.isArray(header)
          ? header[0]
          : undefined;
    return this.authService.signout(value);
  }

  @Public()
  @Get('verify')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Verify access token',
    description:
      'Validates the JWT and returns the authenticated principal (sub, email, typ, is_admin, expires_in, expires_at). In Swagger, click **Authorize**, paste only the `access_token` from signin/signup (the `Bearer` prefix is added automatically). Responds with 401 if the token is missing, invalid, or revoked (e.g. disabled driver).',
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  verify(@Req() req: Request) {
    const header =
      req.get('Authorization') ??
      req.headers.authorization ??
      req.headers['Authorization'];
    const value =
      typeof header === 'string'
        ? header
        : Array.isArray(header)
          ? header[0]
          : undefined;
    return this.authService.verifyBearer(value);
  }
}
