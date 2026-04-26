const webpack = require('webpack');
const config = require('./webpack.config.js');

const compiler = webpack(config, (err, stats) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  if (stats.hasErrors()) {
    console.error(stats.toString({ colors: true }));
    process.exit(1);
  }
  console.log(stats.toString({ colors: true }));
  
  compiler.close((closeErr) => {
    if (closeErr) {
        console.error(closeErr);
        process.exit(1);
    }
    process.exit(0);
  });
});
