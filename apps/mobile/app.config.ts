const { expo: baseConfig } = require("./app.json");

const isExpoGoTarget = process.env.EXPO_USE_EXPO_GO === "1";

module.exports = () => {
  if (!isExpoGoTarget) {
    return baseConfig;
  }

  const { runtimeVersion, updates, ...expoGoSafeConfig } = baseConfig;

  return expoGoSafeConfig;
};
