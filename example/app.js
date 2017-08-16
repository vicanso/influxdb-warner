const configFile = require('path').join(__dirname, './config.yml');
const Warner = require('..');

const config = require('fs').readFileSync(configFile, 'utf8');

const warner = new Warner(config);
warner.on('warn', (data) => {
  // send email to dev
  console.info(data);
});
warner.start(60 * 1000, () => Promise.resolve()).ref();
