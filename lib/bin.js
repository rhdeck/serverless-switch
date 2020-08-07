#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.commander = void 0;
const commander_1 = __importDefault(require("commander"));
exports.commander = commander_1.default;
const path_1 = require("path");
const fs_1 = require("fs");
const child_process_1 = require("child_process");
const dependency_tree_resolver_1 = __importDefault(require("@raydeck/dependency-tree-resolver"));
const serverless_base_1 = require("@raydeck/serverless-base");
const doesPackageJSONExist = (fp) => {
    const jsonPath = path_1.join(fp, "package.json");
    return fs_1.existsSync(jsonPath);
};
const isStagingStack = (stackname, path = process.cwd()) => {
    const { staging } = require(path_1.join(path, "package.json"));
    if (!staging)
        return false;
    const stagingKeys = Object.keys(staging);
    return stagingKeys.includes(stackname);
};
const isProductionStack = (stackname, path = process.cwd()) => {
    const { prod } = require(path_1.join(path, "package.json"));
    if (!prod)
        return false;
    const prodKeys = Object.keys(prod);
    return prodKeys.includes(stackname);
};
const setup = (dir) => {
    try {
        if (!fs_1.existsSync(dir))
            return;
        process.chdir(dir);
        console.log("directory is now ", process.cwd());
        console.log(`Setting up ${dir}`);
        child_process_1.spawnSync("yarn", [], { stdio: "inherit" });
        child_process_1.spawnSync("npx", ["fix-local-dependencies"], { stdio: "inherit" });
        child_process_1.spawnSync("yarn", ["setup"], { stdio: "inherit" });
        console.log(`Finished setting up ${dir}`);
    }
    catch (e) { }
};
const path = process.cwd();
commander_1.default.name("switch");
commander_1.default.arguments("[stackname]");
commander_1.default.description("Switch to a different stack", {
    stackname: "Name of the AWS stack prefix we are building on",
});
commander_1.default.option("-p --p <path>", "Working Path", ".");
commander_1.default.option("-s --stage <stage>", "New Stage (dev, staging, production)", "");
commander_1.default.option("-b --base", "Use the name of current directory (" + path_1.basename(path) + ") as base name", false);
commander_1.default.option("--skip-setup", "Skip the setup process after changing the name", false);
commander_1.default.parse(process.argv);
if (!commander_1.default.isDocumenting) {
    const o = serverless_base_1.getServerlessConfig(commander_1.default.path);
    const { deploy } = o;
    const name = (commander_1.default.base && path_1.basename(path)) ||
        commander_1.default.args[0] ||
        o.serverless.name ||
        o.name;
    const { stage: baseStage, skipSetup } = commander_1.default;
    const stage = baseStage ||
        (isStagingStack(name, path) && "staging") ||
        (isProductionStack(name, path) && "prod") ||
        "dev";
    //validate name
    if (name.length + stage.length > 64 - 45) {
        console.error("Combined name/stage length is too long", name, stage);
        process.exit(1);
    }
    if (!o.serverless)
        o.serverless = {};
    serverless_base_1.updateServerlessConfig({ name, stage });
    if (!skipSetup) {
        let dependencies = deploy
            .map((p) => path_1.join(path, p))
            .filter((name) => doesPackageJSONExist(name))
            .map((fp) => {
            const { dependencies } = serverless_base_1.getServerlessConfig(fp);
            if (!dependencies)
                return undefined;
            const deps = Object.values(dependencies).map((v) => path_1.join(fp, v));
            return { fp, deps };
        })
            .filter(Boolean);
        let count, newCount;
        do {
            count = Object.keys(dependencies).length;
            dependencies = dependencies.reduce((acc, { deps }) => {
                return deps.reduce((acc, fp) => {
                    if (acc.find(({ fp: a }) => a == fp))
                        return acc;
                    else {
                        const { dependencies } = serverless_base_1.getServerlessConfig(fp);
                        if (dependencies) {
                            const deps = Object.values(dependencies).map((v) => path_1.join(fp, v));
                            return [...acc, { fp, deps }];
                        }
                        else
                            return [...acc, { fp, deps: [] }];
                    }
                }, acc);
            }, dependencies);
            newCount = Object.keys(dependencies).length;
        } while (count != newCount);
        const depObj = dependencies.reduce((acc, { fp, deps }) => {
            acc[fp] = deps;
            return acc;
        }, {});
        dependency_tree_resolver_1.default(depObj)
            .filter((fp) => ![path, path + "/"].includes(fp))
            .forEach(setup);
    }
}
//# sourceMappingURL=bin.js.map