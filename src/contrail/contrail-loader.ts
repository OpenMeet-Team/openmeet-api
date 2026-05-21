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
  const [pkg, server, postgres] = await Promise.all([
    esmImport<typeof import('@atmo-dev/contrail')>('@atmo-dev/contrail'),
    esmImport<typeof import('@atmo-dev/contrail/server')>(
      '@atmo-dev/contrail/server',
    ),
    esmImport<typeof import('@atmo-dev/contrail/postgres')>(
      '@atmo-dev/contrail/postgres',
    ),
  ]);
  return { pkg, server, postgres };
}
