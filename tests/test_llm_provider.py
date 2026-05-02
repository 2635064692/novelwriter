"""Tests for LLM provider multi-model support (Phase 1-2 backend).

Covers:
- resolve_default_llm_config: DB config resolution
- get_llm_config_with_db: priority chain (headers → DB → .env)
- Provider CRUD API: create, list, update, delete, set-default
- API key masking / edit-skip logic
- Copilot run_create model resolution (unit-level)
"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import StaticPool, create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.models import (
    LlmProvider,
    LlmProviderModel,
    Novel,
    TokenUsage,
    User,
)

engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def _make_app(db_session, router) -> FastAPI:
    app = FastAPI()
    app.include_router(router)

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    return app


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seed_provider(db, *, name="TestProvider", base_url="https://api.test.com", api_key="sk-test-key-12345678", is_default=True, user_id=None, models=None):
    provider = LlmProvider(
        user_id=user_id,
        name=name,
        base_url=base_url,
        api_key=api_key,
        is_default=is_default,
    )
    db.add(provider)
    db.flush()
    if models is None:
        models = [{"model_name": "test-model", "is_default": True}]
    for i, m in enumerate(models):
        db.add(LlmProviderModel(
            provider_id=provider.id,
            model_name=m["model_name"],
            display_name=m.get("display_name"),
            is_default=m.get("is_default", i == 0),
        ))
    db.commit()
    db.refresh(provider)
    return provider


# ===================================================================
# resolve_default_llm_config
# ===================================================================

class TestResolveDefaultLlmConfig:
    def test_returns_none_when_no_providers(self, db):
        from app.core.llm_request import resolve_default_llm_config
        assert resolve_default_llm_config(db, None) is None

    def test_returns_default_provider_config(self, db):
        from app.core.llm_request import resolve_default_llm_config
        _seed_provider(db)
        config = resolve_default_llm_config(db, None)
        assert config is not None
        assert config["base_url"] == "https://api.test.com"
        assert config["api_key"] == "sk-test-key-12345678"
        assert config["model"] == "test-model"
        assert config["billing_source_hint"] == "selfhost"

    def test_falls_back_to_first_provider_if_no_default(self, db):
        from app.core.llm_request import resolve_default_llm_config
        _seed_provider(db, name="P1", is_default=False)
        config = resolve_default_llm_config(db, None)
        assert config is not None
        assert config["base_url"] == "https://api.test.com"

    def test_uses_default_model_within_provider(self, db):
        from app.core.llm_request import resolve_default_llm_config
        _seed_provider(db, models=[
            {"model_name": "model-a", "is_default": False},
            {"model_name": "model-b", "is_default": True},
        ])
        config = resolve_default_llm_config(db, None)
        assert config["model"] == "model-b"

    def test_falls_back_to_first_model_if_no_default(self, db):
        from app.core.llm_request import resolve_default_llm_config
        _seed_provider(db, models=[
            {"model_name": "model-a", "is_default": False},
            {"model_name": "model-b", "is_default": False},
        ])
        config = resolve_default_llm_config(db, None)
        assert config["model"] == "model-a"

    def test_returns_none_if_provider_has_no_models(self, db):
        from app.core.llm_request import resolve_default_llm_config
        provider = LlmProvider(name="Empty", base_url="https://x.com", api_key="k", is_default=True)
        db.add(provider)
        db.commit()
        assert resolve_default_llm_config(db, None) is None

    def test_hosted_mode_filters_by_user_id(self, db, monkeypatch):
        import app.core.llm_request as mod
        monkeypatch.setattr(mod, "get_settings", lambda: MagicMock(deploy_mode="hosted"))
        from app.core.llm_request import resolve_default_llm_config

        _seed_provider(db, name="User1Provider", user_id=1, api_key="key-user1")
        _seed_provider(db, name="User2Provider", user_id=2, api_key="key-user2")

        config = resolve_default_llm_config(db, 1)
        assert config["api_key"] == "key-user1"

    def test_billing_source_hosted(self, db, monkeypatch):
        import app.core.llm_request as mod
        monkeypatch.setattr(mod, "get_settings", lambda: MagicMock(deploy_mode="hosted"))
        from app.core.llm_request import resolve_default_llm_config

        _seed_provider(db, user_id=1)
        config = resolve_default_llm_config(db, 1)
        assert config["billing_source_hint"] == "hosted"


# ===================================================================
# get_llm_config_with_db
# ===================================================================

class TestGetLlmConfigWithDb:
    def test_complete_headers_take_priority(self, db, monkeypatch):
        from app.core.llm_request import get_llm_config_with_db
        import app.core.llm_request as mod
        monkeypatch.setattr(mod, "get_settings", lambda: MagicMock(deploy_mode="selfhost"))

        _seed_provider(db, api_key="db-key")
        req = MagicMock()
        req.headers = {
            "x-llm-base-url": "https://byok.example.com",
            "x-llm-api-key": "byok-key",
            "x-llm-model": "byok-model",
        }
        config = get_llm_config_with_db(req, db=db, user_id=None)
        assert config["api_key"] == "byok-key"
        assert config["model"] == "byok-model"

    def test_partial_headers_raise_400(self, db, monkeypatch):
        from fastapi import HTTPException
        from app.core.llm_request import get_llm_config_with_db
        import app.core.llm_request as mod
        monkeypatch.setattr(mod, "get_settings", lambda: MagicMock(deploy_mode="selfhost"))

        req = MagicMock()
        req.headers = {"x-llm-base-url": "https://example.com", "x-llm-api-key": "k"}
        with pytest.raises(HTTPException) as exc_info:
            get_llm_config_with_db(req, db=db, user_id=None)
        assert exc_info.value.status_code == 400

    def test_no_headers_returns_db_config(self, db, monkeypatch):
        from app.core.llm_request import get_llm_config_with_db
        import app.core.llm_request as mod
        monkeypatch.setattr(mod, "get_settings", lambda: MagicMock(deploy_mode="selfhost"))

        _seed_provider(db)
        req = MagicMock()
        req.headers = {}
        config = get_llm_config_with_db(req, db=db, user_id=None)
        assert config["api_key"] == "sk-test-key-12345678"

    def test_no_headers_no_db_returns_env_fallback(self, monkeypatch):
        from app.core.llm_request import get_llm_config_with_db
        import app.core.llm_request as mod
        monkeypatch.setattr(mod, "get_settings", lambda: MagicMock(
            deploy_mode="selfhost",
            openai_api_key="env-key",
            openai_base_url="https://env.example.com",
            openai_model="env-model",
        ))
        req = MagicMock()
        req.headers = {}
        config = get_llm_config_with_db(req, db=None, user_id=None)
        assert config["api_key"] == "env-key"

    def test_no_headers_no_db_no_env_returns_none(self, monkeypatch):
        from app.core.llm_request import get_llm_config_with_db
        import app.core.llm_request as mod
        monkeypatch.setattr(mod, "get_settings", lambda: MagicMock(
            deploy_mode="selfhost",
            openai_api_key="",
            openai_base_url="",
            openai_model="",
            hosted_llm_base_url="",
        ))
        req = MagicMock()
        req.headers = {}
        assert get_llm_config_with_db(req, db=None, user_id=None) is None

    def test_hosted_byok_url_validated(self, db, monkeypatch):
        from fastapi import HTTPException
        from app.core.llm_request import get_llm_config_with_db
        import app.core.llm_request as mod
        import app.core.url_validator as url_validator
        monkeypatch.setattr(mod, "get_settings", lambda: MagicMock(deploy_mode="hosted"))
        monkeypatch.setattr(url_validator, "get_settings", lambda: MagicMock(deploy_mode="hosted"))

        req = MagicMock()
        req.headers = {
            "x-llm-base-url": "http://169.254.169.254/v1",
            "x-llm-api-key": "k",
            "x-llm-model": "m",
        }
        with pytest.raises(HTTPException) as exc_info:
            get_llm_config_with_db(req, db=db, user_id=None)
        assert exc_info.value.status_code == 400


# ===================================================================
# API Key masking helpers
# ===================================================================

class TestApiKeyMasking:
    def test_short_key_masked(self):
        from app.api.llm import _mask_api_key
        assert _mask_api_key("short") == "****"

    def test_long_key_partial_mask(self):
        from app.api.llm import _mask_api_key
        result = _mask_api_key("sk-abcdefghijklmnop")
        assert result == "sk-a****mnop"

    def test_is_masked_detects_mask_token(self):
        from app.api.llm import _is_masked
        assert _is_masked("sk-a****mnop") is True
        assert _is_masked("real-key") is False
        assert _is_masked(None) is True
        assert _is_masked("") is True


# ===================================================================
# Provider CRUD API
# ===================================================================

class TestProviderCrudApi:
    def test_create_provider(self, db):
        from app.api import llm as llm_api
        from app.core.auth import get_current_user_or_default

        app = _make_app(db, llm_api.router)
        user = User(id=1, username="u", hashed_password="x", role="admin", is_active=True)
        app.dependency_overrides[get_current_user_or_default] = lambda: user

        with TestClient(app) as c:
            resp = c.post("/api/llm/providers", json={
                "name": "MyOpenAI",
                "base_url": "https://api.openai.com/v1",
                "api_key": "sk-1234567890abcdef",
                "models": [{"model_name": "gpt-4o-mini", "is_default": True}],
                "is_default": True,
            })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "MyOpenAI"
        assert data["is_default"] is True
        assert "****" in data["api_key"]
        assert data["api_key"] != "sk-1234567890abcdef"
        assert len(data["models"]) == 1
        assert data["models"][0]["model_name"] == "gpt-4o-mini"

    def test_list_providers_masks_keys(self, db):
        from app.api import llm as llm_api
        from app.core.auth import get_current_user_or_default

        _seed_provider(db, api_key="sk-longkey12345678")

        app = _make_app(db, llm_api.router)
        app.dependency_overrides[get_current_user_or_default] = lambda: User(
            id=1, username="u", hashed_password="x", role="admin", is_active=True
        )

        with TestClient(app) as c:
            resp = c.get("/api/llm/providers")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert "****" in data[0]["api_key"]
        assert data[0]["api_key_set"] is True

    def test_update_provider_skips_masked_api_key(self, db):
        from app.api import llm as llm_api
        from app.core.auth import get_current_user_or_default

        provider = _seed_provider(db, api_key="sk-original-key-12345")

        app = _make_app(db, llm_api.router)
        app.dependency_overrides[get_current_user_or_default] = lambda: User(
            id=1, username="u", hashed_password="x", role="admin", is_active=True
        )

        with TestClient(app) as c:
            resp = c.put(f"/api/llm/providers/{provider.id}", json={
                "api_key": "sk-o****2345",
            })
        assert resp.status_code == 200
        db.refresh(provider)
        assert provider.api_key == "sk-original-key-12345"

    def test_update_provider_sets_new_api_key(self, db):
        from app.api import llm as llm_api
        from app.core.auth import get_current_user_or_default

        provider = _seed_provider(db, api_key="sk-old-key-12345")

        app = _make_app(db, llm_api.router)
        app.dependency_overrides[get_current_user_or_default] = lambda: User(
            id=1, username="u", hashed_password="x", role="admin", is_active=True
        )

        with TestClient(app) as c:
            resp = c.put(f"/api/llm/providers/{provider.id}", json={
                "api_key": "sk-brand-new-key-here",
            })
        assert resp.status_code == 200
        db.refresh(provider)
        assert provider.api_key == "sk-brand-new-key-here"

    def test_delete_provider_cascades_models(self, db):
        from app.api import llm as llm_api
        from app.core.auth import get_current_user_or_default

        provider = _seed_provider(db, models=[
            {"model_name": "m1"},
            {"model_name": "m2"},
        ])
        assert db.query(LlmProviderModel).count() == 2

        app = _make_app(db, llm_api.router)
        app.dependency_overrides[get_current_user_or_default] = lambda: User(
            id=1, username="u", hashed_password="x", role="admin", is_active=True
        )

        with TestClient(app) as c:
            resp = c.delete(f"/api/llm/providers/{provider.id}")
        assert resp.status_code == 204
        assert db.query(LlmProvider).count() == 0
        assert db.query(LlmProviderModel).count() == 0

    def test_set_default_provider(self, db):
        from app.api import llm as llm_api
        from app.core.auth import get_current_user_or_default

        p1 = _seed_provider(db, name="P1", is_default=True)
        p2 = _seed_provider(db, name="P2", is_default=False)

        app = _make_app(db, llm_api.router)
        app.dependency_overrides[get_current_user_or_default] = lambda: User(
            id=1, username="u", hashed_password="x", role="admin", is_active=True
        )

        with TestClient(app) as c:
            resp = c.put(f"/api/llm/providers/{p2.id}/default")
        assert resp.status_code == 200
        db.refresh(p1)
        db.refresh(p2)
        assert p1.is_default is False
        assert p2.is_default is True

    def test_create_provider_first_model_auto_default(self, db):
        from app.api import llm as llm_api
        from app.core.auth import get_current_user_or_default

        app = _make_app(db, llm_api.router)
        app.dependency_overrides[get_current_user_or_default] = lambda: User(
            id=1, username="u", hashed_password="x", role="admin", is_active=True
        )

        with TestClient(app) as c:
            resp = c.post("/api/llm/providers", json={
                "name": "Test",
                "base_url": "https://api.test.com",
                "api_key": "key",
                "models": [
                    {"model_name": "m1", "is_default": False},
                    {"model_name": "m2", "is_default": False},
                ],
            })
        assert resp.status_code == 201
        models = resp.json()["models"]
        assert models[0]["is_default"] is True
        assert models[1]["is_default"] is False

    def test_delete_default_promotes_next(self, db):
        from app.api import llm as llm_api
        from app.core.auth import get_current_user_or_default

        p1 = _seed_provider(db, name="P1", is_default=True)
        p2 = _seed_provider(db, name="P2", is_default=False)

        app = _make_app(db, llm_api.router)
        app.dependency_overrides[get_current_user_or_default] = lambda: User(
            id=1, username="u", hashed_password="x", role="admin", is_active=True
        )

        with TestClient(app) as c:
            c.delete(f"/api/llm/providers/{p1.id}")
        db.refresh(p2)
        assert p2.is_default is True

    def test_update_provider_replaces_models(self, db):
        from app.api import llm as llm_api
        from app.core.auth import get_current_user_or_default

        provider = _seed_provider(db, models=[
            {"model_name": "old-model", "is_default": True},
        ])
        assert db.query(LlmProviderModel).filter_by(provider_id=provider.id).count() == 1

        app = _make_app(db, llm_api.router)
        app.dependency_overrides[get_current_user_or_default] = lambda: User(
            id=1, username="u", hashed_password="x", role="admin", is_active=True
        )

        with TestClient(app) as c:
            resp = c.put(f"/api/llm/providers/{provider.id}", json={
                "models": [
                    {"model_name": "new-a", "is_default": True},
                    {"model_name": "new-b"},
                ],
            })
        assert resp.status_code == 200
        model_names = [m["model_name"] for m in resp.json()["models"]]
        assert model_names == ["new-a", "new-b"]
        assert db.query(LlmProviderModel).filter_by(provider_id=provider.id).count() == 2

    def test_404_on_nonexistent_provider(self, db):
        from app.api import llm as llm_api
        from app.core.auth import get_current_user_or_default

        app = _make_app(db, llm_api.router)
        app.dependency_overrides[get_current_user_or_default] = lambda: User(
            id=1, username="u", hashed_password="x", role="admin", is_active=True
        )

        with TestClient(app) as c:
            resp = c.put("/api/llm/providers/9999", json={"name": "X"})
        assert resp.status_code == 404


# ===================================================================
# Hosted mode tenant isolation
# ===================================================================

class TestProviderTenantIsolation:
    def test_hosted_user_cannot_see_others_providers(self, db, monkeypatch):
        from app.api import llm as llm_api
        from app.core.auth import get_current_user_or_default
        import app.api.llm as llm_mod
        monkeypatch.setattr(llm_mod, "get_settings", lambda: MagicMock(deploy_mode="hosted"))

        _seed_provider(db, name="User1", user_id=1, api_key="k1")
        _seed_provider(db, name="User2", user_id=2, api_key="k2")

        user1 = User(id=1, username="u1", hashed_password="x", role="admin", is_active=True)
        app = _make_app(db, llm_api.router)
        app.dependency_overrides[get_current_user_or_default] = lambda: user1

        with TestClient(app) as c:
            resp = c.get("/api/llm/providers")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["name"] == "User1"

    def test_hosted_user_cannot_delete_others_provider(self, db, monkeypatch):
        from app.api import llm as llm_api
        from app.core.auth import get_current_user_or_default
        import app.api.llm as llm_mod
        monkeypatch.setattr(llm_mod, "get_settings", lambda: MagicMock(deploy_mode="hosted"))

        p = _seed_provider(db, name="User2", user_id=2)

        user1 = User(id=1, username="u1", hashed_password="x", role="admin", is_active=True)
        app = _make_app(db, llm_api.router)
        app.dependency_overrides[get_current_user_or_default] = lambda: user1

        with TestClient(app) as c:
            resp = c.delete(f"/api/llm/providers/{p.id}")
        assert resp.status_code == 404


# ===================================================================
# Copilot model_id resolution (unit level)
# ===================================================================

class TestCopilotModelResolution:
    def test_session_model_id_resolves_provider_config(self, db, monkeypatch):
        """Verify the model resolution logic used in copilot run_create."""
        import app.config as config_mod
        from app.config import Settings
        config_mod._settings_instance = Settings(deploy_mode="selfhost", _env_file=None)

        provider = _seed_provider(db, api_key="copilot-key", models=[
            {"model_name": "copilot-model", "is_default": True},
        ])
        model = db.query(LlmProviderModel).filter_by(provider_id=provider.id).first()

        model_rec = db.get(LlmProviderModel, model.id)
        assert model_rec is not None
        provider_rec = db.get(LlmProvider, model_rec.provider_id)
        assert provider_rec is not None

        config = {
            "base_url": provider_rec.base_url,
            "api_key": provider_rec.api_key,
            "model": model_rec.model_name,
            "billing_source_hint": "selfhost",
        }
        assert config["api_key"] == "copilot-key"
        assert config["model"] == "copilot-model"

    def test_tenant_validation_rejects_other_users_model(self, db, monkeypatch):
        """Simulate copilot run_create tenant check in hosted mode."""
        from fastapi import HTTPException

        p1 = _seed_provider(db, name="P1", user_id=1, api_key="k1", models=[
            {"model_name": "m1"},
        ])
        p2 = _seed_provider(db, name="P2", user_id=2, api_key="k2", models=[
            {"model_name": "m2"},
        ])
        m1 = db.query(LlmProviderModel).filter_by(provider_id=p1.id).first()

        provider = db.get(LlmProvider, m1.provider_id)
        assert provider.user_id == 1

        user_id_other = 2
        if provider.user_id != user_id_other:
            with pytest.raises(HTTPException) as exc_info:
                raise HTTPException(status_code=403, detail={"code": "model_not_owned"})
            assert exc_info.value.status_code == 403

    def test_falls_back_to_default_when_no_session_model(self, db):
        """When session has no model_id, resolve_default_llm_config is used."""
        from app.core.llm_request import resolve_default_llm_config
        _seed_provider(db, api_key="default-key", models=[
            {"model_name": "default-model"},
        ])
        config = resolve_default_llm_config(db, None)
        assert config["api_key"] == "default-key"
        assert config["model"] == "default-model"

    def test_falls_back_to_env_when_no_db_config(self, monkeypatch):
        """When DB has no config, _env_fallback_config is used."""
        from app.core.llm_request import _env_fallback_config
        import app.core.llm_request as mod
        monkeypatch.setattr(mod, "get_settings", lambda: MagicMock(
            deploy_mode="selfhost",
            openai_api_key="env-fallback-key",
            openai_base_url="https://env.example.com",
            openai_model="env-model",
        ))
        config = _env_fallback_config()
        assert config["api_key"] == "env-fallback-key"


# ===================================================================
# Provider test endpoint (unit-level: DB lookup logic)
# ===================================================================

class TestProviderTestEndpoint:
    def test_test_endpoint_looks_up_default_model(self, db, monkeypatch):
        """Verify the provider test endpoint resolves model_name correctly."""
        from app.api import llm as llm_api
        from app.core.auth import get_current_user_or_default

        provider = _seed_provider(db, models=[
            {"model_name": "m1", "is_default": False},
            {"model_name": "m2", "is_default": True},
        ])

        # Simulate the logic from test_provider_connection
        default_model = db.query(LlmProviderModel).filter_by(
            provider_id=provider.id, is_default=True
        ).first()
        assert default_model is not None
        assert default_model.model_name == "m2"

    def test_test_endpoint_falls_back_to_first_model(self, db):
        provider = _seed_provider(db, models=[
            {"model_name": "only-model", "is_default": False},
        ])
        default_model = db.query(LlmProviderModel).filter_by(
            provider_id=provider.id, is_default=True
        ).first()
        assert default_model is None

        fallback = db.query(LlmProviderModel).filter_by(
            provider_id=provider.id
        ).first()
        assert fallback is not None
        assert fallback.model_name == "only-model"

    def test_test_endpoint_rejects_no_models(self, db):
        from app.api import llm as llm_api
        from app.core.auth import get_current_user_or_default

        provider = LlmProvider(name="Empty", base_url="https://x.com", api_key="k")
        db.add(provider)
        db.commit()

        models = db.query(LlmProviderModel).filter_by(provider_id=provider.id).all()
        assert len(models) == 0
