"""Add copilot session/run tables

- Persists reusable copilot sessions keyed by research signature.
- Persists asynchronous copilot runs, evidence, suggestions, and resumable workspace state.

Deletion notes:
- Removes the need to keep copilot session/run state only in transient frontend memory.

Rollback:
- `alembic downgrade 023`
"""

from typing import Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine import Connection


# revision identifiers, used by Alembic.
revision: str = "024"
down_revision: Union[str, None] = "023"
branch_labels = None
depends_on = None


def _dedupe_copilot_sessions(bind: Connection, tables: set[str]) -> None:
    if "copilot_sessions" not in tables:
        return

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

        if "copilot_runs" in tables:
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


def _interrupt_duplicate_active_runs(bind: Connection, tables: set[str]) -> None:
    if "copilot_runs" not in tables:
        return

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

    if "copilot_sessions" not in tables:
        op.create_table(
            "copilot_sessions",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("session_id", sa.String(length=36), nullable=False),
            sa.Column("novel_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("mode", sa.String(length=50), nullable=False),
            sa.Column("scope", sa.String(length=50), nullable=False),
            sa.Column("context_json", sa.JSON(), nullable=True),
            sa.Column("interaction_locale", sa.String(length=10), nullable=False, server_default="zh"),
            sa.Column("signature", sa.String(length=255), nullable=False),
            sa.Column("display_title", sa.String(length=255), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
            sa.Column("last_active_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
            sa.ForeignKeyConstraint(["novel_id"], ["novels.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("session_id"),
        )
        inspector = sa.inspect(bind)
        tables = set(inspector.get_table_names())

    _dedupe_copilot_sessions(bind, tables)
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    session_indexes = (
        {index["name"] for index in inspector.get_indexes("copilot_sessions")}
        if "copilot_sessions" in tables
        else set()
    )
    if "ix_copilot_sessions_session_id" not in session_indexes:
        op.create_index("ix_copilot_sessions_session_id", "copilot_sessions", ["session_id"], unique=False)
    if "uq_copilot_sessions_lookup" not in session_indexes:
        op.create_index("uq_copilot_sessions_lookup", "copilot_sessions", ["novel_id", "user_id", "signature"], unique=True)

    if "copilot_runs" not in tables:
        op.create_table(
            "copilot_runs",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("run_id", sa.String(length=36), nullable=False),
            sa.Column("copilot_session_id", sa.Integer(), nullable=False),
            sa.Column("novel_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="queued"),
            sa.Column("prompt", sa.Text(), nullable=False),
            sa.Column("answer", sa.Text(), nullable=True),
            sa.Column("trace_json", sa.JSON(), nullable=True),
            sa.Column("evidence_json", sa.JSON(), nullable=True),
            sa.Column("suggestions_json", sa.JSON(), nullable=True),
            sa.Column("workspace_json", sa.JSON(), nullable=True),
            sa.Column("error", sa.Text(), nullable=True),
            sa.Column("lease_owner", sa.String(length=64), nullable=True),
            sa.Column("lease_expires_at", sa.DateTime(), nullable=True),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
            sa.ForeignKeyConstraint(["copilot_session_id"], ["copilot_sessions.id"]),
            sa.ForeignKeyConstraint(["novel_id"], ["novels.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("run_id"),
        )
        inspector = sa.inspect(bind)
        tables = set(inspector.get_table_names())

    _interrupt_duplicate_active_runs(bind, tables)
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    run_indexes = (
        {index["name"] for index in inspector.get_indexes("copilot_runs")}
        if "copilot_runs" in tables
        else set()
    )
    if "ix_copilot_runs_run_id" not in run_indexes:
        op.create_index("ix_copilot_runs_run_id", "copilot_runs", ["run_id"], unique=False)
    if "ix_copilot_runs_session_status" not in run_indexes:
        op.create_index("ix_copilot_runs_session_status", "copilot_runs", ["copilot_session_id", "status"], unique=False)
    if "ix_copilot_runs_user_status" not in run_indexes:
        op.create_index("ix_copilot_runs_user_status", "copilot_runs", ["user_id", "status"], unique=False)
    if "ix_copilot_runs_status_lease" not in run_indexes:
        op.create_index("ix_copilot_runs_status_lease", "copilot_runs", ["status", "lease_expires_at"], unique=False)
    if "uq_copilot_runs_active_session" not in run_indexes:
        op.create_index(
            "uq_copilot_runs_active_session",
            "copilot_runs",
            ["copilot_session_id"],
            unique=True,
            sqlite_where=sa.text("status IN ('queued', 'running')"),
            postgresql_where=sa.text("status IN ('queued', 'running')"),
            mysql_where=sa.text("status IN ('queued', 'running')"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "copilot_runs" in tables:
        run_indexes = {index["name"] for index in inspector.get_indexes("copilot_runs")}
        if "ix_copilot_runs_user_status" in run_indexes:
            op.drop_index("ix_copilot_runs_user_status", table_name="copilot_runs")
        if "ix_copilot_runs_session_status" in run_indexes:
            op.drop_index("ix_copilot_runs_session_status", table_name="copilot_runs")
        if "ix_copilot_runs_run_id" in run_indexes:
            op.drop_index("ix_copilot_runs_run_id", table_name="copilot_runs")
        if "ix_copilot_runs_status_lease" in run_indexes:
            op.drop_index("ix_copilot_runs_status_lease", table_name="copilot_runs")
        if "uq_copilot_runs_active_session" in run_indexes:
            op.drop_index("uq_copilot_runs_active_session", table_name="copilot_runs")
        op.drop_table("copilot_runs")

    if "copilot_sessions" in tables:
        session_indexes = {index["name"] for index in inspector.get_indexes("copilot_sessions")}
        if "uq_copilot_sessions_lookup" in session_indexes:
            op.drop_index("uq_copilot_sessions_lookup", table_name="copilot_sessions")
        if "ix_copilot_sessions_session_id" in session_indexes:
            op.drop_index("ix_copilot_sessions_session_id", table_name="copilot_sessions")
        op.drop_table("copilot_sessions")
