const fs = require('fs')
const path = require('path')

exports.default = async function afterPack(context) {
  try {
    const { appOutDir } = context

    if (!appOutDir) {
      console.warn('⚠ appOutDir is undefined, skipping WASM copy')
      return
    }

    // 复制 WASM 文件到应用输出目录
    const wasmSource = path.join(appOutDir, '..', '..', 'dist-electron', 'sql-wasm.wasm')
    const wasmDest = path.join(appOutDir, 'sql-wasm.wasm')

    if (fs.existsSync(wasmSource)) {
      fs.copyFileSync(wasmSource, wasmDest)
      console.log(`✓ Copied WASM to ${wasmDest}`)
    } else {
      console.warn(`⚠ WASM not found at ${wasmSource}`)
    }
  } catch (error) {
    console.error('Error in afterPack:', error.message)
  }
}
