"""
Response Generator — calls Claude API with retrieved context to write a
grounded, safe support reply.
"""

from __future__ import annotations

import os

import anthropic

MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 8192

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        base_url = os.environ.get("AI_INTEGRATIONS_ANTHROPIC_BASE_URL")
        api_key = os.environ.get("AI_INTEGRATIONS_ANTHROPIC_API_KEY", "dummy")
        _client = anthropic.Anthropic(api_key=api_key, base_url=base_url)
    return _client


SYSTEM_PROMPT = """You are a professional customer support agent for a multi-domain platform.
Your job is to answer support tickets accurately and helpfully.

RULES:
1. Use ONLY the provided support documentation context to answer. Do not invent policies, features, or procedures that are not mentioned in the context.
2. If the context does not contain enough information to fully answer the ticket, say so clearly and direct the user to the appropriate support channel.
3. Keep responses concise, professional, and empathetic.
4. Always acknowledge the user's concern before providing the answer.
5. Do not speculate about causes of account issues, billing amounts, or security incidents.
6. If you are unsure or the topic falls outside the documentation, recommend contacting the relevant support team directly.
7. Never make up phone numbers, email addresses, or specific URLs unless they appear in the context.
"""


def generate_response(
    ticket: str,
    domain: str,
    context_chunks: list[str],
) -> str:
    """
    Generate a support response using Claude with retrieved context.

    Args:
        ticket: The original support ticket text.
        domain: Detected domain (for prompt framing).
        context_chunks: Relevant corpus chunks retrieved for this ticket.

    Returns:
        The generated support response as a string.
    """
    client = _get_client()

    domain_label = domain.title() if domain != "unknown" else "General"
    context_text = (
        "\n\n---\n\n".join(context_chunks)
        if context_chunks
        else "No specific documentation was found for this topic."
    )

    user_message = f"""DOMAIN: {domain_label}

SUPPORT DOCUMENTATION CONTEXT:
{context_text}

---

CUSTOMER SUPPORT TICKET:
{ticket}

---

Please write a professional support response to this ticket using ONLY the information in the documentation context above. If the context is insufficient, say so and direct the customer appropriately."""

    message = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    block = message.content[0]
    return block.text if block.type == "text" else "[No response generated]"
