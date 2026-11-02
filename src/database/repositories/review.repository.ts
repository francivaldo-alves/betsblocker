import { getDatabase } from '../database';
import { DomainReview, ReviewStatus } from '@/types';

export class ReviewRepository {
  async listByDomainId(domainId: number): Promise<DomainReview[]> {
    const db = await getDatabase();
    return db.getAllAsync<DomainReview>(
      'SELECT * FROM domain_reviews WHERE domain_id = ? ORDER BY reviewed_at DESC;',
      [domainId]
    );
  }

  async addReview(
    domainId: number,
    reviewStatus: ReviewStatus,
    reviewerNote: string
  ): Promise<number> {
    const db = await getDatabase();
    const nowIso = new Date().toISOString();
    const res = await db.runAsync(
      `INSERT INTO domain_reviews (domain_id, review_status, reviewer_note, reviewed_at)
       VALUES (?, ?, ?, ?);`,
      [domainId, reviewStatus, reviewerNote, nowIso]
    );
    return res.lastInsertRowId;
  }
}

export const reviewRepository = new ReviewRepository();
