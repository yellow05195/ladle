/**
 * What the demo room says. Friendly, plain and honest: the regulars talk
 * about the hall, the mechanism and their own limits; nobody celebrates a
 * big scoop, promises a result, talks up the price or chases a loss.
 * chat/test/parity.test.ts runs every line here through the repo's copy
 * rules (tests/forbidden-words.ts and app/scripts/copy-lint.mjs lists).
 *
 * Placeholders: {n} round, {prev} previous round, {nick} the viewer,
 * {species} the speaker's animal, {e} entries, {sol} the speaker's entry,
 * {seed} first characters of the seed.
 *
 * No imports: Node's test runner loads this file as is.
 */

/** The regulars of the demo hall (nicknames follow the profile rule). */
export const DEMO_NAMES = [
  "marlo", "tessa_k", "juno", "olive_b", "pip", "quill", "rook", "ana_v", "bo_lin", "cyrus", "dee_dee", "fenn", "gus", "hana",
  "ivo", "jules", "kit_m", "lark", "mika", "nell", "otto", "pia", "remy", "sana", "theo_g", "uma", "vic", "wren", "yuki", "zed",
  "ines", "kofi", "lea_r", "milo", "nora", "oskar", "paz", "rafa", "saoirse", "tomas", "ulla", "vera", "wim", "xavi", "yara",
  "zoe_p", "bram", "cleo", "dario", "elif", "farid", "greta", "hugo_b", "iris", "jonas", "kaia", "luca", "maren", "nico", "odile",
];

/** The few who talk most (the rest mostly watch, and sometimes say one thing). */
export const DEMO_TALKERS = ["marlo", "tessa_k", "juno", "olive_b", "quill", "kofi", "yara", "remy", "hana"];

/** Said now and then, whatever the round is doing. */
export const IDLE_LINES = [
  "evening all",
  "hi hall",
  "the bear's bow tie is a whole mood",
  "that drum sound is very satisfying",
  "keeping it to 0.05 a round tonight, that's my limit",
  "just watching for a bit",
  "checked round {prev} with !verify, sum in = sum out",
  "sold back right after the split, no fee on the sell",
  "the 20% cap keeps any one entry from taking over a round",
  "anyone else here from the stream?",
  "which animal is everyone? I'm a {species}",
  "the drum is lovely tonight",
  "first time here, how do I join?",
  "type !scoop and an amount",
  "where does the seed come from?",
  "ORAO VRF, it lands a few seconds after the seal",
  "teal scarf crew, hello",
  "is the curve the same for everyone?",
  "the fox at the door waved at me",
  "I like that the seed is public. you can redo the split yourself",
  "the felt on the stage looks great",
  "love the scarves in here",
  "nice to see the stands this full",
  "I sit out every other round, keeps it relaxed",
  "hello from Lyon",
  "hi from Lisbon",
  "evening from Montreal",
  "my {species} keeps bobbing its head, it's so silly",
  "drum turns, seed lands, split done. I like how quick it is",
  "you can sell back whenever, at the curve price",
  "a round is about 20 seconds, good for a coffee break",
  "I always look at !odds before I enter",
  "the house only takes the 1% on entry. the draw itself is neutral",
  "each round buys on the curve, each sell-back goes the other way",
  "the ticker under the stage is handy",
  "watching the seed land never gets old",
  "logging off after this round, good night",
  "back. what did I miss?",
  "same price for everyone, different scoop. still a neat idea",
  "the bellhop fox has the best job in here",
  "quiet one tonight, I like it",
];

/** A question, then someone else answers a few seconds later. */
export const DIALOGUES: Array<[string, string]> = [
  ["first time here. so everyone pays the same price per entry?", "yes, same price. the seed decides how the scoop is split"],
  ["how long does the seed take?", "a few seconds most rounds, longer when the oracle is slow"],
  ["what does the cap do?", "no single entry can be more than 20% of a round"],
  ["can I get out after the split?", "yes, sell back at the curve price, there's no fee on the sell"],
  ["is the split checkable?", "yes, !verify opens the proof. sum in = sum out every time"],
  ["where does the fee go?", "1% on entry to the platform, plus a host fee if a streamer runs the room"],
  ["what decides who gets the bigger scoop?", "only the seed. same price for everyone, the draw is random"],
  ["does the house take a side?", "no, the pot is conserved. the house neither wins nor loses on the draw"],
];

/** Reactions to the round, by phase. */
export const PHASE_LINES: Record<"open" | "sealed" | "seeded" | "settled", string[]> = {
  open: ["new round, the drum is open", "round {n} is open", "here we go, round {n}", "round {n}, who's in?"],
  sealed: ["sealed. waiting on the seed", "drum's closed, seed requested", "{e} of us in this one", "now we wait for the oracle"],
  seeded: ["seed is in", "there's the seed", "seed {seed}, check it later with !verify", "seed landed, splitting now"],
  settled: [
    "split done. sum in = sum out again",
    "the ladle pours them out in arrival order, nice touch",
    "every ball rolls to its owner, I like watching that",
    "same price, different scoops, as advertised",
    "selling back now",
    "keeping mine for a bit",
    "good night all, see you tomorrow",
    "the spread looked like the usual one",
  ],
};

/** What an entrant on the stage says about their own entry. */
export const ENTRY_LINES = ["in for {sol} SOL this round", "{sol} SOL in, as usual", "putting {sol} SOL in this one"];

/** When the viewer says their first line. */
export const GREETINGS = ["hi {nick}!", "welcome {nick}", "hey {nick}, nice {species}", "evening {nick}", "o/ {nick}"];

/** When the viewer asks about one of these words, the matching answer. */
export const HELP_TOPICS: Array<[string[], string]> = [
  [["seed", "oracle", "random", "vrf", "draw"], "the seed comes from the oracle once the round closes. it decides the split, nothing else"],
  [["cap", "20%", "whale"], "no single entry can be more than 20% of a round"],
  [["fee", "fees", "house", "host"], "1% on entry to the platform, plus a host fee if a streamer runs the room. the draw itself is neutral"],
  [["sell", "exit", "cash"], "you can sell back after the split, at the curve price. no fee on the sell"],
  [["verify", "proof", "check", "fair", "rigged"], "typing !verify opens the proof of the last round. sum in = sum out"],
  [["price", "same", "pay"], "everyone pays the same price into a round. the seed decides how the scoop is split"],
  [["pot", "total"], "typing !pot shows what's in the round right now"],
  [["odds", "chance", "spread"], "type !odds to see how past rounds spread"],
  [["enter", "join", "play", "scoop"], "take a seat, then type !scoop with an amount, like !scoop 0.05"],
];

/** When the viewer asks something ("?") that no topic matches. */
export const HELP_REPLIES = [
  "type !odds to see how past rounds spread",
  "typing !pot shows what's in the round right now",
  "typing !verify opens the proof of the last round",
  "the sum in always equals the sum out. the seed only decides the split",
  "the about page explains the whole mechanism",
  "you can sell back any time after the split, at the curve price",
];
