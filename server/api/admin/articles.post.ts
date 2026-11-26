import type { ArticleDocument } from '../../utils/articles'
import { ObjectId } from 'mongodb'

export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  checkOrigin(event)
  const input = await newArticleInput(event)
  const now = new Date()
  const article: ArticleDocument = {
    _id: new ObjectId(), revision: 0, ...input, currency: 'MXN', status: 'available',
    highestBidAmountCents: null, highestBidder: null, bidCount: 0,
    createdBy: admin._id, createdAt: now, updatedAt: now,
  }
  // One atomic document keeps the article and all its photos together.
  await insertArticle(article)
  setResponseStatus(event, 201)
  return { id: article._id.toHexString() }
})
