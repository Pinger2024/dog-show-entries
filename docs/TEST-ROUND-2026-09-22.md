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
| 3 | Public show page hands every visitor the judge's approval token and contact details | `81d00039` | ☐ | ☐ | ☐ |
| 4 | Script can be injected into the judge approval page, judge contract page and prize-card print page | `fe392f50` | ☐ | ☐ | ☐ |
| 5 | Login can send you to any website, or run script, after signing in | `2f837499` | ☐ | ☐ | ☐ |
| 6 | Inviting someone can demote them (an admin invited as a steward stops being an admin) | `88ba3822` | ☐ | ☐ | ☐ |
| 7 | Correcting a Best award leaves two winners; a correction after publishing never goes public | `c3190424` | ☐ | ☐ | ☐ |
| 8 | Saving show details moves the entry close an hour earlier each time (summer time) | `0a8c0bf4` | ☐ | ☐ | ☐ |
| 9 | New shows close at 00:00 on the chosen date instead of 23:59 | `e0a3f6be` | ☐ | ☐ | ☐ |

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

---

## 3. The public show page gives away the judge's approval token and contact details

**Who notices:** nobody, until someone uses it. Anyone who opened a show's public page, even logged
out, received each judge's results-approval token (the only thing the approval link checks), and the
judge's personal email and phone. With the token, anyone with an account could read unpublished placings
and press "I approve" as if they were the judge.

**Reproduce (demo, before the fix):**
1. Use a show where a steward has pressed **Submit for judge approval** for a judge.
2. In a logged-out private window, open the show's public page. Open the browser's developer tools →
   **Network**, and click the `shows.getById` request.
3. **Before:** the response contains `approvalToken`, and the judge's `contactEmail` / `contactPhone`.
   **After:** those fields are `null`. The judge's name still shows.

**Also check after the fix:** the club's own secretary still sees the judge's email and phone in the judge
section.

---

## 4. Script injection on the pages Remi builds itself

**Who notices:** a judge or secretary who opens a booby-trapped page. Three pages built their HTML by
hand and put names in unescaped: the judge's **results approval** page (dog names, show and club names),
the **judge contract offer** page (show and club names, the secretary's notes), and the mobile
**prize-card print** page (the web address itself).

**Reproduce (demo, before the fix):**
1. Register a demo dog named `<b>Bold</b> Rex`, enter it, record a result, and submit that judge for
   approval. Open the approval link from the email.
   **Before:** "Bold" shows in bold. **After:** the name reads literally `<b>Bold</b> Rex`.
2. Logged in as a secretary, open
   `/api/prize-cards/x%22%3E%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E/print`.
   **Before:** an alert box pops up. **After:** no alert (the PDF frame is just empty).

**Also check after the fix:** the approval page, the contract page and prize-card printing all look
exactly as before with normal names. Also check a name with an `&` in it.

---

## 5. Login can send you anywhere after signing in

**Who notices:** a secretary who clicks a doctored login link. After a password sign-in the page went to
whatever `callbackUrl` said, including another website or a `javascript:` address.

**Reproduce (demo, before the fix):** log out, open `/login?callbackUrl=https://example.com` and sign in
with email and password. **Before:** you land on example.com. **After:** you land on your dashboard.

**Also check after the fix:** normal redirects still work. Open a protected page while logged out, sign in,
and you land back on that page. An invitation link's "log in" still returns you to the invitation.

---

## 6. An invitation could demote someone

**Who notices:** the person demoted. Inviting an existing account (or accepting an invitation) overwrote
their role. An admin invited as a steward stopped being an admin at their next sign-in. Another club's
secretary invited as a judge lost secretary access.

**Reproduce (demo, before the fix):** as a secretary, invite an existing demo **secretary** account (from
another club) as a **judge**, then sign in as that account.
**Before:** they no longer get the secretary pages. **After:** they are still a secretary.

**Also check after the fix:** inviting a plain exhibitor as a steward still makes them a steward. Adding a
steward on a show still works. Removing their last steward job still returns them to exhibitor.

---

## 7. Best Awards: two winners after a correction; corrections after Publish stay hidden

**Who notices:** everyone reading the results. Midland Regional's awards picker uses this on 4 Oct.

**Reproduce (demo, before the fix):**
1. Secretary → show → **Results** → **Best Awards**: pick **Best Dog** = dog A, then change it to dog B.
   **Before:** "2 recorded", and the public results page lists both dogs. "None" removes only one.
   **After:** "1 recorded", only B, and "None" clears it.
2. Untick **Send notification emails**, press **Publish Results**, then change Best Dog to dog C. Open the
   public results page in a logged-out window. **Before:** it still shows B (for a Dog CC, it shows
   nothing). **After:** C shows straight away. Press **Unpublish** afterwards to reset the demo show.

**Also check after the fix:** on a multi-breed show, recording Best of Breed for one breed no longer
removes another breed's.

---

## 8. Saving show details moves the entry close an hour earlier

**Who notices:** exhibitors turned away in the last hour, and the secretary, whose schedule says 23:59.
Happens for any show whose entries close in British Summer Time (late March to late October).

**Reproduce (demo, before the fix):** use a UK phone or laptop and a test show that closes in summer.
Secretary → show → **Edit** on the details card.
**Before:** the close time box shows **22:59** for a 23:59 close. Change anything harmless, Save, reopen:
it drops another hour each time, and the public page changes from "23:59" to "10:59pm", and so on.
**After:** it shows 23:59 and stays there however many times you save. Repeat in the setup wizard's
Details step.

---

## 9. New shows close at the START of the chosen day

**Who notices:** exhibitors, who lose the whole last day advertised. The founder rule (July) is "whatever
date they choose, it's 11:59pm".

**Reproduce (demo, before the fix):** create a new show and pick **Entries Close: 16 Aug**.
**Before:** the Review step shows just "16 Aug 2026", and the show is stored closing at 00:00 on the 16th
(Edit shows 00:00). **After:** Review shows **"16 Aug 2026 · 23:59"**, and Edit shows 23:59 on the 16th.

**Note:** shows already created this way still close at 00:00. Moving them to 23:59 is a production data
change, so it needs your OK first.
