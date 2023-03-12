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
        {{ imageName }}/dev yarn app:bot-telegram

dev-parser-reddit: build-dev
    {{ containerEngine }} run \
        -it \
        --rm \
        --network host \
        --volume $(pwd):/app \
        --env MEDIABOT_WORKDIR=/app/.local/workdir/parser-reddit \
        {{ imageName }}/dev yarn app:parser-reddit
