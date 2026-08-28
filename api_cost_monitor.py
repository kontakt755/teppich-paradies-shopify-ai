#!/usr/bin/env python3
"""Usage, cost and budget tracking for the Claude API adapter."""

from __future__ import annotations

import argparse
import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Optional

MICRO_USD = Decimal("1000000")


def _decimal_env(name: str, default: str) -> Decimal:
    return Decimal(os.getenv(name, default))


@dataclass(frozen=True)
class ModelPricing:
    input_per_mtok: Decimal
    cache_write_5m_per_mtok: Decimal
    cache_read_per_mtok: Decimal
    output_per_mtok: Decimal


PRICING = {
    "haiku": ModelPricing(_decimal_env("CLAUDE_HAIKU_INPUT_PER_MTOK", "1"), _decimal_env("CLAUDE_HAIKU_CACHE_WRITE_PER_MTOK", "1.25"), _decimal_env("CLAUDE_HAIKU_CACHE_READ_PER_MTOK", "0.10"), _decimal_env("CLAUDE_HAIKU_OUTPUT_PER_MTOK", "5")),
    "sonnet": ModelPricing(_decimal_env("CLAUDE_SONNET_INPUT_PER_MTOK", "2"), _decimal_env("CLAUDE_SONNET_CACHE_WRITE_PER_MTOK", "2.50"), _decimal_env("CLAUDE_SONNET_CACHE_READ_PER_MTOK", "0.20"), _decimal_env("CLAUDE_SONNET_OUTPUT_PER_MTOK", "10")),
    "opus": ModelPricing(_decimal_env("CLAUDE_OPUS_INPUT_PER_MTOK", "5"), _decimal_env("CLAUDE_OPUS_CACHE_WRITE_PER_MTOK", "6.25"), _decimal_env("CLAUDE_OPUS_CACHE_READ_PER_MTOK", "0.50"), _decimal_env("CLAUDE_OPUS_OUTPUT_PER_MTOK", "25")),
}


def pricing_for_model(model: str) -> ModelPricing:
    normalized = model.lower()
    if "haiku" in normalized:
        return PRICING["haiku"]
    if "opus" in normalized:
        return PRICING["opus"]
    return PRICING["sonnet"]


def cost_micro_usd(*, model: str, input_tokens: int, output_tokens: int,
                   cache_creation_tokens: int = 0, cache_read_tokens: int = 0) -> int:
    """Calculate cost from the separate API usage fields without float rounding."""
    values = (input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens)
    if any(value < 0 for value in values):
        raise ValueError("Token values must not be negative")
    price = pricing_for_model(model)
    amount = (
        Decimal(input_tokens) * price.input_per_mtok
        + Decimal(output_tokens) * price.output_per_mtok
        + Decimal(cache_creation_tokens) * price.cache_write_5m_per_mtok
        + Decimal(cache_read_tokens) * price.cache_read_per_mtok
    ) / MICRO_USD
    return int((amount * MICRO_USD).to_integral_value(rounding=ROUND_HALF_UP))


def usd(micro_usd: int) -> Decimal:
    return (Decimal(micro_usd) / MICRO_USD).quantize(Decimal("0.000001"))


class UsageTracker:
    def __init__(self, db_path: str = ".claude/api_usage.db"):
        self.db_path = Path(db_path).expanduser()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path, timeout=10, isolation_level=None)
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA busy_timeout=10000")
        return connection

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS api_calls (
                    id INTEGER PRIMARY KEY,
                    timestamp_utc TEXT NOT NULL,
                    request_id TEXT,
                    model TEXT NOT NULL,
                    task_class TEXT NOT NULL CHECK(task_class IN ('A', 'B', 'C', 'D')),
                    attempt INTEGER NOT NULL DEFAULT 1 CHECK(attempt > 0),
                    success INTEGER NOT NULL CHECK(success IN (0, 1)),
                    error_type TEXT,
                    input_tokens INTEGER NOT NULL DEFAULT 0 CHECK(input_tokens >= 0),
                    output_tokens INTEGER NOT NULL DEFAULT 0 CHECK(output_tokens >= 0),
                    cache_creation_tokens INTEGER NOT NULL DEFAULT 0 CHECK(cache_creation_tokens >= 0),
                    cache_read_tokens INTEGER NOT NULL DEFAULT 0 CHECK(cache_read_tokens >= 0),
                    cost_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK(cost_micro_usd >= 0)
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS api_calls_timestamp_idx ON api_calls(timestamp_utc)")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS budget_reservations (
                    id INTEGER PRIMARY KEY,
                    timestamp_utc TEXT NOT NULL,
                    amount_micro_usd INTEGER NOT NULL CHECK(amount_micro_usd >= 0)
                )
            """)

    def log_api_call(self, *, model: str, task_class: str, input_tokens: int = 0,
                     output_tokens: int = 0, cache_creation_tokens: int = 0,
                     cache_read_tokens: int = 0, request_id: Optional[str] = None,
                     success: bool = True, error_type: Optional[str] = None,
                     attempt: int = 1) -> dict:
        if task_class not in {"A", "B", "C", "D"}:
            raise ValueError("task_class must be A, B, C or D")
        amount = cost_micro_usd(model=model, input_tokens=input_tokens, output_tokens=output_tokens,
                                cache_creation_tokens=cache_creation_tokens,
                                cache_read_tokens=cache_read_tokens) if success else 0
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute("""
                INSERT INTO api_calls (timestamp_utc, request_id, model, task_class, attempt,
                    success, error_type, input_tokens, output_tokens, cache_creation_tokens,
                    cache_read_tokens, cost_micro_usd)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (datetime.now(timezone.utc).isoformat(), request_id, model, task_class, attempt,
                  int(success), error_type, input_tokens, output_tokens, cache_creation_tokens,
                  cache_read_tokens, amount))
            conn.execute("COMMIT")
        return {"cost_usd": str(usd(amount)), "cost_micro_usd": amount, "success": success}

    def summary(self, period: str) -> dict:
        if period not in {"daily", "monthly"}:
            raise ValueError("period must be daily or monthly")
        group = "substr(timestamp_utc, 1, 10)" if period == "daily" else "substr(timestamp_utc, 1, 7)"
        with self._connect() as conn:
            rows = conn.execute(f"""
                SELECT {group}, COUNT(*), SUM(success), SUM(input_tokens), SUM(output_tokens),
                       SUM(cache_creation_tokens), SUM(cache_read_tokens), SUM(cost_micro_usd)
                FROM api_calls GROUP BY {group} ORDER BY {group} DESC
            """).fetchall()
        return {"period": period, "rows": [
            {"bucket": row[0], "requests": row[1], "successful_requests": row[2] or 0,
             "input_tokens": row[3] or 0, "output_tokens": row[4] or 0,
             "cache_creation_tokens": row[5] or 0, "cache_read_tokens": row[6] or 0,
             "cost_usd": str(usd(row[7] or 0))} for row in rows
        ]}

    def current_cost_micro_usd(self, period: str) -> int:
        prefix = datetime.now(timezone.utc).strftime("%Y-%m-%d" if period == "daily" else "%Y-%m")
        with self._connect() as conn:
            return conn.execute("SELECT COALESCE(SUM(cost_micro_usd), 0) FROM api_calls WHERE timestamp_utc LIKE ?", (f"{prefix}%",)).fetchone()[0]

    def reserve_budget(self, budget: "BudgetConfig", estimated_micro_usd: int) -> tuple[Optional[int], list[str]]:
        """Atomically reserve a conservative request budget across processes."""
        now = datetime.now(timezone.utc).isoformat()
        day_prefix, month_prefix = now[:10], now[:7]
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            def total(prefix: str) -> int:
                calls = conn.execute("SELECT COALESCE(SUM(cost_micro_usd), 0) FROM api_calls WHERE timestamp_utc LIKE ?", (f"{prefix}%",)).fetchone()[0]
                reserved = conn.execute("SELECT COALESCE(SUM(amount_micro_usd), 0) FROM budget_reservations WHERE timestamp_utc LIKE ?", (f"{prefix}%",)).fetchone()[0]
                return calls + reserved + estimated_micro_usd
            daily = Decimal(total(day_prefix)) / MICRO_USD
            monthly = Decimal(total(month_prefix)) / MICRO_USD
            events = []
            if budget.daily_warning_usd is not None and daily >= budget.daily_warning_usd:
                events.append("DAILY_WARNING")
            if budget.monthly_warning_usd is not None and monthly >= budget.monthly_warning_usd:
                events.append("MONTHLY_WARNING")
            if budget.monthly_hard_limit_usd is not None and monthly >= budget.monthly_hard_limit_usd:
                events.append("MONTHLY_HARD_LIMIT")
                conn.execute("ROLLBACK")
                return None, events
            cursor = conn.execute("INSERT INTO budget_reservations (timestamp_utc, amount_micro_usd) VALUES (?, ?)", (now, estimated_micro_usd))
            conn.execute("COMMIT")
            return cursor.lastrowid, events

    def release_budget_reservation(self, reservation_id: Optional[int]) -> None:
        if reservation_id is None:
            return
        with self._connect() as conn:
            conn.execute("DELETE FROM budget_reservations WHERE id = ?", (reservation_id,))


@dataclass(frozen=True)
class BudgetConfig:
    daily_warning_usd: Optional[Decimal] = None
    monthly_warning_usd: Optional[Decimal] = None
    monthly_hard_limit_usd: Optional[Decimal] = None

    @classmethod
    def from_environment(cls) -> "BudgetConfig":
        def optional(name: str) -> Optional[Decimal]:
            value = os.getenv(name)
            return Decimal(value) if value else None
        return cls(optional("CLAUDE_DAILY_WARNING_USD"), optional("CLAUDE_MONTHLY_WARNING_USD"), optional("CLAUDE_MONTHLY_HARD_LIMIT_USD"))



def main() -> None:
    parser = argparse.ArgumentParser(description="Claude API cost monitor")
    parser.add_argument("--db", default=".claude/api_usage.db")
    parser.add_argument("--report", choices=["daily", "monthly"])
    parser.add_argument("--simulate", type=int, metavar="REQUESTS")
    args = parser.parse_args()
    if args.simulate is not None:
        total = cost_micro_usd(model="claude-sonnet-5", input_tokens=int(args.simulate * 2000 * 0.25),
                               output_tokens=args.simulate * 500,
                               cache_read_tokens=int(args.simulate * 2000 * 0.75))
        print(f"Illustrative Sonnet 5 estimate for {args.simulate} requests: ${usd(total)} (excludes cache writes/retries)")
        return
    tracker = UsageTracker(args.db)
    if args.report:
        for row in tracker.summary(args.report)["rows"]:
            print(f"{row['bucket']}: {row['requests']} requests, ${row['cost_usd']}")
    else:
        print(f"Tracking database ready: {tracker.db_path}")


if __name__ == "__main__":
    main()
