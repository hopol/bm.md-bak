export function logSafeError(context: string, error: unknown) {
  const errorLike = isRecord(error) ? error : {}

  console.error(context, {
    type: error instanceof Error ? error.name : typeof error,
    code: typeof errorLike.code === 'string' ? errorLike.code : undefined,
    status: typeof errorLike.status === 'number' ? errorLike.status : undefined,
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
