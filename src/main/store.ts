const Store = require('electron-store');

const store = new Store({
  name: 'fightplanner-config',
});

module.exports = store;
