"""Load configs/drone_config.yaml and resolve project-relative paths."""

import copy
from pathlib import Path

import yaml

from drone import PROJECT_ROOT

DEFAULT_CONFIG = PROJECT_ROOT / "configs" / "drone_config.yaml"


def _deep_update(base, updates):
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            _deep_update(base[key], value)
        else:
            base[key] = value
    return base


def load_config(path=None, overrides=None):
    path = Path(path) if path else DEFAULT_CONFIG
    with open(path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    if overrides:
        _deep_update(cfg, copy.deepcopy(overrides))
    return cfg


def resolve_path(p):
    """Paths in the config are relative to the project root."""
    p = Path(p)
    return p if p.is_absolute() else PROJECT_ROOT / p
