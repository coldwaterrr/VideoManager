The local media cache uses FFmpeg to extract JPEG thumbnails and encode small, silent H.264 preview clips. Run `node scripts/prepare-media-tools.cjs` before packaging. Existing local tools are reused; missing Windows x64 tools are downloaded from the pinned 9.0.2 essentials archive and checked against its SHA-256. `--download` forces this verified download. Executables are excluded from Git.

FFmpeg project and source: https://ffmpeg.org/

The local Windows package includes the existing `9.0.2-essentials_build-www.gyan.dev` executable, built with GPLv3 and libx264. Its license is included as `FFmpeg-LICENSE.txt`. Upstream source releases: https://ffmpeg.org/releases/ ; Windows build provider and build/source details: https://www.gyan.dev/ffmpeg/builds/ . FFmpeg remains a separate executable invoked for local caching.

Pinned archive: https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip

SHA-256: `60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba`

`FFmpeg-README.txt` preserves the provider's source commit and bundled-library details.
