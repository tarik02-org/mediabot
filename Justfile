root := `pwd`

dev-bot-telegram:
    #!/usr/bin/env bash
    export MEDIABOT_WORKDIR="{{ root }}/.local/workdir/bot-telegram"

    mkdir -p "$MEDIABOT_WORKDIR"
    cd "$MEDIABOT_WORKDIR"
    "{{ root }}/node_modules/.bin/mediabot-runner-dev" "@mediabot/bot-telegram/index.ts"

dev-parser-reddit:
    #!/usr/bin/env bash
    export MEDIABOT_WORKDIR="{{ root }}/.local/workdir/parser-reddit"

    mkdir -p "$MEDIABOT_WORKDIR"
    cd "$MEDIABOT_WORKDIR"
    "{{ root }}/node_modules/.bin/mediabot-runner-dev" "@mediabot/parser-reddit/index.ts"

dev-parser-tiktok:
    #!/usr/bin/env bash
    export MEDIABOT_WORKDIR="{{ root }}/.local/workdir/parser-tiktok"

    mkdir -p "$MEDIABOT_WORKDIR"
    cd "$MEDIABOT_WORKDIR"
    "{{ root }}/node_modules/.bin/mediabot-runner-dev" "@mediabot/parser-tiktok/index.ts"

dev-parser-instagram:
    #!/usr/bin/env bash
    export MEDIABOT_WORKDIR="{{ root }}/.local/workdir/parser-instagram"

    mkdir -p "$MEDIABOT_WORKDIR"
    cd "$MEDIABOT_WORKDIR"
    "{{ root }}/node_modules/.bin/mediabot-runner-dev" "@mediabot/parser-instagram/index.ts"

dev-parser-twitter:
    #!/usr/bin/env bash
    export MEDIABOT_WORKDIR="{{ root }}/.local/workdir/parser-twitter"

    mkdir -p "$MEDIABOT_WORKDIR"
    cd "$MEDIABOT_WORKDIR"
    "{{ root }}/node_modules/.bin/mediabot-runner-dev" "@mediabot/parser-twitter/index.ts"

dev-parser-ytdlp:
    #!/usr/bin/env bash
    export MEDIABOT_WORKDIR="{{ root }}/.local/workdir/parser-ytdlp"

    mkdir -p "$MEDIABOT_WORKDIR"
    cd "$MEDIABOT_WORKDIR"
    "{{ root }}/node_modules/.bin/mediabot-runner-dev" "@mediabot/parser-ytdlp/index.ts"

dev-app-render:
    #!/usr/bin/env bash
    export MEDIABOT_WORKDIR="{{ root }}/.local/workdir/app-render"

    mkdir -p "$MEDIABOT_WORKDIR"
    cd "$MEDIABOT_WORKDIR"
    "{{ root }}/node_modules/.bin/mediabot-runner-dev" "@mediabot/app-render/index.ts"
