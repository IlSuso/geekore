import type { CSSProperties } from 'react'

declare module 'react' {
  interface Attributes {
    style?: CSSProperties
  }
}
