import esbuild from "esbuild";

esbuild.build({
  entryPoints: ["index.ts"],
  outfile: "dist/bin/index.js",
  format: "cjs",
  minify: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  logLevel: "debug",
});
