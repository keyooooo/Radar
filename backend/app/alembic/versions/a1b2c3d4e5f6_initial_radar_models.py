"""initial radar models

Revision ID: a1b2c3d4e5f6
Revises:
Create Date: 2026-06-06
"""

from typing import Any

import sqlalchemy as sa
import sqlmodel
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | None = None
branch_labels: str | Any | None = None
depends_on: str | Any | None = None


def upgrade():
    # Enable uuid-ossp extension for UUID generation
    # UUID generation is handled by uuid.uuid4 in Python; the pgcrypto extension
    # is optional and available for DB-level UUID defaults if needed later.
    pass

    # ========================
    # User table
    # ========================
    op.create_table(
        "user",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
        ),
        sa.Column("email", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("full_name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column("hashed_password", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("city", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column(
            "instruments",
            postgresql.ARRAY(sa.String()),
            nullable=True,
        ),
        sa.Column(
            "genres",
            postgresql.ARRAY(sa.String()),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_index(op.f("ix_user_email"), "user", ["email"], unique=True)

    # ========================
    # Post table
    # ========================
    op.create_table(
        "post",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
        ),
        sa.Column("content", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("city", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column(
            "tags",
            postgresql.ARRAY(sa.String()),
            nullable=True,
        ),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "images",
            postgresql.JSONB(),
            nullable=True,
        ),
        sa.Column("like_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("comment_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_post_user_id",
        "post",
        "user",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # ========================
    # Comment table
    # ========================
    op.create_table(
        "comment",
        sa.Column(
            "id",
            sa.Uuid(),
            primary_key=True,
        ),
        sa.Column("content", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("post_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        sa.Column("reply_to_user_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_comment_post_id",
        "comment",
        "post",
        ["post_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_comment_user_id",
        "comment",
        "user",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_comment_parent_id",
        "comment",
        "comment",
        ["parent_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_comment_reply_to_user_id",
        "comment",
        "user",
        ["reply_to_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade():
    op.drop_table("comment")
    op.drop_table("post")
    op.drop_table("user")
