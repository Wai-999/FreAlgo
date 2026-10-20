#!/bin/sh
# Runs the production build the same way the Docker `web` image does (Next.js standalone output).
set -e
cp -R public .next/standalone/
mkdir -p .next/standalone/.next
cp -R .next/static .next/standalone/.next/
cd .next/standalone
exec node --env-file-if-exists=../../.env server.js
