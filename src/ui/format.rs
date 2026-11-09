//! Pure formatting helpers shared by the views.

pub fn format_duration(seconds: f64) -> String {
    let total = seconds.max(0.0).round() as u64;
    format!("{:02}:{:02}", total / 60, total % 60)
}

pub fn format_total_duration(seconds: f64) -> String {
    let total = seconds.max(0.0).round() as u64;
    let (hours, mins, secs) = (total / 3600, (total % 3600) / 60, total % 60);
    if hours > 0 {
        format!("{:02}:{:02}:{:02}", hours, mins, secs)
    } else {
        format!("{:02}:{:02}", mins, secs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_durations() {
        assert_eq!(format_duration(0.0), "00:00");
        assert_eq!(format_duration(65.4), "01:05");
        assert_eq!(format_duration(-5.0), "00:00");
        assert_eq!(format_total_duration(65.0), "01:05");
        assert_eq!(format_total_duration(3725.0), "01:02:05");
    }
}
