# Opening another session on acme/web with the progress spinner (fetch → worktree →
# pull → container). Stops at "Session … running." — the attach (ssh/docker) is never shown.
Output docs/assets/cli-open.gif

Set Shell "bash"
Set FontSize 17
Set Width 1100
Set Height 420
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 60ms
Set WindowBar Colorful

Hide
Type `export PATH="$DEMO_HOME/bin:$PATH" HOME="$DEMO_HOME" DEV_DEVD_URL="http://127.0.0.1:$DEMO_PORT" PS1="\[\e[38;5;111m\]~/code \[\e[38;5;245m\]❯\[\e[0m\] "; alias dev="bun $PWD/cli/src/main.ts"; clear`
Enter
Sleep 500ms
Show

Sleep 600ms
Type "dev acme/web"
Sleep 400ms
Enter
Wait+Screen /New session/
Sleep 1200ms
Down
Sleep 700ms
Enter
Wait+Screen@20s /Session dev-\S+ running/
Sleep 2s
Hide
Ctrl+C
