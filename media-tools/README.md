The local media cache uses FFmpeg to extract JPEG thumbnails and encode small, silent H.264 preview clips. Run `node scripts/prepare-media-tools.cjs` to copy an existing local FFmpeg executable before packaging. Executables are excluded from Git.

FFmpeg project and source: https://ffmpeg.org/

The local Windows package includes the existing `9.0.2-essentials_build-www.gyan.dev` executable, built with GPLv3 and libx264. Its license is included as `FFmpeg-LICENSE.txt`. Upstream source releases: https://ffmpeg.org/releases/ ; Windows build provider and build/source details: https://www.gyan.dev/ffmpeg/builds/ . FFmpeg remains a separate executable invoked for local caching.
