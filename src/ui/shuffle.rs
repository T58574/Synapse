//! Fisher-Yates shuffle deck without replacement.
//!
//! Guarantees that every track in the active filtered list plays exactly once
//! before any track repeats, eliminating the Birthday Paradox collisions of
//! naive random selection.

#[derive(Debug, Clone, Default)]
pub struct ShuffleDeck {
    deck: Vec<usize>,
    cursor: usize,
}

impl ShuffleDeck {
    pub fn new() -> Self {
        Self {
            deck: Vec::new(),
            cursor: 0,
        }
    }

    /// Rebuilds the deck for `total_tracks`. If `pin_first` is provided,
    /// that index is placed at position 0 so playback continues from it.
    pub fn rebuild(&mut self, total_tracks: usize, pin_first: Option<usize>) {
        if total_tracks == 0 {
            self.deck.clear();
            self.cursor = 0;
            return;
        }

        let mut new_deck = generate_shuffled_indices(total_tracks, None);

        if let Some(pin) = pin_first {
            if let Some(pos) = new_deck.iter().position(|&idx| idx == pin) {
                new_deck.remove(pos);
                new_deck.insert(0, pin);
            }
        }

        self.deck = new_deck;
        self.cursor = 0;
    }

    /// Advance cursor and return the next track index in the shuffled deck.
    /// Reshuffles when the deck is exhausted, ensuring the last played track
    /// does not repeat immediately in the new cycle (if `total_tracks > 1`).
    pub fn next(&mut self, total_tracks: usize) -> Option<usize> {
        if total_tracks == 0 {
            self.deck.clear();
            self.cursor = 0;
            return None;
        }

        // If deck size is out of sync with total tracks, rebuild immediately
        if self.deck.len() != total_tracks {
            self.rebuild(total_tracks, None);
        }

        if self.deck.is_empty() {
            return None;
        }

        self.cursor += 1;
        if self.cursor >= self.deck.len() {
            // Completed a full non-repeating cycle!
            let last_played = self.deck.last().copied();
            self.deck = generate_shuffled_indices(total_tracks, last_played);
            self.cursor = 0;
        }

        self.deck.get(self.cursor).copied()
    }

    /// Move the cursor back one step (e.g. for `play_prev`).
    pub fn prev(&mut self) {
        if self.cursor > 0 {
            self.cursor -= 1;
        }
    }

    /// Current track index in the deck.
    pub fn current(&self) -> Option<usize> {
        self.deck.get(self.cursor).copied()
    }

    /// First track index in the deck (for initial playback start).
    pub fn first(&self) -> Option<usize> {
        self.deck.first().copied()
    }

    pub fn is_empty(&self) -> bool {
        self.deck.is_empty()
    }

    pub fn len(&self) -> usize {
        self.deck.len()
    }
}

/// Generates a randomized permutation of `0..len` via Fisher-Yates with xorshift64*.
/// If `exclude_first` is provided and `len > 1`, ensures `exclude_first` is not at index 0.
pub fn generate_shuffled_indices(len: usize, exclude_first: Option<usize>) -> Vec<usize> {
    if len == 0 {
        return Vec::new();
    }
    let mut deck: Vec<usize> = (0..len).collect();
    if len <= 1 {
        return deck;
    }

    let mut seed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0x9E3779B97F4A7C15);
    if seed == 0 {
        seed = 0x9E3779B97F4A7C15;
    }

    for i in (1..len).rev() {
        seed ^= seed >> 12;
        seed ^= seed << 25;
        seed ^= seed >> 27;
        let rand_val = seed.wrapping_mul(0x2545F4914F6CDD1D);
        let j = (rand_val as usize) % (i + 1);
        deck.swap(i, j);
    }

    if let Some(exclude) = exclude_first {
        if deck.len() > 1 && deck[0] == exclude {
            deck.swap(0, 1);
        }
    }

    deck
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_shuffled_indices_permutation() {
        let len = 50;
        let indices = generate_shuffled_indices(len, None);
        assert_eq!(indices.len(), len);

        let mut sorted = indices.clone();
        sorted.sort_unstable();
        let expected: Vec<usize> = (0..len).collect();
        assert_eq!(sorted, expected, "Must be an exact permutation of 0..len");
    }

    #[test]
    fn test_generate_shuffled_indices_exclude_first() {
        let len = 20;
        for _ in 0..50 {
            let indices = generate_shuffled_indices(len, Some(5));
            assert_ne!(indices[0], 5, "Index 0 must not be the excluded element");
        }
    }

    #[test]
    fn test_shuffle_deck_cycles_without_duplicates() {
        let mut deck = ShuffleDeck::new();
        let total = 10;
        deck.rebuild(total, Some(3)); // pin 3 at index 0

        assert_eq!(deck.current(), Some(3));

        let mut played = vec![deck.current().unwrap()];
        for _ in 1..total {
            let next_track = deck.next(total).unwrap();
            assert!(
                !played.contains(&next_track),
                "Should not repeat any track before deck finishes: played={:?}, next={}",
                played,
                next_track
            );
            played.push(next_track);
        }

        assert_eq!(played.len(), total);
        played.sort_unstable();
        let expected: Vec<usize> = (0..total).collect();
        assert_eq!(played, expected, "All tracks must be played exactly once in a cycle");

        // The 11th track should start a new cycle and not repeat the 10th track immediately
        let last_track = deck.current().unwrap();
        let next_cycle_start = deck.next(total).unwrap();
        assert_ne!(
            next_cycle_start, last_track,
            "New cycle must not start with the track that just played"
        );
    }

    #[test]
    fn test_shuffle_deck_prev() {
        let mut deck = ShuffleDeck::new();
        deck.rebuild(5, Some(0));
        let track1 = deck.next(5).unwrap();
        let track2 = deck.next(5).unwrap();
        assert_ne!(track1, track2);

        deck.prev();
        assert_eq!(deck.current(), Some(track1));
    }
}
