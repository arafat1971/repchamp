import { isAiPartner, partnerLine } from '@/domain/partnerVoice';

describe('partnerVoice', () => {
  it('recognises roster and built-in AI partners, not humans', () => {
    expect(isAiPartner('ai_nova')).toBe(true);
    expect(isAiPartner('mia')).toBe(true);
    expect(isAiPartner('uid_123')).toBe(false);
    expect(isAiPartner(null)).toBe(false);
  });

  it('is silent for human opponents', () => {
    expect(partnerLine('uid_123', 'win', 'Sam')).toBeNull();
  });

  it('addresses the athlete by name and is deterministic per seed', () => {
    const a = partnerLine('ai_nova', 'win', 'Sam', 0);
    expect(a).toContain('Sam');
    expect(partnerLine('ai_nova', 'win', 'Sam', 0)).toBe(a);
    expect(partnerLine('ai_nova', 'win', 'Sam', 1)).not.toBe(a);
  });

  it('has a line for every moment', () => {
    for (const m of ['tookLead', 'win', 'loss', 'draw'] as const) {
      expect(partnerLine('ai_spark', m, 'Sam', 7)).toBeTruthy();
    }
  });
});
