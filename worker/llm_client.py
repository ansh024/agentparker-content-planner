"""Three-tier LLM client for listening-brief synthesis.

Tier 1 (preferred): the `claude` CLI in headless mode, authenticated with
    ``CLAUDE_CODE_OAUTH_TOKEN``. This bills the user's Claude subscription quota
    instead of API credits. We deliberately do NOT pass ``ANTHROPIC_API_KEY`` to
    the CLI's environment so it cannot silently fall back to API billing.
Tier 2: the ``anthropic`` Python SDK with ``ANTHROPIC_API_KEY`` (API credits).
Tier 3: ``None`` — the caller falls back to the deterministic template brief.

Design rules (see docs/plans/01-worker-synthesis-and-cost.md + REVIEW.md A2/A3/B3/B4):
  * Never raise out of synthesis — every tier degrades silently to the next.
  * Never log the OAuth token or API key.
  * Model ids are exact (``claude-sonnet-4-6``), never date-suffixed.
  * 4.x models: adaptive thinking only — no ``budget_tokens``, ``temperature``,
    or ``top_p``.
"""

from __future__ import annotations

import json
import os
import subprocess
from typing import Any, Optional

DEFAULT_MODEL = "claude-sonnet-4-6"
DEFAULT_TIMEOUT_SECONDS = 120


def synth_model() -> str:
    """Resolve the synthesis model id from env, defaulting to Sonnet 4.6."""
    return (os.environ.get("LISTENING_SYNTH_MODEL") or DEFAULT_MODEL).strip() or DEFAULT_MODEL


def provider_available() -> bool:
    """True if a Claude provider is configured (subscription token OR API key).

    Used to distinguish "no provider configured" (a setup error the operator must
    fix) from "provider configured but the call failed" when a run aborts. There
    is no deterministic fallback — listening requires a real Claude provider.
    """
    return bool(
        (os.environ.get("CLAUDE_CODE_OAUTH_TOKEN") or "").strip()
        or (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
    )


def extract_json_object(text: Optional[str]) -> Optional[dict[str, Any]]:
    """Best-effort extraction of a single JSON object from free-form text.

    Strips Markdown code fences, then takes the substring from the first ``{``
    to the last ``}``. Returns ``None`` on any failure (never raises).
    """
    if not text or not isinstance(text, str):
        return None
    cleaned = text.strip()
    # Strip a leading ```json / ``` fence and trailing ``` if present.
    if cleaned.startswith("```"):
        newline = cleaned.find("\n")
        if newline != -1:
            cleaned = cleaned[newline + 1:]
        if cleaned.rstrip().endswith("```"):
            cleaned = cleaned.rstrip()[:-3]
    cleaned = cleaned.strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        parsed = json.loads(cleaned[start:end + 1])
    except (json.JSONDecodeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _extract_cli_text(envelope: Any) -> Optional[str]:
    """Pull the assistant text out of the `claude -p --output-format json` envelope.

    The CLI is not authenticated in CI, so this is parsed defensively against a
    few known/likely shapes (REVIEW.md A3):
      1. ``{"result": "<text>"}``  (documented headless envelope)
      2. ``{"content": [{"type": "text", "text": "..."}]}``  (message-like)
      3. a bare string
    """
    if isinstance(envelope, str):
        return envelope
    if not isinstance(envelope, dict):
        return None
    # 1. Documented `.result` field.
    result = envelope.get("result")
    if isinstance(result, str) and result.strip():
        return result
    if isinstance(result, dict):
        nested = _extract_cli_text(result)
        if nested:
            return nested
    # 2. Anthropic-style content blocks.
    content = envelope.get("content")
    if isinstance(content, list):
        parts = [
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        ]
        joined = "".join(parts).strip()
        if joined:
            return joined
    # 3. Some envelopes nest the assistant message.
    message = envelope.get("message")
    if isinstance(message, dict):
        return _extract_cli_text(message)
    return None


def _call_claude_cli(system: str, user: str, model: str) -> Optional[dict[str, Any]]:
    """Tier 1: run the headless `claude` CLI billed to the subscription.

    Returns the parsed brief dict, or ``None`` on any failure.
    """
    token = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")
    if not token:
        return None

    binary = os.environ.get("CLAUDE_CLI_BIN", "claude")
    prompt = f"{system}\n\n{user}\n\nRespond with ONLY the JSON object, no prose, no code fences."

    # Subscription billing: pass the OAuth token but strip ANTHROPIC_API_KEY so
    # the CLI cannot fall back to API-credit billing. Also give it a writable
    # HOME so it can manage ~/.claude non-interactively (REVIEW.md A3).
    env = os.environ.copy()
    env.pop("ANTHROPIC_API_KEY", None)
    env["CLAUDE_CODE_OAUTH_TOKEN"] = token
    env.setdefault("HOME", os.environ.get("HOME", "/tmp"))

    cmd = [binary, "-p", prompt, "--output-format", "json", "--model", model]
    try:
        proc = subprocess.run(
            cmd,
            env=env,
            capture_output=True,
            text=True,
            timeout=int(os.environ.get("LISTENING_SYNTH_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS)),
            check=False,
        )
    except (OSError, ValueError, subprocess.SubprocessError):
        # Binary missing, bad timeout value, etc. — degrade silently. Never log
        # the environment (it contains the token).
        return None

    if proc.returncode != 0:
        return None

    envelope: Any
    try:
        envelope = json.loads(proc.stdout)
    except (json.JSONDecodeError, ValueError):
        envelope = proc.stdout  # parse text directly below

    text = _extract_cli_text(envelope) or proc.stdout
    return extract_json_object(text)


def _build_json_schema() -> dict[str, Any]:
    """JSON schema for the brief, used by the Tier-2 structured-output path."""
    citation = {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "url": {"type": "string"},
            "source": {"type": "string"},
        },
        "required": ["title", "url", "source"],
        "additionalProperties": False,
    }
    return {
        "type": "object",
        "properties": {
            "headline": {"type": "string"},
            "what_changed": {"type": "string"},
            "audience_pains": {"type": "array", "items": {"type": "string"}},
            "content_angles": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "angle": {"type": "string"},
                        "why": {"type": "string"},
                        "format": {"type": "string"},
                        "evidence": {"type": "array", "items": citation},
                        "score": {"type": ["number", "null"]},
                    },
                    "required": ["title", "angle", "why"],
                    "additionalProperties": True,
                },
            },
            "scripts_or_hooks": {"type": "array", "items": {"type": "string"}},
            "source_citations": {"type": "array", "items": citation},
            "top_pick": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "why": {"type": "string"},
                },
                "additionalProperties": True,
            },
        },
        "required": ["headline", "content_angles"],
        "additionalProperties": True,
    }


def _call_anthropic_sdk(
    system: str,
    user: str,
    model: str,
    schema: Optional[dict[str, Any]] = None,
    max_tokens: int = 2000,
) -> Optional[dict[str, Any]]:
    """Tier 2: the Anthropic Python SDK billed to ``ANTHROPIC_API_KEY``.

    When ``schema`` is provided, prefers structured outputs (``output_config``
    with that JSON schema) so the result is guaranteed valid; falls back to
    plain text + defensive parse if the installed SDK does not support the
    argument or no schema is given. Returns ``None`` on failure.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    try:
        import anthropic  # type: ignore
    except ImportError:
        return None

    try:
        client = anthropic.Anthropic(api_key=api_key)
    except Exception:
        return None

    messages = [{"role": "user", "content": user}]
    # 4.x models: adaptive thinking only — no temperature / top_p / budget_tokens.
    base_kwargs: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": messages,
    }

    # Preferred when a schema is supplied: structured output via output_config
    # (Sonnet 4.6). Use a cheap, fast effort for these lightweight calls.
    attempts: list[dict[str, Any]]
    if schema is not None:
        structured_kwargs = dict(base_kwargs)
        structured_kwargs["output_config"] = {
            "effort": "low",
            "format": {"type": "json_schema", "schema": schema},
        }
        attempts = [structured_kwargs, base_kwargs]
    else:
        attempts = [base_kwargs]

    response = None
    for kwargs in attempts:
        try:
            response = client.messages.create(**kwargs)
            break
        except TypeError:
            # Installed SDK does not accept output_config — retry plain.
            continue
        except Exception:
            return None
    if response is None:
        return None

    text = _extract_sdk_text(response)
    return extract_json_object(text)


def _extract_sdk_text(response: Any) -> Optional[str]:
    """Extract the concatenated text blocks from an Anthropic SDK response."""
    content = getattr(response, "content", None)
    if content is None and isinstance(response, dict):
        content = response.get("content")
    if not isinstance(content, list):
        return None
    parts: list[str] = []
    for block in content:
        text = getattr(block, "text", None)
        if text is None and isinstance(block, dict):
            block_type = block.get("type")
            if block_type and block_type != "text":
                continue
            text = block.get("text")
        if isinstance(text, str):
            parts.append(text)
    joined = "".join(parts).strip()
    return joined or None


# Provider tag of the most recent generate_json call ("cli" = subscription,
# "api" = API credits, None = no provider served). Lets bridge.py record which
# billing tier actually served a run without threading the tag through every
# caller's return signature. Single-user worker runs topics sequentially, so a
# module global is sufficient (no concurrent generations interleave).
_LAST_PROVIDER: Optional[str] = None


def last_provider() -> Optional[str]:
    """Provider tag of the most recent ``generate_json`` call, or ``None``."""
    return _LAST_PROVIDER


def generate_json(
    system: str,
    user: str,
    schema: Optional[dict[str, Any]] = None,
    max_tokens: int = 2000,
) -> tuple[Optional[dict[str, Any]], Optional[str]]:
    """Run the three-tier provider chain for any JSON-producing prompt.

    Tier 1 (subscription CLI) → Tier 2 (Anthropic API) → ``None``. The CLI tier
    is schema-agnostic (it relies on the prompt demanding strict JSON); the API
    tier uses ``schema`` for structured output when provided. Returns
    ``(obj, provider_tag)`` where ``provider_tag`` is ``"cli"``, ``"api"`` or
    ``None``. Never raises. Also records the tag in ``_LAST_PROVIDER``.
    """
    global _LAST_PROVIDER
    model = synth_model()

    obj = _call_claude_cli(system, user, model)
    if obj is not None:
        _LAST_PROVIDER = "cli"
        return obj, "cli"

    obj = _call_anthropic_sdk(system, user, model, schema=schema, max_tokens=max_tokens)
    if obj is not None:
        _LAST_PROVIDER = "api"
        return obj, "api"

    _LAST_PROVIDER = None
    return None, None


def generate_brief_json(system: str, user: str) -> tuple[Optional[dict[str, Any]], Optional[str]]:
    """Run the three-tier provider chain for a listening brief. Never raises."""
    return generate_json(system, user, schema=_build_json_schema(), max_tokens=2000)
