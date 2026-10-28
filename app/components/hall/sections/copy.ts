/**
 * The copy of the home's tour and the inner pages (v21, v21.1), kept beside
 * the sections so the parallel build never edits i18n/en.ts at the same
 * time as the HUD. copy-lint scans this file like any component. English
 * only. v21.1: no Roman numerals, no daggers, no folios; a section is a
 * numbered disc and a title.
 */
export const P = {
  demo: "Demo figures, simulated in your browser. Nothing here touches Solana.",

  how: {
    l1: "How a round",
    l2: "plays.",
    lede: "Four beats, about twenty seconds, the same for every player.",
    odds: "Read the odds",
  },

  curve: {
    caption: "Past prices, read from the curve. Not a forecast.",
    aria: "The LADLE curve price, round by round, since round 1",
    now: "now",
  },

  books: {
    title: "Open books.",
  },

  odds: {
    l1: "Measured,",
    l2: "not promised.",
    plainCmd: "!odds",
    plain: "in plain words: your share is your pro-rata share times a factor set by how your roll compares with the round's average roll.",
    full: "The odds, in full",
    smallest: "smallest past scoop",
    largest: "largest past scoop",
    below: "{pct} of scoops ended below ×1. Median {median}.",
    proRata: "pro-rata",
    aria: "Every past scoop as one dot, from ×0 to ×2",
    sample: "{n} scoops from the last {k} rounds",
  },

  rcp: {
    ok: "Matches the program's record",
    bad: "Does not match the program's record",
    badAt: "First differing entry: No. {i}.",
  },

  host: {
    l1: "Bring Ladle",
    l2: "to your stream.",
    body: "Your viewers play from the chat. A host room can add a host fee of up to 3 %, written on every entry.",
    integrate: "Integrate",
    cmds: [
      { c: "!scoop 0.25", r: "enters this round with 0.25 SOL, at the same price as everyone" },
      { c: "!odds", r: "the law in one line, with the measured spread" },
      { c: "!pot", r: "what is in this round, and how many players" },
      { c: "!verify 1099", r: "recomputes a served round from its seed" },
      { c: "!sell", r: "sells your last scoop back at the curve price, 0 fee" },
    ],
  },

  gen: {
    claimed: "Genesis profiles claimed",
    note: "It marks when you arrived. No reward, no allocation, no extra share.",
    make: "Make your profile",
    aria: "The first Genesis profiles, in the order they were made",
  },

  qa: {
    l1: "House",
    l2: "questions.",
    more: "Security, status and risks",
  },

  /* ---------------- inner pages ---------------- */

  oddsPage: {
    label: "The odds",
    title: "The odds, in clear language.",
    lede: "Measured over many rounds, never promised for one. Every figure here comes from the published law.",
    lawTitle: "The law, in three clauses.",
    clauses: ["The roll", "The factor", "The average"],
    summaryLabel: "In one round",
    summary: "Most entries end a little under pro-rata and some end well above. Over many rounds the factor averages ×1 at every stake.",
    swarmTitle: "Every past scoop, one dot each.",
    simTitle: "See what a draw looks like.",
    simBody: "No SOL, no wallet, nothing on Solana. Move a slider and 20,000 rounds run with the published law, in your browser.",
    tableTitle: "Decile by decile.",
    tableBody: "The mean factor per stake decile over {n} simulated rounds, with its 95 % interval. Every row should read ×1, within the tolerance of ±{tol}.",
    colDecile: "Stake decile",
    colMean: "Mean factor",
    colCi: "95 % interval",
    colN: "Entries",
    ciNote: "The 95 % interval of each row is in the table on a wider screen.",
    wordsTitle: "The words we use.",
  },

  sec: {
    label: "Security",
    title: "What the program can and cannot do.",
    statusTitle: "Where it stands.",
    cannotTitle: "What nobody can do.",
    stepsTitle: "Four instructions.",
    entry: "platform fee on entry",
    sell: "fee on sell back",
    hostMax: "host fee, at most",
    toReadme: "the program's README",
    toProps: "the property test",
    indexLabel: "Sections of this page",
  },

  int: {
    label: "Integrate",
    title: "Bring Ladle to your stream.",
    previewNote: "The embed, running on demo data",
    rulesTitle: "Every host room follows these.",
    feeTitle: "Line by line, for 1 SOL.",
    colHost: "Host fee",
    colPlatform: "Platform 1.00 %",
    colToHost: "To the host",
    colCurve: "Buys on the curve",
    cmdTitle: "What the chat types.",
    foundTitle: "The first twenty-five.",
    simTitle: "What a host room collects.",
    mainRoom: "the main room",
    restLine: "platform fee {p} SOL · on the curve {c} SOL",
    roomLabel: "What your players read",
  },

  about: {
    label: "About",
    title: "Twenty seconds, served in the open.",
    lede: "Ladle is a draw game on Solana. Everyone in a round pays the same price; one verifiable seed splits the round's single buy.",
    gameTitle: "What Ladle is.",
    houseT: "What the house takes",
    houseB: "1.00 % on entry. Nothing on the draw, nothing on the sell back, and nobody can pause a claim, a sell back or a refund.",
    solTitle: "How Ladle runs on Solana.",
    rows: [
      { t: "The program", b: "One Solana program holds the round: it takes entries at one price, seals at slot 92, asks ORAO VRF for a seed, and splits the round's single buy on the LADLE curve into scoops. The sum of the scoops is exactly the buy." },
      { t: "The seed", b: "ORAO VRF delivers one seed per round with a proof. Nobody picks it, us included. Every roll is derived from that seed, the entry's owner and its index, so any round can be recomputed in a browser." },
      { t: "The curve", b: "Each round makes one buy on the LADLE bonding curve, so the price steps up; each sell back steps it down, at the curve price, with 0 fee." },
      { t: "The keepers", b: "Sealing, requesting the seed and settling are permissionless steps. Anyone can run them for a small bounty written in the program." },
      { t: "Today", b: "This site runs on demo data in your browser while the program is tested. It is not deployed or audited yet; the status page says what is done and what is not." },
    ],
    status: "Security and status",
  },

  brand: {
    label: "Brand",
    title: "The d is the ladle.",
    lede: "The word is drawn, not typeset: its d is a ladle holding one ball. The symbol is that d alone.",
    markTitle: "The mark",
    markBody: "A ladle hanging by its hole, holding one scoop. Used for avatars, the favicon and the app tile. The ball is always saffron on dark grounds and never changes colour for a state or a result.",
    waysTitle: "Five ways to wear it.",
    ways: [
      { name: "Primary", sample: "#16120F", src: "mark", hex: "cream and saffron on charcoal", role: "the site, the X avatar, social cards" },
      { name: "Light", sample: "#F6EEE3", src: "markLight", hex: "charcoal and tomato on cream", role: "print and documents" },
      { name: "Hall", sample: "#3A2618", src: "markBrass", hex: "brass and saffron on walnut", role: "signage inside the hall" },
      { name: "Tile", sample: "#FF5A36", src: "avatarTomato", hex: "charcoal ladle, cream ball, on tomato", role: "the app tile and stickers" },
      { name: "One colour", sample: "#16120F", src: "markMono", hex: "currentColor", role: "engraving, stamps, one-ink print; the ball's gap is cut out" },
    ],
    paletteTitle: "Every colour has one job.",
    paletteBody: "A result never gets a colour. The smallest and the largest scoop are always the same size and the same cream.",
    /** hexes come from config/brand.ts (BRAND.colors), so the page and the brand file never drift */
    palette: [
      { key: "charcoal", name: "Charcoal", role: "the ground, the plates and the wells" },
      { key: "cream", name: "Cream", role: "text, and everything that is yours: your note, your scoop, your tag" },
      { key: "saffron", name: "Saffron", role: "the ball, never a state or a result" },
      { key: "tomato", name: "Tomato", role: "the one action on screen, with a charcoal label; the app tile" },
      { key: "oxblood", name: "Oxblood", role: "the hall's velvet" },
      { key: "walnut", name: "Walnut", role: "the hall's panels" },
      { key: "brass", name: "Brass", role: "the hall's fittings, in the 3D only" },
      { key: "lacquer", name: "Lacquer", role: "retired from the interface" },
    ],
    typeTitle: "One family, drawn like the word.",
    typeDisplay: "Figtree 900 with its single-storey a (ss01), the a of the wordmark: headlines, figures and the main key.",
    typeText: "Figtree 450 to 700 for text and the interface, tabular figures wherever a number can change.",
    typeSeed: "Seeds and addresses take ss02, so 0, O, l and I never look alike.",
    dontTitle: "Please don't.",
    dontCrowd: "NEW",
    clearNote: "Clear space: one ball diameter (36 units) all round the word, drawn here as the dashed line.",
    clearAria: "The wordmark inside its clear space of one ball diameter",
    size16: "16 px, on its tile",
    charTitle: "Twelve guests.",
    charBody: "Kenney Cube Pets (CC0), each with a scarf in one of the six identity colours. A character is who you are; it never shows how a scoop turned out.",
    donts: [
      "Typeset the word in any font. Use the drawn wordmark.",
      "Recolour the ball for a state or a result.",
      "Stretch, rotate, outline or add a shadow or gradient.",
      "Put anything inside the clear space: one ball diameter around the word.",
      "Set it on a busy photograph without a solid ground.",
    ],
    dlTitle: "The files.",
    dlBody: "Generated by app/scripts/make-brand.mjs from one geometry. Always use these files; never redraw the logo.",
    download: "Download",
    creditsTitle: "Credits.",
    creditsBody: "Every model, texture, sound and font that ships, with its source, its author and its licence. CC0 means public domain; credit is given anyway.",
  },

  win: {
    label: "Verify",
    served: "served {date}.",
    closed: "Closed",
    closedV: "{date}, {n} slots ago",
    pot: "Pot",
    entries: "Entries",
    bought: "Tokens bought",
    seed: "Seed",
    copy: "Copy the seed",
    copied: "Copied",
    run: "Recompute the draws",
    running: "Recomputing…",
    runNote: "Runs in your browser from the seed and the entries.",
    listTitle: "The players, in arrival order",
    colN: "No.",
    colName: "Player",
    colIn: "SOL in",
    colLadle: "LADLE",
    colM: "×",
    share: "Share round {n}",
    recentTitle: "The latest rounds.",
    none: "No served round with this number.",
    rebuilt: "Rebuilt in your browser from the demo plan. Demo rounds are simulated in each browser, so entries made in another tab are not in this one.",
    noneSub: "Rounds show up here once they are served.",
  },
} as const;

/**
 * The home's scroll tour (v21): one chapter per camera stop, in page order.
 * Headlines and bodies reuse P where the section already said it; `index`
 * names each stop in the side index; `label` places it ("1 of 8").
 */
export const TOUR_COPY = {
  label: "The tour of the hall",
  how: {
    label: "1 of 8 · How a round plays",
    index: "The round",
    beats: [
      { t: "Join", b: "Everyone pays in at the same price." },
      { t: "Seal", b: "At slot 92 the drum locks. No entry, no exit." },
      { t: "Draw", b: "One ORAO VRF seed, with a public proof." },
      { t: "Serve", b: "One buy on the curve, cut into scoops." },
    ],
  },
  room: {
    label: "2 of 8 · The room",
    index: "The room",
    l1: "Everyone",
    l2: "in one room.",
    body: "Every player of the round is on the felt, seated in the order they arrived, never by result. Past sixty, the next players stand on the tiers, beside everyone watching.",
    players: "players in round No. {n}",
    seats: "places on the felt",
  },
  scoop: {
    label: "3 of 8 · The scoop",
    index: "The scoop",
    body: "The ladle serves the round's one buy, cut into scoops by its seed: one price for all, different sizes, an exact sum.",
  },
  curve: {
    label: "4 of 8 · The curve",
    index: "The curve",
    l1: "One buy",
    l2: "per round.",
    body: "Each round's buy steps the price up and each sell steps it down. The ticker round the stage reads them as they happen.",
    nowAfter: "curve price now, after {n} rounds",
    nowUnit: "SOL per 1M LADLE",
  },
  books: {
    label: "5 of 8 · Open books",
    index: "Open books",
    entered: "Entered",
    toCurve: "Bought on the curve",
    fees: "Platform, host and keeper fees",
    body: "The bear keeps the books: every figure is summed from the program's events since round 1.",
    identity: "Entered = bought on the curve + platform, host and keeper fees, to the last base unit.",
    rcp: "Recompute any round",
  },
  hosts: {
    label: "6 of 8 · Hosts",
    index: "Hosts",
    foundingLink: "The founding hosts",
    cmds: [
      { c: "!scoop 0.25", r: "enters this round at the same price as everyone" },
      { c: "!odds", r: "the law in one line" },
      { c: "!verify 1099", r: "recomputes a served round from its seed" },
    ],
  },
  gen: {
    label: "7 of 8 · Genesis",
    index: "Genesis",
    l1: "Genesis",
    l2: "profiles.",
  },
  qa: { label: "8 of 8 · Questions", index: "Questions" },
} as const;

/** `{name}` placeholders, as in i18n. */
export function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}
