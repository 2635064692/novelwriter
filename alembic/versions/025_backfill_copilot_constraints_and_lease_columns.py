"""Backfill copilot constraints and lease columns for legacy 024 databases.

- Adds lease metadata columns expected by the current copilot runtime.
- Replaces the legacy non-unique session lookup index with the canonical unique index.
- Adds the active-run partial unique index after interrupting duplicate active rows.

Deletion notes:
- Removes the old non-unique `ix_copilot_sessions_lookup` path in favor of the
  canonical unique reuse key.

Rollback:
- `alembic downgrade 024`
"""

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.engine import Connection


# revision identifiers, used by Alembic.
revision: str = "025"
down_revision: Union[str, None] = "024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _get_table_columns(bind: Connection, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    return {column["name"] for column in inspector.get_columns(table_name)}


def _get_table_indexes(bind: Connection, table_name: str) -> dict[str, dict]:
    inspector = sa.inspect(bind)
    return {index["name"]: index for index in inspector.get_indexes(table_name)}


def _dedupe_copilot_sessions(bind: Connection) -> None:
    duplicate_keys = bind.execute(sa.text("""
        SELECT novel_id, user_id, signature
        FROM copilot_sessions
        GROUP BY novel_id, user_id, signature
        HAVING COUNT(*) > 1
    """)).mappings().all()

    for key in duplicate_keys:
        session_rows = bind.execute(
            sa.text("""
                SELECT id
                FROM copilot_sessions
                WHERE novel_id = :novel_id
                  AND user_id = :user_id
                  AND signature = :signature
                ORDER BY COALESCE(last_active_at, created_at) DESC, id DESC
            """),
            key,
        ).mappings().all()
        if len(session_rows) <= 1:
            continue

        keeper_id = int(session_rows[0]["id"])
        duplicate_ids = [int(row["id"]) for row in session_rows[1:]]

        for duplicate_id in duplicate_ids:
            bind.execute(
                sa.text("""
                    UPDATE copilot_runs
                    SET copilot_session_id = :keeper_id
                    WHERE copilot_session_id = :duplicate_id
                """),
                {"keeper_id": keeper_id, "duplicate_id": duplicate_id},
            )

        for duplicate_id in duplicate_ids:
            bind.execute(
                sa.text("DELETE FROM copilot_sessions WHERE id = :duplicate_id"),
                {"duplicate_id": duplicate_id},
            )


def _interrupt_duplicate_active_runs(bind: Connection) -> None:
    duplicate_sessions = bind.execute(sa.text("""
        SELECT copilot_session_id
        FROM copilot_runs
        WHERE status IN ('queued', 'running')
        GROUP BY copilot_session_id
        HAVING COUNT(*) > 1
    """)).mappings().all()

    for row in duplicate_sessions:
        session_id = int(row["copilot_session_id"])
        active_rows = bind.execute(
            sa.text("""
                SELECT id
                FROM copilot_runs
                WHERE copilot_session_id = :session_id
                  AND status IN ('queued', 'running')
                ORDER BY
                  CASE WHEN status = 'running' THEN 0 ELSE 1 END,
                  COALESCE(started_at, created_at) DESC,
                  id DESC
            """),
            {"session_id": session_id},
        ).mappings().all()
        if len(active_rows) <= 1:
            continue

        for duplicate in active_rows[1:]:
            bind.execute(
                sa.text("""
                    UPDATE copilot_runs
                    SET status = 'interrupted',
                        error = :message,
                        lease_owner = NULL,
                        lease_expires_at = NULL,
                        finished_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = :run_id
                """),
                {
                    "run_id": int(duplicate["id"]),
                    "message": "Copilot run interrupted during invariant repair",
                },
            )


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "copilot_runs" not in tables or "copilot_sessions" not in tables:
        return

    existing_run_columns = _get_table_columns(bind, "copilot_runs")
    if "lease_owner" not in existing_run_columns:
        op.add_column("copilot_runs", sa.Column("lease_owner", sa.String(length=64), nullable=True))
    if "lease_expires_at" not in existing_run_columns:
        op.add_column("copilot_runs", sa.Column("lease_expires_at", sa.DateTime(), nullable=True))
    if "started_at" not in existing_run_columns:
        op.add_column("copilot_runs", sa.Column("started_at", sa.DateTime(), nullable=True))
    if "finished_at" not in existing_run_columns:
        op.add_column("copilot_runs", sa.Column("finished_at", sa.DateTime(), nullable=True))

    _dedupe_copilot_sessions(bind)

    session_indexes = _get_table_indexes(bind, "copilot_sessions")
    if "ix_copilot_sessions_lookup" in session_indexes and "uq_copilot_sessions_lookup" not in session_indexes:
        op.drop_index("ix_copilot_sessions_lookup", table_name="copilot_sessions")
        session_indexes = _get_table_indexes(bind, "copilot_sessions")
    if "uq_copilot_sessions_lookup" not in session_indexes:
        op.create_index(
            "uq_copilot_sessions_lookup",
            "copilot_sessions",
            ["novel_id", "user_id", "signature"],
            unique=True,
        )

    _interrupt_duplicate_active_runs(bind)

    run_indexes = _get_table_indexes(bind, "copilot_runs")
    if "ix_copilot_runs_status_lease" not in run_indexes:
        op.create_index(
            "ix_copilot_runs_status_lease",
            "copilot_runs",
            ["status", "lease_expires_at"],
            unique=False,
        )
    if "uq_copilot_runs_active_session" not in run_indexes:
        bind = op.get_bind()
        if bind.dialect.name == "mysql":
            op.create_index(
                "ix_copilot_runs_session_active",
                "copilot_runs",
                ["copilot_session_id", "status"],
                unique=False,
            )
        else:
            op.create_index(
                "uq_copilot_runs_active_session",
                "copilot_runs",
                ["copilot_session_id"],
                unique=True,
                sqlite_where=sa.text("status IN ('queued', 'running')"),
                postgresql_where=sa.text("status IN ('queued', 'running')"),
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "copilot_runs" not in tables or "copilot_sessions" not in tables:
        return

    run_indexes = _get_table_indexes(bind, "copilot_runs")
    if "uq_copilot_runs_active_session" in run_indexes:
        op.drop_index("uq_copilot_runs_active_session", table_name="copilot_runs")
    run_indexes = _get_table_indexes(bind, "copilot_runs")
    if "ix_copilot_runs_status_lease" in run_indexes:
        op.drop_index("ix_copilot_runs_status_lease", table_name="copilot_runs")

    session_indexes = _get_table_indexes(bind, "copilot_sessions")
    if "uq_copilot_sessions_lookup" in session_indexes:
        op.drop_index("uq_copilot_sessions_lookup", table_name="copilot_sessions")
    session_indexes = _get_table_indexes(bind, "copilot_sessions")
    if "ix_copilot_sessions_lookup" not in session_indexes:
        op.create_index(
            "ix_copilot_sessions_lookup",
            "copilot_sessions",
            ["novel_id", "user_id", "signature"],
            unique=False,
        )

    if context.get_context().dialect.name == "sqlite":
        with op.batch_alter_table("copilot_runs") as batch_op:
            run_columns = _get_table_columns(bind, "copilot_runs")
            if "finished_at" in run_columns:
                batch_op.drop_column("finished_at")
            run_columns = _get_table_columns(bind, "copilot_runs")
            if "started_at" in run_columns:
                batch_op.drop_column("started_at")
            run_columns = _get_table_columns(bind, "copilot_runs")
            if "lease_expires_at" in run_columns:
                batch_op.drop_column("lease_expires_at")
            run_columns = _get_table_columns(bind, "copilot_runs")
            if "lease_owner" in run_columns:
                batch_op.drop_column("lease_owner")
    else:
        run_columns = _get_table_columns(bind, "copilot_runs")
        if "finished_at" in run_columns:
            op.drop_column("copilot_runs", "finished_at")
        run_columns = _get_table_columns(bind, "copilot_runs")
        if "started_at" in run_columns:
            op.drop_column("copilot_runs", "started_at")
        run_columns = _get_table_columns(bind, "copilot_runs")
        if "lease_expires_at" in run_columns:
            op.drop_column("copilot_runs", "lease_expires_at")
        run_columns = _get_table_columns(bind, "copilot_runs")
        if "lease_owner" in run_columns:
            op.drop_column("copilot_runs", "lease_owner")
