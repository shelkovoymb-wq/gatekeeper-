import { beforeEach, describe, expect, it } from 'vitest';
import { SecretBox } from '../common/crypto.js';
import type { Env } from '../config/env.js';
import { createFakeDb, type FakeDb } from '../owner/fake-db.js';
import { hashBackupCodes } from './backup-codes.js';
import { TwoFactorService } from './two-factor.service.js';
import { generateTotpSecret, totp, TOTP_PERIOD_SEC } from './totp.js';

const KEY = Buffer.alloc(32, 7).toString('base64');
const env = { TOTP_ISSUER: 'Gatekeeper' } as Env;

/** Строка client_users в том виде, в каком её выбирает requireUser. */
function userRow(over: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'owner@example.com',
    passwordHash: null,
    totpSecretEnc: null,
    totpEnabled: false,
    totpConfirmedAt: null,
    totpBackupCodes: [],
    totpLastStep: null,
    ...over,
  };
}

describe('TwoFactorService', () => {
  let db: any;
  let fake: FakeDb;
  let box: SecretBox;
  let svc: TwoFactorService;

  beforeEach(() => {
    ({ db, fake } = createFakeDb());
    box = new SecretBox(KEY);
    svc = new TwoFactorService(db, env, box);
  });

  describe('beginSetup', () => {
    it('выдаёт секрет и otpauth-URL, сохраняя секрет ТОЛЬКО в зашифрованном виде', async () => {
      fake.queue([userRow()], []);
      const res = await svc.beginSetup('user-1');

      expect(res.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(res.otpauthUrl).toContain(`secret=${res.secret}`);
      expect(res.otpauthUrl).toContain('issuer=Gatekeeper');

      const [stored] = fake.argsOf('set') as [Record<string, string>];
      expect(stored.totpSecretEnc).toBeTruthy();
      expect(stored.totpSecretEnc).not.toContain(res.secret);
      expect(box.decrypt(stored.totpSecretEnc)).toBe(res.secret);
    });

    it('не даёт перенастроить уже включённую 2FA', async () => {
      fake.queue([userRow({ totpEnabled: true })]);
      await expect(svc.beginSetup('user-1')).rejects.toThrow(/уже включена/);
    });
  });

  describe('confirmSetup', () => {
    it('включает 2FA по верному коду и выдаёт 10 резервных кодов', async () => {
      const secret = generateTotpSecret();
      fake.queue([userRow({ totpSecretEnc: box.encrypt(secret) })], []);

      const { backupCodes } = await svc.confirmSetup('user-1', totp(secret));
      expect(backupCodes).toHaveLength(10);

      const [stored] = fake.argsOf('set') as [Record<string, unknown>];
      expect(stored.totpEnabled).toBe(true);
      expect(stored.totpConfirmedAt).toBeInstanceOf(Date);
      // В БД уходят хеши, а не сами коды.
      expect(stored.totpBackupCodes).toEqual(hashBackupCodes(backupCodes));
      expect(JSON.stringify(stored.totpBackupCodes)).not.toContain(backupCodes[0]);
    });

    it('не включает 2FA по неверному коду', async () => {
      const secret = generateTotpSecret();
      fake.queue([userRow({ totpSecretEnc: box.encrypt(secret) })]);
      await expect(svc.confirmSetup('user-1', '000000')).rejects.toThrow(/код неверен/);
      expect(fake.argsOf('set')).toBeUndefined();
    });

    it('требует сначала запросить секрет', async () => {
      fake.queue([userRow()]);
      await expect(svc.confirmSetup('user-1', '123456')).rejects.toThrow(/setup/);
    });
  });

  describe('verifyLogin', () => {
    it('пропускает по действующему TOTP-коду', async () => {
      const secret = generateTotpSecret();
      fake.queue([userRow({ totpEnabled: true, totpSecretEnc: box.encrypt(secret) })], []);
      await expect(svc.verifyLogin('user-1', totp(secret))).resolves.toBeUndefined();
    });

    it('не принимает тот же код повторно внутри его 30-секундного окна', async () => {
      const secret = generateTotpSecret();
      const now = Date.now();
      const step = Math.floor(now / 1000 / TOTP_PERIOD_SEC);
      // totpLastStep уже равен текущему шагу — значит код этого окна использован.
      fake.queue([
        userRow({ totpEnabled: true, totpSecretEnc: box.encrypt(secret), totpLastStep: step }),
      ]);
      await expect(svc.verifyLogin('user-1', totp(secret, now))).rejects.toThrow(/неверный код/);
    });

    it('принимает резервный код и сразу его выжигает', async () => {
      const secret = generateTotpSecret();
      const codes = ['ABCDE-FGHJK', 'MNPQR-STVWX'];
      fake.queue(
        [
          userRow({
            totpEnabled: true,
            totpSecretEnc: box.encrypt(secret),
            totpBackupCodes: hashBackupCodes(codes),
          }),
        ],
        [],
      );

      await expect(svc.verifyLogin('user-1', 'abcde fghjk')).resolves.toBeUndefined();
      const [stored] = fake.argsOf('set') as [{ totpBackupCodes: string[] }];
      expect(stored.totpBackupCodes).toEqual(hashBackupCodes([codes[1]]));
    });

    it('блокирует после 5 неудачных попыток подряд', async () => {
      const secret = generateTotpSecret();
      const row = userRow({ totpEnabled: true, totpSecretEnc: box.encrypt(secret) });
      for (let i = 0; i < 5; i += 1) {
        fake.queue([row]);
        await expect(svc.verifyLogin('user-1', '000000')).rejects.toThrow(/неверный код/);
      }
      fake.queue([row]);
      await expect(svc.verifyLogin('user-1', totp(secret))).rejects.toThrow(/слишком много/);
    });

    it('счётчик попыток ведётся отдельно по пользователям', async () => {
      const secret = generateTotpSecret();
      const row = userRow({ totpEnabled: true, totpSecretEnc: box.encrypt(secret) });
      for (let i = 0; i < 5; i += 1) {
        fake.queue([row]);
        await expect(svc.verifyLogin('user-1', '000000')).rejects.toThrow();
      }
      fake.queue([{ ...row, id: 'user-2' }], []);
      await expect(svc.verifyLogin('user-2', totp(secret))).resolves.toBeUndefined();
    });
  });

  describe('disable', () => {
    it('у аккаунта с паролем требует пароль, а не код', async () => {
      const secret = generateTotpSecret();
      // scrypt-хеш пароля "correct horse" — берём через тот же hashPassword.
      const { hashPassword } = await import('./password.js');
      const passwordHash = await hashPassword('correct horse');
      const row = userRow({ totpEnabled: true, totpSecretEnc: box.encrypt(secret), passwordHash });

      fake.queue([row]);
      await expect(svc.disable('user-1', { code: totp(secret) })).rejects.toThrow(/пароль неверен/);

      fake.queue([row], []);
      await expect(svc.disable('user-1', { password: 'correct horse' })).resolves.toEqual({
        ok: true,
      });
      const [stored] = fake.argsOf('set') as [Record<string, unknown>];
      expect(stored).toMatchObject({
        totpEnabled: false,
        totpSecretEnc: null,
        totpBackupCodes: [],
      });
    });

    it('у аккаунта без пароля (вход только через OAuth) требует код', async () => {
      const secret = generateTotpSecret();
      const row = userRow({ totpEnabled: true, totpSecretEnc: box.encrypt(secret) });

      fake.queue([row]);
      await expect(svc.disable('user-1', { code: '000000' })).rejects.toThrow(/код неверен/);

      fake.queue([row], [], []);
      await expect(svc.disable('user-1', { code: totp(secret) })).resolves.toEqual({ ok: true });
    });
  });

  describe('regenerateBackupCodes', () => {
    it('требует TOTP-код и не принимает резервный', async () => {
      const secret = generateTotpSecret();
      const codes = ['ABCDE-FGHJK'];
      const row = userRow({
        totpEnabled: true,
        totpSecretEnc: box.encrypt(secret),
        totpBackupCodes: hashBackupCodes(codes),
      });

      fake.queue([row]);
      await expect(svc.regenerateBackupCodes('user-1', codes[0])).rejects.toThrow(/код неверен/);

      fake.queue([row], [], []);
      const res = await svc.regenerateBackupCodes('user-1', totp(secret));
      expect(res.backupCodes).toHaveLength(10);
      expect(res.backupCodes).not.toContain(codes[0]);
    });
  });

  describe('status', () => {
    it('различает «не настроено», «настроено, но не подтверждено» и «включено»', async () => {
      fake.queue([userRow()]);
      expect(await svc.status('user-1')).toMatchObject({ enabled: false, pendingSetup: false });

      fake.queue([userRow({ totpSecretEnc: box.encrypt(generateTotpSecret()) })]);
      expect(await svc.status('user-1')).toMatchObject({ enabled: false, pendingSetup: true });

      fake.queue([
        userRow({
          totpEnabled: true,
          totpSecretEnc: box.encrypt(generateTotpSecret()),
          totpBackupCodes: hashBackupCodes(['ABCDE-FGHJK', 'MNPQR-STVWX']),
        }),
      ]);
      expect(await svc.status('user-1')).toMatchObject({
        enabled: true,
        pendingSetup: false,
        backupCodesLeft: 2,
      });
    });
  });
});
