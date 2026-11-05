"""Tests tennis : py -m unittest discover -s tests"""
from __future__ import annotations

import logging
import os
import sys
import tempfile
import time
import unittest
from datetime import datetime
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI.parent))

import donnees_tennis  # noqa: E402
import moteur  # noqa: E402
import strategies  # noqa: E402
from simul_tennis import ecrire_xlsx, generer, serial_excel  # noqa: E402

LOG = logging.getLogger("test-tennis")
LOG.addHandler(logging.NullHandler())


class TestLecture(unittest.TestCase):
    def test_xlsx_orientation_et_filtres(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / "2024.xlsx"
            ecrire_xlsx(f, [
                ["WTA", "Date", "Surface", "Winner", "Loser", "Wsets", "Lsets", "Comment", "PSW", "PSL", "AvgW", "AvgL"],
                ["1", serial_excel(datetime(2024, 3, 5)), "Hard", "Zeta Z.", "Alpha A.", 2, 1, "Completed", 1.5, 2.6, 1.45, 2.5],
                ["1", serial_excel(datetime(2024, 3, 6)), "Clay", "Alpha A.", "Beta B.", 2, 0, "Completed", 1.8, 2.0, "", ""],
                ["1", serial_excel(datetime(2024, 3, 7)), "Clay", "Gamma G.", "Beta B.", 1, 0, "Retired", 1.8, 2.0, 1.7, 2.0],
            ])
            lignes = donnees_tennis.lire_xlsx(f)
        self.assertEqual(donnees_tennis.circuit_du_fichier(lignes), "WTA")
        matchs, ignores = donnees_tennis.convertir(lignes, "WTA")
        self.assertEqual((len(matchs), ignores), (2, 1))  # l'abandon est exclu

        m = matchs[0]  # vainqueur « Zeta » rangé en 2e (ordre alphabétique) : cotes inversées
        self.assertEqual((m.domicile, m.exterieur, m.resultat), ("Alpha A.", "Zeta Z.", "2"))
        self.assertEqual(m.cotes["ps"], (2.6, 1.5))
        self.assertEqual(m.date, datetime(2024, 3, 5))
        self.assertEqual(m.contexte["surface"], "Hard")
        self.assertEqual((m.buts_dom, m.buts_ext), (1, 2))
        self.assertEqual(m.issues, ("1", "2"))
        self.assertEqual(m.libelle_issue(1), "Zeta Z.")

        m = matchs[1]  # vainqueur « Alpha » en 1er
        self.assertEqual((m.resultat, m.cotes["ps"]), ("1", (1.8, 2.0)))
        self.assertNotIn("avg", m.cotes)  # cotes vides -> absentes

    def test_importer(self):
        with tempfile.TemporaryDirectory() as tmp:
            telechargements, data = Path(tmp) / "dl", Path(tmp) / "data"
            generer(telechargements, "ATP", annees=(2024,), matchs_par_an=50)
            ecrire_xlsx(telechargements / "budget.xlsx", [["Mois", "Total"], ["Janvier", 12]])

            self.assertEqual(donnees_tennis.importer(telechargements, data, LOG, dry_run=True), 1)
            self.assertFalse(data.exists())  # dry-run : rien n'est copié

            self.assertEqual(donnees_tennis.importer(telechargements, data, LOG), 1)
            self.assertEqual(sorted(f.name for f in data.iterdir()), ["ATP_2024.xlsx"])
            self.assertTrue((telechargements / "2024.xlsx").exists())  # copie, pas déplacement
            self.assertEqual(donnees_tennis.importer(telechargements, data, LOG), 0)  # relançable : déjà à jour

            # Une version plus récente du fichier remplace l'ancienne
            nouveau = telechargements / "2024.xlsx"
            generer(telechargements, "ATP", annees=(2024,), matchs_par_an=60, graine=9)
            os.utime(nouveau, (time.time() + 60, time.time() + 60))
            self.assertEqual(donnees_tennis.importer(telechargements, data, LOG), 1)


class TestBacktestTennis(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        dl, data = Path(cls.tmp.name) / "dl", Path(cls.tmp.name) / "data"
        generer(dl, "ATP", annees=(2022, 2023, 2024))
        donnees_tennis.importer(dl, data, LOG)
        cls.matchs = donnees_tennis.charger(data, ["ATP"], ["2022", "2023", "2024"], LOG)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_chargement(self):
        self.assertGreater(len(self.matchs), 4000)
        self.assertTrue(all(m.sport == "tennis" for m in self.matchs))

    def test_pas_de_biais_d_orientation(self):
        """Parier toujours sur le « joueur 1 » ne doit rien rapporter : le vainqueur n'est pas mis en premier."""
        class Joueur1(strategies.Strategie):
            nom = "joueur1"

            def choisir(self, match, cotes):
                return strategies.Pari(0)

        res, _ = moteur.simuler(self.matchs, [Joueur1()], "avg", moteur.ParamsMise(bankroll=1e9))
        part = sum(1 for p in res[0].paris if p.gain > 0) / len(res[0].paris)
        self.assertTrue(0.45 < part < 0.55, part)

    def test_aucune_fuite_et_elo_apprend(self):
        noms = strategies.PAR_DEFAUT["tennis"].split(",")
        complet, _ = moteur.simuler(self.matchs, strategies.construire(noms), "max", moteur.ParamsMise(bankroll=1e9))
        coupure = self.matchs[len(self.matchs) // 2].jour
        debut = [m for m in self.matchs if m.jour < coupure]
        partiel, _ = moteur.simuler(debut, strategies.construire(noms), "max", moteur.ParamsMise(bankroll=1e9))
        for r_c, r_p in zip(complet, partiel):
            avant = [(p.date, p.match, p.issue) for p in r_c.paris if p.date.date() < coupure]
            self.assertEqual(avant, [(p.date, p.match, p.issue) for p in r_p.paris], r_c.strategie.nom)
            self.assertGreater(len(avant), 0, r_c.strategie.nom)

        q = moteur.qualite(complet[2])  # elo
        self.assertLess(q["modele"], 0.69)  # mieux qu'un pile ou face (log-loss 0,693)
        self.assertIsNone(moteur.statistiques(complet[0], 1e9)["clv_moyen"])  # pas de cotes de clôture au tennis

    def test_modeles_foot_ignorent_le_tennis(self):
        res, _ = moteur.simuler(self.matchs, strategies.construire(["poisson", "tirs"]), "avg", moteur.ParamsMise())
        self.assertEqual([len(r.paris) for r in res], [0, 0])


if __name__ == "__main__":
    unittest.main()
