#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Индекс расхода токенов Claude Code.

Проходит по транскриптам ~/.claude/projects/<slug>/*.jsonl и строит агрегаты
"день x проект x модель x кто-жёг x поток".

Считаются ТОЛЬКО токены (никаких долларов) — цены живут в build_tokens.py и
применяются на лету, чтобы обновление прайса пересчитывало всю историю.

Ключевые особенности (все проверены на реальном корпусе транскриптов):

1.  Один вызов модели пишется в файл несколько раз — по строке на каждый
    content-блок ответа (thinking / tool_use / text), и во всех строках лежит
    ОДИН И ТОТ ЖЕ usage. Дедуп идёт по requestId (fallback: message.id, uuid)
    в пределах одного файла. Между файлами requestId не пересекаются, поэтому
    per-файловый дедуп корректен и позволяет кэшировать файлы независимо.

2.  Файлы быстро вырастают до гигабайт. Читаем в бинарном режиме построчно и
    выбрасываем строки без подстроки b'"usage"' ДО json.loads.

3.  Привязка к проекту — эвристика (см. resolve_projects).

4.  "Кто жёг": entrypoint sdk / sdk-cli / headless / api -> автоматика,
    всё остальное (cli, claude-vscode, remote_desktop, ...) -> руками.
    Поток: isSidechain=true или файл в .../subagents/... -> подагент.

5.  День события — по timestamp (UTC, суффикс Z), переведённому в локальную
    таймзону машины, где идёт сборка.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

CACHE_VERSION = 3

# Бакет для событий, у которых за весь файл ни разу не нашлось проекта.
UNASSIGNED = "(без привязки)"
ROOT_SUBPATH = "(корень)"

# Аргументы tool_use, которым доверяем как настоящим путям.
STRONG_KEYS = ("file_path", "path", "notebook_path", "notebook")

# entrypoint, означающие автоматический (не человеческий) запуск.
AUTO_ENTRYPOINTS = {"sdk", "sdk-cli", "headless", "api", "cron", "github-action"}

# Куда обычно кладут проекты, если пользователь не сказал иного.
PROJECT_HOME_CANDIDATES = (
    "Projects",
    "projects",
    "Developer",
    "dev",
    "code",
    "src",
    "work",
    "repos",
)

# Порядок счётчиков в строке агрегата.
COUNTERS = ("input", "cache_read", "cache_write_5m", "cache_write_1h", "output", "calls")


# --------------------------------------------------------------------------- #
# Пути и конфиг
# --------------------------------------------------------------------------- #

def default_transcripts_root() -> Path:
    return Path.home() / ".claude" / "projects"


def default_cache_path() -> Path:
    base = os.environ.get("XDG_CACHE_HOME")
    root = Path(base) if base else Path.home() / ".cache"
    return root / "claude-tokens" / "index-cache.json"


def config_path() -> Path:
    base = os.environ.get("XDG_CONFIG_HOME")
    root = Path(base) if base else Path.home() / ".config"
    return root / "claude-tokens" / "config.json"


def load_config() -> dict:
    path = config_path()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}


def save_config(cfg: dict) -> None:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    _atomic_write(path, json.dumps(cfg, ensure_ascii=False, indent=2))


def resolve_projects_home(explicit: str | None = None) -> Path | None:
    """Где лежат проекты пользователя.

    Приоритет: аргумент -> env -> конфиг -> автоопределение по кандидатам.
    Никаких захардкоженных домашних путей: всё через Path.home().
    """
    if explicit:
        return Path(explicit).expanduser().resolve()

    env = os.environ.get("CLAUDE_TOKENS_PROJECTS_HOME")
    if env:
        return Path(env).expanduser().resolve()

    cfg = load_config().get("projects_home")
    if cfg:
        return Path(cfg).expanduser().resolve()

    home = Path.home()
    best: tuple[int, Path] | None = None
    for name in PROJECT_HOME_CANDIDATES:
        candidate = home / name
        if not candidate.is_dir():
            continue
        count = sum(1 for p in _safe_iterdir(candidate) if p.is_dir() and not p.name.startswith("."))
        if count and (best is None or count > best[0]):
            best = (count, candidate)
    return best[1] if best else None


def _safe_iterdir(path: Path):
    try:
        return list(path.iterdir())
    except OSError:
        return []


def known_projects(projects_home: Path | None) -> set[str]:
    """Список РЕАЛЬНО существующих подпапок — без него любой левый путь
    вида ~/Projects/CLAUDE.md даст фантомный "проект"."""
    if not projects_home:
        return set()
    return {
        p.name
        for p in _safe_iterdir(projects_home)
        if p.is_dir() and not p.name.startswith(".")
    }


# --------------------------------------------------------------------------- #
# Разбор путей
# --------------------------------------------------------------------------- #

_PATH_STOPPERS = "\"'`,;)>|&\n\t "


def _clean_component(raw: str) -> str:
    out = []
    for ch in raw:
        if ch in _PATH_STOPPERS:
            break
        out.append(ch)
    return "".join(out).strip().rstrip(":.")


def match_project(text: str, home_prefix: str, known: set[str], require_sub: bool):
    """Ищет в произвольной строке путь вида <projects_home>/<имя>/<...>.

    Возвращает (project, subpath) либо None. <имя> обязано быть в known —
    иначе это не проект, а мусор.
    """
    if not text or not home_prefix or home_prefix not in text:
        return None
    start = 0
    while True:
        idx = text.find(home_prefix, start)
        if idx < 0:
            return None
        start = idx + len(home_prefix)
        rest = text[start:]
        parts = rest.split("/")
        name = _clean_component(parts[0])
        if name not in known:
            continue
        tail = [_clean_component(p) for p in parts[1:]]
        tail = [p for p in tail if p]
        if require_sub and not tail:
            continue
        return name, _subpath(tail)


def _subpath(tail: list[str]) -> str:
    """Топ-2 уровня внутри проекта; имя файла отбрасываем."""
    if not tail:
        return ROOT_SUBPATH
    dirs = tail[:-1] if len(tail) > 1 else []
    if not dirs:
        return ROOT_SUBPATH
    return "/".join(dirs[:2])


def _tool_use_strings(block: dict) -> tuple[list[str], list[str]]:
    """Сильные (file_path/path/...) и слабые (всё остальное) строки блока."""
    inp = block.get("input")
    if not isinstance(inp, dict):
        return [], []
    strong, weak = [], []
    for key, value in inp.items():
        if not isinstance(value, str) or not value:
            continue
        (strong if key in STRONG_KEYS else weak).append(value)
    return strong, weak


# --------------------------------------------------------------------------- #
# Разбор одного файла транскрипта
# --------------------------------------------------------------------------- #

class _Event:
    __slots__ = ("date", "model", "kind", "flow", "strong", "weak", "cwd", "counters")

    def __init__(self):
        self.date = None
        self.model = None
        self.kind = "manual"
        self.flow = "main"
        self.strong: list[str] = []
        self.weak: list[str] = []
        self.cwd = None
        self.counters = [0, 0, 0, 0, 0, 1]


def _usage_counters(usage: dict) -> list[int]:
    inp = int(usage.get("input_tokens") or 0)
    read = int(usage.get("cache_read_input_tokens") or 0)
    write = int(usage.get("cache_creation_input_tokens") or 0)
    out = int(usage.get("output_tokens") or 0)

    creation = usage.get("cache_creation")
    if isinstance(creation, dict):
        w5 = int(creation.get("ephemeral_5m_input_tokens") or 0)
        w1 = int(creation.get("ephemeral_1h_input_tokens") or 0)
        # Если разбивка есть, но не сходится с общим числом — верим общему
        # и добиваем разницу в дешёвый 5-минутный тариф (занижаем, не выдумываем).
        if w5 + w1 != write:
            w5 += write - (w5 + w1)
            if w5 < 0:
                w5, w1 = write, 0
    else:
        w5, w1 = write, 0

    return [inp, read, w5, w1, out, 1]


def parse_file(path: Path, home_prefix: str, known: set[str], is_subagent_dir: bool):
    """Разбирает один *.jsonl. Возвращает (rows, subpath_rows).

    rows:      [date, project, model, kind, flow, in, cr, cw5, cw1, out, calls]
    subpaths:  [date, project, subpath, touches]
    """
    order: list[str] = []
    events: dict[str, _Event] = {}

    try:
        handle = path.open("rb")
    except OSError:
        return [], []

    with handle:
        for raw in handle:
            # Дешёвый фильтр ДО json.loads: без него мы бы парсили и гигантские
            # tool_result-строки, которые нам не нужны.
            if b'"usage"' not in raw:
                continue
            try:
                rec = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(rec, dict):
                continue
            message = rec.get("message")
            if not isinstance(message, dict):
                continue
            usage = message.get("usage")
            if not isinstance(usage, dict):
                continue
            model = message.get("model")
            if not model or model == "<synthetic>":
                continue

            key = rec.get("requestId") or message.get("id") or rec.get("uuid")
            if not key:
                continue

            event = events.get(key)
            if event is None:
                event = _Event()
                event.date = _local_date(rec.get("timestamp"))
                event.model = model
                event.kind = "auto" if rec.get("entrypoint") in AUTO_ENTRYPOINTS else "manual"
                event.flow = "subagent" if (rec.get("isSidechain") or is_subagent_dir) else "main"
                cwd = rec.get("cwd")
                event.cwd = cwd if isinstance(cwd, str) else None
                event.counters = _usage_counters(usage)
                events[key] = event
                order.append(key)

            # Блоки одного ответа приходят отдельными строками: thinking идёт
            # первым и без путей, путь лежит в tool_use. Собираем со всех строк
            # с одним requestId, иначе половина путей потеряется.
            content = message.get("content")
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_use":
                        strong, weak = _tool_use_strings(block)
                        event.strong.extend(strong)
                        event.weak.extend(weak)

    return _fold(order, events, home_prefix, known)


def _local_date(ts) -> str | None:
    if not isinstance(ts, str) or not ts:
        return None
    try:
        parsed = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    # Локальная таймзона машины: без этого вечерняя работа уезжает в "завтра".
    return parsed.astimezone().date().isoformat()


def _fold(order, events, home_prefix, known):
    rows: dict[tuple, list[int]] = {}
    subpaths: dict[tuple, int] = {}

    resolved: list[tuple[str | None, str | None]] = []
    last_project = None
    first_project = None

    for key in order:
        event = events[key]
        project = None
        subpath = None

        # Два прохода: сильным ключам доверяем больше, чем случайной строке
        # внутри длинной bash-команды.
        for text in event.strong:
            hit = match_project(text, home_prefix, known, require_sub=True)
            if hit:
                project, subpath = hit
                break
        if project is None:
            for text in event.weak:
                hit = match_project(text, home_prefix, known, require_sub=True)
                if hit:
                    project = hit[0]
                    break
        if project is None and event.cwd:
            hit = match_project(event.cwd + "/", home_prefix, known, require_sub=False)
            if hit:
                project = hit[0]

        if project is None:
            # "Липкая" привязка внутри сессии: чистое рассуждение или ответ без
            # вызова инструментов наследует проект предыдущего события.
            project = last_project
        else:
            last_project = project
            if first_project is None:
                first_project = project

        resolved.append((project, subpath))

    for key, (project, subpath) in zip(order, resolved):
        event = events[key]
        if not event.date:
            continue
        # События до первого распознанного пути добираем первым проектом файла —
        # это та же сессия, а не "куда попало".
        proj = project or first_project or UNASSIGNED
        row_key = (event.date, proj, event.model, event.kind, event.flow)
        acc = rows.get(row_key)
        if acc is None:
            rows[row_key] = list(event.counters)
        else:
            for i in range(len(COUNTERS)):
                acc[i] += event.counters[i]
        if subpath and proj != UNASSIGNED:
            sp_key = (event.date, proj, subpath)
            subpaths[sp_key] = subpaths.get(sp_key, 0) + 1

    row_list = [list(k) + v for k, v in rows.items()]
    sub_list = [list(k) + [v] for k, v in subpaths.items()]
    return row_list, sub_list


# --------------------------------------------------------------------------- #
# Кэш
# --------------------------------------------------------------------------- #

def _atomic_write(path: Path, text: str) -> None:
    """tmp-файл + rename: сборка идёт по расписанию, и оборванный кэш заставил
    бы следующий запуск читать всё с нуля."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except OSError:
                pass


def load_cache(path: Path) -> dict:
    if not path.exists():
        return {"version": CACHE_VERSION, "files": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {"version": CACHE_VERSION, "files": {}}
    if not isinstance(data, dict) or data.get("version") != CACHE_VERSION:
        return {"version": CACHE_VERSION, "files": {}}
    data.setdefault("files", {})
    return data


def save_cache(path: Path, cache: dict) -> None:
    _atomic_write(path, json.dumps(cache, ensure_ascii=False, separators=(",", ":")))


def _prune(cache: dict, retention_days: int, now: float) -> int:
    """Записи об исчезнувших файлах не выкидываем сразу (история дороже места),
    только помечаем alive=false и подрезаем по retention."""
    cutoff = now - retention_days * 86400
    dead = [
        key
        for key, entry in cache["files"].items()
        if not entry.get("alive", True) and float(entry.get("last_seen", 0)) < cutoff
    ]
    for key in dead:
        del cache["files"][key]
    return len(dead)


# --------------------------------------------------------------------------- #
# Основной проход
# --------------------------------------------------------------------------- #

def build_index(
    transcripts_root: Path,
    projects_home: Path | None,
    cache_path: Path,
    retention_days: int = 120,
    verbose: bool = True,
):
    started = time.time()
    known = known_projects(projects_home)
    home_prefix = (str(projects_home).rstrip("/") + "/") if projects_home else ""

    cache = load_cache(cache_path)
    files_entry = cache["files"]

    # Ключ инвалидации: набор известных проектов влияет на разбор, поэтому при
    # его изменении кэш агрегатов надо пересчитать.
    signature = "|".join(sorted(known)) + "##" + home_prefix
    if cache.get("signature") != signature:
        for entry in files_entry.values():
            entry.pop("rows", None)
            entry.pop("paths", None)
        cache["signature"] = signature

    for entry in files_entry.values():
        entry["alive"] = False

    transcripts = sorted(transcripts_root.rglob("*.jsonl")) if transcripts_root.exists() else []

    rows: list[list] = []
    subpath_rows: list[list] = []
    scanned = 0
    cached = 0

    for path in transcripts:
        try:
            stat = path.stat()
        except OSError:
            continue
        key = str(path)
        entry = files_entry.get(key)
        fingerprint = [int(stat.st_mtime), stat.st_size]
        session = path.stem

        if (
            entry
            and entry.get("fingerprint") == fingerprint
            and "rows" in entry
            and "paths" in entry
        ):
            cached += 1
        else:
            is_subagent = "subagents" in path.parts
            file_rows, file_paths = parse_file(path, home_prefix, known, is_subagent)
            entry = {"fingerprint": fingerprint, "rows": file_rows, "paths": file_paths}
            files_entry[key] = entry
            scanned += 1

        entry["alive"] = True
        entry["last_seen"] = int(time.time())
        entry["session"] = session

        for row in entry["rows"]:
            rows.append(row + [session])
        subpath_rows.extend(entry["paths"])

    pruned = _prune(cache, retention_days, time.time())
    save_cache(cache_path, cache)

    meta = {
        "files_total": len(transcripts),
        "files_scanned": scanned,
        "files_cached": cached,
        "files_pruned": pruned,
        "seconds": round(time.time() - started, 2),
        "retention_days": retention_days,
        "projects_home": str(projects_home) if projects_home else None,
        "transcripts_root": str(transcripts_root),
        "known_projects": len(known),
        "cache_path": str(cache_path),
    }
    if verbose:
        print(
            "[index] файлов {files_total} (свежих {files_scanned}, из кэша {files_cached}), "
            "{seconds}s".format(**meta)
        )
    return {"rows": rows, "subpaths": subpath_rows, "meta": meta}


# --------------------------------------------------------------------------- #

def _main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Индекс расхода токенов Claude Code")
    parser.add_argument("--projects-home", default=None)
    parser.add_argument("--transcripts", default=None)
    parser.add_argument("--cache", default=None)
    parser.add_argument("--retention-days", type=int, default=120)
    args = parser.parse_args(argv)

    projects_home = resolve_projects_home(args.projects_home)
    transcripts = Path(args.transcripts).expanduser() if args.transcripts else default_transcripts_root()
    cache = Path(args.cache).expanduser() if args.cache else default_cache_path()

    result = build_index(transcripts, projects_home, cache, args.retention_days)
    totals: dict[str, int] = {}
    for row in result["rows"]:
        totals[row[1]] = totals.get(row[1], 0) + sum(row[5:10])
    for project, tokens in sorted(totals.items(), key=lambda kv: -kv[1])[:20]:
        print(f"{tokens:>15,}  {project}")
    return 0


if __name__ == "__main__":
    sys.exit(_main())
