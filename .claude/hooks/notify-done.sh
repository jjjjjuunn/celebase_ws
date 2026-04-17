#!/bin/bash
# Stop 알림 — Claude 응답 완료 시 macOS 알림 (terminal-notifier 사용)

echo "notify-done.sh 실행됨 ($(date))" >> ~/.claude/hook-debug.log
terminal-notifier -title "Claude Code" -message "작업이 완료되었습니다." -sound Glass 2>&1 >> ~/.claude/hook-debug.log

exit 0
