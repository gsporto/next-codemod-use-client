import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";

import acorn, { ExpressionStatement } from "acorn";
import { tsPlugin } from "acorn-typescript";
import jsx from "acorn-jsx";

import yargs from "yargs";
import isGitClean from "is-git-clean";

type handleImportTreeProps = {
  basePath: string;
  file: string;
  previousComponentType?: "client" | "server";
};

const clientComponents = new Map();
const acornParser = acorn.Parser.extend(tsPlugin() as any, jsx());

function handleImportTree({
  basePath,
  file,
  previousComponentType,
}: handleImportTreeProps) {
  try {
    const filePath = path.resolve(
      basePath,
      file.replace(".tsx", "").concat(".tsx")
    );
    const source = fs.readFileSync(filePath, "utf-8");
    const node = acornParser.parse(source, {
      sourceType: "module",
      ecmaVersion: "latest",
      locations: true,
    });

    const firstNode = node.body.at(0) as ExpressionStatement;

    const hasClientDirective = firstNode.directive === "use client";

    const currentType =
      hasClientDirective || previousComponentType === "client"
        ? "client"
        : "server";

    if (currentType === "client") {
      if (
        clientComponents.get(filePath) === undefined ||
        clientComponents.get(filePath) === true
      ) {
        clientComponents.set(
          filePath,
          previousComponentType === "client" && hasClientDirective
        );
      }
    }

    const imports = node.body.filter((v) => v.type === "ImportDeclaration");

    imports.forEach((value) => {
      if (
        value.type === "ImportDeclaration" &&
        typeof value.source.value === "string"
      ) {
        if (
          value.source.value.startsWith("./") ||
          value.source.value.startsWith("../")
        ) {
          handleImportTree({
            basePath: path.dirname(filePath),
            file: value.source.value,
            previousComponentType: currentType,
          });
        }
      }
    });
  } catch (error) {
    return;
  }
}

async function run() {
  const cli = await yargs
    .scriptName("next-codemod-use-client")
    .usage("Usage:\n $0 [args]")
    .option("force", { alias: "f", type: "boolean", default: false })
    .option("dry", { alias: "d", type: "boolean", default: false })
    .help()
    .parseAsync();

  let execute = true;

  if (!(cli.force || cli.dry)) {
    try {
      if (!isGitClean.sync(process.cwd())) {
        console.error(
          "git not clean, please stash or commit your git changes.\n"
        );
        process.exit(1);
      }
      execute = true;
    } catch (err: any) {
      if (err && err.stderr && err.stderr.includes("not a git repository")) {
        const RlInterface = readline.createInterface(
          process.stdin,
          process.stdout
        );

        const answer = await RlInterface.question(
          "You want to continue? [y/N]:"
        );

        if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
          execute = true;
        } else {
          execute = false;
        }
        RlInterface.close();
      }
    }
  }

  if (execute) {
    const { globby } = await import("globby");
    const entries = await globby([
      "**/page.tsx",
      "**/layout.tsx",
      "**/template.tsx",
      "**/loading.tsx",
      "**/error .tsx",
    ]);

    entries.forEach((entrie) => {
      handleImportTree({ basePath: process.cwd(), file: entrie });
    });

    if (cli.dry) {
      console.log('Files with unnecessary "use client":\n');
      clientComponents.forEach((shouldRemove, key) => {
        if (shouldRemove) {
          console.log(key);
        }
      });
      process.exit(1);
    }

    clientComponents.forEach((shouldRemove, key) => {
      if (shouldRemove) {
        const source = fs.readFileSync(key, "utf-8");
        fs.writeFileSync(
          key,
          source.replaceAll(/(['"])use client\1(;)?\s*\\?n?/gi, "")
        );
      }
    });
  }
}

console.time('Done in');
run().then(()=>{console.timeEnd('Done in');});
