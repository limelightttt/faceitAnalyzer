"""FACEIT Connect: OAuth2 authorization code flow with PKCE (S256) and client_secret_basic.

Login identity only — the FACEIT `guid` from userinfo is the verified subject. Access tokens are used once
server-side to read userinfo and are not stored or sent to the browser. Endpoints are configurable
(defaults follow FACEIT's published OpenID configuration).
"""

import base64
import hashlib
import secrets
from urllib.parse import urlencode

import httpx


def pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)[:96]
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


def authorize_url(
    base: str, client_id: str, redirect_uri: str, state: str, challenge: str, scopes: str
) -> str:
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": scopes,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "redirect_popup": "false",
    }
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}{urlencode(params)}"


class FaceitOAuthError(Exception):
    pass


async def exchange_and_fetch_user(
    token_url: str,
    userinfo_url: str,
    client_id: str,
    client_secret: str,
    code: str,
    redirect_uri: str,
    verifier: str,
    transport: httpx.AsyncBaseTransport | None = None,
) -> dict:
    async with httpx.AsyncClient(timeout=15, transport=transport) as client:
        try:
            tok = await client.post(
                token_url,
                auth=(client_id, client_secret),
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "code_verifier": verifier,
                },
            )
            if tok.status_code != 200:
                raise FaceitOAuthError(f"FACEIT отклонил код авторизации ({tok.status_code})")
            access = tok.json().get("access_token")
            if not access:
                raise FaceitOAuthError("FACEIT не вернул access_token")
            info = await client.get(userinfo_url, headers={"Authorization": f"Bearer {access}"})
        except httpx.HTTPError as exc:
            raise FaceitOAuthError("FACEIT недоступен") from exc
    if info.status_code != 200:
        raise FaceitOAuthError(f"FACEIT userinfo недоступен ({info.status_code})")
    data = info.json()
    guid = data.get("guid") or data.get("sub")
    if not guid:
        raise FaceitOAuthError("FACEIT userinfo без идентификатора")
    return {"guid": str(guid), "nickname": data.get("nickname"), "picture": data.get("picture")}
