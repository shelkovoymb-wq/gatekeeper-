import Link from 'next/link'
import type { Metadata } from 'next'
import { OnboardingChat } from '@/components/OnboardingChat'
import { AdmissionStamp } from '@/components/AdmissionStamp'

export const metadata: Metadata = {
  title: 'Gatekeeper — реестр вашего закрытого канала',
  description:
    'Gatekeeper ведёт реестр вашего платного Telegram-канала: бот принимает оплату, вписывает подписчика в список и сам вычёркивает тех, кто не продлил.',
}

const LEDGER_ROWS = [
  {
    n: '001',
    action: 'Подключаете бота',
    result: 'Бот привязан к каналу токеном от @BotFather — без единой строчки кода',
  },
  {
    n: '002',
    action: 'Делаете бота админом канала',
    result: 'Канал сам появляется в реестре, как только бот получает права',
  },
  {
    n: '003',
    action: 'Задаёте тариф',
    result: 'Цена и срок подписки зафиксированы — дальше решает бот',
  },
  {
    n: '004',
    action: 'Включаете приём оплаты',
    result: 'Бот готов принять первого гостя и вписать его в реестр',
  },
]

const INDEX_CARDS = [
  {
    title: 'Никто не пройдёт мимо списка',
    text: 'Каждый, кто входит в канал, сверяется с реестром — платформа ловит тех, кто попал в обход оплаты.',
    rotate: '-rotate-2',
  },
  {
    title: 'Не продлил — вышел',
    text: 'Бот сам уберёт подписчика из канала по вашей политике: сразу или после льготного периода.',
    rotate: 'rotate-1',
  },
  {
    title: 'Продажа идёт без вас',
    text: 'Подписчик платит боту, получает разовую ссылку и входит сам — вы просто открываете реестр по утрам.',
    rotate: '-rotate-1',
  },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-ledger-cover font-ledger-body text-ledger-page">
      {/* Навигация */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 40 40" className="h-9 w-9 text-ledger-brass" aria-hidden="true">
            <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="20" cy="16" r="5.5" fill="currentColor" />
            <path d="M20 21 L14 30 L26 30 Z" fill="currentColor" />
          </svg>
          <span className="font-display text-xl tracking-wide text-ledger-page">Gatekeeper</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-md px-4 py-2 text-sm font-bold text-ledger-page/80 transition hover:text-ledger-page focus-visible:outline focus-visible:outline-2 focus-visible:outline-ledger-brass"
          >
            Войти
          </Link>
          <Link
            href="/register"
            className="rounded-md bg-ledger-stamp px-4 py-2 text-sm font-bold text-ledger-page shadow-[3px_3px_0_0_rgba(0,0,0,0.25)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ledger-brass"
          >
            Начать бесплатно
          </Link>
        </nav>
      </header>

      {/* Hero — разворот реестра, без градиентных пятен */}
      <section className="gk-ledger-lines relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl gap-16 px-6 pb-24 pt-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pb-32 lg:pt-12">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 border-b border-ledger-brass/40 pb-1 font-ledger-mono text-xs uppercase tracking-[0.25em] text-ledger-brass">
              <span className="h-1.5 w-1.5 rounded-full bg-ledger-stamp" />
              Реестр открыт
            </div>
            <h1 className="font-display text-4xl leading-[1.15] text-ledger-page sm:text-5xl lg:text-[3.4rem]">
              Ваш канал — закрытая дверь.
              <br />
              <span className="text-ledger-stamp">Вход — по подписке.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ledger-page/75">
              Gatekeeper ведёт реестр за вас: бот принимает оплату, вписывает подписчика в список
              и сам вычёркивает тех, кто не продлил.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href="#assistant"
                className="inline-flex items-center gap-2 rounded-md bg-ledger-stamp px-7 py-3.5 text-base font-bold text-ledger-page shadow-[4px_4px_0_0_rgba(0,0,0,0.3)] transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ledger-brass"
              >
                Открыть реестр →
              </a>
              <Link
                href="/register"
                className="rounded-md border border-ledger-page/25 px-7 py-3.5 text-base font-bold text-ledger-page/90 transition hover:border-ledger-page/50 hover:bg-ledger-page/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ledger-brass"
              >
                Обычная регистрация
              </Link>
            </div>
          </div>

          {/* Билет — карточка с пробитым краем и оттиском штампа */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="gk-ticket-perforation rotate-[3deg] rounded-sm bg-ledger-page pb-24 pl-9 pr-6 pt-7 shadow-[10px_14px_0_0_rgba(0,0,0,0.35)] transition duration-500 hover:rotate-0">
              <p className="font-ledger-mono text-[11px] uppercase tracking-[0.2em] text-ledger-ink/50">
                Образец билета
              </p>
              <p className="mt-1 font-display text-xl text-ledger-ink">«Закрытый клуб»</p>

              <div className="mt-5 space-y-2.5 border-t border-dashed border-ledger-ink/20 pt-5">
                <div className="flex items-center justify-between font-ledger-mono text-sm text-ledger-ink">
                  <span className="text-ledger-ink/60">Тариф</span>
                  <span className="font-bold">Базовый · 30 дней</span>
                </div>
                <div className="flex items-center justify-between font-ledger-mono text-sm text-ledger-ink">
                  <span className="text-ledger-ink/60">Цена</span>
                  <span className="font-bold">490 ₽</span>
                </div>
                <div className="flex items-center justify-between font-ledger-mono text-sm text-ledger-ink">
                  <span className="text-ledger-ink/60">Вход</span>
                  <span className="font-bold">заявка на вступление</span>
                </div>
                <div className="flex items-center justify-between font-ledger-mono text-sm text-ledger-ink">
                  <span className="text-ledger-ink/60">Автовыход</span>
                  <span className="font-bold text-ledger-stamp">включён</span>
                </div>
              </div>

              <div className="pointer-events-none absolute -bottom-4 -right-2">
                <AdmissionStamp size={104} animate />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Как это работает — реестр, а не карточки */}
      <section className="border-t border-ledger-page/10 bg-ledger-coverLight">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <h2 className="font-display text-3xl text-ledger-page sm:text-4xl">Как это работает</h2>
          <p className="mt-3 text-ledger-page/65">Четыре записи в реестре — и бот сам продаёт доступ в ваш канал.</p>

          <div className="mt-10 overflow-hidden rounded-sm border border-ledger-page/15">
            <div className="hidden border-b border-ledger-page/15 bg-ledger-cover px-5 py-3 font-ledger-mono text-xs uppercase tracking-[0.2em] text-ledger-brass sm:grid sm:grid-cols-[3.5rem_16rem_1fr] sm:gap-x-4">
              <span>№</span>
              <span>Действие</span>
              <span>Результат</span>
            </div>
            {LEDGER_ROWS.map((row, i) => (
              <div
                key={row.n}
                className="gk-ledger-row border-b border-ledger-page/10 px-5 py-4 last:border-b-0 odd:bg-ledger-page/[0.03] sm:grid sm:grid-cols-[3.5rem_16rem_1fr] sm:items-center sm:gap-x-4"
                style={{ animationDelay: `${i * 90}ms` }}
              >
                <div className="flex items-baseline gap-3 sm:contents">
                  <span className="font-ledger-mono text-sm text-ledger-brass">{row.n}</span>
                  <span className="font-bold text-ledger-page">{row.action}</span>
                </div>
                <span className="mt-1.5 block text-sm leading-relaxed text-ledger-page/65 sm:mt-0 sm:text-base">
                  {row.result}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Приколотые карточки — почему Gatekeeper */}
      <section className="border-t border-ledger-page/10">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="text-center font-display text-3xl text-ledger-page sm:text-4xl">Что делает реестр за вас</h2>
          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {INDEX_CARDS.map((c) => (
              <div
                key={c.title}
                className={`group relative rounded-sm bg-ledger-page p-7 text-ledger-ink shadow-[6px_8px_0_0_rgba(0,0,0,0.3)] transition duration-300 hover:-translate-y-1 hover:rotate-0 hover:shadow-[8px_10px_0_0_rgba(0,0,0,0.35)] ${c.rotate}`}
              >
                <span className="absolute -top-2 left-6 h-4 w-4 rounded-full bg-ledger-brass shadow-[0_2px_3px_rgba(0,0,0,0.4)]" />
                <h3 className="font-display text-lg leading-snug">{c.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ledger-ink/75">{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ассистент — окно приёма */}
      <section id="assistant" className="border-t border-ledger-page/10 bg-ledger-coverLight">
        <div className="mx-auto max-w-3xl px-6 py-24">
          <div className="mb-10 text-center">
            <h2 className="font-display text-3xl text-ledger-page sm:text-4xl">Запись в реестр — в диалоге</h2>
            <p className="mx-auto mt-3 max-w-lg text-ledger-page/65">
              Расскажите ассистенту, что вам нужно — он зарегистрирует проект, подключит бота,
              создаст тариф и включит оплату, пока вы переписываетесь.
            </p>
          </div>

          <div className="relative rounded-lg border border-ledger-brass/30 bg-ledger-cover p-3 shadow-[0_20px_60px_rgba(0,0,0,0.4)] sm:p-5">
            <span className="absolute left-5 top-5 h-2 w-2 rounded-full bg-ledger-brass/70" />
            <span className="absolute right-5 top-5 h-2 w-2 rounded-full bg-ledger-brass/70" />
            <div className="mb-3 flex justify-center">
              <span className="rounded-sm bg-ledger-brass/90 px-4 py-1 font-ledger-mono text-[11px] uppercase tracking-[0.25em] text-ledger-cover">
                Окно приёма
              </span>
            </div>
            <OnboardingChat />
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10 text-center">
        <div className="mx-auto mb-4 h-px w-24 bg-ledger-brass/40" />
        <p className="font-ledger-mono text-xs uppercase tracking-[0.2em] text-ledger-page/45">
          Реестр ведётся с {new Date().getFullYear()} года · Gatekeeper
        </p>
      </footer>
    </div>
  )
}
