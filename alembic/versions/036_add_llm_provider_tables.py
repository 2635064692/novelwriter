"""Add LLM provider tables and copilot session model_id."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "036"
down_revision: Union[str, None] = "035"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "llm_providers" not in tables:
        op.create_table(
            "llm_providers",
            sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("preset_slug", sa.String(50), nullable=True),
            sa.Column("base_url", sa.String(500), nullable=False),
            sa.Column("api_key", sa.String(500), nullable=False),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index("ix_llm_providers_user_id", "llm_providers", ["user_id"])

    if "llm_provider_models" not in tables:
        op.create_table(
            "llm_provider_models",
            sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
            sa.Column(
                "provider_id",
                sa.Integer(),
                sa.ForeignKey("llm_providers.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("model_name", sa.String(200), nullable=False),
            sa.Column("display_name", sa.String(200), nullable=True),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.UniqueConstraint("provider_id", "model_name", name="uq_llm_provider_models_provider_name"),
        )
        op.create_index("ix_llm_provider_models_provider_id", "llm_provider_models", ["provider_id"])

    copilot_cols = {col["name"] for col in inspector.get_columns("copilot_sessions")} if "copilot_sessions" in tables else set()
    if "model_id" not in copilot_cols:
        with op.batch_alter_table("copilot_sessions") as batch_op:
            batch_op.add_column(
                sa.Column("model_id", sa.Integer(), sa.ForeignKey("llm_provider_models.id", name="fk_copilot_sessions_model_id"), nullable=True),
            )
            batch_op.create_index("ix_copilot_sessions_model_id", ["model_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "copilot_sessions" in tables:
        copilot_cols = {col["name"] for col in inspector.get_columns("copilot_sessions")}
        if "model_id" in copilot_cols:
            op.drop_index("ix_copilot_sessions_model_id", table_name="copilot_sessions")
            op.drop_column("copilot_sessions", "model_id")

    if "llm_provider_models" in tables:
        op.drop_index("ix_llm_provider_models_provider_id", table_name="llm_provider_models")
        op.drop_table("llm_provider_models")

    if "llm_providers" in tables:
        op.drop_index("ix_llm_providers_user_id", table_name="llm_providers")
        op.drop_table("llm_providers")
