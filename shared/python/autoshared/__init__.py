"""Utilitaires partagés pour les outils Python du dépôt (stdlib uniquement).

Usage depuis tools/<outil>/main.py :

    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "shared" / "python"))
    from autoshared import load_env, get_logger
"""
from .env import (MissingEnvError, REPO_ROOT, env_bool, env_float, env_int, env_list,
                  load_env, parse_env_file)
from .logger import get_logger

__all__ = ["MissingEnvError", "REPO_ROOT", "env_bool", "env_float", "env_int", "env_list",
           "load_env", "parse_env_file", "get_logger"]
