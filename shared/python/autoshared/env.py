"""Chargement de la configuration .env, sans dépendance (équivalent Python de shared/env.ts).

Ordre de priorité (le premier gagne) :
  1. variables déjà présentes dans l'environnement
  2. .env de l'outil
  3. .env racine du dépôt
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable, Mapping

REPO_ROOT = Path(__file__).resolve().parents[3]


class MissingEnvError(RuntimeError):
    def __init__(self, missing: list[str], searched: list[str]):
        where = ", ".join(searched) if searched else "aucun fichier .env trouvé"
        super().__init__(
            f"Variable(s) d'environnement obligatoire(s) manquante(s) : {', '.join(missing)}\n"
            f"Fichiers lus : {where}\n"
            "→ Copie le .env.example en .env et renseigne ces valeurs."
        )
        self.missing = missing


def parse_env_file(path: Path) -> dict[str, str]:
    """Parse un fichier .env simple : KEY=VALUE, commentaires #, guillemets, préfixe export."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    # utf-8-sig retire le BOM ajouté par le Bloc-notes / Out-File.
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):]
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        values[key] = value
    return values


def load_env(
    tool_dir: str | Path | None = None,
    required: Iterable[str] = (),
    defaults: Mapping[str, str] | None = None,
    include_root: bool = True,
) -> dict[str, str]:
    """Charge les .env dans os.environ (sans écraser l'existant) et vérifie les obligatoires."""
    files: list[Path] = []
    if include_root:
        files.append(REPO_ROOT / ".env")
    if tool_dir is not None:
        tool_env = Path(tool_dir).resolve() / ".env"
        if tool_env not in files:
            files.append(tool_env)

    merged: dict[str, str] = {}
    searched: list[str] = []
    for file in files:  # du moins prioritaire au plus prioritaire
        if file.is_file():
            searched.append(str(file.relative_to(REPO_ROOT)) if file.is_relative_to(REPO_ROOT) else str(file))
        merged.update(parse_env_file(file))

    for key, value in merged.items():
        os.environ.setdefault(key, value)

    for key, value in (defaults or {}).items():
        if not os.environ.get(key):
            os.environ[key] = value

    required = list(required)
    missing = [k for k in required if not os.environ.get(k, "").strip()]
    if missing:
        raise MissingEnvError(missing, searched)

    keys = required + list((defaults or {}).keys())
    return {k: os.environ[k] for k in keys}


def env_bool(name: str, fallback: bool = False) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return fallback
    return raw in {"true", "1", "yes", "oui", "on"}


def env_int(name: str, fallback: int | None = None) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        if fallback is None:
            raise MissingEnvError([name], [])
        return fallback
    try:
        return int(raw)
    except ValueError:
        raise ValueError(f'{name} doit être un entier (reçu : "{raw}")') from None


def env_float(name: str, fallback: float | None = None) -> float:
    raw = os.environ.get(name, "").strip().replace(",", ".")
    if not raw:
        if fallback is None:
            raise MissingEnvError([name], [])
        return fallback
    try:
        return float(raw)
    except ValueError:
        raise ValueError(f'{name} doit être un nombre (reçu : "{raw}")') from None


def env_list(name: str, fallback: Iterable[str] = ()) -> list[str]:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return list(fallback)
    return [part.strip() for part in raw.split(",") if part.strip()]
