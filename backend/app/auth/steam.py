"""Steam OpenID 2.0 (https://steamcommunity.com/dev): login identity only, no secret required.

Verification follows the OpenID 2.0 spec: the positive assertion is sent back to Steam with
mode=check_authentication and must answer `is_valid:true`; claimed_id must be a Steam community id URL;
return_to must match ours exactly; our own single-use `state` (bound to the browser) prevents replay/login CSRF.
"""

import re
from urllib.parse import urlencode

import httpx

OPENID_NS = "http://specs.openid.net/auth/2.0"
IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select"
REQUIRED_SIGNED = {"op_endpoint", "claimed_id", "identity", "return_to", "response_nonce", "assoc_handle"}
CLAIMED_RE = re.compile(r"^https://steamcommunity\.com/openid/id/(7656119\d{10})$")


def login_url(endpoint: str, return_to: str, realm: str) -> str:
    params = {
        "openid.ns": OPENID_NS,
        "openid.mode": "checkid_setup",
        "openid.return_to": return_to,
        "openid.realm": realm,
        "openid.identity": IDENTIFIER_SELECT,
        "openid.claimed_id": IDENTIFIER_SELECT,
    }
    return f"{endpoint}?{urlencode(params)}"


class SteamVerificationError(Exception):
    pass


async def verify(
    endpoint: str,
    params: dict[str, str],
    expected_return_to: str,
    transport: httpx.AsyncBaseTransport | None = None,
) -> str:
    if params.get("openid.mode") != "id_res":
        raise SteamVerificationError("Steam не подтвердил вход")
    if params.get("openid.op_endpoint") != endpoint:
        raise SteamVerificationError("Неверный OpenID provider")
    if params.get("openid.return_to") != expected_return_to:
        raise SteamVerificationError("return_to не совпадает")
    m = CLAIMED_RE.match(params.get("openid.claimed_id", ""))
    if not m or params.get("openid.identity") != params.get("openid.claimed_id"):
        raise SteamVerificationError("Некорректный claimed_id")
    if params.get("openid.ns") != OPENID_NS:
        raise SteamVerificationError("Неверная версия OpenID")
    # OpenID 2.0 §11.4: check_authentication only proves the *signed* fields. If claimed_id/return_to were not
    # signed, an attacker could take their own valid assertion and swap in someone else's SteamID.
    signed = set(params.get("openid.signed", "").split(","))
    missing = REQUIRED_SIGNED - signed
    if missing:
        raise SteamVerificationError("Ответ Steam не подписывает обязательные поля")
    check = {k: v for k, v in params.items() if k.startswith("openid.")}
    check["openid.mode"] = "check_authentication"
    async with httpx.AsyncClient(timeout=15, transport=transport) as client:
        try:
            resp = await client.post(endpoint, data=check)
        except httpx.HTTPError as exc:
            raise SteamVerificationError("Steam недоступен для проверки входа") from exc
    if resp.status_code != 200 or "is_valid:true" not in resp.text:
        raise SteamVerificationError("Steam не подтвердил подпись")
    return m.group(1)
