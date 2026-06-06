"""
Radar Comments API — 2-level flat comment system with content security audit.

Level 1: Root comments (parent_id IS NULL) — shown newest-first.
Level 2: Replies (parent_id points to a root comment) — shown chronological.
"""

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import AsyncCurrentUser, AsyncSessionDep
from app.models import (
    Comment,
    CommentCreate,
    CommentPublic,
    CommentTreeResponse,
    Message,
    Post,
    RootCommentWithReplies,
    User,
)
from app.utils.security import check_content_safety

router = APIRouter(prefix="/comments", tags=["comments"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _comment_to_public(comment: Comment) -> CommentPublic:
    """Convert a Comment ORM object to CommentPublic with nested user info."""
    result = CommentPublic.model_validate(comment)
    if comment.user:
        result.user = comment.user  # type: ignore[assignment]
    if hasattr(comment, "reply_to_user") and comment.reply_to_user:
        result.reply_to_user = comment.reply_to_user  # type: ignore[assignment]
    return result


# ---------------------------------------------------------------------------
# POST /  — Create a comment or reply
# ---------------------------------------------------------------------------
@router.post("/", response_model=CommentPublic, status_code=201)
async def create_comment(
    *,
    session: AsyncSessionDep,
    current_user: AsyncCurrentUser,
    comment_in: CommentCreate,
) -> Any:
    """
    Create a new comment or reply. Requires authentication.

    - Provide `post_id` to link to the target post.
    - Provide `parent_id` to reply to an existing root comment (Level 2).
    - Omit `parent_id` for a root comment (Level 1).
    - `reply_to_user_id` indicates who the comment is directed at (optional).

    Content is audited via `check_content_safety()` before saving.
    """
    # --- Content security audit ---
    if not await check_content_safety(comment_in.content):
        raise HTTPException(
            status_code=400,
            detail="Content contains inappropriate or sensitive language.",
        )

    # --- Validate post exists ---
    result = await session.execute(
        select(Post).where(Post.id == comment_in.post_id)
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # --- Validate parent comment if provided ---
    if comment_in.parent_id:
        parent_result = await session.execute(
            select(Comment).where(Comment.id == comment_in.parent_id)
        )
        parent = parent_result.scalar_one_or_none()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent comment not found")
        # Enforce 2-level limit: a reply can only target a root comment.
        # If the parent already has a parent_id, it's a Level-2 reply itself.
        if parent.parent_id is not None:
            raise HTTPException(
                status_code=400,
                detail="Cannot reply to a sub-reply. Reply to a root comment instead.",
            )

    # --- Create comment ---
    comment = Comment(
        post_id=comment_in.post_id,
        user_id=current_user.id,
        content=comment_in.content,
        parent_id=comment_in.parent_id,
        reply_to_user_id=comment_in.reply_to_user_id,
    )
    session.add(comment)

    # --- Increment post comment_count ---
    await session.execute(
        text("UPDATE post SET comment_count = comment_count + 1 WHERE id = :pid"),
        {"pid": comment_in.post_id},
    )

    await session.commit()
    await session.refresh(comment)

    # Eager-load user for response
    result = await session.execute(
        select(Comment)
        .where(Comment.id == comment.id)
        .options(
            selectinload(Comment.user),
            selectinload(Comment.reply_to_user),
        )
    )
    comment = result.scalar_one()
    return _comment_to_public(comment)


# ---------------------------------------------------------------------------
# GET /post/{post_id}  — Fetch comment tree
# ---------------------------------------------------------------------------
@router.get("/post/{post_id}", response_model=CommentTreeResponse)
async def get_comment_tree(
    *,
    session: AsyncSessionDep,
    post_id: uuid.UUID,
) -> Any:
    """
    Fetch all comments for a post, structured as a 2-level tree.

    - **Root comments** (Level 1, `parent_id IS NULL`): ordered by `created_at DESC`.
    - **Replies** (Level 2): nested under each root, ordered by `created_at ASC`.

    Uses a single query with eager-loaded relationships to avoid the N+1 problem.
    """
    # Validate post exists
    result = await session.execute(
        select(Post).where(Post.id == post_id)
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # Fetch all comments for this post with eager-loaded user info.
    # We load everything in one query and then group in Python.
    stmt = (
        select(Comment)
        .where(Comment.post_id == post_id)
        .options(
            selectinload(Comment.user),
            selectinload(Comment.reply_to_user),
        )
        .order_by(Comment.created_at.asc())  # type: ignore[union-attr]
    )

    result = await session.execute(stmt)
    all_comments: list[Comment] = list(result.scalars().all())

    # Separate roots from replies
    roots: list[Comment] = []
    replies_by_parent: dict[uuid.UUID, list[Comment]] = {}

    for c in all_comments:
        if c.parent_id is None:
            roots.append(c)
        else:
            replies_by_parent.setdefault(c.parent_id, []).append(c)

    # Sort roots newest-first
    roots_sorted = sorted(
        roots,
        key=lambda c: c.created_at or uuid.UUID(int=0),
        reverse=True,
    )

    # Build tree
    tree: list[RootCommentWithReplies] = []
    for root in roots_sorted:
        root_replies = replies_by_parent.get(root.id, [])
        # Replies already in chronological order from the query
        tree.append(
            RootCommentWithReplies(
                root=_comment_to_public(root),
                replies=[_comment_to_public(r) for r in root_replies],
            )
        )

    return CommentTreeResponse(data=tree)


# ---------------------------------------------------------------------------
# DELETE /{id}  — Delete a comment
# ---------------------------------------------------------------------------
@router.delete("/{comment_id}", response_model=Message)
async def delete_comment(
    *,
    session: AsyncSessionDep,
    current_user: AsyncCurrentUser,
    comment_id: uuid.UUID,
) -> Any:
    """
    Delete a comment.

    - Regular users can only delete their own comments.
    - Superusers can delete any comment.
    - Deleting a root comment also cascades to its replies (ON DELETE CASCADE).
    """
    result = await session.execute(
        select(Comment).where(Comment.id == comment_id)
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    # Permission check
    if not current_user.is_superuser and comment.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You can only delete your own comments",
        )

    post_id = comment.post_id

    # Delete the comment (cascade handles child replies)
    await session.delete(comment)

    # Decrement the post's comment_count
    await session.execute(
        text("UPDATE post SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = :pid"),
        {"pid": post_id},
    )

    await session.commit()

    return Message(message="Comment deleted successfully")
