#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Size {
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MonitorBounds {
    pub origin: Point,
    pub size: Size,
}

pub fn clamp_to_visible(position: Point, window_size: Size, monitors: &[MonitorBounds]) -> Point {
    let Some((monitor, intersection_area)) = monitors
        .iter()
        .map(|monitor| (monitor, intersection_area(position, window_size, *monitor)))
        .max_by_key(|(_, area)| *area)
    else {
        return position;
    };

    if intersection_area == 0 {
        return centered_on(window_size, monitors[0]);
    }

    Point {
        x: clamp_axis(
            position.x,
            window_size.width,
            monitor.origin.x,
            monitor.size.width,
        ),
        y: clamp_axis(
            position.y,
            window_size.height,
            monitor.origin.y,
            monitor.size.height,
        ),
    }
}

fn intersection_area(position: Point, window_size: Size, monitor: MonitorBounds) -> i64 {
    let left = i64::from(position.x).max(i64::from(monitor.origin.x));
    let top = i64::from(position.y).max(i64::from(monitor.origin.y));
    let right = (i64::from(position.x) + i64::from(window_size.width))
        .min(i64::from(monitor.origin.x) + i64::from(monitor.size.width));
    let bottom = (i64::from(position.y) + i64::from(window_size.height))
        .min(i64::from(monitor.origin.y) + i64::from(monitor.size.height));

    (right - left).max(0) * (bottom - top).max(0)
}

fn clamp_axis(position: i32, window: u32, origin: i32, screen: u32) -> i32 {
    if window >= screen {
        return origin;
    }

    let maximum = i64::from(origin) + i64::from(screen) - i64::from(window);
    i64::from(position).clamp(i64::from(origin), maximum) as i32
}

fn centered_on(window_size: Size, monitor: MonitorBounds) -> Point {
    Point {
        x: centered_axis(window_size.width, monitor.origin.x, monitor.size.width),
        y: centered_axis(window_size.height, monitor.origin.y, monitor.size.height),
    }
}

fn centered_axis(window: u32, origin: i32, screen: u32) -> i32 {
    if window >= screen {
        origin
    } else {
        (i64::from(origin) + (i64::from(screen) - i64::from(window)) / 2) as i32
    }
}

#[cfg(test)]
mod tests {
    use super::{clamp_to_visible, MonitorBounds, Point, Size};

    const WINDOW: Size = Size {
        width: 440,
        height: 680,
    };

    fn monitor(x: i32, y: i32, width: u32, height: u32) -> MonitorBounds {
        MonitorBounds {
            origin: Point { x, y },
            size: Size { width, height },
        }
    }

    #[test]
    fn keeps_a_fully_visible_position() {
        let screens = [monitor(0, 0, 1920, 1080)];

        assert_eq!(
            clamp_to_visible(Point { x: 200, y: 120 }, WINDOW, &screens),
            Point { x: 200, y: 120 }
        );
    }

    #[test]
    fn pulls_right_and_bottom_overflow_back_onscreen() {
        let screens = [monitor(0, 0, 1920, 1080)];

        assert_eq!(
            clamp_to_visible(Point { x: 1800, y: 900 }, WINDOW, &screens),
            Point { x: 1480, y: 400 }
        );
    }

    #[test]
    fn preserves_valid_negative_coordinates_on_a_left_monitor() {
        let screens = [monitor(0, 0, 1920, 1080), monitor(-1600, 0, 1600, 900)];

        assert_eq!(
            clamp_to_visible(Point { x: -900, y: 100 }, WINDOW, &screens),
            Point { x: -900, y: 100 }
        );
    }

    #[test]
    fn returns_to_the_primary_monitor_when_the_saved_monitor_is_gone() {
        let screens = [monitor(0, 0, 1920, 1080)];

        assert_eq!(
            clamp_to_visible(Point { x: -1300, y: 80 }, WINDOW, &screens),
            Point { x: 740, y: 200 }
        );
    }

    #[test]
    fn anchors_an_oversized_window_at_the_monitor_origin() {
        let screens = [monitor(-1000, -200, 800, 500)];

        assert_eq!(
            clamp_to_visible(
                Point { x: -900, y: -100 },
                Size {
                    width: 1000,
                    height: 700,
                },
                &screens,
            ),
            Point { x: -1000, y: -200 }
        );
    }
}
