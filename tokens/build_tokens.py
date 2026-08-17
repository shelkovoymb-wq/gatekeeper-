#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Сборка data/tokens.json для панели «Анализ расхода токенов Claude Code».

Запуск:  python3 tokens/build_tokens.py
Просмотр: python3 -m http.server  (из папки tokens/) -> http://localhost:8000

Деньги здесь — ОЦЕНКА по публичному прайсу API, а не выписка по подписке.
В кэше индекса лежат только токены, поэтому смена прайса пересчитывает всю
историю на лету, без переиндексации транскриптов.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "sources"))

from claude_usage_index import (  # noqa: E402
    UNASSIGNED,
    build_index,
    config_path,
    default_cache_path,
    default_transcripts_root,
    load_config,
    resolve_projects_home,
    save_config,
)

# --------------------------------------------------------------------------- #
# Прайс: $ за 1M токенов (input, output).
# Сверено 2026-08-17 со скиллом claude-api; актуальное — https://claude.com/pricing
# Цены меняются: если панель начала врать, правится только эта таблица.
# --------------------------------------------------------------------------- #
PRICES: dict[str, tuple[float, float]] = {
    "claude-fable-5": (10.00, 50.00),
    "claude-mythos-5": (10.00, 50.00),
    "claude-mythos-preview": (10.00, 50.00),
    "claude-opus-5": (5.00, 25.00),
    "claude-opus-4-8": (5.00, 25.00),
    "claude-opus-4-7": (5.00, 25.00),
    "claude-opus-4-6": (5.00, 25.00),
    "claude-opus-4-5": (5.00, 25.00),
    "claude-opus-4-1": (15.00, 75.00),
    "claude-opus-4-0": (15.00, 75.00),
    "claude-3-opus": (15.00, 75.00),
    # У Sonnet 5 до 2026-08-31 действует вводная цена $2/$10; здесь стоит
    # обычный прайс — оценка получается консервативной (сверху).
    "claude-sonnet-5": (3.00, 15.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-sonnet-4-5": (3.00, 15.00),
    "claude-sonnet-4-0": (3.00, 15.00),
    "claude-3-7-sonnet": (3.00, 15.00),
    "claude-3-5-sonnet": (3.00, 15.00),
    "claude-haiku-4-5": (1.00, 5.00),
    "claude-3-5-haiku": (0.80, 4.00),
    "claude-3-haiku": (0.25, 1.25),
}

# Множители на кэш относительно input-цены.
CACHE_READ_MULT = 0.10
CACHE_WRITE_5M_MULT = 1.25
CACHE_WRITE_1H_MULT = 2.00

WINDOW_DAYS = 30
PERIODS = ("1", "7", "30")

MODEL_LABELS = {
    "claude-fable-5": "Fable 5",
    "claude-mythos-5": "Mythos 5",
    "claude-opus-5": "Opus 5",
    "claude-opus-4-8": "Opus 4.8",
    "claude-opus-4-7": "Opus 4.7",
    "claude-opus-4-6": "Opus 4.6",
    "claude-opus-4-5": "Opus 4.5",
    "claude-sonnet-5": "Sonnet 5",
    "claude-sonnet-4-6": "Sonnet 4.6",
    "claude-sonnet-4-5": "Sonnet 4.5",
    "claude-haiku-4-5": "Haiku 4.5",
}


def normalize_model(model: str) -> str:
    name = (model or "").strip().lower()
    for prefix in ("anthropic.", "us.anthropic.", "eu.anthropic.", "vertex/", "bedrock/"):
        if name.startswith(prefix):
            name = name[len(prefix):]
    name = name.split("@", 1)[0]
    if name.endswith("-fast"):
        name = name[: -len("-fast")]
    return name


def price_for(model: str) -> tuple[float, float] | None:
    name = normalize_model(model)
    if name in PRICES:
        return PRICES[name]
    # Датированные снапшоты: claude-haiku-4-5-20251001 -> claude-haiku-4-5
    best = None
    for key in PRICES:
        if name.startswith(key) and (best is None or len(key) > len(best)):
            best = key
    return PRICES[best] if best else None


def model_label(model: str) -> str:
    name = normalize_model(model)
    if name in MODEL_LABELS:
        return MODEL_LABELS[name]
    for key, label in MODEL_LABELS.items():
        if name.startswith(key):
            return label
    return model or "(неизвестно)"


def row_cost(model: str, inp: int, read: int, w5: int, w1: int, out: int):
    """-> (cost, unpriced_tokens). Токены незнакомой модели не выбрасываем:
    они идут в общий счётчик, но помечаются как «цены нет»."""
    price = price_for(model)
    total = inp + read + w5 + w1 + out
    if price is None:
        return 0.0, total
    pin, pout = price
    cost = (
        inp * pin
        + read * pin * CACHE_READ_MULT
        + w5 * pin * CACHE_WRITE_5M_MULT
        + w1 * pin * CACHE_WRITE_1H_MULT
        + out * pout
    ) / 1_000_000.0
    return cost, 0


# --------------------------------------------------------------------------- #
# Агрегация
# --------------------------------------------------------------------------- #

KIND_LABELS = {"manual": "руками", "auto": "автоматика"}
FLOW_LABELS = {"main": "основной", "subagent": "подагенты"}


def new_bucket() -> dict:
    return {
        "tokens": 0,
        "input": 0,
        "cache_read": 0,
        "cache_write": 0,
        "output": 0,
        "calls": 0,
        "cost": 0.0,
        "unpriced_tokens": 0,
        "models": {},
        "kinds": {},
        "flows": {},
        "_sessions": set(),
        "_projects": set(),
    }


def add_row(bucket: dict, row: list, cost: float, unpriced: int) -> None:
    _, project, model, kind, flow, inp, read, w5, w1, out, calls, session = row
    tokens = inp + read + w5 + w1 + out
    bucket["tokens"] += tokens
    bucket["input"] += inp
    bucket["cache_read"] += read
    bucket["cache_write"] += w5 + w1
    bucket["output"] += out
    bucket["calls"] += calls
    bucket["cost"] += cost
    bucket["unpriced_tokens"] += unpriced
    bucket["_sessions"].add(session)
    if project != UNASSIGNED:
        bucket["_projects"].add(project)
    _bump(bucket["models"], model_label(model), tokens, cost)
    _bump(bucket["kinds"], KIND_LABELS.get(kind, kind), tokens, cost)
    _bump(bucket["flows"], FLOW_LABELS.get(flow, flow), tokens, cost)


def _bump(store: dict, key: str, tokens: int, cost: float) -> None:
    slot = store.get(key)
    if slot is None:
        store[key] = {"tokens": tokens, "cost": cost}
    else:
        slot["tokens"] += tokens
        slot["cost"] += cost


def finalize(bucket: dict) -> dict:
    context = bucket["input"] + bucket["cache_read"] + bucket["cache_write"]
    out = {
        "tokens": bucket["tokens"],
        "input": bucket["input"],
        "cache_read": bucket["cache_read"],
        "cache_write": bucket["cache_write"],
        "output": bucket["output"],
        "calls": bucket["calls"],
        "cost": round(bucket["cost"], 4),
        "unpriced_tokens": bucket["unpriced_tokens"],
        "cache_share": round(bucket["cache_read"] / context, 4) if context else 0.0,
        "sessions": len(bucket["_sessions"]),
        "projects": len(bucket["_projects"]),
        "models": _top(bucket["models"]),
        "kinds": _top(bucket["kinds"]),
        "flows": _top(bucket["flows"]),
    }
    return out


def _top(store: dict, limit: int = 12) -> list:
    items = sorted(store.items(), key=lambda kv: -kv[1]["tokens"])[:limit]
    return [
        {"key": key, "tokens": val["tokens"], "cost": round(val["cost"], 4)}
        for key, val in items
    ]


def project_label(key: str) -> str:
    return key


# --------------------------------------------------------------------------- #

def build(rows: list, subpaths: list, index_meta: dict) -> dict:
    today = date.today()
    dates = [(today - timedelta(days=WINDOW_DAYS - 1 - i)).isoformat() for i in range(WINDOW_DAYS)]
    date_index = {d: i for i, d in enumerate(dates)}
    window_start = dates[0]

    period_days = {p: int(p) for p in PERIODS}
    period_start = {p: (today - timedelta(days=period_days[p] - 1)).isoformat() for p in PERIODS}

    totals = {p: new_bucket() for p in PERIODS}
    daily = [
        {
            "date": d,
            "tokens": 0,
            "cost": 0.0,
            "calls": 0,
            "manual": 0,
            "auto": 0,
            "_sessions": set(),
            "_projects": {},
        }
        for d in dates
    ]

    projects: dict[str, dict] = {}
    history_from = None

    for row in rows:
        day = row[0]
        if history_from is None or day < history_from:
            history_from = day
        if day < window_start or day > dates[-1]:
            continue

        cost, unpriced = row_cost(row[2], row[5], row[6], row[7], row[8], row[9])
        tokens = row[5] + row[6] + row[7] + row[8] + row[9]

        for period in PERIODS:
            if day >= period_start[period]:
                add_row(totals[period], row, cost, unpriced)

        slot = daily[date_index[day]]
        slot["tokens"] += tokens
        slot["cost"] += cost
        slot["calls"] += row[10]
        slot["_sessions"].add(row[11])
        if row[3] == "auto":
            slot["auto"] += tokens
        else:
            slot["manual"] += tokens
        if row[1] != UNASSIGNED:
            slot["_projects"][row[1]] = slot["_projects"].get(row[1], 0) + tokens

        key = row[1]
        entry = projects.get(key)
        if entry is None:
            entry = {
                "series": [0] * WINDOW_DAYS,
                "cost_series": [0.0] * WINDOW_DAYS,
                "periods": {p: new_bucket() for p in PERIODS},
                "subpaths": {p: {} for p in PERIODS},
                "last_day": None,
            }
            projects[key] = entry
        entry["series"][date_index[day]] += tokens
        entry["cost_series"][date_index[day]] += cost
        if entry["last_day"] is None or day > entry["last_day"]:
            entry["last_day"] = day
        for period in PERIODS:
            if day >= period_start[period]:
                add_row(entry["periods"][period], row, cost, unpriced)

    for sp_date, sp_project, sp_name, touches in subpaths:
        if sp_date < window_start or sp_date > dates[-1]:
            continue
        entry = projects.get(sp_project)
        if entry is None:
            continue
        for period in PERIODS:
            if sp_date >= period_start[period]:
                store = entry["subpaths"][period]
                store[sp_name] = store.get(sp_name, 0) + touches

    daily_out = []
    for slot in daily:
        top_project = None
        if slot["_projects"]:
            top_project = max(slot["_projects"].items(), key=lambda kv: kv[1])[0]
        daily_out.append(
            {
                "date": slot["date"],
                "tokens": slot["tokens"],
                "cost": round(slot["cost"], 4),
                "calls": slot["calls"],
                "sessions": len(slot["_sessions"]),
                "manual": slot["manual"],
                "auto": slot["auto"],
                "top_project": top_project,
            }
        )

    projects_out = []
    for key, entry in projects.items():
        # Проект без токенов за максимальный период в списке не нужен — иначе
        # витрина превращается в шум из давно мёртвых папок.
        if entry["periods"]["30"]["tokens"] <= 0:
            continue
        periods_out = {}
        for period in PERIODS:
            block = finalize(entry["periods"][period])
            block["subpaths"] = [
                {"key": name, "touches": touches}
                for name, touches in sorted(
                    entry["subpaths"][period].items(), key=lambda kv: -kv[1]
                )[:6]
            ]
            periods_out[period] = block
        projects_out.append(
            {
                "key": key,
                "label": project_label(key),
                "series": entry["series"],
                "cost_series": [round(v, 4) for v in entry["cost_series"]],
                "last_day": entry["last_day"],
                "periods": periods_out,
            }
        )
    projects_out.sort(key=lambda p: -p["periods"]["30"]["tokens"])

    return {
        "generated_at": _now_iso(),
        "dates": dates,
        "periods": list(PERIODS),
        "totals": {p: finalize(totals[p]) for p in PERIODS},
        "daily": daily_out,
        "projects": projects_out,
        "meta": {
            "index": index_meta,
            "history_from": history_from,
            "cost_basis": "api_list_price_estimate",
            "cache_multipliers": {
                "read": CACHE_READ_MULT,
                "write_5m": CACHE_WRITE_5M_MULT,
                "write_1h": CACHE_WRITE_1H_MULT,
            },
            "note": (
                "Работа идёт по подписке — эти суммы не списываются. "
                "Это оценка по прайсу API, чтобы сравнивать проекты между собой."
            ),
        },
    }


def _now_iso() -> str:
    from datetime import datetime

    return datetime.now().astimezone().isoformat(timespec="seconds")


# --------------------------------------------------------------------------- #

def main(argv=None) -> int:
    here = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Сборка tokens.json")
    parser.add_argument("--projects-home", default=None, help="папка с проектами (по умолчанию ~/Projects)")
    parser.add_argument("--transcripts", default=None, help="папка транскриптов (~/.claude/projects)")
    parser.add_argument("--cache", default=None, help="файл кэша индекса")
    parser.add_argument("--out", default=str(here / "data" / "tokens.json"))
    parser.add_argument("--retention-days", type=int, default=120)
    parser.add_argument("--save-config", action="store_true", help="запомнить projects-home в конфиге")
    args = parser.parse_args(argv)

    projects_home = resolve_projects_home(args.projects_home)
    transcripts = (
        Path(args.transcripts).expanduser() if args.transcripts else default_transcripts_root()
    )
    cache = Path(args.cache).expanduser() if args.cache else default_cache_path()

    if projects_home is None:
        print(
            "[!] Не нашёл папку с проектами. Укажи её явно:\n"
            "      python3 tokens/build_tokens.py --projects-home ~/Мои/Проекты --save-config\n"
            "    или задай CLAUDE_TOKENS_PROJECTS_HOME. Без неё привязка к проектам\n"
            "    не работает — всё уедет в бакет «(без привязки)».",
            file=sys.stderr,
        )
    else:
        print(f"[i] Проекты:     {projects_home}")
    print(f"[i] Транскрипты: {transcripts}")

    if args.save_config and projects_home:
        cfg = load_config()
        cfg["projects_home"] = str(projects_home)
        save_config(cfg)
        print(f"[i] Конфиг:      {config_path()}")

    if not transcripts.exists():
        print(f"[!] Нет папки транскриптов: {transcripts}", file=sys.stderr)

    index = build_index(transcripts, projects_home, cache, args.retention_days)
    payload = build(index["rows"], index["subpaths"], index["meta"])

    out_path = Path(args.out).expanduser()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    thirty = payload["totals"]["30"]
    print(
        "[ok] {path}: {tokens:,} токенов, ${cost:,.2f}, {calls:,} запросов, "
        "{projects} проектов за 30 дней".format(
            path=out_path,
            tokens=thirty["tokens"],
            cost=thirty["cost"],
            calls=thirty["calls"],
            projects=thirty["projects"],
        ).replace(",", " ")
    )
    if thirty["unpriced_tokens"]:
        print(f"[i] Без цены: {thirty['unpriced_tokens']:,} токенов (незнакомые модели)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
