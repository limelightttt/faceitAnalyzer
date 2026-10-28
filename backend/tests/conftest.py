from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import create_app
from app.providers.faceit_api import FaceitApiProvider
from app.providers.fixtures import FixtureProvider

ROOT = Path(__file__).resolve().parents[2]
SAMPLE_DEMO = ROOT / "samples" / "test_demo_mirage.dem"


@pytest.fixture(scope="session")
def fixtures_provider() -> FixtureProvider:
    return FixtureProvider(get_settings().fixtures_dir)


@pytest.fixture
def data_dir(tmp_path) -> Path:
    return tmp_path


def make_settings(tmp: Path, **kw) -> Settings:
    base = dict(
        data_dir=tmp,
        app_base_url="http://localhost:8000",
        faceit_provider="fixtures",
        require_login=False,
        tracking_interval_minutes=0,  # background jobs are tested directly, never on a timer
        prediction_check_minutes=0,
        sample_demos_dir=get_settings().sample_demos_dir,
        fixtures_dir=get_settings().fixtures_dir,
    )
    base.update(kw)
    return Settings(_env_file=None, **base)


@pytest.fixture
def world_app(tmp_path):
    """App wired to the mock FACEIT HTTP API through the real FaceitApiProvider."""
    from tests.support.mock_faceit import create_mock

    mock = create_mock()
    provider = FaceitApiProvider(
        "test-key",
        "http://mock/data/v4",
        tmp_path / "cache",
        rate=1000,
        transport=httpx.ASGITransport(app=mock),
    )
    app = create_app(make_settings(tmp_path, auth_dev_login=True, faceit_provider="api"), provider=provider)
    with TestClient(app, base_url="http://localhost:8000") as client:
        yield client, mock.state.world, mock


def login(client: TestClient, nickname: str) -> str:
    r = client.post("/api/auth/dev-login", json={"faceit_nickname": nickname}, follow_redirects=False)
    assert r.status_code == 303, r.text
    me = client.get("/api/auth/me").json()
    assert me["authenticated"]
    return me["csrf_token"]
