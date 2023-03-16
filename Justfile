imageName := "mediabot"
containerEngine := "podman"

build-dev:
    {{ containerEngine }} build . --target dev --tag {{ imageName }}/dev

build-app:
    {{ containerEngine }} build . --target app --tag {{ imageName }}/app

dev: build-dev
    {{ containerEngine }} run -it --rm --network host --volume $(pwd):/app {{ imageName }}/dev bash

dev-bot-telegram: build-dev
    {{ containerEngine }} run \
        -it \
        --rm \
        --network host \
        --volume $(pwd):/app \
        --env MEDIABOT_WORKDIR=/app/.local/workdir/bot-telegram \
        --env SERVICE_NAME=tg \
        {{ imageName }}/dev yarn app:bot-telegram:dev

dev-parser-reddit: build-dev
    {{ containerEngine }} run \
        -it \
        --rm \
        --network host \
        --volume $(pwd):/app \
        --env MEDIABOT_WORKDIR=/app/.local/workdir/parser-reddit \
        {{ imageName }}/dev yarn app:parser-reddit:dev

dev-parser-tiktok: build-dev
    {{ containerEngine }} run \
        -it \
        --rm \
        --network host \
        --volume $(pwd):/app \
        --env MEDIABOT_WORKDIR=/app/.local/workdir/parser-tiktok \
        {{ imageName }}/dev yarn app:parser-tiktok:dev

dev-parser-instagram: build-dev
    {{ containerEngine }} run \
        -it \
        --rm \
        --network host \
        --volume $(pwd):/app \
        --env MEDIABOT_WORKDIR=/app/.local/workdir/parser-instagram \
        {{ imageName }}/dev yarn app:parser-instagram:dev
