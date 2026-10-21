const { app, nativeImage } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { buildSync } = require('esbuild')
const { pathToFileURL } = require('node:url')
const { execFileSync } = require('node:child_process')
let count = 0
async function check(name, action) {
  await action()
  console.log(`PASS ${++count}: ${name}`)
}
app
  .whenReady()
  .then(async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'vm-media-series-'))
    app.setPath('userData', temp)
    process.env.APP_ROOT = process.cwd()
    await fs.mkdir('output', { recursive: true })
    buildSync({
      entryPoints: ['electron/media-cache.ts'],
      outfile: 'output/media-test.mjs',
      bundle: true,
      format: 'esm',
      platform: 'node',
      external: ['electron'],
    })
    buildSync({
      entryPoints: ['electron/series.ts'],
      outfile: 'output/series-test.mjs',
      bundle: true,
      format: 'esm',
      platform: 'node',
      external: ['electron', 'sql.js'],
    })
    const media = await import(pathToFileURL(path.resolve('output/media-test.mjs')).href)
    // series bundle shares its own database module; expose it in one test entry.
    buildSync({
      stdin: {
        contents: "export * from './electron/database.ts'; export * from './electron/series.ts'",
        resolveDir: process.cwd(),
        sourcefile: 'integration.ts',
      },
      outfile: 'dist-electron/series-integration.mjs',
      bundle: true,
      format: 'esm',
      platform: 'node',
      external: ['electron', 'sql.js'],
    })
    const series = await import(pathToFileURL(path.resolve('dist-electron/series-integration.mjs')).href)
    const source = path.join(temp, '中文 # 测试.mp4')
    await fs.copyFile('output/fixtures/seek #1.mp4', source)
    const stats = await fs.stat(source)
    const video = {
      id: 1,
      name: path.basename(source),
      absolutePath: source,
      fileSize: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      addedAt: stats.birthtime.toISOString(),
      durationSeconds: 40,
      folderIds: [],
    }
    let cold, warm, preview
    await check('cold local extraction writes a valid JPEG once', async () => {
      cold = await media.getMediaAssets(video)
      assert.ok(cold.thumbnail, JSON.stringify(cold))
      assert.equal(cold.cached, false)
      const size = nativeImage.createFromPath(cold.thumbnail).getSize()
      assert.ok(size.width <= 480 && size.height <= 270)
    })
    await check('warm thumbnail requests reuse the disk file and are faster', async () => {
      const before = (await fs.stat(cold.thumbnail)).mtimeMs
      warm = await media.getMediaAssets(video)
      assert.equal(warm.thumbnail, cold.thumbnail)
      assert.equal(warm.cached, true)
      assert.equal((await fs.stat(cold.thumbnail)).mtimeMs, before)
      assert.ok(warm.elapsedMs < cold.elapsedMs)
    })
    await check('preview is a small silent browser-compatible H.264 clip', async () => {
      preview = await media.getMediaAssets(video, true)
      assert.ok(preview.preview, JSON.stringify(preview))
      const info = JSON.parse(
        execFileSync(
          'ffprobe',
          ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', preview.preview],
          { windowsHide: true, encoding: 'utf8' }
        )
      )
      assert.equal(info.streams.filter((stream) => stream.codec_type === 'audio').length, 0)
      assert.equal(info.streams[0].codec_name, 'h264')
      const rate = info.streams[0].avg_frame_rate.split('/').map(Number)
      assert.ok(Math.abs(rate[0] / rate[1] - 24) < 0.01, '24fps sources must not be reduced to 10fps')
      assert.ok(Number(info.format.duration) >= 3 && Number(info.format.duration) <= 5.1)
      assert.ok((await fs.stat(preview.preview)).size < stats.size)
    })
    await check('cache survives module restart without re-decoding', async () => {
      const restarted = await import(pathToFileURL(path.resolve('output/media-test.mjs')).href + '?restart=1')
      const result = await restarted.getMediaAssets(video, true)
      assert.equal(result.preview, preview.preview)
      assert.equal(result.cached, true)
      assert.ok(result.elapsedMs < preview.elapsedMs)
      restarted.stopMediaCache()
    })
    await check('preview preserves 12/29.97fps and caps 60fps sources at 30fps', async () => {
      for (const [index, sourceRate, expected] of [
        [0, '12', 12],
        [1, '30000/1001', 30000 / 1001],
        [2, '60', 30],
      ]) {
        const file = path.join(temp, `frame-rate-${index}.mp4`)
        execFileSync(
          'ffmpeg',
          [
            '-v',
            'error',
            '-y',
            '-f',
            'lavfi',
            '-i',
            `testsrc2=size=640x360:rate=${sourceRate}`,
            '-t',
            '8',
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-pix_fmt',
            'yuv420p',
            file,
          ],
          { windowsHide: true }
        )
        const stat = await fs.stat(file)
        const result = await media.getMediaAssets(
          {
            ...video,
            id: 20 + index,
            absolutePath: file,
            fileSize: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            durationSeconds: 8,
          },
          true
        )
        assert.ok(result.preview, JSON.stringify(result))
        const info = JSON.parse(
          execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', result.preview], {
            windowsHide: true,
            encoding: 'utf8',
          })
        )
        const [numerator, denominator] = info.streams[0].avg_frame_rate.split('/').map(Number)
        assert.ok(
          Math.abs(numerator / denominator - expected) < 0.05,
          `Unexpected output rate for ${sourceRate}: ${info.streams[0].avg_frame_rate}`
        )
        assert.ok(Number(info.streams[0].duration) >= 3 && Number(info.streams[0].duration) <= 5.1)
      }
    })
    await check('old 10fps preview caches are skipped while existing covers remain reusable', async () => {
      const legacy = preview.preview.replace('.preview-r2-', '.preview-r1-')
      execFileSync(
        'ffmpeg',
        [
          '-v',
          'error',
          '-y',
          '-i',
          preview.preview,
          '-vf',
          'fps=10',
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          legacy,
        ],
        { windowsHide: true }
      )
      await fs.unlink(preview.preview)
      const result = await media.getMediaAssets(video, true)
      assert.notEqual(result.preview, legacy)
      assert.equal(result.preview, preview.preview)
      assert.equal(result.thumbnail, cold.thumbnail)
      assert.equal(result.cached, false)
      const info = JSON.parse(
        execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', result.preview], {
          windowsHide: true,
          encoding: 'utf8',
        })
      )
      const [numerator, denominator] = info.streams[0].avg_frame_rate.split('/').map(Number)
      assert.ok(Math.abs(numerator / denominator - 24) < 0.01)
    })
    await check('concurrent requests for one new file share one generation result', async () => {
      const copy = { ...video, absolutePath: path.join(temp, 'parallel.mp4'), id: 2 }
      await fs.copyFile(source, copy.absolutePath)
      const results = await Promise.all(Array.from({ length: 4 }, () => media.getMediaAssets(copy)))
      assert.ok(results[0].thumbnail)
      assert.strictEqual(results[0], results[1])
      assert.strictEqual(results[1], results[3])
    })
    await check('file fingerprint changes invalidate old covers without deleting originals', async () => {
      await fs.appendFile(source, Buffer.from([0]))
      const changed = await fs.stat(source)
      const result = await media.getMediaAssets({
        ...video,
        fileSize: changed.size,
        modifiedAt: changed.mtime.toISOString(),
      })
      assert.ok(result.thumbnail)
      assert.notEqual(result.thumbnail, cold.thumbnail)
      assert.equal((await fs.stat(source)).size, stats.size + 1)
    })
    await check('missing videos fail gracefully and negative-cache repeated errors', async () => {
      const missing = { ...video, id: 999, absolutePath: path.join(temp, 'missing.mp4') }
      const result = await media.getMediaAssets(missing)
      assert.equal(result.thumbnail, null)
      assert.ok(result.error)
      const retry = await media.getMediaAssets(missing)
      assert.ok(retry.error)
    })
    await check(
      'very short portrait clips with unknown duration still produce playable previews',
      async () => {
        const file = path.join(temp, '竖屏短片.mp4')
        execFileSync(
          'ffmpeg',
          [
            '-v',
            'error',
            '-y',
            '-f',
            'lavfi',
            '-i',
            'testsrc2=size=362x642:rate=10',
            '-t',
            '1',
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            file,
          ],
          { windowsHide: true }
        )
        const stat = await fs.stat(file)
        const result = await media.getMediaAssets(
          {
            ...video,
            id: 3,
            absolutePath: file,
            fileSize: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            durationSeconds: 0,
          },
          true
        )
        assert.ok(result.preview, JSON.stringify(result))
        const info = JSON.parse(
          execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', result.preview], {
            windowsHide: true,
            encoding: 'utf8',
          })
        )
        assert.equal(info.streams[0].codec_name, 'h264')
        assert.ok(info.streams[0].width < info.streams[0].height)
        assert.ok(Number(info.streams[0].duration) > 0)
      }
    )
    await check('random preview slots cache different source positions for 3–5 seconds', async () => {
      const another = await media.getMediaAssets(video, true, true, 5)
      assert.ok(another.preview)
      assert.notEqual(another.preview, preview.preview)
      assert.ok(preview.previewStartSeconds < 7)
      assert.ok(another.previewStartSeconds > 27)
      assert.ok(another.previewDurationSeconds >= 3 && another.previewDurationSeconds <= 5)
      const again = await media.getMediaAssets(video, true, true, 5)
      assert.equal(again.cached, true)
      assert.equal(again.preview, another.preview)
      await assert.rejects(() => media.getMediaAssets(video, true, true, 6), /参数/)
    })
    const sample = (id, name, parent = 'D:\\Media\\Videos') => ({
      ...video,
      id,
      name,
      absolutePath: path.win32.join(parent, name),
    })
    await check('numbered Chinese and English episodes match without merging unrelated titles', async () => {
      const values = [
        sample(1, '山野旅行 Part01.mp4'),
        sample(2, '山野旅行 Part02.mkv'),
        sample(3, '数学基础 第1集.mp4'),
        sample(4, '数学基础 第2集.mp4'),
        sample(5, 'Studio Road Trip.mp4'),
        sample(6, 'Studio City Nights.mp4'),
      ]
      const groups = series.suggestSeries(values, 'name')
      assert.equal(groups.length, 2)
      assert.deepEqual(
        groups.map((group) => group.videoIds).sort((a, b) => a[0] - b[0]),
        [
          [1, 2],
          [3, 4],
        ]
      )
      assert.equal(series.suggestSeries([sample(1, '旅行01.mp4'), sample(2, '旅行02.mp4')], 'name').length, 1)
    })
    await check(
      'smart directory suggestions exclude generic roots; explicit directory mode remains available',
      async () => {
        const values = [
          sample(1, 'alpha.mp4'),
          sample(2, 'bravo.mp4'),
          sample(3, '介绍.mp4', 'D:\\课程\\摄影入门'),
          sample(4, '实战.mp4', 'D:\\课程\\摄影入门'),
        ]
        assert.equal(series.suggestSeries(values, 'smart').length, 1)
        assert.equal(series.suggestSeries(values, 'directory').length, 2)
      }
    )
    const library = path.join(temp, 'library')
    await fs.mkdir(library)
    for (const name of ['旅行 Part01.mp4', '旅行 Part02.mp4', '课程 第1集.mp4', '课程 第2集.mp4', '其他.mp4'])
      await fs.copyFile(source, path.join(library, name))
    await series.ensureDatabase()
    await series.scanVideosFromDirectory(library)
    let suggestion, saved
    await check('failed series persistence rolls back in memory and permits a clean retry', async () => {
      const preview = await series.previewSeries('name')
      const rename = fs.rename
      fs.rename = async (...args) => {
        if (args[1] === preview.databasePath) throw new Error('simulated disk failure')
        return rename(...args)
      }
      try {
        await assert.rejects(() => series.applySeries(preview), /simulated disk failure/)
      } finally {
        fs.rename = rename
      }
      assert.equal((await series.getSeries()).groups.length, 0)
    })
    await check('series preview is read only; saving persists groups without moving files', async () => {
      suggestion = await series.previewSeries('name')
      assert.equal(suggestion.groups.length, 2)
      assert.equal((await series.getSeries()).groups.length, 0)
      saved = await series.applySeries(suggestion)
      assert.equal(saved.groups.length, 2)
      assert.equal((await fs.readdir(library)).length, 5)
      assert.equal((await series.getSeries()).groups.length, 2)
    })
    await check('duplicate membership and stale series previews are rejected', async () => {
      await assert.rejects(() => series.applySeries(suggestion), /变化/)
      await assert.rejects(
        () => series.saveSeries(saved.databasePath, '重复系列', saved.groups[0].videoIds),
        /已有系列/
      )
      assert.equal((await series.getSeries()).groups.length, 2)
    })
    await check('renaming and dissolving a series keep video records and physical files', async () => {
      const group = saved.groups[0]
      const renamed = await series.saveSeries(saved.databasePath, '我的旅行', group.videoIds, group.id)
      assert.equal(renamed.groups.find((item) => item.id === group.id).name, '我的旅行')
      const removed = await series.deleteSeries(saved.databasePath, group.id)
      assert.equal(removed.groups.length, 1)
      assert.equal((await series.getLibrarySnapshot()).videos.length, 5)
      assert.equal((await fs.readdir(library)).length, 5)
    })
    await check(
      'series members removed from the library do not become dangling visible entries',
      async () => {
        const state = await series.getSeries()
        const id = state.groups[0].videoIds[0]
        await series.removeVideoRecords([id])
        assert.ok(!(await series.getSeries()).groups[0].videoIds.includes(id))
        assert.equal((await fs.readdir(library)).length, 5)
      }
    )
    await check(
      'switching libraries invalidates old series suggestions and manual save targets',
      async () => {
        const preview = await series.previewSeries('name')
        const next = path.join(temp, 'second-library.sqlite')
        await fs.copyFile(preview.databasePath, next)
        await series.loadDatabaseAtPath(next)
        await assert.rejects(() => series.applySeries(preview), /变化/)
        await assert.rejects(() => series.saveSeries(preview.databasePath, '旧库分组', [1, 2]), /切换/)
      }
    )
    console.log(
      `BENCHMARK thumbnail cold=${cold.elapsedMs.toFixed(1)}ms warm=${warm.elapsedMs.toFixed(1)}ms preview generation=${preview.elapsedMs.toFixed(1)}ms`
    )
    console.log(`RESULT: ${count} media/series checks passed. Isolated data: ${temp}`)
    media.stopMediaCache()
    app.exit(0)
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
