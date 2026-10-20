/// <reference types="vite-plugin-electron/electron-env" />
/// <reference path="../src/global.d.ts" />
declare namespace NodeJS {
  interface ProcessEnv { APP_ROOT: string; VITE_PUBLIC: string }
}
