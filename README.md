# VILLA DE GD — 3D 로고 스팅

금속 테두리 동전 모양 배지에 로고를 새기고, 빙글 돌다 멈춘 뒤 표면에 빛이 한 번 쓱 지나가는
2초짜리 로고 스팅입니다. Three.js로 실시간 렌더링하며, 같은 코드를 헤드리스 크로미움에서
프레임 단위로 돌려 영상 마스터를 뽑습니다.

| 항목 | 값 |
| --- | --- |
| 지속 시간 | 2.00초 (120프레임 @ 60fps) |
| 화면 비율 | 16:9 — 1920×1080 |
| 색·분위기 | 회색 (그래파이트 배경 + 니켈 메탈) |
| 3D | Three.js r186, WebGL2 |

## 바로 보기

```bash
npm install
npm start          # http://127.0.0.1:5173/sting.html
```

ES 모듈을 쓰기 때문에 `file://` 로 직접 열면 동작하지 않습니다. 위 서버를 거쳐야 합니다.
화면을 클릭하거나 스페이스바를 누르면 다시 재생됩니다.

## 영상 뽑기

```bash
npm run render           # 1920×1080 → mp4 / ProRes / webm / gif + 포스터
npm run render:draft     # 1280×720, 샘플 적게 — 빠른 확인용
npm run probe            # 주요 순간만 스틸로
```

결과물은 `out/` 에 떨어집니다.

| 파일 | 쓰임 |
| --- | --- |
| `villadegd-sting-1080p.mp4` | H.264 / yuv420p — 일반 재생, 발표자료, SNS |
| `villadegd-sting-prores422hq.mov` | ProRes 422 HQ — 편집 툴에 올려 추가 편집할 때 |
| `villadegd-sting-1080p.webm` | VP9 — 웹페이지 임베드 |
| `villadegd-sting-preview.gif` | 960px 미리보기 |
| `villadegd-sting-poster.png` | 마지막 프레임 스틸 |

렌더러 옵션: `--size=1280x720`, `--samples=6`, `--formats=mp4,gif`, `--keep`(PNG 시퀀스 보존),
`--probe=0,0.5,1.5`.

## 타임라인

`src/timeline.js` 의 `state(t)` 하나가 2초 전체를 결정합니다. 시간의 순수 함수라서 몇 번을
렌더링해도 결과가 완전히 동일하고, 모션 블러가 한 프레임 안에서 같은 곡선을 여러 번 샘플링할
수 있습니다.

| 시각 | 일어나는 일 |
| --- | --- |
| 0.00 – 0.30s | 배지가 살짝 커지며 들어옴, 타격 플래시 |
| 0.00 – 1.18s | 1.9바퀴 회전, quart 이징으로 급감속 |
| 1.18 – 1.35s | 멈추면서 아주 약하게 흔들리며 자리 잡음 |
| 1.21 – 1.80s | 빛이 표면을 사선으로 한 번 통과 (1.50s 가 정점) |
| 1.80 – 2.00s | 고정, 아주 느린 드리프트로 마무리 |

리타이밍은 `src/config.js` 의 `BEATS` 를 고치면 됩니다.

## 실제 로고 파일 끼우기

지금은 보내주신 로고 **파일이 없어서** `VILLA / DE GD` 워드마크를 Cinzel(로마 각명체)로 직접
조판해 새겼습니다. 진짜 아트워크가 있으면 아래 경로 중 하나에 넣기만 하면 자동으로 교체됩니다.

```
assets/villadegd-logo.svg      ← 우선순위 1
assets/villadegd-logo.png
assets/villadegd.svg
assets/villadegd.png
```

- 투명 배경 PNG/SVG면 알파 채널을 새김 마스크로 씁니다.
- 불투명 이미지면 어두운 쪽을 새김으로 읽습니다 (흰 바탕에 검은 로고).
- 정사각 캔버스에 여백 포함 2048px 이상 권장.
- 차지 비율은 `CONFIG.logo.imageScale`, 테두리 장식은 `CONFIG.logo.frame` 으로 조절합니다.

## 구조

```
sting.html          실시간 재생 페이지
src/config.js       만질 만한 숫자 전부 (포맷, 비례, 색, 카메라, 모션 블러)
src/timeline.js     2초 전체를 시간의 순수 함수로
src/textures.js     회색 스튜디오 환경맵, 밀링 테두리, 높이맵 → 노멀맵
src/logo.js         새김 마스크 (로고 파일 또는 워드마크 조판)
src/badge.js        동전 지오메트리, 금속 머티리얼, 광택 스윕 셰이더
src/fx.js           배경, 글로우, 먼지, 모션 블러 누산 + 그레이딩
tools/render.mjs    헤드리스 렌더 → PNG 시퀀스 → 인코딩
tools/serve.mjs     로컬 정적 서버
artifact/index.html 공유용 페이지 (Claude Artifact 배포본)
vendor/             Three.js r186 (MIT)
assets/fonts/       Cinzel (OFL)
```

## 만듦새 메모

- **동전 본체**는 평면 디스크가 아니라 회전체(lathe)입니다. 가운데 오목한 필드 → 베벨 →
  볼록한 폴리시드 림 → 밀링된 측면으로 이어지는 단면을 돌려서 만듭니다. 회전 중 측면이
  스치듯 보일 때 밀링 자국이 빛을 긁습니다.
- **새김**은 텍스처로 그린 게 아니라 높이맵을 소벨 필터로 돌려 만든 노멀맵입니다. 베벨 벽이
  따로 계산되어 있어서, 빛이 지나갈 때 글자 모서리만 번쩍입니다.
- **금속의 밝기**는 거의 전부 환경맵에서 옵니다. 정면을 보는 평평한 면은 카메라 쪽을 반사하기
  때문에, 환경맵 u=0.75 자리에 큰 소프트박스를 하나 둬야 얼굴이 살아납니다.
- **모션 블러**는 후처리가 아니라 누산입니다. 한 프레임 안에서 셔터가 열린 구간을 최대 14번
  나눠 렌더링해 더합니다. 회전이 빠른 앞부분만 샘플을 많이 쓰고, 멈춘 뒤로는 1번만 씁니다.

## 라이선스

- Three.js — MIT (`vendor/THREE-LICENSE.txt`)
- Cinzel — SIL Open Font License 1.1
- 스팅 코드와 디자인 — 빌라드지디 내부용
