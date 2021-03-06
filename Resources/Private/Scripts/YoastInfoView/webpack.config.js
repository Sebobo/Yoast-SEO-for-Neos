const path = require('path');
const webpack = require("webpack");
const ExtractTextPlugin = require('extract-text-webpack-plugin');

const webpackConfig = [
    {
        entry: [
            '../app.js',
        ],
        watchOptions: {
            aggregateTimeout: 300,
            ignored: /node_modules/
        },
        output: {
            filename: 'app.js',
            path: path.resolve(__dirname, '../../../Public/Assets')
        },
        resolve: {
            extensions: ['.json', '.js', '.jsx']
        },
        externals: {
            yoastseo: 'yoastseo'
        },
        module: {
            rules: [
                {
                    test: /\.(eot|svg|ttf|woff|woff2)$/,
                    loader: 'file-loader?name=[name].[ext]'
                },
                {
                    test: /\.s?css$/,
                    use: [
                        ExtractTextPlugin.loader,
                        {
                            loader: "css-loader",
                            options: {
                                importLoaders: 1
                            }
                        },
                        {
                            loader: 'sass-loader',
                            options: {
                                includePaths: [
                                    path.resolve('node_modules'),
                                ]
                            }
                        }
                    ]
                },
                {
                    test: /\.jsx?$/,
                    loader: 'babel-loader',
                    exclude: [
                        /node_modules\/(?!yoast-components)(?!yoastseo).*$/
                    ],
                    options: {
                        cacheDirectory: true,
                    }
                }
            ]
        },
        plugins: [
            new webpack.optimize.OccurrenceOrderPlugin(),
            new ExtractTextPlugin({
                filename: "[name].css",
            }),
        ]
    },
    {
        entry: ['./src/webWorker.js'],
        output: {
            filename: 'webWorker.js',
            path: path.resolve(__dirname, '../../../Public/Assets')
        },
        module: {
            rules: [
                {
                    test: /\.jsx?$/,
                    use: [{
                        loader: 'babel-loader',
                        options: {
                            presets: ['@babel/env'],
                        }
                    }]
                }
            ]
        }
    },
    {
        entry: ['./src/yoastseo.js'],
        output: {
            filename: 'yoastseo.js',
            path: path.resolve(__dirname, '../../../Public/Assets')
        },
        module: {
            rules: [
                {
                    test: /\.jsx?$/,
                    use: [{
                        loader: 'babel-loader',
                        options: {
                            presets: ['@babel/env'],
                        }
                    }]
                }
            ]
        }
    }
];

module.exports = webpackConfig;
