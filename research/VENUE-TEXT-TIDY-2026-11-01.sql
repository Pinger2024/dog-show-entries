-- Venue text tidy — the existing rows
-- Michael, 1 Nov 2026.
--
-- The code fix stops NEW dirt: `createVenue` now runs every venue name,
-- address and postcode through `tidyTypedText` (src/lib/typed-text.ts) before
-- it is validated or stored. It does nothing for rows already saved, and
-- those rows are what print on a club's RKC schedule today.
--
-- Found on production, on four of the eight shows the public feed lists:
--
--   'Langley Burrell Village Hall '                              trailing space
--   'Outpaw Pursuits, '                                          trailing comma
--   'St Aidens Terrace, Deaf Hill, Trimdon Station Co, Durham,'  trailing comma
--   'Welfare Ground, Murton, Seaham, County Durham '             trailing space
--
-- I have NOT run any of this. It is a production write, so it is yours.
--
-- The expression below is the same rule as `tidyTypedText`, in SQL: collapse
-- any run of whitespace to one space, trim the ends, drop a trailing comma or
-- semicolon, trim again. It is idempotent — running it twice changes nothing
-- the second time — and it is set-based rather than four hand-written row
-- updates, so it also catches dirt on venues that no public show currently
-- points at.

-- ── 1. LOOK FIRST. Nothing is written by this. ───────────────────────────────
-- Expect four rows. If you see a row whose "after" value looks wrong, stop and
-- tell me rather than editing the expression — the rule is shared with the
-- code and they must not drift apart.

WITH tidied AS (
  SELECT
    id,
    name,
    address,
    postcode,
    btrim(regexp_replace(btrim(regexp_replace(name,     '\s+', ' ', 'g')), '[,;]+$', '')) AS name_after,
    btrim(regexp_replace(btrim(regexp_replace(address,  '\s+', ' ', 'g')), '[,;]+$', '')) AS address_after,
    btrim(regexp_replace(btrim(regexp_replace(postcode, '\s+', ' ', 'g')), '[,;]+$', '')) AS postcode_after
  FROM venues
)
SELECT id, name, name_after, address, address_after, postcode, postcode_after
FROM tidied
WHERE name     IS DISTINCT FROM name_after
   OR address  IS DISTINCT FROM address_after
   OR postcode IS DISTINCT FROM postcode_after
ORDER BY name;

-- ── 2. THEN WRITE. ──────────────────────────────────────────────────────────
-- Venue rows are referenced by shows, not copied into them, so this changes
-- what every future render prints. Documents already rendered and stored do
-- NOT re-render on a data change — a catalogue or schedule PDF sitting in
-- storage keeps the old text until it is regenerated. Nothing in flight
-- depends on these strings.

BEGIN;

UPDATE venues SET
  name     = btrim(regexp_replace(btrim(regexp_replace(name,     '\s+', ' ', 'g')), '[,;]+$', '')),
  address  = btrim(regexp_replace(btrim(regexp_replace(address,  '\s+', ' ', 'g')), '[,;]+$', '')),
  postcode = btrim(regexp_replace(btrim(regexp_replace(postcode, '\s+', ' ', 'g')), '[,;]+$', ''))
WHERE name     IS DISTINCT FROM btrim(regexp_replace(btrim(regexp_replace(name,     '\s+', ' ', 'g')), '[,;]+$', ''))
   OR address  IS DISTINCT FROM btrim(regexp_replace(btrim(regexp_replace(address,  '\s+', ' ', 'g')), '[,;]+$', ''))
   OR postcode IS DISTINCT FROM btrim(regexp_replace(btrim(regexp_replace(postcode, '\s+', ' ', 'g')), '[,;]+$', ''));

-- Re-run the SELECT from part 1 here. It should return no rows.
-- Then COMMIT; (or ROLLBACK; if it does not).

COMMIT;

-- ── 3. remi_demo too ────────────────────────────────────────────────────────
-- The demo database carries its own copy of this data, so the same UPDATE
-- wants running there, or the demo keeps showing the trailing comma while
-- production is clean.
