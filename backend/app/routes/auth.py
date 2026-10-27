"""Login / linking / logout. Identities are verified by the provider; linking never merges accounts."""

import secrets
from datetime import timedelta
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..auth import faceit_oauth, steam
from ..auth.security import (
    BINDING_COOKIE,
    SESSION_COOKIE,
    client_ip,
    create_session,
    destroy_session,
    purge_expired,
    safe_return_to,
    set_cookie,
    sha256,
)
from ..db import GameProfile, Identity, OAuthState, User, UserSettings, utcnow
from ..faceit_normalize import normalize_profile
from ..providers.base import ProviderError
from ..state import AppState, Auth, get_auth, get_db, get_state, require_user

router = APIRouter(prefix="/api/auth", tags=["auth"])
STATE_TTL = timedelta(minutes=10)


def _limit(state: AppState, request: Request, bucket: str) -> None:
    state.limiter.check(f"auth:{bucket}:{client_ip(request)}", state.settings.auth_rate_limit_per_minute)


def _start(
    db: Session,
    request: Request,
    state: AppState,
    provider: str,
    auth: Auth,
    link: bool,
    return_to: str | None,
    verifier: str | None = None,
) -> tuple[str, RedirectResponse]:
    if link and auth.user is None:
        raise HTTPException(401, "Чтобы привязать аккаунт, сначала войдите")
    binding = secrets.token_urlsafe(24)
    st = secrets.token_urlsafe(32)
    db.execute(delete(OAuthState).where(OAuthState.created_at < utcnow() - STATE_TTL))
    db.add(
        OAuthState(
            state=st,
            provider=provider,
            code_verifier=verifier,
            browser_binding=sha256(binding),
            link_user_id=auth.user.id if link and auth.user else None,
            return_to=safe_return_to(return_to),
        )
    )
    resp = RedirectResponse("/", status_code=302)
    set_cookie(resp, state.settings, BINDING_COOKIE, binding, int(STATE_TTL.total_seconds()))
    return st, resp


def _consume_state(db: Session, request: Request, st: str | None, provider: str) -> OAuthState:
    row = db.get(OAuthState, st) if st else None
    binding = request.cookies.get(BINDING_COOKIE, "")
    if row is None or row.provider != provider or row.created_at < utcnow() - STATE_TTL:
        raise HTTPException(400, "Сессия входа устарела, начните вход заново")
    if not secrets.compare_digest(row.browser_binding, sha256(binding)):
        raise HTTPException(400, "Вход начат в другом браузере (защита от login CSRF)")
    db.delete(row)  # single use
    return row


async def _attach_profile_from_steam(db: Session, state: AppState, user: User, steam_id: str) -> None:
    existing = db.get(GameProfile, user.id)
    if existing and existing.source == "faceit_oauth":
        return  # a verified FACEIT login always wins over a Steam-derived lookup
    try:
        raw = await state.provider.get_player_by_steam(steam_id)
    except ProviderError:
        return
    if not raw:
        return
    prof = normalize_profile(raw)
    if existing:
        existing.faceit_player_id, existing.nickname, existing.steam_id, existing.source = (
            prof.player_id,
            prof.nickname,
            steam_id,
            "steam_lookup",
        )
    else:
        db.add(
            GameProfile(
                user_id=user.id,
                faceit_player_id=prof.player_id,
                nickname=prof.nickname,
                steam_id=steam_id,
                source="steam_lookup",
            )
        )


def _finish_identity(
    db: Session, request: Request, auth: Auth, row: OAuthState, provider: str, subject: str, name: str | None
) -> tuple[User, str]:
    """Returns (user, outcome). Linking rules prevent account takeover:
    * an identity already bound to another account is never moved or merged;
    * linking requires the same signed-in user that started the flow."""
    ident = db.scalar(select(Identity).where(Identity.provider == provider, Identity.subject == subject))
    if row.link_user_id is not None:
        if auth.user is None or auth.user.id != row.link_user_id:
            raise HTTPException(403, "Привязка должна завершаться в той же сессии, где начата")
        if ident and ident.user_id != auth.user.id:
            raise HTTPException(409, "Этот аккаунт уже привязан к другой учётной записи FACEIT Intelligence")
        if ident is None:
            db.add(Identity(user_id=auth.user.id, provider=provider, subject=subject, display_name=name))
        return auth.user, "linked"
    if ident:
        ident.verified_at = utcnow()
        if name:
            ident.display_name = name
        return db.get(User, ident.user_id), "login"
    user = User()
    db.add(user)
    db.flush()
    db.add(Identity(user_id=user.id, provider=provider, subject=subject, display_name=name))
    db.add(UserSettings(user_id=user.id, data={}))
    return user, "created"


def _redirect_done(
    request: Request, state: AppState, db: Session, user: User, return_to: str
) -> RedirectResponse:
    resp = RedirectResponse(return_to, status_code=302)
    create_session(db, resp, state.settings, user, request.cookies.get(SESSION_COOKIE))
    resp.delete_cookie(BINDING_COOKIE, path="/")
    purge_expired(db)
    return resp


# --- Steam ---------------------------------------------------------------------------------------


@router.get("/steam/start")
def steam_start(
    request: Request,
    return_to: str = "/",
    link: bool = False,
    db: Session = Depends(get_db),
    state: AppState = Depends(get_state),
    auth: Auth = Depends(get_auth),
):
    _limit(state, request, "steam")
    st, resp = _start(db, request, state, "steam", auth, link, return_to)
    base = state.settings.app_base_url.rstrip("/")
    resp.headers["location"] = steam.login_url(
        state.settings.steam_openid_url, f"{base}/api/auth/steam/callback?state={st}", base + "/"
    )
    return resp


@router.get("/steam/callback")
async def steam_callback(
    request: Request,
    db: Session = Depends(get_db),
    state: AppState = Depends(get_state),
    auth: Auth = Depends(get_auth),
):
    _limit(state, request, "steam")
    st = request.query_params.get("state")
    row = _consume_state(db, request, st, "steam")
    base = state.settings.app_base_url.rstrip("/")
    params = {k: v for k, v in request.query_params.items() if k.startswith("openid.")}
    try:
        steam_id = await steam.verify(
            state.settings.steam_openid_url,
            params,
            f"{base}/api/auth/steam/callback?state={st}",
            state.auth_transport,
        )
    except steam.SteamVerificationError as exc:
        raise HTTPException(400, str(exc)) from exc
    user, _ = _finish_identity(db, request, auth, row, "steam", steam_id, None)
    await _attach_profile_from_steam(db, state, user, steam_id)
    return _redirect_done(request, state, db, user, row.return_to)


# --- FACEIT --------------------------------------------------------------------------------------


@router.get("/faceit/start")
def faceit_start(
    request: Request,
    return_to: str = "/",
    link: bool = False,
    db: Session = Depends(get_db),
    state: AppState = Depends(get_state),
    auth: Auth = Depends(get_auth),
):
    _limit(state, request, "faceit")
    cfg = state.settings
    if not cfg.faceit_oauth_configured:
        raise HTTPException(
            503, "Вход через FACEIT не настроен: нужны FACEIT_CLIENT_ID и FACEIT_CLIENT_SECRET"
        )
    verifier, challenge = faceit_oauth.pkce_pair()
    st, resp = _start(db, request, state, "faceit", auth, link, return_to, verifier)
    resp.headers["location"] = faceit_oauth.authorize_url(
        cfg.faceit_oauth_authorize_url,
        cfg.faceit_client_id,
        f"{cfg.app_base_url.rstrip('/')}/api/auth/faceit/callback",
        st,
        challenge,
        cfg.faceit_oauth_scopes,
    )
    return resp


@router.get("/faceit/callback")
async def faceit_callback(
    request: Request,
    code: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
    state: AppState = Depends(get_state),
    auth: Auth = Depends(get_auth),
):
    _limit(state, request, "faceit")
    cfg = state.settings
    row = _consume_state(db, request, request.query_params.get("state"), "faceit")
    if error or not code:
        raise HTTPException(400, f"FACEIT вернул ошибку: {error or 'нет кода'}")
    try:
        info = await faceit_oauth.exchange_and_fetch_user(
            cfg.faceit_oauth_token_url,
            cfg.faceit_oauth_userinfo_url,
            cfg.faceit_client_id,
            cfg.faceit_client_secret.get_secret_value(),
            code,
            f"{cfg.app_base_url.rstrip('/')}/api/auth/faceit/callback",
            row.code_verifier or "",
            state.auth_transport,
        )
    except faceit_oauth.FaceitOAuthError as exc:
        raise HTTPException(502, str(exc)) from exc
    user, _ = _finish_identity(db, request, auth, row, "faceit", info["guid"], info.get("nickname"))
    gp = db.get(GameProfile, user.id)
    nick = info.get("nickname") or ""
    if gp:
        gp.faceit_player_id, gp.nickname, gp.source = info["guid"], nick or gp.nickname, "faceit_oauth"
    else:
        db.add(
            GameProfile(user_id=user.id, faceit_player_id=info["guid"], nickname=nick, source="faceit_oauth")
        )
    return _redirect_done(request, state, db, user, row.return_to)


# --- Dev login (tests only) ----------------------------------------------------------------------


class DevLogin(BaseModel):
    faceit_nickname: str


@router.post("/dev-login")
async def dev_login(
    body: DevLogin,
    request: Request,
    db: Session = Depends(get_db),
    state: AppState = Depends(get_state),
    auth: Auth = Depends(get_auth),
):
    host = urlparse(state.settings.app_base_url).hostname
    if (
        not state.settings.auth_dev_login
        or host not in ("localhost", "127.0.0.1")
        or state.settings.secure_cookies
    ):
        raise HTTPException(404, "Not found")
    raw = await state.provider.get_player(body.faceit_nickname)
    prof = normalize_profile(raw)
    row = OAuthState(state="dev", provider="dev", browser_binding="", return_to="/")
    user, _ = _finish_identity(db, request, auth, row, "dev", prof.player_id, prof.nickname)
    gp = db.get(GameProfile, user.id)
    if gp is None:
        db.add(
            GameProfile(
                user_id=user.id,
                faceit_player_id=prof.player_id,
                nickname=prof.nickname,
                steam_id=prof.steam_id,
                source="dev",
            )
        )
    resp = RedirectResponse("/", status_code=303)
    create_session(db, resp, state.settings, user, request.cookies.get(SESSION_COOKIE))
    return resp


# --- Session / identities ------------------------------------------------------------------------


@router.get("/me")
def me(db: Session = Depends(get_db), state: AppState = Depends(get_state), auth: Auth = Depends(get_auth)):
    providers = {
        "steam": {"configured": True},
        "faceit": {"configured": state.settings.faceit_oauth_configured},
        "dev": {"configured": bool(state.settings.auth_dev_login)},
    }
    if auth.user is None:
        return {"authenticated": False, "providers": providers}
    ids = db.scalars(select(Identity).where(Identity.user_id == auth.user.id)).all()
    gp = db.get(GameProfile, auth.user.id)
    return {
        "authenticated": True,
        "csrf_token": auth.session.csrf_token,
        "user": {"id": auth.user.id, "created_at": auth.user.created_at.isoformat()},
        "identities": [
            {
                "provider": i.provider,
                "subject": i.subject,
                "display_name": i.display_name,
                "verified_at": i.verified_at.isoformat(),
            }
            for i in ids
        ],
        "game_profile": None
        if gp is None
        else {
            "faceit_player_id": gp.faceit_player_id,
            "nickname": gp.nickname,
            "steam_id": gp.steam_id,
            "source": gp.source,
        },
        "providers": providers,
    }


@router.post("/logout")
def logout(request: Request, db: Session = Depends(get_db), auth: Auth = Depends(get_auth)):
    resp = RedirectResponse("/", status_code=303)
    destroy_session(db, request, resp)
    return resp


@router.delete("/identities/{provider}", status_code=204)
def unlink(provider: str, db: Session = Depends(get_db), auth: Auth = Depends(require_user)):
    ids = db.scalars(select(Identity).where(Identity.user_id == auth.user.id)).all()
    target = [i for i in ids if i.provider == provider]
    if not target:
        raise HTTPException(404, "Такой привязки нет")
    if len(ids) <= 1:
        raise HTTPException(409, "Нельзя отвязать единственный способ входа")
    for i in target:
        db.delete(i)
    gp = db.get(GameProfile, auth.user.id)
    if gp and (
        (provider == "faceit" and gp.source == "faceit_oauth")
        or (provider == "steam" and gp.source == "steam_lookup")
    ):
        db.delete(gp)
