// Reads what an LND macaroon grants, from its identifier, so the Connect
// Lightning Fork action can refuse anything but a read-only one (D42).
//
// Binary macaroon v2: version byte 2, then fields of (type, length, data),
// uvarints: the identifier (type 2) in the header, which ends with type 0,
// then the caveats. LND's identifier: byte 3, then a protobuf MacaroonId
// with repeated ops (field 3), each an entity (1) and its actions (2).

const uvarint = (b: Uint8Array, i: number): [number, number] => {
  let x = 0
  for (let shift = 0; ; shift += 7) {
    if (i >= b.length || shift > 49) throw new Error('truncated')
    const c = b[i++]
    x += (c & 0x7f) * 2 ** shift
    if (c < 0x80) return [x, i]
  }
}

const field = (b: Uint8Array, i: number): [Uint8Array, number] => {
  const [length, start] = uvarint(b, i)
  if (start + length > b.length) throw new Error('truncated')
  return [b.subarray(start, start + length), start + length]
}

const identifier = (macaroon: Uint8Array): Uint8Array => {
  if (macaroon[0] !== 2) throw new Error('not a binary macaroon (v2)')
  let i = 1
  let id: Uint8Array | undefined
  for (;;) {
    const [type, next] = uvarint(macaroon, i)
    if (type === 0) break
    const [data, after] = field(macaroon, next)
    if (type === 2) id = data
    i = after
  }
  if (!id) throw new Error('macaroon has no identifier')
  return id
}

/** Each op as entity and actions, e.g. { entity: 'offchain', actions: ['read'] } */
export const macaroonOps = (macaroon: Uint8Array) => {
  const id = identifier(macaroon)
  if (id[0] !== 3) throw new Error('not an LND macaroon')

  const ops: { entity: string; actions: string[] }[] = []
  const body = id.subarray(1)
  for (let i = 0; i < body.length; ) {
    const [key, next] = uvarint(body, i)
    if ((key & 7) !== 2) throw new Error('unexpected field in macaroon id')
    const [value, after] = field(body, next)
    i = after
    if (key >> 3 !== 3) continue // nonce, storage id

    const op = { entity: '', actions: [] as string[] }
    for (let j = 0; j < value.length; ) {
      const [opKey, opNext] = uvarint(value, j)
      const [text, opAfter] = field(value, opNext)
      j = opAfter
      const s = Buffer.from(text).toString('utf8')
      if (opKey >> 3 === 1) op.entity = s
      else if (opKey >> 3 === 2) op.actions.push(s)
    }
    ops.push(op)
  }
  return ops
}

/**
 * The grants a read-only macaroon must not have: any action but read, and
 * any `uri` op, which grants named RPC calls (payments among them).
 */
export const beyondReadOnly = (ops: { entity: string; actions: string[] }[]) =>
  ops.flatMap(({ entity, actions }) =>
    entity === 'uri'
      ? actions.map((uri) => `uri ${uri}`)
      : actions.filter((a) => a !== 'read').map((a) => `${entity}:${a}`),
  )

/** Hex, or base64 / base64url, as Lightning Fork's dashboard or a file gives it */
export const decodeMacaroon = (text: string): Buffer => {
  const t = text.replace(/\s+/g, '')
  if (/^[0-9a-fA-F]+$/.test(t) && t.length % 2 === 0)
    return Buffer.from(t, 'hex')
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(t)) return Buffer.from(t, 'base64')
  throw new Error('not hex or base64')
}
