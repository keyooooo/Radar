"""add category to post

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-06
"""

from typing import Any

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Any | None = None
depends_on: str | Any | None = None


def upgrade():
    op.add_column(
        "post",
        sa.Column(
            "category",
            sqlmodel.sql.sqltypes.AutoString(length=20),
            nullable=True,
        ),
    )


def downgrade():
    op.drop_column("post", "category")
