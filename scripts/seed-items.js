const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const gradeByRarity = { common: 'D', uncommon: 'C', rare: 'B', epic: 'A', legendary: 'S' };

const weapons = [
  // one weapon per damage type (true damage reserved for special_attack scrolls)
  { name: 'crude_knife',      damage: 'pierce',    pri: 'str', sec: null,  sec_grade: null, mat: 'metal', rarity: 'common'    },
  { name: 'iron_sword',       damage: 'slash',     pri: 'str', sec: null,  sec_grade: null, mat: 'metal', rarity: 'uncommon'  },
  { name: 'iron_mace',        damage: 'blunt',     pri: 'str', sec: null,  sec_grade: null, mat: 'metal', rarity: 'common'    },
  { name: 'serrated_blade',   damage: 'bleed',     pri: 'str', sec: 'dex', sec_grade: 'D',  mat: 'metal', rarity: 'uncommon'  },
  { name: 'apprentice_staff', damage: 'fire',      pri: 'int', sec: null,  sec_grade: null, mat: null,    rarity: 'common'    },
  { name: 'crystal_staff',    damage: 'ice',       pri: 'int', sec: null,  sec_grade: null, mat: null,    rarity: 'rare'      },
  { name: 'mithril_staff',    damage: 'lightning', pri: 'int', sec: null,  sec_grade: null, mat: null,    rarity: 'epic'      },
  { name: 'void_staff',       damage: 'poison',    pri: 'int', sec: null,  sec_grade: null, mat: null,    rarity: 'legendary' },
];

const toolTiers = [
  { name: 'basic_fishing_rod', equipment_tier: 1 },
  { name: 'stone_axe',         equipment_tier: 1 },
  { name: 'stone_pickaxe',     equipment_tier: 1 },
  { name: 'iron_axe',          equipment_tier: 2 },
  { name: 'iron_pickaxe',      equipment_tier: 2 },
  { name: 'steel_axe',         equipment_tier: 3 },
  { name: 'steel_pickaxe',     equipment_tier: 3 },
];

(async () => {
  let ok = 0, fail = 0;
  for (const w of weapons) {
    const fields = {
      primary_damage_type:   w.damage,
      primary_scaling_attr:  w.pri,
      primary_scaling_grade: gradeByRarity[w.rarity],
      secondary_scaling_attr: w.sec,
    };
    if (w.mat) fields.material_type = w.mat;
    const { error } = await db.from('item_definitions').update(fields).eq('name', w.name);
    if (error) { console.error('FAIL weapon', w.name, '|', error.message); fail++; }
    else { console.log('OK  weapon', w.name); ok++; }
  }
  for (const t of toolTiers) {
    const { error } = await db.from('item_definitions').update({ equipment_tier: t.equipment_tier }).eq('name', t.name);
    if (error) { console.error('FAIL tool  ', t.name, '|', error.message); fail++; }
    else { console.log('OK  tool  ', t.name); ok++; }
  }
  console.log('Done:', ok, 'OK,', fail, 'failed');
})();
