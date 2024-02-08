import fs from "node:fs";
import path from "node:path";

import acorn, { ExpressionStatement } from "acorn";
import jsx from "acorn-jsx";
import { tsPlugin } from "acorn-typescript";

import isGitClean from "is-git-clean";
import yargs from "yargs";

type handleImportTreeProps = {
  basePath: string;
  file: string;
  previousComponentType?: "client" | "server";
};

const clientComponents = new Map();
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
const acornParser = acorn.Parser.extend(tsPlugin() as any, jsx());

type isGitCleanError = {
  stderr: string;
};

function handleImportTree({
  basePath,
  file,
  previousComponentType,
}: handleImportTreeProps) {
  try {
    const filePath = path.resolve(
      basePath,
      file.replace(".tsx", "").concat(".tsx"),
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
          previousComponentType === "client" && hasClientDirective,
        );
      }
    }

    const imports = node.body.filter((v) => v.type === "ImportDeclaration");

    for (const value of imports) {
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
    }
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
  const { default: inquirer } = await import("inquirer");
  if (!(cli.force || cli.dry)) {
    try {
      if (!isGitClean.sync(process.cwd())) {
        console.error(
          "git not clean, please stash or commit your git changes.\n",
        );
        process.exit(1);
      }
      execute = true;
    } catch (err) {
      const e = err as isGitCleanError;
      if (e?.stderr?.includes("not a git repository")) {
        const answer = await inquirer.prompt({
          name: "continue",
          type: "confirm",
          message: "You want to continue?",
          default: false,
        });

        execute = answer.continue;
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

    for (const entrie of entries) {
      handleImportTree({ basePath: process.cwd(), file: entrie });
    }

    if (clientComponents.size > 0) {
      console.log('Files with unnecessary "use client":');
      clientComponents.forEach((shouldRemove, key) => {
        if (shouldRemove) {
          console.log("-", key);
        }
      });
    } else {
      console.log('No unnecessary "use client" detected');
    }

    if (!cli.dry) {
      const answer = await inquirer.prompt({
        name: "continue",
        type: "confirm",
        message: "You want to continue?",
        default: true,
      });

      if (answer.continue) {
        clientComponents.forEach((shouldRemove, key) => {
          if (shouldRemove) {
            const source = fs.readFileSync(key, "utf-8");
            fs.writeFileSync(
              key,
              source.replaceAll(/(['"])use client\1(;)?\s*\\?n?/gi, ""),
            );
          }
        });
      }
    }
  }
}

run();
