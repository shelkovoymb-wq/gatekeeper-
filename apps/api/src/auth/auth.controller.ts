import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
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

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Auth() auth: AuthContext) {
    return this.auth.me(auth);
  }
}
