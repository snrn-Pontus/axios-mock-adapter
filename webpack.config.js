const BundleAnalyzerPlugin = require("webpack-bundle-analyzer")
  .BundleAnalyzerPlugin;

var config = {
  output: {
    library: "AxiosMockAdapter",
    libraryTarget: "umd",
  },
  externals: {
    axios: "axios",
  },
  // plugins: [new BundleAnalyzerPlugin()],
};

module.exports = config;
