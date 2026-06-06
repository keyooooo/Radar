"""
Content security audit utility for Radar (乐搭).

Integrates with WeChat Mini-Program `msgSecCheck` API. When WeChat credentials
are not configured, falls back to a local regex-based filter so local development
isn't blocked.
"""

import logging
import re

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Naughty-word patterns (MVP fallback when WeChat API is unavailable).
# In production, WeChat's msgSecCheck handles actual content moderation.
# ---------------------------------------------------------------------------
_OFFENSIVE_PATTERNS: list[re.Pattern] = [
    re.compile(r"(?i)\b(spam|scam|fraud)\b"),
    re.compile(r"https?://\S{0,5}(?:malware|phish|hack)\S*", re.IGNORECASE),
    # Add additional patterns as needed.
]

# WeChat msgSecCheck API endpoint
_WECHAT_MSG_SEC_CHECK_URL = (
    "https://api.weixin.qq.com/wxa/msg_sec_check?access_token={access_token}"
)


async def _get_wechat_access_token() -> str | None:
    """Obtain a WeChat access_token using client credentials.

    Returns None if credentials are missing or the request fails.
    """
    app_id = settings.WECHAT_APP_ID
    app_secret = settings.WECHAT_APP_SECRET

    if not app_id or not app_secret:
        return None

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.weixin.qq.com/cgi-bin/token",
                params={
                    "grant_type": "client_credential",
                    "appid": app_id,
                    "secret": app_secret,
                },
            )
            data = resp.json()
            if "access_token" in data:
                return data["access_token"]
            logger.warning("WeChat token error: %s", data)
            return None
    except Exception as exc:
        logger.warning("WeChat token request failed: %s", exc)
        return None


async def _wechat_msg_sec_check(text: str, openid: str | None) -> bool:
    """Call WeChat msgSecCheck. Returns True if content is *safe*, False if risky."""
    access_token = await _get_wechat_access_token()
    if not access_token:
        raise RuntimeError("Cannot obtain WeChat access_token")

    payload: dict = {"content": text}
    if openid:
        payload["openid"] = openid

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                _WECHAT_MSG_SEC_CHECK_URL.format(access_token=access_token),
                json=payload,
            )
            data = resp.json()
            # errcode 0  → passed; 87014 → risky content
            if data.get("errcode") == 0:
                return True
            if data.get("errcode") == 87014:
                logger.warning("msgSecCheck flagged content: %s", text[:80])
                return False
            logger.warning("msgSecCheck unexpected response: %s", data)
            return True  # Be lenient on unknown errors for MVP
    except Exception as exc:
        logger.warning("msgSecCheck request failed: %s", exc)
        return True  # Fail open on network errors for MVP


def _local_regex_check(text: str) -> bool:
    """Run local regex patterns. Returns True if content passes all checks."""
    for pattern in _OFFENSIVE_PATTERNS:
        if pattern.search(text):
            logger.warning("Local regex flagged content: pattern=%s", pattern.pattern)
            return False
    return True


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def check_content_safety(text: str, openid: str | None = None) -> bool:
    """Audit text content for safety.

    Priority:
    1. WeChat `msgSecCheck` API (if WECHAT_APP_ID / WECHAT_APP_SECRET are set).
    2. Local regex fallback (MVP / local development).

    Returns True if content is **safe**, False if it is **risky**.

    Callers should raise an `HTTPException(400, ...)` when False is returned.
    """
    # Normalise: strip whitespace, enforce minimum length for check
    sanitized = (text or "").strip()
    if not sanitized:
        return True  # empty content is safe

    use_wechat = bool(settings.WECHAT_APP_ID and settings.WECHAT_APP_SECRET)

    if use_wechat:
        logger.info("Using WeChat msgSecCheck for content audit")
        try:
            result = await _wechat_msg_sec_check(sanitized, openid)
            return result
        except RuntimeError:
            logger.warning(
                "WeChat token unavailable — falling back to local regex check"
            )

    # Fallback: local regex
    logger.info("Using local regex for content audit (mock mode)")
    return _local_regex_check(sanitized)
