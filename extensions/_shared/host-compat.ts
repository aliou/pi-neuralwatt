// Host compatibility for pi (`@earendil-works/pi-coding-agent`) and omp
// (https://omp.sh), which loads pi extensions through a legacy compat layer.
// Every difference here is resolved by capability detection so the pi paths
// stay the ones pi has always taken.
import * as piAiCompat from "@earendil-works/pi-ai/compat";
import type { Static, TSchema } from "typebox";
import { Type } from "typebox";

/**
 * pi-ai's provider-runtime compat surface (`getApiProvider` and the pi-ai
 * `Provider` object it feeds) exists only on pi. omp resolves
 * `@earendil-works/pi-ai/compat` to its legacy shim, which omits it — a
 * *named* import of `getApiProvider` fails the whole module graph there, so
 * this namespace import is load-bearing and the presence check below selects
 * the registration strategy.
 */
export const hasPiProviderRuntime =
  typeof (piAiCompat as Record<string, unknown>).getApiProvider === "function";

/** The only pi-ai provider member consumers read; the cast bridges the missing omp export. */
export interface ApiProviderStreamSource {
  streamSimple?: (...args: never[]) => unknown;
}

/** pi-ai's per-api stream provider, or `undefined` on hosts without it (omp). */
export function getApiProvider(
  api: string,
): ApiProviderStreamSource | undefined {
  return hasPiProviderRuntime
    ? (piAiCompat.getApiProvider(api) as ApiProviderStreamSource | undefined)
    : undefined;
}

/**
 * Drop-in for `typebox/value`'s `Parse` error: `cause.value` carries the
 * offending input (used to bill invalid classifier responses) and
 * `cause.errors` the per-path failures.
 */
export type ParseError = Error & {
  cause: {
    value: unknown;
    errors: ReadonlyArray<{ instancePath: string; message: string }>;
  };
};

/** The `typebox/value` surface this repo consumes, with identical signatures on both hosts. */
export interface SchemaValueHelpers {
  Check: <const T extends TSchema>(
    type: T,
    value: unknown,
  ) => value is Static<T>;
  Parse: <const T extends TSchema>(type: T, value: unknown) => Static<T>;
  ParseError: new (...args: never[]) => ParseError;
}

class CallableParseError extends Error {
  readonly cause: {
    value: unknown;
    errors: ReadonlyArray<{ instancePath: string; message: string }>;
  };

  constructor(value: unknown, message: string) {
    super(message);
    this.name = "ParseError";
    this.cause = { value, errors: [{ instancePath: "", message }] };
  }
}

/** omptype's legacy TypeBox facade attaches this zod-style parser to every schema. */
interface CallableSchema {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: unknown }
    | { success: false; error: { message: string } };
}

function callableSchemaHelpers(): SchemaValueHelpers {
  return {
    // The callable-schema host has no TypeBox type predicate to reuse, so the
    // narrowing signature is asserted onto the boolean probe. omptype schemas
    // do NOT throw on invalid input — calling one returns an `OmpErrors` value
    // — so `safeParse`, the facade's success/failure discriminator, is the only
    // correct probe.
    Check: ((schema, value) =>
      (schema as unknown as CallableSchema).safeParse(value)
        .success) as SchemaValueHelpers["Check"],
    Parse: ((schema, value) => {
      const result = (schema as unknown as CallableSchema).safeParse(value);
      if (result.success) return result.data;
      throw new CallableParseError(value, result.error.message);
    }) as SchemaValueHelpers["Parse"],
    ParseError: CallableParseError,
  };
}

// pi's `typebox` returns plain object schemas validated by `typebox/value`.
// omp remaps the exact specifier `typebox` to its omptype facade, whose
// schemas are callables with no `typebox/value` companion — and omp does NOT
// remap `typebox/value`, so importing it there is unresolvable.
const CALLABLE_SCHEMA_HOST = typeof (Type.Object({}) as unknown) === "function";

// Kept in a variable, not a literal: bundlers statically resolve literal
// specifiers even on a dead branch, which would drag `typebox/value` into the
// omp module graph.
const TYPEBOX_VALUE_SPECIFIER = "typebox/value";

const helpers: SchemaValueHelpers = CALLABLE_SCHEMA_HOST
  ? callableSchemaHelpers()
  : ((await import(TYPEBOX_VALUE_SPECIFIER)) as unknown as SchemaValueHelpers);

/**
 * `typebox/value`'s helpers on pi; a callable-schema equivalent on omp.
 * Re-exported under the same names so consumers import this instead of
 * `typebox/value` and run unchanged on both hosts.
 */
export const Check: SchemaValueHelpers["Check"] = helpers.Check;
export const Parse: SchemaValueHelpers["Parse"] = helpers.Parse;
export const ParseError: SchemaValueHelpers["ParseError"] = helpers.ParseError;

/**
 * omp's live session-model facade (`ctx.models`, omp-only). pi's
 * `ExtensionContext` types have no such member, so it is narrowed structurally
 * before use — capability detection keeps the call itself omp-only.
 */
interface OmpModelsFacade {
  current(): { provider?: string } | undefined;
}

function hasModelsFacade(ctx: unknown): ctx is { models: OmpModelsFacade } {
  if (typeof ctx !== "object" || ctx === null || !("models" in ctx))
    return false;
  const models = ctx.models;
  return (
    typeof models === "object" &&
    models !== null &&
    "current" in models &&
    typeof models.current === "function"
  );
}

/**
 * The provider of omp's live session model, or `undefined` when `ctx` has no
 * model facade (pi, or a ctx without one). Reads lazily so a `/model` switch
 * made earlier in the same handler is visible.
 */
export function currentModelProvider(ctx: unknown): string | undefined {
  return hasModelsFacade(ctx) ? ctx.models.current()?.provider : undefined;
}
