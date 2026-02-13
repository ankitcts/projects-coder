const path = require("path");
const webpack = require("webpack");
const htmlWebpackPlugin = require("html-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");

module.exports = {
  entry: "./src/index.js", // The file to start bundling from
  output: {
    path: path.join(__dirname, "../public/"), // output dir
    filename: "bundle.js", // file name
  },
  ignoreWarnings: [
    (warning) =>
      warning.message &&
      warning.message.includes("Critical dependency: the request of a dependency is an expression") &&
      warning.module &&
      warning.module.resource &&
      warning.module.resource.includes("node_modules/typescript/lib/typescript.js"),
  ],
  plugins: [
    new CleanWebpackPlugin(),
    new htmlWebpackPlugin({
      hash: true,
      filename: "index.html",
      template: "./src/index.html",
    }),
  ],
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader", // Loader to use for js and jsx files
        },
      },
      {
        test: /\.(css|scss)$/i,
        use: [
          "style-loader",
          "css-loader",
          "sass-loader",
        ],
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/,
        use: {
          loader: "file-loader",
          options: {
            publicPath: "../",
            outputPath: (url, resourcePath, context) => {
              return url;
            },
            name: "assets/fonts/[name].[ext]?[hash]",
          },
        },
      },
      {
        test: /\.(png|jpg|svg|gif)$/,
        use: {
          loader: "file-loader",
          options: {
            publicPath: "../",
            name: "assets/media/[name].[ext]?[hash]",
          },
        },
      },
    ],
  },
};
