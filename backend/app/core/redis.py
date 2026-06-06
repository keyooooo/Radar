"""
Redis connection manager and like-counter utilities for Radar.

Provides:
- `get_redis()`: dependency that yields a Redis client connected using app settings.
- `sync_likes_to_db()`: background task that flushes Redis like-count deltas into
  the PostgreSQL `post` table.
"""

import logging

import redis.asyncio as aioredis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

logger = logging.getLogger(__name__)

# Module-level Redis connection pool — created once and reused.
_redis_pool: aioredis.ConnectionPool | None = None


def _get_pool() -> aioredis.ConnectionPool:
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = aioredis.ConnectionPool.from_url(
            settings.REDIS_URL,
            max_connections=20,
            decode_responses=True,
        )
    return _redis_pool


async def get_redis() -> aioredis.Redis:  # type: ignore
    """FastAPI dependency: yields a Redis client for the request scope."""
    client = aioredis.Redis(connection_pool=_get_pool())
    try:
        yield client
    finally:
        await client.aclose()  # type: ignore[union-attr]


# ---------------------------------------------------------------------------
# Like-count cache keys
# ---------------------------------------------------------------------------

LIKE_SET_KEY = "post:{post_id}:likes"       # Redis Set  — tracks which users liked
LIKE_COUNT_KEY = "post:{post_id}:like_count"  # Redis String — cached count delta


async def sync_likes_to_db(db: AsyncSession) -> dict[str, int]:
    """
    Scan Redis for every `post:*:like_count` key, persist the value into the
    corresponding PostgreSQL row, then delete the Redis key *and* the
    associated `post:*:likes` set atomically.

    Returns a dict mapping post_id → synced_like_count.
    """
    redis_client = aioredis.Redis(connection_pool=_get_pool())
    synced: dict[str, int] = {}

    try:
        # Find all like-count keys
        cursor = 0
        while True:
            cursor, keys = await redis_client.scan(
                cursor, match="post:*:like_count", count=100
            )
            for key in keys:
                # key format: "post:{post_id}:like_count"
                post_id = key.split(":")[1]
                count_str = await redis_client.get(key)
                if count_str is None:
                    continue
                delta = int(count_str)

                # Persist the delta to PostgreSQL
                await db.execute(
                    text(
                        "UPDATE post SET like_count = like_count + :delta WHERE id = :pid"
                    ),
                    {"delta": delta, "pid": post_id},
                )

                # Reset the count delta to 0 but KEEP the SET (it tracks who liked).
                # The SET prevents double-counting and enables unlike.
                pipe = redis_client.pipeline()
                pipe.set(key, 0)
                # Refresh TTL so active posts stay cached
                pipe.expire(key, 604800)
                pipe.expire(LIKE_SET_KEY.format(post_id=post_id), 604800)
                await pipe.execute()

                synced[post_id] = delta
                logger.info(
                    "Synced likes for post %s: +%d", post_id, delta
                )

            if cursor == 0:
                break

        await db.commit()
    finally:
        await redis_client.aclose()  # type: ignore[union-attr]

    return synced
