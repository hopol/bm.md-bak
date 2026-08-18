declare global {
  interface ScalarReferenceInstance {
    destroy: () => void
  }

  interface Window {
    Scalar: {
      createApiReference: (selector: string, config: {
        url: string
        theme?: string
        customCss?: string
      }) => ScalarReferenceInstance
    }
  }
}

export {}
