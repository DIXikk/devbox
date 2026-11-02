# `dev ls` against the demo devd. Run via tools/demo/tapes/record.sh (from the repo root).
Output docs/assets/cli-ls.gif

Set Shell "bash"
Set FontSize 17
Set Width 1100
Set Height 520
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
Type "dev ls"
Sleep 400ms
Enter
Sleep 4s
