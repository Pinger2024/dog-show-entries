/* DESIGN REFERENCE ONLY — not part of the app build.
   Source: claude.ai/design project "Remi" → "Remi Show Experience.html" → remi/green-journey.jsx
   Approved visual design for BROWSE → ENTER → CONFIRMED (mobile) + DESKTOP show page.
   Shares tokens/kit with green-live.jsx (G = same palette; H/BODY = Hanken Grotesk). */
/* global React, I, Phone, HomeBar, Browser, ClubLogo */
(function () {
  const G = window.GreenLive.tokens;
  const K = window.GreenLive.kit;
  const { H, BODY, Eyebrow, Wordmark, Btn, Chip, Card, SecLabel, Pulse, Countdown } = K;
  const money = (v) => "£" + v;
  const R = () => window.REMI;
  const SC = () => window.REMI.showcase;

  // ════════════════════════════════════════ BROWSE (mobile)
  function ShowCard({ sh, first }) {
    const stat = {
      closing: { label: `Closes in ${sh.daysLeft}d`, ic: I.clock, tone: "honey" },
      open: { label: "Entries open", ic: null, tone: "fresh" },
      opening: { label: sh.opensText || "Opening soon", ic: null, tone: "light" },
      results: { label: "Results in", ic: I.trophy, tone: "light" },
    }[sh.status];
    const toneBg = { honey: [G.honeySoft, G.honeyDeep], fresh: [G.freshSoft, G.freshDeep], light: [G.surface, G.ink2] }[stat.tone];
    return (
      <Card style={{ padding: 14, display: "flex", gap: 13, border: `1px solid ${first ? G.freshLine : G.line}` }}>
        <div style={{ width: 58, flexShrink: 0, textAlign: "center", background: first ? G.freshSoft : G.paper2, borderRadius: 12, padding: "10px 0", alignSelf: "flex-start" }}>
          <div style={{ ...H, fontWeight: 700, fontSize: 24, color: first ? G.freshDeep : G.ink, lineHeight: 0.95 }}>{sh.dayNum}</div>
          <div style={{ ...BODY, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: G.ink3, marginTop: 2 }}>{sh.monthShort}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...H, fontWeight: 700, fontSize: 17, color: G.ink, lineHeight: 1.1 }}>{sh.club}</div>
          <div style={{ ...BODY, fontSize: 12.5, color: G.ink3, marginTop: 2 }}>{sh.name} · {sh.scope}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 24, padding: "0 9px", borderRadius: 99, ...BODY, fontSize: 11.5, fontWeight: 600, background: toneBg[0], color: toneBg[1], boxShadow: stat.tone === "light" ? `inset 0 0 0 1px ${G.line}` : "none" }}>
              {stat.tone === "fresh" && <Pulse />}{stat.ic && React.cloneElement(stat.ic, { size: 12 })}{stat.label}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, ...BODY, fontSize: 12, color: G.ink2 }}>{React.cloneElement(I.pin, { size: 12 })} {sh.town}</span>
            {sh.status !== "results" && sh.status !== "opening" && <span style={{ marginLeft: "auto", ...BODY, fontSize: 12.5, color: G.ink2 }}>from <b style={{ ...H, fontWeight: 700, color: G.freshDeep, fontSize: 15 }}>{money(sh.fee)}</b></span>}
          </div>
        </div>
      </Card>
    );
  }
  function Browse() {
    return (
      <div style={{ overflow: "hidden", color: G.ink }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 18px 10px" }}>
          <Wordmark size={20} />
        </div>
        <div style={{ padding: "6px 18px 14px" }}>
          <h1 style={{ ...H, fontSize: 31, color: G.ink, margin: 0, lineHeight: 1.05 }}>Shows near you</h1>
          <div style={{ ...BODY, fontSize: 13.5, color: G.ink3, marginTop: 4 }}>Scotland · within 60 miles</div>
        </div>
        <div style={{ display: "flex", gap: 8, padding: "0 18px 16px", overflow: "hidden" }}>
          <Chip tone="fresh" style={{ height: 32 }}>{React.cloneElement(I.filter, { size: 14 })} All shows</Chip>
          <Chip style={{ height: 32 }}>Open Show</Chip>
          <Chip style={{ height: 32 }}>GSD</Chip>
          <Chip style={{ height: 32 }}>This month</Chip>
        </div>
        <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {R().shows.map((sh) => <ShowCard key={sh.id} sh={sh} first={sh.featured} />)}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════ ENTER (mobile) — real eligibility
  function Enter() {
    const s = R().show, dog = R().dog, classes = R().classes;
    const selected = { c7: true, c8: true };
    const sel = classes.filter((c) => selected[c.id] && c.eligible);
    const total = sel.length ? Number(s.fees.first) + (sel.length - 1) * Number(s.fees.subsequent) : 0;
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", color: G.ink }}>
        <div style={{ padding: "4px 16px 12px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: G.ink2, fontSize: 13.5, fontWeight: 500, ...BODY }}>{React.cloneElement(I.chevLeft, { size: 18 })} Back</span>
            <span style={{ ...BODY, fontSize: 12.5, color: G.ink3, fontWeight: 600 }}>Step 2 of 4</span>
          </div>
          <div style={{ display: "flex", gap: 5, marginTop: 12 }}>{[1, 1, 0, 0].map((f, i) => <div key={i} style={{ flex: 1, height: 4, borderRadius: 3, background: f ? G.fresh : G.line2 }} />)}</div>
          <h1 style={{ ...H, fontSize: 25, margin: "14px 0 0" }}>Choose classes</h1>
          {/* dog summary card w/ Change action */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, background: G.surface, border: `1px solid ${G.line}`, borderRadius: 12, padding: "10px 13px" }}>
            <span style={{ color: G.freshDeep, display: "flex" }}>{React.cloneElement(I.dog, { size: 20 })}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...H, fontWeight: 700, fontSize: 15, lineHeight: 1.1 }}>{dog.name}</div>
              <div style={{ ...BODY, fontSize: 12, color: G.ink3 }}>{dog.breed} · {dog.sex} · {dog.age}</div>
            </div>
            <span style={{ ...BODY, fontSize: 12.5, color: G.freshDeep, fontWeight: 600 }}>Change</span>
          </div>
          {/* recommendation banner — honey, multi-class suggestion with reason */}
          <div style={{ marginTop: 12, background: G.honeySoft, border: "1px solid #f0dcae", borderRadius: 12, padding: "11px 13px", display: "flex", gap: 10 }}>
            <span style={{ color: G.honeyDeep, display: "flex", flexShrink: 0, marginTop: 1 }}>{React.cloneElement(I.star, { size: 18 })}</span>
            <div>
              <div style={{ ...H, fontWeight: 700, fontSize: 13, color: G.honeyDeep }}>Recommended for {dog.pet}</div>
              <div style={{ ...BODY, fontSize: 12.5, color: G.ink2, lineHeight: 1.45, marginTop: 2 }}>From his age (<b>{dog.age}</b>) and win record we suggest <b>Graduate</b> &amp; <b>Post Graduate</b>. Classes he's not eligible for are locked, so no wasted entries.</div>
            </div>
          </div>
        </div>
        <div style={{ flex: "0 0 auto", padding: "2px 16px 8px" }}>
          <div style={{ background: G.surface, border: `1px solid ${G.line}`, borderRadius: 14, padding: "2px 14px" }}>
            {classes.map((c, i) => {
              const on = selected[c.id];
              const isFirst = on && sel.length && c.id === sel[0].id;
              if (!c.eligible) {
                /* LOCKED row: dimmed, lock icon in the checkbox slot, reason pill on the right.
                   PRODUCTION NOTE: only for CERTAIN ineligibility (age/sex/coat).
                   Achievement classes stay selectable w/ advisory badge (existing behavior). */
                return (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderTop: i ? `1px solid ${G.line}` : "none", opacity: 0.5 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 7, boxShadow: `inset 0 0 0 1.5px ${G.line2}`, display: "flex", alignItems: "center", justifyContent: "center", color: G.ink3, flexShrink: 0 }}>{React.cloneElement(I.lock, { size: 12 })}</div>
                    <div style={{ flex: 1, ...BODY, fontSize: 14.5, fontWeight: 500, color: G.ink3 }}>{c.n}. {c.short}</div>
                    <span style={{ ...BODY, fontSize: 11, fontWeight: 600, color: G.ink3, background: G.paper2, borderRadius: 99, padding: "3px 9px", whiteSpace: "nowrap" }}>{c.reason}</span>
                  </div>
                );
              }
              return (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderTop: i ? `1px solid ${G.line}` : "none" }}>
                  <div style={{ width: 24, height: 24, borderRadius: 7, background: on ? G.green : G.surface, boxShadow: on ? "none" : `inset 0 0 0 1.5px ${G.line2}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}>{on && React.cloneElement(I.check, { size: 15 })}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...BODY, fontSize: 14.5, fontWeight: on ? 600 : 500, color: G.ink }}>{c.n}. {c.short}</div>
                    {c.recommended && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4, ...BODY, fontSize: 10.5, fontWeight: 700, color: G.honeyDeep, background: G.honeySoft, borderRadius: 99, padding: "2px 8px" }}>{React.cloneElement(I.star, { size: 11 })} Recommended</span>}
                  </div>
                  <div style={{ ...H, fontSize: 14.5, fontWeight: 700, color: on ? G.freshDeep : G.ink3 }}>{isFirst ? money(s.fees.first) : on ? money(s.fees.subsequent) : money(c.fee)}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, ...BODY, fontSize: 12.5, color: G.ink3, justifyContent: "center" }}>{React.cloneElement(I.info, { size: 14 })} First class {money(s.fees.first)}, each extra {money(s.fees.subsequent)}</div>
        </div>
        <div style={{ flex: 1, minHeight: 8 }} />
        {/* sticky bottom bar: count + total + CTA (production keeps "Add to Cart" semantics) */}
        <div style={{ flexShrink: 0, background: G.surface, borderTop: `1px solid ${G.line2}`, padding: "12px 16px 6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ ...BODY, fontSize: 12, color: G.ink3 }}>{sel.length} classes · {dog.pet}</div>
              <div style={{ ...H, fontWeight: 700, fontSize: 26, color: G.ink, lineHeight: 1 }}>{money(total.toFixed(2))}</div>
            </div>
            <Btn kind="fresh" style={{ marginLeft: "auto", flex: 1, maxWidth: 200 }}>Review entry {React.cloneElement(I.arrowRight, { size: 17 })}</Btn>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════ CONFIRMED (mobile) — advocacy
  function Confirmed() {
    const s = R().show, sc = SC(), dog = R().dog;
    return (
      <div style={{ overflow: "hidden", color: G.ink, background: G.deep }}>
        <div style={{ background: `linear-gradient(178deg, ${G.deep}, ${G.deepest})`, color: G.cream, padding: "10px 20px 26px", textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", left: -50, top: 20, width: 200, height: 200, borderRadius: 99, background: `radial-gradient(circle, ${G.fresh}, transparent 68%)`, opacity: 0.25 }} />
          <div style={{ width: 64, height: 64, borderRadius: 99, background: G.fresh, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#0e2c19", boxShadow: "0 16px 34px -14px rgba(0,0,0,0.55)", position: "relative" }}>{React.cloneElement(I.check, { size: 32 })}</div>
          <h1 style={{ ...H, fontSize: 29, color: G.cream, margin: "14px 0 0", position: "relative" }}>You're entered, {sc.exhibitor.first}.</h1>
          <div style={{ ...BODY, fontSize: 13.5, color: G.cream, opacity: 0.8, marginTop: 6, position: "relative" }}>{dog.pet} · {sc.exhibitor.classes} classes · {money(sc.exhibitor.paid)} paid</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, ...BODY, fontSize: 12, color: G.cream, opacity: 0.75, position: "relative" }}>{React.cloneElement(I.mail, { size: 13 })} Confirmation sent to {sc.exhibitor.email}</div>
        </div>
        <div style={{ background: G.paper, borderTopLeftRadius: 22, borderTopRightRadius: 22, marginTop: -2, padding: "18px 16px 28px", position: "relative" }}>
          <SecLabel>What happens next</SecLabel>
          <Card style={{ padding: "6px 18px" }}>
            {/* PRODUCTION NOTE: rows must reflect what Remi ACTUALLY does — no promised
               running-order email date (that send doesn't exist). Use existing copy:
               Now → confirmation email; Before the show → ring numbers & catalogue
               details emailed; Show day → doors {s.doors}, bring confirmation. */}
            {[["Now", "Entry confirmation lands in your inbox"], ["Before the show", "Ring numbers & catalogue details emailed to you"], ["Show day", `Doors ${s.doors} — bring your confirmation`]].map(([k, t], i) => (
              <div key={i} style={{ display: "flex", gap: 13, padding: "12px 0", borderTop: i ? `1px solid ${G.line}` : "none", alignItems: "baseline" }}>
                <span style={{ ...BODY, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: G.honeyDeep, width: 82, flexShrink: 0 }}>{k}</span>
                <span style={{ ...BODY, fontSize: 13.5, color: G.ink2, lineHeight: 1.45 }}>{t}</span>
              </div>
            ))}
          </Card>
          <div style={{ marginTop: 20 }}>
            <SecLabel>Bring your ring-mates</SecLabel>
            <Card style={{ padding: 16 }}>
              <div style={{ background: `linear-gradient(160deg, ${G.deep}, ${G.deepest})`, borderRadius: 13, padding: "14px 16px", color: G.cream, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", right: -30, top: -24, width: 120, height: 120, borderRadius: 99, background: `radial-gradient(circle, ${G.fresh}, transparent 70%)`, opacity: 0.3 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 9, position: "relative" }}>
                  <ClubLogo size={30} ring="rgba(243,236,220,0.35)" ringW={1.5} shadow={false} />
                  <Eyebrow color={G.fresh}>{s.club}</Eyebrow>
                </div>
                <div style={{ ...H, fontSize: 19, marginTop: 10, position: "relative" }}>{sc.exhibitor.first}'s going to the {s.name}.</div>
                <div style={{ ...BODY, fontSize: 12, color: G.cream, opacity: 0.8, marginTop: 5, position: "relative" }}>{s.dateFull} · {s.venue.town} · entries close {s.close.date}</div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Btn kind="fresh" sm style={{ flex: 1 }}>{React.cloneElement(I.whatsapp, { size: 15 })} WhatsApp</Btn>
                <Btn kind="ghost" sm style={{ flex: 1 }}>{React.cloneElement(I.link, { size: 14 })} Copy</Btn>
              </div>
              <div style={{ display: "flex", gap: 7, marginTop: 12, ...BODY, fontSize: 11.5, color: G.ink3, lineHeight: 1.45 }}>
                {React.cloneElement(I.lock, { size: 13, style: { flexShrink: 0, marginTop: 1 } })} Entirely your choice — it shares only what you see here, never your dog's details.
              </div>
            </Card>
          </div>
          {/* PRODUCTION NOTE: post-checkout catalogue purchase does NOT exist — omit the
             "Add a catalogue" upsell card in phase 1; keep the existing
             catalogue-purchased note when a catalogue sundry WAS bought. */}
          <Btn kind="ghost" full sm style={{ marginTop: 12 }}>{React.cloneElement(I.calPlus, { size: 15 })} Add show day to calendar</Btn>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════ DESKTOP show page
  // PRODUCTION NOTES: keep Remi's existing site <Header/> instead of this mock's
  // own nav row. Banner: phase 1 uses the type-led dark-pine gradient (photo slot
  // is phase 2; when shows.bannerImageUrl exists, use it with the same scrim).
  // Omit the QR share card (no QR in phase 1) — keep the existing ShareKit card
  // in the right rail instead. Right rail = 344px, hidden below lg:.
  function JudgeRowD({ j }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 0" }}>
        <div style={{ width: 54, height: 54, borderRadius: 99, background: G.freshSoft, border: `1px solid ${G.freshLine}`, color: G.freshDeep, display: "flex", alignItems: "center", justifyContent: "center", ...H, fontWeight: 600, fontSize: 18, flexShrink: 0 }}>{j.initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...H, fontWeight: 600, fontSize: 19, color: G.ink, lineHeight: 1.05 }}>{j.name} {j.affix && <span style={{ ...BODY, fontStyle: "italic", color: G.ink3, fontSize: 14 }}>({j.affix})</span>}</div>
          <div style={{ ...BODY, fontSize: 12.5, color: G.ink2, marginTop: 2 }}>{j.role} · {j.classes} classes</div>
          <div style={{ ...BODY, fontSize: 12.5, color: G.ink2, lineHeight: 1.5, marginTop: 6 }}>{j.cred}</div>
        </div>
      </div>
    );
  }
  function Desktop() {
    const s = R().show, sc = SC(), cls = R().classes, cf = R().classification;
    return (
      <div style={{ height: "100%", overflow: "hidden", color: G.ink }}>
        {/* banner (260px tall): dark pine gradient + left-anchored identity block */}
        <div style={{ position: "relative", height: 260, background: `linear-gradient(120deg, ${G.deep}, ${G.deepest})` }}>
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(105deg, ${G.deepest} 12%, rgba(21,46,29,0.72) 40%, rgba(21,46,29,0.1) 100%)`, pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: 44, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <ClubLogo size={72} ring={G.cream} ringW={3} />
              <div>
                <div style={{ ...BODY, fontSize: 13, color: G.cream, opacity: 0.85, marginTop: 4 }}>{s.venue.town}, {s.venue.area}</div>
              </div>
            </div>
            <h1 style={{ ...H, fontSize: 46, color: G.cream, margin: "16px 0 0", lineHeight: 1.0, maxWidth: 560, textWrap: "balance" }}>{s.club}</h1>
            <div style={{ ...H, fontWeight: 500, fontSize: 20, fontStyle: "italic", color: G.fresh, marginTop: 8 }}>{s.name} {s.year}</div>
          </div>
        </div>
        {/* body: two columns — flex gap 40, padding 34px 44px */}
        <div style={{ display: "flex", gap: 40, padding: "34px 44px", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Chip tone="fresh"><Pulse /> Entries open</Chip>
              <Chip>{React.cloneElement(I.rosette, { size: 13 })} {s.type}</Chip>
              <Chip>{s.breed}</Chip>
              <Chip>{s.ruleset} licensed · {s.rkcLicence}</Chip>
            </div>
            <p style={{ ...H, fontWeight: 500, fontSize: 20, lineHeight: 1.5, color: G.ink2, maxWidth: 620, margin: "22px 0 0", textWrap: "pretty" }}>{s.description}</p>
            {/* judges — 2-col grid of cards */}
            <div style={{ marginTop: 34, maxWidth: 680 }}>
              <SecLabel right={<span style={{ ...BODY, fontSize: 12, color: G.freshDeep, fontWeight: 600 }}>{s.classesCount} classes</span>}>Your judges</SecLabel>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {sc.judgesRich.map((j, i) => <Card key={i} style={{ padding: "4px 18px" }}><JudgeRowD j={j} /></Card>)}
              </div>
            </div>
            {/* classification — one card, 2-col inside */}
            <div style={{ marginTop: 32, maxWidth: 680 }}>
              <SecLabel>Classification</SecLabel>
              <Card style={{ padding: "16px 20px 18px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>
                  <div>
                    <div style={{ ...H, fontWeight: 600, fontSize: 16, color: G.ink, marginBottom: 6 }}>Dog classes <span style={{ ...BODY, fontWeight: 400, fontSize: 12, color: G.ink3 }}>1–11</span></div>
                    {cls.map((c) => (
                      <div key={c.id} style={{ display: "flex", gap: 8, padding: "3px 0", ...BODY, fontSize: 13, color: G.ink2 }}>
                        <span style={{ ...H, fontWeight: 600, color: G.freshDeep, minWidth: 16 }}>{c.n}</span>{c.short}
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ ...H, fontWeight: 600, fontSize: 16, color: G.ink, marginBottom: 6 }}>Bitch classes <span style={{ ...BODY, fontWeight: 400, fontSize: 12, color: G.ink3 }}>{cf.bitchRange}</span></div>
                    <div style={{ ...BODY, fontSize: 13, color: G.ink2, lineHeight: 1.5 }}>As for dogs — Minor Puppy through Veteran.</div>
                    <div style={{ ...H, fontWeight: 600, fontSize: 16, color: G.ink, margin: "16px 0 7px" }}>Junior Handling</div>
                    {cf.jh.map((j) => (
                      <div key={j.n} style={{ ...BODY, fontSize: 13, color: G.ink2, padding: "2px 0" }}><b style={{ color: G.ink }}>{j.n}</b> · {j.name} <span style={{ color: G.ink3 }}>({j.sub})</span></div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
            {/* at the show — 3-col facility grid (only REAL data in production) */}
            <div style={{ marginTop: 32, maxWidth: 680 }}>
              <SecLabel>At the show</SecLabel>
              <Card style={{ padding: "8px 20px 16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", columnGap: 18 }}>
                  {/* production: only rows backed by real scheduleData/show fields */}
                </div>
                <div style={{ borderTop: `1px solid ${G.line}`, marginTop: 6, paddingTop: 12, ...BODY, fontSize: 13.5, color: G.ink2, lineHeight: 1.5 }}><b style={{ color: G.honeyDeep }}>Catering · </b>{s.atShow.catering}</div>
              </Card>
            </div>
          </div>
          {/* right rail — 344px fixed */}
          <div style={{ width: 344, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            <Card style={{ overflow: "hidden" }}>
              {/* honey close strip across the card top */}
              <div style={{ background: G.honey, padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <Eyebrow color="rgba(74,48,6,0.7)">Entries close</Eyebrow>
                  <div style={{ ...H, fontWeight: 600, fontSize: 16, color: "#3a2606", marginTop: 2, whiteSpace: "nowrap" }}>{s.close.weekday} {s.close.date}</div>
                </div>
                <Countdown dark />
              </div>
              <div style={{ padding: 16 }}>
                {/* 2x2 quick facts */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[["Date", `${s.dayShort} ${s.day} ${s.monthShort}`], ["Judging", s.judging], ["Venue", s.venue.name], ["Doors", s.doors]].map(([k, v]) => (
                    <div key={k} style={{ background: G.paper, borderRadius: 10, padding: "10px 12px" }}><Eyebrow>{k}</Eyebrow><div style={{ ...H, fontWeight: 600, fontSize: 14, marginTop: 3 }}>{v}</div></div>
                  ))}
                </div>
                <Btn kind="fresh" full style={{ marginTop: 14 }}>{React.cloneElement(I.flag, { size: 17 })} Enter · from {money(s.fees.first)}</Btn>
                <Btn kind="ghost" full sm style={{ marginTop: 8 }}>{React.cloneElement(I.document, { size: 15 })} Schedule (PDF)</Btn>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 13, paddingTop: 12, borderTop: `1px solid ${G.line}` }}>
                  {[[I.card, "Card or cheque — same fee"], [I.check, "Instant email confirmation"], [I.lock, "Entry private until the catalogue"]].map(([ic, t], i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, ...BODY, fontSize: 12, color: G.ink2 }}><span style={{ color: G.freshDeep, display: "flex", flexShrink: 0 }}>{React.cloneElement(ic, { size: 14 })}</span>{t}</div>
                  ))}
                </div>
              </div>
            </Card>
            {/* production: existing ShareKit card goes here (QR card omitted in phase 1) */}
          </div>
        </div>
      </div>
    );
  }

  window.GreenJourney = { Browse, Enter, Confirmed, Desktop };
})();
