export interface AuthContext {
  userId: string;
  clientId: string | null; // null = владелец платформы
  role: string; // owner | client_admin | client_staff
  email: string | null;
}

/**
 * `typ` разделяет назначения токенов, подписанных одним JWT_SECRET:
 *  - `access`      — полноценная сессия кабинета (guard пускает только его);
 *  - `2fa`         — промежуточный токен «пароль верен, ждём код»;
 *  - `oauth_state` — CSRF-state в OAuth-редиректе.
 * Токены, выпущенные до появления 2FA, поля не имеют — отсутствие `typ`
 * трактуется как `access`, чтобы не разлогинить всех при выкатке.
 */
export type TokenType = 'access' | '2fa' | 'oauth_state';

export interface JwtPayload {
  sub: string; // userId
  cid: string | null; // clientId
  role: string;
  email: string | null;
  typ?: TokenType;
}

/** Промежуточный токен между «пароль принят» и «код подтверждён». */
export interface TwoFactorChallengePayload {
  sub: string; // userId
  typ: '2fa';
}

export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
  /** Способы, которыми можно закрыть челлендж (для подсказок в UI). */
  methods: ('totp' | 'backup_code')[];
}

export function isTwoFactorChallenge(v: unknown): v is TwoFactorChallenge {
  return typeof v === 'object' && v !== null && 'twoFactorRequired' in v;
}
