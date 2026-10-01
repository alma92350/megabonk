import { describe, it, expect } from 'vitest';
import {
  chooseMove,
  decide,
  fleeRadius,
  pickOffer,
  scoreCard,
  HEAL_BELOW_HP,
  type AutoRun,
  type AutoView,
} from '../src/autoplay.js';

function run(over: Partial<AutoRun> = {}): AutoRun {
  return {
    tick: 1000,
    phase: 'playing',
    hp: 150,
    gold: 0,
    halfExtent: 60,
    pos: { x: 0, y: 0 },
    arc: 1,
    orb: 0,
    rerolls: 0,
    enemies: [],
    offer: null,
    chests: [],
    pickup: null,
    stock: null,
    ...over,
  };
}

const view = (over: Partial<AutoView> = {}): AutoView => ({ screen: 'run', run: run(), ...over });

describe('weapon-first card priority', () => {
  it('takes a weapon level over armour, HP and economy', () => {
    const options = [{ name: 'Rite of Hide' }, { name: 'Fat Wallet' }, { name: 'Rootclub +4' }];
    expect(pickOffer(options, 150)).toBe(2);
  });

  it('prefers the targets-scaling weapons over the single-target Dartgun', () => {
    // Dartgun gains no targets per level, so it answers bosses, not swarms.
    expect(scoreCard('Rootclub +2', 150)).toBeGreaterThan(scoreCard('Dartgun +2', 150));
    expect(scoreCard('Wisp Ring +3', 150)).toBeGreaterThan(scoreCard('Dartgun +3', 150));
  });

  it('ranks attack area above raw might, because area scales weapon range', () => {
    expect(scoreCard('Brass Bell', 150)).toBeGreaterThan(scoreCard('Gauntlet', 150));
  });

  it('never prefers Rite of Fortune: luck cannot make weapon levels appear', () => {
    // buildOffer hardcodes weapon cards to 'common' and shuffles the pool
    // uniformly, so Luck only reweights the rarity of NON-weapon cards.
    const options = [{ name: 'Rite of Fortune' }, { name: 'Wisp Ring +2' }];
    expect(pickOffer(options, 150)).toBe(1);
  });

  it('puts healing first only once HP is genuinely low', () => {
    const options = [{ name: 'Field Tonic' }, { name: 'Rootclub +5' }];
    expect(pickOffer(options, HEAL_BELOW_HP + 10)).toBe(1);
    expect(pickOffer(options, HEAL_BELOW_HP - 1)).toBe(0);
  });
});

describe('offers', () => {
  it('spends a held reroll when nothing on offer widens the moat', () => {
    const v = view({ run: run({ rerolls: 1, offer: [{ name: 'Stompers' }, { name: 'Spurs' }] }) });
    expect(decide(v)).toEqual({ kind: 'reroll' });
  });

  it('settles for the best card when there is no reroll to spend', () => {
    const v = view({ run: run({ rerolls: 0, offer: [{ name: 'Stompers' }, { name: 'Gauntlet' }] }) });
    expect(decide(v)).toEqual({ kind: 'choose', index: 1 });
  });

  it('does not waste a reroll on an offer that already has a weapon level', () => {
    const v = view({ run: run({ rerolls: 2, offer: [{ name: 'Spurs' }, { name: 'Rootclub +3' }] }) });
    expect(decide(v)).toEqual({ kind: 'choose', index: 1 });
  });
});

describe('the merchant as a weapon-level shop', () => {
  it('buys an affordable weapon upgrade', () => {
    const v = view({
      run: run({
        gold: 500,
        stock: [
          { name: 'Fat Wallet', price: 40, sold: false },
          { name: 'Rootclub +4', price: 220, sold: false },
        ],
      }),
    });
    expect(decide(v)).toEqual({ kind: 'buy', index: 1 });
  });

  it('does not buy what it cannot afford, or what is already sold', () => {
    const broke = view({
      run: run({ gold: 10, stock: [{ name: 'Rootclub +4', price: 220, sold: false }] }),
    });
    expect(decide(broke).kind).toBe('move');
    const sold = view({
      run: run({ gold: 900, stock: [{ name: 'Rootclub +4', price: 220, sold: true }] }),
    });
    expect(decide(sold).kind).toBe('move');
  });

  it('ignores stock past index 2, which no number key can reach', () => {
    const v = view({
      run: run({
        gold: 900,
        stock: [
          { name: 'Spurs', price: 40, sold: false },
          { name: 'Stompers', price: 50, sold: false },
          { name: 'Lodestone', price: 60, sold: false },
          { name: 'Rootclub +5', price: 70, sold: false },
        ],
      }),
    });
    expect(decide(v).kind).toBe('move');
  });
});

describe('giving ground', () => {
  it('only stands its ground behind a genuinely maxed arc', () => {
    // Regression: gating this on TOTAL weapon levels let Dartgun levels flatter
    // a build into standing point-blank behind an arc stuck at 4. It died at 7:50.
    expect(fleeRadius({ hp: 150, arc: 4, orb: 2 })).toBeGreaterThan(
      fleeRadius({ hp: 150, arc: 5, orb: 4 }),
    );
  });

  it('kites wide whatever the build once HP is low', () => {
    expect(fleeRadius({ hp: 30, arc: 5, orb: 5 })).toBe(6.5);
  });

  it('breaks toward the middle rather than backing into a wall', () => {
    // Pinned near the +x,+y corner with enemies inboard: a pure flee vector
    // would push further into the corner, where there is no escape left.
    const r = run({
      pos: { x: 55, y: 55 },
      arc: 1,
      enemies: [
        { x: 53, y: 53 },
        { x: 54, y: 52 },
        { x: 52, y: 54 },
      ],
    });
    const m = chooseMove(r);
    expect(m.x).toBeLessThan(0);
    expect(m.y).toBeLessThan(0);
  });
});

describe('shopping when unpressured', () => {
  it('walks to an unopened chest, since a chest is a free extra offer', () => {
    const m = chooseMove(run({ pos: { x: 0, y: 0 }, chests: [{ x: 10, y: 0 }] }));
    expect(m.x).toBeCloseTo(1);
    expect(m.y).toBeCloseTo(0);
  });

  it('grabs an orb already underfoot before walking off to a chest', () => {
    const m = chooseMove(
      run({ pos: { x: 0, y: 0 }, pickup: { x: 0, y: 2 }, chests: [{ x: 30, y: 0 }] }),
    );
    expect(m.y).toBeCloseTo(1);
  });
});

describe('screen awareness', () => {
  it('restarts from the summary screen, so runs chain unattended', () => {
    expect(decide({ screen: 'summary', run: null })).toEqual({ kind: 'restart' });
  });

  it('waits at the hub rather than mashing keys at the unlock list', () => {
    expect(decide({ screen: 'hub', run: null }).kind).toBe('wait');
  });

  it('waits when nothing is published at all', () => {
    expect(decide({ screen: null, run: null }).kind).toBe('wait');
  });

  it('waits out an ended run instead of acting on a dead snapshot', () => {
    expect(decide({ screen: 'run', run: run({ phase: 'ended' }) }).kind).toBe('wait');
  });
});
