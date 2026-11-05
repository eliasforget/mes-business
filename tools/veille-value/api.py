"""Client minimal The Odds API v4 (https://the-odds-api.com), bibliothèque standard uniquement.

Coût en crédits (plan gratuit : 500 / mois) :
  - /odds   : 1 crédit par appel (1 marché h2h, ≤ 10 bookmakers listés = 1 « région »)
  - /scores : 2 crédits avec daysFrom
  - /sports : gratuit
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Callable

BASE = "https://api.the-odds-api.com/v4"
USER_AGENT = "automatisations-veille-value/1.0"

# Une fonction qui fait la requête HTTP : (url) -> (code, en-têtes, corps). Remplaçable dans les tests.
Transport = Callable[[str], tuple[int, dict[str, str], bytes]]


def transport_http(url: str) -> tuple[int, dict[str, str], bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as rep:
            return rep.status, {k.lower(): v for k, v in rep.headers.items()}, rep.read()
    except urllib.error.HTTPError as err:
        return err.code, {k.lower(): v for k, v in err.headers.items()}, err.read()


class ErreurApi(RuntimeError):
    pass


class CreditsInsuffisants(ErreurApi):
    pass


@dataclass
class ClientOdds:
    cle: str
    reserve: int = 25                 # on s'arrête avant de descendre sous ce nombre de crédits
    transport: Transport = transport_http
    pause: float = 1.0
    restants: int | None = None       # mis à jour après chaque appel (en-tête x-requests-remaining)
    utilises_session: int = 0
    _dernier_appel: float = field(default=0.0, repr=False)

    def _get(self, chemin: str, params: dict[str, str], cout: int) -> object:
        if self.restants is not None and self.restants - cout < self.reserve:
            raise CreditsInsuffisants(
                f"Il reste {self.restants} crédits (réserve {self.reserve}) : appel annulé pour ne pas épuiser le quota.")
        attente = self.pause - (time.monotonic() - self._dernier_appel)
        if attente > 0:
            time.sleep(attente)
        url = f"{BASE}{chemin}?{urllib.parse.urlencode({**params, 'apiKey': self.cle})}"
        code, entetes, corps = self.transport(url)
        self._dernier_appel = time.monotonic()
        if "x-requests-remaining" in entetes:
            try:
                self.restants = int(float(entetes["x-requests-remaining"]))
            except ValueError:
                pass
        if "x-requests-last" in entetes:
            try:
                self.utilises_session += int(float(entetes["x-requests-last"]))
            except ValueError:
                pass
        if code == 401:
            raise ErreurApi("Clé API refusée (401) : vérifie ODDS_API_KEY dans le .env.")
        if code == 429:
            raise CreditsInsuffisants("Quota épuisé ou trop de requêtes (429).")
        if code >= 400:
            # Le message d'erreur de l'API ne contient pas la clé ; l'URL, si, donc on ne l'affiche jamais.
            raise ErreurApi(f"Erreur {code} sur {chemin} : {corps[:200].decode('utf-8', 'replace')}")
        return json.loads(corps.decode("utf-8"))

    def sports(self) -> list[dict]:
        return self._get("/sports", {}, cout=0)  # type: ignore[return-value]

    def cotes(self, sport: str, bookmakers: list[str]) -> list[dict]:
        if len(bookmakers) > 10:
            raise ValueError("Au-delà de 10 bookmakers, l'appel coûte 2 crédits : limite-toi à 10.")
        return self._get(f"/sports/{sport}/odds", {"bookmakers": ",".join(bookmakers), "markets": "h2h",
                                                    "oddsFormat": "decimal", "dateFormat": "iso"}, cout=1)  # type: ignore[return-value]

    def scores(self, sport: str, jours: int = 3) -> list[dict]:
        return self._get(f"/sports/{sport}/scores", {"daysFrom": str(jours), "dateFormat": "iso"}, cout=2)  # type: ignore[return-value]
