# Thư mục âm thanh

Đặt các file MP3 sound effect cho game vào thư mục này, **đúng tên dưới đây**.

Tải miễn phí từ [pixabay.com/sound-effects](https://pixabay.com/sound-effects) — Pixabay Content License cho dùng thương mại + không cần ghi nguồn.

## Danh sách file cần có

| Tên file | Search URL gợi ý | Mô tả |
|---|---|---|
| `wolf_howl.mp3` | https://pixabay.com/sound-effects/search/wolf-howl/ | Tiếng sói hú khi vào pha đêm |
| `rooster.mp3` | https://pixabay.com/sound-effects/search/rooster/ | Gà gáy khi vào pha bình minh |
| `birds_morning.mp3` | https://pixabay.com/sound-effects/search/birds-morning/ | Chim hót sáng (phát sau gà gáy ~0.9s) |
| `countdown_tick.mp3` | https://pixabay.com/sound-effects/search/clock-tick/ | Beep tick mỗi giây 5,4,3,2 trong vote |
| `countdown_final.mp3` | https://pixabay.com/sound-effects/search/buzzer/ | Beep cuối khi còn 1s |
| `death_scream.mp3` | https://pixabay.com/sound-effects/search/scream/ | Tiếng hét khi có người chết |
| `gavel.mp3` | https://pixabay.com/sound-effects/search/gavel/ | Tiếng búa gõ khi có người bỏ phiếu |
| `magic_chime.mp3` | https://pixabay.com/sound-effects/search/magic-chime/ | Chime khi tiên tri soi xong |
| `heal.mp3` | https://pixabay.com/sound-effects/search/heal/ | Sparkle khi phù thủy cứu |
| `poison.mp3` | https://pixabay.com/sound-effects/search/poison/ | Bubbling khi phù thủy đầu độc |
| `victory_village.mp3` | https://pixabay.com/sound-effects/search/victory-fanfare/ | Fanfare khi phe dân thắng |
| `victory_wolves.mp3` | https://pixabay.com/sound-effects/search/evil-laugh/ | Cười ác / wolf howl khi phe sói thắng |
| `phase_bell.mp3` | https://pixabay.com/sound-effects/search/notification-bell/ | Chuông nhẹ khi vào pha sói |

## Hướng dẫn

1. Mở từng URL search.
2. Chọn 1 file ưng ý (nghe preview trên Pixabay).
3. Bấm **Download** → chọn MP3.
4. Đổi tên file thành đúng tên cột "Tên file" ở bảng trên.
5. Đặt vào thư mục này (`apps/web/public/sounds/`).

## Fallback

Code đã `.catch()` mọi lỗi `play()`. File thiếu → im lặng, console không lỗi đỏ. Bạn có thể bổ sung file dần — visual effect (dơi bay, vignette, shake countdown, 💀 pop, sparkle, confetti, sói diễu hành) vẫn chạy độc lập.
