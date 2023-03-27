root := "$(pwd)"

dev-bot-telegram:
    #!/usr/bin/env bash
    export MEDIABOT_WORKDIR="{{ root }}/.local/workdir/bot-telegram"
    export SERVICE_NAME="tg"

    mkdir -p $MEDIABOT_WORKDIR
    yarn app:bot-telegram:dev

dev-parser-reddit:
    #!/usr/bin/env bash
    export MEDIABOT_WORKDIR={{ root }}/.local/workdir/parser-reddit

    mkdir -p $MEDIABOT_WORKDIR
    yarn app:parser-reddit:dev

dev-parser-tiktok:
    #!/usr/bin/env bash
    export MEDIABOT_WORKDIR={{ root }}/.local/workdir/parser-tiktok

    mkdir -p $MEDIABOT_WORKDIR
    yarn app:parser-tiktok:dev

dev-parser-instagram:
    #!/usr/bin/env bash
    export MEDIABOT_WORKDIR={{ root }}/.local/workdir/parser-instagram

    mkdir -p $MEDIABOT_WORKDIR
    yarn app:parser-instagram:dev

dev-parser-twitter:
    #!/usr/bin/env bash
    export MEDIABOT_WORKDIR={{ root }}/.local/workdir/parser-twitter

    mkdir -p $MEDIABOT_WORKDIR
    yarn app:parser-twitter:dev

dev-parser-ytdlp:
    #!/usr/bin/env bash
    export MEDIABOT_WORKDIR={{ root }}/.local/workdir/parser-ytdlp
    export YTDLP_PATH="yt-dlp"

    mkdir -p $MEDIABOT_WORKDIR
    yarn app:parser-ytdlp:dev

dev-render:
    #!/usr/bin/env bash
    export MEDIABOT_WORKDIR={{ root }}/.local/workdir/render

    mkdir -p $MEDIABOT_WORKDIR
    yarn app:render:dev
