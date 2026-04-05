import { defineLexiconConfig } from "@atcute/lex-cli";

export default defineLexiconConfig({
  outdir: "src/generated-lexicon-types/",
  files: ["lexicons/**/*.json"],
  imports: ["@atcute/atproto", "@atcute/bluesky"],
  pull: {
    outdir: "lexicons/",
    sources: [
      {
        type: "git",
        remote: "https://github.com/flo-bit/contrail.git",
        pattern: ["lexicons-pulled/**/*.json"],
      },
    ],
  },
});
