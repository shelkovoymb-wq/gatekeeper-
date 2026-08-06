import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { Auth, JwtAuthGuard } from './jwt-auth.guard.js';
import type { AuthContext } from './auth.types.js';

interface RegisterDto {
  email: string;
  password: string;
  companyName: string;
}
interface LoginDto {
  email: string;
  password: string;
}
interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // 10 попыток/мин с одного IP — против скриптовой рассылки фейковых аккаунтов.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  // 5 попыток/мин с одного IP — против брутфорса пароля.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Auth() auth: AuthContext) {
    return this.auth.me(auth);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(@Auth() auth: AuthContext, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(auth.userId, dto?.currentPassword, dto?.newPassword);
  }
}
