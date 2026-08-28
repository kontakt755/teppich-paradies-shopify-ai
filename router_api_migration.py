#!/usr/bin/env python3
"""Claude API execution adapter for the existing deterministic A/B/C/D router.

Classification remains in workflow/router.mjs. Pass its task_class into this
adapter; the adapter deliberately does not duplicate the router's rules.
"""

from __future__ import annotations

import argparse
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from api_cost_monitor import BudgetConfig, UsageTracker, cost_micro_usd


@dataclass(frozen=True)
class RouterConfig:
    api_key: Optional[str] = None
    haiku_model: str = field(default_factory=lambda: os.getenv("CLAUDE_HAIKU_MODEL", "claude-haiku-4-5-20251001"))
    sonnet_model: str = field(default_factory=lambda: os.getenv("CLAUDE_SONNET_MODEL", "claude-sonnet-5"))
    opus_model: str = field(default_factory=lambda: os.getenv("CLAUDE_OPUS_MODEL", "claude-opus-5"))
    max_tokens: int = field(default_factory=lambda: int(os.getenv("CLAUDE_MAX_TOKENS", "2048")))
    max_attempts: int = field(default_factory=lambda: int(os.getenv("CLAUDE_MAX_ATTEMPTS", "2")))
    retry_backoff_seconds: float = field(default_factory=lambda: float(os.getenv("CLAUDE_RETRY_BACKOFF_SECONDS", "0.5")))
    usage_db: str = field(default_factory=lambda: os.getenv("CLAUDE_USAGE_DB", ".claude/api_usage.db"))

    def __post_init__(self) -> None:
        object.__setattr__(self, "api_key", self.api_key or os.getenv("ANTHROPIC_API_KEY"))
        if self.max_tokens <= 0:
            raise ValueError("CLAUDE_MAX_TOKENS must be positive")
        if self.max_attempts < 1:
            raise ValueError("CLAUDE_MAX_ATTEMPTS must be at least one")

    def model_for(self, task_class: str, *, escalate_to_opus: bool = False) -> Optional[str]:
        if task_class == "A":
            return None
        if task_class == "B":
            return self.haiku_model
        if task_class in {"C", "D"}:
            return self.opus_model if escalate_to_opus else self.sonnet_model
        raise ValueError("task_class must be A, B, C or D")


class BudgetExceeded(RuntimeError):
    pass


class ClaudeExecutionAdapter:
    def __init__(self, config: Optional[RouterConfig] = None, *, client: Any = None,
                 tracker: Optional[UsageTracker] = None, budget: Optional[BudgetConfig] = None):
        self.config = config or RouterConfig()
        self.tracker = tracker or UsageTracker(self.config.usage_db)
        self.budget = budget or BudgetConfig.from_environment()
        self.client = client

    def _client(self) -> Any:
        if self.client is None:
            if not self.config.api_key:
                raise RuntimeError("ANTHROPIC_API_KEY is required for LLM task classes")
            try:
                from anthropic import Anthropic
            except ImportError as error:
                raise RuntimeError("Anthropic SDK missing; install with: pip install anthropic") from error
            # Retries are deliberately disabled here: every retry must be orchestrated
            # and logged explicitly by the caller to keep cost accounting auditable.
            self.client = Anthropic(api_key=self.config.api_key, timeout=60.0, max_retries=0)
        return self.client

    @staticmethod
    def _minimum_cache_chars(model: str) -> int:
        # Conservative guardrails for the documented minimums: Haiku 4.5 needs
        # 4,096 tokens; current Sonnet needs 1,024. Token Count API remains the
        # authoritative check, so shorter context is simply sent uncached.
        return 16_384 if "haiku" in model.lower() else 4_096

    @staticmethod
    def _retryable(error: Exception) -> bool:
        status_code = getattr(error, "status_code", None)
        return isinstance(error, TimeoutError) or status_code in {429, 500, 502, 503, 504, 529}

    def route_request(self, *, user_query: str, task_class: str, static_context: str = "",
                      escalate_to_opus: bool = False, attempt: int = 1) -> dict:
        model = self.config.model_for(task_class, escalate_to_opus=escalate_to_opus)
        if task_class == "A":
            return {"answer": None, "executed_locally": True, "model": None, "task_class": "A", "cost_micro_usd": 0}
        if not static_context.strip():
            raise ValueError("static_context is required for LLM requests; do not send fabricated repository context")
        cache_eligible = len(static_context) >= self._minimum_cache_chars(model)
        estimate = cost_micro_usd(model=model, input_tokens=len(user_query), output_tokens=self.config.max_tokens,
                                  cache_creation_tokens=len(static_context) if cache_eligible else 0)
        reservation_id, events = self.tracker.reserve_budget(self.budget, estimate)
        if "MONTHLY_HARD_LIMIT" in events:
            raise BudgetExceeded("Configured monthly hard budget limit would be exceeded")
        context_block = {"type": "text", "text": static_context}
        if cache_eligible:
            context_block["cache_control"] = {"type": "ephemeral"}
        system = [
            {"type": "text", "text": "Follow the repository rules in the provided static context."}, context_block,
        ]
        try:
            response = None
            for current_attempt in range(attempt, attempt + self.config.max_attempts):
                try:
                    response = self._client().messages.create(
                        model=model, max_tokens=self.config.max_tokens, system=system,
                        messages=[{"role": "user", "content": user_query}],
                    )
                    attempt = current_attempt
                    break
                except Exception as error:
                    self.tracker.log_api_call(model=model, task_class=task_class, success=False,
                                              error_type=type(error).__name__, attempt=current_attempt)
                    if current_attempt >= attempt + self.config.max_attempts - 1 or not self._retryable(error):
                        raise
                    time.sleep(self.config.retry_backoff_seconds * (2 ** (current_attempt - attempt)))
            assert response is not None
            usage = response.usage
            input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
            output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
            cache_creation = int(getattr(usage, "cache_creation_input_tokens", 0) or 0)
            cache_read = int(getattr(usage, "cache_read_input_tokens", 0) or 0)
            request_id = getattr(response, "_request_id", None)
            logged = self.tracker.log_api_call(
                model=model, task_class=task_class, input_tokens=input_tokens, output_tokens=output_tokens,
                cache_creation_tokens=cache_creation, cache_read_tokens=cache_read,
                request_id=request_id, attempt=attempt,
            )
            text = next((block.text for block in response.content if getattr(block, "type", None) == "text"), "")
            return {
                "answer": text, "executed_locally": False, "model": model, "task_class": task_class,
                "request_id": request_id, "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens,
                    "cache_creation_tokens": cache_creation, "cache_read_tokens": cache_read},
                "cost_micro_usd": logged["cost_micro_usd"], "cost_usd": logged["cost_usd"],
                "budget_events": events, "cache_eligible": cache_eligible,
            }
        finally:
            self.tracker.release_budget_reservation(reservation_id)


def main() -> None:
    parser = argparse.ArgumentParser(description="Claude API adapter for an already-classified task")
    parser.add_argument("--task-class", choices=["A", "B", "C", "D"], required=True)
    parser.add_argument("--query", required=True)
    parser.add_argument("--context-file", type=Path)
    parser.add_argument("--opus", action="store_true", help="Explicitly escalate C/D to configured Opus model")
    args = parser.parse_args()
    context = args.context_file.read_text(encoding="utf-8") if args.context_file else ""
    result = ClaudeExecutionAdapter().route_request(user_query=args.query, task_class=args.task_class,
                                                     static_context=context, escalate_to_opus=args.opus)
    print(result)


if __name__ == "__main__":
    main()
