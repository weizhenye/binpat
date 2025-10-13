export interface BinpatOption {
  /** The global endianness. Default value is `big`. */
  endian: 'big' | 'little';
}

export interface BinpatContext {
  endian: BinpatOption['endian'];
  parent?: BinpatContext;
  offset: number;
  data: Record<string, any>;
}

type BinpatHandler<T> = (dv: DataView, ctx: BinpatContext) => T;

type BinpatPattern =
  | BinpatHandler<any>
  | BinpatPatternObject
  | BinpatPattern[]
  | string
  | number
  | boolean;

interface BinpatPatternObject {
  [key: string]: BinpatPattern;
}

type Merge<T, U> = Omit<T, keyof U> & U;
type RegularProps<P extends BinpatPatternObject> = {
  [K in keyof P as K extends `//${string}` | `...${string}` ? never : K]: InferOutput<P[K]>;
};
type SpreadSourceType<P extends BinpatPatternObject> = {
  [K in keyof P as K extends `...${string}` ? K : never]: InferOutput<P[K]>;
} extends infer SpreadEntries ? keyof SpreadEntries extends never ? unknown
  : SpreadEntries[keyof SpreadEntries]
  : never;
type Prettify<T> = { [K in keyof T]: T[K] } & {};
type InferOutput<P> =
  // 1. Handle base Binpat Handlers
  P extends BinpatHandler<infer T> ? T
    // 2. Handle Arrays *within* the pattern definition (e.g., [u8(), u16()])
    : P extends (infer ElementPattern)[] ? { [I in keyof P]: InferOutput<P[I]> }
    // 3. Handle Object Patterns
    : P extends BinpatPatternObject ? (
        SpreadSourceType<P> extends infer S ? unknown extends S ? Prettify<RegularProps<P>>
          : S extends infer S_Item ? Prettify<Merge<S_Item, RegularProps<P>>>
          : never
          : never
      )
    // 4. Handle literal types directly passed in pattern
    : P extends string | number | boolean | bigint | null | undefined ? P
    // 5. Fallback (should ideally not be reached with well-defined patterns)
    : any;

const BINPAT_ARRAY = Symbol('array');

function exec<P extends BinpatPattern>(
  dv: DataView,
  pattern: P,
  parent: BinpatContext,
): InferOutput<P> {
  if (typeof pattern === 'function') {
    return (pattern as BinpatHandler<InferOutput<P>>)(dv, parent);
  }
  if (Array.isArray(pattern)) {
    // @ts-ignore
    return pattern.map((pat) => exec(dv, pat, parent)) as InferOutput<P>;
  }
  if (typeof pattern === 'object') {
    const ctx: BinpatContext = { ...parent, parent, data: {} };
    Object.entries(pattern).forEach(([key, value]) => {
      const result = exec(dv, value, ctx);
      if (key.startsWith('...')) {
        ctx.data = { ...ctx.data, ...result };
        return;
      }
      if (key.startsWith('//')) {
        return;
      }
      ctx.data[key] = result;
    });
    parent.offset = ctx.offset;
    return ctx.data as InferOutput<P>;
  }
  return pattern as InferOutput<P>;
}

/**
 * Parse binary data using declarative patterns.
 *
 * @example Usage
 * ```js
 * import Binpat, { u8 } from 'binpat';
 * const binpat = new Binpat({ foo: u8() });
 * ```
 */
export default class Binpat<P extends BinpatPattern> {
  #pattern: P;
  endian: BinpatOption['endian'] = 'big';

  /** Create a new Binpat instance. */
  constructor(pattern: P, option?: BinpatOption) {
    this.#pattern = pattern;
    this.endian = option?.endian === 'little' ? 'little' : 'big';
  }

  /**
   * Executes the pattern against the buffer.
   * @param buffer The ArrayBuffer containing the binary data.
   *
   * @example Usage
   * ```js
   * import { assertEquals } from '@std/assert';
   * import Binpat, { u8 } from 'binpat';
   *
   * const binpat = new Binpat({ foo: u8() });
   * const { buffer } = new Uint8Array([1]);
   * assertEquals(binpat.exec(buffer), { foo: 1 });
   * ```
   */
  exec(buffer: ArrayBuffer): InferOutput<P> {
    const ctx: BinpatContext = { endian: this.endian, offset: 0, data: {} };
    const dv = new DataView(buffer);
    return exec(dv, this.#pattern, ctx);
  }
}

type DataViewGetter = {
  [K in keyof DataView]: DataView[K] extends
    (byteOffset: number, littleEndian?: boolean) => number | bigint ? K : never;
}[keyof DataView];

type TypedArrayConstructor =
  | Uint8ArrayConstructor
  | Uint16ArrayConstructor
  | Uint32ArrayConstructor
  | BigUint64ArrayConstructor
  | Int8ArrayConstructor
  | Int16ArrayConstructor
  | Int32ArrayConstructor
  | BigInt64ArrayConstructor
  | Float16ArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor;

type GetElementType<C> = C extends new () => infer T
  ? T extends { [n: number]: infer E } ? E : never
  : never;

type BinpatTypedHander<C extends TypedArrayConstructor> =
  & BinpatHandler<GetElementType<C>>
  & { [BINPAT_ARRAY]: C };

function createTypedHandler<C extends TypedArrayConstructor>(constructor: C): (
  /**
   * Indicates whether the data is stored in little- or big-endian format.
   * If not specified, the global endianness is used.
   */
  littleEndian?: boolean,
) => BinpatTypedHander<C> {
  return (littleEndian?: boolean) => {
    function handler(dv: DataView, ctx: BinpatContext) {
      const le = littleEndian ?? ctx.endian === 'little';
      const method = `get${constructor.name.slice(0, -5)}` as DataViewGetter;
      const value = dv[method](ctx.offset, le);
      ctx.offset += constructor.BYTES_PER_ELEMENT;
      return value;
    }
    (handler as any)[BINPAT_ARRAY] = constructor;
    return handler as BinpatTypedHander<C>;
  };
}

/** Reads 1 byte and interprets it as an 8-bit unsigned integer. */
export const u8 = createTypedHandler(Uint8Array) as () => BinpatTypedHander<Uint8ArrayConstructor>;
/** Reads 2 bytes and interprets them as a 16-bit unsigned integer. */
export const u16 = createTypedHandler(Uint16Array);
/** Reads 4 bytes and interprets them as a 32-bit unsigned integer. */
export const u32 = createTypedHandler(Uint32Array);
/** Reads 8 bytes and interprets them as a 64-bit unsigned integer. */
export const u64 = createTypedHandler(BigUint64Array);

/** Reads 1 byte and interprets it as an 8-bit signed integer. */
export const i8 = createTypedHandler(Int8Array) as () => BinpatTypedHander<Int8ArrayConstructor>;
/** Reads 2 bytes and interprets them as a 16-bit signed integer. */
export const i16 = createTypedHandler(Int16Array);
/** Reads 4 bytes and interprets them as a 32-bit signed integer. */
export const i32 = createTypedHandler(Int32Array);
/** Reads 8 bytes and interprets them as a 64-bit signed integer. */
export const i64 = createTypedHandler(BigInt64Array);

/** Reads 2 bytes and interprets them as a 16-bit floating point number. */
export const f16 = createTypedHandler(Float16Array);
/** Reads 4 bytes and interprets them as a 32-bit floating point number. */
export const f32 = createTypedHandler(Float32Array);
/** Reads 8 bytes and interprets them as a 64-bit floating point number. */
export const f64 = createTypedHandler(Float64Array);

/** Reads 1 byte and and interprets it as a boolean value. */
export function bool(): BinpatHandler<boolean> {
  function handler(dv: DataView, ctx: BinpatContext) {
    const value = !!dv.getUint8(ctx.offset);
    ctx.offset += 1;
    return value;
  }
  return handler;
}

/**
 * Reads the given number of bytes and decodes to a string.
 * @param size number of bytes
 * @param encoding same as [TextDecoder.encoding](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/encoding)
 *
 * @example Usage
 * ```js
 * import { assertEquals } from '@std/assert';
 * import Binpat, { string } from 'binpat';
 *
 * const binpat = new Binpat({ name: string(6) });
 * const { buffer } = new Uint8Array([98, 105, 110, 112, 97, 116]);
 * assertEquals(binpat.exec(buffer), { name: 'binpat' });
 * ```
 */
export function string(
  size: number | ((ctx: BinpatContext) => number),
  encoding: TextDecoderCommon['encoding'] = 'utf-8',
): BinpatHandler<string> {
  function handler(dv: DataView, ctx: BinpatContext) {
    const len = typeof size === 'function' ? size(ctx) : size;
    const value = new Uint8Array(dv.buffer.slice(ctx.offset, ctx.offset + len));
    ctx.offset += len;
    return new TextDecoder(encoding).decode(value);
  }
  return handler;
}

/**
 * Reads an array of values, all conforming to the same pattern.
 * If the pattern is a primitive type (like u8, u16),
 * it will return a TypedArray instance (e.g., Uint8Array).
 * Otherwise, it returns a regular array.
 * @param pattern The pattern definition for each element in the array.
 * @param size The number of elements to read, or a function returning the number based on context.
 *
 * @example Usage
 * ```js
 * import Binpat, { array, u16, u32, u8 } from 'binpat';
 *
 * const binpat = new Binpat({
 *   // It will return Uint16Array
 *   foo: array(u16(), 4),
 *   // pattern can be object
 *   bar: array({ x: u8(), y: u8() }, 4),
 *   count: u32(),
 *   // get size from context
 *   baz: array(u8(), (ctx) => ctx.data.count),
 * });
 * ```
 */
export function array<P extends BinpatPattern>(
  pattern: P,
  size: number | ((ctx: BinpatContext) => number),
): BinpatHandler<
  P extends { [BINPAT_ARRAY]: infer TC }
    ? TC extends TypedArrayConstructor ? InstanceType<TC> : InferOutput<P>[]
    : InferOutput<P>[]
> {
  function handler(dv: DataView, ctx: BinpatContext) {
    const len = typeof size === 'function' ? size(ctx) : size;
    return ((pattern as any)[BINPAT_ARRAY] || Array).from({ length: len })
      .map(() => exec(dv, pattern, ctx));
  }
  return handler;
}

type BitfieldTypeUnsigned = { type: 'u'; size: number };
type BitfieldTypeSigned = { type: 'i'; size: number };
type BitfieldTypeBoolean = { type: 'bool'; size: 1 };
type BitfieldType = BitfieldTypeUnsigned | BitfieldTypeSigned | BitfieldTypeBoolean;
type BitfieldLayout = { [name: string]: number | BitfieldType };
type BitfieldOption = {
  /**
   * The endianness of the bitfield. If not specified, it will use the global endianness.
   */
  endian?: BinpatOption['endian'];
  /**
   * Which bit comes first, see [Bit numbering](https://en.wikipedia.org/wiki/Bit_numbering).
   * + 'MSb': Most Significant Bit (left-to-right).
   * + 'LSb': Least Significant Bit (right-to-left).
   *
   * If not specified:
   * + When endian is `big`, the first bit is `MSb`.
   * + When endian is `little`, the first bit is `LSb`.
   */
  first?: 'MSb' | 'LSb';
};

type InferBitResult<
  Def extends number | BitfieldType,
> = Def extends BitfieldTypeBoolean ? boolean : number;

type InferBitfieldOutput<F extends BitfieldLayout> = Prettify<{
  [K in keyof F as K extends `//${string}` ? never : K]: InferBitResult<
    F[K] extends number ? { type: 'u'; size: F[K] } : F[K]
  >;
}>;

/**
 * Reads a bitfield.
 *
 * @example Usage
 * ```js
 * import { assertEquals } from '@std/assert';
 * import Binpat, { bitfield, omit } from 'binpat';
 *
 * const binpat = new Binpat(bitfield({
 *   a: 3, // unsigned, 3 bits
 *   b: bitfield.u(3), // unsigned, 3 bits
 *   [omit('padding')]: 4, // padding, 4 bits
 *   c: bitfield.i(5), // signed, 5 bits
 *   d: bitfield.bool(), // boolean, 1 bit
 * }));
 * const { buffer } = new Uint8Array([0b01010101, 0b11001100]);
 * assertEquals(binpat.exec(buffer), {
 *   a: 2,     // 0b010
 *   b: 5,     // 0b101
 *             // 0b0111 (padding)
 *   c: 6,     // 0b00110
 *   d: false, // 0b0
 * });
 * ```
 */
export function bitfield<Layout extends BitfieldLayout>(
  field: Layout,
  option: BitfieldOption = {},
): BinpatHandler<InferBitfieldOutput<Layout>> {
  function handler(dv: DataView, ctx: BinpatContext): InferBitfieldOutput<Layout> {
    const endian = option.endian || ctx.endian;
    const first = option.first || (endian === 'big' ? 'MSb' : 'LSb');
    let kvs = Object.entries(field).map(([key, value]) => {
      const definition = typeof value === 'number' ? { type: 'u', size: value } : value;
      return [key, definition] as [string, BitfieldType];
    });
    const bitSize = kvs.reduce((sum, [, cur]) => sum + cur.size, 0);
    const byteSize = Math.ceil(bitSize / 8);
    const endPadding = byteSize * 8 - bitSize;
    if (endPadding) {
      kvs.push([omit(), { type: 'u', size: endPadding }]);
    }
    if (first === 'LSb') {
      kvs.reverse();
    }
    let bytes = new Uint8Array(dv.buffer.slice(ctx.offset, ctx.offset + byteSize));
    if (endian === 'little') {
      bytes.reverse();
    }
    ctx.offset += byteSize;
    let content = [...bytes].map((byte) => byte.toString(2).padStart(8, '0')).join('');
    const result = Object.fromEntries(
      kvs.map(([key, value]) => {
        const v = Number.parseInt(content.slice(0, value.size), 2);
        content = content.slice(value.size);
        if (key.startsWith('//')) return null;
        let typedValue: number | boolean = v;
        if (value.type === 'i') {
          typedValue = v < (1 << (value.size - 1)) ? v : v - (1 << value.size);
        }
        if (value.type === 'bool') {
          typedValue = !!v;
        }
        return [key, typedValue] as [string, number | boolean];
      }).filter((x) => x !== null),
    );
    return Object.fromEntries(
      Object.keys(field)
        .filter((key) => !key.startsWith('//'))
        .map((key) => [key, result[key]]),
    ) as InferBitfieldOutput<Layout>;
  }
  return handler;
}
/** Define a unsigned value. */
bitfield.u = function u(size: number): BitfieldTypeUnsigned {
  return { type: 'u', size };
};
/** Define a signed value. */
bitfield.i = function i(size: number): BitfieldTypeSigned {
  return { type: 'i', size };
};
/** Define a boolean value. */
bitfield.bool = function bool(): BitfieldTypeBoolean {
  return { type: 'bool', size: 1 };
};

/**
 * It works like `condition(ctx) ? truthy : falsy`
 * @param condition
 * @param truthy
 * @param falsy
 *
 * @example Usage
 * ```js
 * import { assertEquals } from '@std/assert';
 * import Binpat, { ternary, bool, u16, u8 } from 'binpat';
 *
 * const binpat = new Binpat({
 *   flag: bool(),
 *   value: ternary((ctx) => ctx.data.flag, [u8(), u8()], [u16()]),
 * });
 * assertEquals(binpat.exec(new Uint8Array([1, 0, 0]).buffer), { flag: true, value: [0, 0] });
 * assertEquals(binpat.exec(new Uint8Array([0, 0, 0]).buffer), { flag: false, value: [0] });
 * ```
 */
export function ternary<T extends BinpatPattern, F extends BinpatPattern>(
  condition: (ctx: BinpatContext) => boolean,
  truthy: T,
  falsy?: F,
): BinpatHandler<InferOutput<T> | InferOutput<F>> {
  function handler(dv: DataView, ctx: BinpatContext) {
    const pattern = condition(ctx) ? truthy : falsy;
    if (pattern === undefined) return undefined;
    return exec(dv, pattern, ctx);
  }
  return handler as BinpatHandler<InferOutput<T> | InferOutput<F>>;
}

/**
 * Convert the result value with custom function.
 * @param pattern
 * @param fn
 *
 * @example Usage
 * ```js
 * import { assertEquals } from '@std/assert';
 * import Binpat, { convert, u16 } from 'binpat';
 *
 * const binpat = new Binpat({
 *   type: convert(u16(), (value) => ['', 'ico', 'cur'][value] || 'unknown'),
 * });
 * assertEquals(binpat.exec(new Uint8Array([0, 1]).buffer), { type: 'ico' });
 * assertEquals(binpat.exec(new Uint8Array([0, 2]).buffer), { type: 'cur' });
 * assertEquals(binpat.exec(new Uint8Array([0, 0]).buffer), { type: 'unknown' });
 * ```
 */
export function convert<P extends BinpatPattern, R>(
  pattern: P,
  fn: (value: InferOutput<P>, ctx?: BinpatContext) => R,
): BinpatHandler<R> {
  function handler(dv: DataView, ctx: BinpatContext) {
    const value = exec(dv, pattern, ctx);
    return fn(value, ctx);
  }
  return handler;
}

/**
 * Move current offset to the given offset.
 * @param offset
 *
 * @example Usage
 * ```js
 * import { assertEquals } from '@std/assert';
 * import Binpat, { seek, omit, u8 } from 'binpat';
 *
 * const binpat = new Binpat({
 *   foo: u8(),
 *   [omit('padding')]: seek((ctx) => ctx.offset + 4),
 *   bar: u8(),
 * });
 * const { buffer } = new Uint8Array([1, 0, 0, 0, 0, 2]);
 * assertEquals(binpat.exec(buffer), { foo: 1, bar: 2 });
 * ```
 */
export function seek(offset: number | ((ctx: BinpatContext) => number)): BinpatHandler<void> {
  function handler(dv: DataView, ctx: BinpatContext) {
    ctx.offset = typeof offset === 'function' ? offset(ctx) : offset;
  }
  return handler;
}

/**
 * Reads pattern from the given offset, and doesn't move current offset.
 * @param offset
 * @param pattern
 *
 * @example Usage
 * ```js
 * import Binpat, { peek, u8 } from 'binpat';
 *
 * const binpat = new Binpat({
 *   size: u32(),
 *   address: u32(),
 *   data: peek(
 *     (ctx) => ctx.data.address,
 *     array(u8(), (ctx) => ctx.data.size),
 *   ),
 * });
 * ```
 */
export function peek<P extends BinpatPattern>(
  offset: number | ((ctx: BinpatContext) => number),
  pattern: P,
): BinpatHandler<InferOutput<P>> {
  function handler(dv: DataView, ctx: BinpatContext) {
    const currentOffset = ctx.offset;
    ctx.offset = typeof offset === 'function' ? offset(ctx) : offset;
    const value = exec(dv, pattern, ctx);
    ctx.offset = currentOffset;
    return value;
  }
  return handler;
}

/**
 * Move forward with the given offset. `skip(x)` is same as `seek((ctx) => ctx.offset + x)`
 * @param offset
 *
 * @example Usage
 * ```js
 * import { assertEquals } from '@std/assert';
 * import Binpat, { skip, omit, u8 } from 'binpat';
 *
 * const binpat = new Binpat({
 *   foo: u8(),
 *   [omit('padding')]: skip(4),
 *   bar: u8(),
 * });
 * const { buffer } = new Uint8Array([1, 0, 0, 0, 0, 2]);
 * assertEquals(binpat.exec(buffer), { foo: 1, bar: 2 });
 * ```
 */
export function skip(offset: number): BinpatHandler<void> {
  function handler(dv: DataView, ctx: BinpatContext) {
    ctx.offset += offset;
  }
  return handler;
}

function random() {
  return Math.random().toString(16).slice(2);
}

/**
 * Omit the key-value in result.
 *
 * @example Usage
 * ```js
 * import { assertEquals } from '@std/assert';
 * import Binpat, { omit, u16 } from 'binpat';
 *
 * const binpat = new Binpat({
 *   [omit('reserved')]: u16(),
 *   type: u16(),
 *   count: u16(),
 * });
 * const { buffer } = new Uint8Array([0, 0, 0, 1, 0, 1]);
 * assertEquals(binpat.exec(buffer), { type: 1, count: 1 });
 * ```
 *
 * @example Use string literal starts with `//` as object key to get correct type inference
 * ```js
 * import { assertEquals } from '@std/assert';
 * import Binpat, { omit, u16 } from 'binpat';
 *
 * const binpat = new Binpat({
 *   '// reserved': u16(),
 *   type: u16(),
 *   count: u16(),
 * });
 * const { buffer } = new Uint8Array([0, 0, 0, 1, 0, 1]);
 * assertEquals(binpat.exec(buffer), { type: 1, count: 1 });
 */
export function omit(comment?: any): `//${string}` {
  return `//${random()}`;
}

/**
 * It works like spread syntax `...`, and usually be used with `ternary()`.
 *
 * @example Usage
 * ```js
 * import { assertEquals } from '@std/assert';
 * import Binpat, { spread, ternary, bool, u8 } from 'binpat';
 *
 * const binpat = new Binpat({
 *   flag: bool(),
 *   [spread()]: ternary(
 *     (ctx) => ctx.data.flag,
 *     { truthy: u8() },
 *     { falsy: u8() },
 *   ),
 * });
 * assertEquals(binpat.exec(new Uint8Array([1, 0]).buffer), { flag: true, truthy: 0 });
 * assertEquals(binpat.exec(new Uint8Array([0, 0]).buffer), { flag: false, falsy: 0 });
 * ```
 *
 * @example Use string literal starts with `...` as object key to get correct type inference
 * ```js
 * import { assertEquals } from '@std/assert';
 * import Binpat, { spread, ternary, bool, u8 } from 'binpat';
 *
 * const binpat = new Binpat({
 *   flag: bool(),
 *   '...spread': ternary(
 *     (ctx) => ctx.data.flag,
 *     { truthy: u8() },
 *     { falsy: u8() },
 *   ),
 * });
 * assertEquals(binpat.exec(new Uint8Array([1, 0]).buffer), { flag: true, truthy: 0 });
 * assertEquals(binpat.exec(new Uint8Array([0, 0]).buffer), { flag: false, falsy: 0 });
 * ```
 */
export function spread(comment?: any): `...${string}` {
  return `...${random()}`;
}
