module.exports = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/main.js',
  externals: {
    // required for ffmpeg and ffprobe.
    'ffmpeg-static': 'commonjs ffmpeg-static',
    'ffprobe-static': 'commonjs ffprobe-static'
  },
  // Put your normal webpack config below here
  module: {
    rules: require('./webpack.rules'),

  }
};
