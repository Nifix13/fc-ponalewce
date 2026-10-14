#!/bin/sh
# Przygotowuje trwaly dysk przed startem aplikacji.
#
# Baza i wgrane zdjecia MUSZA lezec na podmontowanym wolumenie - katalog
# aplikacji w kontenerze znika przy kazdym wdrozeniu. `public/uploads` jest
# dowiazaniem do /dane/uploads, wiec Next serwuje zdjecia normalnie, a
# fizycznie leza one poza kontenerem.
set -e

if ! mkdir -p /dane/uploads 2>/dev/null; then
  echo "UWAGA: /dane nie jest zapisywalny - wgrywanie zdjec nie zadziala."
  echo "Sprawdz, czy wolumen jest podmontowany pod /dane."
fi

exec node node_modules/next/dist/bin/next start
