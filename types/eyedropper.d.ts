// EyeDropper API type definitions
declare global {
  interface Window {
    EyeDropper: {
      new (): EyeDropper
    }
  }

  interface EyeDropper {
    open(): Promise<{ sRGBHex: string }>
  }
}

export {}
