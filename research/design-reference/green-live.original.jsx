/* AUTHORITATIVE DESIGN SOURCE — verbatim from claude.ai/design project "Remi",
   file remi/green-live.jsx. Every literal value here is the fidelity contract.
   See DEVIATIONS.md for the short list of agreed differences. Production
   fontset = "friendly" (Hanken Grotesk). */
/* global React, I, Phone, HomeBar, ClubLogo */
// ════════════════════════════════════════════════════════════
// GREEN — BROUGHT TO LIFE
// Mandy's green, modernised: bigger logo, contemporary type
// (switchable via CSS vars — 3 pairings to compare), a livelier
// palette (deep pine + a fresh spring-green accent + honey), and
// real drop-in PHOTO slots so clubs bring their show to life.
// Entry numbers stay private (per Mandy).
// ════════════════════════════════════════════════════════════
(function () {
  // Self-contained icon extras (so this file doesn't depend on dir-d):
  (function () {
    const mk = window.RemiIcon;
    Object.assign(I, {
      lock: mk({ d: <><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></> }),
      camera: mk({ d: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8.5 7 10 4.5h4L15.5 7"/><circle cx="12" cy="13" r="3.4"/></> }),
      map: mk({ d: <><path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2z"/><path d="M9 4v14M15 6v14"/></> }),
    });
  })();

  const G = {
    paper: "#f6f4ec", paper2: "#efe9db", surface: "#ffffff",
    ink: "#1b241d", ink2: "#535c4d", ink3: "#8a9182",
    deep: "#20452c", deepest: "#152e1d", green: "#2f6b43",
    fresh: "#5bb579", freshDeep: "#2f8a52", freshSoft: "#e4f2e7", freshLine: "#c3e2cb",
    honey: "#e6a53a", honeyDeep: "#b9781a", honeySoft: "#f8ecd4",
    line: "#e7e1d3", line2: "#d7cfba",
    cream: "#f3ecdc", creamDim: "rgba(243,236,220,0.66)",
  };
  const FSETS = {
    modern:    { head: '"Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif', body: '"Geist", ui-sans-serif, system-ui, sans-serif', tight: "-0.02em", hw: 700 },
    editorial: { head: '"Newsreader", Georgia, serif', body: '"Geist", ui-sans-serif, system-ui, sans-serif', tight: "-0.015em", hw: 600 },
    friendly:  { head: '"Hanken Grotesk", ui-sans-serif, system-ui, sans-serif', body: '"Hanken Grotesk", ui-sans-serif, system-ui, sans-serif', tight: "-0.015em", hw: 800 },
  };
  const money = (v) => "£" + v;
  const R = () => window.REMI;
  const SC = () => window.REMI.showcase;

  const H = { fontFamily: "var(--gl-head)", fontWeight: "var(--gl-hw)", letterSpacing: "var(--gl-tight)" };
  const BODY = { fontFamily: "var(--gl-body)" };

  const Eyebrow = ({ children, color = G.ink3, style }) => (
    <div style={{ ...BODY, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em", color, ...style }}>{children}</div>
  );
  const Wordmark = ({ color = G.green, size = 15 }) => (
    <span style={{ ...H, fontSize: size, color, display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: G.fresh, display: "inline-block" }} />Remi
    </span>
  );
  function Btn({ children, kind = "primary", full, sm, style }) {
    const base = { ...BODY, fontWeight: 600, borderRadius: 13, border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: sm ? 42 : 52, padding: sm ? "0 16px" : "0 22px", fontSize: sm ? 13.5 : 15.5, width: full ? "100%" : "auto", whiteSpace: "nowrap" };
    const kinds = {
      primary: { background: G.green, color: G.cream, boxShadow: `0 10px 22px -12px ${G.green}` },
      fresh: { background: G.fresh, color: "#0e2c19", boxShadow: `0 10px 24px -12px ${G.fresh}` },
      ghost: { background: G.surface, color: G.ink, boxShadow: `inset 0 0 0 1px ${G.line2}` },
      onDark: { background: "rgba(243,236,220,0.14)", color: G.cream },
    };
    return <button style={{ ...base, ...kinds[kind], ...style }}>{children}</button>;
  }
  const Chip = ({ children, tone = "light", style }) => {
    const tones = {
      light: { background: G.surface, color: G.ink2, boxShadow: `inset 0 0 0 1px ${G.line}` },
      fresh: { background: G.freshSoft, color: G.freshDeep, boxShadow: `inset 0 0 0 1px ${G.freshLine}` },
      onDark: { background: "rgba(243,236,220,0.14)", color: G.cream, boxShadow: "inset 0 0 0 1px rgba(243,236,220,0.25)" },
    };
    return <span style={{ ...BODY, display: "inline-flex", alignItems: "center", gap: 6, height: 27, padding: "0 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, ...tones[tone], ...style }}>{children}</span>;
  };
  const Card = ({ children, style }) => (
    <div style={{ background: G.surface, border: `1px solid ${G.line}`, borderRadius: 18, boxShadow: "0 1px 2px rgba(27,36,29,0.04), 0 18px 36px -26px rgba(27,36,29,0.4)", ...style }}>{children}</div>
  );
  const SecLabel = ({ children, right }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 14px" }}>
      <span style={{ width: 20, height: 3, borderRadius: 2, background: G.fresh }} />
      <Eyebrow color={G.green}>{children}</Eyebrow>
      <div style={{ flex: 1, height: 1, background: G.line }} />
      {right}
    </div>
  );
  function Pulse({ color = G.fresh }) {
    return <span style={{ position: "relative", width: 8, height: 8, flexShrink: 0 }}>
      <span style={{ position: "absolute", inset: -3, borderRadius: 99, background: color, opacity: 0.3 }} />
      <span style={{ position: "absolute", inset: 0, borderRadius: 99, background: color }} />
    </span>;
  }
  function Countdown({ dark }) {
    const c = SC().countdown;
    const cell = (v, k) => (
      <div key={k} style={{ textAlign: "center", minWidth: 46 }}>
        <div style={{ ...BODY, fontWeight: 700, fontSize: 25, color: dark ? "#0e2c19" : G.ink, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{v}</div>
        <div style={{ ...BODY, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: dark ? "rgba(14,44,25,0.6)" : G.ink3, marginTop: 4 }}>{k}</div>
      </div>
    );
    const sep = (i) => <div key={"s" + i} style={{ ...BODY, fontSize: 18, fontWeight: 700, color: dark ? "rgba(14,44,25,0.4)" : G.ink3, marginTop: -6 }}>:</div>;
    return <div style={{ display: "flex", alignItems: "center", gap: 7 }}>{[cell(c.d, "days"), sep(1), cell(c.h, "hrs"), sep(2), cell(c.m, "min")]}</div>;
  }

  // ── HERO ─────────────────────────────────────────────────
  function Hero({ photos, slotKey }) {
    const s = R().show, sc = SC();
    const chips = (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        <Chip tone="onDark"><Pulse /> Entries open</Chip>
        <Chip tone="onDark">{React.cloneElement(I.rosette, { size: 13 })} {s.type}</Chip>
        <Chip tone="onDark">{s.breed}</Chip>
      </div>
    );
    const meta = (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Wordmark color={G.cream} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginTop: 14 }}>
          <ClubLogo size={photos ? 74 : 84} ring={photos ? G.cream : "rgba(91,181,121,0.55)"} ringW={photos ? 3 : 2} />
          <div style={{ paddingBottom: 2 }}>
            <Eyebrow color={G.fresh}>Est. {s.established} · {sc.edition} year</Eyebrow>
            <div style={{ ...BODY, fontSize: 12.5, color: G.cream, opacity: 0.8, marginTop: 4 }}>{s.venue.town}, {s.venue.area}</div>
          </div>
        </div>
        <h1 style={{ ...H, fontSize: 37, lineHeight: 1.02, color: G.cream, margin: "16px 0 0", textWrap: "balance" }}>{s.club}</h1>
        <div style={{ ...H, fontWeight: 500, fontSize: 18, fontStyle: "italic", color: G.fresh, marginTop: 8 }}>{s.name} {s.year}</div>
        <div style={{ ...BODY, fontSize: 13, color: G.cream, opacity: 0.82, marginTop: 8 }}>{s.dateFull} · {s.venue.name}</div>
        <div style={{ marginTop: 16 }}>{chips}</div>
      </>
    );

    if (photos) {
      // full-bleed photo hero (club uploads); works empty too
      return (
        <div style={{ position: "relative", background: `linear-gradient(175deg, ${G.deep}, ${G.deepest})` }}>
          <div style={{ position: "relative", height: 250 }}>
            <div style={{ position: "absolute", inset: 0 }}>
              <image-slot id={"cvHero-" + slotKey} shape="rect" fit="cover" placeholder="Drop your venue photo" style={{ width: "100%", height: "100%" }}></image-slot>
            </div>
            {/* top bar + scrim (click-through so the slot stays droppable) */}
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to top, ${G.deepest} 2%, rgba(21,46,29,0.15) 42%, rgba(21,46,29,0.55) 100%)`, pointerEvents: "none" }} />
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", pointerEvents: "none" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: G.cream, fontSize: 13.5, fontWeight: 600, ...BODY }}>{React.cloneElement(I.chevLeft, { size: 18 })} Shows</span>
              <Wordmark color={G.cream} />
            </div>
            <Chip tone="onDark" style={{ position: "absolute", top: 46, right: 18, backdropFilter: "blur(6px)" }}>{React.cloneElement(I.camera, { size: 13 })} Your photo</Chip>
          </div>
          {/* title plate below photo, logo badge overlapping */}
          <div style={{ padding: "0 20px 22px", marginTop: -34, position: "relative" }}>
            <ClubLogo size={76} ring={G.cream} ringW={3} style={{ boxShadow: "0 10px 24px -10px rgba(0,0,0,0.6)" }} />
            <h1 style={{ ...H, fontSize: 33, lineHeight: 1.02, color: G.cream, margin: "12px 0 0", textWrap: "balance" }}>{s.club}</h1>
            <div style={{ ...H, fontWeight: 500, fontSize: 17, fontStyle: "italic", color: G.fresh, marginTop: 6 }}>{s.name} {s.year}</div>
            <div style={{ ...BODY, fontSize: 13, color: G.cream, opacity: 0.82, marginTop: 7 }}>{s.dateFull} · {s.venue.name}</div>
            <div style={{ marginTop: 14 }}>{chips}</div>
            <div style={{ marginTop: 16, background: G.honey, borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 14px 30px -16px rgba(0,0,0,0.5)" }}>
              <div>
                <Eyebrow color="rgba(74,48,6,0.7)">Entries close</Eyebrow>
                <div style={{ ...H, fontWeight: 600, fontSize: 17, color: "#3a2606", marginTop: 2, whiteSpace: "nowrap" }}>{s.close.weekday} {s.close.date}</div>
              </div>
              <Countdown dark />
            </div>
          </div>
        </div>
      );
    }

    // type-led hero (no photo needed) — lively via colour + big logo + type
    return (
      <div style={{ position: "relative", overflow: "hidden", background: `linear-gradient(172deg, ${G.deep}, ${G.deepest})`, padding: "0 20px 22px" }}>
        <div style={{ position: "absolute", right: -90, top: -70, width: 260, height: 260, borderRadius: 99, background: `radial-gradient(circle, ${G.fresh}, transparent 68%)`, opacity: 0.28, pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0 16px", position: "relative" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: G.creamDim, fontSize: 13.5, fontWeight: 600, ...BODY }}>{React.cloneElement(I.chevLeft, { size: 18 })} Shows</span>
          <Wordmark color={G.cream} />
        </div>
        <div style={{ position: "relative" }}>{meta}</div>
        <div style={{ marginTop: 18, background: G.honey, borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", boxShadow: "0 14px 30px -16px rgba(0,0,0,0.5)" }}>
          <div>
            <Eyebrow color="rgba(74,48,6,0.7)">Entries close</Eyebrow>
            <div style={{ ...H, fontWeight: 600, fontSize: 17, color: "#3a2606", marginTop: 2, whiteSpace: "nowrap" }}>{s.close.weekday} {s.close.date}</div>
          </div>
          <Countdown dark />
        </div>
      </div>
    );
  }

  function CtaCard() {
    const s = R().show;
    return (
      <Card style={{ padding: 16 }}>
        <Btn kind="fresh" full>{React.cloneElement(I.flag, { size: 18 })} Enter this show · from {money(s.fees.first)}</Btn>
        <Btn kind="ghost" full sm style={{ marginTop: 8 }}>{React.cloneElement(I.document, { size: 15 })} Read the full schedule (PDF)</Btn>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14, paddingTop: 13, borderTop: `1px solid ${G.line}` }}>
          {[[I.card, "Pay by card, or post a cheque — same fee"], [I.check, "Instant confirmation by email"], [I.lock, "Your entry stays private until the catalogue"]].map(([ic, t], i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, ...BODY, fontSize: 12.5, color: G.ink2 }}>
              <span style={{ color: G.freshDeep, display: "flex", flexShrink: 0 }}>{React.cloneElement(ic, { size: 15 })}</span>{t}
            </div>
          ))}
        </div>
      </Card>
    );
  }

  function JudgeCard({ j }) {
    return (
      <Card style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 52, height: 52, borderRadius: 99, background: G.freshSoft, border: `1px solid ${G.freshLine}`, color: G.freshDeep, display: "flex", alignItems: "center", justifyContent: "center", ...H, fontWeight: 600, fontSize: 18, flexShrink: 0 }}>{j.initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...H, fontWeight: 600, fontSize: 19, color: G.ink, lineHeight: 1.1 }}>{j.name} {j.affix && <span style={{ ...BODY, fontStyle: "italic", color: G.ink3, fontSize: 14 }}>({j.affix})</span>}</div>
            <div style={{ ...BODY, fontSize: 12.5, color: G.ink2, marginTop: 2 }}>{j.role} · {j.classes} classes</div>
          </div>
        </div>
        <div style={{ ...BODY, fontSize: 12.5, color: G.ink2, lineHeight: 1.5, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${G.line}` }}>{j.cred}</div>
        {j.quote && <div style={{ marginTop: 10, background: G.freshSoft, borderRadius: 12, padding: "10px 13px", ...BODY, fontSize: 13.5, fontStyle: "italic", color: G.ink, lineHeight: 1.5 }}>“{j.quote}”</div>}
      </Card>
    );
  }

  function Classification() {
    const cls = R().classes, cf = R().classification;
    return (
      <Card style={{ padding: "14px 18px 16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={{ ...H, fontWeight: 600, fontSize: 16.5, color: G.ink }}>Dog classes</div>
          <Eyebrow>Classes 1–11</Eyebrow>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 16, rowGap: 1, marginTop: 8 }}>
          {cls.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 8, padding: "4px 0", ...BODY, fontSize: 13, color: G.ink2, alignItems: "baseline" }}>
              <span style={{ ...H, fontWeight: 600, color: G.freshDeep, minWidth: 14 }}>{c.n}</span>{c.short}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${G.line}` }}>
          <div style={{ ...H, fontWeight: 600, fontSize: 16.5, color: G.ink }}>Bitch classes</div>
          <Eyebrow>Classes {cf.bitchRange}</Eyebrow>
        </div>
        <div style={{ ...BODY, fontSize: 13, color: G.ink2, marginTop: 4 }}>As for dogs — Minor Puppy through Veteran.</div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${G.line}` }}>
          <div style={{ ...H, fontWeight: 600, fontSize: 16.5, color: G.ink }}>Junior Handling</div>
          <div style={{ display: "flex", gap: 8, marginTop: 7 }}>
            {cf.jh.map((j) => (
              <div key={j.n} style={{ flex: 1, background: G.paper, borderRadius: 11, padding: "9px 12px" }}>
                <div style={{ ...BODY, fontSize: 12.5, fontWeight: 600, color: G.ink }}>{j.n} · {j.name}</div>
                <div style={{ ...BODY, fontSize: 11.5, color: G.ink3, marginTop: 1 }}>{j.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  function Prizes() {
    const p = SC().prizes;
    return (
      <Card style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {p.top.map(([k, label]) => (
            <div key={k} style={{ flex: 1, background: G.paper, borderRadius: 13, padding: "12px 6px", textAlign: "center" }}>
              <span style={{ color: G.honeyDeep, display: "inline-flex" }}>{React.cloneElement(I.trophy, { size: 20 })}</span>
              <div style={{ ...H, fontWeight: 600, fontSize: 16, color: G.ink, marginTop: 5, lineHeight: 1 }}>{k}</div>
              <div style={{ ...BODY, fontSize: 10.5, color: G.ink3, marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 12, ...BODY, fontSize: 13.5, color: G.ink2 }}><span style={{ color: G.freshDeep, display: "flex" }}>{React.cloneElement(I.rosette, { size: 17 })}</span>{p.rosettes}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 8, ...BODY, fontSize: 13.5, color: G.ink2 }}><span style={{ color: G.honeyDeep, display: "flex" }}>{React.cloneElement(I.star, { size: 17 })}</span>{p.perpetual}</div>
      </Card>
    );
  }

  // ── GALLERY — the "bring it to life" upload feature ──────
  function Gallery({ slotKey }) {
    const tiles = [
      { id: "hall", label: "The hall", ph: "Venue" },
      { id: "ring", label: "Last year's ring", ph: "Ring" },
      { id: "bis", label: "2025 BIS", ph: "Winner" },
    ];
    return (
      <Card style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: G.freshSoft, color: G.freshDeep, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{React.cloneElement(I.camera, { size: 18 })}</div>
          <div style={{ flex: 1 }}>
            <div style={{ ...H, fontWeight: 600, fontSize: 15.5, color: G.ink }}>Photos from the club</div>
            <div style={{ ...BODY, fontSize: 12, color: G.ink3 }}>Drag in venue & ring shots — they bring the page to life.</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {tiles.map((t) => (
            <div key={t.id} style={{ position: "relative" }}>
              <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden" }}>
                <image-slot id={"cvGal-" + t.id + "-" + slotKey} shape="rounded" radius="12" fit="cover" placeholder={t.ph} style={{ width: "100%", height: "100%" }}></image-slot>
              </div>
              <div style={{ ...BODY, fontSize: 10.5, color: G.ink3, marginTop: 5, textAlign: "center" }}>{t.label}</div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  function Remind() {
    return (
      <Card style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: G.honeySoft, color: G.honeyDeep, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{React.cloneElement(I.bell, { size: 21 })}</div>
          <div style={{ flex: 1 }}>
            <div style={{ ...H, fontWeight: 600, fontSize: 17, color: G.ink }}>Not entering today?</div>
            <div style={{ ...BODY, fontSize: 12.5, color: G.ink3, marginTop: 1, lineHeight: 1.4 }}>One nudge, two days before entries close. Nothing else.</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 13 }}>
          <Btn kind="primary" sm style={{ flex: 1 }}>{React.cloneElement(I.bell, { size: 15 })} Remind me</Btn>
          <Btn kind="ghost" sm style={{ flex: 1 }}>{React.cloneElement(I.calPlus, { size: 15 })} Add to calendar</Btn>
        </div>
      </Card>
    );
  }

  function ShareBlock() {
    return (
      <div style={{ background: `linear-gradient(165deg, ${G.deep}, ${G.deepest})`, borderRadius: 18, padding: "18px 18px 16px", color: G.cream, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", right: -40, top: -30, width: 150, height: 150, borderRadius: 99, background: `radial-gradient(circle, ${G.fresh}, transparent 70%)`, opacity: 0.3 }} />
        <div style={{ ...H, fontWeight: 600, fontSize: 19, position: "relative" }}>Every share sells a few more entries.</div>
        <div style={{ ...BODY, fontSize: 13, color: G.creamDim, marginTop: 3, lineHeight: 1.45, position: "relative" }}>The link unfurls into a card with the crest, date and countdown.</div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, position: "relative" }}>
          <Btn kind="fresh" sm style={{ flex: 1, height: 44 }}>{React.cloneElement(I.whatsapp, { size: 16 })} WhatsApp</Btn>
          <Btn sm style={{ flex: 1, height: 44, background: G.cream, color: G.deep }}>{React.cloneElement(I.link, { size: 15 })} Copy link</Btn>
          <Btn kind="onDark" sm style={{ width: 44, height: 44, padding: 0 }}>{React.cloneElement(I.qr, { size: 18 })}</Btn>
        </div>
      </div>
    );
  }

  // ── the page ─────────────────────────────────────────────
  function Page(opts) {
    opts = opts || {};
    const fs = FSETS[opts.fontset || "modern"];
    const photos = !!opts.photos;
    const slotKey = opts.fontset || "modern";
    const s = R().show, sc = SC();
    const Sec = ({ title, right, children }) => (
      <div style={{ marginTop: 22 }}><SecLabel right={right}>{title}</SecLabel>{children}</div>
    );
    return (
      <Phone bg={G.paper} statusColor={G.cream}>
        <div style={{ overflow: "hidden", color: G.ink, background: G.deep, ...BODY, ["--gl-head"]: fs.head, ["--gl-body"]: fs.body, ["--gl-hw"]: fs.hw, ["--gl-tight"]: fs.tight }}>
          <Hero photos={photos} slotKey={slotKey} />
          <div style={{ background: G.paper, borderTopLeftRadius: 22, borderTopRightRadius: 22, marginTop: -2, padding: "18px 16px 0", position: "relative" }}>
            <CtaCard />
            <Sec title="Your judges">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{sc.judgesRich.map((j, i) => <JudgeCard key={i} j={j} />)}</div>
            </Sec>
            {photos && <Sec title="Bring it to life"><Gallery slotKey={slotKey} /></Sec>}
            <Sec title="What's at stake"><Prizes /></Sec>
            <Sec title="Classification" right={<span style={{ ...BODY, fontSize: 12, color: G.freshDeep, fontWeight: 600 }}>{s.classesCount} in total</span>}><Classification /></Sec>
            <Sec title="The day">
              <Card style={{ display: "flex", overflow: "hidden" }}>
                {[["Doors", s.doors], ["Judging", s.judging], ["Best in Show", s.bis]].map(([k, v], i) => (
                  <div key={k} style={{ flex: 1, padding: "13px 12px", borderLeft: i ? `1px solid ${G.line}` : "none" }}>
                    <Eyebrow>{k}</Eyebrow>
                    <div style={{ ...H, fontWeight: 600, fontSize: 17, color: i === 2 ? G.honeyDeep : G.ink, marginTop: 3 }}>{v}</div>
                  </div>
                ))}
              </Card>
            </Sec>
            <Sec title="Entry fees" right={<span style={{ ...BODY, fontSize: 12, color: G.ink3 }}>one payment</span>}>
              <Card style={{ padding: "4px 18px" }}>
                {[["First class, per dog", s.fees.first], ["Each additional class", s.fees.subsequent], ["Puppy NFC — just for the experience", s.fees.nfc], ["Members' first class", s.fees.member]].map(([k, v], i) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderTop: i ? `1px solid ${G.line}` : "none", ...BODY, fontSize: 13.5 }}>
                    <span style={{ color: G.ink2 }}>{k}</span>
                    <span style={{ ...H, fontWeight: 600, color: G.ink, fontSize: 15.5 }}>{money(v)}</span>
                  </div>
                ))}
              </Card>
            </Sec>
            <Sec title="Getting there">
              <Card style={{ overflow: "hidden" }}>
                <div style={{ height: 128, position: "relative" }}>
                  <image-slot id={"cvVenue-" + slotKey} shape="rect" fit="cover" placeholder="Drop a venue or map photo" style={{ width: "100%", height: "100%" }}></image-slot>
                </div>
                <div style={{ padding: "4px 18px 8px" }}>
                  {sc.travel.map(([ic, t], i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderTop: i ? `1px solid ${G.line}` : "none", ...BODY, fontSize: 13.5, color: G.ink2 }}>
                      <span style={{ color: G.freshDeep, display: "flex", flexShrink: 0 }}>{React.cloneElement(I[ic], { size: 17 })}</span>{t}
                    </div>
                  ))}
                </div>
              </Card>
            </Sec>
            <Sec title="First time showing?">
              <Card style={{ padding: "6px 18px 8px" }}>
                {sc.faq.map(([q, a], i) => (
                  <div key={i} style={{ padding: "12px 0", borderTop: i ? `1px solid ${G.line}` : "none" }}>
                    <div style={{ ...H, fontWeight: 600, fontSize: 15.5, color: G.ink }}>{q}</div>
                    <div style={{ ...BODY, fontSize: 13, color: G.ink2, lineHeight: 1.5, marginTop: 3, textWrap: "pretty" }}>{a}</div>
                  </div>
                ))}
              </Card>
            </Sec>
            <div style={{ marginTop: 22 }}><Remind /></div>
            <Sec title="Spread the word"><ShareBlock /></Sec>
            <div style={{ padding: "24px 0 30px", textAlign: "center" }}>
              <Wordmark />
              <div style={{ ...BODY, fontSize: 11.5, color: G.ink3, marginTop: 5 }}>No account needed to read · entries in under two minutes</div>
            </div>
          </div>
        </div>
      </Phone>
    );
  }

  window.GreenLive = { Page, FSETS, tokens: G, kit: { H, BODY, Eyebrow, Wordmark, Btn, Chip, Card, SecLabel, Pulse, Countdown } };
})();
