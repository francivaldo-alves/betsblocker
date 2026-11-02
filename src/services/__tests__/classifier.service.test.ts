import { ClassifierService } from '../classifier.service';

jest.mock('@/database', () => ({}));

const classifier = new ClassifierService();

describe('ClassifierService', () => {
  it('só bloqueia o que tem classificação de bloqueio', () => {
    expect(classifier.evaluateDomain('AUTHORIZED', true).blockStatus).toBe('ALLOW');
    expect(classifier.evaluateDomain('UNAUTHORIZED_CONFIRMED', false).blockStatus).toBe('BLOCK');
    expect(classifier.evaluateDomain('USER_ADDED', false).blockStatus).toBe('BLOCK');
    expect(classifier.evaluateDomain('PENDING_REVIEW', false).blockStatus).toBe('ALLOW');
  });

  it('dá prioridade à exceção do usuário', () => {
    expect(classifier.resolveBlockStatus('UNAUTHORIZED_CONFIRMED', true)).toBe('ALLOW');
    expect(classifier.resolveBlockStatus('UNAUTHORIZED_CONFIRMED', false)).toBe('BLOCK');
  });
});
