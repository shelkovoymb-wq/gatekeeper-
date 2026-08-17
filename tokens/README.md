# Анализ расхода токенов Claude Code

Локальная панель: сколько токенов и денег сожрал Claude Code по дням, по проектам
и по моделям, с разбивкой «руками / автоматика» и «основной поток / подагенты».

```
sources/claude_usage_index.py   индекс транскриптов + кэш агрегатов
tokens/build_tokens.py          собирает tokens/data/tokens.json
tokens/index.html               витрина (статика, без сборщика и фреймворков)
```

## Быстрый старт

```sh
python3 tokens/build_tokens.py            # соберёт tokens/data/tokens.json
cd tokens && python3 -m http.server 8000  # открыть http://localhost:8000
```

Витрина тянет `data/tokens.json` через `fetch`, поэтому просто открыть `index.html`
двойным кликом (`file://`) не выйдет — нужен любой статический сервер. Или залить
`index.html` + `data/tokens.json` на свой хостинг/VPS как статику: бэкенд не нужен.

## Где лежат проекты

Домашние пути нигде не захардкожены. Папка с проектами ищется в таком порядке:

1. `--projects-home ~/Мои/Проекты`
2. переменная окружения `CLAUDE_TOKENS_PROJECTS_HOME`
3. `~/.config/claude-tokens/config.json` (ключ `projects_home`)
4. автоопределение: `~/Projects`, `~/projects`, `~/Developer`, `~/dev`, `~/code`,
   `~/src`, `~/work`, `~/repos` — берётся та, где больше подпапок

Если проекты лежат не там, скажи об этом один раз и запомни:

```sh
python3 tokens/build_tokens.py --projects-home ~/Мои/Проекты --save-config
```

Без этой папки привязка не работает и всё уезжает в бакет «(без привязки)» —
скрипт об этом честно предупредит.

Прочие флаги: `--transcripts` (по умолчанию `~/.claude/projects`), `--cache`,
`--out`, `--retention-days`.

## Что важно знать про цифры

**Привязка к проекту — эвристика, а не бухгалтерия.** Из каждого `tool_use`
достаются пути; аргументам `file_path` / `path` / `notebook_path` доверия больше,
чем случайной строке внутри длинной bash-команды. Имя проекта засчитывается,
только если такая папка реально существует в домашней папке проектов — иначе
любой путь вида `~/Projects/CLAUDE.md` дал бы фантомный «проект». Событие без
путей (чистое рассуждение, ответ без вызова инструментов) наследует проект
предыдущего события в той же сессии, поэтому **сессия-обсуждение без единого
файла целиком уедет в проект последнего касания**. Если за весь файл проект не
нашёлся ни разу — всё уходит в «(без привязки)».

**Деньги — оценка, а не выписка.** Работа идёт по подписке, эти суммы не
списываются; они нужны только чтобы сравнивать проекты между собой. Прайс лежит
в `PRICES` в `tokens/build_tokens.py` ($/1M токенов) и сверяется с
<https://claude.com/pricing>. Множители на кэш: чтение ×0.1, запись на 5 минут
×1.25, на час ×2. В кэше индекса хранятся **только токены**, поэтому правка
прайса пересчитывает всю историю на лету, без переиндексации. Токены незнакомой
модели не выбрасываются: они идут в общий счётчик и отдельно помечаются как
`unpriced_tokens` («на N токенов цены нет»).

**Кэш индекса.** `~/.cache/claude-tokens/index-cache.json`, ключ — mtime+size
файла: не изменился — не перечитываем. Пишется атомарно (tmp + rename). Записи
об исчезнувших файлах не удаляются сразу — помечаются `alive:false` и подрезаются
по retention (120 дней по умолчанию).

## Обновление по расписанию

### macOS (launchd)

`~/Library/LaunchAgents/local.claude-tokens.plist`, потом
`launchctl load ~/Library/LaunchAgents/local.claude-tokens.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>local.claude-tokens</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>/ПУТЬ/К/РЕПО/tokens/build_tokens.py</string>
  </array>
  <key>StartInterval</key><integer>10800</integer>
  <key>StandardOutPath</key><string>/tmp/claude-tokens.log</string>
  <key>StandardErrorPath</key><string>/tmp/claude-tokens.err</string>
</dict></plist>
```

### Linux (systemd --user)

`~/.config/systemd/user/claude-tokens.service`:

```ini
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 %h/ПУТЬ/К/РЕПО/tokens/build_tokens.py
```

`~/.config/systemd/user/claude-tokens.timer`:

```ini
[Timer]
OnBootSec=5min
OnUnitActiveSec=3h
Persistent=true

[Install]
WantedBy=timers.target
```

```sh
systemctl --user enable --now claude-tokens.timer
```

### cron

```cron
0 */3 * * * /usr/bin/python3 $HOME/ПУТЬ/К/РЕПО/tokens/build_tokens.py >> /tmp/claude-tokens.log 2>&1
```

Если панель ещё и заливается на хостинг — добавь после сборки одну строку,
например `rsync -az tokens/index.html tokens/data/tokens.json user@host:/var/www/tokens/`.

## Формат data/tokens.json

```jsonc
{
  "generated_at": "...",              // ISO-время сборки
  "dates": ["2026-07-19", ...],       // 30 дат по возрастанию
  "periods": ["1", "7", "30"],
  "totals": { "1": {...}, "7": {...}, "30": {...} },
  //   tokens / input / cache_read / cache_write / output / calls / cost /
  //   cache_share / sessions / projects / unpriced_tokens + models|kinds|flows
  "daily":  [ {date, tokens, cost, calls, sessions, manual, auto, top_project} ],
  "projects": [ {key, label, series[30], cost_series[30], last_day,
                 periods: {"1": {...+subpaths}, "7": {...}, "30": {...}} } ],
  "meta": { "index": {files_total, files_scanned, files_cached, seconds, retention_days},
            "history_from": "...", "cost_basis": "api_list_price_estimate", "note": "..." }
}
```

Проекты с нулём токенов за максимальный период в список не попадают — иначе он
превращается в шум из давно мёртвых папок.

## Отладка индекса без витрины

```sh
python3 sources/claude_usage_index.py --projects-home ~/Projects
```

Выведет статистику прохода и топ-20 проектов по токенам.
