/** Bounded structural clone estimate. Not measured JS heap, allocator overhead, or GPU usage. */
export function estimateCanonicalBytes(value: unknown): number {
  let bytes = 0,
    values = 0;
  const ancestors = new Set<object>();
  function add(size: number) {
    bytes += size;
    if (!Number.isSafeInteger(bytes) || bytes > 128 * 1024 * 1024)
      throw new Error('Canonical clone estimate exceeds the engineering profile');
  }
  function visit(item: unknown, depth: number) {
    if (++values > 1_000_000 || depth > 256) throw new Error('Canonical estimate traversal limit');
    if (item === null || typeof item === 'number' || typeof item === 'boolean') {
      add(8);
      return;
    }
    if (typeof item === 'string') {
      add(24 + item.length * 2);
      return;
    }
    if (typeof item !== 'object' || ancestors.has(item))
      throw new Error('Invalid canonical estimate input');
    ancestors.add(item);
    add(64);
    if (Array.isArray(item)) {
      for (const child of item) {
        add(8);
        visit(child, depth + 1);
      }
    } else {
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null)
        throw new Error('Noncanonical estimate object');
      for (const key of Object.keys(item)) {
        add(24 + key.length * 2);
        visit((item as Record<string, unknown>)[key], depth + 1);
      }
    }
    ancestors.delete(item);
  }
  visit(value, 0);
  return bytes;
}
export function estimateBinaryCopyBytes(
  blobs: ReadonlyMap<string, Uint8Array>,
  copies: number,
): number {
  if (!Number.isSafeInteger(copies) || copies < 0) throw new Error('Invalid copy estimate');
  let bytes = 0;
  for (const value of blobs.values()) {
    bytes += value.byteLength * copies;
    if (!Number.isSafeInteger(bytes)) throw new Error('Binary estimate overflow');
  }
  return bytes;
}

/** Conservative token/structure allowance before JSON.parse, without creating parsed objects. */
export function estimateJsonParseBytes(text: string): number {
  let bytes = 0,
    tokens = 0;
  const ends: string[] = [];
  function add(size: number) {
    bytes += size;
    // Each canonical semantic value can add at most one object-key token.
    if (++tokens > 2_000_000 || !Number.isSafeInteger(bytes) || bytes > 128 * 1024 * 1024)
      throw new Error('JSON structural estimate exceeds profile');
  }
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (/\s/.test(c) || c === ',' || c === ':') {
      i++;
      continue;
    }
    if (c === '{' || c === '[') {
      add(72);
      ends.push(c === '{' ? '}' : ']');
      if (ends.length > 256) throw new Error('JSON estimate depth exceeded');
      i++;
      continue;
    }
    if (c === '}' || c === ']') {
      if (ends.pop() !== c) throw new Error('Unbalanced JSON estimate input');
      i++;
      continue;
    }
    if (c === '"') {
      const start = ++i;
      let escaped = false;
      for (; i < text.length; i++) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (text[i] === '\\') {
          escaped = true;
          continue;
        }
        if (text[i] === '"') break;
      }
      if (i === text.length) throw new Error('Unterminated JSON estimate string');
      // Raw escaped spelling is never shorter than the decoded UTF-16 value.
      add(32 + (i - start) * 2);
      i++;
      continue;
    }
    // Numbers, booleans and null each occupy a bounded primitive slot.
    add(16);
    while (i < text.length && !/[\s,\]}:]/.test(text[i])) i++;
  }
  if (ends.length) throw new Error('Unbalanced JSON estimate input');
  return bytes;
}
