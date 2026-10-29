pub mod close_entry;
pub mod close_window;
pub mod create_integration;
pub mod create_market;
pub mod enter;
pub mod fulfill;
pub mod open_window;
pub mod refund_entry;
pub mod refund_window;
pub mod request_vrf;
pub mod seal;
pub mod sell;
pub mod sell_back;
pub mod settle_page;
pub mod tally_page;
pub mod wind_down;

// Glob re-exports: `#[program]` needs the `__client_accounts_*` modules
// generated next to each Accounts struct to be visible at the crate root.
pub use close_entry::*;
pub use close_window::*;
pub use create_integration::*;
pub use create_market::*;
pub use enter::*;
pub use fulfill::*;
pub use open_window::*;
pub use refund_entry::*;
pub use refund_window::*;
pub use request_vrf::*;
pub use seal::*;
pub use sell::*;
pub use sell_back::*;
pub use settle_page::*;
pub use tally_page::*;
pub use wind_down::*;

use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Allocate, Assign, CreateAccount, Transfer};

use crate::consts::ENTRY_SEED;
use crate::errors::LadleError;
use crate::state::Entry;

/// Load entry `index` of `window` from a remaining account: owner and
/// discriminator (via `Account`), writability, fields, and the canonical PDA
/// ["entry", window, entry.owner].
///
/// `index` is the position the page expects; `entry.index` was assigned by
/// `enter` from the window's counter, so each index exists exactly once and
/// a page can neither skip nor repeat an entry.
pub(crate) fn load_entry<'info>(
    acc: &'info AccountInfo<'info>,
    window_key: &Pubkey,
    index: u32,
) -> Result<Account<'info, Entry>> {
    require!(acc.is_writable, LadleError::EntryNotWritable);
    let entry: Account<'info, Entry> = Account::try_from(acc)?;
    require!(
        entry.window == *window_key && entry.index == index,
        LadleError::InvalidEntryPda
    );
    let expected = Pubkey::create_program_address(
        &[ENTRY_SEED, window_key.as_ref(), entry.owner.as_ref(), &[entry.bump]],
        &crate::ID,
    )
    .map_err(|_| LadleError::InvalidEntryPda)?;
    require!(expected == acc.key(), LadleError::InvalidEntryPda);
    Ok(entry)
}

/// Create the PDA `target` (`space` bytes, owned by `owner`, rent paid by
/// `payer`), signed with `signer_seeds`; returns the lamports `payer` put in.
/// Same behaviour as Anchor's `init`: an address someone already sent
/// lamports to is topped up, allocated and assigned instead of created, so
/// pre-funding a future PDA cannot block it.
pub(crate) fn create_pda_account<'info>(
    payer: &AccountInfo<'info>,
    target: &AccountInfo<'info>,
    space: usize,
    signer_seeds: &[&[u8]],
    owner: &Pubkey,
) -> Result<u64> {
    let rent = Rent::get()?.minimum_balance(space);
    let system = system_program::ID;
    let current = target.lamports();
    if current == 0 {
        system_program::create_account(
            CpiContext::new_with_signer(
                system,
                CreateAccount { from: payer.clone(), to: target.clone() },
                &[signer_seeds],
            ),
            rent,
            space as u64,
            owner,
        )?;
        return Ok(rent);
    }
    let top_up = rent.max(1).saturating_sub(current);
    if top_up > 0 {
        system_program::transfer(
            CpiContext::new(system, Transfer { from: payer.clone(), to: target.clone() }),
            top_up,
        )?;
    }
    system_program::allocate(
        CpiContext::new_with_signer(system, Allocate { account_to_allocate: target.clone() }, &[signer_seeds]),
        space as u64,
    )?;
    system_program::assign(
        CpiContext::new_with_signer(system, Assign { account_to_assign: target.clone() }, &[signer_seeds]),
        owner,
    )?;
    Ok(top_up)
}
