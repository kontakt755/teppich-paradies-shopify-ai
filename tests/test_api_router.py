import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from api_cost_monitor import BudgetConfig, UsageTracker, cost_micro_usd
from router_api_migration import AuthenticationFailed, BudgetExceeded, ClaudeExecutionAdapter, ConfigurationError, RouterConfig


class FakeMessages:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.response


class StatusError(Exception):
    def __init__(self, status_code):
        self.status_code = status_code


class ApiRouterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = str(Path(self.temp.name) / "usage.db")
        self.tracker = UsageTracker(self.db)

    def tearDown(self):
        self.temp.cleanup()

    def test_cost_accounts_for_cache_write_and_read_separately(self):
        # Sonnet 5: 100 regular input, 200 write, 300 read, 400 output.
        self.assertEqual(cost_micro_usd(model="claude-sonnet-5", input_tokens=100,
                                        cache_creation_tokens=200, cache_read_tokens=300,
                                        output_tokens=400), 4760)

    def test_class_a_never_creates_a_client_or_cost(self):
        adapter = ClaudeExecutionAdapter(RouterConfig(usage_db=self.db), tracker=self.tracker)
        result = adapter.route_request(user_query="Run local validation", task_class="A")
        self.assertTrue(result["executed_locally"])
        self.assertIsNone(result["model"])
        self.assertEqual(self.tracker.summary("monthly")["rows"], [])

    def test_b_uses_haiku_and_logs_usage_request_id_and_cache_fields(self):
        response = SimpleNamespace(
            usage=SimpleNamespace(input_tokens=100, output_tokens=400,
                                  cache_creation_input_tokens=200, cache_read_input_tokens=300),
            _request_id="req_test", content=[SimpleNamespace(type="text", text="ok")],
        )
        messages = FakeMessages(response=response)
        client = SimpleNamespace(messages=messages)
        adapter = ClaudeExecutionAdapter(RouterConfig(usage_db=self.db), client=client, tracker=self.tracker)
        result = adapter.route_request(user_query="implement", task_class="B", static_context="rules " * 3000)
        self.assertEqual(result["model"], "claude-haiku-4-5-20251001")
        self.assertEqual(result["request_id"], "req_test")
        self.assertEqual(messages.calls[0]["system"][1]["cache_control"], {"type": "ephemeral"})
        row = self.tracker.summary("monthly")["rows"][0]
        self.assertEqual(row["cache_creation_tokens"], 200)
        self.assertEqual(row["cache_read_tokens"], 300)

    def test_error_is_recorded_without_a_fake_cost(self):
        messages = FakeMessages(error=TimeoutError("timeout"))
        adapter = ClaudeExecutionAdapter(RouterConfig(usage_db=self.db), client=SimpleNamespace(messages=messages), tracker=self.tracker)
        with self.assertRaises(TimeoutError):
            adapter.route_request(user_query="implement", task_class="C", static_context="rules")
        row = self.tracker.summary("monthly")["rows"][0]
        self.assertEqual(row["successful_requests"], 0)
        self.assertEqual(row["cost_usd"], "0.000000")

    def test_429_is_logged_then_retried_once_with_an_explicit_attempt(self):
        response = SimpleNamespace(
            usage=SimpleNamespace(input_tokens=10, output_tokens=10,
                                  cache_creation_input_tokens=0, cache_read_input_tokens=0),
            _request_id="req_retry", content=[SimpleNamespace(type="text", text="ok")],
        )
        messages = FakeMessages(response=response)
        original_create = messages.create
        calls = [StatusError(429)]
        def create(**kwargs):
            if calls:
                raise calls.pop()
            return original_create(**kwargs)
        messages.create = create
        config = RouterConfig(usage_db=self.db, retry_backoff_seconds=0)
        adapter = ClaudeExecutionAdapter(config, client=SimpleNamespace(messages=messages), tracker=self.tracker)
        adapter.route_request(user_query="implement", task_class="C", static_context="rules")
        row = self.tracker.summary("monthly")["rows"][0]
        self.assertEqual(row["requests"], 2)
        self.assertEqual(row["successful_requests"], 1)

    def test_500_and_timeout_are_retryable_but_other_client_errors_are_not(self):
        self.assertTrue(ClaudeExecutionAdapter._retryable(StatusError(500)))
        self.assertTrue(ClaudeExecutionAdapter._retryable(TimeoutError("timeout")))
        self.assertFalse(ClaudeExecutionAdapter._retryable(StatusError(400)))

    def test_401_is_logged_once_and_reported_as_authentication_failure(self):
        messages = FakeMessages(error=StatusError(401))
        adapter = ClaudeExecutionAdapter(
            RouterConfig(usage_db=self.db), client=SimpleNamespace(messages=messages), tracker=self.tracker
        )
        with self.assertRaises(AuthenticationFailed):
            adapter.route_request(user_query="implement", task_class="B", static_context="rules")
        row = self.tracker.summary("monthly")["rows"][0]
        self.assertEqual(row["requests"], 1)
        self.assertEqual(row["successful_requests"], 0)

    def test_malformed_key_is_rejected_before_any_http_request(self):
        config = RouterConfig(api_key="$ ( pbpaste )", usage_db=self.db)
        adapter = ClaudeExecutionAdapter(config, tracker=self.tracker)
        with self.assertRaises(ConfigurationError):
            adapter.route_request(user_query="implement", task_class="B", static_context="rules")

    def test_budget_hard_stop_blocks_request(self):
        budget = BudgetConfig(monthly_hard_limit_usd=__import__("decimal").Decimal("0.000001"))
        adapter = ClaudeExecutionAdapter(RouterConfig(usage_db=self.db), client=SimpleNamespace(messages=FakeMessages()), tracker=self.tracker, budget=budget)
        with self.assertRaises(BudgetExceeded):
            adapter.route_request(user_query="implement", task_class="D", static_context="rules")


if __name__ == "__main__":
    unittest.main()
