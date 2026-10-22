# Obraz dla Northflanka, Fly.io albo czegokolwiek, co uruchamia kontenery.
#
# Dwie decyzje warte wyjasnienia:
#
# 1. Debian (slim), nie Alpine. Projekt uzywa `sharp` do obrobki zdjec, a ta
#    biblioteka miewa klopoty z gotowymi plikami pod musl. Debian oszczedza
#    godziny szukania, czemu przerobka herbu nie dziala na serwerze.
#
# 2. Bez trybu `standalone`. Pakuje on wylacznie serwer strony, a nam potrzebne
#    sa takze skrypty w `scripts/` i moduly `.ts`, ktore uruchamia Node
#    bezposrednio. Obraz wychodzi wiekszy, ale zachowuje sie identycznie jak
#    na laptopie.

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Dla czytelnosci logow. Kod liczy czas lig jawnie po warszawsku
# i NIE polega na tym ustawieniu - patrz src/lib/czas.ts.
ENV TZ=Europe/Warsaw
# Baza i wgrane zdjecia leza na trwalym dysku podpietym pod /dane.
ENV DB_PATH=/dane/dane.db

COPY --from=build /app ./
COPY deploy/entrypoint.sh /entrypoint.sh

# Zdjecia maja lezec na wolumenie, nie w kontenerze - stad dowiazanie.
RUN rm -rf public/uploads  && ln -s /dane/uploads public/uploads  && mkdir -p /dane  && chmod +x /entrypoint.sh  && chown -R node:node /dane /app

USER node
EXPOSE 3000
CMD ["/entrypoint.sh"]
