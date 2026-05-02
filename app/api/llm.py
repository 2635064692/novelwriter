"""LLM configuration and provider management endpoints."""

import logging
import time

from app.core.llm_json import parse_llm_json_response

from fastapi import APIRouter, Depends, HTTPException, Request
from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.core.auth import get_current_user_or_default
from app.core.ai_client import (
    _record_usage,
    _resolve_billing_source,
    _stream_options_unsupported,
)
from app.core.llm_request import get_llm_config
from app.core.safety_fuses import ensure_ai_available
from app.models import LlmProvider, LlmProviderModel, User
from app.schemas import (
    LlmProviderCreate,
    LlmProviderResponse,
    LlmProviderTestRequest,
    LlmProviderUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/llm", tags=["llm"])


def _probe_error_message(exc: Exception) -> str:
    text = str(exc).strip()
    if not text:
        return type(exc).__name__
    return text


async def _probe_stream_support(client: AsyncOpenAI, model: str) -> None:
    request_kwargs = {
        "model": model,
        "messages": [{"role": "user", "content": "Reply with exactly: ok"}],
        "max_tokens": 4,
        "stream": True,
    }
    try:
        stream = await client.chat.completions.create(
            **request_kwargs,
            stream_options={"include_usage": True},
        )
    except Exception as exc:
        if not _stream_options_unsupported(exc):
            raise
        stream = await client.chat.completions.create(**request_kwargs)

    async for _chunk in stream:
        pass


async def _probe_json_mode_support(client: AsyncOpenAI, model: str) -> None:
    response = await client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": 'Return a JSON object: {"ok": true}'}],
        max_tokens=32,
        response_format={"type": "json_object"},
    )
    raw = response.choices[0].message.content or ""
    parsed = parse_llm_json_response(raw)
    if not isinstance(parsed, dict):
        raise ValueError("JSON mode response is not an object")


def _build_capability_error(capabilities: dict[str, bool], errors: dict[str, str]) -> str:
    missing: list[str] = []
    if not capabilities["stream"]:
        missing.append("流式输出（续写）")
    if not capabilities["json_mode"]:
        missing.append("JSON 模式（世界生成 / Bootstrap）")

    if not missing:
        return errors.get("basic") or "连接失败"

    missing_text = "、".join(missing)
    detail_parts = [errors[key] for key in ("stream", "json_mode") if errors.get(key)]
    detail = f"；详情：{'；'.join(detail_parts)}" if detail_parts else ""
    return f"基础连接成功，但当前模型/接口不支持 {missing_text}{detail}"


@router.post("/test")
async def test_llm_connection(
    request: Request,
    _user=Depends(get_current_user_or_default),
    db: Session = Depends(get_db),
):
    """Send a minimal completion request to validate LLM config from headers."""
    config = get_llm_config(request)
    if not config or not config.get("base_url") or not config.get("api_key") or not config.get("model"):
        raise HTTPException(status_code=400, detail="Missing LLM config headers (X-LLM-Base-Url, X-LLM-Api-Key, X-LLM-Model)")

    using_request_override = bool(
        request.headers.get("x-llm-base-url")
        and request.headers.get("x-llm-api-key")
        and request.headers.get("x-llm-model")
    )
    billing_source = _resolve_billing_source(
        config.get("billing_source_hint"),
        using_request_override=using_request_override,
    )
    ensure_ai_available(db, billing_source=billing_source)

    base_url = config["base_url"]
    if base_url.endswith("/chat/completions"):
        base_url = base_url[: -len("/chat/completions")]
    base_url = base_url.rstrip("/")

    client = AsyncOpenAI(
        base_url=base_url,
        api_key=config["api_key"],
        timeout=10.0,
    )

    start = time.perf_counter()
    capabilities = {"basic": False, "stream": False, "json_mode": False}
    errors: dict[str, str] = {}
    try:
        response = await client.chat.completions.create(
            model=config["model"],
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=1,
        )
        capabilities["basic"] = True
        usage = getattr(response, "usage", None)
        if usage is not None:
            try:
                prompt_tokens = int(usage.prompt_tokens)
                completion_tokens = int(usage.completion_tokens)
            except (TypeError, ValueError):
                pass
            else:
                _record_usage(
                    config["model"],
                    prompt_tokens,
                    completion_tokens,
                    endpoint="/api/llm/test",
                    node_name="llm_test",
                    user_id=getattr(_user, "id", None),
                    billing_source=billing_source,
                )
        latency_ms = round((time.perf_counter() - start) * 1000)
    except Exception as e:
        errors["basic"] = _probe_error_message(e)
        return {
            "ok": False,
            "model": config["model"],
            "latency_ms": round((time.perf_counter() - start) * 1000),
            "capabilities": capabilities,
            "error": f"基础连接失败：{errors['basic']}",
        }

    try:
        await _probe_stream_support(client, config["model"])
        capabilities["stream"] = True
    except Exception as e:
        errors["stream"] = _probe_error_message(e)

    try:
        await _probe_json_mode_support(client, config["model"])
        capabilities["json_mode"] = True
    except Exception as e:
        errors["json_mode"] = _probe_error_message(e)

    ok = all(capabilities.values())
    payload = {
        "ok": ok,
        "model": config["model"],
        "latency_ms": latency_ms,
        "capabilities": capabilities,
    }
    if ok:
        payload["message"] = "连接与应用兼容性检测通过"
    else:
        payload["error"] = _build_capability_error(capabilities, errors)
    return payload


# ---------------------------------------------------------------------------
# API Key masking
# ---------------------------------------------------------------------------

_MASK_TOKEN = "****"


def _mask_api_key(key: str) -> str:
    if not key or len(key) <= 8:
        return _MASK_TOKEN
    return key[:4] + _MASK_TOKEN + key[-4:]


def _is_masked(value: str | None) -> bool:
    return not value or _MASK_TOKEN in value


def _provider_scope(db: Session, user: User):
    settings = get_settings()
    q = db.query(LlmProvider)
    if settings.deploy_mode == "hosted":
        q = q.filter_by(user_id=user.id)
    return q


def _provider_to_response(provider: LlmProvider) -> LlmProviderResponse:
    return LlmProviderResponse(
        id=provider.id,
        name=provider.name,
        preset_slug=provider.preset_slug,
        base_url=provider.base_url,
        api_key=_mask_api_key(provider.api_key),
        api_key_set=bool(provider.api_key),
        is_default=provider.is_default,
        models=provider.models,
        created_at=provider.created_at,
        updated_at=provider.updated_at,
    )


# ---------------------------------------------------------------------------
# Provider CRUD
# ---------------------------------------------------------------------------


@router.get("/providers", response_model=list[LlmProviderResponse])
def list_providers(
    _user: User = Depends(get_current_user_or_default),
    db: Session = Depends(get_db),
):
    providers = _provider_scope(db, _user).order_by(LlmProvider.created_at).all()
    return [_provider_to_response(p) for p in providers]


@router.post("/providers", response_model=LlmProviderResponse, status_code=201)
def create_provider(
    body: LlmProviderCreate,
    _user: User = Depends(get_current_user_or_default),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    user_id = _user.id if settings.deploy_mode == "hosted" else None

    if body.is_default:
        _provider_scope(db, _user).update({LlmProvider.is_default: False})

    provider = LlmProvider(
        user_id=user_id,
        name=body.name,
        preset_slug=body.preset_slug,
        base_url=body.base_url.rstrip("/"),
        api_key=body.api_key,
        is_default=body.is_default,
    )
    db.add(provider)
    db.flush()

    has_default = False
    for i, m in enumerate(body.models):
        is_d = m.is_default or (i == 0 and not has_default)
        if is_d:
            has_default = True
        db.add(LlmProviderModel(
            provider_id=provider.id,
            model_name=m.model_name,
            display_name=m.display_name,
            is_default=is_d,
        ))

    db.commit()
    db.refresh(provider)
    return _provider_to_response(provider)


@router.put("/providers/{provider_id}", response_model=LlmProviderResponse)
def update_provider(
    provider_id: int,
    body: LlmProviderUpdate,
    _user: User = Depends(get_current_user_or_default),
    db: Session = Depends(get_db),
):
    provider = db.get(LlmProvider, provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    settings = get_settings()
    if settings.deploy_mode == "hosted" and provider.user_id != _user.id:
        raise HTTPException(status_code=404, detail="Provider not found")

    if body.name is not None:
        provider.name = body.name
    if body.base_url is not None:
        provider.base_url = body.base_url.rstrip("/")
    if body.api_key is not None and not _is_masked(body.api_key):
        provider.api_key = body.api_key
    if body.is_default is True:
        _provider_scope(db, _user).update({LlmProvider.is_default: False})
        provider.is_default = True

    if body.models is not None:
        db.query(LlmProviderModel).filter_by(provider_id=provider.id).delete()
        db.flush()
        has_default = False
        for i, m in enumerate(body.models):
            is_d = m.is_default or (i == 0 and not has_default)
            if is_d:
                has_default = True
            db.add(LlmProviderModel(
                provider_id=provider.id,
                model_name=m.model_name,
                display_name=m.display_name,
                is_default=is_d,
            ))

    db.commit()
    db.refresh(provider)
    return _provider_to_response(provider)


@router.delete("/providers/{provider_id}", status_code=204)
def delete_provider(
    provider_id: int,
    _user: User = Depends(get_current_user_or_default),
    db: Session = Depends(get_db),
):
    provider = db.get(LlmProvider, provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    settings = get_settings()
    if settings.deploy_mode == "hosted" and provider.user_id != _user.id:
        raise HTTPException(status_code=404, detail="Provider not found")

    was_default = provider.is_default
    db.delete(provider)
    db.flush()
    if was_default:
        first = _provider_scope(db, _user).order_by(LlmProvider.created_at).first()
        if first:
            first.is_default = True
    db.commit()


@router.put("/providers/{provider_id}/default", response_model=LlmProviderResponse)
def set_default_provider(
    provider_id: int,
    _user: User = Depends(get_current_user_or_default),
    db: Session = Depends(get_db),
):
    provider = db.get(LlmProvider, provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    settings = get_settings()
    if settings.deploy_mode == "hosted" and provider.user_id != _user.id:
        raise HTTPException(status_code=404, detail="Provider not found")

    _provider_scope(db, _user).update({LlmProvider.is_default: False})
    provider.is_default = True
    db.commit()
    db.refresh(provider)
    return _provider_to_response(provider)


@router.post("/providers/{provider_id}/test")
async def test_provider_connection(
    provider_id: int,
    body: LlmProviderTestRequest | None = None,
    _user: User = Depends(get_current_user_or_default),
    db: Session = Depends(get_db),
):
    provider = db.get(LlmProvider, provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    settings = get_settings()
    if settings.deploy_mode == "hosted" and provider.user_id != _user.id:
        raise HTTPException(status_code=404, detail="Provider not found")

    model_name = body.model_name if body and body.model_name else None
    if model_name is None:
        default_model = db.query(LlmProviderModel).filter_by(
            provider_id=provider.id, is_default=True
        ).first()
        if default_model is None:
            default_model = db.query(LlmProviderModel).filter_by(
                provider_id=provider.id
            ).first()
        if default_model is None:
            raise HTTPException(status_code=400, detail="No models configured for this provider")
        model_name = default_model.model_name

    base_url = provider.base_url
    if base_url.endswith("/chat/completions"):
        base_url = base_url[: -len("/chat/completions")]
    base_url = base_url.rstrip("/")

    client = AsyncOpenAI(base_url=base_url, api_key=provider.api_key, timeout=15.0)

    start = time.perf_counter()
    capabilities = {"basic": False, "stream": False, "json_mode": False}
    errors: dict[str, str] = {}
    try:
        await client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=1,
        )
        capabilities["basic"] = True
        latency_ms = round((time.perf_counter() - start) * 1000)
    except Exception as e:
        errors["basic"] = _probe_error_message(e)
        return {
            "ok": False,
            "model": model_name,
            "latency_ms": round((time.perf_counter() - start) * 1000),
            "capabilities": capabilities,
            "error": f"基础连接失败：{errors['basic']}",
        }

    try:
        await _probe_stream_support(client, model_name)
        capabilities["stream"] = True
    except Exception as e:
        errors["stream"] = _probe_error_message(e)

    try:
        await _probe_json_mode_support(client, model_name)
        capabilities["json_mode"] = True
    except Exception as e:
        errors["json_mode"] = _probe_error_message(e)

    ok = all(capabilities.values())
    payload: dict = {
        "ok": ok,
        "model": model_name,
        "latency_ms": latency_ms,
        "capabilities": capabilities,
    }
    if ok:
        payload["message"] = "连接与应用兼容性检测通过"
    else:
        payload["error"] = _build_capability_error(capabilities, errors)
    return payload
