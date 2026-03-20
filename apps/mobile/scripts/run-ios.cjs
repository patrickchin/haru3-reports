#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");
const podsDir = path.join(appRoot, "ios", "Pods");
const args = process.argv.slice(2);

function fail(result) {
  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: appRoot,
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    fail(result);
  }
}

function normalizeConfiguration(value) {
  return value && value.toLowerCase() === "release" ? "Release" : "Debug";
}

function getConfiguration() {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--configuration") {
      return normalizeConfiguration(args[index + 1]);
    }

    if (arg.startsWith("--configuration=")) {
      return normalizeConfiguration(arg.slice("--configuration=".length));
    }
  }

  return "Debug";
}

function getReactNativeVersion() {
  const reactNativePackageJson = require.resolve("react-native/package.json", {
    paths: [appRoot],
  });

  return require(reactNativePackageJson).version;
}

function ensureNativeDependencies() {
  const artifactsDir = path.join(podsDir, "ReactNativeCore-artifacts");
  const manifestLock = path.join(podsDir, "Manifest.lock");

  if (fs.existsSync(artifactsDir) && fs.existsSync(manifestLock)) {
    return;
  }

  console.log("Installing iOS native dependencies with Expo prebuild...");
  run("pnpm", ["exec", "expo", "prebuild", "--platform", "ios"]);
}

function refreshReactNativePrebuilt(configuration) {
  const version = getReactNativeVersion().toLowerCase();
  const finalLocation = path.join(podsDir, "React-Core-prebuilt");
  const markerFile = path.join(finalLocation, ".last_build_configuration");
  const simulatorBinary = path.join(
    finalLocation,
    "React.xcframework",
    "ios-arm64_x86_64-simulator",
    "React.framework",
    "React",
  );
  const currentConfiguration = fs.existsSync(markerFile)
    ? fs.readFileSync(markerFile, "utf8").trim()
    : null;
  const tarball = path.join(
    podsDir,
    "ReactNativeCore-artifacts",
    `reactnative-core-${version}-${configuration.toLowerCase()}.tar.gz`,
  );

  if (!fs.existsSync(tarball)) {
    return;
  }

  if (currentConfiguration === configuration && fs.existsSync(simulatorBinary)) {
    return;
  }

  console.log(`Refreshing React Native iOS prebuilt (${configuration})...`);
  fs.rmSync(finalLocation, { force: true, recursive: true });
  fs.mkdirSync(finalLocation, { recursive: true });
  run("tar", ["-xf", tarball, "-C", finalLocation], { cwd: podsDir });
  fs.writeFileSync(markerFile, `${configuration}\n`);
}

const configuration = getConfiguration();

ensureNativeDependencies();
refreshReactNativePrebuilt(configuration);
run("pnpm", ["exec", "expo", "run:ios", "--no-install", ...args]);
