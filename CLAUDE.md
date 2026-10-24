# VILLA DE GD — 로고 스팅

Three.js로 만든 2초 / 16:9 로고 스팅. 실시간 페이지(`sting.html`)와 헤드리스 렌더러
(`tools/render.mjs`)가 **같은 코드**를 공유한다. 구조와 사용법은 `README.md` 참고.

주요 명령: `npm start` (미리보기) · `npm run render` (1080p 마스터) · `npm run probe` (스틸)

타이밍·색을 바꿀 때는 `src/config.js` 의 `BEATS` 와 `mood` 만 고치면 된다.
`src/timeline.js` 의 `state(t)` 는 시간의 순수 함수여야 한다 — 여기에 부수효과를 넣으면
모션 블러 샘플링과 렌더 재현성이 깨진다.

## 미디어 도구 (클라우드 세션에서 필요할 때)

클라우드 컨테이너는 세션마다 초기화되므로 ffmpeg·yt-dlp·auto-editor·rembg 가 **깔려 있지
않다.** 미디어 작업 요청이 들어오면 먼저 실행할 것:

```bash
bash tools/setup-media.sh
```

1~2분 걸리고 u2net 모델(168MB)을 받는다. 미디어 작업이 없는 세션에서는 실행하지 말 것.

### 배경 제거 — 라이선스 주의

rembg 2.x 의 **기본 모델(BRIA RMBG-2.0)은 비상업용 전용**이다. 빌라드지디는 영업 목적이므로
고객 사진·홍보물에는 반드시 무료 모델(u2net, Apache-2.0)을 명시한다:

```bash
rembg i -m u2net 입력.jpg 출력.png
```

배경이 단색이 아니라 **부드러운 그라데이션·글로우**인 이미지는 u2net 단독으로는 화면 전체에
옅은 막이 남는다. 그럴 때 알파 매팅을 켠다:

```bash
rembg i -m u2net -a -ae 12 입력.png 출력.png
```

## 이 환경에서 안 되는 것 (확인 완료, 2026-10)

송출 정책이 아래 호스트에 403을 반환한다. 되는 척하지 말고 그대로 알릴 것.

| 막힌 것 | 영향 |
| --- | --- |
| `huggingface.co` | Whisper·Docling 모델 내려받기 불가 → 음성인식·문서분석 사용 불가 |
| `openaipublic.azureedge.net`, HF 미러 | Whisper 대체 경로도 없음 |
| `www.youtube.com` | yt-dlp 는 설치되지만 유튜브 내려받기 실패 |
| 도커 데몬 (`/var/run/docker.sock` 없음) | Immich·Stirling·Open WebUI 등 컨테이너 도구 불가 → NAS에서 돌려야 함 |
| 타 저장소 GitHub raw | 이 세션은 `schickhon2-boop/villadegd-sch-1d4f0db2` 만 접근 가능 |

열려 있는 것: pypi, npm, GitHub 릴리스 에셋(`objects.githubusercontent.com`).

`tools/setup-media.sh` 가 실행할 때마다 위 호스트를 다시 점검하니, 정책이 바뀌면 바로 보인다.

## 저장소 상태

저장소가 비어 있던 탓에 `claude/mcp-server-install-check-jdfsqc` 가 **기본 브랜치**로 잡혀
있다. 그래서 PR을 열 대상 브랜치가 없다. PR이 필요하면 먼저 사용자에게 `main` 생성 여부를
확인할 것 — 임의로 만들지 말 것.
