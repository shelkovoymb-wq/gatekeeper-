import Link from 'next/link'
import type { Metadata } from 'next'
import { OnboardingChat } from '@/components/OnboardingChat'

export const metadata: Metadata = {
  title: 'Gatekeeper — платные закрытые Telegram-каналы',
  description:
    'Подключите бота, создайте тариф — и Gatekeeper сам продаёт подписку, впускает оплативших и убирает тех, кто не продлил.',
}

const STEPS = [
  {
    n: '01',
    title: 'Подключите бота',
    text: 'Пришлите токен от @BotFather — бот подключится за секунды, без кода и серверов.',
    icon: '🤖',
  },
  {
    n: '02',
    title: 'Добавьте канал',
    text: 'Сделайте бота админом своего закрытого канала — он появится в кабинете автоматически.',
    icon: '🔒',
  },
  {
    n: '03',
    title: 'Создайте тариф',
    text: 'Цена, период, пробный доступ — задайте условия подписки в один шаг.',
    icon: '💳',
  },
  {
    n: '04',
    title: 'Подключите оплату',
    text: 'ЮKassa, CloudPayments, Robokassa или Telegram Stars — бот сам всё оформит.',
    icon: '⚡',
  },
]

const FEATURES = [
  {
    title: 'Продажа без рук',
    text: 'Подписчик платит боту → получает одноразовую ссылку → входит в канал. Всё автоматически.',
    icon: '🛒',
  },
  {
    title: 'Никаких зайцев',
    text: 'Платформа сверяет каждого вошедшего с активной подпиской и ловит тех, кто попал в обход оплаты.',
    icon: '🕵️',
  },
  {
    title: 'Автоотзыв доступа',
    text: 'Не продлил подписку — бот сам уберёт из канала по вашей политике: сразу или после льготного периода.',
    icon: '⏳',
  },
]

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      {/* Декоративные градиентные "3D" пятна фона */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-primary-600/30 blur-[120px]" />
        <div className="absolute -right-32 top-40 h-[28rem] w-[28rem] rounded-full bg-secondary-600/25 blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 h-[26rem] w-[26rem] rounded-full bg-accent-500/20 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)] [background-size:32px_32px]" />
      </div>

      <div className="relative">
        {/* Навигация */}
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 via-secondary-500 to-accent-500 shadow-lg shadow-primary-600/30">
              <span className="text-lg">🛡️</span>
            </div>
            <span className="text-lg font-bold text-white">Gatekeeper</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 transition hover:text-white"
            >
              Войти
            </Link>
            <Link
              href="/register"
              className="rounded-xl bg-gradient-to-br from-primary-500 to-secondary-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-primary-600/30 transition hover:brightness-110"
            >
              Начать бесплатно
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-14 px-6 pb-20 pt-10 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pb-28 lg:pt-16">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-slate-300 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Платформа для платных Telegram-каналов
            </div>
            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Ваш закрытый канал{' '}
              <span className="bg-gradient-to-r from-primary-400 via-secondary-400 to-accent-400 bg-clip-text text-transparent">
                продаёт себя сам
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
              Gatekeeper подключает вашего Telegram-бота к каналу, принимает оплату и сам решает,
              кого впустить, а кого — вежливо попросить продлить подписку.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <a
                href="#assistant"
                className="rounded-2xl bg-gradient-to-br from-primary-500 via-secondary-500 to-accent-500 px-7 py-3.5 text-base font-semibold text-white shadow-xl shadow-secondary-600/30 transition hover:brightness-110"
              >
                Настроить в диалоге →
              </a>
              <Link
                href="/register"
                className="rounded-2xl border border-white/15 bg-white/5 px-7 py-3.5 text-base font-semibold text-white backdrop-blur transition hover:bg-white/10"
              >
                Обычная регистрация
              </Link>
            </div>
          </div>

          {/* "3D" карточка-превью */}
          <div className="relative mx-auto w-full max-w-sm [perspective:1200px]">
            <div className="rotate-3 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-900/60 p-6 shadow-2xl shadow-primary-950/50 backdrop-blur-xl transition duration-500 hover:rotate-0">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">Тестовый закрытый канал</span>
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                  активен
                </span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
                  <span className="text-sm text-slate-300">Базовый · 30 дней</span>
                  <span className="text-sm font-semibold text-white">490 ₽</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
                  <span className="text-sm text-slate-300">Подписчиков сегодня</span>
                  <span className="text-sm font-semibold text-white">+14</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
                  <span className="text-sm text-slate-300">Автовыход без оплаты</span>
                  <span className="text-sm font-semibold text-emerald-300">включён</span>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-6 -left-6 -z-10 h-full w-full rounded-3xl bg-gradient-to-br from-primary-600/40 to-accent-500/30 blur-2xl" />
          </div>
        </section>

        {/* Как это работает */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">Как это работает</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-slate-400">
            Четыре шага — и бот сам продаёт доступ в ваш канал
          </p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur transition hover:-translate-y-1 hover:border-primary-500/30 hover:bg-white/[0.06]"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500/20 to-secondary-500/20 text-xl">
                  {s.icon}
                </div>
                <span className="text-xs font-semibold text-slate-500">{s.n}</span>
                <h3 className="mt-1 text-base font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Преимущества */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-5 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-7 backdrop-blur"
              >
                <div className="mb-4 text-3xl">{f.icon}</div>
                <h3 className="text-lg font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Ассистент */}
        <section id="assistant" className="mx-auto max-w-3xl px-6 py-20">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Соберите платформу{' '}
              <span className="bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">
                прямо в диалоге
              </span>
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-slate-400">
              Расскажите ассистенту, что вам нужно — он зарегистрирует проект, подключит бота,
              создаст тариф и включит оплату, пока вы переписываетесь.
            </p>
          </div>
          <OnboardingChat />
        </section>

        <footer className="mx-auto max-w-6xl border-t border-white/5 px-6 py-10 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} Gatekeeper
        </footer>
      </div>
    </div>
  )
}
