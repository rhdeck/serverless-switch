#!/usr/bin/env node
import commander from "commander";
import { basename, join } from "path";
import { existsSync } from "fs";
import { spawnSync } from "child_process";
import resolve from "@raydeck/dependency-tree-resolver";
import {
  getServerlessConfig,
  updateServerlessConfig,
} from "@raydeck/serverless-base";

const doesPackageJSONExist = (fp: string) => {
  const jsonPath = join(fp, "package.json");
  return existsSync(jsonPath);
};
const isStagingStack = (stackname: string, path: string = process.cwd()) => {
  const { staging } = require(join(path, "package.json"));
  if (!staging) return false;
  const stagingKeys = Object.keys(staging);
  return stagingKeys.includes(stackname);
};
const isProductionStack = (stackname: string, path: string = process.cwd()) => {
  const { prod } = require(join(path, "package.json"));
  if (!prod) return false;
  const prodKeys = Object.keys(prod);
  return prodKeys.includes(stackname);
};

const setup = (dir: string) => {
  try {
    if (!existsSync(dir)) return;
    process.chdir(dir);
    console.log("directory is now ", process.cwd());
    console.log(`Setting up ${dir}`);
    spawnSync("yarn", [], { stdio: "inherit" });
    spawnSync("npx", ["fix-local-dependencies"], { stdio: "inherit" });
    try {
      spawnSync("yarn", ["setup"], { stdio: "inherit" });
    } catch (e) {
      console.log("Executing fallback: setup via serverless-stage");
      spawnSync("yarn", ["serverless-stage", "setup"], { stdio: "inherit" });
    }
    console.log(`Finished setting up ${dir}`);
  } catch (e) {}
};
const path = process.cwd();
type stages = "dev" | "prod" | "staging";
commander.name("switch");
commander.arguments("[stackname]");
commander.description("Switch to a different stack", {
  stackname: "Name of the AWS stack prefix we are building on",
});
commander.option("-p --p <path>", "Working Path", ".");
commander.option(
  "-s --stage <stage>",
  "New Stage (dev, staging, production)",
  ""
);
commander.option(
  "-b --base",
  "Use the name of current directory (" + basename(path) + ") as base name",
  false
);
commander.option(
  "--skip-setup",
  "Skip the setup process after changing the name",
  false
);

commander.parse(process.argv);

export { commander };
if (!commander.isDocumenting) {
  const o = getServerlessConfig(commander.path);
  console.log(o);
  const { deploy } = <{ deploy: string[] }>o;
  const name =
    (commander.base && basename(path)) || commander.args[0] || o.name;

  const { stage: baseStage, skipSetup } = commander;
  const stage: stages =
    baseStage ||
    (isStagingStack(name, path) && "staging") ||
    (isProductionStack(name, path) && "prod") ||
    "dev";
  //validate name
  if (name.length + stage.length > 64 - 45) {
    console.error("Combined name/stage length is too long", name, stage);
    process.exit(1);
  }
  if (!o.serverless) o.serverless = {};
  updateServerlessConfig({ name, stage });
  if (!skipSetup) {
    let dependencies = <{ fp: string; deps: string[] }[]>deploy
      .map((p) => join(path, p))
      .filter((name) => doesPackageJSONExist(name))
      .map((fp) => {
        const { dependencies } = <
          { dependencies: { [key: string]: string } | undefined }
        >getServerlessConfig(fp);
        if (!dependencies) return undefined;
        const deps = Object.values(dependencies).map((v: string) =>
          join(fp, v)
        );
        return { fp, deps };
      })
      .filter(Boolean);
    let count, newCount;
    do {
      count = Object.keys(dependencies).length;
      dependencies = dependencies.reduce((acc, { deps }) => {
        return deps.reduce((acc, fp) => {
          if (acc.find(({ fp: a }) => a == fp)) return acc;
          else {
            const { dependencies } = <
              { dependencies: { [key: string]: string } | undefined }
            >getServerlessConfig(fp);
            if (dependencies) {
              const deps = Object.values(dependencies).map((v: string) =>
                join(fp, v)
              );
              return [...acc, { fp, deps }];
            } else return [...acc, { fp, deps: [] }];
          }
        }, acc);
      }, dependencies);
      newCount = Object.keys(dependencies).length;
    } while (count != newCount);
    const depObj = dependencies.reduce((acc, { fp, deps }) => {
      acc[fp] = deps;
      return acc;
    }, <{ [key: string]: string[] }>{});
    resolve(depObj)
      .filter((fp) => ![path, path + "/"].includes(fp))
      .forEach(setup);
  }
}
