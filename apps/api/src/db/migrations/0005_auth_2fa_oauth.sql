-- Двухфакторная аутентификация (TOTP + резервные коды) и вход через
-- внешних провайдеров (Google, Яндекс).

-- ─── 2FA на пользователе кабинета ───────────────────────────────────────────
-- totp_secret_enc — секрет в конверте SecretBox (AES-256-GCM), как токены ботов.
-- totp_enabled взводится только после подтверждения кодом из приложения,
-- поэтому «настроил, но не подтвердил» не блокирует вход.
ALTER TABLE client_users
    ADD COLUMN IF NOT EXISTS totp_secret_enc     text,
    ADD COLUMN IF NOT EXISTS totp_enabled        boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS totp_confirmed_at   timestamptz,
    -- SHA-256 хеши неиспользованных резервных кодов; использованный удаляется.
    ADD COLUMN IF NOT EXISTS totp_backup_codes   jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Номер последнего успешно использованного 30-секундного шага TOTP:
    -- защищает от повторной отправки перехваченного кода внутри его окна.
    ADD COLUMN IF NOT EXISTS totp_last_step      bigint;

-- Пароль перестал быть единственным способом входа: пользователь, созданный
-- через Google/Яндекс, живёт без password_hash. Колонка и так nullable —
-- фиксируем это ограничением на уровне БД: должен быть хотя бы один способ.
CREATE INDEX IF NOT EXISTS client_users_client_idx ON client_users (client_id);

-- ─── Привязанные внешние аккаунты ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_identities (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
    provider         text NOT NULL,             -- google | yandex
    provider_user_id text NOT NULL,             -- стабильный ID у провайдера (google sub / yandex id)
    email            citext,
    display_name     text,
    avatar_url       text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    last_login_at    timestamptz
);

-- Один аккаунт провайдера — ровно один пользователь платформы.
CREATE UNIQUE INDEX IF NOT EXISTS user_identities_provider_uq
    ON user_identities (provider, provider_user_id);
-- И не больше одной привязки каждого провайдера на пользователя.
CREATE UNIQUE INDEX IF NOT EXISTS user_identities_user_provider_uq
    ON user_identities (user_id, provider);
