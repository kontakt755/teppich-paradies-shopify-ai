#!/usr/bin/env python3
"""Offline demonstration of the corrected routing and accounting contract."""

from api_cost_monitor import cost_micro_usd, usd
from router_api_migration import RouterConfig


def main() -> None:
    config = RouterConfig()
    print("Claude API router demo (offline; no key and no API call required)\n")
    for task_class in "ABCD":
        print(f"{task_class} -> {config.model_for(task_class) or 'LOCAL / no LLM'}")
    first = cost_micro_usd(model=config.sonnet_model, input_tokens=800, output_tokens=500,
                           cache_creation_tokens=4_000)
    later = cost_micro_usd(model=config.sonnet_model, input_tokens=800, output_tokens=500,
                           cache_read_tokens=4_000)
    print("\nExample with a 4,000-token reusable prefix:")
    print(f"first request (cache write): ${usd(first)}")
    print(f"later request (cache read):  ${usd(later)}")
    print("Actual cacheability depends on the selected model's minimum cacheable prompt length.")


if __name__ == "__main__":
    main()
