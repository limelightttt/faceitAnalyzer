from pathlib import Path

import pytest

from app.config import get_settings
from app.providers.fixtures import FixtureProvider

ROOT = Path(__file__).resolve().parents[2]
SAMPLE_DEMO = ROOT / "samples" / "test_demo_mirage.dem"


@pytest.fixture(scope="session")
def fixtures_provider() -> FixtureProvider:
    return FixtureProvider(get_settings().fixtures_dir)


@pytest.fixture
def data_dir(tmp_path) -> Path:
    return tmp_path
