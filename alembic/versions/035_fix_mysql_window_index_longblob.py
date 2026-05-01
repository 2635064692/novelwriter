"""Fix novels.window_index BLOB -> LONGBLOB for MySQL.

MySQL BLOB max is 64 KB; window_index msgpack payloads can exceed 9 MB.
SQLite (BYTEA-like) and PostgreSQL (BYTEA) are unaffected.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from sqlalchemy.dialects.mysql import LONGBLOB


revision: str = "035"
down_revision: Union[str, None] = "034"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "mysql":
        return

    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "novels" not in tables:
        return

    columns = {col["name"] for col in inspector.get_columns("novels")}
    if "window_index" not in columns:
        return

    op.alter_column(
        "novels",
        "window_index",
        existing_type=sa.LargeBinary(),
        type_=LONGBLOB(),
        existing_nullable=True,
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "mysql":
        return

    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "novels" not in tables:
        return

    columns = {col["name"] for col in inspector.get_columns("novels")}
    if "window_index" not in columns:
        return

    op.alter_column(
        "novels",
        "window_index",
        existing_type=LONGBLOB(),
        type_=sa.LargeBinary(),
        existing_nullable=True,
    )
