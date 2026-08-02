use rand::{rngs::OsRng, RngCore};
use zeroize::Zeroizing;

const LOWERCASE: &[u8] = b"abcdefghijklmnopqrstuvwxyz";
const UPPERCASE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS: &[u8] = b"0123456789";
const SYMBOLS: &[u8] = b"!@#$%^&*()-_=+[]{};:,.?";

pub(crate) const MIN_PASSWORD_LENGTH: usize = 8;
pub(crate) const MAX_PASSWORD_LENGTH: usize = 128;

#[derive(Debug, Clone, Copy)]
pub(crate) struct PasswordOptions {
    pub(crate) length: usize,
    pub(crate) lowercase: bool,
    pub(crate) uppercase: bool,
    pub(crate) digits: bool,
    pub(crate) symbols: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum PasswordGeneratorError {
    InvalidLength,
    MissingCharacterClass,
    RandomSourceUnavailable,
}

fn random_index(rng: &mut OsRng, upper_bound: usize) -> Result<usize, PasswordGeneratorError> {
    let range = u64::from(u32::MAX) + 1;
    let limit = range - range % upper_bound as u64;
    loop {
        let mut bytes = [0_u8; 4];
        rng.try_fill_bytes(&mut bytes)
            .map_err(|_| PasswordGeneratorError::RandomSourceUnavailable)?;
        let value = u64::from(u32::from_le_bytes(bytes));
        if value < limit {
            return Ok((value % upper_bound as u64) as usize);
        }
    }
}

fn random_character(rng: &mut OsRng, characters: &[u8]) -> Result<u8, PasswordGeneratorError> {
    Ok(characters[random_index(rng, characters.len())?])
}

pub(crate) fn generate_password(
    options: PasswordOptions,
) -> Result<String, PasswordGeneratorError> {
    if !(MIN_PASSWORD_LENGTH..=MAX_PASSWORD_LENGTH).contains(&options.length) {
        return Err(PasswordGeneratorError::InvalidLength);
    }

    let mut classes = Vec::with_capacity(4);
    if options.lowercase {
        classes.push(LOWERCASE);
    }
    if options.uppercase {
        classes.push(UPPERCASE);
    }
    if options.digits {
        classes.push(DIGITS);
    }
    if options.symbols {
        classes.push(SYMBOLS);
    }
    if classes.is_empty() {
        return Err(PasswordGeneratorError::MissingCharacterClass);
    }

    let pool: Vec<u8> = classes
        .iter()
        .flat_map(|characters| characters.iter().copied())
        .collect();
    let mut rng = OsRng;
    let mut password = Zeroizing::new(Vec::with_capacity(options.length));

    for characters in classes {
        password.push(random_character(&mut rng, characters)?);
    }
    while password.len() < options.length {
        password.push(random_character(&mut rng, &pool)?);
    }
    for index in (1..password.len()).rev() {
        let swap_index = random_index(&mut rng, index + 1)?;
        password.swap(index, swap_index);
    }

    String::from_utf8(password.to_vec())
        .map_err(|_| PasswordGeneratorError::RandomSourceUnavailable)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn all_classes(length: usize) -> PasswordOptions {
        PasswordOptions {
            length,
            lowercase: true,
            uppercase: true,
            digits: true,
            symbols: true,
        }
    }

    #[test]
    fn generated_password_has_requested_length_and_every_selected_class() {
        for _ in 0..32 {
            let password = generate_password(all_classes(24)).unwrap();
            assert_eq!(password.len(), 24);
            assert!(password.bytes().any(|value| LOWERCASE.contains(&value)));
            assert!(password.bytes().any(|value| UPPERCASE.contains(&value)));
            assert!(password.bytes().any(|value| DIGITS.contains(&value)));
            assert!(password.bytes().any(|value| SYMBOLS.contains(&value)));
        }
    }

    #[test]
    fn generator_rejects_invalid_length_and_empty_character_selection() {
        assert_eq!(
            generate_password(all_classes(MIN_PASSWORD_LENGTH - 1)),
            Err(PasswordGeneratorError::InvalidLength)
        );
        assert_eq!(
            generate_password(PasswordOptions {
                length: 20,
                lowercase: false,
                uppercase: false,
                digits: false,
                symbols: false,
            }),
            Err(PasswordGeneratorError::MissingCharacterClass)
        );
    }
}
