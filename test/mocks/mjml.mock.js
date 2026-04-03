// Mock mjml to avoid prettier ESM dynamic import() crash in Jest's VM context.
// mjml-core@5 bundles prettier@3.8+ which uses import() in its CJS entry,
// incompatible with Jest without --experimental-vm-modules.
module.exports = function mjml(input) {
  return { html: input, errors: [] };
};
