import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService, type AuthResult } from './auth.service.js';
import { Auth, JwtAuthGuard } from './jwt-auth.guard.js';
import { OAuthService } from './oauth/oauth.service.js';
import { TwoFactorService } from './two-factor.service.js';
import type { AuthContext, TwoFactorChallenge } from './auth.types.js';

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
interface TwoFactorVerifyDto {
  challengeToken: string;
  code: string;
}
interface CodeDto {
  code: string;
}
interface DisableTwoFactorDto {
  password?: string;
  code?: string;
}
interface OAuthCallbackDto {
  code: string;
  state: string;
}

@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly twoFactor: TwoFactorService,
    private readonly oauth: OAuthService,
  ) {}

  // 10 попыток/мин с одного IP — против скриптовой рассылки фейковых аккаунтов.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  // 5 попыток/мин с одного IP — против брутфорса пароля.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthResult | TwoFactorChallenge> {
    return this.auth.login(dto?.email, dto?.password);
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

  // ─── Двухфакторная аутентификация ─────────────────────────────────────────

  /**
   * Обмен challenge-токена на сессию. Лимит по IP дополняет счётчик неудач
   * на пользователя внутри TwoFactorService.
   */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('2fa/verify')
  async verifyTwoFactor(@Body() dto: TwoFactorVerifyDto): Promise<AuthResult> {
    const userId = await this.auth.consumeChallenge(String(dto?.challengeToken ?? ''));
    await this.twoFactor.verifyLogin(userId, String(dto?.code ?? ''));
    return this.auth.issueSessionFor(userId);
  }

  @Get('2fa')
  @UseGuards(JwtAuthGuard)
  twoFactorStatus(@Auth() auth: AuthContext) {
    return this.twoFactor.status(auth.userId);
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  setupTwoFactor(@Auth() auth: AuthContext) {
    return this.twoFactor.beginSetup(auth.userId);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  enableTwoFactor(@Auth() auth: AuthContext, @Body() dto: CodeDto) {
    return this.twoFactor.confirmSetup(auth.userId, String(dto?.code ?? ''));
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  disableTwoFactor(@Auth() auth: AuthContext, @Body() dto: DisableTwoFactorDto) {
    return this.twoFactor.disable(auth.userId, {
      password: dto?.password,
      code: dto?.code,
    });
  }

  @Post('2fa/backup-codes')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  regenerateBackupCodes(@Auth() auth: AuthContext, @Body() dto: CodeDto) {
    return this.twoFactor.regenerateBackupCodes(auth.userId, String(dto?.code ?? ''));
  }

  // ─── Вход через Google / Яндекс ───────────────────────────────────────────

  /** Какие кнопки показывать на форме входа. */
  @Get('oauth/providers')
  oauthProviders() {
    return this.oauth.listProviders();
  }

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get('oauth/:provider/url')
  oauthUrl(@Param('provider') provider: string, @Query('mode') mode?: string) {
    return this.oauth.buildAuthorizeUrl(this.oauth.parseProvider(provider), parseMode(mode));
  }

  /**
   * Завершение входа. Возвращает либо сессию, либо 2FA-челлендж — включённая
   * двухфакторка обязательна и для входа через внешнего провайдера.
   */
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('oauth/:provider/callback')
  async oauthCallback(
    @Param('provider') provider: string,
    @Body() dto: OAuthCallbackDto,
  ): Promise<(AuthResult & { created: boolean }) | TwoFactorChallenge> {
    const identity = await this.oauth.loginWithCode(
      this.oauth.parseProvider(provider),
      String(dto?.code ?? ''),
      String(dto?.state ?? ''),
    );
    if (identity.totpEnabled) return this.auth.buildChallenge(identity.userId);
    const session = await this.auth.issueSessionFor(identity.userId);
    return { ...session, created: identity.created };
  }

  @Post('oauth/:provider/link')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  oauthLink(
    @Auth() auth: AuthContext,
    @Param('provider') provider: string,
    @Body() dto: OAuthCallbackDto,
  ) {
    return this.oauth.linkToUser(
      this.oauth.parseProvider(provider),
      auth.userId,
      String(dto?.code ?? ''),
      String(dto?.state ?? ''),
    );
  }

  @Get('identities')
  @UseGuards(JwtAuthGuard)
  identities(@Auth() auth: AuthContext) {
    return this.oauth.listIdentities(auth.userId);
  }

  @Delete('identities/:provider')
  @UseGuards(JwtAuthGuard)
  unlink(@Auth() auth: AuthContext, @Param('provider') provider: string) {
    return this.oauth.unlink(auth.userId, this.oauth.parseProvider(provider));
  }
}

function parseMode(raw?: string): 'login' | 'link' {
  if (raw === undefined || raw === 'login') return 'login';
  if (raw === 'link') return 'link';
  throw new BadRequestException('mode должен быть login или link');
}
