"""Logger minimal : console + logs/<outil>/AAAA-MM-JJ.log (équivalent Python de shared/logger.ts).

Variables lues (facultatives) : LOG_LEVEL (debug|info|warn|error), LOG_DIR.
"""
from __future__ import annotations

import logging
import os
import sys
from datetime import date
from pathlib import Path

from .env import REPO_ROOT

_FORMAT = "%(asctime)s [%(levelname)-5s] %(message)s"
_DATEFMT = "%Y-%m-%d %H:%M:%S"
_LEVELS = {"debug": logging.DEBUG, "info": logging.INFO, "warn": logging.WARNING,
           "warning": logging.WARNING, "error": logging.ERROR}

logging.addLevelName(logging.WARNING, "WARN")


def get_logger(name: str, log_dir: str | Path | None = None, to_file: bool = True) -> logging.Logger:
    """Crée (ou récupère) le logger d'un outil. Appeler APRÈS load_env()."""
    logger = logging.getLogger(f"autom.{name}")
    if logger.handlers:
        return logger

    level = _LEVELS.get(os.environ.get("LOG_LEVEL", "info").strip().lower(), logging.INFO)
    logger.setLevel(level)
    logger.propagate = False
    formatter = logging.Formatter(_FORMAT, _DATEFMT)

    console = logging.StreamHandler(sys.stderr)
    console.setFormatter(formatter)
    logger.addHandler(console)

    if to_file:
        base = Path(log_dir or os.environ.get("LOG_DIR") or REPO_ROOT / "logs")
        try:
            folder = base / name
            folder.mkdir(parents=True, exist_ok=True)
            file_handler = logging.FileHandler(folder / f"{date.today():%Y-%m-%d}.log", encoding="utf-8")
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
        except OSError as err:  # un problème de fichier ne doit pas faire planter l'outil
            logger.warning("Écriture des logs impossible dans %s : %s", base, err)

    return logger
