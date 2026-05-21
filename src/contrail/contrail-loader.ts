// @atmo-dev/contrail ships as ESM-only. OM API compiles with `module: commonjs`,
// which would transform `await import(...)` into `require(...)` — broken for ESM.
// The `Function`-constructor indirection keeps the dynamic import opaque to the
// TS compiler, so Node's runtime executes the real ESM import.
const esmImport = new Function('specifier', 'return import(specifier)') as <
  T = unknown,
>(
  specifier: string,
) => Promise<T>;

export async function loadContrailCommunity(): Promise<
  typeof import('@atmo-dev/contrail-community')
> {
  return esmImport<typeof import('@atmo-dev/contrail-community')>(
    '@atmo-dev/contrail-community',
  );
}

export async function loadContrail(): Promise<{
  pkg: typeof import('@atmo-dev/contrail');
  server: typeof import('@atmo-dev/contrail/server');
  postgres: typeof import('@atmo-dev/contrail/postgres');
}> {
  // Import the subpaths sequentially, not via Promise.all. They share the
  // contrail-base / contrail-appview subgraph, and jest's --experimental-vm-modules
  // linker races when overlapping ESM graphs are instantiated concurrently on a
  // cold load (contrail-appview requests contrail-base before it's linked →
  // "module is not linked"). Awaiting each import in turn links the shared
  // subgraph once before the next import. The startup cost is a one-time,
  // negligible serialization; real Node's loader handles the parallel case fine,
  // but the sequential form keeps the test runner honest too.
  const pkg =
    await esmImport<typeof import('@atmo-dev/contrail')>('@atmo-dev/contrail');
  const server = await esmImport<typeof import('@atmo-dev/contrail/server')>(
    '@atmo-dev/contrail/server',
  );
  const postgres = await esmImport<
    typeof import('@atmo-dev/contrail/postgres')
  >('@atmo-dev/contrail/postgres');
  return { pkg, server, postgres };
}
