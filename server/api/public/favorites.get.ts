export default defineEventHandler(async event => {
  const user = await currentBidder(event)
  if (!user) return { signedIn: false, ids: [] }
  const records = await existingFavorites(user._id)
  return { signedIn: true, ids: records.map(record => String(record.articleId)) }
})
