#!/bin/bash
# 우리집 가계부 서버를 이 맥에 설치한다.
#   1) ~/budget-server 에 server.js 를 받고  2) PIN 정하기 + 구글 시트 데이터 가져오기
#   3) 맥을 켤 때마다 자동으로 실행되게 등록  4) Tailscale Funnel 로 폰에서 닿는 https 주소 만들기
# 다시 실행해도 안전하다 (데이터는 건드리지 않고 server.js 만 새로 받는다).
set -e
DIR="$HOME/budget-server"
BASE="${BUDGET_BASE:-https://pigjjun.github.io/budget/server}"
PORT=8787
LABEL="io.github.pigjjun.budget"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }

NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "Node.js 가 없어요. https://nodejs.org 에서 LTS 버전을 설치한 뒤 이 스크립트를 다시 실행해 주세요."
  echo "(Homebrew 가 있으면:  brew install node)"
  exit 1
fi
if ! "$NODE" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)'; then
  echo "Node.js 18 이상이 필요해요. 지금 버전: $("$NODE" -v)"; exit 1
fi

say "1/4  서버 파일 받기 → $DIR"
mkdir -p "$DIR"
# 받은 파일을 먼저 검사한 뒤 바꾼다 (Node 24는 .js로 끝나지 않는 파일을 검사하지 못해서 이름을 .new.js로)
curl -fsSL "$BASE/server.js" -o "$DIR/server.new.js"
"$NODE" --check "$DIR/server.new.js"
mv "$DIR/server.new.js" "$DIR/server.js"

say "2/4  PIN 과 데이터"
"$NODE" "$DIR/server.js" setup
if ! "$NODE" -e 'process.exit(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).pin ? 0 : 1)' "$DIR/data/config.json" 2>/dev/null; then
  echo "PIN 설정이 끝나지 않았어요. 다시 실행해 주세요:  bash $DIR/install.sh"; exit 1
fi

if [ "$(uname)" = "Darwin" ]; then
  say "3/4  맥을 켜면 자동으로 실행되게 등록"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/server.js</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/server.log</string>
  <key>StandardErrorPath</key><string>$DIR/server.log</string>
</dict></plist>
PL
  # 이미 등록돼 있으면 내렸다가 다시 올린다 (최신 macOS 방식, 안 되면 예전 방식)
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load "$PLIST"
  sleep 2
else
  say "3/4  (맥이 아니라서 자동 실행 등록은 건너뜀)  직접 실행: node $DIR/server.js"
fi
# 켜지는 데 몇 초 걸릴 수 있어서 최대 15초 기다린다
UP=""
for i in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:$PORT/api/ping" >/dev/null 2>&1; then UP=1; break; fi
  sleep 1
done
if [ -n "$UP" ]; then echo "서버가 켜졌어요 (127.0.0.1:$PORT)"
else
  echo "서버가 응답하지 않아요. 아래 내용을 Claude 에게 보내 주세요:"
  echo "----- server.log (마지막 20줄)"; tail -n 20 "$DIR/server.log" 2>/dev/null || echo "(로그 없음)"
  if [ "$(uname)" = "Darwin" ]; then echo "----- launchd"; launchctl print "gui/$(id -u)/$LABEL" 2>&1 | grep -E "state|last exit|program|path" | head -8; fi
  echo "-----"
fi

say "4/4  폰에서 닿는 주소 만들기 (Tailscale Funnel)"
TS="$(command -v tailscale || true)"
[ -z "$TS" ] && [ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ] && TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale
if [ -z "$TS" ]; then
  cat <<MSG
Tailscale 이 아직 없어요.
  1) https://tailscale.com/download 에서 맥용을 설치하고 로그인 (무료, 구글 계정으로 가능)
  2) 이 스크립트를 다시 실행:  bash $DIR/install.sh
MSG
  cp "$0" "$DIR/install.sh" 2>/dev/null || true
  exit 0
fi
cp "$0" "$DIR/install.sh" 2>/dev/null || true
if "$TS" funnel --bg "$PORT"; then
  URL="$("$TS" status --json | "$NODE" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log("https://"+JSON.parse(s).Self.DNSName.replace(/\.$/,""))}catch(e){}})')"
  say "끝났어요."
  echo "가계부 서버 주소:  $URL"
  echo "이 주소를 Claude 에게 알려 주세요. 앱이 이 주소를 쓰도록 바꿔 드려요."
  echo "(확인:  curl $URL/api/ping  →  {\"ok\":true,...} 가 나오면 정상)"
else
  echo
  echo "Funnel 을 켜지 못했어요. 위에 나온 링크를 브라우저에서 열어 Funnel(과 HTTPS)을 허용한 뒤 다시 실행해 주세요:"
  echo "  bash $DIR/install.sh"
fi
