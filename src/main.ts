import { StrictMode, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'
import App from './App'

const rootElement = document.getElementById('app')

if (!rootElement) {
  throw new Error('无法找到应用挂载节点')
}

createRoot(rootElement).render(
  createElement(StrictMode, null, createElement(App)),
)
