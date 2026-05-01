"""Fix uq_copilot_runs_active_session for MySQL.

MySQL does not support partial/filtered unique indexes. The index created
by migration 025 (with mysql_where) was silently treated as a full unique
constraint on copilot_session_id, preventing new runs from being created
after any previous run completed.

This migration drops the incorrect full-unique index on MySQL and replaces
it with a non-unique index for query performance. SQLite and PostgreSQL are
unaffected — their partial unique indexes are correct.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "034"
down_revision: Union[str, None] = "033"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect != "mysql":
        return

    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "copilot_runs" not in tables:
        return

    indexes = {idx["name"] for idx in inspector.get_indexes("copilot_runs")}

    if "uq_copilot_runs_active_session" in indexes:
        op.drop_index("uq_copilot_runs_active_session", table_name="copilot_runs")

    if "ix_copilot_runs_session_active" not in indexes:
        op.create_index(
            "ix_copilot_runs_session_active",
            "copilot_runs",
            ["copilot_session_id", "status"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect != "mysql":
        return

    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "copilot_runs" not in tables:
        return

    indexes = {idx["name"] for idx in inspector.get_indexes("copilot_runs")}

    if "ix_copilot_runs_session_active" in indexes:
        op.drop_index("ix_copilot_runs_session_active", table_name="copilot_runs")

    # Re-create the (broken) full unique index to match pre-migration state.
    op.create_index(
        "uq_copilot_runs_active_session",
        "copilot_runs",
        ["copilot_session_id"],
        unique=True,
    )
