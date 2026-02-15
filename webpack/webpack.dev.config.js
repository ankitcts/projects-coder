const webpack = require("webpack");
const { merge } = require("webpack-merge");
const webCommon = require("./webpack.common.config");

module.exports = merge(webCommon, {
  devtool: "cheap-module-source-map",
  mode: "development",
  devServer: {
    port: "auto",
    host: "localhost",
    hot: true,
    proxy: [
      {
        context: ["/api"],
        target: "http://localhost:4000",
      },
    ],
  },
  plugins: [new webpack.HotModuleReplacementPlugin({})],
});
