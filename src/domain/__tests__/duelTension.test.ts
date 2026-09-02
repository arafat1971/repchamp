import { endgameLabel, isEndgame, leadChanged, readRace } from '../duelTension';

describe('readRace', () => {
  it('reads a clear lead', () => {
    const r = readRace(12, 8);
    expect(r.state).toBe('ahead');
    expect(r.margin).toBe(4);
    expect(r.label).toContain('4');
  });

  /* A one-rep lead is a different feeling from a four-rep one, and the HUD
     should not colour them the same. */
  it('separates a one-rep lead from a comfortable one', () => {
    expect(readRace(9, 8).state).toBe('narrow-lead');
    expect(readRace(12, 8).state).toBe('ahead');
  });

  it('reads a deficit', () => {
    const r = readRace(8, 12);
    expect(r.state).toBe('behind');
    expect(r.margin).toBe(-4);
    expect(r.label).toContain('4');
  });

  it('separates a one-rep deficit, which is catchable', () => {
    expect(readRace(8, 9).state).toBe('narrow-deficit');
  });

  it('reads a tie', () => {
    const r = readRace(10, 10);
    expect(r.state).toBe('tied');
    expect(r.margin).toBe(0);
    expect(r.contested).toBe(true);
  });

  it('starts level before anyone has repped', () => {
    expect(readRace(0, 0).state).toBe('tied');
  });

  /* Someone two down is exactly who the HUD should be talking to; someone
     eight up does not need encouraging. */
  it('treats a close race as contested in both directions', () => {
    expect(readRace(10, 12).contested).toBe(true);
    expect(readRace(12, 10).contested).toBe(true);
  });

  it('stops calling a runaway contested', () => {
    expect(readRace(20, 8).contested).toBe(false);
    expect(readRace(8, 20).contested).toBe(false);
  });
});

describe('leadChanged', () => {
  /* The most galvanising event in a race, and it used to pass in silence with
     two numbers quietly swapping order. */
  it('detects taking the lead', () => {
    expect(leadChanged(-1, 1)).toBe('took');
    expect(leadChanged(0, 1)).toBe('took');
  });

  it('detects losing it', () => {
    expect(leadChanged(1, -1)).toBe('lost');
    expect(leadChanged(0, -1)).toBe('lost');
  });

  /* Drawing level is not an overtake — readRace reports the tie on its own. */
  it('does not fire on merely drawing level', () => {
    expect(leadChanged(-1, 0)).toBeNull();
    expect(leadChanged(1, 0)).toBeNull();
  });

  it('does not fire while extending an existing lead', () => {
    expect(leadChanged(2, 3)).toBeNull();
    expect(leadChanged(-2, -3)).toBeNull();
  });
});

describe('isEndgame', () => {
  it('fires late in a close race', () => {
    expect(isEndgame(10, readRace(10, 11))).toBe(true);
  });

  /* Nothing useful to say when the race is already decided. */
  it('stays quiet late in a runaway', () => {
    expect(isEndgame(10, readRace(20, 8))).toBe(false);
  });

  it('has not earned urgency with a minute left', () => {
    expect(isEndgame(60, readRace(10, 11))).toBe(false);
  });

  it('is over once the clock is', () => {
    expect(isEndgame(0, readRace(10, 11))).toBe(false);
  });
});

describe('endgameLabel', () => {
  /* "DOWN BY 2" is a fact; "2 TO TIE IT" is a plan. Late in a set the athlete
     needs the plan. */
  it('tells someone behind what it would take', () => {
    expect(endgameLabel(10, readRace(8, 10))).toContain('TIE IT');
  });

  it('singularises a one-rep chase', () => {
    expect(endgameLabel(8, readRace(9, 10))).toContain('ONE REP');
  });

  it('tells a leader what the job is', () => {
    expect(endgameLabel(9, readRace(11, 10))).toContain('HOLD');
  });

  it('calls a late tie for whoever wants it', () => {
    expect(endgameLabel(7, readRace(10, 10))).toContain('WHOEVER');
  });

  it('is empty when it is not the endgame', () => {
    expect(endgameLabel(45, readRace(10, 10))).toBe('');
  });
});
