"""Tests for hooks/museum.py. Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import os
import subprocess
import sys
import tempfile
import unittest
import json

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "hooks"))
import museum  # noqa: E402

SCRIPT = os.path.join(HERE, "..", "hooks", "museum.py")


class Painting(unittest.TestCase):
    def test_title_artist_year_room(self):
        p = museum.parse_painting("/x/Odyssey/Ulysses Deriding Polyphemus, J.M.W. Turner (1829).jpg")
        self.assertEqual(p, {"title": "Ulysses Deriding Polyphemus", "artist": "J.M.W. Turner", "year": "1829", "room": "Odyssey"})

    def test_detail_and_brackets_in_title(self):
        p = museum.parse_painting("/x/A/The Battle of Arbela (Gaugamela), Charles Le Brun (1669) - detail.jpg")
        self.assertEqual((p["title"], p["artist"], p["year"]), ("The Battle of Arbela (Gaugamela) (detail)", "Charles Le Brun", "1669"))

    def test_loose_years_and_plain_names(self):
        self.assertEqual(museum.parse_painting("/x/A/Achilles Slays Hector, Rubens (c. 1630–35).jpg")["year"], "c. 1630–35")
        self.assertEqual(museum.parse_painting("/x/a/Plain.jpg")["title"], "Plain")
        self.assertIsNone(museum.parse_painting(""))


class Reminders(unittest.TestCase):
    def run_cli(self, note, *args):
        env = dict(os.environ, USAGE_GRID_REMINDERS=note)
        out = subprocess.run([sys.executable, "-I", SCRIPT, *args], capture_output=True, text=True, env=env, check=True)
        return json.loads(out.stdout)

    def test_add_list_done(self):
        with tempfile.TemporaryDirectory() as d:
            note = os.path.join(d, "R.md")
            self.assertEqual(self.run_cli(note, "add", "Run install.sh ([[project-x]])")["reminders"], ["Run install.sh"])
            self.assertEqual(self.run_cli(note, "add", "Allow **Accessibility**")["reminders"], ["Run install.sh", "Allow Accessibility"])
            got = self.run_cli(note, "done", "1")
            self.assertTrue(got["ok"])
            self.assertEqual(got["reminders"], ["Allow Accessibility"])
            self.assertFalse(self.run_cli(note, "done", "5")["ok"])
            text = open(note, encoding="utf-8").read()
            self.assertIn("- [x] ", text)
            self.assertIn("## Open", text)

    def test_clean(self):
        self.assertEqual(museum.clean("2026-11-11 · Paste the [[Q's Assistant|assistant]] prompt ([[Q's Assistant]])"), "Paste the assistant prompt")


if __name__ == "__main__":
    unittest.main()
