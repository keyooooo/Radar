"""
Radar Posts API — treehole post creation, cursor-paginated feed/search,
and Redis-backed like toggle.
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import AsyncCurrentUser, AsyncSessionDep
from app.core.redis import (
    LIKE_COUNT_KEY,
    LIKE_SET_KEY,
    sync_likes_to_db,
)
from app.models import (
    Message,
    Post,
    PostCreate,
    PostPublic,
    PostsFeedResponse,
)
from app.utils.security import check_content_safety

router = APIRouter(prefix="/posts", tags=["posts"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _post_to_public(post: Post, like_count_override: int | None = None) -> PostPublic:
    """Convert a Post ORM object to PostPublic, optionally overriding like_count."""
    result = PostPublic.model_validate(post)
    if like_count_override is not None:
        result.like_count = like_count_override
    return result


def _parse_cursor(cursor: str | None) -> datetime | None:
    """Parse an ISO-format cursor string into a timezone-aware datetime."""
    if not cursor:
        return None
    try:
        dt = datetime.fromisoformat(cursor)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=400,
            detail="Invalid cursor format. Use ISO 8601, e.g. 2026-06-01T12:00:00+00:00",
        )


def _parse_tags(tags_param: str | None) -> list[str]:
    """Parse comma-separated tags query param into a list."""
    if not tags_param:
        return []
    return [t.strip() for t in tags_param.split(",") if t.strip()]


async def _resolve_redis_client():
    """Get a Redis client from the shared pool (for inline use, not FastAPI DI)."""
    from app.core.redis import _get_pool

    import redis.asyncio as aioredis

    return aioredis.Redis(connection_pool=_get_pool())


# ---------------------------------------------------------------------------
# POST /  — Create a new treehole post
# ---------------------------------------------------------------------------
@router.post("/", response_model=PostPublic, status_code=201)
async def create_post(
    *,
    session: AsyncSessionDep,
    current_user: AsyncCurrentUser,
    post_in: PostCreate,
) -> Any:
    """
    Create a new treehole post. Requires authentication.

    The author's `user_id` is taken from the JWT token.
    Content is audited via `check_content_safety()` before saving.
    """
    # --- Content security audit ---
    if not await check_content_safety(post_in.content):
        raise HTTPException(
            status_code=400,
            detail="Content contains inappropriate or sensitive language.",
        )

    post = Post(
        user_id=current_user.id,
        content=post_in.content,
        category=post_in.category,
        images=post_in.images or [],
        city=post_in.city,
        tags=post_in.tags or [],
    )
    session.add(post)
    await session.commit()
    await session.refresh(post)

    # Eager-load the owner for the response
    result = await session.execute(
        select(Post).where(Post.id == post.id).options(selectinload(Post.user))
    )
    post = result.scalar_one()
    return post


# ---------------------------------------------------------------------------
# GET /{id}  — Retrieve a single post by ID
# ---------------------------------------------------------------------------
@router.get("/{post_id}", response_model=PostPublic)
async def get_post(
    *,
    session: AsyncSessionDep,
    post_id: uuid.UUID,
) -> Any:
    """Fetch a single post by ID, with author info eager-loaded."""
    result = await session.execute(
        select(Post)
        .where(Post.id == post_id)
        .options(selectinload(Post.user))
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


# ---------------------------------------------------------------------------
# GET /  — Cursor-paginated feed with search filters
# ---------------------------------------------------------------------------
@router.get("/", response_model=PostsFeedResponse)
async def search_posts(
    *,
    session: AsyncSessionDep,
    cursor: str | None = Query(
        None,
        description="ISO 8601 cursor (created_at of the last item from previous page). "
        "Omit for first page.",
    ),
    size: int = Query(10, ge=1, le=50, description="Number of items per page"),
    city: str | None = Query(None, description="Exact city filter"),
    tags: str | None = Query(
        None,
        description="Comma-separated tags (e.g. '后摇,鼓手'). "
        "Returns posts that contain ALL listed tags.",
    ),
    keyword: str | None = Query(None, description="Fuzzy search on post content"),
    category: str | None = Query(
        None, description="Filter by category: 'band' or 'show'"
    ),
) -> Any:
    """
    Browse the treehole feed with cursor-based pagination and optional filters.

    - **cursor**: ISO timestamp of the last post from the previous page.
    - **size**: batch size (1–50, default 10).
    - **city**: exact match on `Post.city`.
    - **tags**: comma-separated → PostgreSQL array containment (`@>`).
    - **keyword**: case-insensitive ILIKE on `Post.content`.

    Returns a list of posts + `next_cursor` (null if no more pages).
    """
    cursor_dt = _parse_cursor(cursor)
    tag_list = _parse_tags(tags)

    # Base query — always order by created_at DESC, eager-load user
    stmt = (
        select(Post)
        .options(selectinload(Post.user))
        .order_by(Post.created_at.desc())  # type: ignore[union-attr]
    )

    # Cursor: where created_at < cursor
    if cursor_dt:
        stmt = stmt.where(Post.created_at < cursor_dt)  # type: ignore[union-attr]

    # Optional filters
    if category:
        stmt = stmt.where(Post.category == category)
    if city:
        stmt = stmt.where(Post.city == city)
    if tag_list:
        # PostgreSQL array containment: tags @> ARRAY['tag1','tag2']
        # Uses the dialect-specific @> operator because generic ARRAY.contains()
        # is not implemented in SQLAlchemy.
        stmt = stmt.where(Post.tags.op("@>")(tag_list))  # type: ignore[union-attr]
    if keyword:
        stmt = stmt.where(Post.content.ilike(f"%{keyword}%"))  # type: ignore[union-attr]

    # Fetch one extra to determine if there's a next page
    stmt = stmt.limit(size + 1)

    result = await session.execute(stmt)
    rows = result.scalars().all()

    has_more = len(rows) > size
    posts: list[Post] = rows[:size]  # type: ignore[assignment]

    # --- Merge Redis like_count deltas ---
    like_deltas: dict[str, int] = {}
    try:
        redis_client = await _resolve_redis_client()
        for p in posts:
            redis_val = await redis_client.get(LIKE_COUNT_KEY.format(post_id=str(p.id)))
            if redis_val is not None:
                like_deltas[str(p.id)] = int(redis_val)
        await redis_client.aclose()  # type: ignore[union-attr]
    except Exception:
        pass

    data = [
        _post_to_public(
            p,
            like_count_override=(
                p.like_count + like_deltas.get(str(p.id), 0)
                if str(p.id) in like_deltas
                else None
            ),
        )
        for p in posts
    ]

    next_cursor: str | None = None
    if has_more and posts:
        last_created = posts[-1].created_at
        if last_created:
            next_cursor = last_created.isoformat()

    return PostsFeedResponse(data=data, next_cursor=next_cursor)


# ---------------------------------------------------------------------------
# POST /{id}/like  — Toggle like (Redis-backed)
# ---------------------------------------------------------------------------
@router.post("/{post_id}/like", response_model=Message)
async def toggle_like(
    *,
    session: AsyncSessionDep,
    current_user: AsyncCurrentUser,
    post_id: uuid.UUID,
    background_tasks: BackgroundTasks,
) -> Any:
    """
    Toggle like on a post (Redis-backed).

    - If the user hasn't liked the post → **like** (SADD + INCR).
    - If the user already liked → **unlike** (SREM + DECR).

    A background task periodically flushes Redis counters to PostgreSQL.
    """
    # Validate post exists
    result = await session.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    user_id_str = str(current_user.id)
    post_id_str = str(post_id)

    set_key = LIKE_SET_KEY.format(post_id=post_id_str)
    count_key = LIKE_COUNT_KEY.format(post_id=post_id_str)

    try:
        redis_client = await _resolve_redis_client()

        # SADD returns 1 if added (first-time like), 0 if already exists
        added = await redis_client.sadd(set_key, user_id_str)

        if added:
            await redis_client.incr(count_key)
            # 7-day TTL prevents stale keys if sync never runs
            await redis_client.expire(set_key, 604800)
            await redis_client.expire(count_key, 604800)
            action = "liked"
        else:
            # Already liked → unlike
            await redis_client.srem(set_key, user_id_str)
            current_count = await redis_client.get(count_key)
            if current_count and int(current_count) > 0:
                await redis_client.decr(count_key)
            action = "unliked"

        await redis_client.aclose()  # type: ignore[union-attr]

    except Exception:
        raise HTTPException(
            status_code=503, detail="Like service temporarily unavailable"
        )

    # Fire-and-forget: flush Redis counters to PostgreSQL
    background_tasks.add_task(_background_sync_likes)

    return Message(message=f"Post {action} successfully")


async def _background_sync_likes() -> None:
    """Background task: create a fresh session and flush likes to PostgreSQL."""
    from app.core.db import async_engine

    try:
        async with AsyncSession(async_engine) as db:
            await sync_likes_to_db(db)
    except Exception:
        pass
