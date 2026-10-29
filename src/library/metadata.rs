use std::io::Cursor;
use std::path::Path;

use lofty::file::TaggedFileExt;
use lofty::picture::PictureType;
use lofty::tag::Accessor;

/// Downscaled embedded album cover art.
#[derive(Debug, Clone, PartialEq)]
pub struct CoverArt {
    pub mime_type: String,
    pub data_url: String,
    pub png_bytes: Vec<u8>,
    pub rgba_bytes: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// Extracted audio metadata from tags or filename fallback.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct AudioMetadata {
    pub title: String,
    pub artist: String,
    pub genre: String,
    pub cover: Option<CoverArt>,
}

const MAX_COVER_DIMENSION: u32 = 300;

/// Standard Base64 encoder (RFC 4648) with padding.
pub fn base64_encode(data: &[u8]) -> String {
    const STANDARD_ALPHABET: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0];
        let b1 = if chunk.len() > 1 { chunk[1] } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] } else { 0 };

        out.push(STANDARD_ALPHABET[(b0 >> 2) as usize] as char);
        out.push(STANDARD_ALPHABET[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);

        if chunk.len() > 1 {
            out.push(STANDARD_ALPHABET[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }

        if chunk.len() > 2 {
            out.push(STANDARD_ALPHABET[(b2 & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

/// Parse fallback artist and title from filename without extension.
/// If filename has the format "Artist - Title", splits on first " - ".
/// Otherwise, treats entire filename stem as title with "Unknown Artist".
pub fn parse_filename_fallback(path: &Path) -> (String, String) {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .trim();

    if stem.is_empty() {
        return ("Unknown Artist".to_string(), "Unknown Title".to_string());
    }

    if let Some((artist_part, title_part)) = stem.split_once(" - ") {
        let artist = artist_part.trim();
        let title = title_part.trim();
        let final_artist = if artist.is_empty() {
            "Unknown Artist"
        } else {
            artist
        };
        let final_title = if title.is_empty() {
            "Unknown Title"
        } else {
            title
        };
        (final_artist.to_string(), final_title.to_string())
    } else {
        ("Unknown Artist".to_string(), stem.to_string())
    }
}

/// Downscale image to fit within max 300x300, returning raw RGBA/PNG bytes and data URL string.
pub fn process_cover_bytes(raw_bytes: &[u8]) -> Option<CoverArt> {
    if raw_bytes.is_empty() {
        return None;
    }

    let img = image::load_from_memory(raw_bytes).ok()?;
    let (orig_w, orig_h) = (img.width(), img.height());

    let resized = if orig_w > MAX_COVER_DIMENSION || orig_h > MAX_COVER_DIMENSION {
        img.resize(
            MAX_COVER_DIMENSION,
            MAX_COVER_DIMENSION,
            image::imageops::FilterType::Lanczos3,
        )
    } else {
        img
    };

    let width = resized.width();
    let height = resized.height();
    let rgba_image = resized.to_rgba8();
    let rgba_bytes = rgba_image.into_raw();

    let mut png_bytes = Vec::new();
    let mut cursor = Cursor::new(&mut png_bytes);
    resized
        .write_to(&mut cursor, image::ImageFormat::Png)
        .ok()?;

    let b64 = base64_encode(&png_bytes);
    let data_url = format!("data:image/png;base64,{b64}");

    Some(CoverArt {
        mime_type: "image/png".to_string(),
        data_url,
        png_bytes,
        rgba_bytes,
        width,
        height,
    })
}

/// Extract metadata (Title, Artist, Genre, Album Art) from an audio file.
/// If tags are missing or empty, fallbacks are inferred from the filename.
pub fn extract_metadata<P: AsRef<Path>>(path: P) -> AudioMetadata {
    let path_ref = path.as_ref();
    let (fallback_artist, fallback_title) = parse_filename_fallback(path_ref);
    let fallback_genre = "Unknown Genre".to_string();

    let Ok(tagged_file) = lofty::read_from_path(path_ref) else {
        return AudioMetadata {
            title: fallback_title,
            artist: fallback_artist,
            genre: fallback_genre,
            cover: None,
        };
    };

    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag());

    let Some(tag) = tag else {
        return AudioMetadata {
            title: fallback_title,
            artist: fallback_artist,
            genre: fallback_genre,
            cover: None,
        };
    };

    let title = tag
        .title()
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
        .unwrap_or(fallback_title);

    let artist = tag
        .artist()
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
        .unwrap_or(fallback_artist);

    let genre = tag
        .genre()
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
        .unwrap_or(fallback_genre);

    let cover = tag
        .pictures()
        .iter()
        .find(|p| p.pic_type() == PictureType::CoverFront)
        .or_else(|| tag.pictures().first())
        .and_then(|pic| process_cover_bytes(pic.data()));

    AudioMetadata {
        title,
        artist,
        genre,
        cover,
    }
}

/// Extract embedded album cover art as a Data URL string.
pub fn extract_cover_art_data_url<P: AsRef<Path>>(path: P) -> Option<String> {
    let tagged_file = lofty::read_from_path(path).ok()?;
    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag())?;

    let pic = tag
        .pictures()
        .iter()
        .find(|p| p.pic_type() == PictureType::CoverFront)
        .or_else(|| tag.pictures().first())?;

    let cover = process_cover_bytes(pic.data())?;
    Some(cover.data_url)
}

/// Determine track mood based on BPM, musical key (Camelot notation), and genre.
/// Matches the exact logic from Go's `DetermineMood`.
pub fn determine_mood(bpm: f64, key: &str, genre: &str) -> String {
    let genre = genre.to_lowercase();
    let key = key.to_uppercase();

    if genre.contains("lofi")
        || genre.contains("ambient")
        || genre.contains("chill")
        || genre.contains("classical")
        || genre.contains("relax")
    {
        return "chill".to_string();
    }

    if genre.contains("metal")
        || genre.contains("rock")
        || genre.contains("edm")
        || genre.contains("dance")
        || genre.contains("electronic")
        || genre.contains("synthwave")
    {
        if bpm > 110.0 {
            return "energetic".to_string();
        }
        return "dark".to_string();
    }

    let is_minor = key.ends_with('A');
    if bpm >= 125.0 {
        if is_minor {
            "dark".to_string()
        } else {
            "energetic".to_string()
        }
    } else if bpm >= 100.0 {
        if is_minor {
            "chill".to_string()
        } else {
            "happy".to_string()
        }
    } else if is_minor {
        "calm".to_string()
    } else {
        "peaceful".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    #[test]
    fn test_determine_mood_all_cases() {
        let cases = [
            (80.0, "8A", "lofi", "chill"),
            (130.0, "8A", "metal", "energetic"),
            (90.0, "8A", "electronic", "dark"),
            (135.0, "8A", "pop", "dark"),
            (135.0, "8B", "pop", "energetic"),
            (110.0, "8A", "pop", "chill"),
            (110.0, "8B", "pop", "happy"),
            (90.0, "8A", "pop", "calm"),
            (90.0, "8B", "pop", "peaceful"),
        ];

        for (bpm, key, genre, expected) in cases {
            let actual = determine_mood(bpm, key, genre);
            assert_eq!(
                actual, expected,
                "determine_mood({bpm}, {key}, {genre}) failed"
            );
        }
    }

    #[test]
    fn test_filename_fallback_parsing() {
        let (artist, title) = parse_filename_fallback(Path::new("Daft Punk - One More Time.mp3"));
        assert_eq!(artist, "Daft Punk");
        assert_eq!(title, "One More Time");

        let (artist, title) = parse_filename_fallback(Path::new("SoloTrack.flac"));
        assert_eq!(artist, "Unknown Artist");
        assert_eq!(title, "SoloTrack");

        let (artist, title) =
            parse_filename_fallback(Path::new("Band - Song - Remix (Extended).wav"));
        assert_eq!(artist, "Band");
        assert_eq!(title, "Song - Remix (Extended)");

        let (artist, title) = parse_filename_fallback(Path::new(""));
        assert_eq!(artist, "Unknown Artist");
        assert_eq!(title, "Unknown Title");
    }

    #[test]
    fn test_base64_encoding() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
        assert_eq!(base64_encode(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn test_cover_downscaling() {
        // Create 600x400 RGBA image
        let mut img = RgbaImage::new(600, 400);
        for pixel in img.pixels_mut() {
            *pixel = Rgba([255, 0, 128, 255]);
        }

        let mut png_bytes = Vec::new();
        img.write_to(
            &mut Cursor::new(&mut png_bytes),
            image::ImageFormat::Png,
        )
        .expect("write test png");

        let cover = process_cover_bytes(&png_bytes).expect("process cover");
        assert!(
            cover.width <= MAX_COVER_DIMENSION,
            "width should be <= 300, got {}",
            cover.width
        );
        assert!(
            cover.height <= MAX_COVER_DIMENSION,
            "height should be <= 300, got {}",
            cover.height
        );
        assert_eq!(cover.mime_type, "image/png");
        assert!(cover.data_url.starts_with("data:image/png;base64,"));
        assert_eq!(
            cover.rgba_bytes.len(),
            (cover.width * cover.height * 4) as usize
        );
    }

    #[test]
    fn test_extract_metadata_missing_file_fallback() {
        let meta = extract_metadata("nonexistent/Cyberpunk - Rebel Path.mp3");
        assert_eq!(meta.artist, "Cyberpunk");
        assert_eq!(meta.title, "Rebel Path");
        assert_eq!(meta.genre, "Unknown Genre");
        assert!(meta.cover.is_none());
    }
}
