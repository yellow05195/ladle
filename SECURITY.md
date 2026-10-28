# SECURITY

Status on 2026-10-27: **not deployed, not audited, never executed on a cluster.** The SBF build runs end to end on LiteSVM (`tests/cu-bench`, windows of 1 to 2048 entries); no devnet run yet. This file states what the program can and cannot do, what was revoked by design, where the trust lies, and what remains unverified.

## 1. What the program can never do (by construction, checked by `tests/idl-authority.ts`)

| power | status |
|---|---|
| move a stake out of escrow other than to the curve + fees at settlement, or back to its owner on refund | **does not exist** |
| cancel or modify an entry after `seal` | **does not exist** (no instruction) |
| change the fee rate, the roll law, the per-entry cap, the window length, the VRF timeout after creation | **does not exist**; constants are `pub const`, market fields are written only in `create_market` |
| pause, freeze or gate `claim`, `sell_back`, `sell`, `refund_window`, `refund_entry` | **does not exist**; no flag, no authority, only the owner's signature where the owner receives funds |
| mint more of the launched token | **revoked**: mint authority set to `None` after the single initial mint; freeze authority `None` |
| take part of the draw | **does not exist**; the only revenue paths are the fixed market creation fee and the 1.00 % platform fee on the window total, both hard-coded |
| choose or influence the random seed | **does not exist** for the program, the creator, the keeper or participants (see §3) |
| decide between "draw" and "refund" after seeing the value | **does not exist**: `refund_window` fails if the ORAO request is fulfilled, `fulfill` fails once refunding, and the refund only opens after `vrf_timeout_slots` |

The instruction set is closed: `create_integration, create_market, open_window, enter, seal, request_vrf, fulfill, tally_page, settle_page, refund_window, refund_entry, claim, sell_back, sell, close_entry, close_window`. Sixteen. Nothing else. Everything but the user-signed money paths is permissionless.

The two cleanup instructions only return rent. `close_entry` closes an Entry whose share is fully claimed or sold back (or whose stake is refunded) and sends the rent to `entry.owner`, whoever calls it. `close_window` closes a finished Window and its escrow once every entry is closed and the window is no longer the market's active one, and sends the rent to `window.opener`. Quote found in the escrow at that point can only have been sent there from outside; it is swept into the market's quote vault, so dusting an escrow cannot block the close. Neither can move a stake or a share, and neither pays the caller.

**Entries.** An Entry is the PDA `["entry", window, owner]`: one entry per wallet per window, a second `enter` from the same wallet fails with `AlreadyEntered` (so the per-entry cap is also a per-wallet cap; several wallets remain possible, and the law gives a split entry the same expectation as a single one). The entry's index is assigned by `enter` from the window counter, in arrival order; `tally_page` / `settle_page` check every remaining account's owner, discriminator, window, index and PDA, so a page cannot skip, repeat or substitute an entry. `enter` creates the account itself (instead of Anchor's `init`, to return `AlreadyEntered` rather than a system error) with the same behaviour as `init`: an address someone pre-funded with lamports is topped up, allocated and assigned, so pre-funding a wallet's future Entry address cannot block it (`tests/cu-bench` pre-funds one before it enters).

**One entry, no draw.** A window that closes with exactly one entry goes from `seal` straight to `Drawn`, with an all-zero seed and no ORAO request. Its weight is the whole weight sum (`a * (a * (ROLL_MAX + r) - a * r) = ROLL_MAX * a^2 = S`), so its share is the whole curve buy whatever the roll; the fees are the same. Nothing is random, so nothing can be grinded or withheld, and there is no refund path (nothing to wait for). Windows with two or more entries always go through ORAO.

`create_market` also writes the launched token's Metaplex metadata (name, symbol, URI) through a hand-rolled CPI to Token Metadata `CreateMetadataAccountV3`, with `is_mutable = false`: nobody, the program included, can change it afterwards. The metadata PDA and the Metaplex program id are checked by address.

## 2. Update authority

**Current status: NOT DEPLOYED. The upgrade authority has not been revoked because there is no deployment yet.**

Before mainnet, exactly one of the two is to be stated on the home page and here:

1. **Revoked after audit** (`solana program set-upgrade-authority --final`) — recommended. A program whose law can change is a program whose draw can be biased by its operator; revocation is the only configuration where the honesty of the draw does not depend on us.
2. **72-hour minimum timelock** with an on-chain event on every proposed upgrade, via a timelock program holding the upgrade authority. Acceptable only as an interim stage before (1).

There is no third option. Until one of the two is in place, this product is not honest and must not be advertised as such.

## 3. Randomness: where the trust is, and the attack surface

Source: **ORAO VRF** (`VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y`). Switchboard On-Demand was evaluated and excluded: its randomness implementations were deprecated by Switchboard in September 2026 (see `research/G2.md`). Measured latency, cost and the full attack analysis are in `research/G2.md`.

Flow (windows with 2 or more entries; 0 entries settle at `seal`, 1 entry is `Drawn` at `seal` without randomness, see §1): `seal` (only at or after `close_slot`) fixes `vrf_seed = sha256("ladle:vrf:v1" ‖ window ‖ close_slot ‖ entry_count ‖ entries_commitment)`, where `entries_commitment` is folded on every entry. `request_vrf` (only in `Sealed`) asks ORAO for that seed. ORAO's fulfilment authorities each sign the seed (Ed25519, deterministic) and the program XORs the signatures; the result is the 64-byte `seed` of the window. Every roll is `sha256(seed ‖ owner ‖ index)` — recomputable by anyone.

| attacker | what they control | why it fails |
|---|---|---|
| **participant** | when and how much to enter (one entry per wallet), how many wallets, their own pubkey (grinding) | the seed does not exist before `close_slot`, and `entries_commitment` includes every entry, so grinding a pubkey changes the seed for everyone, unpredictably; entries after close are rejected; there is no cancel |
| **window creator / market creator** | market parameters at creation, nothing afterwards | no parameter touches the seed; the creator cannot enter after close, cannot request before seal, cannot refund before timeout |
| **keeper / request payer** | when to call `seal`, `request_vrf`, `fulfill`, `tally_page`, `settle_page`, `refund_window` | all are permissionless, so withholding only delays until someone else calls; the value cannot be dodged (`MustFulfill`); the keeper cannot pick the seed (fixed at seal from sealed data); the keeper cannot re-request (one request per window) |
| **slot leader** | transaction ordering and inclusion within a slot, the slot hash | the program never reads slot hashes, block hashes, timestamps or any chain entropy (`tests/idl-authority.ts` greps for it); ordering entries changes `entries_commitment` but the leader cannot predict ORAO's signatures over the resulting seed |
| **ORAO fulfilment authorities** | their signing keys | **this is the residual trust.** Signatures are deterministic, so a colluding quorum could compute the outcome as soon as the seed is fixed (at `seal`) — but not before the last entry has landed, and they cannot enter after close. They could, in collusion with an entrant who enters last, choose to *withhold* fulfilment on a bad outcome and force a timeout refund (denial, not profit). We accept this trust because every on-chain alternative is worse (leader-influenceable). |

Assumption to **verify on devnet** before mainnet: ORAO `fulfill_v2` keeps the request account (reallocated to the fulfilled layout) and does not close it. The program treats a missing request account as a hard error on the refund path for this reason.

## 4. Accounting invariants

Proven at the base unit by `tests/props/run.ts` on 10,000 adversarial windows (reference TypeScript law, line-by-line twin of `programs/ladle/src/law.rs`, cross-checked by `tests/vectors/law-vectors.json`):

- `Σ shares == tokens_out` for every window; each share within 1 unit of its exact value; remainder spread by cumulative quota rounding, never dropped, never dumped on the last entry.
- `Σ stakes == to_curve + platform + bounty + host` on settlement; `Σ stakes == Σ refunds` on refund.
- Curve rounding is always against the trader; selling back an entire window returns at most what the curve received.
- Settlement is paginated with a strict cursor: no entry skipped or double-counted, replays are no-ops. `settle_page` carries `floor(tokens_out * cum / S)` from one entry to the next instead of recomputing it (one 256-bit division per entry); `programs/ladle/src/tests_pages.rs` checks it share for share against the two-division step on whole windows of 1, 2, 50, 100, 500 and 2048 entries, and `tests/cu-bench` checks `sum(shares) == tokens_out` and the fee split at the lamport on the SBF build for the same sizes.
- `roll_sum` and `tokens_out` are frozen at finalize; the curve executes once per window, in window order.

## 5. Token-2022 and the quote mint

`create_market` rejects any quote mint with a freeze authority, and any Token-2022 quote mint carrying `TransferFeeConfig`, `TransferHook` or `PermanentDelegate`, each with its own error. A transfer fee would break the lamport-exact accounting; a hook or permanent delegate would let a third party block or seize escrow.

## 6. Known limitations and what is NOT verified

- **No devnet run.** The SBF build (397,832 bytes, `opt-level = "z"`) runs end to end on LiteSVM with the mainnet feature set (`tests/cu-bench`: open, 1 to 2048 enters, seal, fulfill from an ORAO-shaped account, tally/settle pages, sell back, claim, close everything); `cargo clippy --lib` is clean and 25 host tests pass. ORAO itself (request CPI, fulfilment) is not exercised there. The Anchor suite in `tests/anchor` (same-slot bundles, a 50-wallet crowd, request-after-seal, no-cancel, refund on silent VRF, pagination over 500 entries, Token-2022 rejection, bias attempts from the four positions) is written and **has not been run**.
- **No audit.**
- Compute units are measured on LiteSVM (`docs/DEPLOY.md`): the heaviest page (`settle_page`, 48 entries) uses 528,738 of the 1.4M ceiling; the keeper sends pages of 20 / 28 entries (what fits a legacy transaction) with an explicit compute-unit limit. `request_vrf` is not measured (no ORAO program in LiteSVM).
- The program carries no error sentences (`#[msg]`) and no "Instruction: X" log line, to keep the deploy rent down; logs name the error (`Error Code: AlreadyEntered`), clients map it to a sentence (`sdk/src/errors.ts`).
- Placeholder program id and platform treasury pubkey must be replaced before deployment.
- **Single randomness provider.** Switchboard's randomness is deprecated (September 2026); ORAO is the only viable VRF on Solana today. If ORAO stops, every pending window refunds in full after 900 slots and no new window can be drawn. Measured ORAO latency (n=314, mainnet, 2026-10-16/17): median 4 s, p90 72 s, p99 113 s; windows are pipelined on a fixed slot grid and settle in order, so a slow oracle delays settlement, never entry or refund.
- A dead keeper only delays (everything is permissionless), but a window stuck in `Sealed` with no request ever sent refunds only after the timeout counted from `sealed_slot`.
- Empty windows and refunded windows must be processed in settlement order; a window waiting behind a pending one is delayed, not lost.

## 7. Reporting

Security contact: to be set before deployment. Until then, open an issue in the repository.
