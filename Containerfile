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

RUN curl -fsSL https://deb.nodesource.com/setup_19.x | bash - && \
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
RUN node .yarn/releases/yarn-3.4.1.cjs install --immutable


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

ADD resources/fonts/Twemoji.ttf /usr/share/fonts/truetype/
RUN fc-cache -f -v


####################################################################################################
# dev
####################################################################################################

FROM runtime AS dev

WORKDIR /app


####################################################################################################
# app
####################################################################################################

FROM runtime AS app

WORKDIR /app
COPY --from=node_modules /app/node_modules /app/node_modules

ADD . .
RUN yarn prisma generate
