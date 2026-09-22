# Bug hunt, 22 September 2026 — log for the testing round

Branch `bug-hunt-2026-09-22` (worktree `../dse-bugfix-0922`), started from `main` at `0a6516be`,
which is what is live. **Nothing here is on demo or pushed yet.**

How each bug goes through testing (Michael's loop):

1. **Reproduce** it on demo, which doesn't have the fix yet, using the steps below.
2. Merge this branch into demo and **re-test** until you can see it's fixed.
3. Push only after that OK.

Every fix below comes with a test that was run against the old code and seen to fail, plus a guard
test that fails if the rule is written down a second time.

| # | Bug | Commit | Reproduced | Fixed on demo | Pushed |
|---|-----|--------|-----------|---------------|--------|
| 1 | SV graded results list a dog who was absent from her class as present, if she was shown in a Special Award class | `eae91bea` | ☐ | ☐ | ☐ |
| 2 | A late class added by the secretary on a locked show gives the dog a second catalogue number | `75848df9` | ☐ | ☐ | ☐ |

---

## 1. SV graded results: an absent dog shows as present

**Who notices:** the regional show secretary, the club and the judges. The "SV Graded Results" PDF and
spreadsheet are the official results for a regional. Midland Regional is on 4 Oct.

**What goes wrong:** a dog is marked absent from her graded (age) class but is shown and placed in a
Special Award class. The report lists her in her graded class with no grade, as if she had been
present, when she should be "Abs 90". The header's Present count and absentee % are also wrong.

**Why:** absence is recorded per class. The report read the entry-wide flag, which is only set when
the dog missed *every* class.

**Reproduce (demo, before the fix):**
1. Use a regional (WUSV) show that has a Special Award class, with a dog entered in an age class and
   in the Special Award class.
2. As steward, open the age class and mark that dog **absent**.
3. Open the Special Award class and give the same dog a placing.
4. As secretary: show → **Documents** → **SV Graded Results** → View (also download the spreadsheet).
5. **Before the fix:** the dog is listed in her age class with no grade and no "Abs". **After:** she is
   "Abs 90" in grey, and the header counts her as absent.

**Also check after the fix:** a dog absent from *every* class still shows as "Abs". A normal graded dog
is unchanged. Junior Handling placings still print.

---

## 2. A dog gets two catalogue numbers after a late manual entry

**Who notices:** everyone who holds a printed document. The same dog prints twice under two numbers
in the catalogue, judges book and ring numbers.

**What goes wrong:** once numbers are locked for printing, a secretary adds a class for a dog that
already has a number (for example a Special Award class). The new entry gets the next number, instead
of the number that dog already holds.

**Why:** manual entry worked out "highest number + 1" itself, without checking the dog. Every other
path uses the shared numbering function, which does check. Manual entry now uses it too.

**Reproduce (demo, before the fix):**
1. Use a show with entries closed and at least one entered dog. Note that dog's catalogue number.
2. Secretary: show → **Catalogue** → **Lock for printing**.
3. Show → **Entries** → **Add Entry**. Pick the same dog and a class it isn't in yet (for example a
   Special Award class). Save.
4. **Before the fix:** the new entry has a new number (highest + 1). **After:** it has the dog's
   existing number, and no other number moves.

**Also check after the fix:** a *new* dog added while locked still gets the next number at the end.
While numbers are *not* locked, a manual entry still slots into class order.
