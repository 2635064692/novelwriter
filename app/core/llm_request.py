# SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
# SPDX-License-Identifier: AGPL-3.0-only

"""Request-scoped LLM config helpers shared across API entry points."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request

from app.config import get_settings

LLM_BASE_URL_HEADER = "x-llm-base-url"
LLM_API_KEY_HEADER = "x-llm-api-key"
LLM_MODEL_HEADER = "x-llm-model"

LLM_CONFIG_INCOMPLETE_CODE = "llm_config_incomplete"
LLM_CONFIG_INCOMPLETE_MESSAGE = (
    "BYOK requires X-LLM-Base-Url, X-LLM-Api-Key, and X-LLM-Model together."
)


@dataclass(frozen=True)
class RequestLLMOverride:
    base_url: str | None
    api_key: str | None
    model: str | None

    def has_any_value(self) -> bool:
        return bool(self.base_url or self.api_key or self.model)

    def is_complete(self) -> bool:
        return bool(self.base_url and self.api_key and self.model)


def build_incomplete_llm_config_detail() -> dict[str, str]:
    return {
        "code": LLM_CONFIG_INCOMPLETE_CODE,
        "message": LLM_CONFIG_INCOMPLETE_MESSAGE,
    }


def read_llm_override(request: Request) -> RequestLLMOverride:
    return RequestLLMOverride(
        base_url=request.headers.get(LLM_BASE_URL_HEADER),
        api_key=request.headers.get(LLM_API_KEY_HEADER),
        model=request.headers.get(LLM_MODEL_HEADER),
    )


def get_llm_config(request: Request) -> dict[str, Any] | None:
    """Extract per-request LLM config from headers or hosted defaults."""

    override = read_llm_override(request)
    if not override.has_any_value():
        settings = get_settings()
        if settings.deploy_mode == "hosted" and settings.hosted_llm_base_url:
            return {
                "base_url": settings.hosted_llm_base_url,
                "api_key": settings.hosted_llm_api_key,
                "model": settings.hosted_llm_model,
                "billing_source_hint": "hosted",
            }
        return None

    if not override.is_complete():
        raise HTTPException(status_code=400, detail=build_incomplete_llm_config_detail())

    settings = get_settings()
    if settings.deploy_mode == "hosted" and override.base_url:
        from app.core.url_validator import UnsafeURLError, validate_llm_url

        try:
            validate_llm_url(override.base_url)
        except UnsafeURLError as exc:
            # Reject user-controlled endpoints that can be used for SSRF in hosted mode.
            raise HTTPException(status_code=400, detail=str(exc))

    billing_source_hint = "byok" if settings.deploy_mode == "hosted" else "selfhost"
    return {
        "base_url": override.base_url,
        "api_key": override.api_key,
        "model": override.model,
        "billing_source_hint": billing_source_hint,
    }


def resolve_generation_billing_source(request: Request) -> str:
    settings = get_settings()
    if settings.deploy_mode != "hosted":
        return "selfhost"

    override = read_llm_override(request)
    if not override.has_any_value():
        return "hosted"

    if not override.is_complete():
        raise HTTPException(status_code=400, detail=build_incomplete_llm_config_detail())

    return "byok"


def resolve_default_llm_config(db: Any, user_id: int | None) -> dict[str, Any] | None:
    """Read default provider+model config from DB. Returns None if no config."""
    from app.models import LlmProvider, LlmProviderModel

    settings = get_settings()
    q = db.query(LlmProvider)
    if settings.deploy_mode == "hosted" and user_id is not None:
        q = q.filter_by(user_id=user_id)
    provider = q.filter_by(is_default=True).first()
    if provider is None:
        providers = q.all()
        provider = providers[0] if providers else None
    if provider is None:
        return None

    model = db.query(LlmProviderModel).filter_by(provider_id=provider.id, is_default=True).first()
    if model is None:
        model = db.query(LlmProviderModel).filter_by(provider_id=provider.id).first()
    if model is None:
        return None

    billing = "hosted" if settings.deploy_mode == "hosted" else "selfhost"
    return {
        "base_url": provider.base_url,
        "api_key": provider.api_key,
        "model": model.model_name,
        "billing_source_hint": billing,
    }


def _env_fallback_config() -> dict[str, Any] | None:
    settings = get_settings()
    if settings.deploy_mode == "hosted" and settings.hosted_llm_base_url:
        return {
            "base_url": settings.hosted_llm_base_url,
            "api_key": settings.hosted_llm_api_key,
            "model": settings.hosted_llm_model,
            "billing_source_hint": "hosted",
        }
    if settings.openai_api_key:
        return {
            "base_url": settings.openai_base_url,
            "api_key": settings.openai_api_key,
            "model": settings.openai_model,
            "billing_source_hint": "selfhost",
        }
    return None


def get_llm_config_with_db(
    request: Request,
    db: Any = None,
    user_id: int | None = None,
) -> dict[str, Any] | None:
    """Enhanced config resolution: header -> DB default -> .env fallback."""
    override = read_llm_override(request)

    if override.has_any_value() and not override.is_complete():
        raise HTTPException(status_code=400, detail=build_incomplete_llm_config_detail())

    if override.is_complete():
        settings = get_settings()
        if settings.deploy_mode == "hosted" and override.base_url:
            from app.core.url_validator import UnsafeURLError, validate_llm_url
            try:
                validate_llm_url(override.base_url)
            except UnsafeURLError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
        billing_source_hint = "byok" if settings.deploy_mode == "hosted" else "selfhost"
        return {
            "base_url": override.base_url,
            "api_key": override.api_key,
            "model": override.model,
            "billing_source_hint": billing_source_hint,
        }

    if db is not None:
        db_config = resolve_default_llm_config(db, user_id)
        if db_config is not None:
            return db_config

    return _env_fallback_config()
