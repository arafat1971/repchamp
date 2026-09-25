import { readFileSync } from 'fs';
import { join } from 'path';

import { glanceLine } from '@/domain/waterWidget';

const base = { name: 'Sam', waterMl: 0, meWaterMl: 0, hasMe: true, met: false, meMet: false };

describe('glanceLine', () => {
  it('wakes the bears before anyone drinks', () => {
    expect(glanceLine(base)).toBe('Sip to wake your bear ☀️');
  });

  it('says who leads and by how much', () => {
    expect(glanceLine({ ...base, waterMl: 250, meWaterMl: 750 })).toBe('You lead by 500 ml 👑');
    expect(glanceLine({ ...base, waterMl: 1750, meWaterMl: 500 })).toBe('Sam leads by 1.25 L');
    expect(glanceLine({ ...base, waterMl: 500, meWaterMl: 500 })).toBe('Neck and neck 🤝');
  });

  it('celebrates goals, one side then both', () => {
    expect(glanceLine({ ...base, waterMl: 2000, meWaterMl: 500, met: true })).toBe('Sam is full — catch up 💧');
    expect(glanceLine({ ...base, waterMl: 500, meWaterMl: 2000, meMet: true })).toBe("You're full — cheer Sam on 💦");
    expect(glanceLine({ ...base, waterMl: 2000, meWaterMl: 2000, met: true, meMet: true })).toBe('Both full today 🥂');
  });

  it('talks only about them when my side is off', () => {
    expect(glanceLine({ ...base, hasMe: false, meWaterMl: 900 })).toBe("Waiting for Sam's first sip");
    expect(glanceLine({ ...base, hasMe: false, waterMl: 300 })).toBe('Sam is sipping 💧');
  });

  it('is mirrored by the native glance', () => {
    const templates = readFileSync(join(__dirname, '../../../plugins/waterWidgetTemplates.js'), 'utf8');
    for (const line of ['Both full today 🥂', 'Sip to wake your bear ☀️', 'Neck and neck 🤝']) {
      expect(templates).toContain(line);
    }
  });
});
