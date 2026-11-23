/* DESIGN REFERENCE ONLY — not part of the app build.
   Source: claude.ai/design project "Remi" → "Remi Show Experience.html" → remi/green-live.jsx
   This is the approved visual design for the public SHOW PAGE (mobile). The app implementation
   maps these inline styles onto Tailwind se-* tokens + src/components/show-experience/kit.tsx.
   Fontset in production = "friendly" (Hanken Grotesk). */
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

  // ── HERO (type-led variant — the production phase-1 hero; photo variant is phase 2) ──
  function Hero() {
    const s = R().show, sc = SC();
    const chips = (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        <Chip tone="onDark"><Pulse /> Entries open</Chip>
        <Chip tone="onDark">{React.cloneElement(I.rosette, { size: 13 })} {s.type}</Chip>
        <Chip tone="onDark">{s.breed}</Chip>
      </div>
    );
    // type-led hero (no photo needed) — lively via colour + big logo + type
    return (
      <div style={{ position: "relative", overflow: "hidden", background: `linear-gradient(172deg, ${G.deep}, ${G.deepest})`, padding: "0 20px 22px" }}>
        <div style={{ position: "absolute", right: -90, top: -70, width: 260, height: 260, borderRadius: 99, background: `radial-gradient(circle, ${G.fresh}, transparent 68%)`, opacity: 0.28, pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0 16px", position: "relative" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: G.creamDim, fontSize: 13.5, fontWeight: 600, ...BODY }}>{React.cloneElement(I.chevLeft, { size: 18 })} Shows</span>
          <Wordmark color={G.cream} />
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginTop: 14 }}>
            <ClubLogo size={84} ring={"rgba(91,181,121,0.55)"} ringW={2} />
            <div style={{ paddingBottom: 2 }}>
              <Eyebrow color={G.fresh}>Est. {s.established} · {sc.edition} year</Eyebrow>
              <div style={{ ...BODY, fontSize: 12.5, color: G.cream, opacity: 0.8, marginTop: 4 }}>{s.venue.town}, {s.venue.area}</div>
            </div>
          </div>
          <h1 style={{ ...H, fontSize: 37, lineHeight: 1.02, color: G.cream, margin: "16px 0 0", textWrap: "balance" }}>{s.club}</h1>
          <div style={{ ...H, fontWeight: 500, fontSize: 18, fontStyle: "italic", color: G.fresh, marginTop: 8 }}>{s.name} {s.year}</div>
          <div style={{ ...BODY, fontSize: 13, color: G.cream, opacity: 0.82, marginTop: 8 }}>{s.dateFull} · {s.venue.name}</div>
          <div style={{ marginTop: 16 }}>{chips}</div>
        </div>
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

  function ShareBlock() {
    return (
      <div style={{ background: `linear-gradient(165deg, ${G.deep}, ${G.deepest})`, borderRadius: 18, padding: "18px 18px 16px", color: G.cream, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", right: -40, top: -30, width: 150, height: 150, borderRadius: 99, background: `radial-gradient(circle, ${G.fresh}, transparent 70%)`, opacity: 0.3 }} />
        <div style={{ ...H, fontWeight: 600, fontSize: 19, position: "relative" }}>Every share sells a few more entries.</div>
        <div style={{ ...BODY, fontSize: 13, color: G.creamDim, marginTop: 3, lineHeight: 1.45, position: "relative" }}>The link unfurls into a card with the crest, date and countdown.</div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, position: "relative" }}>
          <Btn kind="fresh" sm style={{ flex: 1, height: 44 }}>{React.cloneElement(I.whatsapp, { size: 16 })} WhatsApp</Btn>
          <Btn sm style={{ flex: 1, height: 44, background: G.cream, color: G.deep }}>{React.cloneElement(I.link, { size: 15 })} Copy link</Btn>
        </div>
      </div>
    );
  }

  // ── the page (production phase-1 composition) ────────────
  // Section order: Hero → CtaCard → "Your judges" → "What's at stake" (Prizes,
  // only with data the app already shows) → "Classification" → "The day"
  // (Doors/Judging columns) → "Entry fees" → "Getting there" (venue card:
  // photo/map + travel rows) → "Spread the word" (ShareBlock) → footer
  // wordmark + "No account needed to read · entries in under two minutes".
  // Sections use SecLabel; body sits on paper bg with rounded-t-[22px] pulled
  // up over the dark hero (marginTop:-2, borderTopLeftRadius/RightRadius 22).
})();
