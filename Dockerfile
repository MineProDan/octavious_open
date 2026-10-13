FROM node:22-slim

WORKDIR /app

# fontconfig is required by the `canvas` package (Cairo/Pango) to render any
# text at all. Without it, ctx.fillText() silently draws "notdef" boxes for
# every character, even plain ASCII. We also bundle our own TTFs under
# assets/fonts and register them explicitly in utils/pets/render.js, so
# rendering doesn't depend on which fonts (if any) happen to be installed.
RUN apt-get update \
  && apt-get install -y --no-install-recommends fontconfig \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

CMD ["sh", "-c", "node deploy_commands.js && node index.js"]