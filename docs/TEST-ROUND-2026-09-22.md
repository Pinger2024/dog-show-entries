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
| 10 | Judges who aren't logged in can't open their results-approval link | `69abe6b3` | ☐ | ☐ | ☐ |
| 11 | An unpaid entry can be confirmed by paying only a class top-up | `4de36818` | ☐ | ☐ | ☐ |
| 12 | Guarantors' home addresses go out with public show data | `dcca581a` | ☐ | ☐ | ☐ |
| 13 | Secretary dog search returns every owner's address and phone | `1ef74f23` | ☐ | ☐ | ☐ |
| 14 | A rival can read a dog's show-day placings before they're published | `27610734` | ☐ | ☐ | ☐ |

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

---

## 10. A judge can't open their approval link unless they're logged in to Remi

**Who notices:** the judge, and the secretary chasing them. The "Review & Approve Results" link in the
judge's email went to the Remi login page for anyone not signed in (most judges), so approval stayed
"pending" forever.

**Reproduce (demo, before the fix):** submit a judge for approval, then open the emailed link in a
logged-out private window. **Before:** the login page. **After:** the results approval page with
**I Approve These Results**.

---

## 11. An unpaid entry can be confirmed by paying only a class top-up

**Who notices:** the club, which is short a full entry fee while the dog is in the catalogue. An exhibitor
who stopped at checkout's payment step has a "pending" entry. **Edit Classes** was offered on it; adding a
class charged only the extra class, and paying that confirmed the whole entry.

**Reproduce (demo, before the fix):** as an exhibitor, start an entry and stop at the card-payment step.
From the dashboard's **Payment needed** card open the entry. **Before:** **Edit Classes** is offered, and
adding a class asks for just the difference. **After:** no Edit Classes button. Going to the edit page
directly says "Only a paid entry can have its classes changed."

**Also check after the fix:** a paid entry can still add and remove classes while entries are open.

---

## 12. Guarantors' home addresses go out with public show data

**Who notices:** nobody, until someone looks. The addresses typed into Schedule settings for the
guarantors (never printed anywhere) were sent to every visitor of the show pages and inside exhibitors'
entry and order data.

**Reproduce (demo, before the fix):** give a demo show a guarantor with an address. Open the public show
page logged out, and in developer tools → **Network** look at `shows.getById` (or `shows.list` on the Shows
page). **Before:** the address is there. **After:** only the guarantor's name.

**Also check after the fix:** the secretary's Schedule settings still show and save guarantor addresses.

---

## 13. The secretary's dog search hands out owners' addresses and phone numbers

**Who notices:** nobody, until someone uses it. Anyone who registers a club becomes a secretary. The
dog search on **Add Entry** searches every dog on Remi and returned the owner's home address and phone.

**Reproduce (demo, before the fix):** Secretary → show → **Entries** → **Add Entry**, search for a dog
from another club, and look at `secretary.searchDogs` in developer tools → **Network**.
**Before:** `ownerAddress` and `ownerPhone` are there. **After:** only the owner's name and email.

**Also check after the fix:** the search still shows "Owner: …" and fills in the exhibitor's email.

---

## 14. A rival can read a dog's show-day placings before they're published

**Who notices:** exhibitors, who see results early. The results list on a dog's page (any logged-in user,
any dog) showed placings and critiques as soon as the steward keyed them in.

**Reproduce (demo, before the fix):** record a placing for a dog on an in-progress show without
publishing. Sign in as a different exhibitor and open that dog's page (`/dogs/<id>`).
**Before:** the placing is listed. **After:** it appears only once results are published. The dog's own
owner still sees it straight away.

---

## Found in the bug hunt but NOT fixed — needs a decision

The full list of findings, with evidence, is from the 22 Sept hunt. These are real, but the right
behaviour is a decision for Michael or Mandy, or they overlap unpushed work.

**Money: Edit Classes and refunds (Michael). One design decision unlocks most of these.**
- Removing a class refunds the difference **and** lowers the entry fee, so the refund is deducted twice.
  The secretary's "collected for you" figure comes out too low, and the club statement refuses to issue.
- A class top-up payment is never linked to its order. The statement refuses to issue, "Refund entire
  order" misses the top-up, and a later class removal can fail after the classes have already changed.
- Regional: editing a dog in an EARLIER order re-prices it behind the exhibitor's LATER dogs. That can
  refund money for a same-price swap and store a negative fee.
- RKC multi-dog package: removing a dog's last regular class refunds that dog but silently re-prices the
  others with no money moving.
- The secretary's per-entry Refund can be pressed twice for the same entry. The second refund comes out
  of the other dogs' money.
- A refund that fails at Stripe is still counted in the club statement. Should it count or not?

The decision: when a fee goes down, does `totalFee` stay the gross amount (with the refund recorded
separately, as issueRefund does), or go down (with the refund not counted)? This overlaps the unpushed
`one-owner-weekend` branch (entry-change-pricing.ts), so it's best built on top of that once it lands.

**Rules for Mandy**
- **Withdrawing after entries close or after the show:** the button is always offered. A late withdrawal
  removes the dog from the catalogue, the absentee list and SH01 (instead of marking it absent), and after
  the show it erases published placings. When should Withdraw stop, and should a late one mean "absent"?
- **Regional postal entries keyed by the secretary** for people without a Remi account are all counted as
  the SECRETARY's dogs on the multi-dog scale. The 3rd postal dog is priced £16 and the 4th onwards free,
  although each person paid in full. What makes two postal entries "the same exhibitor"?
- **Most Promising Dog/Bitch picker** offers the wrong sex (bitches for "Most Promising Dog"). Fixing it
  moves "Most Promising" onto the dog/bitch pages of the regional judges' book. Before Midland on 4 Oct?
- **Secretary dog search:** should it search only dogs already entered with the club, or keep searching
  every dog on Remi?
- **Grading cards print the show's name**, and Midland's is just "Regional Show". Should the card also
  print the club name?
- **Re-entering a withdrawn or refunded dog at a regional** is refused as "already entered". Allowed?
- **SH01:** is a dog absent from all her breed classes but shown in a Special Award class an absentee?

**Smaller, safe to do next (no decision needed)**
- The duplicate-class check looks at only one of a dog's entries, so a dog with two entry rows can be
  entered and charged for the same class twice. Touches the same code as Michael's
  `feat-entry-requirements-one-gate`.
- On all-breed shows, the Best in Show or group judge prints as the Junior Handling judge.
- The show-level steward pages still hand-write the "published" check (use `isVisibleToViewer`).
- Unpublishing results doesn't hide already-published award rows.

**Data fixes for prod (need an OK first)**
- Shows created in the new-show wizard close at 00:00 (bug 9). Checked prod read-only on 22 Sept: of the
  shows not yet completed, only the DRAFT "Winter Spectacular 2026" does (entry close 1 Nov 00:00, postal
  close 25 Oct 00:00). Midland (27 Sept 23:59) and North Eastern (28 Sept 23:59) are correct. Re-picking
  its dates after the fix sets 23:59, or it's a one-row production fix.
- Duplicate award holders from bug 7: checked prod read-only on 22 Sept and found **none**, and no
  hidden post-publish corrections either. Nothing to clean up. The SQL is in
  `docs/bug-hunt-2026-09-22-dup-award-holders.sql` for re-checking.
