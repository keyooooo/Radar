import uuid
from datetime import datetime, timezone

from pydantic import EmailStr
from sqlalchemy import ARRAY, Column, DateTime, String as saString
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel


def get_datetime_utc() -> datetime:
    return datetime.now(timezone.utc)


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on update, all are optional
class UserUpdate(UserBase):
    email: EmailStr | None = Field(default=None, max_length=255)  # type: ignore[assignment]
    password: str | None = Field(default=None, min_length=8, max_length=128)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


# Database model, database table inferred from class name
class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    city: str | None = Field(default=None, max_length=255)
    instruments: list[str] | None = Field(
        default=None, sa_column=Column(ARRAY(saString()))
    )
    genres: list[str] | None = Field(
        default=None, sa_column=Column(ARRAY(saString()))
    )
    posts: list["Post"] = Relationship(back_populates="user", cascade_delete=True)
    comments: list["Comment"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"foreign_keys": "Comment.user_id"},
        cascade_delete=True,
    )


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID
    created_at: datetime | None = None
    city: str | None = None
    instruments: list[str] | None = None
    genres: list[str] | None = None


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# ========================
# Post Models
# ========================


class PostBase(SQLModel):
    content: str = Field(min_length=1)
    category: str | None = Field(default=None, max_length=20)  # "band" or "show"
    city: str | None = Field(default=None, max_length=255)
    tags: list[str] | None = Field(
        default=None, sa_column=Column(ARRAY(saString()))
    )


class PostCreate(PostBase):
    images: list[str] | None = None


class PostUpdate(SQLModel):
    content: str | None = Field(default=None, min_length=1)
    category: str | None = Field(default=None, max_length=20)
    city: str | None = Field(default=None, max_length=255)
    tags: list[str] | None = Field(
        default=None, sa_column=Column(ARRAY(saString()))
    )
    images: list[str] | None = None


class Post(PostBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    category: str | None = Field(default=None, max_length=20)
    images: list[str] | None = Field(default=None, sa_column=Column(JSONB))
    like_count: int = Field(default=0)
    comment_count: int = Field(default=0)
    view_count: int = Field(default=0)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    user: "User" = Relationship(back_populates="posts")
    comments: list["Comment"] = Relationship(
        back_populates="post", cascade_delete=True
    )


class PostPublic(PostBase):
    id: uuid.UUID
    user_id: uuid.UUID
    images: list[str] | None = None
    like_count: int
    comment_count: int
    view_count: int
    created_at: datetime | None = None
    user: "UserPublic | None" = None


class PostsPublic(SQLModel):
    data: list[PostPublic]
    count: int


class PostsFeedResponse(SQLModel):
    """Cursor-paginated feed response."""
    data: list[PostPublic]
    next_cursor: str | None = None
    message: str = "ok"


# ========================
# Comment Models
# ========================


class CommentBase(SQLModel):
    content: str = Field(min_length=1)


class CommentCreate(CommentBase):
    post_id: uuid.UUID
    reply_to_user_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None


class CommentUpdate(SQLModel):
    content: str | None = Field(default=None, min_length=1)


class Comment(CommentBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    post_id: uuid.UUID = Field(
        foreign_key="post.id", nullable=False, ondelete="CASCADE"
    )
    user_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    parent_id: uuid.UUID | None = Field(
        default=None, foreign_key="comment.id", ondelete="CASCADE"
    )
    reply_to_user_id: uuid.UUID | None = Field(
        default=None, foreign_key="user.id", ondelete="SET NULL"
    )
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    post: "Post" = Relationship(back_populates="comments")
    user: "User" = Relationship(
        back_populates="comments",
        sa_relationship_kwargs={"foreign_keys": "Comment.user_id"},
    )
    parent: "Comment" = Relationship(
        back_populates="replies",
        sa_relationship_kwargs={"remote_side": "Comment.id"},
    )
    replies: list["Comment"] = Relationship(
        back_populates="parent", cascade_delete=True
    )
    reply_to_user: "User" = Relationship(
        sa_relationship_kwargs={"foreign_keys": "Comment.reply_to_user_id"},
    )


class CommentPublic(CommentBase):
    id: uuid.UUID
    post_id: uuid.UUID
    user_id: uuid.UUID
    parent_id: uuid.UUID | None = None
    reply_to_user_id: uuid.UUID | None = None
    created_at: datetime | None = None
    user: "UserPublic | None" = None
    reply_to_user: "UserPublic | None" = None


class CommentsPublic(SQLModel):
    data: list[CommentPublic]
    count: int


class RootCommentWithReplies(SQLModel):
    """A Level-1 comment with its Level-2 replies nested underneath."""
    root: CommentPublic
    replies: list[CommentPublic] = []


class CommentTreeResponse(SQLModel):
    """Response for GET /comments/post/{post_id}."""
    data: list[RootCommentWithReplies]
    message: str = "ok"


# ========================
# Generic / Auth Models
# ========================


# Generic message
class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(SQLModel):
    sub: str | None = None
