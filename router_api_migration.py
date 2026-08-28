#!/usr/bin/env python3
"""
Codex + Claude Code Router → Claude API Migration
Complete example with Prompt Caching for Teppich Paradies

This shows how to migrate your existing router to use Claude API
with automatic prompt caching for cost optimization.

Usage:
  python router_api_migration.py --demo              # Run demo
  python router_api_migration.py --analyze repo.py  # Analyze file
  python router_api_migration.py --test-cache       # Test caching
"""

import os
import sys
import json
from datetime import datetime
from pathlib import Path
from typing import Optional
import argparse

try:
    from anthropic import Anthropic
except ImportError:
    print("❌ Anthropic SDK not installed. Install via: pip install anthropic")
    sys.exit(1)


# ============================================================================
# CONFIGURATION
# ============================================================================

class RouterConfig:
    """Router configuration with API settings"""

    def __init__(self):
        self.api_key = os.getenv("ANTHROPIC_API_KEY")
        self.model = "claude-3-5-sonnet-20241022"
        self.max_tokens = 2048

        # Cache settings (ephemeral = 5 min default)
        self.cache_ttl_seconds = 300
        self.cache_type = "ephemeral"

        # Usage tracking
        self.track_usage = True
        self.usage_log_file = Path("~/.claude/router_usage.jsonl").expanduser()

    def validate(self) -> bool:
        """Validate configuration"""
        if not self.api_key:
            print("❌ ANTHROPIC_API_KEY not set")
            return False
        if not self.api_key.startswith("sk-ant-"):
            print("❌ Invalid API key format")
            return False
        return True


# ============================================================================
# ROUTER WITH PROMPT CACHING
# ============================================================================

class CachedRouter:
    """Codex + Claude Code Router with Prompt Caching optimizations"""

    def __init__(self, config: RouterConfig):
        self.config = config
        self.client = Anthropic(api_key=config.api_key)
        self.cache_stats = {
            "total_requests": 0,
            "cache_hits": 0,
            "cache_creation": 0,
            "total_tokens_saved": 0,
            "total_cost": 0.0,
        }

    def get_codebase_context(self, repo_path: str) -> str:
        """Load codebase context for caching (e.g., Teppich Paradies repo)"""
        # In production: read actual repo structure/README/docs
        # This example uses mock data for demonstration

        context = f"""
# Repository: {repo_path}
## Structure
```
teppich-paradies-shopify-ai/
├── src/
│   ├── api/
│   │   ├── client.py
│   │   ├── routes.py
│   │   └── middleware.py
│   ├── models/
│   │   ├── product.py
│   │   ├── order.py
│   │   └── customer.py
│   └── utils/
│       ├── helpers.py
│       └── validators.py
├── tests/
├── README.md
└── requirements.txt
```

## Key Components
1. **Shopify Integration**: Handles product sync, inventory, orders
2. **Claude Code Router**: Routes requests to optimal Claude model
3. **Caching Layer**: Cache frequently accessed codebase data
4. **API Server**: FastAPI + async handlers

## Recent Changes
- Added batch processing for product updates
- Optimized database queries with indices
- Implemented rate limiting

## Known Patterns
- All product operations use `/api/v1/products`
- Customer queries need authentication
- Orders support bulk updates via Batch API
"""
        return context

    def route_request(self, user_query: str, repo_path: str = ".",
                     use_cache: bool = True) -> dict:
        """
        Route a request through the cached analyzer

        This replaces the old Codex + Claude Code Router with a
        single Claude API call using prompt caching.

        Args:
            user_query: The user's question/task
            repo_path: Path to repository for context
            use_cache: Whether to use prompt caching

        Returns:
            Response dict with answer + usage metrics
        """
        self.config.track_usage and (self.cache_stats["total_requests"] += 1)

        # Get codebase context (this will be cached)
        codebase_context = self.get_codebase_context(repo_path)

        # Build system prompt with caching
        system_messages = [
            {
                "type": "text",
                "text": "You are an expert code analyst for the Teppich Paradies Shopify AI project. "
                       "Analyze code, suggest optimizations, and answer architecture questions.",
            },
        ]

        # Add large context with cache control
        if use_cache:
            system_messages.append({
                "type": "text",
                "text": codebase_context,
                "cache_control": {"type": self.config.cache_type}
            })
        else:
            system_messages.append({
                "type": "text",
                "text": codebase_context,
            })

        # Send request to Claude API
        response = self.client.messages.create(
            model=self.config.model,
            max_tokens=self.config.max_tokens,
            system=system_messages,
            messages=[
                {"role": "user", "content": user_query}
            ]
        )

        # Track usage metrics
        usage = response.usage
        if hasattr(usage, 'cache_creation_input_tokens') and usage.cache_creation_input_tokens:
            self.cache_stats["cache_creation"] += usage.cache_creation_input_tokens
        if hasattr(usage, 'cache_read_input_tokens') and usage.cache_read_input_tokens:
            self.cache_stats["cache_hits"] += 1
            self.cache_stats["total_tokens_saved"] += usage.cache_read_input_tokens

        # Calculate cost
        pricing = {
            "input_uncached": 0.000003,     # $3/1M
            "input_cached": 0.0000003,      # $0.30/1M
            "output": 0.000015,              # $15/1M
        }

        uncached_cost = usage.input_tokens * pricing["input_uncached"]
        output_cost = usage.output_tokens * pricing["output"]
        cached_cost = (getattr(usage, 'cache_read_input_tokens', 0) or 0) * pricing["input_cached"]
        total_cost = uncached_cost + output_cost + cached_cost

        self.cache_stats["total_cost"] += total_cost

        result = {
            "answer": response.content[0].text,
            "usage": {
                "input_tokens": usage.input_tokens,
                "output_tokens": usage.output_tokens,
                "cache_creation_tokens": getattr(usage, 'cache_creation_input_tokens', 0),
                "cache_read_tokens": getattr(usage, 'cache_read_input_tokens', 0),
            },
            "cost": {
                "input": round(uncached_cost, 4),
                "cached_input": round(cached_cost, 4),
                "output": round(output_cost, 4),
                "total": round(total_cost, 4),
            },
            "cached": bool(getattr(usage, 'cache_read_input_tokens', 0)),
            "timestamp": datetime.now().isoformat(),
        }

        # Log usage
        if self.config.track_usage:
            self._log_usage(result)

        return result

    def _log_usage(self, result: dict):
        """Log usage for cost tracking"""
        self.config.usage_log_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.config.usage_log_file, "a") as f:
            f.write(json.dumps(result) + "\n")

    def get_stats(self) -> dict:
        """Get router statistics"""
        return {
            **self.cache_stats,
            "cache_hit_rate": (
                self.cache_stats["cache_hits"] / self.cache_stats["total_requests"] * 100
                if self.cache_stats["total_requests"] > 0 else 0
            ),
            "avg_cost_per_request": (
                self.cache_stats["total_cost"] / self.cache_stats["total_requests"]
                if self.cache_stats["total_requests"] > 0 else 0
            ),
        }


# ============================================================================
# DEMONSTRATION
# ============================================================================

def demo_router():
    """Demonstrate router with and without caching"""
    print("\n" + "=" * 70)
    print("🚀 CLAUDE API ROUTER DEMO (with Prompt Caching)")
    print("=" * 70 + "\n")

    # Initialize router
    config = RouterConfig()
    if not config.validate():
        print("❌ Configuration invalid. Set ANTHROPIC_API_KEY environment variable.")
        return

    router = CachedRouter(config)

    # Test queries
    queries = [
        "What is the main purpose of the router in this codebase?",
        "How would you optimize the database queries in the models/ directory?",
        "Explain the API structure and suggest improvements.",
    ]

    print(f"📊 Testing {len(queries)} requests with caching...\n")

    for i, query in enumerate(queries, 1):
        print(f"Query {i}: {query}")
        print("─" * 70)

        try:
            result = router.route_request(query, repo_path="teppich-paradies-shopify-ai")

            # Show response summary
            answer = result["answer"][:200] + "..." if len(result["answer"]) > 200 else result["answer"]
            print(f"Answer: {answer}\n")

            # Show usage metrics
            usage = result["usage"]
            cost = result["cost"]
            print(f"📊 Usage Metrics:")
            print(f"   Input tokens: {usage['input_tokens']}")
            print(f"   Output tokens: {usage['output_tokens']}")
            print(f"   Cache creation: {usage['cache_creation_tokens']}")
            print(f"   Cache read: {usage['cache_read_tokens']}")
            print(f"   Cached: {'✅ Yes' if result['cached'] else '❌ No'}\n")

            print(f"💰 Cost:")
            print(f"   Input: ${cost['input']:.4f}")
            print(f"   Cached input: ${cost['cached_input']:.4f}")
            print(f"   Output: ${cost['output']:.4f}")
            print(f"   Total: ${cost['total']:.4f}\n")

        except Exception as e:
            print(f"❌ Error: {e}\n")

    # Show aggregate stats
    stats = router.get_stats()
    print("=" * 70)
    print("📈 AGGREGATE STATISTICS")
    print("=" * 70)
    print(f"Total requests: {stats['total_requests']}")
    print(f"Cache hit rate: {stats['cache_hit_rate']:.1f}%")
    print(f"Tokens saved: {stats['total_tokens_saved']:,}")
    print(f"Total cost: ${stats['total_cost']:.4f}")
    print(f"Avg cost/request: ${stats['avg_cost_per_request']:.4f}\n")


def test_cache_performance():
    """Test cache hit rate with repeated requests"""
    print("\n" + "=" * 70)
    print("🧪 CACHE PERFORMANCE TEST")
    print("=" * 70 + "\n")

    config = RouterConfig()
    if not config.validate():
        return

    router = CachedRouter(config)

    # Same query repeated 5 times
    query = "Analyze the Shopify integration patterns in this codebase."

    print(f"Sending same query 5 times to test cache efficiency...\n")

    for i in range(1, 6):
        print(f"Request {i}:")
        try:
            result = router.route_request(query)
            cached = result.get("cached", False)
            cost = result["cost"]["total"]
            print(f"  Cost: ${cost:.4f} | Cached: {'✅' if cached else '❌'}\n")
        except Exception as e:
            print(f"  ❌ Error: {e}\n")

    stats = router.get_stats()
    print("=" * 70)
    print(f"Cache hits: {stats['cache_hits']}/{stats['total_requests']}")
    print(f"Cache hit rate: {stats['cache_hit_rate']:.1f}%")
    print(f"Total cost: ${stats['total_cost']:.4f}")
    print(f"Savings: ${(stats['total_tokens_saved'] * 0.0000027):.4f} (vs. uncached)\n")


# ============================================================================
# MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Claude API Router with Prompt Caching"
    )
    parser.add_argument("--demo", action="store_true",
                       help="Run demo with sample queries")
    parser.add_argument("--test-cache", action="store_true",
                       help="Test cache performance")
    parser.add_argument("--analyze", type=str,
                       help="Analyze specific file")
    parser.add_argument("--query", type=str,
                       help="Custom query to route")

    args = parser.parse_args()

    if not args.demo and not args.test_cache and not args.analyze and not args.query:
        print("""
╔════════════════════════════════════════════════════════╗
║    Claude API Router with Prompt Caching Examples      ║
╚════════════════════════════════════════════════════════╝

Usage:
  python router_api_migration.py --demo              # Run demo
  python router_api_migration.py --test-cache        # Test caching
  python router_api_migration.py --query "Your Q?"   # Custom query
  python router_api_migration.py --analyze file.py   # Analyze file

Requirements:
  export ANTHROPIC_API_KEY='sk-ant-...'
  pip install anthropic

""")
        return

    if args.demo:
        demo_router()
    elif args.test_cache:
        test_cache_performance()
    elif args.query:
        config = RouterConfig()
        if config.validate():
            router = CachedRouter(config)
            result = router.route_request(args.query)
            print(f"\nAnswer:\n{result['answer']}\n")
            print(f"Cost: ${result['cost']['total']:.4f}")
    elif args.analyze:
        config = RouterConfig()
        if config.validate():
            router = CachedRouter(config)
            query = f"Analyze and suggest improvements for the code in {args.analyze}"
            result = router.route_request(query)
            print(f"\nAnalysis:\n{result['answer']}\n")
            print(f"Cost: ${result['cost']['total']:.4f}")


if __name__ == "__main__":
    main()
