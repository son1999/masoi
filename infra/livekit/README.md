# LiveKit (self-host) — dev setup

Voice SFU cho game ma sói. Hai cách chạy: tự host (file này) hoặc dùng LiveKit Cloud.

## Tự host bằng Docker

```bash
docker compose -f infra/livekit/docker-compose.yml up -d
```

Mặc định lắng nghe ở:

- `ws://localhost:7880` — signaling
- TCP 7881, UDP 50000-50100 — media

Khớp `apps/server/.env`:

```ini
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=dev-secret-32-chars-min-aaaaaaaaaaa
```

Đổi key/secret trong [livekit.yaml](livekit.yaml) trước khi expose ra ngoài. Secret tối thiểu 32 ký tự.

Tắt:
```bash
docker compose -f infra/livekit/docker-compose.yml down
```

## LiveKit Cloud (không cần Docker)

1. Đăng ký https://cloud.livekit.io (không cần thẻ).
2. Tạo project, lấy `URL`, `API Key`, `API Secret` từ dashboard.
3. Đặt vào `apps/server/.env`:

```ini
LIVEKIT_URL=wss://<your-project>.livekit.cloud
LIVEKIT_API_KEY=API...
LIVEKIT_API_SECRET=...
```

Cùng SDK nên đổi giữa hai mode chỉ là đổi env var, không sửa code.
