#!/bin/bash
set -e

echo "Cleaning old artifacts..."
rm -rf node_modules package-lock.json dist src-tauri/target

echo "Installing dependencies..."
npm install

echo "Generating Tauri icons..."
npx @tauri-apps/cli@2.0.0 icon branding/seacat-notes-icon.png

echo "Building frontend..."
npm run build

echo "Building macOS app bundle and DMG..."
cd src-tauri
cargo tauri build

echo ""
echo "Build finished."
echo "Check output under:"
echo "  src-tauri/target/release/bundle/dmg/"
echo "  src-tauri/target/release/bundle/macos/"
