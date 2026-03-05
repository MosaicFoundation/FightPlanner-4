const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { ModScanner } = require('../../out/main/mod-utils/mod-scanner');
const { SlotChanger } = require('../../out/main/mod-utils/slot-changer');

(async () => {
  await app.whenReady();
  const modPath = path.join(__dirname, 'Mario 64 Skin');
  const scan = await ModScanner.scanModFiles(modPath);

  const assignments = new Map();
  for (const fighter of scan.fighterNames) {
    const map = new Map();
    const slots = Object.keys(scan.pathData[fighter] || {})
      .filter((slot) => /^c\d{2,3}$/i.test(slot))
      .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));

    slots.forEach((slot, i) => map.set(slot, `c${String(32 + i).padStart(2, '0')}`));
    assignments.set(fighter, map);
  }

  await SlotChanger.changeSlots(modPath, assignments, scan.pathData, {}, {
    renameFolders: true,
    renameFiles: false,
    applyMetadata: false,
    generateConfig: true,
    echoFighterName: 'retro',
    echoSourceFighters: scan.fighterNames,
  });

  const checks = [
    ['fighter/mario/model/body/c32/def_mario_001_col.nutexb', true],
    ['fighter/mario/model/body/c00/def_mario_001_col.nutexb', false],
    ['sound/bank/fighter_voice/vc_mario_c00.nus3audio', true],
    ['ui/replace/chara/chara_1/chara_1_retro_00.bntx', true],
    ['ui/replace/chara/chara_1/chara_1_mario_00.bntx', false],
    ['config.json', true],
  ];

  let failures = 0;
  for (const [rel, expected] of checks) {
    const exists = fs.existsSync(path.join(modPath, rel));
    if (exists !== expected) {
      failures++;
      console.log(`FAIL ${rel} expected=${expected} actual=${exists}`);
    } else {
      console.log(`OK   ${rel}`);
    }
  }

  const config = JSON.parse(fs.readFileSync(path.join(modPath, 'config.json'), 'utf8'));
  console.log('config keys:', Object.keys(config));
  console.log('new-dir-infos sample:', (config['new-dir-infos'] || []).slice(0, 5));

  app.exit(failures > 0 ? 1 : 0);
})();