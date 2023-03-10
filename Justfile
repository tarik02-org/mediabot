imageName := "mediabot"
containerEngine := "podman"

build-dev:
    {{ containerEngine }} build . --target dev --tag {{ imageName }}/dev

build-app:
    {{ containerEngine }} build . --target app --tag {{ imageName }}/app

dev: build-dev
    {{ containerEngine }} run -it --rm --network host --volume $(pwd):/app {{ imageName }}/dev bash
