#!/usr/bin/env bash
# 클라우드 세션용 미디어 도구 설치 (ephemeral 컨테이너는 매번 초기화되므로 재실행용)
#
#   bash tools/setup-media.sh
#
# 설치 대상은 "이 환경에서 실제로 끝까지 작동하는 것"만 담았습니다.
# 모델 서버가 차단되어 쓸 수 없는 도구(Whisper / Docling / Demucs / PaddleOCR)는
# 일부러 제외했습니다. 아래 '차단 확인' 절에서 현재 정책을 다시 점검합니다.

set -euo pipefail

echo "==> ffmpeg"
if ! command -v ffmpeg >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  apt-get install -y -q --no-install-recommends ffmpeg
fi
ffmpeg -version | head -1

echo "==> 파이썬 도구 (yt-dlp / auto-editor / rembg)"
pip3 install -q --upgrade yt-dlp auto-editor "rembg[cli]" certifi

echo "==> 무료 라이선스 배경제거 모델(u2net) 미리 받기"
# rembg 2.x 기본 모델은 BRIA RMBG-2.0 이고 상업적 사용은 별도 계약이 필요합니다.
# u2net(Apache-2.0)은 제한이 없으므로 이쪽을 미리 받아 둡니다.
python3 - <<'PY'
from rembg import new_session
new_session("u2net")
print("u2net 준비 완료")
PY

echo
echo "==> 설치 확인"
printf '  ffmpeg       %s\n' "$(ffmpeg -version | head -1 | cut -d' ' -f3)"
printf '  yt-dlp       %s\n' "$(yt-dlp --version)"
printf '  auto-editor  %s\n' "$(auto-editor --version)"
printf '  rembg        %s\n' "$(rembg --version 2>&1 | awk '{print $NF}')"

echo
echo "==> 차단 확인 (403 이면 이 세션에서 못 씁니다)"
for h in huggingface.co www.youtube.com openaipublic.azureedge.net; do
  # curl 은 CONNECT 거부 시 종료코드 56 과 함께 '000' 을 찍으므로 둘 다 본다.
  if code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://$h" 2>/dev/null); then :; else code=000; fi
  if [ "$code" = "000" ] || [ -z "$code" ]; then state="차단"; else state="열림 (HTTP $code)"; fi
  printf '  %-30s %s\n' "$h" "$state"
done

cat <<'NOTE'

주의
  · 배경제거를 상업적으로 쓸 때는 반드시 무료 모델을 지정하세요:
        rembg i -m u2net 입력.jpg 출력.png
    옵션 없이 쓰면 비상업용 라이선스 모델(BRIA RMBG-2.0)이 걸립니다.
  · yt-dlp 는 설치되지만 유튜브가 네트워크 정책에서 막혀 있어 실제 내려받기는 실패합니다.
    로컬 파일 작업과 허용된 사이트에만 쓸 수 있습니다.
NOTE
