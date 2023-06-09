####################################################################################################
# base
####################################################################################################

FROM docker.io/library/debian:latest AS base

ARG DEBIAN_FRONTEND=noninteractive
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true

RUN sed -i'.bak' 's/$/ contrib/' /etc/apt/sources.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        chromium \
        ttf-bitstream-vera \
        fontconfig \
        ttf-mscorefonts-installer \
        ffmpeg \
        python3

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

RUN rm -rf /var/lib/apt/lists/*

RUN corepack enable yarn


####################################################################################################
# node_modules
####################################################################################################

FROM base AS node_modules

WORKDIR /app
ADD .yarn ./.yarn
ADD package.json yarn.lock .yarnrc.yml .

ADD packages/app/package.json ./packages/app/
ADD packages/app-render/package.json ./packages/app-render/
ADD packages/bot-discord/package.json ./packages/bot-discord/
ADD packages/bot-telegram/package.json ./packages/bot-telegram/
ADD packages/broker/package.json ./packages/broker/
ADD packages/parser-instagram/package.json ./packages/parser-instagram/
ADD packages/parser-reddit/package.json ./packages/parser-reddit/
ADD packages/parser-tiktok/package.json ./packages/parser-tiktok/
ADD packages/parser-twitter/package.json ./packages/parser-twitter/
ADD packages/parser-ytdlp/package.json ./packages/parser-ytdlp/
ADD packages/prisma/package.json ./packages/prisma/
ADD packages/resources/package.json ./packages/resources/
ADD packages/runner/package.json ./packages/runner/
ADD packages/runner-dev/package.json ./packages/runner-dev/
ADD packages/utils/package.json ./packages/utils/

RUN node .yarn/releases/yarn-3.6.0.cjs install --immutable


####################################################################################################
# ytdlp
####################################################################################################

FROM base AS ytdlp

RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/download/2023.03.04/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp


####################################################################################################
# runtime
####################################################################################################

FROM base AS runtime

COPY --from=ytdlp /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp

ADD packages/resources/assets/fonts/Twemoji.ttf /usr/share/fonts/truetype/
RUN fc-cache -f -v


####################################################################################################
# dev
####################################################################################################

FROM runtime AS dev

ENV NODE_ENV development

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ssh \
        git \
        && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app


####################################################################################################
# app
####################################################################################################

FROM runtime AS app

ENV NODE_ENV production

WORKDIR /app
COPY --from=node_modules /app/node_modules /app/node_modules

ADD . .
RUN yarn prisma generate

RUN node .yarn/releases/yarn-3.6.0.cjs workspaces focus --all --production
